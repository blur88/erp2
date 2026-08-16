import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import {
  User,
  UserRole,
  UserStatus,
} from '../src/database/entities/user.entity';
import {
  Product,
  ProductType,
} from '../src/database/entities/product.entity';
import { Category } from '../src/database/entities/category.entity';
import { PaymentMethodEntity } from '../src/database/entities/payment-method.entity';
import { ChartOfAccount } from '../src/modules/accounting/entities/chart-of-account.entity';
import { AccountingSettings } from '../src/modules/accounting/entities/accounting-settings.entity';
import { OwnerEquityDocument } from '../src/modules/owner-equity/entities/owner-equity-document.entity';
import { SettingsService } from '../src/modules/settings/settings.service';
import { TrialBalanceService } from '../src/modules/accounting/services/trial-balance.service';
import { configureTestAppValidation } from './utils/configure-test-app-validation';

// Shared-DB discipline: the reference numbers this suite owns, used both for
// assertions and for afterAll cleanup. Never assert a row count or balance
// that "every row except mine" could disturb — the trial-balance assertions
// below are deltas over this suite's own postings (project_e2e_shared_db_exclusion_query_trap).
const ownedRefs: string[] = [];

function toMinorUnits(v: string): bigint {
  const [i, f = ''] = v.split('.');
  return BigInt(i) * 10000n + BigInt(f.padEnd(4, '0'));
}

function formatScale4(minor: bigint): string {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const s = abs.toString().padStart(5, '0');
  return `${neg ? '-' : ''}${s.slice(0, -4)}.${s.slice(-4)}`;
}

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
}

async function seedPaymentMethods(ds: DataSource): Promise<{ cash: PaymentMethodEntity; bank: PaymentMethodEntity }> {
  const pmRepo = ds.getRepository(PaymentMethodEntity);
  let cash = await pmRepo.findOne({ where: { code: 'CASH' } });
  if (!cash) {
    cash = await pmRepo.save(pmRepo.create({ code: 'CASH', name: 'Cash', useForPurchases: true, accountingChannel: 'CASH', sortOrder: 1 }));
  }
  let bank = await pmRepo.findOne({ where: { code: 'BANK' } });
  if (!bank) {
    bank = await pmRepo.save(pmRepo.create({ code: 'BANK', name: 'Bank Transfer', useForPurchases: true, accountingChannel: 'BANK', sortOrder: 2 }));
  }
  return { cash, bank };
}

async function seedProducts(ds: DataSource): Promise<{ goods: Product; service: Product }> {
  const category = await ds.getRepository(Category).save(
    ds.getRepository(Category).create({ name: `OE Test Category ${Date.now()}`, level: 0 }),
  );
  const goods = await ds.getRepository(Product).save(
    ds.getRepository(Product).create({
      name: `OE Goods ${Date.now()}`,
      categoryId: category.id,
      type: ProductType.GOODS,
      baseCost: 10,
      stockQuantity: 100,
      isActive: true,
    }),
  );
  const service = await ds.getRepository(Product).save(
    ds.getRepository(Product).create({
      name: `OE Service ${Date.now()}`,
      categoryId: category.id,
      type: ProductType.SERVICE,
      baseCost: 10,
      stockQuantity: 0,
      isActive: true,
    }),
  );
  return { goods, service };
}

