# Sales Analytics Filter Propagation & Gap Filling — Design Spec

**Issue:** #228
**Date:** 2026-03-30
**File:** `backend/src/modules/sales/services/sales-analytics.service.ts`

---

## Problem

In the Sales Overview dashboard, the Sales Trend chart, Top Products list, and Top Customers list do not respect all applied filters (`customerId`, `salesRepId`, `paymentStatus`). The metric cards update correctly but the chart and lists show company-wide data regardless of filters.

Additionally, `getPeriodData` returns only days/periods that have orders, so a month with orders on one day renders as a single data point instead of a full trend line.

---

## Root Cause

Three private helper methods are missing filter conditions that are present in `calculateSalesMetrics`:

| Method | Missing filters |
|---|---|
| `getPeriodData` | `customerId`, `salesRepId`, `paymentStatus` |
| `getTopCustomers` | `salesRepId` |
| `getTopProducts` | `customerId`, `salesRepId` |

`getPeriodData` also does no gap-filling — it returns only periods with actual orders.

---

## Fix 1: Filter Propagation

Add missing `andWhere` conditions to each method, following the exact pattern used in `calculateSalesMetrics`.

### `getPeriodData`

```ts
if (query?.customerId) {
  periodQuery = periodQuery.andWhere('order.customerId = :customerId', { customerId: query.customerId });
}
if (query?.salesRepId) {
  periodQuery = periodQuery.andWhere('order.createdByUserId = :salesRepId', { salesRepId: query.salesRepId });
}
if (query?.paymentStatus) {
  periodQuery = periodQuery
    .leftJoin('order.invoices', 'invoice')
    .andWhere('invoice.status = :paymentStatus', { paymentStatus: query.paymentStatus });
}
```

### `getTopCustomers`

```ts
if (query?.salesRepId) {
  topCustomersQuery = topCustomersQuery.andWhere('order.createdByUserId = :salesRepId', { salesRepId: query.salesRepId });
}
```

### `getTopProducts`

```ts
if (query?.customerId) {
  topProductsQuery = topProductsQuery.andWhere('order.customerId = :customerId', { customerId: query.customerId });
}
if (query?.salesRepId) {
  topProductsQuery = topProductsQuery.andWhere('order.createdByUserId = :salesRepId', { salesRepId: query.salesRepId });
}
```

---

## Fix 2: Gap Filling

Extract a private pure method `fillPeriodGaps` in `SalesAnalyticsService`:

```ts
private fillPeriodGaps(
  data: PeriodMetricDto[],
  startDate: Date,
  endDate: Date,
  groupBy: string,
): PeriodMetricDto[]
```

### Behavior

1. Generate all expected period label strings between `startDate` and `endDate` for the given `groupBy` using `date-fns`.
2. Build a `Map<string, PeriodMetricDto>` from the sparse DB results.
3. For each expected label, return the existing row or a zero-value entry: `{ period, revenue: 0, orders: 0, newCustomers: 0, averageOrderValue: 0 }`.

### Period label generation

| `groupBy` | Format | Generation |
|---|---|---|
| `day` | `YYYY-MM-DD` | Iterate `+1 day` from start to end |
| `week` | `IYYY-IW` | Iterate `+1 week`; format with `date-fns` `getISOWeekYear` + `getISOWeek`, zero-padded |
| `month` | `YYYY-MM` | Iterate `+1 month` |
| `quarter` | `YYYY-"Q"Q` | Iterate `+3 months`; derive Q number from month index |
| `year` | `YYYY` | Iterate `+1 year` |

The week format must match PostgreSQL's `TO_CHAR(date, 'IYYY-IW')` output exactly (ISO week year, 2-digit week number zero-padded).

### Call site

Replace the bare `return data.map(...)` at the end of `getPeriodData` with:

```ts
const mapped = data.map(item => ({ ... }));
return this.fillPeriodGaps(mapped, startDate, endDate, groupBy);
```

Gap-filling applies to both the current period and the comparison period (both go through `getPeriodData`), so no additional changes are needed for comparison.

---

## Tests

Add to `sales-analytics.service.spec.ts`:

### Filter propagation (query builder spy tests)

- `getPeriodData` with `customerId` → `andWhere` called with `order.customerId = :customerId`
- `getPeriodData` with `salesRepId` → `andWhere` called with `order.createdByUserId = :salesRepId`
- `getPeriodData` with `paymentStatus` → LEFT JOIN on invoices + `andWhere` on `invoice.status`
- `getTopCustomers` with `salesRepId` → `andWhere` called with `order.createdByUserId = :salesRepId`
- `getTopProducts` with `customerId` + `salesRepId` → both `andWhere` calls present

### Gap filling (pure unit tests, no DB mock needed)

Call `(service as any).fillPeriodGaps(sparseData, startDate, endDate, groupBy)` directly:

- `day`: 5-day range, orders on day 1 and day 5 only → 5 entries returned, days 2–4 have zeros
- `week`: 3-week range, one week has orders → 3 entries, other weeks have zeros
- `month`: 3-month range, one month has orders → 3 entries
- `quarter`: 2-quarter range, one quarter has orders → 2 entries
- `year`: 2-year range, one year has orders → 2 entries
- Empty DB result → all zeros for the full range
- Single-day range, one order → 1 entry with that order's data

---

## Out of Scope

- No changes to DTOs, controllers, or frontend.
- No changes to `getRevenueDataByPeriod` (used by the Revenue Report, a separate endpoint not affected by this issue).
- No changes to comparison period filter propagation (comparison calls do not pass a `query` object by design — they show company-wide trends for the comparison baseline).
