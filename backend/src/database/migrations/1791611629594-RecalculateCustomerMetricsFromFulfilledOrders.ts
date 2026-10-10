import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Recalculates the four stored order metrics of every customer from their
 * fulfilled, non-deleted sales orders (#1355).
 *
 * Nothing has maintained these columns since the calls that did were removed
 * with the status/paymentStatus lifecycle change (596857366), and the query
 * behind the manual route failed in Postgres. #1355 puts the recalculation
 * back inside the fulfil and unfulfil transactions; this brings the rows
 * already stored into line with the same rule:
 *
 *   status = 'FULFILLED' AND "deletedAt" IS NULL
 *
 * A customer with no such order is reset to 0, 0, NULL, NULL. The LEFT JOIN
 * from `customers` is what reaches those customers: an inner join to the
 * aggregate would skip them and leave their stale values in place.
 * Soft-deleted customers are included, as they are at runtime. Rows that are
 * already correct are not rewritten, and `updatedAt` is not touched.
 *
 * `LOCK TABLE sales_orders IN SHARE MODE` is what makes the result correct
 * while orders are being written. It waits for every transaction that has
 * already written an order, and blocks new order writes until this migration
 * commits; reads are not blocked. The UPDATE is a later statement, so under
 * READ COMMITTED its snapshot includes everything those transactions
 * committed. Without the lock, a fulfilment that committed after the UPDATE's
 * snapshot was taken would have its recalculated customer row overwritten from
 * that older snapshot.
 *
 * The purchase dates are `timestamptz` and `orderDate` is a `date`: the cast is
 * midnight in the session time zone, as in recalculateCustomerMetrics().
 */
export class RecalculateCustomerMetricsFromFulfilledOrders1791611629594
  implements MigrationInterface
{
  name = 'RecalculateCustomerMetricsFromFulfilledOrders1791611629594';

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
