import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { randomUUID } from "crypto";
import request from "supertest";
import { DataSource } from "typeorm";
import { AppModule } from "../src/app.module";
import { CostingMethodChangeService } from "../src/modules/inventory/valuation/costing-method-change.service";
import { StockAdjustmentService } from "../src/modules/inventory/services/stock-adjustment.service";
import {
  activateValuationForTest,
  deactivateValuationForTest,
} from "./utils/valuation-fixture";
import { SESSION_PROTOCOL } from "./utils/session-protocol";
import {
  E2E_ADMIN_PASSWORD,
  removeSuiteAdmin,
  seedSuiteAdmin,
} from "./utils/shared-e2e-fixture";

const ROUTE_USERNAME = "e2espec_method_change_manager";

let app: INestApplication;
let ds: DataSource;
let service: CostingMethodChangeService;
let stockAdjustmentService: StockAdjustmentService;
let productId: string;
let categoryId: string;
let originalMethod: string;
let originalTimezone: string;
let changeId: string | null = null;
let stockAdjustmentId: string | null = null;
let managerId: string;
let managerToken: string;

beforeAll(async () => {
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = module.createNestApplication();
  await app.init();
  ds = app.get(DataSource);
  service = app.get(CostingMethodChangeService);
  stockAdjustmentService = app.get(StockAdjustmentService);
  await seedSuiteAdmin(ds, ROUTE_USERNAME);
  const [manager] = await ds.query(
    `UPDATE users SET role='manager' WHERE username=$1 RETURNING id`,
    [ROUTE_USERNAME],
  );
  managerId = manager.id;
  const login = await request(app.getHttpServer())
    .post("/auth/login")
    .set(...SESSION_PROTOCOL)
    .send({ usernameOrEmail: ROUTE_USERNAME, password: E2E_ADMIN_PASSWORD })
    .expect(200);
  managerToken = login.body?.data?.accessToken ?? login.body?.accessToken;
});
beforeEach(async () => {
  const [settings] = await ds.query(
    `SELECT "costingMethod", timezone FROM regional_settings ORDER BY "createdAt" LIMIT 1`,
  );
  originalMethod = settings.costingMethod;
  originalTimezone = settings.timezone;
  await ds.query(`UPDATE regional_settings SET "costingMethod"='AVERAGE'`);
  categoryId = randomUUID();
  productId = randomUUID();
  await ds.query(`INSERT INTO categories (id,name,slug) VALUES ($1,$2,$3)`, [
    categoryId,
    `mc-${categoryId}`,
    `mc-${categoryId}`,
  ]);
  await ds.query(
    `INSERT INTO products (id,name,slug,type,"baseCost","stockQuantity","categoryId") VALUES ($1,$2,$3,'Stocked Product',1,3,$4)`,
    [productId, `mc-${productId}`, `mc-${productId}`, categoryId],
  );
  await ds.query(
    `INSERT INTO purchase_cost_history ("productId","unitCost","shippingPerUnit","landedCost","receivedQuantity","remainingQuantity","receivedDate") VALUES ($1,10,0,10,1,1,now()-interval '1 day'),($1,10,0,10,2,2,now())`,
    [productId],
  );
});
afterEach(async () => {
  await deactivateValuationForTest(ds);
  if (stockAdjustmentId) {
    await ds.query(`DELETE FROM journal_entry WHERE "sourceDocumentId"=$1`, [
      stockAdjustmentId,
    ]);
    await ds.query(`TRUNCATE TABLE stock_movement_valuation_gaps`);
    await ds.query(
      `DELETE FROM stock_movements WHERE "referenceType"='stock_adjustment' AND "referenceId"=$1`,
      [stockAdjustmentId],
    );
    await ds.query(`DELETE FROM stock_adjustments WHERE id=$1`, [
      stockAdjustmentId,
    ]);
    stockAdjustmentId = null;
  }
  if (changeId) {
    await ds.query(
      `DELETE FROM costing_method_change_products WHERE "changeId"=$1`,
      [changeId],
    );
    await ds.query(`DELETE FROM costing_method_changes WHERE id=$1`, [
      changeId,
    ]);
    changeId = null;
  }
  await ds.query(`DELETE FROM purchase_cost_history WHERE "productId"=$1`, [
    productId,
  ]);
  await ds.query(`DELETE FROM products WHERE id=$1`, [productId]);
  await ds.query(`DELETE FROM categories WHERE id=$1`, [categoryId]);
  await ds.query(`UPDATE regional_settings SET "costingMethod"=$1`, [
    originalMethod,
  ]);
  await ds.query(`UPDATE regional_settings SET timezone=$1`, [
    originalTimezone,
  ]);
});
afterAll(async () => {
  await removeSuiteAdmin(ds, ROUTE_USERNAME);
  await app.close();
});

