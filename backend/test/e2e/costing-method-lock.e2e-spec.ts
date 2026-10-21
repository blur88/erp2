import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { randomUUID } from "crypto";
import { DataSource } from "typeorm";
import { AppModule } from "../../src/app.module";
import { configureTestAppValidation } from "../utils/configure-test-app-validation";
import { SESSION_PROTOCOL } from "../utils/session-protocol";
import {
  E2E_ADMIN_PASSWORD,
  removeSuiteAdmin,
  seedSuiteAdmin,
} from "../utils/shared-e2e-fixture";

let app: INestApplication;
let ds: DataSource;
let accessToken: string;
const adminUsername = "e2espec_costing_lock_admin";

beforeAll(async () => {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleFixture.createNestApplication();
  configureTestAppValidation(app);
  await app.init();
  ds = app.get(DataSource);
  await seedSuiteAdmin(ds, adminUsername);
  const login = await request(app.getHttpServer())
    .post("/auth/login")
    .set(...SESSION_PROTOCOL)
    .send({ usernameOrEmail: adminUsername, password: E2E_ADMIN_PASSWORD })
    .expect(200);
  accessToken = login.body.accessToken;
});

afterAll(async () => {
  if (ds?.isInitialized) await removeSuiteAdmin(ds, adminUsername);
  await app.close();
});

describe("regional costing method lock", () => {
  it("refuses a changed method after a stock movement and reports the lock", async () => {
    const id = randomUUID();
    const categoryId = randomUUID();
    const productId = randomUUID();
    const originalSettings = await ds.query(
      `SELECT "costingMethod" FROM regional_settings WHERE "isActive" = true LIMIT 1`,
    );

    await ds.query(
      `INSERT INTO categories (id, name, slug) VALUES ($1, $2, $3)`,
      [categoryId, `costing lock ${id}`, `costing-lock-${id}`],
    );
    await ds.query(
      `INSERT INTO products (id, name, slug, type, "baseCost", "stockQuantity", "categoryId")
       VALUES ($1, $2, $3, 'Stocked Product', 1, 1, $4)`,
      [productId, `costing lock ${id}`, `costing-lock-${id}`, categoryId],
    );
    await ds.query(
      `INSERT INTO stock_movements ("movementType", "movementDate", quantity, "previousBalance", "newBalance", "productId")
       VALUES ('initial_stock', now(), 1, 0, 1, $1)`,
      [productId],
    );

    try {
      const update = await request(app.getHttpServer())
        .put("/settings/regional")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ costingMethod: "FIFO" });
      expect(update.status).toBe(409);
      expect(update.body.message).toBe(
        "The costing method cannot be changed directly once stock has moved. Use a costing method change (Inventory → Valuation).",
      );

      const settings = await request(app.getHttpServer())
        .get("/settings/regional")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);
      expect(settings.body.costingMethodLocked).toBe(true);
      expect(settings.body.costingMethod).toBe(
        originalSettings[0]?.costingMethod,
      );
    } finally {
      await ds.query(`DELETE FROM stock_movements WHERE "productId" = $1`, [
        productId,
      ]);
      await ds.query(`DELETE FROM products WHERE id = $1`, [productId]);
      await ds.query(`DELETE FROM categories WHERE id = $1`, [categoryId]);
    }
  });
});
