import { INestApplication } from "@nestjs/common";
import { randomUUID } from "crypto";
import request from "supertest";
import { Test } from "@nestjs/testing";
import { DataSource } from "typeorm";
import { AppModule } from "../src/app.module";
import { BaseCostCalculatorService } from "../src/modules/inventory/services/base-cost-calculator.service";
import { CostingMethod } from "../src/common/costing/supported-costing-methods";
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
import { UNFULFILL_VALUATION_GAP } from "../src/modules/inventory/stock-undo-unavailable";

const USERNAME = E2E_ADMIN_USERNAMES.stockUnfulfil;
const RUN = `${process.pid}-${Date.now().toString(36)}`;

describe("Sales valuation under active inventory valuation", () => {
  let app: INestApplication;
  let ds: DataSource;
  let token: string;
  let categoryId: string;
  let customerId: string;
  let supplierId: string;
  let paymentMethodId: string;
  const productIds: string[] = [];
  const orderIds: string[] = [];
  const purchaseOrderIds: string[] = [];
  const adjustmentIds: string[] = [];
  const auth = () => ({ Authorization: `Bearer ${token}` });

  async function createProductAndBatches() {
    const product = await seedProduct(ds, categoryId, {
      stockQuantity: 10,
      baseCost: 100,
    });
    productIds.push(product.id);
    await ds.query(
      `INSERT INTO purchase_cost_history ("productId", "unitCost", "shippingPerUnit", "landedCost", "receivedQuantity", "remainingQuantity", "receivedDate")
       VALUES ($1, 50, 0, 50, 6, 6, '2025-01-01'), ($1, 150, 0, 150, 4, 4, '2025-02-01')`,
      [product.id],
    );
    return product.id;
  }

  async function createOrder(
    items: Array<{ productId: string; quantity: number }>,
  ) {
    const res = await request(app.getHttpServer())
      .post("/sales-orders")
      .set(auth())
      .send({
        customerId,
        items: items.map((item) => ({ ...item, unitPrice: 200 })),
      })
      .expect(201);
    const order = res.body.data ?? res.body;
    orderIds.push(order.id);
    await request(app.getHttpServer())
      .post(`/sales-orders/${order.id}/payments`)
      .set(auth())
      .send({
        customerId,
        salesOrderId: order.id,
        paymentMethodId,
        amount: formatMoney(toMinorUnits(String(order.totalAmount))),
        paymentDate: "2026-09-10",
      })
      .expect(200);
    return order;
  }

  async function fulfill(orderId: string) {
    await request(app.getHttpServer())
      .post(`/sales-orders/${orderId}/fulfill`)
      .set(auth())
      .expect(201);
  }

  function unfulfill(orderId: string) {
    return request(app.getHttpServer())
      .post(`/sales-orders/${orderId}/unfulfill`)
      .set(auth())
      .send({ reason: "Valuation e2e return" });
  }

  async function valuationEntries(orderId: string) {
    return ds.query(
      `SELECT e.kind, e.value::text AS value, e."runningQuantity"::text AS quantity, e."runningValue"::text AS running, m.id AS "movementId"
         FROM stock_valuation_entries e JOIN stock_movements m ON m.id = e."movementId"
        WHERE m."referenceId" = $1 ORDER BY m."productSequence", m.id`,
      [orderId],
    );
  }

  async function seedActive(
    productId: string,
    method: CostingMethod,
    quantity = "10",
    value = "1000.00",
  ) {
    const layers =
      method === "FIFO"
        ? [
            { quantity: "6", value: "300.00" },
            { quantity: "4", value: "600.00" },
          ]
        : undefined;
    await activateValuationForTest(ds, {
      method,
      products: [{ productId, quantity, value, layers }],
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
    categoryId = (await seedCategory(ds, `valuation-sales-${RUN}`)).id;
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
    const customer = await request(app.getHttpServer())
      .post("/customers")
      .set(auth())
      .send({ type: "business", name: `Valuation Customer ${RUN}` })
      .expect(201);
    customerId = (customer.body.data ?? customer.body).id;
  });

  afterEach(async () => {
    if (ds?.isInitialized) await deactivateValuationForTest(ds);
  });

  afterAll(async () => {
    if (ds?.isInitialized) {
      const ids = [...orderIds, ...purchaseOrderIds, ...adjustmentIds];
      const or = ids.length ? ids : ["00000000-0000-0000-0000-000000000000"];
      const occurrences: Array<{ id: string }> = await ds.query(
        `SELECT id FROM stock_occurrences WHERE "documentId" = ANY($1)`,
        [or],
      );
      const occurrenceIds = occurrences.map((row) => row.id);
      const zero = ["00000000-0000-0000-0000-000000000000"];
      await ds.query(
        `DELETE FROM journal_entry WHERE "sourceDocumentId" = ANY($1) OR "sourceEventId" = ANY($2)`,
        [or, occurrenceIds.length ? occurrenceIds : zero],
      );
      await removeSuiteTraces(ds, {
        usernames: [USERNAME],
        entityIds: [
          categoryId,
          customerId,
          supplierId,
          ...productIds,
          ...ids,
          ...occurrenceIds,
        ].filter(Boolean),
      });
      await resetSuiteBusinessRows(ds, {
        categoryIds: [categoryId],
        customerIds: [customerId],
        supplierIds: [supplierId],
        productIds,
        stockAdjustmentIds: adjustmentIds,
      });
      await ds.query(
        `DELETE FROM document_number_settings WHERE "documentName" = 'Goods Received'`,
      );
      await removeSuiteAdmin(ds, USERNAME);
    }
    await app.close();
  });

  describe.each(["AVERAGE", "FIFO"] as CostingMethod[])(
    "%s valuation",
    (method) => {
      it("uses valuation cost while consuming the oldest physical batch", async () => {
        const productId = await createProductAndBatches();
        await seedActive(
          productId,
          method,
          "10",
          method === "FIFO" ? "900.00" : "1000.00",
        );
        const order = await createOrder([{ productId, quantity: 5 }]);
        await fulfill(order.id);
        const entries = await valuationEntries(order.id);
        expect(entries).toHaveLength(1);
        expect(entries[0].value).toBe(
          method === "FIFO" ? "-250.00" : "-500.00",
        );
        expect(entries[0].running).toBe(
          method === "FIFO" ? "650.00" : "500.00",
        );
        const [oldest, newer] = await ds.query(
          `SELECT "remainingQuantity"::text AS remaining FROM purchase_cost_history WHERE "productId" = $1 ORDER BY "receivedDate", id`,
          [productId],
        );
        expect(oldest.remaining).toBe("1.0000");
        expect(newer.remaining).toBe("4.0000");
      });

      it("sees repeated product lines sequentially and restores them on unfulfil", async () => {
        const productId = await createProductAndBatches();
        await seedActive(
          productId,
          method,
          "10",
          method === "FIFO" ? "900.00" : "1000.00",
        );
        const order = await createOrder([
          { productId, quantity: 3 },
          { productId, quantity: 2 },
        ]);
        await fulfill(order.id);
        const entries = await valuationEntries(order.id);
        expect(entries.map((entry: any) => entry.value)).toEqual(
          method === "FIFO" ? ["-150.00", "-100.00"] : ["-300.00", "-200.00"],
        );
        const batchDraws = await ds.query(
          `SELECT c.quantity::text AS quantity, c."batchId" FROM stock_batch_consumptions c
           JOIN stock_movements m ON m.id = c."movementId"
          WHERE m."referenceId" = $1 ORDER BY m."productSequence"`,
          [order.id],
        );
        expect(batchDraws.map((row: any) => row.quantity)).toEqual([
          "3.0000",
          "2.0000",
        ]);
        await unfulfill(order.id).expect(201);
        const [balance] = await ds.query(
          `SELECT "quantityOnHand"::text AS quantity, "valueOnHand"::text AS value FROM product_valuation_balances WHERE "productId" = $1`,
          [productId],
        );
        expect(balance).toEqual({
          quantity: "10.0000",
          value: method === "FIFO" ? "900.00" : "1000.00",
        });
        const [oldest, newer] = await ds.query(
          `SELECT "remainingQuantity"::text AS remaining FROM purchase_cost_history WHERE "productId" = $1 ORDER BY "receivedDate", id`,
          [productId],
        );
        expect(oldest.remaining).toBe("6.0000");
        expect(newer.remaining).toBe("4.0000");
      });

      it("depletes the final unit without leaving a value residue", async () => {
        const productId = await createProductAndBatches();
        await seedActive(
          productId,
          method,
          "10",
          method === "FIFO" ? "900.00" : "1000.00",
        );
        const order = await createOrder([{ productId, quantity: 10 }]);
        await fulfill(order.id);
        const [balance] = await ds.query(
          `SELECT "quantityOnHand"::text AS quantity, "valueOnHand"::text AS value FROM product_valuation_balances WHERE "productId" = $1`,
          [productId],
        );
        expect(balance).toEqual({ quantity: "0.0000", value: "0.00" });
      });
    },
  );

  it("unfulfils a pre-activation fulfilment at its posted COGS", async () => {
    const productId = await createProductAndBatches();
    await ds.query(
      `UPDATE purchase_cost_history SET "unitCost" = 100, "landedCost" = 100 WHERE "productId" = $1`,
      [productId],
    );
    const order = await createOrder([{ productId, quantity: 5 }]);
    await fulfill(order.id);
    await seedActive(productId, "AVERAGE", "5", "500.00");
    await unfulfill(order.id).expect(201);
    const [balance] = await ds.query(
      `SELECT "quantityOnHand"::text AS quantity, "valueOnHand"::text AS value FROM product_valuation_balances WHERE "productId" = $1`,
      [productId],
    );
    expect(balance).toEqual({ quantity: "10.0000", value: "1000.00" });
    const entries = await valuationEntries(order.id);
    expect(
      entries.some(
        (entry: any) =>
          entry.kind === "decrease_reversal" && entry.value === "500.00",
      ),
    ).toBe(true);
  });

  it("keeps inactive fulfilment COGS equal to the legacy batch-consumption plan", async () => {
    await deactivateValuationForTest(ds);
    const productId = await createProductAndBatches();
    const order = await createOrder([{ productId, quantity: 5 }]);
    const calculator = app.get(BaseCostCalculatorService);
    const [plan] = await ds.transaction((manager) =>
      calculator.planConsumption(manager, [{ productId, quantity: 5 }]),
    );
    const expectedCents = (plan.totalScale8 + 5000n) / 10000n;

    await fulfill(order.id);

    const [accounts] = await ds.query(
      `SELECT "inventoryAccountId" FROM accounting_settings WHERE id=true`,
    );
    const [posted] = await ds.query(
      `SELECT COALESCE(SUM(credit),0)::numeric(15,2)::text AS amount FROM journal_entry_line l
       JOIN journal_entry e ON e.id=l."entryId"
       WHERE e."sourceDocumentId"=$1 AND e."postingType"='SALES_FULFILLMENT_COGS' AND l."accountId"=$2`,
      [order.id, accounts.inventoryAccountId],
    );
    expect(posted.amount).toBe(formatMoney(expectedCents));
    const [valuationRows] = await ds.query(
      `SELECT count(*)::int AS n FROM stock_valuation_entries WHERE "productId"=$1`,
      [productId],
    );
    expect(valuationRows.n).toBe(0);
  });

  it("refuses to unfulfil an occurrence with an unvalued stock gap after activation", async () => {
    const product = await seedProduct(ds, categoryId, {
      stockQuantity: 5,
      baseCost: 10,
    });
    productIds.push(product.id);
    await ds.query(
      `INSERT INTO purchase_cost_history ("productId", "unitCost", "shippingPerUnit", "landedCost", "receivedQuantity", "remainingQuantity", "receivedDate") VALUES ($1, 10, 0, 10, 3, 3, '2025-01-01')`,
      [product.id],
    );
    const order = await createOrder([{ productId: product.id, quantity: 5 }]);
    await fulfill(order.id);
    await seedActive(product.id, "AVERAGE", "0", "0");
    await unfulfill(order.id)
      .expect(409)
      .expect(({ body }) => expect(body.message).toBe(UNFULFILL_VALUATION_GAP));
  });

  it("serializes a concurrent fulfilment and stock decrease against one valuation balance", async () => {
    const productId = await createProductAndBatches();
    await seedActive(productId, "AVERAGE", "10", "1000.00");
    const order = await createOrder([{ productId, quantity: 3 }]);
    const adjustmentResponse = await request(app.getHttpServer())
      .post("/inventory/stock-adjustments")
      .set(auth())
      .send({
        adjustmentDate: "2026-10-22",
        items: [{ productId, oldQuantity: 10, difference: -2 }],
      })
      .expect(201);
    const adjustment = adjustmentResponse.body.data ?? adjustmentResponse.body;
    adjustmentIds.push(adjustment.id);

    await Promise.all([
      fulfill(order.id),
      request(app.getHttpServer())
        .post(`/inventory/stock-adjustments/${adjustment.id}/complete`)
        .set(auth())
        .expect(201),
    ]);

    const [balance] = await ds.query(
      `SELECT "quantityOnHand"::text AS quantity,"valueOnHand"::text AS value FROM product_valuation_balances WHERE "productId"=$1`,
      [productId],
    );
    expect(balance).toEqual({ quantity: "5.0000", value: "500.00" });
    const entries = await ds.query(
      `SELECT kind,value::text AS value FROM stock_valuation_entries WHERE "productId"=$1 AND kind IN ('issue','adjustment_decrease') ORDER BY kind`,
      [productId],
    );
    expect(entries.map((entry: any) => entry.value).sort()).toEqual([
      "-200.00",
      "-300.00",
    ]);
    expect(
      entries.reduce((sum: number, entry: any) => sum + Number(entry.value), 0),
    ).toBe(-500);
  });

  it.each(["AVERAGE", "FIFO"] as CostingMethod[])(
    "refuses a mixed adjustment revert atomically after its found stock is sold (%s)",
    async (method) => {
      const foundId = await createProductAndBatches();
      const decreasedId = await createProductAndBatches();
      await activateValuationForTest(ds, {
        method,
        products: [
          { productId: foundId, quantity: "10", value: "1000.00" },
          { productId: decreasedId, quantity: "10", value: "1000.00" },
        ],
      });
      const created = await request(app.getHttpServer())
        .post("/inventory/stock-adjustments")
        .set(auth())
        .send({
          adjustmentDate: "2026-10-22",
          items: [
            { productId: foundId, oldQuantity: 10, difference: 1 },
            { productId: decreasedId, oldQuantity: 10, difference: -1 },
          ],
        })
        .expect(201);
      const adjustment = created.body.data ?? created.body;
      adjustmentIds.push(adjustment.id);
      await request(app.getHttpServer())
        .post(`/inventory/stock-adjustments/${adjustment.id}/complete`)
        .set(auth())
        .expect(201);
      const sale = await createOrder([{ productId: foundId, quantity: 1 }]);
      await fulfill(sale.id);
      const beforeEntries = await ds.query(
        `SELECT kind,value::text AS value FROM stock_valuation_entries WHERE "productId"=ANY($1) ORDER BY "productId","createdAt",id`,
        [[foundId, decreasedId]],
      );
      const beforeProducts = await ds.query(
        `SELECT id,"stockQuantity"::text AS quantity FROM products WHERE id=ANY($1) ORDER BY id`,
        [[foundId, decreasedId]],
      );
      const beforeMovements = await ds.query(
        `SELECT id,"productId","movementType",quantity::text AS quantity,"referenceType","referenceId","deletedAt","isActive" FROM stock_movements WHERE "productId"=ANY($1) ORDER BY id`,
        [[foundId, decreasedId]],
      );
      const beforeJournal = await ds.query(
        `SELECT e.id,e."postingType",l.id AS line_id,l."accountId",l.debit::text AS debit,l.credit::text AS credit FROM journal_entry e LEFT JOIN journal_entry_line l ON l."entryId"=e.id WHERE e."sourceDocumentId"=ANY($1) ORDER BY e.id,l.id`,
        [[adjustment.id, sale.id]],
      );
      const beforeCostHistory = await ds.query(
        `SELECT id,"productId","remainingQuantity"::text AS remaining FROM purchase_cost_history WHERE "productId"=ANY($1) ORDER BY id`,
        [[foundId, decreasedId]],
      );
      const beforeConsumptions = await ds.query(
        `SELECT c.id,c."layerId",c."entryId",c.quantity::text AS quantity,c.value::text AS value FROM inventory_layer_consumptions c JOIN stock_valuation_entries e ON e.id=c."entryId" WHERE e."productId"=ANY($1) ORDER BY c.id`,
        [[foundId, decreasedId]],
      );
      await request(app.getHttpServer())
        .post(`/inventory/stock-adjustments/${adjustment.id}/revert`)
        .set(auth())
        .expect(409);
      expect(
        await ds.query(
          `SELECT kind,value::text AS value FROM stock_valuation_entries WHERE "productId"=ANY($1) ORDER BY "productId","createdAt",id`,
          [[foundId, decreasedId]],
        ),
      ).toEqual(beforeEntries);
      expect(
        await ds.query(
          `SELECT id,"stockQuantity"::text AS quantity FROM products WHERE id=ANY($1) ORDER BY id`,
          [[foundId, decreasedId]],
        ),
      ).toEqual(beforeProducts);
      expect(
        await ds.query(
          `SELECT id,"productId","movementType",quantity::text AS quantity,"referenceType","referenceId","deletedAt","isActive" FROM stock_movements WHERE "productId"=ANY($1) ORDER BY id`,
          [[foundId, decreasedId]],
        ),
      ).toEqual(beforeMovements);
      expect(
        await ds.query(
          `SELECT e.id,e."postingType",l.id AS line_id,l."accountId",l.debit::text AS debit,l.credit::text AS credit FROM journal_entry e LEFT JOIN journal_entry_line l ON l."entryId"=e.id WHERE e."sourceDocumentId"=ANY($1) ORDER BY e.id,l.id`,
          [[adjustment.id, sale.id]],
        ),
      ).toEqual(beforeJournal);
      expect(
        await ds.query(
          `SELECT id,"productId","remainingQuantity"::text AS remaining FROM purchase_cost_history WHERE "productId"=ANY($1) ORDER BY id`,
          [[foundId, decreasedId]],
        ),
      ).toEqual(beforeCostHistory);
      expect(
        await ds.query(
          `SELECT c.id,c."layerId",c."entryId",c.quantity::text AS quantity,c.value::text AS value FROM inventory_layer_consumptions c JOIN stock_valuation_entries e ON e.id=c."entryId" WHERE e."productId"=ANY($1) ORDER BY c.id`,
          [[foundId, decreasedId]],
        ),
      ).toEqual(beforeConsumptions);
    },
  );

  it("protects a committed fulfilment COGS entry from edits, soft deletes, and appended pairs", async () => {
    const productId = await createProductAndBatches();
    await seedActive(productId, "AVERAGE", "10", "1000.00");
    const order = await createOrder([{ productId, quantity: 2 }]);
    await fulfill(order.id);
    const [entry] = await ds.query(
      `SELECT id FROM journal_entry WHERE "sourceDocumentId"=$1 AND "postingType"='SALES_FULFILLMENT_COGS'`,
      [order.id],
    );
    const [accounts] = await ds.query(
      `SELECT "inventoryAccountId","cogsAccountId","cashAccountId","openingBalanceEquityAccountId" FROM accounting_settings WHERE id=true`,
    );
    const lines = await ds.query(
      `SELECT id,"accountId",debit::text AS debit,credit::text AS credit,"deletedAt","isActive" FROM journal_entry_line WHERE "entryId"=$1 ORDER BY id`,
      [entry.id],
    );
    const inventoryLine = lines.find(
      (line: any) => line.accountId === accounts.inventoryAccountId,
    );
    const cogsLine = lines.find(
      (line: any) => line.accountId === accounts.cogsAccountId,
    );
    expect(cogsLine).toBeDefined();
    const originalInventoryAmount = [inventoryLine.debit, inventoryLine.credit];

    await expect(
      ds.query(`UPDATE journal_entry_line SET debit=debit+1 WHERE id=$1`, [
        inventoryLine.id,
      ]),
    ).rejects.toThrow(/protected inventory posting/i);
    await expect(
      ds.query(`UPDATE journal_entry_line SET debit=debit+1 WHERE id=$1`, [
        cogsLine.id,
      ]),
    ).rejects.toThrow(/protected inventory posting/i);
    await expect(
      ds.query(`UPDATE journal_entry_line SET "accountId"=$2 WHERE id=$1`, [
        inventoryLine.id,
        accounts.cogsAccountId,
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

    const after = await ds.query(
      `SELECT id,"accountId",debit::text AS debit,credit::text AS credit,"deletedAt","isActive" FROM journal_entry_line WHERE "entryId"=$1 ORDER BY id`,
      [entry.id],
    );
    expect(after).toEqual(lines);
    expect(
      after.find((line: any) => line.id === inventoryLine.id),
    ).toMatchObject({
      debit: originalInventoryAmount[0],
      credit: originalInventoryAmount[1],
      deletedAt: null,
      isActive: true,
    });

    const unrelatedEntryId = randomUUID();
    await ds.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO journal_entry (id,"journalNo","entryDate","sourceType","sourceDocumentId","sourceRef","postingType",description,"createdBy") VALUES ($1,$2,current_date,'OPENING_BALANCE',$3,'unrelated-expense','OPENING_BALANCE','Unrelated balanced posting','test')`,
        [unrelatedEntryId, `JR-${unrelatedEntryId}`, order.id],
      );
      await manager.query(
        `INSERT INTO journal_entry_line ("entryId","accountId",debit,credit) VALUES ($1,$2,1,0),($1,$3,0,1)`,
        [
          unrelatedEntryId,
          accounts.cashAccountId,
          accounts.openingBalanceEquityAccountId,
        ],
      );
    });
    const [unrelatedCashLine] = await ds.query(
      `SELECT id FROM journal_entry_line WHERE "entryId"=$1 AND "accountId"=$2`,
      [unrelatedEntryId, accounts.cashAccountId],
    );
    await expect(
      ds.query(`UPDATE journal_entry_line SET "accountId"=$2 WHERE id=$1`, [
        unrelatedCashLine.id,
        accounts.inventoryAccountId,
      ]),
    ).rejects.toThrow(
      /cannot move a journal line onto the inventory control account/i,
    );
  });
});
