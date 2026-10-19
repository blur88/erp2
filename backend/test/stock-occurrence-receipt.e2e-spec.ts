import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import {
  seedCategory,
  seedDocumentNumberSettings,
  seedPaymentMethod,
  seedProduct,
} from './e2e/helpers/seed';
import { formatMoney, toMinorUnits } from '../src/common/utils/money';
import { configureTestAppValidation } from './utils/configure-test-app-validation';
import { SESSION_PROTOCOL } from './utils/session-protocol';
import { resetSuiteBusinessRows } from './utils/shared-e2e-business-fixture';
import {
  E2E_ADMIN_PASSWORD,
  E2E_ADMIN_USERNAMES,
  removeSuiteAdmin,
  seedSuiteAdmin,
} from './utils/shared-e2e-fixture';
import { removeSuiteTraces } from './utils/shared-e2e-traces-fixture';

/**
 * A receipt records exactly one stock occurrence (#1406).
 *
 * The receipt is the first writer to record an occurrence and to stamp every
 * movement and batch with it, and the first to carry reconciled per-line values
 * (`allocateCents`). These assertions drive the real HTTP API and then read the
 * rows directly, because the point is agreement between the document, the
 * ledger and the cost subledger — not the shape of any one response.
 */
describe('Stock occurrence — receipt (#1406, e2e)', () => {
  const USERNAME = E2E_ADMIN_USERNAMES.stockOccurrenceReceipt;
  const run = `${process.pid}-${Date.now().toString(36)}`;

  let app: INestApplication;
  let ds: DataSource;
  let token: string;
  let userId: string;
  let supplierId: string;
  let productId: string;
  let categoryId: string;
  let paymentMethodId: string;

  const ownedPoIds: string[] = [];

  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();

    ds = app.get(DataSource);
    await seedSuiteAdmin(ds, USERNAME);
    const category = await seedCategory(ds, `stock-occ-receipt-${run}`);
    categoryId = category.id;
    const product = await seedProduct(ds, category.id, { stockQuantity: 0, baseCost: 10 });
    productId = product.id;
    paymentMethodId = (await seedPaymentMethod(ds)).id;
    await seedDocumentNumberSettings(ds);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .set(...SESSION_PROTOCOL)
      .send({ usernameOrEmail: USERNAME, password: E2E_ADMIN_PASSWORD })
      .expect(200);
    token = login.body?.data?.accessToken ?? login.body?.accessToken;
    expect(token).toBeTruthy();

    const [admin] = await ds.query(`SELECT id FROM users WHERE username = $1`, [USERNAME]);
    userId = admin.id;

    const supplier = await request(app.getHttpServer())
      .post('/purchasing/suppliers')
      .set(auth())
      .send({ type: 'local', companyName: `Stock Occ Receipt Supplier ${run}` })
      .expect(201);
    supplierId = (supplier.body.data ?? supplier.body).id;
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      const idsOr = (ids: string[]) =>
        ids.length ? ids : ['00000000-0000-0000-0000-000000000000'];
      const occurrenceIds: string[] = (
        await ds.query(
          `SELECT id FROM stock_occurrences WHERE "documentType" = 'purchase_order' AND "documentId" = ANY($1)`,
          [idsOr(ownedPoIds)],
        )
      ).map((r: { id: string }) => r.id);
      await ds.query(
        `DELETE FROM journal_entry WHERE "sourceDocumentId" = ANY($1) OR "sourceEventId" = ANY($2)`,
        [idsOr(ownedPoIds), idsOr(occurrenceIds)],
      );
      const adminRows: { id: string }[] = await ds.query(
        `SELECT id FROM users WHERE username = $1`,
        [USERNAME],
      );
      await removeSuiteTraces(ds, {
        userIds: adminRows.map((r) => r.id),
        usernames: [USERNAME],
        entityIds: [categoryId, productId, supplierId, ...ownedPoIds, ...occurrenceIds].filter(
          Boolean,
        ),
      });
      await resetSuiteBusinessRows(ds, {
        categoryIds: [categoryId],
        supplierIds: [supplierId],
        productIds: [productId],
      });
      await ds.query(`DELETE FROM document_number_settings WHERE "documentName" = 'Goods Received'`);
      await removeSuiteAdmin(ds, USERNAME);
    }
    await app.close();
  });

  it('a receipt is one occurrence and its values sum to the receipt entry', async () => {
    // Three equally-valued lines with RM10 shipping, so the per-line value split
    // leaves a rounding residue the allocation must conserve.
    const poRes = await request(app.getHttpServer())
      .post('/purchasing/orders')
      .set(auth())
      .send({
        supplierId,
        orderDate: '2026-09-17',
        shippingAmount: 10,
        items: [
          { productId, quantity: 3, unitPrice: 10 },
          { productId, quantity: 3, unitPrice: 10 },
          { productId, quantity: 3, unitPrice: 10 },
        ],
      })
      .expect(201);
    const po = poRes.body.data ?? poRes.body;
    ownedPoIds.push(po.id);

    await request(app.getHttpServer())
      .post(`/purchasing/orders/${po.id}/payments`)
      .set(auth())
      .send({
        payments: [
          { paymentMethodId, amount: formatMoney(toMinorUnits(po.totalAmount)), paymentDate: '2026-09-17' },
        ],
      })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/purchasing/orders/${po.id}/receive`)
      .set(auth())
      .expect(200);

    const occurrences = await ds.query(
      `SELECT id, kind, "postedAmount" FROM stock_occurrences WHERE "documentId" = $1 AND kind = 'receipt'`,
      [po.id],
    );
    expect(occurrences).toHaveLength(1);
    const occurrence = occurrences[0];

    const lineIdentityColumns: { table_name: string; column_name: string }[] = await ds.query(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND (table_name, column_name) IN (
            ('stock_occurrences', 'receiptEvidenceVersion'),
            ('stock_movements', 'purchaseOrderItemId'),
            ('purchase_cost_history', 'purchaseOrderItemId')
          )`,
    );
    expect(lineIdentityColumns).toEqual(expect.arrayContaining([
      { table_name: 'stock_occurrences', column_name: 'receiptEvidenceVersion' },
      { table_name: 'stock_movements', column_name: 'purchaseOrderItemId' },
      { table_name: 'purchase_cost_history', column_name: 'purchaseOrderItemId' },
    ]));
    const [versionedOccurrence] = await ds.query(
      `SELECT "receiptEvidenceVersion" FROM stock_occurrences WHERE id = $1`,
      [occurrence.id],
    );

    const itemIds: { id: string }[] = await ds.query(
      `SELECT id FROM purchase_order_items WHERE "purchaseOrderId" = $1 ORDER BY "lineNumber"`,
      [po.id],
    );
    const identifiedMovements: { purchaseOrderItemId: string; occurrenceId: string }[] = await ds.query(
      `SELECT "purchaseOrderItemId", "occurrenceId" FROM stock_movements
        WHERE "occurrenceId" = $1 ORDER BY "productSequence"`,
      [occurrence.id],
    );
    const identifiedBatches: { purchaseOrderItemId: string; occurrenceId: string }[] = await ds.query(
      `SELECT "purchaseOrderItemId", "occurrenceId" FROM purchase_cost_history
        WHERE "purchaseOrderId" = $1 ORDER BY id`,
      [po.id],
    );
    expect(versionedOccurrence.receiptEvidenceVersion).toBe(1);
    expect(identifiedMovements).toHaveLength(itemIds.length);
    expect(identifiedBatches).toHaveLength(itemIds.length);
    expect(identifiedMovements.map((row) => row.purchaseOrderItemId).sort()).toEqual(
      itemIds.map((row) => row.id).sort(),
    );
    expect(identifiedBatches.map((row) => row.purchaseOrderItemId).sort()).toEqual(
      itemIds.map((row) => row.id).sort(),
    );
    expect(identifiedMovements.every((row) => row.occurrenceId === occurrence.id)).toBe(true);
    expect(identifiedBatches.every((row) => row.occurrenceId === occurrence.id)).toBe(true);

    // The receipt entry is keyed to the occurrence and its debit is the recorded amount.
    const [entry] = await ds.query(
      `SELECT id FROM journal_entry WHERE "sourceEventId" = $1 AND "postingType" = 'PURCHASE_RECEIVE'`,
      [occurrence.id],
    );
    expect(entry).toBeTruthy();
    const lines: { debit: string }[] = await ds.query(
      `SELECT debit FROM journal_entry_line WHERE "entryId" = $1`,
      [entry.id],
    );
    const entryDebitMinor = lines.reduce((sum, l) => sum + toMinorUnits(l.debit), 0n);
    expect(toMinorUnits(occurrence.postedAmount)).toBe(entryDebitMinor);

    const movements: {
      totalValue: string;
      occurrenceId: string;
      actorUserId: string;
      productSequence: string;
    }[] = await ds.query(
      `SELECT "totalValue", "occurrenceId", "actorUserId", "productSequence"
         FROM stock_movements WHERE "occurrenceId" = $1`,
      [occurrence.id],
    );
    expect(movements).toHaveLength(3);

    const movementValueMinor = movements.reduce(
      (sum, m) => sum + toMinorUnits(m.totalValue),
      0n,
    );
    expect(movementValueMinor).toBe(toMinorUnits(occurrence.postedAmount));

    for (const movement of movements) {
      expect(movement.occurrenceId).toBe(occurrence.id);
      expect(movement.actorUserId).toBe(userId);
      expect(movement.productSequence).not.toBeNull();
    }
    expect(new Set(movements.map((m) => m.productSequence)).size).toBe(3);

    const batches: { occurrenceId: string }[] = await ds.query(
      `SELECT "occurrenceId" FROM purchase_cost_history WHERE "purchaseOrderId" = $1`,
      [po.id],
    );
    expect(batches).toHaveLength(3);
    for (const batch of batches) {
      expect(batch.occurrenceId).toBe(occurrence.id);
    }
  });
});
