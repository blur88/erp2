import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { User, UserRole, UserStatus } from '../src/database/entities/user.entity';
import { ChartOfAccount } from '../src/modules/accounting/entities/chart-of-account.entity';
import { AccountingSettings } from '../src/modules/accounting/entities/accounting-settings.entity';
import { JournalEntry } from '../src/modules/accounting/entities/journal-entry.entity';
import { ACCOUNTING_POSTING_PORT, AccountingPostingPort } from '../src/common/accounting-posting/accounting-posting.port';
import { toMinorUnits, formatScale4 } from '../src/common/utils/money';
import { configureTestAppValidation } from './utils/configure-test-app-validation';
import { removeSuiteAdmin } from './utils/shared-e2e-fixture';
import { resetSuiteBusinessRows } from './utils/shared-e2e-business-fixture';
import { removeSuiteTraces } from './utils/shared-e2e-traces-fixture';

async function seedAccounting(ds: DataSource) {
  const coa = ds.getRepository(ChartOfAccount);
  const groups = [
    ['1000', 'Assets', 'Asset'],
    ['2000', 'Liabilities', 'Liability'],
    ['3000', 'Equity', 'Equity'],
    ['4000', 'Income', 'Income'],
    ['5000', 'Cost of Sales', 'Expense'],
    ['6000', 'Expenses', 'Expense'],
  ] as const;
  for (const [code, name, type] of groups) {
    if (!(await coa.findOneBy({ code }))) {
      await coa.save(coa.create({ code, name, type, isSystem: true, isPostable: false } as any));
    }
  }
  const children = [
    ['1100', 'Cash', 'Asset', '1000'],
    ['1200', 'Bank', 'Asset', '1000'],
    ['1300', 'Inventory', 'Asset', '1000'],
    ['1400', 'Supplier Deposit', 'Asset', '1000'],
    ['2100', 'Customer Deposit', 'Liability', '2000'],
    ['3100', 'Owner Capital', 'Equity', '3000'],
    ['3200', 'Opening Balance Equity', 'Equity', '3000'],
    ['3300', 'Owner Drawings', 'Equity', '3000'],
    ['4100', 'Sales Revenue', 'Income', '4000'],
    ['5100', 'Cost of Goods Sold', 'Expense', '5000'],
    ['6990', 'Other Expenses', 'Expense', '6000'],
  ] as const;
  for (const [code, name, type, parentCode] of children) {
    if (!(await coa.findOneBy({ code }))) {
      const parent = await coa.findOneByOrFail({ code: parentCode });
      await coa.save(coa.create({ code, name, type, parentId: parent.id, isSystem: true, isPostable: true } as any));
    }
  }
  const settingsRepo = ds.getRepository(AccountingSettings);
  if (!(await settingsRepo.findOneBy({ id: true } as any))) {
    const id = async (c: string) => (await coa.findOneByOrFail({ code: c })).id;
    await settingsRepo.save(settingsRepo.create({
      id: true, cashAccountId: await id('1100'), bankAccountId: await id('1200'),
      inventoryAccountId: await id('1300'), supplierDepositAccountId: await id('1400'),
      customerDepositAccountId: await id('2100'), openingBalanceEquityAccountId: await id('3200'),
      ownerCapitalAccountId: await id('3100'), ownerDrawingsAccountId: await id('3300'),
      salesRevenueAccountId: await id('4100'), cogsAccountId: await id('5100'),
      defaultExpenseAccountId: await id('6990'),
    } as any));
  }
  await ds.query(`INSERT INTO "document_number_settings" ("documentName","prefix","paddingDigits","nextNumber","lastResetYear")
    VALUES ('Journal Entries','JE',3,1, EXTRACT(YEAR FROM now())::int % 100)
    ON CONFLICT ("documentName") DO NOTHING`);
}

