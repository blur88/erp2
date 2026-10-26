import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Backfills stored customer order metrics for issue #1475.
 * The rule, date conversion and SHARE-lock reasoning are owned by
 * docs/backend/customer-metrics.md; this migration keeps its SQL self-contained.
 */
export class RecalculateCustomerMetricsFromFulfilledOrders1793020800000 implements MigrationInterface {
  name = "RecalculateCustomerMetricsFromFulfilledOrders1793020800000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`LOCK TABLE sales_orders IN SHARE MODE`);

    await queryRunner.query(`
      UPDATE customers AS c
         SET "totalOrders" = t.order_count,
             "totalSales" = t.total_sales,
             "firstPurchaseDate" = t.first_order_date,
             "lastPurchaseDate" = t.last_order_date
        FROM (
          SELECT every_customer.id,
                 COALESCE(s.order_count, 0) AS order_count,
                 COALESCE(s.total_sales, 0) AS total_sales,
                 s.first_order_date,
                 s.last_order_date
            FROM customers AS every_customer
            LEFT JOIN (
              SELECT o."customerId",
                     COUNT(*)::int AS order_count,
                     SUM(o."totalAmount") AS total_sales,
                     MIN(o."orderDate")::timestamptz AS first_order_date,
                     MAX(o."orderDate")::timestamptz AS last_order_date
                FROM sales_orders o
               WHERE o."deletedAt" IS NULL
                 AND o.status = 'FULFILLED'
               GROUP BY o."customerId"
            ) AS s ON s."customerId" = every_customer.id
        ) AS t
       WHERE c.id = t.id
         AND (c."totalOrders", c."totalSales", c."firstPurchaseDate", c."lastPurchaseDate")
             IS DISTINCT FROM
             (t.order_count, t.total_sales, t.first_order_date, t.last_order_date)
    `);
  }

  public async down(): Promise<void> {
    // Nothing to restore: the values this replaced were not maintained and were
    // not recorded.
  }
}
