import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { ACCOUNTING_POSTING_PORT, AccountingPostingPort } from '../src/common/accounting-posting/accounting-posting.port';
import { ChartOfAccount } from '../src/modules/accounting/entities/chart-of-account.entity';
import { AccountingSettings } from '../src/modules/accounting/entities/accounting-settings.entity';
import { GeneralLedgerService } from '../src/modules/accounting/services/general-ledger.service';
import { TrialBalanceService } from '../src/modules/accounting/services/trial-balance.service';

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

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    ds = moduleFixture.get(DataSource);
    posting = moduleFixture.get(ACCOUNTING_POSTING_PORT);
    ledger = moduleFixture.get(GeneralLedgerService);
    trial = moduleFixture.get(TrialBalanceService);
    await seedAccounting(ds);
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
        { salesOrderId: SO_ID, sourceRef: 'SO-26-002', paymentRowId: 'rev-pay-id', channel: 'CASH', amount: '300.0000', entryDate: '2026-07-15' },
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
    const cash = await ds.getRepository(ChartOfAccount).findOneByOrFail({ code: '1100' });
    // Two entries, same date
    await ds.transaction((m) =>
      posting.postSalesPayment(
        { salesOrderId: SO_ID, sourceRef: 'SO-26-003', paymentRowId: 'order-3-pay', channel: 'CASH', amount: '100.0000', entryDate: '2026-07-20' },
        m,
      ),
    );
    await ds.transaction((m) =>
      posting.postSalesPayment(
        { salesOrderId: SO_ID, sourceRef: 'SO-26-004', paymentRowId: 'order-4-pay', channel: 'CASH', amount: '200.0000', entryDate: '2026-07-20' },
        m,
      ),
    );

    const gl = await ledger.getLedger({ accountId: cash.id, fromDate: '2026-07-01', toDate: '2026-07-31' });
    expect(gl.movements.length).toBeGreaterThanOrEqual(5);
    // Running balance should be monotonic
    for (let i = 1; i < gl.movements.length; i++) {
      expect(toMinorUnits(gl.movements[i].balance)).toBeGreaterThanOrEqual(toMinorUnits(gl.movements[i - 1].balance));
    }
  });

  it('honors the entryDate < fromDate opening-balance cutoff', async () => {
    const cash = await ds.getRepository(ChartOfAccount).findOneByOrFail({ code: '1100' });
    const gl = await ledger.getLedger({ accountId: cash.id, fromDate: '2026-07-11', toDate: '2026-07-31' });
    // Entries before July 11 contributed to the opening balance; July 20 entries are movements
    expect(toMinorUnits(gl.openingBalance)).toBeGreaterThan(0n);
    expect(gl.movements.length).toBe(2); // the July 20 entries
  });
});

function toMinorUnits(v: string): bigint {
  const [i, f = ''] = v.split('.');
  return BigInt(i) * 10000n + BigInt(f.padEnd(4, '0'));
}