describe('Balance Sheet (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let posting: AccountingPostingPort;
  let token: string;
  // Own-rows tracking (issue #1204). All journals in this suite carry a
  // BS-E2E- sourceRef, so the afterAll delete is scoped to that prefix plus
  // the collected header ids (reversals share the prefix but are also tracked).
  // Lines CASCADE from the header via journal_entry_line.entryId.
  let bsUsername = '';
  let bsUserId = '';
  const ownedJournalIds: string[] = [];
  let docNumberSnapshot: any[] = [];

  const year = new Date().getFullYear();
  // Isolated past years: no other suite posts journals in these windows, and
  // each absolute assertion below only sees postings at or before its own
  // year-end (cumulative closing balances). Y0 holds the two zero-net cash
  // cases, YA the boundary case, S4/P4 the drawings accumulation, E5 the
  // mapped-row GL tie-out, and S6/P6 the movement tie-out.
  const Y0 = year - 8;
  const YA = year - 6;
  const S4 = year - 5;
  const P4 = year - 6;
  const E5 = year - 3;
  const S6 = year - 2;
  const P6 = year - 3;

  const row = (bs: any, line: string) => bs.rows.find((r: any) => r.line === line)!;

  const get = (path: string) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);

  const readBalanceSheet = async (y: number) => {
    const res = await get(`/accounting/balance-sheet?year=${y}`).expect(200);
    // Controller returns the raw object, not wrapped in { data }; handle both.
    return ((res.body as any).data ?? res.body) as any;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();
    ds = moduleFixture.get(DataSource);
    posting = moduleFixture.get(ACCOUNTING_POSTING_PORT);
    await seedAccounting(ds);
    docNumberSnapshot = await ds.query(`SELECT * FROM document_number_settings`);

    const username = `bs-e2e-${Date.now()}`;
    bsUsername = username;
    const userRepo = ds.getRepository(User);
    const saved = await userRepo.save(userRepo.create({
      username,
      email: `${username}@test.com`,
      password: await bcrypt.hash('Admin@123!', 12),
      firstName: 'BS',
      lastName: 'E2E',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      isActive: true,
      failedLoginAttempts: 0,
    }));
    bsUserId = (saved as any).id;
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: 'Admin@123!' });
    token = loginRes.body?.data?.accessToken ?? loginRes.body?.accessToken;
    expect(token).toBeTruthy();
  });

  afterAll(async () => {
    try {
      if (ds?.isInitialized) {
        // Journals first (accountId NO ACTION). Scoped to this suite's
        // BS-E2E- prefix + tracked header ids.
        let journalIdsToDelete = [...new Set(ownedJournalIds)];
        const prefixed: Array<{ id: string }> = await ds.query(
          `SELECT id FROM journal_entry WHERE "sourceRef" LIKE 'BS-E2E-%'`,
        );
        for (const r of prefixed) journalIdsToDelete.push(r.id);
        journalIdsToDelete = [...new Set(journalIdsToDelete)];
        if (journalIdsToDelete.length) {
          await ds.query(`DELETE FROM journal_entry WHERE id = ANY($1)`, [
            journalIdsToDelete,
          ]);
        }
        // No business rows (products, orders, …) are owned by this suite; the
        // call documents that scope explicitly per the suite-cleanup mandate.
        await resetSuiteBusinessRows(ds, {});
        if (bsUserId || bsUsername) {
          await removeSuiteTraces(ds, {
            userIds: bsUserId ? [bsUserId] : [],
            usernames: bsUsername ? [bsUsername] : [],
            entityIds: journalIdsToDelete,
          });
        }
        if (bsUsername) {
          await removeSuiteAdmin(ds, bsUsername);
        }
        // Restore JE nextNumber bumped by this suite's postings (PKs unchanged).
        for (const snap of docNumberSnapshot) {
          await ds.query(
            `UPDATE document_number_settings SET prefix=$1, "paddingDigits"=$2, "nextNumber"=$3, "lastResetYear"=$4 WHERE "documentName"=$5`,
            [
              snap.prefix,
              snap.paddingDigits,
              snap.nextNumber,
              snap.lastResetYear,
              snap.documentName,
            ],
          );
        }
      }
    } finally {
      if (ds?.isInitialized) await ds.destroy();
      await app.close();
    }
  });

  it('includes an entry dated 31 December and excludes 1 January of the next year', async () => {
    // Post 100 to Cash on {year}-12-31 and 500 on {year+1}-01-01.
    const coaRepo = ds.getRepository(ChartOfAccount);
    const cash = await coaRepo.findOneByOrFail({ code: '1100' });
    await ds.transaction(async (m) => {
      const res = await posting.postOpeningBalance({
        accountId: cash.id, sourceRef: `BS-E2E-BND-IN-${Date.now()}`, amount: '100.0000', entryDate: `${YA}-12-31`,
      }, m);
      ownedJournalIds.push(res.journalEntryId);
    });
    await ds.transaction(async (m) => {
      const res = await posting.postOpeningBalance({
        accountId: cash.id, sourceRef: `BS-E2E-BND-OUT-${Date.now()}`, amount: '500.0000', entryDate: `${YA + 1}-01-01`,
      }, m);
      ownedJournalIds.push(res.journalEntryId);
    });
    const res = await get(`/accounting/balance-sheet?year=${YA}`).expect(200);
    const bs = (res.body as any).data ?? res.body;
    expect(row(bs, 'N37').amount).toBe('100.0000');
  });

  it('excludes soft-deleted journal entries', async () => {
    // Post 100, soft-delete the entry, re-query.
    const coaRepo = ds.getRepository(ChartOfAccount);
    const cash = await coaRepo.findOneByOrFail({ code: '1100' });
    let entryId = '';
    await ds.transaction(async (m) => {
      const res = await posting.postOpeningBalance({
        accountId: cash.id, sourceRef: `BS-E2E-DEL-${Date.now()}`, amount: '100.0000', entryDate: `${Y0}-05-10`,
      }, m);
      entryId = res.journalEntryId;
      ownedJournalIds.push(entryId);
    });
    await ds.getRepository(JournalEntry).softDelete(entryId);
    const res = await get(`/accounting/balance-sheet?year=${Y0}`).expect(200);
    const bs = (res.body as any).data ?? res.body;
    expect(row(bs, 'N37').amount).toBe('0.0000');
  });

  it('nets a reversal against the entry it reverses', async () => {
    // Post 100, reverse it in the same year.
    const coaRepo = ds.getRepository(ChartOfAccount);
    const cash = await coaRepo.findOneByOrFail({ code: '1100' });
    let entryId = '';
    await ds.transaction(async (m) => {
      const res = await posting.postOpeningBalance({
        accountId: cash.id, sourceRef: `BS-E2E-REV-${Date.now()}`, amount: '100.0000', entryDate: `${Y0}-06-10`,
      }, m);
      entryId = res.journalEntryId;
      ownedJournalIds.push(entryId);
    });
    await ds.transaction(async (m) => {
      const res = await posting.reverseEntry({ originalEntryId: entryId, entryDate: `${Y0}-06-11` }, m);
      ownedJournalIds.push(res.journalEntryId);
    });
    const res = await get(`/accounting/balance-sheet?year=${Y0}`).expect(200);
    const bs = (res.body as any).data ?? res.body;
    expect(row(bs, 'N37').amount).toBe('0.0000');
  });

  it('computes N49 from period movement with drawings in two years', async () => {
    // Prior year: 300 of drawings. Selected year: 200.
    // Closing balance is 500; N49 must be -200, and N47 must carry the -300.
    // Drawings are seeded as debit opening balances (negative amount on the
    // credit-normal Equity account), the same direction a real withdrawal posts.
    const coaRepo = ds.getRepository(ChartOfAccount);
    const drawings = await coaRepo.findOneByOrFail({ code: '3300' });
    await ds.transaction(async (m) => {
      const res = await posting.postOpeningBalance({
        accountId: drawings.id, sourceRef: `BS-E2E-DRW-PRIOR-${Date.now()}`, amount: '-300.0000', entryDate: `${P4}-06-15`,
      }, m);
      ownedJournalIds.push(res.journalEntryId);
    });
    await ds.transaction(async (m) => {
      const res = await posting.postOpeningBalance({
        accountId: drawings.id, sourceRef: `BS-E2E-DRW-CUR-${Date.now()}`, amount: '-200.0000', entryDate: `${S4}-06-15`,
      }, m);
      ownedJournalIds.push(res.journalEntryId);
    });
    const res = await get(`/accounting/balance-sheet?year=${S4}`).expect(200);
    const bs = (res.body as any).data ?? res.body;
    expect(row(bs, 'N49').amount).toBe('-200.0000');
    expect(row(bs, 'N47').amount).toBe('-300.0000');
  });

  it('reconciles a mapped cumulative row to the General Ledger closing balance', async () => {
    const coaRepo = ds.getRepository(ChartOfAccount);
    const cash = await coaRepo.findOneByOrFail({ code: '1100' });
    await ds.transaction(async (m) => {
      const res = await posting.postOpeningBalance({
        accountId: cash.id, sourceRef: `BS-E2E-GL-${Date.now()}`, amount: '250.0000', entryDate: `${E5}-04-10`,
      }, m);
      ownedJournalIds.push(res.journalEntryId);
    });
    const bs = await readBalanceSheet(E5);
    const cashId = cash.id;
    const glRes = await get(
      `/accounting/general-ledger?accountId=${cashId}` +
      `&fromDate=${E5}-01-01&toDate=${bs.asOfDate}`,
    ).expect(200);
    const gl = (glRes.body as any).data ?? glRes.body;
    expect(gl.closingBalance).toBe(row(bs, 'N37').amount);
  });

  it('reconciles N49 to the General Ledger PERIOD MOVEMENT, not its closing balance', async () => {
    // Prior-year drawings make closing and movement differ, so equality with
    // the movement also proves N49 is not the closing balance.
    const coaRepo = ds.getRepository(ChartOfAccount);
    const drawings = await coaRepo.findOneByOrFail({ code: '3300' });
    await ds.transaction(async (m) => {
      const res = await posting.postOpeningBalance({
        accountId: drawings.id, sourceRef: `BS-E2E-MOV-PRIOR-${Date.now()}`, amount: '-300.0000', entryDate: `${P6}-06-15`,
      }, m);
      ownedJournalIds.push(res.journalEntryId);
    });
    await ds.transaction(async (m) => {
      const res = await posting.postOpeningBalance({
        accountId: drawings.id, sourceRef: `BS-E2E-MOV-CUR-${Date.now()}`, amount: '-200.0000', entryDate: `${S6}-06-15`,
      }, m);
      ownedJournalIds.push(res.journalEntryId);
    });
    const bs = await readBalanceSheet(S6);
    const drawingsId = drawings.id;
    const glRes = await get(
      `/accounting/general-ledger?accountId=${drawingsId}` +
      `&fromDate=${S6}-01-01&toDate=${bs.asOfDate}`,
    ).expect(200);
    const gl = (glRes.body as any).data ?? glRes.body;
    // N49 IS the natural-signed period movement: both the GL balances and the
    // assembly apply naturalBalance() to the same debit-minus-credit raw sums,
    // so closing-minus-opening already carries the drawings sign and must NOT
    // be negated again (that would render withdrawals as a positive addition
    // to equity — the same extra-negation trap the assemble unit spec pins).
    const movement = toMinorUnits(gl.closingBalance) - toMinorUnits(gl.openingBalance);
    expect(row(bs, 'N49').amount).toBe(formatScale4(movement));
    expect(row(bs, 'N49').amount).not.toBe(gl.closingBalance);
  });

  it('rejects a future year with 400', async () => {
    const currentYear = new Date().getFullYear();
    await get(`/accounting/balance-sheet?year=${currentYear + 1}`).expect(400);
  });
});
