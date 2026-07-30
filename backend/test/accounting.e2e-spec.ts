import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { ACCOUNTING_POSTING_PORT, AccountingPostingPort } from '../src/common/accounting-posting/accounting-posting.port';
import { ChartOfAccount } from '../src/modules/accounting/entities/chart-of-account.entity';
import { AccountingSettings } from '../src/modules/accounting/entities/accounting-settings.entity';
import { GeneralLedgerService } from '../src/modules/accounting/services/general-ledger.service';
import { TrialBalanceService } from '../src/modules/accounting/services/trial-balance.service';
import { AccountingSeederService } from '../src/modules/accounting/services/accounting-seeder.service';
import { ChartOfAccountService } from '../src/modules/accounting/services/chart-of-account.service';
import { AccountType } from '../src/modules/accounting/entities/account-type.enum';
import { configureTestAppValidation } from './utils/configure-test-app-validation';

const SO_ID = '00000000-0000-0000-0000-000000000001';
const PAY_ID = '00000000-0000-0000-0000-000000000002';

async function seedAccounting(ds: DataSource) {
  const coa = ds.getRepository(ChartOfAccount);
  const groups = [['1000','Assets','Asset'],['2000','Liabilities','Liability'],['3000','Equity','Equity'],
    ['4000','Income','Income'],['5000','Cost of Sales','Expense'],['6000','Expenses','Expense']] as const;
  for (const [code, name, type] of groups) {
    if (!(await coa.findOneBy({ code }))) await coa.save(coa.create({ code, name, type, isSystem: true, isPostable: false } as any));
  }
  const children = [['1100','Cash','Asset','1000'],['1200','Bank','Asset','1000'],['1300','Inventory','Asset','1000'],
    ['1400','Supplier Deposit','Asset','1000'],['2100','Customer Deposit','Liability','2000'],
    ['3100','Owner Capital','Equity','3000'],['3200','Opening Balance Equity','Equity','3000'],
    ['4100','Sales Revenue','Income','4000'],['5100','Cost of Goods Sold','Expense','5000'],
    ['6990','Other Expenses','Expense','6000']] as const;
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
      id: true, cashAccountId: await id('1100'), bankAccountId: await id('1200'), inventoryAccountId: await id('1300'),
      supplierDepositAccountId: await id('1400'), customerDepositAccountId: await id('2100'),
      openingBalanceEquityAccountId: await id('3200'), salesRevenueAccountId: await id('4100'),
      cogsAccountId: await id('5100'), defaultExpenseAccountId: await id('6990'),
    } as any));
  }
  await ds.query(`INSERT INTO "document_number_settings" ("documentName","prefix","paddingDigits","nextNumber","lastResetYear")
    VALUES ('Journal Entries','JE',3,1, EXTRACT(YEAR FROM now())::int % 100)
    ON CONFLICT ("documentName") DO NOTHING`);
}

