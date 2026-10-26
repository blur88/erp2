# Customer order metrics

This document owns the customer order metric rule and its transaction and migration
locking requirements. The rule and backfill requirements are recorded in
[issue #1475](https://github.com/blur88/erp2/issues/1475).

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

The sequence in
[SalesOrderFulfillmentService](../../backend/src/modules/sales/services/sales-order-fulfillment.service.ts)
is order row → stock work → accounting posting/reversal work → customer row
for metrics. Stock work updates product and cost-batch rows; the order lock
precedes those writes, and the customer lock stays last. At those row-lock
boundaries the order is order → products → customer. The helper does not acquire
order, product or accounting locks. This sequence describes the current code;
it does not introduce a sorting guarantee across all product locks. The manual
route acquires only the customer row lock. Bank reconciliation's separate
[lock order](../modules/accounting/BANK_RECONCILIATION.md#lock-order) is unchanged.

## Backfill locking

As required by [issue #1475](https://github.com/blur88/erp2/issues/1475), the
migration takes `LOCK TABLE sales_orders IN SHARE MODE` before reading orders.
It waits for transactions that have written orders and blocks further order
writes until commit; reads continue. The later `UPDATE` therefore includes the
orders committed by transactions it waited for. Without that lock, a fulfilment
could commit after the aggregate snapshot and have its freshly calculated
metrics overwritten by the migration's older snapshot.

An unfinished transaction that has written an order can block the migration
and queue order writes behind it. The table lock protects the backfill only;
it cannot keep an old backend maintaining a different rule after the migration
commits. The deployment procedure requires a single backend running the new image.
