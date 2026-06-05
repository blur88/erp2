import { MigrationInterface, QueryRunner } from "typeorm";

export class FulfillmentOnlyCustomerMetrics1746700000000 implements MigrationInterface {
  name = "FulfillmentOnlyCustomerMetrics1746700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "customers" c
      SET
        "totalOrders" = sub.cnt,
        "totalSales" = sub.total,
        "firstPurchaseDate" = sub.first_date,
        "lastPurchaseDate" = sub.last_date
      FROM (
        SELECT
          "customerId",
          COUNT(*) AS cnt,
          COALESCE(SUM("totalAmount"), 0) AS total,
          MIN("orderDate") AS first_date,
          MAX("orderDate") AS last_date
        FROM "sales_orders"
        WHERE "deletedAt" IS NULL
          AND "isFulfilled" = true
        GROUP BY "customerId"
      ) sub
      WHERE c.id = sub."customerId"
    `);

    await queryRunner.query(`
      UPDATE "customers"
      SET
        "totalOrders" = 0,
        "totalSales" = 0,
        "firstPurchaseDate" = NULL,
        "lastPurchaseDate" = NULL
      WHERE id NOT IN (
        SELECT DISTINCT "customerId"
        FROM "sales_orders"
        WHERE "deletedAt" IS NULL
          AND "isFulfilled" = true
      )
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No-op: recalculated data cannot be meaningfully reversed.
  }
}
