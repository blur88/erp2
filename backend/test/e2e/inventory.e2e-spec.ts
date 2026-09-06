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
import { configureTestAppValidation } from "../utils/configure-test-app-validation";

describe("Inventory (e2e)", () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let accessToken: string;
  let categoryId: string;
  let productId: string;

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
      .post("/auth/login")
      .send({
        usernameOrEmail: E2E_ADMIN_USERNAMES.inventory,
        password: E2E_ADMIN_PASSWORD,
      });
    accessToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      // categoryId/productId are created through the API by the cases below.
      await resetSuiteBusinessRows(dataSource, {
        categoryIds: categoryId ? [categoryId] : [],
        productIds: productId ? [productId] : [],
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

    it("PATCH /inventory/products/:id — updates the product", async () => {
      const res = await request(app.getHttpServer())
        .patch(`/inventory/products/${productId}`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ name: "Laptop Pro 15 Updated", categoryId, baseCost: 850 })
        .expect(200);

      expect(res.body.name).toBe("Laptop Pro 15 Updated");
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
      const category = await seedCategory(dataSource, "Edge Case Category");

      await request(app.getHttpServer())
        .post("/inventory/products")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "Product A",
          categoryId: category.id,
          baseCost: 10,
          barcode: "BARCODE-001",
        })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post("/inventory/products")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "Product B",
          categoryId: category.id,
          baseCost: 10,
          barcode: "BARCODE-001",
        })
        .expect(409);

      expect(res.body.message).toBeDefined();
    });
  });
});
