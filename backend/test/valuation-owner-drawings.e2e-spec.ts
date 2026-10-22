import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { DataSource } from "typeorm";
import { AppModule } from "../src/app.module";
import { seedCategory, seedProduct } from "./e2e/helpers/seed";
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

describe("Owner drawings under active inventory valuation", () => {
  let app: INestApplication;
  let ds: DataSource;
  let token: string;
  let categoryId: string;
  const productIds: string[] = [];
  const refs: string[] = [];
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
    categoryId = (await seedCategory(ds, `valuation-owner-${RUN}`)).id;
    await seedProduct(ds, categoryId, {
      stockQuantity: 10,
      baseCost: 10,
      name: `Valuation Owner Product ${RUN}`,
    }).then((p) => productIds.push(p.id));
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
      const docs: Array<{ id: string }> = await ds.query(
        `SELECT id FROM owner_equity_documents WHERE "referenceNumber" = ANY($1)`,
        [refs.length ? refs : [zero]],
      );
      const docIds = docs.map((row) => row.id);
      const entries = await ds.query(
        `SELECT id FROM journal_entry WHERE "sourceDocumentId" = ANY($1)`,
        [docIds.length ? docIds : [zero]],
      );
      await ds.query(`DELETE FROM journal_entry WHERE id = ANY($1)`, [
        entries.map((row: any) => row.id),
      ]);
      await ds.query(`DELETE FROM owner_equity_documents WHERE id = ANY($1)`, [
        docIds.length ? docIds : [zero],
      ]);
      await removeSuiteTraces(ds, {
        usernames: [USERNAME],
        entityIds: [categoryId, ...productIds, ...docIds],
      });
      await resetSuiteBusinessRows(ds, {
        categoryIds: [categoryId],
        productIds,
      });
      await removeSuiteAdmin(ds, USERNAME);
    }
    await app.close();
  });

  async function createDrawing(quantity: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post("/accounting/owner-equity")
      .set(auth())
      .send({
        type: "STOCK_DRAWING",
        equityDate: "2026-10-21",
        description: "Valuation owner drawing",
        productId: productIds[0],
        quantity,
      })
      .expect(201);
    const doc = response.body.data ?? response.body;
    refs.push(doc.referenceNumber);
    return doc.referenceNumber;
  }

  it("draws and reverses at the inventory pool value, not baseCost", async () => {
    const productId = productIds[0];
    await ds.query(
      `INSERT INTO purchase_cost_history ("productId", "unitCost", "shippingPerUnit", "landedCost", "receivedQuantity", "remainingQuantity", "receivedDate") VALUES ($1, 100, 0, 100, 10, 10, '2025-01-01')`,
      [productId],
    );
    await activateValuationForTest(ds, {
      method: "AVERAGE",
      products: [{ productId, quantity: "10", value: "1000.00" }],
    });
    const reference = await createDrawing("3");
    await request(app.getHttpServer())
      .post(`/accounting/owner-equity/${reference}/complete`)
      .set(auth())
      .expect(201);
    const [entry] = await ds.query(
      `SELECT value::text AS value, "runningQuantity"::text AS quantity FROM stock_valuation_entries WHERE "productId" = $1 AND kind = 'issue'`,
      [productId],
    );
    expect(entry).toEqual({ value: "-300.00", quantity: "7.0000" });
    const [doc] = await ds.query(
      `SELECT "unitCost"::text AS unit, "totalCost"::text AS total FROM owner_equity_documents WHERE "referenceNumber" = $1`,
      [reference],
    );
    expect(doc).toEqual({ unit: "100.0000", total: "300.0000" });
    await request(app.getHttpServer())
      .post(`/accounting/owner-equity/${reference}/uncomplete`)
      .set(auth())
      .expect(201);
    const reversal = await ds.query(
      `SELECT kind, value::text AS value FROM stock_valuation_entries WHERE "productId" = $1 AND kind = 'decrease_reversal'`,
      [productId],
    );
    expect(reversal).toEqual([{ kind: "decrease_reversal", value: "300.00" }]);
  });
  it("refuses to reverse a drawing made before valuation activation", async () => {
    const productId = productIds[0];
    const reference = await createDrawing("3");
    await request(app.getHttpServer())
      .post(`/accounting/owner-equity/${reference}/complete`)
      .set(auth())
      .expect(201);
    await activateValuationForTest(ds, {
      method: "AVERAGE",
      products: [{ productId, quantity: "7", value: "70.00" }],
    });
    await request(app.getHttpServer())
      .post(`/accounting/owner-equity/${reference}/uncomplete`)
      .set(auth())
      .expect(409)
      .expect(({ body }) =>
        expect(body.message).toContain(
          "This drawing predates inventory valuation",
        ),
      );
  });

  it("keeps the legacy owner drawing path unchanged while valuation is inactive", async () => {
    await deactivateValuationForTest(ds);
    const productId = productIds[0];
    const [before] = await ds.query(
      `SELECT "stockQuantity"::text AS quantity FROM products WHERE id=$1`,
      [productId],
    );
    const reference = await createDrawing("2");
    await request(app.getHttpServer())
      .post(`/accounting/owner-equity/${reference}/complete`)
      .set(auth())
      .expect(201);
    const [product] = await ds.query(
      `SELECT "stockQuantity"::text AS quantity FROM products WHERE id=$1`,
      [productId],
    );
    const [valuation] = await ds.query(
      `SELECT count(*)::int AS count FROM stock_valuation_entries WHERE "productId"=$1`,
      [productId],
    );
    expect(Number(product.quantity)).toBe(Number(before.quantity) - 2);
    expect(valuation.count).toBe(0);
  });
});
