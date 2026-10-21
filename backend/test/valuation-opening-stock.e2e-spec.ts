import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { seedCategory } from './e2e/helpers/seed';
import { configureTestAppValidation } from './utils/configure-test-app-validation';
import { SESSION_PROTOCOL } from './utils/session-protocol';
import { E2E_ADMIN_PASSWORD, E2E_ADMIN_USERNAMES, removeSuiteAdmin, seedSuiteAdmin } from './utils/shared-e2e-fixture';
import { removeSuiteTraces } from './utils/shared-e2e-traces-fixture';
import { resetSuiteBusinessRows } from './utils/shared-e2e-business-fixture';
import { deactivateValuationForTest, activateValuationForTest } from './utils/valuation-fixture';

const USERNAME = E2E_ADMIN_USERNAMES.stockUnreceive;
const RUN = `${process.pid}-${Date.now().toString(36)}`;

describe('Opening product stock under valuation', () => {
  let app: INestApplication;
  let ds: DataSource;
  let token: string;
  let categoryId: string;
  const productIds: string[] = [];
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    configureTestAppValidation(app);
    await app.init();
    ds = app.get(DataSource);
    await seedSuiteAdmin(ds, USERNAME);
    categoryId = (await seedCategory(ds, `valuation-opening-${RUN}`)).id;
    const login = await request(app.getHttpServer()).post('/auth/login').set(...SESSION_PROTOCOL)
      .send({ usernameOrEmail: USERNAME, password: E2E_ADMIN_PASSWORD }).expect(200);
    token = login.body?.data?.accessToken ?? login.body?.accessToken;
  });

  afterEach(async () => { if (ds?.isInitialized) await deactivateValuationForTest(ds); });

  afterAll(async () => {
    if (ds?.isInitialized) {
      const zero = '00000000-0000-0000-0000-000000000000';
      const movements = await ds.query(`SELECT id FROM stock_movements WHERE "productId" = ANY($1)`, [productIds.length ? productIds : [zero]]);
      const entries = await ds.query(`SELECT id FROM journal_entry WHERE "sourceEventId" = ANY($1)`, [movements.length ? movements.map((row: any) => row.id) : [zero]]);
      await ds.query(`DELETE FROM journal_entry WHERE id = ANY($1)`, [entries.map((row: any) => row.id)]);
      await removeSuiteTraces(ds, { usernames: [USERNAME], entityIds: [categoryId, ...productIds, ...movements.map((row: any) => row.id)] });
      await resetSuiteBusinessRows(ds, { categoryIds: [categoryId], productIds });
      await removeSuiteAdmin(ds, USERNAME);
    }
    await app.close();
  });

  async function create(body: Record<string, unknown>) {
    const result = await request(app.getHttpServer()).post('/inventory/products').set(auth()).send({
      name: `Valuation Opening ${RUN}-${productIds.length + 1}`,
      categoryId,
      type: 'Stocked Product',
      ...body,
    });
    if (result.status === 201) productIds.push((result.body.data ?? result.body).id);
    return result;
  }

  it('records the opening movement, valuation and balanced opening journal', async () => {
    await activateValuationForTest(ds, { method: 'AVERAGE', products: [] });
    const response = await create({ stockQuantity: 4, baseCost: 25 });
    expect(response.status).toBe(201);
    const productId = (response.body.data ?? response.body).id;
    const [balance] = await ds.query(`SELECT "quantityOnHand"::text AS quantity, "valueOnHand"::text AS value FROM product_valuation_balances WHERE "productId" = $1`, [productId]);
    expect(balance).toEqual({ quantity: '4.0000', value: '100.00' });
    const [entry] = await ds.query(`SELECT e.id, e.value::text AS value, e."journalEntryId", m."actorUserId" FROM stock_valuation_entries e JOIN stock_movements m ON m.id = e."movementId" WHERE e."productId" = $1 AND e.kind = 'opening'`, [productId]);
    expect(entry.value).toBe('100.00');
    expect(entry.actorUserId).toBeTruthy();
    const lines = await ds.query(`SELECT a.code, l.debit::text AS debit, l.credit::text AS credit FROM journal_entry_line l JOIN chart_of_account a ON a.id = l."accountId" WHERE l."entryId" = $1 ORDER BY a.code`, [entry.journalEntryId]);
    expect(lines).toEqual([
      { code: '1300', debit: '100.0000', credit: '0.0000' },
      { code: '3200', debit: '0.0000', credit: '100.0000' },
    ]);
  });

  it('requires a cost or explicit zero-cost confirmation for opening stock', async () => {
    await activateValuationForTest(ds, { method: 'AVERAGE', products: [] });
    const missingCost = await create({ stockQuantity: 4 });
    expect(missingCost.status).toBe(400);
    expect(missingCost.body.message).toBe('Opening stock needs a unit cost.')
    const unconfirmed = await create({ stockQuantity: 4, baseCost: 0 });
    expect(unconfirmed.status).toBe(400);
    expect(unconfirmed.body.message).toContain('zero cost must be confirmed')
    const zero = await create({ stockQuantity: 4, baseCost: 0, openingZeroCostConfirmed: true });
    expect(zero.status).toBe(201);
    const productId = (zero.body.data ?? zero.body).id;
    const [balance] = await ds.query(`SELECT "quantityOnHand"::text AS quantity, "valueOnHand"::text AS value FROM product_valuation_balances WHERE "productId" = $1`, [productId]);
    expect(balance).toEqual({ quantity: '4.0000', value: '0.00' });
    const count = await ds.query(`SELECT count(*)::int AS count FROM journal_entry WHERE "sourceType" = 'PRODUCT' AND "sourceDocumentId" = $1`, [productId]);
    expect(count[0].count).toBe(0);
  });

  it('reports a precise import error when an opening stock row has no positive cost', async () => {
    await activateValuationForTest(ds, { method: 'AVERAGE', products: [] });
    const csv = Buffer.from(`name,type,categoryName,baseCost,stockQuantity\nValuation CSV ${RUN},Stocked Product,valuation-opening-${RUN},,4\n`);
    const response = await request(app.getHttpServer()).post('/inventory/products/import').set(auth())
      .field('format', 'csv').attach('file', csv, 'valuation-opening.csv').expect(200);
    const result = response.body.data?.data ?? response.body.data ?? response.body;
    expect(result.failureCount).toBe(1);
    expect(result.errors[0].message).toBe('Opening stock needs a positive unit cost in an import.');
  });

  it('creates a zero valuation balance for products without opening stock', async () => {
    await activateValuationForTest(ds, { method: 'AVERAGE', products: [] });
    const response = await create({ baseCost: 25 });
    expect(response.status).toBe(201);
    const productId = (response.body.data ?? response.body).id;
    const [balance] = await ds.query(`SELECT "quantityOnHand"::text AS quantity, "valueOnHand"::text AS value, method FROM product_valuation_balances WHERE "productId" = $1`, [productId]);
    expect(balance).toEqual({ quantity: '0.0000', value: '0.00', method: 'AVERAGE' });
  });
});
