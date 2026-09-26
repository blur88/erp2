import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import { DataSource, QueryRunner } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureTestAppValidation } from './utils/configure-test-app-validation';
import { AddBankAccountFlag1790409600000 } from '../src/database/migrations/1790409600000-AddBankAccountFlag';

const runId = randomUUID().slice(0, 6);
let app: INestApplication;
let ds: DataSource;

beforeAll(async () => {
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleFixture.createNestApplication();
  configureTestAppValidation(app);
  await app.init();
  ds = app.get(DataSource);
});

afterAll(async () => {
  await app.close();
});

/** Pre-migration state inside a transaction that is ALWAYS rolled back. */
async function inRolledBackTxn(fn: (qr: QueryRunner) => Promise<void>): Promise<void> {
  const qr = ds.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    await qr.query(`ALTER TABLE chart_of_account DROP COLUMN "isBankAccount"`);
    await fn(qr);
  } finally {
    await qr.rollbackTransaction();
    await qr.release();
  }
}

const up = (qr: QueryRunner) => new AddBankAccountFlag1790409600000().up(qr);
const idOf = async (qr: QueryRunner, code: string) =>
  (await qr.query(`SELECT id FROM chart_of_account WHERE code = $1`, [code]))[0].id as string;
const flaggedCodes = async (qr: QueryRunner) =>
  (await qr.query(`SELECT code FROM chart_of_account WHERE "isBankAccount" ORDER BY code`)).map((r: any) => r.code);

async function account(qr: QueryRunner, tag: string, over: { type?: string; parentCode?: string; clearing?: boolean } = {}) {
  const [parent] = await qr.query(`SELECT id FROM chart_of_account WHERE code = $1`, [over.parentCode ?? '1000']);
  const [row] = await qr.query(
    `INSERT INTO chart_of_account (code, name, type, "parentId", "isSystem", "isPostable", "isActive", "isProviderClearing")
     VALUES ($1, $2, $3, $4, false, true, true, $5) RETURNING id, code, name`,
    [`BF-${tag}-${runId}`.slice(0, 20), `BF ${tag} ${runId}`, over.type ?? 'Asset', parent.id, over.clearing ?? false],
  );
  return row as { id: string; code: string; name: string };
}

async function bankMethodMappedTo(qr: QueryRunner, tag: string, accountId: string, channel = 'BANK') {
  const name = `BF Method ${tag} ${runId}`;
  const [m] = await qr.query(
    `INSERT INTO payment_methods (code, name, "sortOrder", "accountingChannel") VALUES ($1, $2, 0, $3) RETURNING id`,
    [`BF${tag}${runId}`.slice(0, 20), name, channel],
  );
  await qr.query(
    `INSERT INTO payment_method_account_mappings ("paymentMethodId", "accountId") VALUES ($1, $2)`,
    [m.id, accountId],
  );
  return { id: m.id as string, name };
}