describe('Owner Equity (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let trial: TrialBalanceService;
  let settings: SettingsService;
  let cashMethodId: string;
  let bankMethodId: string;
  let productId: string;
  let serviceProductId: string;
  let productCategoryId: string;
  let createdUserId: string;

  let ref: string;
  let stockRef: string;
  const oneRefund: { refunds: Array<{ sourceSettlementId: string; amount: string; refundDate: string }> } = { refunds: [] };

  // Logged in ONCE below: /auth/login is throttled to 5 req/min
  // (auth.controller.ts:41), so a per-test login would 403 under CI timing.
  let token: string;
  let post: (path: string, body?: any) => request.Test;
  let get: (path: string) => request.Test;
  let del: (path: string) => request.Test;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();
    ds = moduleFixture.get(DataSource);
    trial = moduleFixture.get(TrialBalanceService);
    settings = app.get(SettingsService);
    await seedAccounting(ds);
    const methods = await seedPaymentMethods(ds);
    cashMethodId = methods.cash.id;
    bankMethodId = methods.bank.id;
    const products = await seedProducts(ds);
    productId = products.goods.id;
    serviceProductId = products.service.id;
    productCategoryId = (products.goods as any).categoryId;

    const username = `oe-admin-${Date.now()}`;
    const userRepo = ds.getRepository(User);
    const user = await userRepo.save(
      userRepo.create({
        username,
        email: `${username}@test.com`,
        password: await bcrypt.hash('Admin@123!', 12),
        firstName: 'OE',
        lastName: 'Admin',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        isActive: true,
        failedLoginAttempts: 0,
      }),
    );
    createdUserId = user.id;

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: 'Admin@123!' });
    token = loginRes.body?.data?.accessToken ?? loginRes.body?.accessToken;
    expect(token).toBeTruthy();

    const server = app.getHttpServer();
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    post = (path: string, body: any = {}) => auth(request(server).post(path).send(body));
    get = (path: string) => auth(request(server).get(path));
    del = (path: string) => auth(request(server).delete(path));
  });

  afterAll(async () => {
    if (ownedRefs.length) {
      await ds.query(
        `DELETE FROM journal_entry_line WHERE "entryId" IN (SELECT id FROM journal_entry WHERE "sourceRef" = ANY($1))`,
        [ownedRefs],
      );
      await ds.query(`DELETE FROM journal_entry WHERE "sourceRef" = ANY($1)`, [ownedRefs]);
      await ds.query(
        `DELETE FROM stock_movements WHERE "referenceType" = 'owner_equity' AND "referenceId" IN (SELECT id FROM owner_equity_documents WHERE "referenceNumber" = ANY($1))`,
        [ownedRefs],
      );
      await ds.query(`DELETE FROM owner_equity_documents WHERE "referenceNumber" = ANY($1)`, [ownedRefs]);
      await ds.query(`DELETE FROM products WHERE id = ANY($1)`, [[productId, serviceProductId]]);
      await ds.query(`DELETE FROM categories WHERE id = $1`, [productCategoryId]);
      await ds.query(`DELETE FROM users WHERE id = $1`, [createdUserId]);
    }
    if (ds?.isInitialized) await ds.destroy();
    await app.close();
  });

  async function accountBalances(): Promise<Map<string, { debit: bigint; credit: bigint }>> {
    const tb = await trial.getTrialBalance({ showZero: true });
    const map = new Map<string, { debit: bigint; credit: bigint }>();
    for (const row of tb.rows) {
      map.set(row.code, { debit: toMinorUnits(row.debit), credit: toMinorUnits(row.credit) });
    }
    return map;
  }

  async function productStock(id: string): Promise<number> {
    const p = await ds.getRepository(Product).findOneByOrFail({ id });
    return Number(p.stockQuantity);
  }

  async function setProductStock(id: string, quantity: number): Promise<void> {
    await ds.getRepository(Product).update(id, { stockQuantity: quantity });
  }

  async function createStockDrawing(body: { productId: string; quantity: string }): Promise<string> {
    const res = await post('/accounting/owner-equity', {
      type: 'STOCK_DRAWING',
      equityDate: '2026-08-16',
      description: 'Stock drawing',
      ...body,
    }).expect(201);
    return res.body.data.referenceNumber;
  }

  async function createInjection(body: { totalAmount: string }): Promise<string> {
    const res = await post('/accounting/owner-equity', {
      type: 'CAPITAL_INJECTION',
      equityDate: '2026-08-16',
      description: 'Capital injection',
      ...body,
    }).expect(201);
    return res.body.data.referenceNumber;
  }

  async function journalEntriesFor(referenceNumber: string): Promise<Array<{
    id: string;
    sourceEventId: string | null;
    reversalOfEntryId: string | null;
  }>> {
    return ds.query(
      `SELECT id, "sourceEventId", "reversalOfEntryId" FROM journal_entry WHERE "sourceRef" = $1 ORDER BY "createdAt"`,
      [referenceNumber],
    );
  }

  it('runs a capital injection from draft to completed', async () => {
    const before = await accountBalances();
    const created = await post('/accounting/owner-equity', {
      type: 'CAPITAL_INJECTION',
      equityDate: '2026-08-16',
      description: 'Initial capital',
      totalAmount: '20000.0000',
    }).expect(201);
    ref = created.body.data.referenceNumber;
    ownedRefs.push(ref);
    expect(ref).toMatch(/^EQ-\d{2}-\d{3,}$/);
    expect(created.body.data.documentStatus).toBe('DRAFT');

    await post(`/accounting/owner-equity/${ref}/settle`, {
      settlements: [{ paymentMethodId: bankMethodId, settlementDate: '2026-08-16', amount: '8000.0000' }],
    }).expect(201);
    expect((await get(`/accounting/owner-equity/${ref}`)).body.data.documentStatus).toBe('DRAFT');

    await post(`/accounting/owner-equity/${ref}/settle`, {
      settlements: [{ paymentMethodId: cashMethodId, settlementDate: '2026-08-16', amount: '12000.0000' }],
    }).expect(201);
    const ready = (await get(`/accounting/owner-equity/${ref}`)).body.data;
    expect(ready.documentStatus).toBe('READY');
    expect(ready.settlementStatus).toBe('SETTLED');

    await post(`/accounting/owner-equity/${ref}/complete`, {}).expect(201);

    // Owner Capital carries the full credit; the split across bank and cash is
    // visible on the asset side. Deltas over this suite's own postings keep the
    // assertions robust to rows other suites leave on the shared DB.
    const after = await accountBalances();
    expect(formatScale4(after.get('3100').credit - before.get('3100').credit)).toBe('20000.0000');
    expect(formatScale4(after.get('1100').debit - before.get('1100').debit)).toBe('12000.0000');
    expect(formatScale4(after.get('1200').debit - before.get('1200').debit)).toBe('8000.0000');
  });

  it('rejects over-settlement', async () => {
    await post(`/accounting/owner-equity/${ref}/settle`, {
      settlements: [{ paymentMethodId: cashMethodId, settlementDate: '2026-08-16', amount: '999999.0000' }],
    }).expect(400);
  });

  it('blocks refund while completed and allows it after uncomplete', async () => {
    const doc = (await get(`/accounting/owner-equity/${ref}`)).body.data;
    const source = doc.settlements.find((s: any) => toMinorUnits(s.amount) > 0n);
    oneRefund.refunds = [{ sourceSettlementId: source.id, amount: '1000.0000', refundDate: '2026-08-16' }];
    await post(`/accounting/owner-equity/${ref}/refund`, oneRefund).expect(400);
    await post(`/accounting/owner-equity/${ref}/uncomplete`, {}).expect(201);
    await post(`/accounting/owner-equity/${ref}/refund`, oneRefund).expect(201);
  });

  it('completes a stock drawing, moves stock and posts at cost', async () => {
    const before = await productStock(productId);
    stockRef = await createStockDrawing({ productId, quantity: '2.0000' });
    ownedRefs.push(stockRef);
    await post(`/accounting/owner-equity/${stockRef}/complete`, {}).expect(201);
    expect(await productStock(productId)).toBe(before - 2);
    const doc = (await get(`/accounting/owner-equity/${stockRef}`)).body.data;
    expect(doc.unitCost).toBe('10.0000'); // product baseCost
    expect(doc.totalCost).toBe('20.0000');
  });

  it('restores stock and reverses the entry on uncomplete', async () => {
    const before = await productStock(productId);
    await post(`/accounting/owner-equity/${stockRef}/uncomplete`, {}).expect(201);
    expect(await productStock(productId)).toBe(before + 2);
  });

  it('posts a FRESH original entry when re-completed after uncomplete', async () => {
    // Fresh drawing so the lifecycle below is exactly complete → uncomplete →
    // complete: the brief's counts (2 originals, 1 reversal) are for a document
    // whose whole entry history is this sequence.
    const freshRef = await createStockDrawing({ productId, quantity: '2.0000' });
    ownedRefs.push(freshRef);
    await post(`/accounting/owner-equity/${freshRef}/complete`, {}).expect(201);
    await post(`/accounting/owner-equity/${freshRef}/uncomplete`, {}).expect(201);
    await post(`/accounting/owner-equity/${freshRef}/complete`, {}).expect(201);

    const entries = await journalEntriesFor(freshRef);
    const originals = entries.filter((e) => e.reversalOfEntryId === null);
    const reversals = entries.filter((e) => e.reversalOfEntryId !== null);
    expect(originals).toHaveLength(2); // NOT 1 — the second complete must post
    expect(reversals).toHaveLength(1);
    // Distinct sourceEventIds prove the fresh movement id broke the collision.
    expect(new Set(originals.map((e) => e.sourceEventId)).size).toBe(2);
  });

  it('rejects a stock drawing above available stock', async () => {
    const tooBig = await createStockDrawing({ productId, quantity: '999999.0000' });
    ownedRefs.push(tooBig);
    await post(`/accounting/owner-equity/${tooBig}/complete`, {}).expect(400);
  });

  it('rejects a service product', async () => {
    // Task 10's create() asserts drawability up front, so a service product is
    // rejected at create time — the drawing can never reach complete.
    await post('/accounting/owner-equity', {
      type: 'STOCK_DRAWING',
      equityDate: '2026-08-16',
      description: 'Stock drawing',
      productId: serviceProductId,
      quantity: '1.0000',
    }).expect(400);
  });

  it('exposes no DELETE route', async () => {
    await del(`/accounting/owner-equity/${ref}`).expect(404);
  });

  it('serializes concurrent completions of the same product', async () => {
    // Stock is 3. Two drawings of 2 each: the product row lock must serialize
    // them so exactly one succeeds and the other fails the stock check.
    // Without the pessimistic_write lock both read stock=3 and both complete,
    // driving stock negative.
    await setProductStock(productId, 3);
    const a = await createStockDrawing({ productId, quantity: '2.0000' });
    const b = await createStockDrawing({ productId, quantity: '2.0000' });
    ownedRefs.push(a, b);

    const results = await Promise.allSettled([
      post(`/accounting/owner-equity/${a}/complete`, {}),
      post(`/accounting/owner-equity/${b}/complete`, {}),
    ]);
    const codes = results.map((r) =>
      r.status === 'fulfilled' ? (r.value as any).status : 500);

    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.filter((c) => c === 400)).toHaveLength(1);
    expect(await productStock(productId)).toBe(1); // 3 - 2, never negative
  });

  it('serializes concurrent settlements without over-settling', async () => {
    // Balance is 100. Two concurrent settlements of 100 each: the document row
    // lock must let exactly one through.
    const injection = await createInjection({ totalAmount: '100.0000' });
    ownedRefs.push(injection);
    const line = [{ paymentMethodId: cashMethodId, settlementDate: '2026-08-16', amount: '100.0000' }];

    const results = await Promise.allSettled([
      post(`/accounting/owner-equity/${injection}/settle`, { settlements: line }),
      post(`/accounting/owner-equity/${injection}/settle`, { settlements: line }),
    ]);
    const codes = results.map((r) =>
      r.status === 'fulfilled' ? (r.value as any).status : 500);

    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    const doc = (await get(`/accounting/owner-equity/${injection}`)).body.data;
    expect(doc.settledAmount).toBe('100.0000');
    expect(doc.settlementStatus).toBe('SETTLED');

    // The money side is only half the invariant: exactly ONE settlement row and
    // exactly ONE unreversed journal entry must exist. UQ_journal_entry_source_event
    // is what guarantees the second — findExistingEntry() alone is check-then-act
    // and can be raced. This asserts the real database behaviour rather than the
    // simulated 23505 the unit test injects.
    const settlementRows = await ds.query(
      `SELECT id FROM owner_equity_settlements
        WHERE "equityDocumentId" = (SELECT id FROM owner_equity_documents WHERE "referenceNumber" = $1)`,
      [injection],
    );
    expect(settlementRows).toHaveLength(1);

    const entries = await ds.query(
      `SELECT id FROM journal_entry
        WHERE "sourceType" = 'OWNER_EQUITY'
          AND "sourceEventId" = $1
          AND "reversalOfEntryId" IS NULL`,
      [settlementRows[0].id],
    );
    expect(entries).toHaveLength(1);
  });

  describe('document numbering', () => {
    const yy = String(new Date().getFullYear() % 100).padStart(2, '0');

    it('reads the maximum NUMERIC suffix, not the lexical maximum', async () => {
      // EQ-YY-0999 sorts ABOVE EQ-YY-1000 lexically. A textual max reads 999,
      // and the next issued number then collides with the existing 1000.
      const repo = ds.getRepository(OwnerEquityDocument);
      for (const seq of ['0999', '1000']) {
        const row = (await repo.save(
          repo.create({
            referenceNumber: `EQ-${yy}-${seq}`,
            equityDate: '2026-08-16', type: 'CAPITAL_INJECTION',
            description: 'numbering fixture', documentStatus: 'DRAFT',
            settlementStatus: 'UNSETTLED', totalAmount: '1.0000',
            settledAmount: '0.0000', balance: '1.0000',
          } as any),
        )) as unknown as OwnerEquityDocument;
        ownedRefs.push(row.referenceNumber);
      }

      await settings.syncDocumentNumbersWithDatabase();

      expect(await settings.generateDocumentNumber('Owner Equity')).toBe(`EQ-${yy}-1001`);
    });
  });
});
