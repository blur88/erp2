---
title: Issue #194 — Purchasing Dashboard Filters
date: 2026-03-27
status: approved
---

## Objective

Align the Purchasing Overview page with the Sales Overview page by adding standard dashboard filters (Period, Comparison, Custom Range) and moving metric calculations to the backend.

---

## Part 1: Shared Analytics Enums

**New file:** `backend/src/common/dto/analytics.dto.ts`

Move `DateRange` and `GroupByPeriod` enums here from `sales-analytics.dto.ts`. Both enums are domain-agnostic and belong in `src/common/`.

Update `sales-analytics.dto.ts` to import them from `@/common/dto/analytics.dto` instead of defining them. No behavioral change.

---

## Part 2: Backend DTO

**New file:** `backend/src/modules/purchasing/dto/purchasing-analytics.dto.ts`

Imports `DateRange`, `GroupByPeriod` from `@/common/dto/analytics.dto`.

### `PurchasingAnalyticsQueryDto`
| Field | Type | Notes |
|-------|------|-------|
| `dateRange` | `DateRange` (optional) | Defaults to `this_month` |
| `startDate` | `Date` (optional) | Used when `dateRange = custom` |
| `endDate` | `Date` (optional) | Used when `dateRange = custom` |
| `compareWith` | `'previous_period' \| 'last_month' \| 'last_year'` (optional) | |
| `groupBy` | `GroupByPeriod` (optional) | Defaults to `month` |

### `PurchasingMetricsDto`
| Field | Type |
|-------|------|
| `totalSpent` | `number` |
| `totalOrders` | `number` |
| `averageOrderValue` | `number` |
| `activeSuppliers` | `number` |

### `PurchasingPeriodDataDto`
| Field | Type |
|-------|------|
| `period` | `string` |
| `spent` | `number` |
| `orders` | `number` |

### `PurchasingPeriodBlockDto`
| Field | Type |
|-------|------|
| `metrics` | `PurchasingMetricsDto` |
| `periodData` | `PurchasingPeriodDataDto[]` |
| `periodStart` | `string` |
| `periodEnd` | `string` |

### `TopSupplierDto`
| Field | Type |
|-------|------|
| `supplierId` | `string` |
| `supplierName` | `string` |
| `totalSpent` | `number` |
| `orderCount` | `number` |

### `RecentPurchaseOrderDto`
| Field | Type |
|-------|------|
| `orderNumber` | `string` |
| `orderDate` | `string` |
| `supplierName` | `string` |
| `totalAmount` | `number` |
| `status` | `string` (`'received'` \| `'pending'`) |

### `PurchasingAnalyticsResponseDto`
| Field | Type |
|-------|------|
| `current` | `PurchasingPeriodBlockDto` |
| `comparison` | `PurchasingPeriodBlockDto` (optional) |
| `topSuppliers` | `TopSupplierDto[]` (top 5) |
| `recentOrders` | `RecentPurchaseOrderDto[]` (5 most recent) |

---

## Part 3: Backend Service

Add `getPurchasingAnalytics(query: PurchasingAnalyticsQueryDto)` to `PurchasingAnalyticsService`.

### Logic
1. Call `parseDateRange(query.dateRange, query.startDate, query.endDate)` — copy the private helper from `SalesAnalyticsService` as-is. Both services keep their own copy; extracting to a shared utility is out of scope.
2. If `query.compareWith` is set, call `computeComparePeriod(start, end, query.compareWith)` — same approach.
3. Run current period queries in parallel:
   - Order stats: `SUM(totalAmount)`, `COUNT(*)`, `AVG(totalAmount)` where `orderDate BETWEEN start AND end`
   - Active suppliers: count of distinct suppliers with at least one PO in the period (filtered, not total non-deleted suppliers)
   - Period data: grouped by `groupBy` (day/week/month) — `SUM(totalAmount)` and `COUNT(*)` per bucket
   - Top suppliers: top 5 by `SUM(totalAmount)` in the period
   - Recent orders: 5 most recent by `orderDate DESC`, with supplier join
