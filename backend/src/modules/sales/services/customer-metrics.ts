import { EntityManager } from "typeorm";
import { SalesOrderStatus } from "../../../database/entities/sales-order.entity";

/**
 * Recalculates stored customer order metrics inside the caller's transaction.
 * Returns false when the customer row does not exist.
 *
 * Rule, date conversion and lock ordering are owned by
 * docs/backend/customer-metrics.md. Lock before reading the aggregate below.
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
