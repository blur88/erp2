import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AppModule } from "../src/app.module";

import { configureTestAppValidation } from "./utils/configure-test-app-validation";

const TRIGRAM_INDEXES = [
  "idx_products_name_trgm",
  "idx_products_barcode_trgm",
  "idx_customers_name_trgm",
  "idx_customers_phone_trgm",
  "idx_suppliers_companyname_trgm",
  "idx_sales_orders_ordernumber_trgm",
  "idx_purchase_orders_ordernumber_trgm",
  "idx_vendor_payments_referencenumber_trgm",
];

describe("trigram indexes produce no schema drift (e2e)", () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureTestAppValidation(app);
    await app.init();
    dataSource = moduleFixture.get(DataSource);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    await app.close();
  });

  it("proposes no create or drop for any trigram index", async () => {
    const sql = await dataSource.driver.createSchemaBuilder().log();
    const statements = [...sql.upQueries, ...sql.downQueries].map((q) => q.query);

    const offending = statements.filter((s) =>
      TRIGRAM_INDEXES.some((name) => s.includes(name)),
    );

    // Unrelated drift (e.g. expenses.paidAmount) is permitted and ignored.
    expect(offending).toEqual([]);
  });
});