4. If comparison period exists, run the same stats queries in parallel for the comparison range. The comparison block includes `metrics` AND `periodData` (needed for the chart's comparison dataset), but does NOT include top suppliers or recent orders.
5. Return `PurchasingAnalyticsResponseDto`.

---

## Part 4: Backend Controller

Add to `PurchasingAnalyticsController`:

```
GET /purchasing/analytics/dashboard
```

Accepts `PurchasingAnalyticsQueryDto` via `@Query()` with `@Transform` on date fields. Returns `PurchasingAnalyticsResponseDto`.

---

## Part 5: Frontend Hook

**New file:** `frontend/src/pages/purchasing/hooks/usePurchasingAnalytics.ts`

Mirrors `frontend/src/pages/sales/hooks/useDashboardAnalytics.ts` exactly, with:
- Endpoint: `/purchasing/analytics/dashboard`
- Types renamed: `PurchasingAnalyticsData`, `PurchasingAnalyticsParams`, etc.
- Same abort-on-refetch pattern, same `{ data, isLoading, isFetching, error }` return shape

### `PurchasingAnalyticsData` interface
```ts
interface PurchasingAnalyticsData {
  current: PurchasingPeriodBlock
  comparison?: PurchasingPeriodBlock
  topSuppliers: TopSupplier[]
  recentOrders: RecentPurchaseOrder[]
}
```

---

## Part 6: Frontend Page (`PurchasingPage.tsx`)

### Remove
- `useGetPurchaseOrdersQuery` and `useGetSuppliersQuery` imports and calls
- All frontend metric calculations (supplier stats aggregation, period data generation, growth calculations)
- `purchasingData` computed object

### Add
```ts
const { period, compareWith, resolvedApiParams } = useDashboardFilters('purchasing')
const { data, isLoading, isFetching } = usePurchasingAnalytics(resolvedApiParams)
```

### Layout change
Insert `<DashboardFilterBar>` between `<PageHeader>` and the stats cards grid — same placement as `SalesPage.tsx`.

### Stats cards
Wire to `data?.current.metrics`. When `data?.comparison` is present, pass `comparisonValue` prop to each stat card (same pattern as `SalesPage.tsx`).

| Card | Value field | Comparison field |
|------|-------------|-----------------|
| Total Spending | `current.metrics.totalSpent` | `comparison.metrics.totalSpent` |
| Total Orders | `current.metrics.totalOrders` | `comparison.metrics.totalOrders` |
| Avg Order Value | `current.metrics.averageOrderValue` | `comparison.metrics.averageOrderValue` |
| Active Suppliers | `current.metrics.activeSuppliers` | `comparison.metrics.activeSuppliers` |

### Chart
Use `current.periodData` for the primary dataset. When `comparison` is present, add a second dataset using `comparison.periodData` — same as `SalesPage.tsx`'s `comparisonData` prop.

Y-axis field: `spent` (vs sales' `revenue`).

### Top Suppliers table
Use `data?.topSuppliers` directly (no frontend aggregation).

### Recent Orders table
Use `data?.recentOrders` directly (no frontend slice of full order list).

---

## Files Changed

| File | Change |
|------|--------|
| `backend/src/common/dto/analytics.dto.ts` | New — exports `DateRange`, `GroupByPeriod` |
| `backend/src/modules/sales/dto/sales-analytics.dto.ts` | Update imports to use shared enums |
| `backend/src/modules/purchasing/dto/purchasing-analytics.dto.ts` | New |
| `backend/src/modules/purchasing/services/purchasing-analytics.service.ts` | Add `getPurchasingAnalytics` method |
| `backend/src/modules/purchasing/controllers/purchasing-analytics.controller.ts` | Add `GET /purchasing/analytics/dashboard` endpoint |
| `frontend/src/pages/purchasing/hooks/usePurchasingAnalytics.ts` | New |
| `frontend/src/pages/purchasing/PurchasingPage.tsx` | Integrate filter bar and new hook |

---

## Acceptance Criteria

- Purchasing Overview page has `DashboardFilterBar`
- Changing filters updates all metrics and charts
- Metrics show comparison deltas when a comparison is selected
- Chart displays current vs comparison period trends
- Backend endpoint follows the same response structure as the sales analytics endpoint
- No frontend metric calculations remain in `PurchasingPage.tsx`
