import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { DataSource } from "typeorm";
import { AppModule } from "../src/app.module";
import { CostingMethod } from "../src/common/costing/supported-costing-methods";
import { allocateCentsByWeight } from "../src/modules/inventory/valuation/valuation-math";
import { formatMoney, toMinorUnits } from "../src/common/utils/money";
import {
  seedCategory,
  seedDocumentNumberSettings,
  seedPaymentMethod,
  seedProduct,
} from "./e2e/helpers/seed";
import { configureTestAppValidation } from "./utils/configure-test-app-validation";
import { SESSION_PROTOCOL } from "./utils/session-protocol";
import {
  E2E_ADMIN_PASSWORD,
  E2E_ADMIN_USERNAMES,
  removeSuiteAdmin,
  seedSuiteAdmin,
} from "./utils/shared-e2e-fixture";
import { removeSuiteTraces } from "./utils/shared-e2e-traces-fixture";
import { resetSuiteBusinessRows } from "./utils/shared-e2e-business-fixture";
import {
  activateValuationForTest,
  deactivateValuationForTest,
} from "./utils/valuation-fixture";
import { RECEIPT_BATCH_TOUCHED } from "../src/modules/inventory/stock-undo-unavailable";

const USERNAME = E2E_ADMIN_USERNAMES.stockUnreceive;
const RUN = `${process.pid}-${Date.now().toString(36)}`;

