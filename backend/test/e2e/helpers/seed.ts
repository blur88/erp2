// NOTE (issue #1199): `truncateAll()` and `seedAdmin()` were REMOVED.
//
// truncateAll() ran `TRUNCATE ... RESTART IDENTITY CASCADE` over 15 tables
// including `users` and `refresh_tokens`, destroying every other suite's
// fixtures on the shared e2e database. Probed directly: a live access token
// and its refresh token both 401 after an unrelated suite's cleanup.
//
// seedAdmin() unconditionally INSERTed username "admin" and only worked
// because truncateAll() emptied `users` immediately before it — a second
// caller violates the username unique constraint (23505) on the first run.
// The two could not be removed separately.
//
// Replacements: `test/utils/shared-e2e-fixture.ts` (suite-owned admins) and
// `test/utils/shared-e2e-business-fixture.ts` (own-rows business cleanup).
// Do not reintroduce a global truncate here.

import { DataSource } from "typeorm";
import { Category } from "../../../src/database/entities/category.entity";
import { Product } from "../../../src/database/entities/product.entity";
import { PaymentMethodEntity } from "../../../src/database/entities/payment-method.entity";

let productSeedCounter = 0;

/**
 * Per-process fixture discriminator (issue #1199).
 *
 * The seed defaults below used to be unique only "within one truncation
 * window" — `truncateAll()` emptied `products` first, so a counter restarting
 * at 1 in each Jest process could not collide. With the truncate gone, rows
 * from a previous suite survive and `Test Product 1` collides on
 * UQ_products_lower_name (a case-insensitive unique index). Mixing the pid and
 * a timestamp into the default makes it unique across processes and runs.
 *
 * Fixed in the shared helper rather than in each caller: a spec-local
 * workaround leaves the next caller of the default to rediscover the same
 * failure.
 */
const SEED_RUN_ID = `${process.pid}-${Date.now().toString(36)}`;
let categorySeedCounter = 0;

export async function seedCategory(
  dataSource: DataSource,
  name = `Test Category ${SEED_RUN_ID}-${++categorySeedCounter}`,
): Promise<Category> {
  const categoryRepo = dataSource.getRepository(Category);
  return categoryRepo.save(categoryRepo.create({ name, level: 0 }));
}

export async function seedProduct(
  dataSource: DataSource,
  categoryId: string,
  overrides: Partial<{
    name: string;
    baseCost: number;
    stockQuantity: number;
  }> = {},
): Promise<Product> {
  const productRepo = dataSource.getRepository(Product);
  return productRepo.save(
    productRepo.create({
      // Products are case-insensitively unique by name
      // (UQ_products_lower_name), so the default must be unique per call AND
      // across processes — nothing truncates this table any more (#1199).
      name:
        overrides.name ?? `Test Product ${SEED_RUN_ID}-${++productSeedCounter}`,
      categoryId,
      baseCost: overrides.baseCost ?? 100,
      stockQuantity: overrides.stockQuantity ?? 0,
      isActive: true,
    }),
  );
}

export async function seedPaymentMethod(
  dataSource: DataSource,
): Promise<PaymentMethodEntity> {
  const pmRepo = dataSource.getRepository(PaymentMethodEntity);
  let pm = await pmRepo.findOne({ where: { code: "CASH" } });
  if (!pm) {
    pm = await pmRepo.save(pmRepo.create({ code: "CASH", name: "Cash" }));
  }
  return pm;
}

export async function seedDocumentNumberSettings(
  dataSource: DataSource,
): Promise<void> {
  const currentYY = new Date().getFullYear() % 100;
  const configs = [
    { documentName: "Purchase Orders", prefix: "PO", paddingDigits: 3 },
    { documentName: "Goods Received", prefix: "GRN", paddingDigits: 3 },
  ];
  for (const cfg of configs) {
    await dataSource.query(
      `INSERT INTO document_number_settings ("documentName", prefix, "paddingDigits", "nextNumber", "lastResetYear")
       VALUES ($1, $2, $3, 1, $4)
       ON CONFLICT ("documentName") DO NOTHING`,
      [cfg.documentName, cfg.prefix, cfg.paddingDigits, currentYY],
    );
  }
}
