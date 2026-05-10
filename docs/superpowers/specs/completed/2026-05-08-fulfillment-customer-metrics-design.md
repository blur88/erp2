# Design: Fulfillment-Only Customer Metrics (Issue #544)

## Problem

Customer Account Summary shows metrics (Total Orders, Total Sales, First/Last Purchase Dates) that include unfulfilled and deleted orders. For example, a customer shows 9 orders in the summary but only 3 in the order list. This is because `updateSalesMetrics()` fires on order **creation**, not on fulfillment, and is never reversed on deletion.

## Solution

Transition all customer sales metrics to be based exclusively on fulfilled orders. Metrics are recalculated from the database on every fulfillment state change, rather than incremented/decremented inline.

---

## Section 1: Core Metric Query Change

**Affected methods in `CustomerService`:**

- `updateCustomerMetrics(customerId)` — add `AND order.isFulfilled = true` filter
- `recalculateAllCustomerTotals()` — add same filter
- `getCustomerStatistics(customerId)` — add same filter (used by Account Summary page)

**Query shape (post-change):**
```ts
.where('order.customerId = :customerId', { customerId })
.andWhere('order.deletedAt IS NULL')
.andWhere('order.isFulfilled = true')   // new
.select([
  'COUNT(*) as totalOrders',
  'COALESCE(SUM(order.totalAmount), 0) as totalSales',
  'MIN(order.orderDate) as firstOrderDate',   // orderDate, not fulfilledDate
  'MAX(order.orderDate) as lastOrderDate',
])
```

`averageOrderValue` is a computed getter on the entity (`totalSales / totalOrders`) — no change needed there.

---

## Section 2: Trigger Points

**What gets removed:**
- `updateCustomerSalesMetrics()` private method in `SalesOrderService` (called on order creation, line ~277)
- The call to it inside `SalesOrderService.create()`

Metrics no longer update on order creation. They only move when fulfillment status changes.

**What gets re-enabled:**
- `CustomerService` injection in `SalesOrderService` constructor (currently commented out at lines 75-76 of `sales-order.service.ts`)

**Trigger points — all in `SalesOrderService` (the façade), called after delegating to sub-services:**

| Method | Trigger | Note |
|---|---|---|
| `fulfillOrder()` | After `salesOrderFulfillmentService.fulfillOrder()` | `customerId` on the returned order |
| `unfulfillOrder()` | After `salesOrderFulfillmentService.unfulfillOrder()` | `customerId` on the returned order |
| `delete()` | After `salesOrderLifecycleService.delete()` | Load `customerId` from order before delete |
| `restore()` | After `salesOrderLifecycleService.restore()` | `customerId` on the restored order |
| `permanentDelete()` | After `salesOrderLifecycleService.permanentDelete()` | Load `customerId` before delegating; lifecycle service returns void |

**Pattern for each trigger:**
```ts
await this.customerService.updateCustomerMetrics(customerId);
```

Failures in metric updates are caught and logged (non-fatal) — same pattern already used for accounting entry posting in `SalesOrderFulfillmentService`.

---

## Section 3: Data Migration

A TypeORM migration runs automatically on deploy (`migration:run`) to fix all existing customer data. It is self-contained raw SQL — no NestJS DI dependency.

**Step 1 — Recalculate metrics for customers with fulfilled orders:**
```sql
UPDATE customers c
SET
  total_orders        = sub.cnt,
  total_sales         = sub.total,
  first_purchase_date = sub.first_date,
  last_purchase_date  = sub.last_date
FROM (
  SELECT
    customer_id,
    COUNT(*)                       AS cnt,
    COALESCE(SUM(total_amount), 0) AS total,
    MIN(order_date)                AS first_date,
    MAX(order_date)                AS last_date
  FROM sales_orders
  WHERE deleted_at IS NULL
    AND is_fulfilled = true
  GROUP BY customer_id
) sub
WHERE c.id = sub.customer_id;
```

**Step 2 — Zero out customers with no fulfilled orders:**
```sql
UPDATE customers
SET
  total_orders        = 0,
  total_sales         = 0,
  first_purchase_date = NULL,
  last_purchase_date  = NULL
WHERE id NOT IN (
  SELECT DISTINCT customer_id
  FROM sales_orders
  WHERE deleted_at IS NULL
    AND is_fulfilled = true
);
```

**`down()` migration:** No-op — recalculated data cannot be meaningfully reversed.

---

## Files to Change

| File | Change |
|---|---|
| `services/customer.service.ts` | Add `isFulfilled = true` filter to `updateCustomerMetrics()`, `recalculateAllCustomerTotals()`, `getCustomerStatistics()` |
| `services/sales-order.service.ts` | Remove `updateCustomerSalesMetrics()` and its call in `create()`; uncomment `CustomerService` injection; add `updateCustomerMetrics()` calls after fulfill/unfulfill/delete/restore/permanentDelete |
| `migrations/TIMESTAMP-FulfillmentOnlyCustomerMetrics.ts` | New migration with the two-step SQL recalculation |

---

## Success Criteria

- Account Summary `totalOrders` matches the count of fulfilled orders in the order list
- `totalSales` = sum of `totalAmount` on fulfilled (fully-paid) orders
- `averageOrderValue` = `totalSales / totalOrders` (no change, already computed)
- `firstPurchaseDate` / `lastPurchaseDate` reflect `orderDate` of earliest/latest fulfilled order
- Fulfilling an order increments metrics; unfulfilling reverses them
- Soft-deleting or restoring an order triggers a recalculation
- Existing data corrected on deploy via migration
