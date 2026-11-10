# Customer order metrics

This document owns the customer order metric rule and its transaction and migration
locking requirements. The work is specified in
[issue #1475](https://github.com/blur88/erp2/issues/1475), which re-applies
[PR #1369](https://github.com/blur88/erp2/pull/1369).

## Metric rule

For each customer, `totalOrders`, `totalSales`, `firstPurchaseDate` and
`lastPurchaseDate` are respectively the count, sum of `totalAmount`, minimum
`orderDate` and maximum `orderDate` of their orders with `status = 'FULFILLED'`
and `deletedAt IS NULL`. With no qualifying orders, the values are
`0`, `0`, `NULL`, `NULL`. Soft-deleted customers are included.

`orderDate` is a PostgreSQL `date`; the purchase metrics are `timestamptz`.
The [runtime helper](../../backend/src/modules/sales/services/customer-metrics.ts)
relies on assignment conversion, while the
[backfill](../../backend/src/database/migrations/1793020800000-RecalculateCustomerMetricsFromFulfilledOrders.ts)
explicitly casts `MIN` and `MAX` to `timestamptz`. Both convert calendar dates
to midnight in the database session time zone; the SQL expressions differ.

The migration includes every customer through a `LEFT JOIN`, skips rows whose
four metrics are already correct, and leaves `updatedAt` unchanged. Its `down()`
is a no-op. See the [deployment procedure](../deployment/DEPLOYMENT_CHECKLIST.md#customer-order-metrics-backfill-1475)
for the preflight, backup and backend inventory checks.

## Runtime transactions and lock order

Fulfil and unfulfil call `recalculateCustomerMetrics` last in their transaction,
after status, stock and accounting changes. A failed metrics write rolls back
those changes. The manual metrics route calls the same helper in a transaction.

The helper locks the customer row with `FOR NO KEY UPDATE`, then reads the
aggregate in a later statement. Under `READ COMMITTED`, that later statement
gets a fresh snapshot: a second transaction changing another order of the same
customer waits for the row lock and then includes the first transaction's
committed order. Reading the aggregate before the lock could overwrite the
customer with a total that misses that order. `FOR NO KEY UPDATE` permits the
key-share lock taken by an order insert's customer foreign key.

The current sequences in
[SalesOrderFulfillmentService](../../backend/src/modules/sales/services/sales-order-fulfillment.service.ts)
are:

- Fulfil: order row → all affected product rows in ascending ID order →
  for each item, all cost-batch rows with
  remaining stock (`purchase_cost_history`) → accounting posting work → customer
  row for metrics.
- Unfulfil: order row → all affected product rows in ascending ID order →
  for each item, restored cost-batch rows then the product
  base-cost update → product rows during stock-movement reversal →
  `stock_movements` rows deleted by `deleteByReference` → remaining
  `stock_movements` rows updated by `recalculateBalances` when balances change →
  accounting reversal work → customer row for metrics. When no cost batches
  exist, `restoreStock` returns before the product base-cost update.

These sequences include locks taken by `UPDATE` as well as explicit row locks.
The stock work is implemented by
[InventoryIntegrationService.adjustStock](../../backend/src/modules/sales/services/inventory-integration.service.ts),
[BaseCostCalculatorService.reduceStock/restoreStock](../../backend/src/modules/inventory/services/base-cost-calculator.service.ts)
and [StockMovementService.deleteByReference/recalculateBalances](../../backend/src/modules/inventory/services/stock-movement.service.ts).
Both paths take all product locks before any cost-batch mutation, following the
[inventory cost-batch lock order](../../CODING_STANDARDS.md#inventory-cost-batch-lock-order). The customer lock stays last; the helper does not acquire
order, product or accounting locks. The manual route acquires only the customer
row lock. Bank reconciliation's separate
[lock order](../modules/accounting/BANK_RECONCILIATION.md#lock-order) is unchanged.

## Backfill locking

The migration takes `LOCK TABLE sales_orders IN SHARE MODE` before reading
orders, as [PR #1369](https://github.com/blur88/erp2/pull/1369) did, which
[issue #1475](https://github.com/blur88/erp2/issues/1475) re-applies.
It waits for transactions that have written orders and blocks further order
writes until commit; reads continue. The later `UPDATE` therefore includes the
orders committed by transactions it waited for. Without that lock, a fulfilment
could commit after the aggregate snapshot and have its freshly calculated
metrics overwritten by the migration's older snapshot.

For blocked migrations and the single-backend inventory check and its rationale,
follow the [deployment procedure](../deployment/DEPLOYMENT_CHECKLIST.md#customer-order-metrics-backfill-1475).