describe('AddBankAccountFlag (#1298)', () => {
  it('flags the Settings bank and non-clearing BANK-mapped accounts only', async () => {
    await inRolledBackTxn(async (qr) => {
      const extra = await account(qr, 'OK');
      await bankMethodMappedTo(qr, 'OK', extra.id);
      const clearing = await account(qr, 'CLR', { clearing: true });
      await bankMethodMappedTo(qr, 'CLR', clearing.id);
      const cashChannel = await account(qr, 'CSH');
      await bankMethodMappedTo(qr, 'CSH', cashChannel.id, 'CASH');

      await up(qr);

      const flagged = await flaggedCodes(qr);
      expect(flagged).toEqual(expect.arrayContaining(['1200', '1210', extra.code]));
      for (const code of ['1100', '1220', '1230', '1240', clearing.code, cashChannel.code]) {
        expect(flagged).not.toContain(code);
      }
    });
  });

  it('still flags an account whose BANK method is soft-deleted', async () => {
    await inRolledBackTxn(async (qr) => {
      const acct = await account(qr, 'DELM');
      const m = await bankMethodMappedTo(qr, 'DELM', acct.id);
      await qr.query(`UPDATE payment_methods SET "deletedAt" = now() WHERE id = $1`, [m.id]);
      await up(qr);
      expect(await flaggedCodes(qr)).toContain(acct.code);
    });
  });

  const conflictCases: Array<[string, (qr: QueryRunner) => Promise<{ code: string; name: string; source: string }>, string]> = [
    ['Settings Cash', async (qr) => {
      const [a] = await qr.query(`SELECT code, name FROM chart_of_account WHERE code = '1100'`);
      const m = await bankMethodMappedTo(qr, 'C1', await idOf(qr, '1100'));
      return { ...a, source: `payment method "${m.name}" (BANK)` };
    }, 'is the Accounting Settings Cash account'],
    ['Settings Inventory', async (qr) => {
      const [a] = await qr.query(`SELECT code, name FROM chart_of_account WHERE code = '1300'`);
      const m = await bankMethodMappedTo(qr, 'C2', await idOf(qr, '1300'));
      return { ...a, source: `payment method "${m.name}" (BANK)` };
    }, 'is the Accounting Settings Inventory account'],
    ['Settings Supplier Deposit', async (qr) => {
      const [a] = await qr.query(`SELECT code, name FROM chart_of_account WHERE code = '1400'`);
      const m = await bankMethodMappedTo(qr, 'C3', await idOf(qr, '1400'));
      return { ...a, source: `payment method "${m.name}" (BANK)` };
    }, 'is the Accounting Settings Supplier Deposit account'],
    ['non-Asset', async (qr) => {
      const a = await account(qr, 'EXP', { type: 'Expense', parentCode: '6000' });
      const m = await bankMethodMappedTo(qr, 'C4', a.id);
      return { ...a, source: `payment method "${m.name}" (BANK)` };
    }, 'is not an Asset account'],
    ['non-postable', async (qr) => {
      const [a] = await qr.query(`SELECT code, name FROM chart_of_account WHERE code = '1000'`);
      const m = await bankMethodMappedTo(qr, 'C5', await idOf(qr, '1000'));
      return { ...a, source: `payment method "${m.name}" (BANK)` };
    }, 'is not postable'],
    ['soft-deleted', async (qr) => {
      const a = await account(qr, 'DEL');
      const m = await bankMethodMappedTo(qr, 'C6', a.id);
      await qr.query(`UPDATE chart_of_account SET "deletedAt" = now() WHERE id = $1`, [a.id]);
      return { ...a, source: `payment method "${m.name}" (BANK)` };
    }, 'is deleted'],
    ['Settings bank is a clearing account', async (qr) => {
      const [a] = await qr.query(`SELECT id, code, name FROM chart_of_account WHERE code = '1220'`);
      await qr.query(`UPDATE accounting_settings SET "bankAccountId" = $1`, [a.id]);
      return { code: a.code, name: a.name, source: 'Accounting Settings Bank' };
    }, 'is a provider clearing account'],
  ];

  it.each(conflictCases)('aborts on a %s conflict, naming code, name, source and rule, flagging nothing', async (_l, seed, rule) => {
    await inRolledBackTxn(async (qr) => {
      const c = await seed(qr);
      const err = await up(qr).then(() => null, (e: Error) => e);
      expect(err).toBeInstanceOf(Error);
      expect(err!.message).toContain('No changes were applied.');
      expect(err!.message).toContain(`${c.code} ${c.name}`);
      expect(err!.message).toContain(c.source);
      expect(err!.message).toContain(rule);
      expect(await flaggedCodes(qr)).toEqual([]);
    });
  });

  it('lists EVERY conflict, and ONE line per account naming all of its sources', async () => {
    await inRolledBackTxn(async (qr) => {
      const cashId = await idOf(qr, '1100');
      const m1 = await bankMethodMappedTo(qr, 'D1', cashId);
      const m2 = await bankMethodMappedTo(qr, 'D2', cashId);
      const exp = await account(qr, 'EX2', { type: 'Expense', parentCode: '6000' });
      await bankMethodMappedTo(qr, 'D3', exp.id);

      const err = await up(qr).then(() => null, (e: Error) => e);
      expect(err!.message).toContain('2 conflict(s)');
      const cashLines = err!.message.split('\n').filter((l) => l.includes('1100 '));
      expect(cashLines).toHaveLength(1);
      expect(cashLines[0]).toContain(m1.name);
      expect(cashLines[0]).toContain(m2.name);
      expect(err!.message).toContain(`${exp.code} ${exp.name}`);
    });
  });
});
