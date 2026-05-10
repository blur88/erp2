# Issue #219 — Inventory Dashboard Filters (Stock Status, Category, Supplier)

**Date:** 2026-03-29
**Issue:** [#219](https://github.com/blur88/erp2/issues/219)
**Approach:** Option A — extend `useDashboardFilters` with `categoryId` + `stockStatus`

---

## Overview

Add Stock Status, Category, and Supplier filters to the Inventory Overview dashboard. All filters apply to every dashboard component (snapshot metrics, movement totals, trend chart, low stock alerts, recent movements). Mirrors the pattern established in Sales (#186) and Purchasing (#217).

---

## Backend

### DTO — `InventoryAnalyticsQueryDto`

Add three optional fields to `backend/src/modules/inventory/dto/inventory-analytics.dto.ts`:

```ts
@IsOptional() @IsUUID()
categoryId?: string;

@IsOptional() @IsUUID()
supplierId?: string;

@IsOptional() @IsIn(['in_stock', 'low_stock', 'out_of_stock'])
stockStatus?: 'in_stock' | 'low_stock' | 'out_of_stock';
```

### Service — `InventoryAnalyticsService.getInventoryDashboardAnalytics`

Resolve a `filters` object at the top of the orchestrator:

```ts
interface InventoryDashboardFilters {
  categoryId?: string;
  productIds?: string[];  // resolved from supplierId via subquery
  stockStatus?: 'in_stock' | 'low_stock' | 'out_of_stock';
}
```

**Supplier → productIds resolution:** If `supplierId` is provided, run a single subquery before the `Promise.all`:

```sql
SELECT DISTINCT poi.productId
FROM purchase_order_items poi
JOIN purchase_orders po ON poi.purchaseOrderId = po.id
WHERE po.supplierId = :supplierId
```

If the result is an empty array, return early with zeroed-out metrics (no products match). Pass the resolved `productIds` array into all sub-methods.

### Filter application per sub-method

| Method | categoryId | productIds (from supplierId) | stockStatus |
|---|---|---|---|
| `getInventorySnapshotMetrics` | `WHERE product.categoryId = :categoryId` | `WHERE product.id IN (:...productIds)` | stock quantity range condition |
| `getInventoryMovementTotals` | join product, filter categoryId | join product, filter productIds | join product, filter stock range |
| `getInventoryPeriodData` | join product, filter categoryId | join product, filter productIds | join product, filter stock range |
| `getLowStockAlerts` | filter categoryId | filter productIds | n/a (already scoped to `<= 10`) |
| `getRecentMovements` | join product, filter categoryId | join product, filter productIds | join product, filter stock range |

**Stock status conditions (threshold hardcoded at 10, consistent with all existing code):**
- `in_stock`: `product.stockQuantity > 10`
- `low_stock`: `product.stockQuantity > 0 AND product.stockQuantity <= 10`
- `out_of_stock`: `product.stockQuantity <= 0`

**Note:** The `stockQuantity <= 10` threshold is duplicated in 5 places across the codebase. Extracting it to a shared constant (or a configurable setting) is deferred as a separate issue.

---

## Frontend

### `useDashboardFilters`

Add two new fields following the exact same pattern as `supplierId`:

| Field | Type | URL param | Default |
|---|---|---|---|
| `categoryId` | `string \| null` | `{namespace}_category` | `null` |
| `stockStatus` | `'in_stock' \| 'low_stock' \| 'out_of_stock' \| null` | `{namespace}_stock_status` | `null` |

- Export `StockStatusFilter` type alongside existing `PaymentStatusFilter`
- Add `VALID_STOCK_STATUSES` constant for URL validation
- Both fields included in `parseUrl`, `writeUrl`, `reset()`, `isDefault` check, and `resolvedApiParams`
- `resolvedApiParams` passes `stockStatus` as-is (string) to backend

### `DashboardFilterBar`

Add four new optional props:

```ts
categories?: { id: string; name: string }[]
categoryId?: string | null
onCategoryChange?: (id: string | null) => void
stockStatus?: string | null
onStockStatusChange?: (value: string | null) => void
```

Render two new `<Select>` dropdowns using the same conditional pattern as `suppliers`:
- **Category** — "All Categories" default, single-select, shown when `categories !== undefined && onCategoryChange`
- **Stock Status** — "All", "In Stock", "Low Stock", "Out of Stock", shown when `stockStatus !== undefined && onStockStatusChange`

Stock Status dropdown order in the bar: after Supplier, before the loading spinner.

### `useInventoryAnalytics`

Extend `InventoryAnalyticsParams`:

```ts
categoryId?: string
supplierId?: string
stockStatus?: string
```

These fields are already filtered out if `undefined`/`null` before the API call (existing pattern in `fetchAnalytics`).

### `InventoryPage`

1. Destructure new fields from `useDashboardFilters('inventory')`:
   ```ts
   categoryId, setCategoryId, supplierId, setSupplierId, stockStatus, setStockStatus
   ```

2. Fetch suppliers and categories:
   ```ts
   const { data: suppliersData } = useGetSuppliersQuery({})
   const { data: categoriesData } = useGetCategoriesQuery({})

   const supplierOptions = suppliersData?.data?.map(s => ({ id: s.id, name: s.companyName })) ?? []
   const categoryOptions = (categoriesData ?? []).map(c => ({ id: c.id, name: c.name }))
   ```
   Note: `categoriesData` is a plain array (hierarchy endpoint — no `.data` wrapper per CLAUDE.md).

3. Pass all new props to `DashboardFilterBar` and pass all filter params to `useInventoryAnalytics`.

---

## Testing

### Backend — `inventory-analytics-dashboard.service.spec.ts`

New test cases:
- `categoryId` filter scopes snapshot metrics and movement queries to that category
- `supplierId` resolves to product IDs via PO items and scopes all sub-methods
- `supplierId` with no matching products returns zeroed metrics
- `stockStatus: 'in_stock'` applies `stockQuantity > 10` to product queries
- `stockStatus: 'low_stock'` applies `0 < stockQuantity <= 10`
- `stockStatus: 'out_of_stock'` applies `stockQuantity <= 0`
- Combined `categoryId` + `stockStatus` filters work together

### Frontend — `DashboardFilterBar.test.tsx`

New test cases:
- Category dropdown renders when `categories` prop provided
- Stock Status dropdown renders when `stockStatus` prop provided
- Both dropdowns absent when their props are omitted

### Frontend — `useDashboardFilters.test.ts`

New test cases:
- `categoryId` parsed from URL, persisted on change, cleared on reset
- `stockStatus` parsed from URL (valid values only), persisted on change, cleared on reset
- Both included in `isDefault` calculation

### Frontend — `InventoryPage` smoke test

Following the pattern from PR #217 (`PurchasingPage` smoke test):
- Renders the Supplier, Category, and Stock Status filter dropdowns
