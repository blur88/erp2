import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { DataSource, QueryRunner } from "typeorm";
import { AppModule } from "../src/app.module";
import { RestrictCostingMethods1792600000000 } from "../src/database/migrations/1792600000000-RestrictCostingMethods";

let app: INestApplication;
let ds: DataSource;

beforeAll(async () => {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleFixture.createNestApplication();
  await app.init();
  ds = app.get(DataSource);
});

afterAll(async () => {
  await app.close();
});

async function inRolledBackTxn(
  fn: (qr: QueryRunner) => Promise<void>,
): Promise<void> {
  const qr = ds.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    await qr.query(
      `ALTER TABLE regional_settings DROP CONSTRAINT IF EXISTS "CHK_regional_settings_costing_method"`,
    );
    await fn(qr);
  } finally {
    await qr.rollbackTransaction();
    await qr.release();
  }
}

describe("RestrictCostingMethods migration (#1398 P4 stage 1)", () => {
  it("aborts before changing constraints when an unsupported method exists", async () => {
    await inRolledBackTxn(async (qr) => {
      const [{ id }] = await qr.query(
        `SELECT id FROM regional_settings ORDER BY id LIMIT 1`,
      );
      await qr.query(
        `UPDATE regional_settings SET "costingMethod" = 'LIFO' WHERE id = $1`,
        [id],
      );
      const before = await qr.query(`
        SELECT conname FROM pg_constraint
         WHERE conrelid = 'regional_settings'::regclass AND contype = 'c'
         ORDER BY conname
      `);

      await expect(
        new RestrictCostingMethods1792600000000().up(qr),
      ).rejects.toThrow(
        new RegExp(
          `Unsupported costing method "LIFO" in regional_settings ${id}`,
        ),
      );

      const after = await qr.query(`
        SELECT conname FROM pg_constraint
         WHERE conrelid = 'regional_settings'::regclass AND contype = 'c'
         ORDER BY conname
      `);
      expect(after).toEqual(before);
      expect(
        (
          await qr.query(
            `SELECT "costingMethod" FROM regional_settings WHERE id = $1`,
            [id],
          )
        )[0],
      ).toEqual({ costingMethod: "LIFO" });
    });
  });

  it("adds the named check for supported data and rejects STANDARD", async () => {
    await inRolledBackTxn(async (qr) => {
      await qr.query(
        `UPDATE regional_settings SET "costingMethod" = 'AVERAGE'`,
      );
      await new RestrictCostingMethods1792600000000().up(qr);

      const [constraint] = await qr.query(`
        SELECT conname FROM pg_constraint
         WHERE conrelid = 'regional_settings'::regclass
           AND conname = 'CHK_regional_settings_costing_method'
      `);
      expect(constraint?.conname).toBe("CHK_regional_settings_costing_method");

      await expect(
        qr.query(`UPDATE regional_settings SET "costingMethod" = 'STANDARD'`),
      ).rejects.toMatchObject({
        code: "23514",
      });
    });
  });
});
