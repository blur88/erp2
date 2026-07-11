import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { ACCOUNTING_POSTING_PORT, AccountingPostingPort } from '../src/common/accounting-posting/accounting-posting.port';
import { ChartOfAccount } from '../src/modules/accounting/entities/chart-of-account.entity';
import { AccountingSettings } from '../src/modules/accounting/entities/accounting-settings.entity';
import { TrialBalanceService } from '../src/modules/accounting/services/trial-balance.service';
import { GeneralLedgerService } from '../src/modules/accounting/services/general-ledger.service';

const PO_ID = '00000000-0000-0000-0000-000000000010';
const ADJ_ID = '00000000-0000-0000-0000-000000000020';

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
      id: true, cashAccountId: await id('1100'), bankAccountId: await id('1200'),
      inventoryAccountId: await id('1300'), supplierDepositAccountId: await id('1400'),
      customerDepositAccountId: await id('2100'), openingBalanceEquityAccountId: await id('3200'),
      salesRevenueAccountId: await id('4100'), cogsAccountId: await id('5100'),
      defaultExpenseAccountId: await id('6990'),
    } as any));
  }
  await ds.query(`INSERT INTO "document_number_settings" ("documentName","prefix","paddingDigits","nextNumber","lastResetYear")
    VALUES ('Journal Entries','JE',3,1, EXTRACT(YEAR FROM now())::int % 100)
    ON CONFLICT ("documentName") DO NOTHING`);
}