describe("Purchase valuation under active inventory valuation", () => {
  let app: INestApplication;
  let ds: DataSource;
  let token: string;
  let categoryId: string;
  let supplierId: string;
  let paymentMethodId: string;
  const productIds: string[] = [];
  const purchaseOrderIds: string[] = [];
  const auth = () => ({ Authorization: `Bearer ${token}` });

  async function newProduct(stockQuantity = 0): Promise<string> {
    const product = await seedProduct(ds, categoryId, {
      stockQuantity,
      baseCost: 10,
      name: `Valuation Purchase Product ${RUN}-${productIds.length + 1}`,
    });
    productIds.push(product.id);
    return product.id;
  }

  async function createPo(
    lines: Array<{ productId: string; quantity: number; unitPrice: number }>,
    shippingAmount = 0,
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .post("/purchasing/orders")
      .set(auth())
      .send({
        supplierId,
        orderDate: "2026-09-01",
        shippingAmount,
        items: lines,
      })
      .expect(201);
    const order = response.body.data ?? response.body;
    purchaseOrderIds.push(order.id);
    await request(app.getHttpServer())
      .post(`/purchasing/orders/${order.id}/payments`)
      .set(auth())
      .send({
        payments: [
          {
            paymentMethodId,
            amount: formatMoney(toMinorUnits(String(order.totalAmount))),
            paymentDate: "2026-09-01",
          },
        ],
      })
      .expect(200);
    return order.id;
  }

  function receive(orderId: string) {
    return request(app.getHttpServer())
      .post(`/purchasing/orders/${orderId}/receive`)
      .set(auth());
  }

  function returnGoods(orderId: string) {
    return request(app.getHttpServer())
      .post(`/purchasing/orders/${orderId}/return`)
      .set(auth())
      .send({ reason: "Valuation receipt return" });
  }

  async function activate(
    method: CostingMethod,
    positions: Array<{
      productId: string;
      quantity?: string;
      value?: string;
      layers?: Array<{ quantity: string; value: string }>;
    }>,
  ) {
    await activateValuationForTest(ds, {
      method,
      products: positions.map((position) => ({
        productId: position.productId,
        quantity: position.quantity ?? "0",
        value: position.value ?? "0",
        layers: position.layers,
      })),
    });
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureTestAppValidation(app);
    await app.init();
    ds = app.get(DataSource);
    await seedSuiteAdmin(ds, USERNAME);
    categoryId = (await seedCategory(ds, `valuation-purchasing-${RUN}`)).id;
    paymentMethodId = (await seedPaymentMethod(ds)).id;
    await seedDocumentNumberSettings(ds);
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .set(...SESSION_PROTOCOL)
      .send({ usernameOrEmail: USERNAME, password: E2E_ADMIN_PASSWORD })
      .expect(200);
    token = login.body?.data?.accessToken ?? login.body?.accessToken;
    const supplier = await request(app.getHttpServer())
      .post("/purchasing/suppliers")
      .set(auth())
      .send({ type: "local", companyName: `Valuation Supplier ${RUN}` })
      .expect(201);
    supplierId = (supplier.body.data ?? supplier.body).id;
  });

  afterEach(async () => {
    if (ds?.isInitialized) await deactivateValuationForTest(ds);
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      const zero = "00000000-0000-0000-0000-000000000000";
      const orderIds = purchaseOrderIds.length ? purchaseOrderIds : [zero];
      const occurrences: Array<{ id: string }> = await ds.query(
        `SELECT id FROM stock_occurrences WHERE "documentId" = ANY($1)`,
        [orderIds],
      );
      const occurrenceIds = occurrences.map((row) => row.id);
      await ds.query(
        `DELETE FROM journal_entry WHERE "sourceDocumentId" = ANY($1) OR "sourceEventId" = ANY($2)`,
        [orderIds, occurrenceIds.length ? occurrenceIds : [zero]],
      );
      await removeSuiteTraces(ds, {
        usernames: [USERNAME],
        entityIds: [
          categoryId,
          supplierId,
          ...productIds,
          ...purchaseOrderIds,
          ...occurrenceIds,
        ].filter(Boolean),
      });
      await resetSuiteBusinessRows(ds, {
        categoryIds: [categoryId],
        supplierIds: [supplierId],
        productIds,
      });
      await ds.query(
        `DELETE FROM document_number_settings WHERE "documentName" = 'Goods Received'`,
      );
      await removeSuiteAdmin(ds, USERNAME);
    }
    await app.close();
  });

  describe.each(["AVERAGE", "FIFO"] as CostingMethod[])(
    "%s receipt and return",
    (method) => {
      it("adds receipt value, then reverses exactly that receipt and leaves older stock untouched", async () => {
        const productId = await newProduct(3);
        await ds.query(
          `INSERT INTO purchase_cost_history ("productId", "unitCost", "shippingPerUnit", "landedCost", "receivedQuantity", "remainingQuantity", "receivedDate") VALUES ($1, 10, 0, 10, 3, 3, '2025-01-01')`,
          [productId],
        );
        await activate(method, [
          {
            productId,
            quantity: "3",
            value: "30.00",
            layers:
              method === "FIFO"
                ? [{ quantity: "3", value: "30.00" }]
                : undefined,
          },
        ]);
        const orderId = await createPo([
          { productId, quantity: 5, unitPrice: 10 },
        ]);
        await receive(orderId).expect(200);
        const [receiptEntry] = await ds.query(
          `SELECT e.id, e.value::text AS value, e."runningQuantity"::text AS quantity, e."runningValue"::text AS running
           FROM stock_valuation_entries e JOIN stock_movements m ON m.id = e."movementId"
          WHERE m."referenceId" = $1 AND e.kind = 'receipt'`,
          [orderId],
        );
        expect(receiptEntry).toEqual({
          id: expect.any(String),
          value: "50.00",
          quantity: "8.0000",
          running: "80.00",
        });
        await returnGoods(orderId).expect(200);
        const [balance] = await ds.query(
          `SELECT "quantityOnHand"::text AS quantity, "valueOnHand"::text AS value FROM product_valuation_balances WHERE "productId" = $1`,
          [productId],
        );
        expect(balance).toEqual({ quantity: "3.0000", value: "30.00" });
        const [oldBatch] = await ds.query(
          `SELECT "remainingQuantity"::text AS remaining FROM purchase_cost_history WHERE "purchaseOrderId" IS NULL AND "productId" = $1`,
          [productId],
        );
        expect(oldBatch.remaining).toBe("3.0000");
        const [receiptBatch] = await ds.query(
          `SELECT "remainingQuantity"::text AS remaining FROM purchase_cost_history WHERE "purchaseOrderId" = $1`,
          [orderId],
        );
        expect(receiptBatch.remaining).toBe("0.0000");
        if (method === "FIFO") {
          const [layer] = await ds.query(
            `SELECT "remainingQuantity"::text AS remaining FROM inventory_cost_layers WHERE "sourceEntryId" = $1`,
            [receiptEntry.id],
          );
          expect(layer.remaining).toBe("0.0000");
        }
      });
    },
  );

  it("keeps the legacy receipt path unchanged while valuation is inactive", async () => {
    await deactivateValuationForTest(ds);
    const productId = await newProduct();
    const orderId = await createPo([{ productId, quantity: 2, unitPrice: 12 }]);
    await receive(orderId).expect(200);
    const [batch] = await ds.query(
      `SELECT "receivedQuantity"::text AS quantity,"landedCost"::text AS cost FROM purchase_cost_history WHERE "purchaseOrderId"=$1 AND "productId"=$2`,
      [orderId, productId],
    );
    const [valuation] = await ds.query(
      `SELECT count(*)::int AS count FROM stock_valuation_entries WHERE "productId"=$1`,
      [productId],
    );
    expect(batch).toEqual({ quantity: "2.0000", cost: "12.0000" });
    await returnGoods(orderId).expect(200);
    const [product] = await ds.query(
      `SELECT "stockQuantity"::text AS quantity FROM products WHERE id=$1`,
      [productId],
    );
    expect(product.quantity).toBe("0.0000");
    expect(valuation.count).toBe(0);
  });

  describe.each(["AVERAGE", "FIFO"] as CostingMethod[])(
    "%s receipt allocation",
    (method) => {
      it("allocates posted receipt cents by largest remainder and opens one FIFO layer per line", async () => {
        const first = await newProduct();
        const second = await newProduct();
        await activate(method, [{ productId: first }, { productId: second }]);
        const orderId = await createPo(
          [
            { productId: first, quantity: 3, unitPrice: 1.01 },
            { productId: second, quantity: 2, unitPrice: 2.03 },
          ],
          0.01,
        );
        await receive(orderId).expect(200);
        const [occurrence] = await ds.query(
          `SELECT id, "postedAmount"::text AS amount FROM stock_occurrences WHERE "documentId" = $1 AND kind = 'receipt'`,
          [orderId],
        );
        const entries = await ds.query(
          `SELECT e.id, e."productId", e.value::text AS value FROM stock_valuation_entries e JOIN stock_movements m ON m.id = e."movementId" WHERE m."referenceId" = $1 AND e.kind = 'receipt' ORDER BY m."productSequence"`,
          [orderId],
        );
        const batches = await ds.query(
          `SELECT "productId", "receivedQuantity"::text AS quantity, "landedCost"::text AS landed FROM purchase_cost_history WHERE "purchaseOrderId" = $1 ORDER BY "createdAt", id`,
          [orderId],
        );
        const postedCents = toMinorUnits(occurrence.amount) / 100n;
        const expected = allocateCentsByWeight(
          postedCents,
          batches.map(
            (batch: any) =>
              toMinorUnits(batch.quantity) * toMinorUnits(batch.landed),
          ),
        )
          .map((value) => (value * 100n).toString())
          .sort();
        expect(
          entries
            .map((entry: any) => toMinorUnits(entry.value).toString())
            .sort(),
        ).toEqual(expected);
        expect(
          entries.reduce(
            (sum: bigint, entry: any) => sum + toMinorUnits(entry.value) / 100n,
            0n,
          ),
        ).toBe(postedCents);
        if (method === "FIFO") {
          const layerCount = await ds.query(
            `SELECT count(*)::int AS count FROM inventory_cost_layers WHERE "sourceEntryId" = ANY($1)`,
            [entries.map((entry: any) => entry.id)],
          );
          expect(layerCount[0].count).toBe(2);
        }
      });
    },
  );

  it("rejects return after a later batch decrease and leaves records unchanged", async () => {
    const productId = await newProduct();
    await activate("AVERAGE", [{ productId }]);
    const orderId = await createPo([{ productId, quantity: 5, unitPrice: 10 }]);
    await receive(orderId).expect(200);
    await ds.query(
      `UPDATE purchase_cost_history SET "remainingQuantity" = 4 WHERE "purchaseOrderId" = $1`,
      [orderId],
    );
    const before = await ds.query(
      `SELECT count(*)::int AS count FROM stock_valuation_entries`,
    );
    await returnGoods(orderId)
      .expect(409)
      .expect(({ body }) =>
        expect(body.message).toContain("stock received on this order"),
      );
    const after = await ds.query(
      `SELECT count(*)::int AS count FROM stock_valuation_entries`,
    );
    expect(after[0].count).toBe(before[0].count);
  });

  it("refuses a receipt made before activation with the approved-opening message", async () => {
    const productId = await newProduct();
    const orderId = await createPo([{ productId, quantity: 5, unitPrice: 10 }]);
    await receive(orderId).expect(200);
    await activate("AVERAGE", [{ productId, quantity: "5", value: "50.00" }]);
    await returnGoods(orderId)
      .expect(409)
      .expect(({ body }) =>
        expect(body.message).toBe(
          "This receipt predates inventory valuation; its value is part of the approved opening position. Use a stock correction.",
        ),
      );
  });

  describe.each(["AVERAGE", "FIFO"] as CostingMethod[])(
    "%s method-change refusal",
    (method) => {
      it("refuses return when the receipt predates a costing method change", async () => {
        const productId = await newProduct();
        await activate(method, [{ productId }]);
        const orderId = await createPo([
          { productId, quantity: 5, unitPrice: 10 },
        ]);
        await receive(orderId).expect(200);
        const [receiptMovement] = await ds.query(
          `SELECT id FROM stock_movements WHERE "referenceId" = $1 AND "movementType" = 'purchase_receipt'`,
          [orderId],
        );
        const [entry] = await ds.query(
          `SELECT id FROM stock_valuation_entries WHERE "movementId" = $1`,
          [receiptMovement.id],
        );
        await ds.query(
          `INSERT INTO stock_valuation_entries ("productId", kind, method, quantity, value, "runningQuantity", "runningValue", "createdAt") VALUES ($1, 'method_change', $2, 0, 0, 5, 50, now() + interval '1 day')`,
          [productId, method === "AVERAGE" ? "FIFO" : "AVERAGE"],
        );
        await returnGoods(orderId)
          .expect(409)
          .expect(({ body }) =>
            expect(body.message).toContain(
              "This receipt was valued before the costing method changed",
            ),
          );
        const [count] = await ds.query(
          `SELECT count(*)::int AS count FROM stock_valuation_entries WHERE "productId" = $1`,
          [productId],
        );
        expect(count.count).toBe(3);
        expect(entry.id).toBeTruthy();
      });
    },
  );

  it("protects a pre-activation purchase receipt entry after valuation is activated", async () => {
    const productId = await newProduct();
    const orderId = await createPo([
      { productId, quantity: 1, unitPrice: 100 },
    ]);
    await receive(orderId).expect(200);
    const [movement] = await ds.query(
      `SELECT id FROM stock_movements WHERE "referenceId"=$1 AND "movementType"='purchase_receipt'`,
      [orderId],
    );
    const [entry] = await ds.query(
      `SELECT id FROM journal_entry WHERE "sourceDocumentId"=$1 AND "postingType"='PURCHASE_RECEIVE'`,
      [orderId],
    );
    await activate("AVERAGE", [
      { productId, quantity: "1.0000", value: "100.00" },
    ]);
    const [accounts] = await ds.query(
      `SELECT "inventoryAccountId","cashAccountId","openingBalanceEquityAccountId" FROM accounting_settings WHERE id=true`,
    );
    const originalLines = await ds.query(
      `SELECT id,"accountId",debit::text AS debit,credit::text AS credit,"deletedAt","isActive" FROM journal_entry_line WHERE "entryId"=$1 ORDER BY id`,
      [entry.id],
    );
    const inventoryLine = originalLines.find(
      (line: any) => line.accountId === accounts.inventoryAccountId,
    );
    expect(inventoryLine).toBeDefined();
    await expect(
      ds.query(`UPDATE journal_entry_line SET "accountId"=$2 WHERE id=$1`, [
        inventoryLine.id,
        accounts.cashAccountId,
      ]),
    ).rejects.toThrow(/protected inventory posting/i);
    await expect(
      ds.query(`UPDATE journal_entry_line SET debit=debit+1 WHERE id=$1`, [
        inventoryLine.id,
      ]),
    ).rejects.toThrow(/protected inventory posting/i);
    await expect(
      ds.query(`UPDATE journal_entry_line SET "deletedAt"=now() WHERE id=$1`, [
        inventoryLine.id,
      ]),
    ).rejects.toThrow(/protected inventory posting/i);
    await expect(
      ds.query(`UPDATE journal_entry_line SET "isActive"=false WHERE id=$1`, [
        inventoryLine.id,
      ]),
    ).rejects.toThrow(/protected inventory posting/i);
    await expect(
      ds.query(`UPDATE journal_entry SET "deletedAt"=now() WHERE id=$1`, [
        entry.id,
      ]),
    ).rejects.toThrow(/protected inventory posting/i);
    await expect(
      ds.query(`UPDATE journal_entry SET "isActive"=false WHERE id=$1`, [
        entry.id,
      ]),
    ).rejects.toThrow(/protected inventory posting/i);
    await expect(
      ds.query(`UPDATE journal_entry SET "isActive"=false WHERE id=$1`, [
        entry.id,
      ]),
    ).rejects.toThrow(/protected inventory posting/i);

    const appendedPairError = await ds.transaction(async (manager) => {
      await manager.query("SAVEPOINT append_pair");
      let message = "";
      try {
        await manager.query(
          `INSERT INTO journal_entry_line ("entryId","accountId",debit,credit) VALUES ($1,$2,1,0),($1,$3,0,1)`,
          [
            entry.id,
            accounts.cashAccountId,
            accounts.openingBalanceEquityAccountId,
          ],
        );
      } catch (error: any) {
        message = error.message;
      }
      await manager.query("ROLLBACK TO SAVEPOINT append_pair");
      await manager.query("RELEASE SAVEPOINT append_pair");
      return message;
    });
    expect(appendedPairError).toMatch(/finalized/i);
    const afterLines = await ds.query(
      `SELECT id,"accountId",debit::text AS debit,credit::text AS credit,"deletedAt","isActive" FROM journal_entry_line WHERE "entryId"=$1 ORDER BY id`,
      [entry.id],
    );
    expect(afterLines).toEqual(originalLines);
    expect(movement.id).toBeTruthy();
  });
});
