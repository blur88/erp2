import { EntityManager } from 'typeorm';
import { SalesOrderStatus } from '../../../database/entities/sales-order.entity';

/**
 * Recalculates a customer's four stored order metrics (`totalOrders`,
 * `totalSales`, `firstPurchaseDate`, `lastPurchaseDate`) from their fulfilled,
 * non-deleted sales orders. A customer with none is reset to 0, 0, NULL, NULL.
 *
 * Call it inside the transaction that changes which orders are fulfilled, after
 * that change is written. The customer row is locked first and the aggregate is
 * read by a later statement: under READ COMMITTED each statement takes a fresh
 * snapshot, so a second transaction that fulfils another order of the same
 * customer waits on the lock and then counts the first one's committed order.
 * Reading the aggregate before taking the lock would let the two overwrite each
 * other with a count that misses one order.
 *
 * `FOR NO KEY UPDATE` is the lock the UPDATE itself takes. It does not conflict
 * with the key-share lock a sales order insert takes on its customer.
 *
 * The purchase dates are `timestamptz` and `orderDate` is a `date`; Postgres
 * converts at midnight in the session time zone. The backfill migration (#1355)
 * uses the same expression on the same connection settings.
 *
 * Returns false when the customer row does not exist.
 */
export async function recalculateCustomerMetrics(
  manager: EntityManager,
  customerId: string,
): Promise<boolean> {
  const locked: unknown[] = await manager.query(
    `SELECT 1 FROM customers WHERE id = $1 FOR NO KEY UPDATE`,
    [customerId],
  );
  if (locked.length === 0) {
    return false;
  }

  await manager.query(
    `UPDATE customers AS c
        SET "totalOrders" = s.order_count,
            "totalSales" = s.total_sales,
            "firstPurchaseDate" = s.first_order_date,
            "lastPurchaseDate" = s.last_order_date
       FROM (
         SELECT COUNT(*)::int AS order_count,
                COALESCE(SUM(o."totalAmount"), 0) AS total_sales,
                MIN(o."orderDate") AS first_order_date,
                MAX(o."orderDate") AS last_order_date
           FROM sales_orders o
          WHERE o."customerId" = $1
            AND o."deletedAt" IS NULL
            AND o.status = $2
       ) AS s
      WHERE c.id = $1`,
    [customerId, SalesOrderStatus.FULFILLED],
  );
  return true;
}
