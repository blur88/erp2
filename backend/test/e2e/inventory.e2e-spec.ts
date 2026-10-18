import { SESSION_PROTOCOL } from '../utils/session-protocol';
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { DataSource } from "typeorm";
import { AppModule } from "../../src/app.module";
import { seedCategory, seedProduct } from "./helpers/seed";
import {
  E2E_ADMIN_USERNAMES,
  E2E_ADMIN_PASSWORD,
  seedSuiteAdmin,
  removeSuiteAdmin,
} from "../utils/shared-e2e-fixture";
import { resetSuiteBusinessRows } from "../utils/shared-e2e-business-fixture";
import { removeSuiteTraces } from "../utils/shared-e2e-traces-fixture";
import { configureTestAppValidation } from "../utils/configure-test-app-validation";

describe("Inventory (e2e)", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let accessToken: string;
  let categoryId: string;
  let productId: string;
  // Every category/product/adjustment this suite creates, not just the first of
  // each: the barcode block seeds its own "Edge Case Category" / "Product A",
  // and stock-adjustment HEADERS are reachable from neither.
  const ownedCategoryIds: string[] = [];
  const ownedProductIds: string[] = [];
  const ownedAdjustmentIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();

    dataSource = app.get(DataSource);

    // Suite-owned admin (issue #1199) — see shared-e2e-fixture.ts.
    await seedSuiteAdmin(dataSource, E2E_ADMIN_USERNAMES.inventory);

    const loginRes = await request(app.getHttpServer())
      .post("/auth/login").set(...SESSION_PROTOCOL)
      .send({
        usernameOrEmail: E2E_ADMIN_USERNAMES.inventory,
        password: E2E_ADMIN_PASSWORD,
      });
    accessToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      // categoryId/productId are created through the API by the cases below.
      // Resolve every owned product (incl. API-created winners like the
      // case-variant WIDGET and edge-case Product A, which are reachable via
      // their category but never pushed to ownedProductIds) BEFORE business
      // cleanup. complete() posts a journal_entry (STOCK_ADJUSTMENT source)
      // and a system-attributed UPDATE audit — both out of scope for the
      // business fixture and username-scoped traces respectively.
      const resolvedProductIds: string[] = ownedCategoryIds.length
        ? (
            await dataSource.query(
              `SELECT id FROM products WHERE "categoryId" = ANY($1)`,
              [ownedCategoryIds],
            )
          ).map((r: { id: string }) => r.id)
        : [];
      const allProductIds = [
        ...new Set([...ownedProductIds, ...resolvedProductIds]),
      ];
      let ownedMovementIds: string[] = [];
      if (ownedAdjustmentIds.length) {
        const movements = await dataSource.query(
          `SELECT id FROM stock_movements WHERE "referenceId" = ANY($1)`,
          [ownedAdjustmentIds],
        ).catch(() => []);
        ownedMovementIds = movements.map((r: { id: string }) => r.id);
      }
      if (ownedAdjustmentIds.length) {
        await dataSource.query(
          `DELETE FROM journal_entry WHERE "sourceDocumentId" = ANY($1)`,
          [ownedAdjustmentIds],
        );
      }
      await resetSuiteBusinessRows(dataSource, {
        categoryIds: ownedCategoryIds,
        productIds: ownedProductIds,
        stockAdjustmentIds: ownedAdjustmentIds,
      });
      const adminRows: { id: string }[] = await dataSource.query(
        `SELECT id FROM users WHERE username = $1`,
        [E2E_ADMIN_USERNAMES.inventory],
      );
      await removeSuiteTraces(dataSource, {
        userIds: adminRows.map((r) => r.id),
        usernames: [E2E_ADMIN_USERNAMES.inventory],
        entityIds: [
          ...ownedCategoryIds,
          ...allProductIds,
          ...ownedAdjustmentIds,
          ...ownedMovementIds,
        ],
      });
      await removeSuiteAdmin(dataSource, E2E_ADMIN_USERNAMES.inventory);
      await dataSource.destroy();
    }
    await app.close();
  });

  // ─── Category CRUD ────────────────────────────────────────────────────────

  describe("Category CRUD", () => {
    it("POST /inventory/categories — creates a category", async () => {
      const res = await request(app.getHttpServer())
        .post("/inventory/categories")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ name: "Electronics" })
        .expect(201);

      expect(res.body).toHaveProperty("id");
      expect(res.body.name).toBe("Electronics");
      categoryId = res.body.id;
      ownedCategoryIds.push(categoryId);
    });

    it("GET /inventory/categories — lists categories", async () => {
      const res = await request(app.getHttpServer())
        .get("/inventory/categories")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      const items: any[] = Array.isArray(res.body) ? res.body : res.body.data;
      expect(items.map((c: any) => c.id)).toContain(categoryId);
    });

    it("GET /inventory/categories/:id — returns the category", async () => {
      const res = await request(app.getHttpServer())
        .get(`/inventory/categories/${categoryId}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.id).toBe(categoryId);
      expect(res.body.name).toBe("Electronics");
    });

    it("PATCH /inventory/categories/:id — updates the category name", async () => {
      const res = await request(app.getHttpServer())
        .patch(`/inventory/categories/${categoryId}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ name: "Consumer Electronics" })
        .expect(200);

      expect(res.body.name).toBe("Consumer Electronics");
    });

    it("GET /inventory/categories/slug/:slug — returns the category by slug", async () => {
      const res = await request(app.getHttpServer())
        .get(`/inventory/categories/slug/consumer-electronics`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.id).toBe(categoryId);
      expect(res.body.slug).toBe("consumer-electronics");
    });

    it("PATCH /inventory/categories/:id/enabled — toggles active status", async () => {
      const off = await request(app.getHttpServer())
        .patch(`/inventory/categories/${categoryId}/enabled`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ enabled: false })
        .expect(200);
      expect(off.body.isEnabled).toBe(false);

      const on = await request(app.getHttpServer())
        .patch(`/inventory/categories/${categoryId}/enabled`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ enabled: true })
        .expect(200);
      expect(on.body.isEnabled).toBe(true);
    });
  });

  // ─── Product CRUD ─────────────────────────────────────────────────────────

  describe("Product CRUD", () => {
    it("POST /inventory/products — creates a product", async () => {
      const res = await request(app.getHttpServer())
        .post("/inventory/products")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "Laptop Pro 15",
          categoryId,
          baseCost: 800,
          stockQuantity: 50,
        })
        .expect(201);

      expect(res.body).toHaveProperty("id");
      expect(res.body.name).toBe("Laptop Pro 15");
      productId = res.body.id;
      ownedProductIds.push(productId);
    });

    it("GET /inventory/products — lists products", async () => {
      const res = await request(app.getHttpServer())
        .get("/inventory/products")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      const items: any[] = res.body.data ?? res.body;
      expect(items.map((p: any) => p.id)).toContain(productId);
    });

    it("GET /inventory/products/:id — returns the product", async () => {
      const res = await request(app.getHttpServer())
        .get(`/inventory/products/${productId}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.id).toBe(productId);
      expect(res.body.name).toBe("Laptop Pro 15");
    });

    it("removed stock-writing routes return 404 without changing stock history", async () => {
      const routeProduct = await seedProduct(dataSource, categoryId, {
        name: `Legacy Route Target ${Date.now()}`,
        stockQuantity: 0,
      });
      ownedProductIds.push(routeProduct.id);
      const [before] = await dataSource.query(
        `SELECT p."stockQuantity"::text AS stock,
                (SELECT count(*)::int FROM stock_movements m WHERE m."productId" = p.id) AS movements
           FROM products p WHERE p.id = $1`,
        [routeProduct.id],
      );
      const post = (path: string, body: Record<string, unknown>) =>
        request(app.getHttpServer())
          .post(path)
          .set("Authorization", `Bearer ${accessToken}`)
          .send(body)
          .expect(404);

      await post("/inventory/stock/movements", {
        productId: routeProduct.id,
        movementType: "adjustment_increase",
        quantity: 1,
        reason: "legacy route",
      });
      await post("/inventory/stock/adjustments/bulk", {
        adjustmentDate: "2026-08-20",
        items: [{ productId: routeProduct.id, oldQuantity: 0, newQuantity: 1, difference: 1 }],
      });
      await post(`/inventory/stock/initial/${routeProduct.id}`, { quantity: 1, unitCost: 10 });
      await post(`/inventory/stock/sale/${routeProduct.id}`, {
        quantity: 1,
        unitPrice: 10,
        referenceId: "legacy-sale",
      });
      await post(`/inventory/stock/purchase/${routeProduct.id}`, {
        quantity: 1,
        unitCost: 10,
        referenceId: "legacy-purchase",
      });

      const [after] = await dataSource.query(
        `SELECT p."stockQuantity"::text AS stock,
                (SELECT count(*)::int FROM stock_movements m WHERE m."productId" = p.id) AS movements
           FROM products p WHERE p.id = $1`,
        [routeProduct.id],
      );
      expect(after).toEqual(before);
    });

    it("PATCH /inventory/products/:id — updates the product", async () => {
      const res = await request(app.getHttpServer())
        .patch(`/inventory/products/${productId}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ name: "Laptop Pro 15 Updated", categoryId, baseCost: 850 })
        .expect(200);

      expect(res.body.name).toBe("Laptop Pro 15 Updated");
    });

    it("PATCH /inventory/products/:id — refuses Service conversion with remaining inventory value", async () => {
      const product = await seedProduct(dataSource, categoryId, {
        name: `Zero Quantity Value ${Date.now()}`,
        stockQuantity: 0,
        baseCost: 10,
      });
      ownedProductIds.push(product.id);
      await dataSource.query(
        `INSERT INTO purchase_cost_history
          ("productId", "unitCost", "shippingPerUnit", "landedCost", "receivedQuantity", "remainingQuantity", "receivedDate")
         VALUES ($1, 10, 0, 10, 1, 1, now())`,
        [product.id],
      );

      const response = await request(app.getHttpServer())
        .patch(`/inventory/products/${product.id}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ type: "Service" })
        .expect(400);

      expect(response.body.message).toContain(
        "A product with stock on hand or inventory value must stay a Stocked Product.",
      );
      const [stored] = await dataSource.query(
        `SELECT type, "stockQuantity"::text AS "stockQuantity" FROM products WHERE id = $1`,
        [product.id],
      );
      expect(stored.type).toBe("Stocked Product");
      expect(Number(stored.stockQuantity)).toBe(0);
    });

    it("DELETE /inventory/products/:id — soft-deletes the product", async () => {
      await request(app.getHttpServer())
        .delete(`/inventory/products/${productId}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(204);
    });

    it("POST /inventory/products/:id/restore — restores the product", async () => {
      const res = await request(app.getHttpServer())
        .post(`/inventory/products/${productId}/restore`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.id).toBe(productId);
    });

    it("permanent delete refuses a product with only initial stock history", async () => {
      const name = `Initial History ${Date.now()}`;
      const created = await request(app.getHttpServer())
        .post("/inventory/products")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ name, categoryId, baseCost: 0, stockQuantity: 2 })
        .expect(201);
      const id = created.body.id;
      ownedProductIds.push(id);
      await request(app.getHttpServer())
        .delete(`/inventory/products/${id}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(204);

      const response = await request(app.getHttpServer())
        .delete(`/inventory/products/${id}/permanent`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(409);

      expect(response.body.message).toBe(`Cannot permanently delete '${name}': it has stock history.`);
      const movements = await dataSource.query(
        `SELECT "movementType" FROM stock_movements WHERE "productId" = $1`,
        [id],
      );
      expect(movements.map((row: { movementType: string }) => row.movementType)).toEqual(['initial_stock']);
      expect(await dataSource.query(`SELECT id FROM products WHERE id = $1`, [id])).toHaveLength(1);
    });

    it("permanent delete refuses an exhausted cost batch", async () => {
      const name = `Exhausted Batch ${Date.now()}`;
      const product = await seedProduct(dataSource, categoryId, {
        name,
        stockQuantity: 0,
        baseCost: 10,
      });
      const id = product.id;
      ownedProductIds.push(id);
      await dataSource.query(
        `INSERT INTO purchase_cost_history
          ("productId", "unitCost", "shippingPerUnit", "landedCost", "receivedQuantity", "remainingQuantity", "receivedDate")
         VALUES ($1, 10, 0, 10, 1, 0, now())`,
        [id],
      );
      await request(app.getHttpServer())
        .delete(`/inventory/products/${id}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(204);

      const response = await request(app.getHttpServer())
        .delete(`/inventory/products/${id}/permanent`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(409);

      expect(response.body.message).toBe(`Cannot permanently delete '${name}': it has stock history.`);
      const batches = await dataSource.query(
        `SELECT id FROM purchase_cost_history WHERE "productId" = $1`,
        [id],
      );
      expect(batches).toHaveLength(1);
      const movements = await dataSource.query(
        `SELECT id FROM stock_movements WHERE "productId" = $1`,
        [id],
      );
      expect(movements).toHaveLength(0);
      expect(await dataSource.query(`SELECT id FROM products WHERE id = $1`, [id])).toHaveLength(1);
    });

    it("permanent delete refuses provenance and a direct product DELETE is restricted by its batch", async () => {
      const name = `Batch Provenance ${Date.now()}`;
      const created = await request(app.getHttpServer())
        .post("/inventory/products")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ name, categoryId, baseCost: 10, stockQuantity: 2 })
        .expect(201);
      const id = created.body.id;
      ownedProductIds.push(id);
      const [batch] = await dataSource.query(
        `SELECT id FROM purchase_cost_history WHERE "productId" = $1`,
        [id],
      );
      const [movement] = await dataSource.query(
        `INSERT INTO stock_movements
          ("movementType", quantity, "previousBalance", "newBalance", "productId", "referenceType", "referenceId", "isActive")
         VALUES ('sale', -1, 2, 1, $1, 'sales_order', $2, true)
         RETURNING id`,
        [id, "00000000-0000-0000-0000-000000000000"],
      );
      await dataSource.query(
        `INSERT INTO stock_batch_consumptions ("movementId", "batchId", quantity, "unitCost", "valueScale8")
         VALUES ($1, $2, 1, 10, 10.00000000)`,
        [movement.id, batch.id],
      );
      await dataSource.query(`UPDATE products SET "stockQuantity" = 1 WHERE id = $1`, [id]);
      await dataSource.query(
        `UPDATE purchase_cost_history SET "remainingQuantity" = 1 WHERE id = $1`,
        [batch.id],
      );
      await request(app.getHttpServer())
        .delete(`/inventory/products/${id}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(204);

      const response = await request(app.getHttpServer())
        .delete(`/inventory/products/${id}/permanent`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(409);
      expect(response.body.message).toBe(`Cannot permanently delete '${name}': it has stock history.`);
      expect(
        await dataSource.query(
          `SELECT id FROM stock_batch_consumptions WHERE "movementId" = $1 AND "batchId" = $2`,
          [movement.id, batch.id],
        ),
      ).toHaveLength(1);
      expect(await dataSource.query(`SELECT id FROM stock_movements WHERE id = $1`, [movement.id])).toHaveLength(1);
      expect(await dataSource.query(`SELECT id FROM purchase_cost_history WHERE id = $1`, [batch.id])).toHaveLength(1);
      expect(await dataSource.query(`SELECT id FROM products WHERE id = $1`, [id])).toHaveLength(1);

      let deleteError: any;
      try {
        await dataSource.query(`DELETE FROM products WHERE id = $1`, [id]);
      } catch (error) {
        deleteError = error;
      }
      // PostgreSQL reports an ON DELETE RESTRICT failure as 23001
      // (restrict_violation), rather than a foreign_key_violation (23503).
      expect(deleteError?.code).toBe("23001");
    });

    it("bulk permanent delete reports stock-history refusals and keeps the products", async () => {
      const ids: string[] = [];
      for (const name of [`Bulk History A ${Date.now()}`, `Bulk History B ${Date.now()}`]) {
        const created = await request(app.getHttpServer())
          .post("/inventory/products")
          .set("Authorization", `Bearer ${accessToken}`)
          .send({ name, categoryId, baseCost: 0, stockQuantity: 1 })
          .expect(201);
        ids.push(created.body.id);
        ownedProductIds.push(created.body.id);
        await request(app.getHttpServer())
          .delete(`/inventory/products/${created.body.id}`)
          .set("Authorization", `Bearer ${accessToken}`)
          .expect(204);
      }

      const response = await request(app.getHttpServer())
        .post("/inventory/products/bulk-permanent-delete")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ productIds: ids })
        .expect(200);

      expect(response.body.deletedCount).toBe(0);
      expect(response.body.failedIds.sort()).toEqual(ids.sort());
      const remaining = await dataSource.query(`SELECT id FROM products WHERE id = ANY($1)`, [ids]);
      expect(remaining.map((row: { id: string }) => row.id).sort()).toEqual(ids.sort());
    });

    it("allows permanent delete when the product has no stock history", async () => {
      const name = `No History ${Date.now()}`;
      const created = await request(app.getHttpServer())
        .post("/inventory/products")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ name, categoryId, baseCost: 0, stockQuantity: 0 })
        .expect(201);
      const id = created.body.id;
      ownedProductIds.push(id);
      await request(app.getHttpServer())
        .delete(`/inventory/products/${id}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .delete(`/inventory/products/${id}/permanent`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(204);
      expect(await dataSource.query(`SELECT id FROM products WHERE id = $1`, [id])).toHaveLength(0);
    });

    it("POST /inventory/products — concurrent case-variant creates: one 201, one 409 (#984)", async () => {
      const base = `Widget ${Date.now()}`;
      const post = (name: string) =>
        request(app.getHttpServer())
          .post("/inventory/products")
          .set("Authorization", `Bearer ${accessToken}`)
          .send({ name, categoryId, baseCost: 5, stockQuantity: 0 });

      const [a, b] = await Promise.all([
        post(base.toUpperCase()),
        post(base.toLowerCase()),
      ]);

      const statuses = [a.status, b.status].sort();
      // Exactly one wins. The loser is a 409 — never a raw 500, which is what
      // an untranslated unique violation would produce.
      expect(statuses).toEqual([201, 409]);

      // Behavioural assertion: holds regardless of WHICH unique index
      // PostgreSQL reported (lower-name or the slug index, nondeterministic
      // under concurrency).
      const rows = await dataSource.query(
        `SELECT count(*)::int AS n FROM products WHERE lower(name) = lower($1)`,
        [base],
      );
      expect(rows[0].n).toBe(1);
    });
  });

  // ─── Stock Adjustments ────────────────────────────────────────────────────

  describe("Stock adjustments", () => {
    let adjustmentId: string;

    it("POST /inventory/stock-adjustments — creates a draft adjustment", async () => {
      const res = await request(app.getHttpServer())
        .post("/inventory/stock-adjustments")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          adjustmentDate: "2026-07-20",
          notes: "Initial stock count",
          items: [
            { productId, oldQuantity: 50, newQuantity: 60, difference: 10 },
          ],
        })
        .expect(201);

      expect(res.body).toHaveProperty("id");
      adjustmentId = res.body.id;
      ownedAdjustmentIds.push(adjustmentId);
    });

    it("POST /inventory/stock-adjustments/:id/complete — completes the adjustment", async () => {
      await request(app.getHttpServer())
        .post(`/inventory/stock-adjustments/${adjustmentId}/complete`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(201);
    });

    it("GET /inventory/products/:id — stock increased after completion", async () => {
      const res = await request(app.getHttpServer())
        .get(`/inventory/products/${productId}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(Number(res.body.stockQuantity)).toBe(60);
    });

    it("POST .../complete — rejects a completion that would drive stock negative, leaving no partial write (#982)", async () => {
      const product = await seedProduct(dataSource, categoryId, {
        name: `Oversell ${Date.now()}`,
        stockQuantity: 2,
      });

      ownedProductIds.push(product.id);

      // Draft says stock is 10 (a stale snapshot) and removes 10. Live stock is 2.
      const draft = await request(app.getHttpServer())
        .post("/inventory/stock-adjustments")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          adjustmentDate: new Date().toISOString().slice(0, 10),
          notes: "negative guard",
          items: [
            {
              productId: product.id,
              oldQuantity: 10,
              difference: -10,
              unitCost: 5,
            },
          ],
        })
        .expect(201);
      ownedAdjustmentIds.push(draft.body.id);

      await request(app.getHttpServer())
        .post(`/inventory/stock-adjustments/${draft.body.id}/complete`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(400);

      // Stock untouched.
      const after = await dataSource.query(
        `SELECT "stockQuantity" FROM products WHERE id = $1`,
        [product.id],
      );
      expect(Number(after[0].stockQuantity)).toBe(2);

      // The whole transaction rolled back: the item keeps its draft values and
      // no reconciliation was persisted.
      const items = await dataSource.query(
        `SELECT "oldQuantity", "requestedOldQuantity" FROM stock_adjustment_items
          WHERE "stockAdjustmentId" = $1`,
        [draft.body.id],
      );
      expect(Number(items[0].oldQuantity)).toBe(10);
      expect(items[0].requestedOldQuantity).toBeNull();

      // The status flip is part of the same transaction and must have rolled
      // back too — a COMPLETED adjustment with no movement would be corrupt.
      const header = await dataSource.query(
        `SELECT status FROM stock_adjustments WHERE id = $1`,
        [draft.body.id],
      );
      expect(header[0].status).toBe("draft");

      // No stock movement was left behind for this adjustment.
      const movements = await dataSource.query(
        `SELECT count(*)::int AS n FROM stock_movements
          WHERE "referenceType" = 'stock_adjustment' AND "referenceId" = $1`,
        [draft.body.id],
      );
      expect(movements[0].n).toBe(0);
    });
  });

  // ─── Edge cases ───────────────────────────────────────────────────────────

  describe("Edge cases", () => {
    it("POST /inventory/products — duplicate barcode returns 409", async () => {
      // Namespaced: fixed names/barcodes collide once nothing truncates these
      // tables. Products are unique case-insensitively on BOTH name and
      // barcode, so the shared barcode must be per-run too — it stays shared
      // between the two POSTs below, which is what the 409 is testing.
      const barcode = `BARCODE-${Date.now()}`;
      const category = await seedCategory(
        dataSource,
        `Edge Case Category ${Date.now()}`,
      );
      ownedCategoryIds.push(category.id);

      await request(app.getHttpServer())
        .post("/inventory/products")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: `Product A ${Date.now()}`,
          categoryId: category.id,
          baseCost: 10,
          barcode,
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post("/inventory/products")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: `Product B ${Date.now()}`,
          categoryId: category.id,
          baseCost: 10,
          barcode,
        })
        .expect(409);

      expect(res.body.message).toBeDefined();
    });

    it("POST /inventory/stock/movements/:id/reverse is not a route", async () => {
      await request(app.getHttpServer())
        .post("/inventory/stock/movements/00000000-0000-0000-0000-000000000000/reverse")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ reason: "test" })
        .expect(404);
    });
  });
});
