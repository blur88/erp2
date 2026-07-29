import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { DataSource } from "typeorm";
import { AppModule } from "../src/app.module";
import { Product } from "../src/database/entities/product.entity";

describe("trigram % operator compiles correctly (e2e)", () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    dataSource = moduleFixture.get(DataSource);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }
    await app.close();
  });

  it("renders an alias-qualified % predicate and binds the term", () => {
    const [sql, params] = dataSource
      .getRepository(Product)
      .createQueryBuilder("product")
      .where("(product.name % :q OR product.barcode % :q)")
      .setParameter("q", "widgex")
      .getQueryAndParameters();

    expect(sql).toContain(`"product"."name" % $1`);
    expect(sql).toContain(`"product"."barcode" % $1`);
    expect(params).toEqual(["widgex"]);
  });

  it("executes the % operator against the database", async () => {
    const rows = await dataSource.query(
      `SELECT 'widget'::text % 'widgex'::text AS matched`,
    );

    expect(rows[0].matched).toBe(true);
  });

  // The % predicates inherit pg_trgm's session similarity limit rather than
  // stating a threshold themselves, so the rewrite preserves the old
  // `similarity(...) > 0.3` result sets only while that limit is 0.3.
  // Nothing calls set_limit() today; this fails loudly if that ever changes.
  // PostgreSQL 18 removed the pg_trgm.similarity_threshold GUC name — the
  // limit is unchanged and is read with show_limit().
  it("uses the assumed 0.3 similarity limit", async () => {
    const [row] = await dataSource.query(`SELECT show_limit() AS limit`);

    expect(Number(row.limit)).toBeCloseTo(0.3);
  });
});
