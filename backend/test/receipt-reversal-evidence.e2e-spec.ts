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
import {
  RECEIPT_CHANGED_OUTSIDE_MOVEMENTS,
  RECEIPT_LATER_DECREASE,
  RECEIPT_BATCH_TOUCHED,
  RECEIPT_PRE_RECORDING,
} from '../src/modules/inventory/stock-undo-unavailable';
import { assessReceiptReversal } from '../src/modules/purchasing/services/receipt-reversal-evidence';
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
 * Receipt-reversal evidence (#1406): a received purchase order can only be
 * returned to Ready when the records can show its goods are untouched. Every
 * rule reads real SQL; a state the evidence cannot prove is refused.
 */
describe('Receipt-reversal evidence (#1406, e2e)', () => {
  const USERNAME = E2E_ADMIN_USERNAMES.receiptReversalEvidence;
  const run = `${process.pid}-${Date.now().toString(36)}`;

  let app: INestApplication;
  let ds: DataSource;
  let token: string;
  let categoryId: string;
  let supplierId: string;
  let paymentMethodId: string;

  const productIds: string[] = [];
  const ownedPoIds: string[] = [];
  const zero = '00000000-0000-0000-0000-000000000000';

  const auth = () => ({ Authorization: `Bearer ${token}` });

  async function newProduct(stockQuantity = 0): Promise<{ id: string; name: string }> {
    const product = await seedProduct(ds, categoryId, {
      stockQuantity,
      baseCost: 10,
      name: `Receipt Evidence ${run}-${productIds.length + 1}`,
    });
    productIds.push(product.id);
    return { id: product.id, name: product.name };
  }

  async function receive(poId: string): Promise<void> {
    await request(app.getHttpServer()).post(`/purchasing/orders/${poId}/receive`).set(auth()).expect(200);
  }

  async function createPo(
    productId: string,
    quantity: number,
    unitPrice: number,
    orderDate = '2026-09-01',
  ): Promise<string> {
    const po = await request(app.getHttpServer())
      .post('/purchasing/orders')
      .set(auth())
      .send({ supplierId, orderDate, items: [{ productId, quantity, unitPrice }] })
      .expect(201);
    const id = (po.body.data ?? po.body).id;
    ownedPoIds.push(id);
    await request(app.getHttpServer())
      .post(`/purchasing/orders/${id}/payments`)
      .set(auth())
      .send({
        payments: [
          {
            paymentMethodId,
            amount: formatMoney(toMinorUnits((po.body.data ?? po.body).totalAmount)),
            paymentDate: orderDate,
          },
        ],
      })
      .expect(200);
    return id;
  }

  async function assess(
    poId: string,
    product: { id: string; name: string },
    quantity: number,
    receivedDate: string,
    horizon: Date | null,
  ) {
    const [purchaseOrder] = await ds.query(
      `SELECT items.id, items."purchaseOrderId", items."productId",
              items.quantity::text AS quantity, items."totalAmount"::text AS "totalAmount"
         FROM purchase_order_items items
        WHERE items."purchaseOrderId" = $1
        ORDER BY items."lineNumber"`,
      [poId],
    );
    return assessReceiptReversal(
      ds.manager,
      {
        id: poId,
        receivedDate: new Date(`${receivedDate}T00:00:00Z`),
        items: [{ ...purchaseOrder, quantity, product: { id: product.id, name: product.name } }],
      } as any,
      horizon,
    );
  }

  async function makeLegacy(poId: string, receivedDate: string): Promise<void> {
    // Forget the occurrence and the per-product sequence so the receipt takes
    // the pre-deploy (legacy) shape.
    await ds.query(
      `UPDATE stock_movements SET "occurrenceId" = NULL, "productSequence" = NULL,
              "purchaseOrderItemId" = NULL
        WHERE "referenceType" = 'purchase_order' AND "referenceId" = $1`,
      [poId],
    );
    await ds.query(
      `UPDATE purchase_cost_history SET "occurrenceId" = NULL, "purchaseOrderItemId" = NULL
        WHERE "purchaseOrderId" = $1`,
      [
      poId,
      ],
    );
    await ds.query(
      `UPDATE journal_entry SET "sourceEventId" = NULL
        WHERE "sourceEventId" IN (SELECT id FROM stock_occurrences WHERE "documentId" = $1)`,
      [poId],
    );
    await ds.query(`DELETE FROM stock_occurrences WHERE "documentId" = $1`, [poId]);
    await ds.query(`UPDATE purchase_orders SET "receivedDate" = $2 WHERE id = $1`, [poId, receivedDate]);
  }

  async function receiptMovementId(poId: string): Promise<string> {
    const [row] = await ds.query(
      `SELECT id FROM stock_movements
        WHERE "referenceType" = 'purchase_order' AND "referenceId" = $1 AND "movementType" = 'purchase_receipt'`,
      [poId],
    );
    return row.id;
  }

  async function maxSequence(productId: string): Promise<bigint> {
    const [row] = await ds.query(
      `SELECT COALESCE(MAX("productSequence"), 0) AS seq FROM stock_movements WHERE "productId" = $1`,
      [productId],
    );
    return BigInt(row.seq);
  }

  async function insertMovement(opts: {
    productId: string;
    type: string;
    quantity: number;
    previousBalance: number;
    newBalance: number;
    sequence?: bigint | null;
    createdAt?: string;
    movementDate?: string;
    referenceType?: string;
  }): Promise<void> {
    await ds.query(
      `INSERT INTO stock_movements
         ("movementType","movementDate",quantity,"previousBalance","newBalance","productId",
          "productSequence","createdAt","updatedAt","referenceType","isActive")
       VALUES ($1::stock_movements_movementtype_enum, $2, $3, $4, $5, $6, $7,
               COALESCE($8::timestamptz, now()), now(), $9, true)`,
      [
        opts.type,
        opts.movementDate ?? '2026-09-05',
        opts.quantity,
        opts.previousBalance,
        opts.newBalance,
        opts.productId,
        opts.sequence == null ? null : opts.sequence.toString(),
        opts.createdAt ?? null,
        opts.referenceType ?? null,
      ],
    );
  }

  async function setStock(productId: string, stockQuantity: number): Promise<void> {
    await ds.query(`UPDATE products SET "stockQuantity" = $2 WHERE id = $1`, [productId, stockQuantity]);
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();

    ds = app.get(DataSource);
    await seedSuiteAdmin(ds, USERNAME);
    categoryId = (await seedCategory(ds, `receipt-evidence-${run}`)).id;
    paymentMethodId = (await seedPaymentMethod(ds)).id;
    await seedDocumentNumberSettings(ds);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .set(...SESSION_PROTOCOL)
      .send({ usernameOrEmail: USERNAME, password: E2E_ADMIN_PASSWORD })
      .expect(200);
    token = login.body?.data?.accessToken ?? login.body?.accessToken;
    expect(token).toBeTruthy();

    const supplier = await request(app.getHttpServer())
      .post('/purchasing/suppliers')
      .set(auth())
      .send({ type: 'local', companyName: `Receipt Evidence Supplier ${run}` })
      .expect(201);
    supplierId = (supplier.body.data ?? supplier.body).id;
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      const or = (ids: string[]) => (ids.length ? ids : [zero]);
      const occurrenceIds: string[] = (
        await ds.query(`SELECT id FROM stock_occurrences WHERE "documentId" = ANY($1)`, [or(ownedPoIds)])
      ).map((r: { id: string }) => r.id);
      await ds.query(
        `DELETE FROM journal_entry WHERE "sourceDocumentId" = ANY($1) OR "sourceEventId" = ANY($2)`,
        [or(ownedPoIds), or(occurrenceIds)],
      );
      const admins: { id: string }[] = await ds.query(`SELECT id FROM users WHERE username = $1`, [USERNAME]);
      await removeSuiteTraces(ds, {
        userIds: admins.map((r) => r.id),
        usernames: [USERNAME],
        entityIds: [categoryId, supplierId, ...productIds, ...ownedPoIds, ...occurrenceIds].filter(Boolean),
      });
      await resetSuiteBusinessRows(ds, {
        categoryIds: [categoryId],
        supplierIds: [supplierId],
        productIds,
      });
      await ds.query(`DELETE FROM document_number_settings WHERE "documentName" = 'Goods Received'`);
      await removeSuiteAdmin(ds, USERNAME);
    }
    await app.close();
  });

  it('a clean new receipt is ok', async () => {
    const product = await newProduct();
    const poId = await createPo(product.id, 5, 10);
    await receive(poId);

    const result = await assess(poId, product, 5, '2026-09-01', null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.receipt.occurrenceId).toBeTruthy();
      expect(result.receipt.legacyEntryId).toBeNull();
      expect(result.receipt.lines).toHaveLength(1);
      expect(result.receipt.lines[0].productId).toBe(product.id);
      expect(result.receipt.lines[0].quantityMinor).toBe(toMinorUnits('5.0000'));
    }
  });

  it('a clean legacy receipt after the horizon is ok', async () => {
    const product = await newProduct();
    const poId = await createPo(product.id, 4, 10);
    await receive(poId);
    await makeLegacy(poId, '2026-09-01');

    const result = await assess(poId, product, 4, '2026-09-01', new Date('2026-08-01T00:00:00Z'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.receipt.occurrenceId).toBeNull();
      expect(result.receipt.legacyEntryId).toBeTruthy();
      expect(result.receipt.lines[0].valueScale8).toBe(toMinorUnits('4.0000') * toMinorUnits('10.0000'));
    }
  });

  it('refuses a legacy receipt with no evidence horizon', async () => {
    const product = await newProduct();
    const poId = await createPo(product.id, 4, 10);
    await receive(poId);
    await makeLegacy(poId, '2026-09-01');

    const result = await assess(poId, product, 4, '2026-09-01', null);
    expect(result).toEqual({
      ok: false,
      message: RECEIPT_PRE_RECORDING('no evidence horizon has been approved'),
    });
  });

  it('refuses a legacy receipt received before the horizon', async () => {
    const product = await newProduct();
    const poId = await createPo(product.id, 4, 10);
    await receive(poId);
    await makeLegacy(poId, '2026-09-01');

    const result = await assess(poId, product, 4, '2026-09-01', new Date('2026-09-15T00:00:00Z'));
    expect(result).toEqual({
      ok: false,
      message: RECEIPT_PRE_RECORDING('it was received before the evidence horizon'),
    });
  });

  it('refuses a decrease after the receipt (R2)', async () => {
    const product = await newProduct();
    const poId = await createPo(product.id, 5, 10);
    await receive(poId);
    await insertMovement({
      productId: product.id,
      type: 'damage',
      quantity: -2,
      previousBalance: 5,
      newBalance: 3,
      sequence: (await maxSequence(product.id)) + 1n,
      movementDate: '2026-09-05',
    });

    const result = await assess(poId, product, 5, '2026-09-01', null);
    expect(result).toEqual({
      ok: false,
      message: RECEIPT_LATER_DECREASE(product.name, 'Damage', '2026-09-05'),
    });
  });

  it('refuses a later decrease that was later reversed', async () => {
    const product = await newProduct();
    const poId = await createPo(product.id, 5, 10);
    await receive(poId);
    const seq = (await maxSequence(product.id)) + 1n;
    await insertMovement({
      productId: product.id,
      type: 'sale',
      quantity: -2,
      previousBalance: 5,
      newBalance: 3,
      sequence: seq,
      movementDate: '2026-09-05',
    });
    await insertMovement({
      productId: product.id,
      type: 'sale_reversal',
      quantity: 2,
      previousBalance: 3,
      newBalance: 5,
      sequence: seq + 1n,
      movementDate: '2026-09-06',
    });

    const result = await assess(poId, product, 5, '2026-09-01', null);
    expect(result).toEqual({
      ok: false,
      message: RECEIPT_LATER_DECREASE(product.name, 'Sale', '2026-09-05'),
    });
  });

  it('orders by product sequence, not by timestamp (Review Focus 1)', async () => {
    const product = await newProduct();
    const poId = await createPo(product.id, 5, 10);
    await receive(poId);
    // Created before the receipt, but sequenced after it: the lock decides order.
    const receiptId = await receiptMovementId(poId);
    const [receiptRow] = await ds.query(`SELECT "createdAt" FROM stock_movements WHERE id = $1`, [receiptId]);
    await insertMovement({
      productId: product.id,
      type: 'damage',
      quantity: -1,
      previousBalance: 5,
      newBalance: 4,
      sequence: (await maxSequence(product.id)) + 1n,
      createdAt: new Date(new Date(receiptRow.createdAt).getTime() - 60000).toISOString(),
      movementDate: '2026-09-05',
    });

    const result = await assess(poId, product, 5, '2026-09-01', null);
    expect(result).toEqual({
      ok: false,
      message: RECEIPT_LATER_DECREASE(product.name, 'Damage', '2026-09-05'),
    });
  });

  it('a later receipt does not hide an earlier damage adjustment', async () => {
    const product = await newProduct();
    const firstPo = await createPo(product.id, 4, 10);
    await receive(firstPo);
    await insertMovement({
      productId: product.id,
      type: 'damage',
      quantity: -2,
      previousBalance: 4,
      newBalance: 2,
      sequence: (await maxSequence(product.id)) + 1n,
      movementDate: '2026-09-05',
    });
    const secondPo = await createPo(product.id, 5, 10, '2026-09-06');
    await receive(secondPo);

    const result = await assess(firstPo, product, 4, '2026-09-01', null);
    expect(result).toEqual({
      ok: false,
      message: RECEIPT_LATER_DECREASE(product.name, 'Damage', '2026-09-05'),
    });
  });

  it('refuses a stock change outside movements (R3)', async () => {
    const product = await newProduct();
    const poId = await createPo(product.id, 5, 10);
    await receive(poId);
    await setStock(product.id, 6);

    const result = await assess(poId, product, 5, '2026-09-01', null);
    expect(result).toEqual({
      ok: false,
      message: RECEIPT_CHANGED_OUTSIDE_MOVEMENTS(product.name),
    });
  });

  it('refuses a touched batch (R4)', async () => {
    const product = await newProduct();
    const poId = await createPo(product.id, 5, 10);
    await receive(poId);
    await ds.query(
      `UPDATE purchase_cost_history SET "remainingQuantity" = "remainingQuantity" - 1 WHERE "purchaseOrderId" = $1`,
      [poId],
    );

    const result = await assess(poId, product, 5, '2026-09-01', null);
    expect(result).toEqual({ ok: false, message: RECEIPT_BATCH_TOUCHED(product.name) });
  });

  it('refuses a legacy chain with a break', async () => {
    const product = await newProduct();
    const poId = await createPo(product.id, 3, 10);
    await receive(poId);
    await makeLegacy(poId, '2026-09-01');
    const receiptId = await receiptMovementId(poId);
    const [receiptRow] = await ds.query(`SELECT "createdAt" FROM stock_movements WHERE id = $1`, [receiptId]);
    await insertMovement({
      productId: product.id,
      type: 'adjustment_increase',
      quantity: 1,
      previousBalance: 99,
      newBalance: 100,
      sequence: null,
      createdAt: new Date(new Date(receiptRow.createdAt).getTime() - 120000).toISOString(),
      movementDate: '2026-08-30',
    });

    const result = await assess(poId, product, 3, '2026-09-01', new Date('2026-08-01T00:00:00Z'));
    expect(result).toEqual({
      ok: false,
      message: RECEIPT_PRE_RECORDING(
        `the order of ${product.name}'s earlier stock movements cannot be established`,
      ),
    });
  });

  it('refuses a legacy chain with a createdAt tie', async () => {
    const product = await newProduct();
    const poId = await createPo(product.id, 3, 10);
    await receive(poId);
    await makeLegacy(poId, '2026-09-01');
    const receiptId = await receiptMovementId(poId);
    const [receiptRow] = await ds.query(`SELECT "createdAt" FROM stock_movements WHERE id = $1`, [receiptId]);
    await insertMovement({
      productId: product.id,
      type: 'adjustment_increase',
      quantity: 1,
      previousBalance: 0,
      newBalance: 99,
      sequence: null,
      createdAt: receiptRow.createdAt,
      movementDate: '2026-08-30',
    });

    const result = await assess(poId, product, 3, '2026-09-01', new Date('2026-08-01T00:00:00Z'));
    expect(result).toEqual({
      ok: false,
      message: RECEIPT_PRE_RECORDING(
        `the order of ${product.name}'s earlier stock movements cannot be established`,
      ),
    });
  });

  it('refuses a legacy product whose history may have been rewritten', async () => {
    const product = await newProduct();
    const poId = await createPo(product.id, 3, 10);
    await receive(poId);
    await makeLegacy(poId, '2026-09-01');
    // A destructive-undo audit row naming the purchase order that contains the product.
    await ds.query(
      `INSERT INTO audit_logs ("userId","action","entityType","entityId","description","createdAt","updatedAt","isActive")
       VALUES ('system','UPDATE','PurchaseOrder',$1,'Returned purchase order: legacy', now(), now(), true)`,
      [poId],
    );

    const result = await assess(poId, product, 3, '2026-09-01', new Date('2026-08-01T00:00:00Z'));
    expect(result).toEqual({
      ok: false,
      message: RECEIPT_PRE_RECORDING(`stock history for ${product.name} may have been rewritten`),
    });
  });
});