describe("Costing method changes", () => {
  it("allows a manager preparer to withdraw a proposed change through the route", async () => {
    const response = await request(app.getHttpServer())
      .post("/inventory/valuation/method-changes")
      .set("Authorization", `Bearer ${managerToken}`)
      .send({
        toMethod: "FIFO",
        effectiveDate: "2099-01-01",
        explanation: "Withdraw route coverage",
      })
      .expect(201);
    const record = response.body.data ?? response.body;
    changeId = record.id;

    const withdrawn = await request(app.getHttpServer())
      .post(`/inventory/valuation/method-changes/${record.id}/withdraw`)
      .set("Authorization", `Bearer ${managerToken}`)
      .expect(201);

    expect(withdrawn.status).toBe(201);
    const [stored] = await ds.query(
      `SELECT status FROM costing_method_changes WHERE id=$1`,
      [record.id],
    );
    expect(stored.status).toBe("withdrawn");
  });

  it("forbids a manager from approving through the route", async () => {
    const record = await service.propose(
      {
        toMethod: "FIFO",
        effectiveDate: "2099-01-01",
        explanation: "Manager approval denial",
      },
      { userId: "00000000-0000-4000-8000-000000000001" },
    );
    changeId = record.id;

    await request(app.getHttpServer())
      .post(`/inventory/valuation/method-changes/${record.id}/approve`)
      .set("Authorization", `Bearer ${managerToken}`)
      .expect(403);
  });

  it("applies an approved method change only while valuation is paused and preserves total value", async () => {
    await activateValuationForTest(ds, {
      method: "AVERAGE",
      products: [{ productId, quantity: "3.0000", value: "10.00" }],
    });
    const [dateRow] = await ds.query(
      `SELECT to_char(now() AT TIME ZONE 'Asia/Kuala_Lumpur','YYYY-MM-DD') AS today`,
    );
    const today = dateRow.today;
    const preparer = { userId: "00000000-0000-4000-8000-000000000001" };
    const record = await service.propose(
      {
        toMethod: "FIFO",
        effectiveDate: today,
        explanation: "Approved conversion",
      },
      preparer,
    );
    changeId = record.id;
    await service.approve(record.id, {
      userId: "00000000-0000-4000-8000-000000000002",
    });
    await expect(
      ds.transaction((m) => service.applyApproved(m, record.id)),
    ).rejects.toThrow(/must be paused/i);
    const entriesBefore = await ds.query(
      `SELECT id,kind,method,quantity::text,value::text FROM stock_valuation_entries WHERE "productId"=$1 ORDER BY "createdAt",id`,
      [productId],
    );
    await ds.query(
      `UPDATE inventory_valuation_state SET "pausedAt"=now() WHERE id=true`,
    );
    await ds.transaction((m) => service.applyApproved(m, record.id));
    const [balance] = await ds.query(
      `SELECT method,"valueOnHand"::text AS value FROM product_valuation_balances WHERE "productId"=$1`,
      [productId],
    );
    expect(balance).toEqual({ method: "FIFO", value: "10.00" });
    const after = await ds.query(
      `SELECT id,kind,method,quantity::text,value::text FROM stock_valuation_entries WHERE "productId"=$1 AND kind<>'method_change' ORDER BY "createdAt",id`,
      [productId],
    );
    expect(after).toEqual(entriesBefore);
    const layers = await ds.query(
      `SELECT "remainingQuantity"::text AS quantity,"remainingValue"::text AS value,"sourceEntryId" FROM inventory_cost_layers WHERE "productId"=$1 AND "remainingQuantity">0 ORDER BY "createdAt",id`,
      [productId],
    );
    expect(layers.map((row: any) => row.value)).toEqual(["3.33", "6.67"]);
    const [methodEntry] = await ds.query(
      `SELECT id FROM stock_valuation_entries WHERE "productId"=$1 AND kind='method_change'`,
      [productId],
    );
    expect(
      layers.every((layer: any) => layer.sourceEntryId === methodEntry.id),
    ).toBe(true);
  });

  it("snapshots preview and requires a different approver; edits clear approval", async () => {
    await activateValuationForTest(ds, {
      method: "AVERAGE",
      products: [{ productId, quantity: "3.0000", value: "10.00" }],
    });
    const effectiveDate = new Date(Date.now() + 7 * 86400000)
      .toISOString()
      .slice(0, 10);
    const preparer = { userId: "00000000-0000-4000-8000-000000000001" };
    const record = await service.propose(
      {
        toMethod: "FIFO",
        effectiveDate,
        explanation: "Documented costing change",
      },
      preparer,
    );
    changeId = record.id;
    expect(
      record.products[0].layersAfter.map((layer: any) => layer.value),
    ).toEqual(["3.33", "6.67"]);
    await expect(service.approve(record.id, preparer)).rejects.toThrow(
      "The approver must be a different user from the preparer.",
    );
    const approved = await service.approve(record.id, {
      userId: "00000000-0000-4000-8000-000000000002",
    });
    expect(approved.status).toBe("approved");
    const edited = await service.edit(
      record.id,
      { explanation: "Updated explanation" },
      preparer,
    );
    expect(edited.status).toBe("proposed");
    expect(edited.contentHash).toBeNull();
    expect(edited.approvedByUserId).toBeNull();
  });

  it("refuses a stale approved snapshot and applies only after refreshing and reapproving", async () => {
    await activateValuationForTest(ds, {
      method: "AVERAGE",
      products: [{ productId, quantity: "3.0000", value: "10.00" }],
    });
    const [todayRow] = await ds.query(
      `SELECT to_char(now() AT TIME ZONE 'Asia/Kuala_Lumpur','YYYY-MM-DD') AS today`,
    );
    const preparer = { userId: "00000000-0000-4000-8000-000000000001" };
    const approver = { userId: "00000000-0000-4000-8000-000000000002" };
    const record = await service.propose(
      {
        toMethod: "FIFO",
        effectiveDate: todayRow.today,
        explanation: "Stale snapshot regression",
      },
      preparer,
    );
    changeId = record.id;
    await service.approve(record.id, approver);

    const adjustment = await stockAdjustmentService.create({
      adjustmentDate: new Date().toISOString().slice(0, 10),
      items: [{ productId, oldQuantity: 3, difference: 1 }],
    });
    stockAdjustmentId = adjustment.id;
    await stockAdjustmentService.complete(adjustment.id);
    const [batch] = await ds.query(
      `SELECT id FROM purchase_cost_history WHERE "productId"=$1 ORDER BY "receivedDate",id LIMIT 1`,
      [productId],
    );
    await ds.query(
      `UPDATE purchase_cost_history SET "remainingQuantity"="remainingQuantity" + 1, "receivedQuantity"="receivedQuantity" + 1 WHERE id=$1`,
      [batch.id],
    );
    const [stockAfterIncrease] = await ds.query(
      `SELECT "quantityOnHand"::text AS quantity,"valueOnHand"::text AS value FROM product_valuation_balances WHERE "productId"=$1`,
      [productId],
    );
    await ds.query(
      `UPDATE inventory_valuation_state SET "pausedAt"=now() WHERE id=true`,
    );

    await expect(
      ds.transaction((manager) => service.applyApproved(manager, record.id)),
    ).rejects.toThrow(
      "Stock has changed since this change was approved; refresh the preview and approve again.",
    );
    const [unchanged] = await ds.query(
      `SELECT status FROM costing_method_changes WHERE id=$1`,
      [record.id],
    );
    const [balanceAfterRefusal] = await ds.query(
      `SELECT "quantityOnHand"::text AS quantity,"valueOnHand"::text AS value FROM product_valuation_balances WHERE "productId"=$1`,
      [productId],
    );
    const [entries] = await ds.query(
      `SELECT count(*)::int AS count FROM stock_valuation_entries WHERE "productId"=$1 AND kind='method_change'`,
      [productId],
    );
    expect(unchanged.status).toBe("approved");
    expect(balanceAfterRefusal).toEqual(stockAfterIncrease);
    expect(entries.count).toBe(0);

    const refreshed = await service.refreshPreview(record.id, preparer);
    expect(refreshed.status).toBe("proposed");
    await service.approve(record.id, approver);
    await ds.transaction((manager) =>
      service.applyApproved(manager, record.id),
    );
    const [applied] = await ds.query(
      `SELECT status FROM costing_method_changes WHERE id=$1`,
      [record.id],
    );
    expect(applied.status).toBe("applied");
  });

  it("preserves cent allocation across four FIFO layers when value is two cents", async () => {
    await ds.query(`DELETE FROM purchase_cost_history WHERE "productId"=$1`, [
      productId,
    ]);
    await ds.query(
      `INSERT INTO purchase_cost_history ("productId","unitCost","shippingPerUnit","landedCost","receivedQuantity","remainingQuantity","receivedDate") VALUES ($1,0.01,0,0.01,1,1,'2026-01-01'),($1,0.01,0,0.01,1,1,'2026-01-02'),($1,0.01,0,0.01,1,1,'2026-01-03'),($1,0.01,0,0.01,1,1,'2026-01-04')`,
      [productId],
    );
    await activateValuationForTest(ds, {
      method: "AVERAGE",
      products: [{ productId, quantity: "4.0000", value: "0.02" }],
    });
    const [todayRow] = await ds.query(
      `SELECT to_char(now() AT TIME ZONE 'Asia/Kuala_Lumpur','YYYY-MM-DD') AS today`,
    );
    const record = await service.propose(
      {
        toMethod: "FIFO",
        effectiveDate: todayRow.today,
        explanation: "Two-cent layer allocation",
      },
      { userId: "00000000-0000-4000-8000-000000000001" },
    );
    changeId = record.id;
    expect(
      record.products[0].layersAfter.map((layer: any) => layer.value),
    ).toEqual(["0.01", "0.01", "0.00", "0.00"]);
    await service.approve(record.id, {
      userId: "00000000-0000-4000-8000-000000000002",
    });
    await ds.query(
      `UPDATE inventory_valuation_state SET "pausedAt"=now() WHERE id=true`,
    );
    await ds.transaction((manager) =>
      service.applyApproved(manager, record.id),
    );
    const layers = await ds.query(
      `SELECT "remainingValue"::text AS value FROM inventory_cost_layers WHERE "productId"=$1 AND "remainingQuantity">0 ORDER BY "createdAt",id`,
      [productId],
    );
    expect(layers.map((layer: any) => layer.value)).toEqual([
      "0.01",
      "0.01",
      "0.00",
      "0.00",
    ]);
  });

  it("stores the requested effective date separately from the later application date", async () => {
    await activateValuationForTest(ds, {
      method: "AVERAGE",
      products: [{ productId, quantity: "3.0000", value: "10.00" }],
    });
    await ds.query(`UPDATE regional_settings SET timezone='Etc/GMT+12'`);
    const [requested] = await ds.query(
      `SELECT to_char(now() AT TIME ZONE timezone,'YYYY-MM-DD') AS day FROM regional_settings ORDER BY "createdAt" LIMIT 1`,
    );
    const record = await service.propose(
      {
        toMethod: "FIFO",
        effectiveDate: requested.day,
        explanation: "Effective date precedes later application date",
      },
      { userId: "00000000-0000-4000-8000-000000000001" },
    );
    changeId = record.id;
    await service.approve(record.id, {
      userId: "00000000-0000-4000-8000-000000000002",
    });
    await ds.query(`UPDATE regional_settings SET timezone='Asia/Kuala_Lumpur'`);
    await ds.query(
      `UPDATE inventory_valuation_state SET "pausedAt"=now() WHERE id=true`,
    );
    await ds.transaction((manager) =>
      service.applyApproved(manager, record.id),
    );
    const [stored] = await ds.query(
      `SELECT "requestedEffectiveDate"::text AS requested,"appliedDate"::text AS applied,"appliedAt" IS NOT NULL AS timestamped FROM costing_method_changes WHERE id=$1`,
      [record.id],
    );
    expect(stored.timestamped).toBe(true);
    expect(stored.requested).toBe(requested.day);
    expect(stored.applied).not.toBe(stored.requested);
  });
});