describe('Accounting v1 (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let posting: AccountingPostingPort;
  let ledger: GeneralLedgerService;
  let trial: TrialBalanceService;
  let seeder: AccountingSeederService;
  let coaService: ChartOfAccountService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();
    ds = moduleFixture.get(DataSource);
    posting = moduleFixture.get(ACCOUNTING_POSTING_PORT);
    ledger = moduleFixture.get(GeneralLedgerService);
    trial = moduleFixture.get(TrialBalanceService);
    seeder = moduleFixture.get(AccountingSeederService);
    coaService = moduleFixture.get(ChartOfAccountService);
    await seedAccounting(ds);
    // Earlier suites (suite order is jest-size/timing dependent) may leave
    // journal rows on the shared test DB — e.g. sales payments posted with
    // today's date land inside this suite's July window. The assertions below
    // build cumulative balances from a clean journal, so wipe it once here
    // (tests in this suite intentionally build on each other — no per-test clear).
    await ds.query(`DELETE FROM journal_entry_line`);
    await ds.query(`DELETE FROM journal_entry`);
  });

  afterAll(async () => {
    if (ds?.isInitialized) await ds.destroy();
    await app.close();
  });

  it('posts a sales payment JE and reflects it in the ledger and trial balance', async () => {
    const cash = await ds.getRepository(ChartOfAccount).findOneByOrFail({ code: '1100' });
    await ds.transaction((m) =>
      posting.postSalesPayment(
        { salesOrderId: SO_ID, sourceRef: 'SO-26-001', paymentRowId: PAY_ID, channel: 'CASH', amount: '500.0000', entryDate: '2026-07-10' },
        m,
      ),
    );

    const gl = await ledger.getLedger({ accountId: cash.id, fromDate: '2026-07-01', toDate: '2026-07-31' });
    expect(gl.movements.at(-1)!.balance).toBe('500.0000');
    expect(gl.closingBalance).toBe('500.0000');

    const tb = await trial.getTrialBalance({ asOfDate: '2026-07-31' });
    expect(tb.balanced).toBe(true);
    expect(tb.difference).toBe('0.0000');
  });

  it('reverses via a counter-entry and nets balances to zero, deriving Reversed status', async () => {
    const cash = await ds.getRepository(ChartOfAccount).findOneByOrFail({ code: '1100' });
    let entryId: string;
    await ds.transaction(async (m) => {
      const res = await posting.postSalesPayment(
        { salesOrderId: SO_ID, sourceRef: 'SO-26-002', paymentRowId: randomUUID(), channel: 'CASH', amount: '300.0000', entryDate: '2026-07-15' },
        m,
      );
      entryId = res.journalEntryId;
    });
    await ds.transaction((m) =>
      posting.reverseEntry({ originalEntryId: entryId!, entryDate: '2026-07-16' }, m),
    );

    const gl = await ledger.getLedger({ accountId: cash.id, fromDate: '2026-07-01', toDate: '2026-07-31' });
    // 500 (first) + 300 (second) - 300 (reversal) = 500
    expect(gl.closingBalance).toBe('500.0000');
    expect(gl.movements.length).toBe(3);
  });

  it('applies deterministic same-date ordering for a stable running balance', async () => {
    // Use a dedicated throwaway Asset account (created for this test only) so the
    // ledger is isolated from every other suite/test that shares the preset accounts.
    // Two same-date opening-balance entries → two debits to a debit-normal account.
    const coaRepo = ds.getRepository(ChartOfAccount);
    const assetGroup = await coaRepo.findOneByOrFail({ code: '1000' });
    const acct: ChartOfAccount = await coaRepo.save(
      coaRepo.create({
        code: `TO-${Date.now() % 1_000_000}`, name: 'Ordering Test', type: 'Asset' as any,
        parentId: assetGroup.id,
        isActive: true, isSystem: false, isPostable: true, openingBalance: '0.0000',
      }),
    );
    await ds.transaction((m) =>
      posting.postOpeningBalance({ accountId: acct.id, sourceRef: 'ORD-1', amount: '100.0000', entryDate: '2026-07-20' }, m),
    );
    await ds.transaction((m) =>
      posting.postOpeningBalance({ accountId: acct.id, sourceRef: 'ORD-2', amount: '200.0000', entryDate: '2026-07-20' }, m),
    );

    const gl = await ledger.getLedger({ accountId: acct.id, fromDate: '2026-07-01', toDate: '2026-07-31' });
    expect(gl.movements.length).toBe(2);
    // Both are debits to a debit-normal account → running balance strictly increases.
    for (let i = 1; i < gl.movements.length; i++) {
      expect(toMinorUnits(gl.movements[i].balance)).toBeGreaterThan(toMinorUnits(gl.movements[i - 1].balance));
    }
    expect(gl.closingBalance).toBe('300.0000');
  });

  it('honors the entryDate < fromDate opening-balance cutoff', async () => {
    // Dedicated Owner Capital (equity) account, seeded with one pre-range and one in-range entry.
    const equity = await ds.getRepository(ChartOfAccount).findOneByOrFail({ code: '3100' });
    await ds.transaction((m) =>
      posting.postOpeningBalance(
        { accountId: equity.id, sourceRef: 'CUTOFF-PRE', amount: '1000.0000', entryDate: '2026-07-05' },
        m,
      ),
    );
    await ds.transaction((m) =>
      posting.postOpeningBalance(
        { accountId: equity.id, sourceRef: 'CUTOFF-IN', amount: '250.0000', entryDate: '2026-07-20' },
        m,
      ),
    );

    const gl = await ledger.getLedger({ accountId: equity.id, fromDate: '2026-07-11', toDate: '2026-07-31' });
    // The July 5 entry is before fromDate → opening balance; only the July 20 entry is a movement.
    expect(toMinorUnits(gl.openingBalance)).toBeGreaterThan(0n);
    expect(gl.movements.length).toBe(1);
  });

  it('#901: heals a missing Journal Entries doc-number row so opening-balance create recovers', async () => {
    const yy = new Date().getFullYear() % 100;
    const yyStr = String(yy).padStart(2, '0');

    const priorRows = await ds.query(
      `SELECT COALESCE(MAX((split_part("journalNo", '-', 3))::int), 0) AS max
         FROM journal_entry WHERE "journalNo" ~ ('^JE-' || $1 || '-[0-9]{1,9}$')`,
      [yyStr],
    );
    const priorMax: number = Number(priorRows[0].max);

    await ds.query(`DELETE FROM document_number_settings WHERE "documentName" = 'Journal Entries'`);

    await seeder.seed();
    const healed = await ds.query(
      `SELECT * FROM document_number_settings WHERE "documentName" = 'Journal Entries'`,
    );
    expect(healed.length).toBe(1);
    expect(healed[0].prefix).toBe('JE');
    expect(Number(healed[0].nextNumber)).toBe(priorMax + 1);

    const assetsGroup = await ds.getRepository(ChartOfAccount).findOneByOrFail({ code: '1000' });
    // Full-precision timestamp keeps the code unique across runs on the shared e2e DB.
    // varchar(20): 'OB' + 13-digit ms + 3-digit rand = 18 chars, within bounds.
    const code = `OB${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
    const account = await coaService.create(
      { code, name: 'OB Heal Test', type: AccountType.ASSET, parentId: assetsGroup.id, openingBalance: '100.0000' } as any,
      'e2e',
    );
    expect(account.id).toBeDefined();

    const jes = await ds.query(
      `SELECT "journalNo" FROM journal_entry
        WHERE "sourceType" = 'OPENING_BALANCE' AND "sourceDocumentId" = $1`,
      [account.id],
    );
    expect(jes.length).toBe(1);
    expect(jes[0].journalNo).toMatch(new RegExp(`^JE-${String(yy).padStart(2, '0')}-[0-9]{1,9}$`));
    expect(parseInt(jes[0].journalNo.split('-')[2], 10)).toBe(priorMax + 1);
  });
});

function toMinorUnits(v: string): bigint {
  const [i, f = ''] = v.split('.');
  return BigInt(i) * 10000n + BigInt(f.padEnd(4, '0'));
}
