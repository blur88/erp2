import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { randomUUID } from "crypto";
import { DataSource, QueryRunner } from "typeorm";
import { AppModule } from "../src/app.module";

let app: INestApplication;
let ds: DataSource;
const categoryId = randomUUID();
const productId = randomUUID();
const immutableMovementId = randomUUID();
const immutableEntryId = randomUUID();
const immutableLayerId = randomUUID();
const immutableConsumptionId = randomUUID();

beforeAll(async () => {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleFixture.createNestApplication();
  await app.init();
  ds = app.get(DataSource);

  await ds.query(
    `INSERT INTO categories (id, name, slug) VALUES ($1, $2, $3)`,
    [
      categoryId,
      `valuation-schema-${categoryId}`,
      `valuation-schema-${categoryId}`,
    ],
  );
  await ds.query(
    `INSERT INTO products (id, name, slug, type, "baseCost", "stockQuantity", "categoryId")
     VALUES ($1, $2, $3, 'Stocked Product', 1, 1, $4)`,
    [
      productId,
      `valuation-schema-${productId}`,
      `valuation-schema-${productId}`,
      categoryId,
    ],
  );
  await ds.query(
    `UPDATE inventory_valuation_state SET status = 'inactive' WHERE id = true`,
  );
  await ds.query(
    `INSERT INTO stock_movements (id, "movementType", "movementDate", quantity, "previousBalance", "newBalance", "productId")
     VALUES ($1, 'initial_stock', now(), 1, 0, 1, $2)`,
    [immutableMovementId, productId],
  );
  await ds.query(
    `INSERT INTO stock_valuation_entries
       (id, "productId", "movementId", kind, method, quantity, value, "runningQuantity", "runningValue")
     VALUES ($1, $2, $3, 'opening', 'AVERAGE', 1, 1, 1, 1)`,
    [immutableEntryId, productId, immutableMovementId],
  );
  await ds.query(
    `INSERT INTO inventory_cost_layers
       (id, "productId", "sourceEntryId", quantity, "unitValue", "remainingQuantity", "remainingValue")
     VALUES ($1, $2, $3, 1, 1, 1, 1)`,
    [immutableLayerId, productId, immutableEntryId],
  );
  await ds.query(
    `INSERT INTO inventory_layer_consumptions (id, "layerId", "entryId", quantity, value)
     VALUES ($1, $2, $3, 1, 0)`,
    [immutableConsumptionId, immutableLayerId, immutableEntryId],
  );
});

afterEach(async () => {
  if (ds?.isInitialized) {
    const [schema] = await ds.query(
      `SELECT to_regclass('public.inventory_valuation_state') IS NOT NULL AS present`,
    );
    if (schema.present) {
      await ds.query(
        `UPDATE inventory_valuation_state SET status = 'inactive' WHERE id = true`,
      );
    }
  }
});

afterAll(async () => {
  if (ds?.isInitialized) {
    const [schema] = await ds.query(
      `SELECT to_regclass('public.inventory_valuation_state') IS NOT NULL AS present`,
    );
    if (schema.present) {
      await ds.query(
        `UPDATE inventory_valuation_state SET status = 'inactive' WHERE id = true`,
      );
      await ds.query(
        `TRUNCATE TABLE inventory_layer_consumptions, inventory_cost_layers, stock_valuation_entries, product_valuation_balances`,
      );
    }
    await ds.query(`DELETE FROM stock_movements WHERE "productId" = $1`, [
      productId,
    ]);
    await ds.query(`DELETE FROM products WHERE id = $1`, [productId]);
    await ds.query(`DELETE FROM categories WHERE id = $1`, [categoryId]);
  }
  await app.close();
});

async function transaction(
  fn: (qr: QueryRunner) => Promise<void>,
): Promise<void> {
  const qr = ds.createQueryRunner();
  await qr.connect();
  await qr.startTransaction();
  try {
    await fn(qr);
    await qr.commitTransaction();
  } catch (error) {
    if (qr.isTransactionActive) await qr.rollbackTransaction();
    throw error;
  } finally {
    await qr.release();
  }
}

async function insertMovement(
  qr: QueryRunner,
  movementId = randomUUID(),
): Promise<string> {
  await qr.query(
    `INSERT INTO stock_movements (id, "movementType", "movementDate", quantity, "previousBalance", "newBalance", "productId")
     VALUES ($1, 'initial_stock', now(), 1, 0, 1, $2)`,
    [movementId, productId],
  );
  return movementId;
}

async function insertValuationEntry(
  qr: QueryRunner,
  movementId: string,
): Promise<void> {
  await qr.query(
    `INSERT INTO stock_valuation_entries
       (id, "productId", "movementId", kind, method, quantity, value, "runningQuantity", "runningValue")
     VALUES ($1, $2, $3, 'opening', 'AVERAGE', 1, 1, 1, 1)`,
    [randomUUID(), productId, movementId],
  );
}

describe("inventory valuation schema (inactive)", () => {
  it("seeds exactly one inactive state row and rejects a second row", async () => {
    const rows = await ds.query(
      `SELECT id, status FROM inventory_valuation_state`,
    );
    expect(rows).toEqual([{ id: true, status: "inactive" }]);
    await expect(
      ds.query(
        `INSERT INTO inventory_valuation_state (id, status) VALUES (false, 'inactive')`,
      ),
    ).rejects.toThrow();
  });

  it("keeps valuation entries and layer consumptions immutable", async () => {
    await expect(
      ds.query(
        `UPDATE stock_valuation_entries SET explanation = 'rewrite' WHERE id = $1`,
        [immutableEntryId],
      ),
    ).rejects.toThrow(/immutable/i);
    await expect(
      ds.query(`DELETE FROM stock_valuation_entries WHERE id = $1`, [
        immutableEntryId,
      ]),
    ).rejects.toThrow(/immutable/i);
    await expect(
      ds.query(
        `UPDATE inventory_layer_consumptions SET value = 1 WHERE id = $1`,
        [immutableConsumptionId],
      ),
    ).rejects.toThrow(/immutable/i);
    await expect(
      ds.query(`DELETE FROM inventory_layer_consumptions WHERE id = $1`, [
        immutableConsumptionId,
      ]),
    ).rejects.toThrow(/immutable/i);
  });

  it("requires a valuation entry for each movement only while active", async () => {
    await expect(
      transaction(async (qr) => {
        await qr.query(
          `UPDATE inventory_valuation_state SET status = 'active' WHERE id = true`,
        );
        await insertMovement(qr);
      }),
    ).rejects.toThrow(/has no valuation entry while valuation is active/);

    await transaction(async (qr) => {
      await qr.query(
        `UPDATE inventory_valuation_state SET status = 'active' WHERE id = true`,
      );
      const movementId = await insertMovement(qr);
      await insertValuationEntry(qr, movementId);
    });

    await transaction(async (qr) => {
      await qr.query(
        `UPDATE inventory_valuation_state SET status = 'inactive' WHERE id = true`,
      );
      await insertMovement(qr);
    });
  });
});