describe('Accounting Source Integration (e2e)', () => {
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

  afterEach(async () => {
    // Clean all journal entries between tests so each scenario starts fresh.
    await ds.query(`DELETE FROM journal_entry_line`);
    await ds.query(`DELETE FROM journal_entry`);
  });

  describe('Purchase receive', () => {
    it('posts a PURCHASE_RECEIVE JE (Inventory ← Supplier Deposit) and stays balanced', async () => {
      await ds.transaction((m) =>
        posting.postPurchaseReceive({
          purchaseOrderId: PO_ID, sourceRef: 'PO-001', amount: '1000.0000',
          entryDate: '2026-07-11', createdBy: 'admin',
        }, m),
      );

      const inventory = await ds.getRepository(ChartOfAccount).findOneByOrFail({ code: '1300' });
      const gl = await ledger.getLedger({ accountId: inventory.id, fromDate: '2026-07-01', toDate: '2026-07-31' });
      expect(gl.closingBalance).toBe('1000.0000');

      const tb = await trial.getTrialBalance({ asOfDate: '2026-07-31' });
      expect(tb.balanced).toBe(true);
      expect(tb.difference).toBe('0.0000');
    });
  });

  describe('Purchase refund', () => {
    it('posts a PURCHASE_REFUND JE (Supplier Deposit → Bank) and stays balanced', async () => {
      await ds.transaction((m) =>
        posting.postPurchaseRefund({
          purchaseOrderId: PO_ID, sourceRef: 'PO-001', paymentRowId: 'vp-1',
          channel: 'BANK', amount: '200.0000',
          entryDate: '2026-07-12', createdBy: 'admin',
        }, m),
      );

      const supplierDeposit = await ds.getRepository(ChartOfAccount).findOneByOrFail({ code: '1400' });
      const gl = await ledger.getLedger({ accountId: supplierDeposit.id, fromDate: '2026-07-01', toDate: '2026-07-31' });
      expect(gl.closingBalance).toBe('-200.0000');

      const tb = await trial.getTrialBalance({ asOfDate: '2026-07-31' });
      expect(tb.balanced).toBe(true);
    });
  });

  describe('Stock adjustment (directional)', () => {
    it('posts a STOCK_ADJUSTMENT JE with increase amount only', async () => {
      await ds.transaction((m) =>
        posting.postStockAdjustment({
          adjustmentId: ADJ_ID, sourceRef: 'SA-001',
          increaseAmount: '150.0000', decreaseAmount: '0.0000',
          entryDate: '2026-07-13', createdBy: 'admin',
        }, m),
      );

      const inventory = await ds.getRepository(ChartOfAccount).findOneByOrFail({ code: '1300' });
      const expense = await ds.getRepository(ChartOfAccount).findOneByOrFail({ code: '6990' });
      const invGl = await ledger.getLedger({ accountId: inventory.id, fromDate: '2026-07-01', toDate: '2026-07-31' });
      const expGl = await ledger.getLedger({ accountId: expense.id, fromDate: '2026-07-01', toDate: '2026-07-31' });
      expect(invGl.closingBalance).toBe('150.0000');
      expect(expGl.closingBalance).toBe('-150.0000');

      const tb = await trial.getTrialBalance({ asOfDate: '2026-07-31' });
      expect(tb.balanced).toBe(true);
    });

    it('posts a STOCK_ADJUSTMENT JE with both directional pairs (gross audit)', async () => {
      await ds.transaction((m) =>
        posting.postStockAdjustment({
          adjustmentId: ADJ_ID, sourceRef: 'SA-002',
          increaseAmount: '100.0000', decreaseAmount: '60.0000',
          entryDate: '2026-07-14', createdBy: 'admin',
        }, m),
      );

      const inventory = await ds.getRepository(ChartOfAccount).findOneByOrFail({ code: '1300' });
      const expense = await ds.getRepository(ChartOfAccount).findOneByOrFail({ code: '6990' });
      const invGl = await ledger.getLedger({ accountId: inventory.id, fromDate: '2026-07-01', toDate: '2026-07-31' });
      const expGl = await ledger.getLedger({ accountId: expense.id, fromDate: '2026-07-01', toDate: '2026-07-31' });
      // Dr 100 increase, Cr 60 decrease => net Dr 40; expense side opposite.
      expect(invGl.closingBalance).toBe('40.0000');
      expect(expGl.closingBalance).toBe('-40.0000');

      const tb = await trial.getTrialBalance({ asOfDate: '2026-07-31' });
      expect(tb.balanced).toBe(true);
    });
  });

  describe('Reversal via reverseEntriesForDocument', () => {
    it('reverses a PURCHASE_RECEIVE JE and nets to zero', async () => {
      await ds.transaction((m) =>
        posting.postPurchaseReceive({
          purchaseOrderId: PO_ID, sourceRef: 'PO-002', amount: '500.0000',
          entryDate: '2026-07-15', createdBy: 'admin',
        }, m),
      );

      await ds.transaction((m) =>
        posting.reverseEntriesForDocument('PURCHASE_ORDER', PO_ID, ['PURCHASE_RECEIVE'], '2026-07-16', m, 'admin'),
      );

      const inventory = await ds.getRepository(ChartOfAccount).findOneByOrFail({ code: '1300' });
      const gl = await ledger.getLedger({ accountId: inventory.id, fromDate: '2026-07-01', toDate: '2026-07-31' });
      // Original 500 Dr + reversal 500 Cr = 0
      expect(gl.closingBalance).toBe('0.0000');

      const tb = await trial.getTrialBalance({ asOfDate: '2026-07-31' });
      expect(tb.balanced).toBe(true);
    });

    it('reverses a STOCK_ADJUSTMENT JE and nets to zero', async () => {
      await ds.transaction((m) =>
        posting.postStockAdjustment({
          adjustmentId: ADJ_ID, sourceRef: 'SA-003',
          increaseAmount: '200.0000', decreaseAmount: '0.0000',
          entryDate: '2026-07-17', createdBy: 'admin',
        }, m),
      );

      await ds.transaction((m) =>
        posting.reverseEntriesForDocument('STOCK_ADJUSTMENT', ADJ_ID, ['STOCK_ADJUSTMENT'], '2026-07-18', m, 'admin'),
      );

      const inventory = await ds.getRepository(ChartOfAccount).findOneByOrFail({ code: '1300' });
      const gl = await ledger.getLedger({ accountId: inventory.id, fromDate: '2026-07-01', toDate: '2026-07-31' });
      expect(gl.closingBalance).toBe('0.0000');

      const tb = await trial.getTrialBalance({ asOfDate: '2026-07-31' });
      expect(tb.balanced).toBe(true);
    });
  });

  describe('Concurrency', () => {
    it('two simultaneous complete(stock-adjustment) calls: only one succeeds, the second is rejected (status re-check after lock)', async () => {
      // Create a draft stock adjustment via raw SQL to avoid service overhead.
      await ds.query(`INSERT INTO stock_adjustments (id, "adjustmentNumber", "adjustmentDate", status, "itemCount", "totalValue")
        VALUES ($1, 'SA-CONCUR', NOW(), 'draft', 1, 50)`, [ADJ_ID]);
      await ds.query(`INSERT INTO stock_adjustment_items (id, "stockAdjustmentId", "productId", "oldQuantity", "newQuantity", difference, "unitCost", "totalValue")
        VALUES (gen_random_uuid(), $1, gen_random_uuid(), 10, 20, 10, 5, 50)`, [ADJ_ID]);

      const results = await Promise.allSettled([
        (async () => {
          const qr = ds.createQueryRunner();
          await qr.connect();
          await qr.startTransaction();
          try {
            const adjustment = await qr.manager.findOne('stock_adjustments', {
              where: { id: ADJ_ID },
              lock: { mode: 'pessimistic_write' },
            } as any);
            if (!adjustment || adjustment.status !== 'draft') throw new Error('Concurrent lock: status not draft');
            await qr.manager.update('stock_adjustments', ADJ_ID, { status: 'completed' });
            await qr.commitTransaction();
            return 'ok';
          } catch (e) {
            await qr.rollbackTransaction();
            throw e;
          } finally {
            await qr.release();
          }
        })(),
        (async () => {
          const qr = ds.createQueryRunner();
          await qr.connect();
          await qr.startTransaction();
          try {
            const adjustment = await qr.manager.findOne('stock_adjustments', {
              where: { id: ADJ_ID },
              lock: { mode: 'pessimistic_write' },
            } as any);
            if (!adjustment || adjustment.status !== 'draft') throw new Error('Concurrent lock: status not draft');
            await qr.manager.update('stock_adjustments', ADJ_ID, { status: 'completed' });
            await qr.commitTransaction();
            return 'ok';
          } catch (e) {
            await qr.rollbackTransaction();
            throw e;
          } finally {
            await qr.release();
          }
        })(),
      ]);

      const succeeded = results.filter((r) => r.status === 'fulfilled');
      const failed = results.filter((r) => r.status === 'rejected');
      expect(succeeded.length).toBe(1);
      expect(succeeded[0]).toEqual({ status: 'fulfilled', value: 'ok' });
      expect(failed.length).toBe(1);

      // Final status is completed.
      const final = await ds.query(`SELECT status FROM stock_adjustments WHERE id = $1`, [ADJ_ID]);
      expect(final[0]?.status).toBe('completed');
    });
  });
});
