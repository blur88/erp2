import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { DataSource } from "typeorm";
import { CostingMethod } from "../src/common/costing/supported-costing-methods";
import { AppModule } from "../src/app.module";
import {
  seedCategory,
  seedDocumentNumberSettings,
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

const USERNAME = E2E_ADMIN_USERNAMES.stockUnreceive;
const RUN = `${process.pid}-${Date.now().toString(36)}`;

describe("Stock adjustment valuation", () => {
  let app: INestApplication;
  let ds: DataSource;
  let token: string;
  let categoryId: string;
  const products: string[] = [];
  const adjustments: string[] = [];
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureTestAppValidation(app);
    await app.init();
    ds = app.get(DataSource);
    await seedSuiteAdmin(ds, USERNAME);
    categoryId = (await seedCategory(ds, `valuation-adjustment-${RUN}`)).id;
    await seedDocumentNumberSettings(ds);
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .set(...SESSION_PROTOCOL)
      .send({ usernameOrEmail: USERNAME, password: E2E_ADMIN_PASSWORD })
      .expect(200);
    token = login.body?.data?.accessToken ?? login.body?.accessToken;
  });

  afterEach(async () => {
    if (ds?.isInitialized) await deactivateValuationForTest(ds);
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      const zero = "00000000-0000-0000-0000-000000000000";
      const rows = await ds.query(
        `SELECT id FROM stock_movements WHERE "referenceType" = 'stock_adjustment' AND "referenceId" = ANY($1)`,
        [adjustments.length ? adjustments : [zero]],
      );
      const journalIds = await ds.query(
        `SELECT id FROM journal_entry WHERE "sourceDocumentId" = ANY($1)`,
        [adjustments.length ? adjustments : [zero]],
      );
      await ds.query(`DELETE FROM journal_entry WHERE id = ANY($1)`, [
        journalIds.map((row: any) => row.id),
      ]);
      await removeSuiteTraces(ds, {
        usernames: [USERNAME],
        entityIds: [
          categoryId,
          ...products,
          ...adjustments,
          ...rows.map((row: any) => row.id),
        ].filter(Boolean),
      });
      await resetSuiteBusinessRows(ds, {
        categoryIds: [categoryId],
        productIds: products,
        stockAdjustmentIds: adjustments,
      });
      await removeSuiteAdmin(ds, USERNAME);
    }
    await app.close();
  });

  it("uses the average inventory cost for found stock and requires an explanation for overrides", async () => {
    const product = await seedProduct(ds, categoryId, {
      stockQuantity: 10,
      baseCost: 10,
      name: `Valuation Found Stock ${RUN}`,
    });
    products.push(product.id);
    await ds.query(
      `INSERT INTO purchase_cost_history ("productId","unitCost","shippingPerUnit","landedCost","receivedQuantity","remainingQuantity","receivedDate") VALUES ($1,100,0,100,10,10,'2025-01-01')`,
      [product.id],
    );
    await activateValuationForTest(ds, {
      method: "AVERAGE",
      products: [{ productId: product.id, quantity: "10", value: "1000.00" }],
    });
    const created = await request(app.getHttpServer())
      .post("/inventory/stock-adjustments")
      .set(auth())
      .send({
        adjustmentDate: "2026-10-21",
        items: [{ productId: product.id, oldQuantity: 10, difference: 5 }],
      })
      .expect(201);
    const adjustment = created.body.data ?? created.body;
    adjustments.push(adjustment.id);
    await request(app.getHttpServer())
      .post(`/inventory/stock-adjustments/${adjustment.id}/complete`)
      .set(auth())
      .expect(201);
    const [line] = await ds.query(
      `SELECT "defaultUnitCost"::text AS "defaultCost", "unitCost"::text AS unit, "totalValue"::text AS value FROM stock_adjustment_items WHERE "stockAdjustmentId" = $1`,
      [adjustment.id],
    );
    expect(line).toEqual({
      defaultCost: "100.0000",
      unit: "100.0000",
      value: "500.0000",
    });

    const rejected = await request(app.getHttpServer())
      .post("/inventory/stock-adjustments")
      .set(auth())
      .send({
        adjustmentDate: "2026-10-21",
        items: [
          {
            productId: product.id,
            oldQuantity: 15,
            difference: 2,
            unitCost: 120,
          },
        ],
      })
      .expect(201);
    const second = rejected.body.data ?? rejected.body;
    adjustments.push(second.id);
    await request(app.getHttpServer())
      .post(`/inventory/stock-adjustments/${second.id}/complete`)
      .set(auth())
      .expect(400)
      .expect(({ body }) =>
        expect(body.message).toContain(
          "a cost different from the inventory cost (100.0000) needs an explanation.",
        ),
      );
  });

  it("uses valuation cost when the request marks a sent unit cost as not provided", async () => {
    const product = await seedProduct(ds, categoryId, {
      stockQuantity: 10,
      baseCost: 10,
      name: `Valuation Explicit Default ${RUN}`,
    });
    products.push(product.id);
    await ds.query(
      `INSERT INTO purchase_cost_history ("productId","unitCost","shippingPerUnit","landedCost","receivedQuantity","remainingQuantity","receivedDate") VALUES ($1,100,0,100,10,10,'2025-01-01')`,
      [product.id],
    );
    await activateValuationForTest(ds, {
      method: "AVERAGE",
      products: [{ productId: product.id, quantity: "10", value: "1000.00" }],
    });
    const created = await request(app.getHttpServer())
      .post("/inventory/stock-adjustments")
      .set(auth())
      .send({
        adjustmentDate: "2026-10-21",
        items: [{ productId: product.id, oldQuantity: 10, difference: 1, unitCost: 0, unitCostProvided: false }],
      })
      .expect(201);
    const adjustment = created.body.data ?? created.body;
    adjustments.push(adjustment.id);
    await request(app.getHttpServer())
      .post(`/inventory/stock-adjustments/${adjustment.id}/complete`)
      .set(auth())
      .expect(201);
    const [line] = await ds.query(
      `SELECT "unitCost"::text AS unit, "totalValue"::text AS value FROM stock_adjustment_items WHERE "stockAdjustmentId" = $1`,
      [adjustment.id],
    );
    expect(line).toEqual({ unit: "100.0000", value: "100.0000" });
  });

  it("requires evidence for found stock when inventory has no reliable cost", async () => {
    const product = await seedProduct(ds, categoryId, {
      stockQuantity: 10,
      baseCost: 10,
      name: `Valuation Zero Stock ${RUN}`,
    });
    products.push(product.id);
    await activateValuationForTest(ds, {
      method: "AVERAGE",
      products: [{ productId: product.id, quantity: "10", value: "0.00" }],
    });
    const created = await request(app.getHttpServer())
      .post("/inventory/stock-adjustments")
      .set(auth())
      .send({
        adjustmentDate: "2026-10-21",
        items: [{ productId: product.id, oldQuantity: 10, difference: 5 }],
      })
      .expect(201);
    const adjustment = created.body.data ?? created.body;
    adjustments.push(adjustment.id);
    await request(app.getHttpServer())
      .post(`/inventory/stock-adjustments/${adjustment.id}/complete`)
      .set(auth())
      .expect(400)
      .expect(({ body }) =>
        expect(body.message).toContain(
          "has no reliable inventory cost; enter a unit cost and an explanation.",
        ),
      );
  });

  it("reverses an active FIFO decrease with the exact consumed value", async () => {
    const product = await seedProduct(ds, categoryId, {
      stockQuantity: 10,
      baseCost: 10,
      name: `Valuation FIFO Adjustment ${RUN}`,
    });
    products.push(product.id);
    await ds.query(
      `INSERT INTO purchase_cost_history ("productId", "unitCost", "shippingPerUnit", "landedCost", "receivedQuantity", "remainingQuantity", "receivedDate") VALUES ($1, 100, 0, 100, 10, 10, '2025-01-01')`,
      [product.id],
    );
    await activateValuationForTest(ds, {
      method: "FIFO",
      products: [{ productId: product.id, quantity: "10", value: "1000.00" }],
    });
    const created = await request(app.getHttpServer())
      .post("/inventory/stock-adjustments")
      .set(auth())
      .send({
        adjustmentDate: "2026-10-21",
        items: [{ productId: product.id, oldQuantity: 10, difference: -2 }],
      })
      .expect(201);
    const adjustment = created.body.data ?? created.body;
    adjustments.push(adjustment.id);
    await request(app.getHttpServer())
      .post(`/inventory/stock-adjustments/${adjustment.id}/complete`)
      .set(auth())
      .expect(201);
    await request(app.getHttpServer())
      .post(`/inventory/stock-adjustments/${adjustment.id}/revert`)
      .set(auth())
      .expect(201);
    const entries = await ds.query(
      `SELECT kind, value::text AS value, "runningQuantity"::text AS quantity, "runningValue"::text AS balance FROM stock_valuation_entries WHERE "productId" = $1 ORDER BY "createdAt", id`,
      [product.id],
    );
    expect(
      entries.map((entry: any) => [
        entry.kind,
        entry.value,
        entry.quantity,
        entry.balance,
      ]),
    ).toEqual([
      ["cutover_opening", "1000.00", "10.0000", "1000.00"],
      ["issue", "-200.00", "8.0000", "800.00"],
      ["decrease_reversal", "200.00", "10.0000", "1000.00"],
    ]);
  });

  it("values a decrease from the inventory pool instead of the draft estimate", async () => {
    const product = await seedProduct(ds, categoryId, {
      stockQuantity: 10,
      baseCost: 10,
      name: `Valuation Adjustment ${RUN}`,
    });
    products.push(product.id);
    await ds.query(
      `INSERT INTO purchase_cost_history ("productId", "unitCost", "shippingPerUnit", "landedCost", "receivedQuantity", "remainingQuantity", "receivedDate") VALUES ($1, 100, 0, 100, 10, 10, '2025-01-01')`,
      [product.id],
    );
    await activateValuationForTest(ds, {
      method: "AVERAGE",
      products: [{ productId: product.id, quantity: "10", value: "1000.00" }],
    });
    const created = await request(app.getHttpServer())
      .post("/inventory/stock-adjustments")
      .set(auth())
      .send({
        adjustmentDate: "2026-10-21",
        items: [
          {
            productId: product.id,
            oldQuantity: 10,
            difference: -2,
            unitCost: 999,
          },
        ],
      })
      .expect(201);
    const adjustment = created.body.data ?? created.body;
    adjustments.push(adjustment.id);
    await request(app.getHttpServer())
      .post(`/inventory/stock-adjustments/${adjustment.id}/complete`)
      .set(auth())
      .expect(201);
    const [entry] = await ds.query(
      `SELECT e.value::text AS value, e."runningQuantity"::text AS quantity, e."runningValue"::text AS balance FROM stock_valuation_entries e JOIN stock_movements m ON m.id = e."movementId" WHERE m."referenceId" = $1`,
      [adjustment.id],
    );
    expect(entry).toEqual({
      value: "-200.00",
      quantity: "8.0000",
      balance: "800.00",
    });
    const [line] = await ds.query(
      `SELECT "totalValue"::text AS value, "unitCost"::text AS unit FROM stock_adjustment_items WHERE "stockAdjustmentId" = $1`,
      [adjustment.id],
    );
    expect(line).toEqual({ value: "200.0000", unit: "100.0000" });
  });

  it.each(["AVERAGE", "FIFO"] as CostingMethod[])(
    "processes sequential same-product decrease lines against the updated pool (%s)",
    async (method) => {
      const product = await seedProduct(ds, categoryId, {
        stockQuantity: 10,
        baseCost: 10,
        name: `Valuation Repeated Decrease ${method} ${RUN}`,
      });
      products.push(product.id);
      await ds.query(
        `INSERT INTO purchase_cost_history ("productId","unitCost","shippingPerUnit","landedCost","receivedQuantity","remainingQuantity","receivedDate") VALUES ($1,100,0,100,10,10,'2025-01-01')`,
        [product.id],
      );
      await activateValuationForTest(ds, {
        method,
        products: [{ productId: product.id, quantity: "10", value: "1000.00" }],
      });
      const response = await request(app.getHttpServer())
        .post("/inventory/stock-adjustments")
        .set(auth())
        .send({
          adjustmentDate: "2026-10-21",
          items: [
            { productId: product.id, oldQuantity: 10, difference: -1 },
            { productId: product.id, oldQuantity: 9, difference: -1 },
          ],
        })
        .expect(201);
      const adjustment = response.body.data ?? response.body;
      adjustments.push(adjustment.id);
      await request(app.getHttpServer())
        .post(`/inventory/stock-adjustments/${adjustment.id}/complete`)
        .set(auth())
        .expect(201);
      const [balance] = await ds.query(
        `SELECT "quantityOnHand"::text AS quantity,"valueOnHand"::text AS value FROM product_valuation_balances WHERE "productId"=$1`,
        [product.id],
      );
      const entries = await ds.query(
        `SELECT value::text AS value,"runningQuantity"::text AS quantity,"runningValue"::text AS balance FROM stock_valuation_entries WHERE "productId"=$1 AND kind='issue' ORDER BY "createdAt",id`,
        [product.id],
      );
      expect(balance).toEqual({ quantity: "8.0000", value: "800.00" });
      expect(
        entries
          .map((entry: any) => [entry.value, entry.quantity, entry.balance])
          .sort((a: any[], b: any[]) => Number(a[1]) - Number(b[1])),
      ).toEqual([
        ["-100.00", "8.0000", "800.00"],
        ["-100.00", "9.0000", "900.00"],
      ]);
    },
  );

  it.each(["AVERAGE", "FIFO"] as CostingMethod[])(
    "posts mixed adjustment gross inventory debits and credits without netting them (%s)",
    async (method) => {
      const increase = await seedProduct(ds, categoryId, {
        stockQuantity: 10,
        baseCost: 10,
        name: `Valuation Mixed Increase ${method} ${RUN}`,
      });
      const decrease = await seedProduct(ds, categoryId, {
        stockQuantity: 10,
        baseCost: 10,
        name: `Valuation Mixed Decrease ${method} ${RUN}`,
      });
      products.push(increase.id, decrease.id);
      await ds.query(
        `INSERT INTO purchase_cost_history ("productId","unitCost","shippingPerUnit","landedCost","receivedQuantity","remainingQuantity","receivedDate") VALUES ($1,100,0,100,10,10,'2025-01-01')`,
        [decrease.id],
      );
      await activateValuationForTest(ds, {
        method,
        products: [
          { productId: increase.id, quantity: "10", value: "1000.00" },
          { productId: decrease.id, quantity: "10", value: "1000.00" },
        ],
      });
      const response = await request(app.getHttpServer())
        .post("/inventory/stock-adjustments")
        .set(auth())
        .send({
          adjustmentDate: "2026-10-21",
          items: [
            { productId: increase.id, oldQuantity: 10, difference: 1 },
            { productId: decrease.id, oldQuantity: 10, difference: -1 },
          ],
        })
        .expect(201);
      const adjustment = response.body.data ?? response.body;
      adjustments.push(adjustment.id);
      await request(app.getHttpServer())
        .post(`/inventory/stock-adjustments/${adjustment.id}/complete`)
        .set(auth())
        .expect(201);
      const [entry] = await ds.query(
        `SELECT id FROM journal_entry WHERE "sourceDocumentId"=$1 AND "postingType"='STOCK_ADJUSTMENT'`,
        [adjustment.id],
      );
      const [accounts] = await ds.query(
        `SELECT "inventoryAccountId" FROM accounting_settings WHERE id=true`,
      );
      const [gross] = await ds.query(
        `SELECT COALESCE(SUM(debit),0)::numeric(15,2)::text AS debit,COALESCE(SUM(credit),0)::numeric(15,2)::text AS credit FROM journal_entry_line WHERE "entryId"=$1 AND "accountId"=$2`,
        [entry.id, accounts.inventoryAccountId],
      );
      expect(gross).toEqual({ debit: "100.00", credit: "100.00" });
    },
  );
});
