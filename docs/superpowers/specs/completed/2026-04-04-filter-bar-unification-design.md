# Filter Bar Unification Design

**Issue:** #273  
**Date:** 2026-04-04  
**Approach:** Extend `FilterBar`/`useFilterBar` minimally to support dashboard use cases, then delete the bespoke dashboard filter infrastructure.

---

## Problem

Two parallel filter systems exist:

- `FilterBar` + `useFilterBar` — generic, config-driven, used by list pages (Products, Customers, Purchase Orders, etc.)
- `DashboardFilterBar` + `useDashboardFilters` — bespoke, prop-driven, used only by Sales and Purchasing dashboards

The bespoke system duplicates URL persistence logic, has a flat prop API that grows with each new field, and diverges visually from the generic system.

---

## Goal

Replace `DashboardFilterBar` and `useDashboardFilters` entirely. Extend the generic system with the two capabilities it currently lacks for dashboard use:

1. A `compare` field type (the "Compare with..." dropdown)
2. An `isFetching` prop on `FilterBar` for loading indicator

---

## Design

### 1. Types (`filterBar.types.ts`)

Add `'compare'` to `FilterFieldType`:

```ts
export type FilterFieldType = 'select' | 'multi-select' | 'period' | 'compare'
```

Add `CompareFilterFieldConfig`:

```ts
export interface CompareFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'compare'
}
```

Update the `FilterFieldConfig` union to include `CompareFilterFieldConfig`.

Add `isFetching` to `FilterBar` props:

```ts
interface Props<TFilters extends object> {
  // ...existing...
  isFetching?: boolean
}
```

---

### 2. `FilterBar` component

Render the `compare` field type as a MUI `Select` with four hardcoded options:
- No Comparison (null)
- Previous Period (`previous_period`)
- Same Period Last Month (`last_month`)
- Same Period Last Year (`last_year`)

**Disabled rule:** disabled when the sibling `period` field's value has `key === 'today'`. `FilterBar` finds this by looking for a field with `type === 'period'` in `config.fields` and reading its current value from `draftFilters`. A MUI `Tooltip` wraps the disabled select with the message "Comparison is not available for Today" — same UX as current `DashboardFilterBar`.

**`isFetching`:** renders a `CircularProgress size={16}` at the end of the row when true.

---

### 3. `filterBar.url.ts`

The `compare` field serializes like `select`:
- Serialize: write string value if non-null, omit if null
- Parse: validate against `['previous_period', 'last_month', 'last_year']`, fall back to `null` if invalid or absent
- `getManagedParamKeys`: single key, no suffix

No other changes.

---

### 4. `src/utils/dashboardApiParams.ts` (new file)

Extracts `toApiParams` from `useDashboardFilters` with no logic changes.

**Exports:**
- `DashboardCompare` type (moved from `useDashboardFilters`)
- `DashboardResolvedApiParams` type (moved from `useDashboardFilters`)
- `resolveApiParams(filters: { period: PeriodValue; compareWith: DashboardCompare; [key: string]: unknown }): DashboardResolvedApiParams`

**`groupBy` logic (unchanged):**
- ≤31 days → `day`
- ≤90 days → `week`
- else → `month`

Entity fields (`customerId`, `supplierId`, `isFulfilled`, `status`, `paymentStatus`, `categoryId`, `stockStatus`) are passed through from the filter object as-is.

---

### 5. Page configs

**`SalesPage`:**

```ts
type SalesDashboardFilters = {
  period: PeriodValue
  compareWith: DashboardCompare
  customerId: string | null
  isFulfilled: string | null   // 'true' | 'false' | null
  paymentStatus: string | null
}
```

Config: `period`, `compareWith`, `customerId` (select, dynamic from API), `isFulfilled` (select), `paymentStatus` (select).  
Namespace: `'sales'`. Default period: `{ key: 'this_month', from: null, to: null }`.

**`PurchasingPage`:**

```ts
type PurchasingDashboardFilters = {
  period: PeriodValue
  compareWith: DashboardCompare
  supplierId: string | null
  status: string | null
  paymentStatus: string | null
}
```

Config: `period`, `compareWith`, `supplierId` (select, dynamic from API), `status` (select), `paymentStatus` (select, purchasing-specific options).  
Namespace: `'purchasing'`. Default period: `{ key: 'this_month', from: null, to: null }`.

Both pages call `resolveApiParams(appliedFilters)` and pass the result to their analytics hooks.

---

### 6. Cleanup

**Delete:**
- `frontend/src/components/filters/DashboardFilterBar.tsx`
- `frontend/src/hooks/useDashboardFilters.ts`

Update all imports in `SalesPage.tsx` and `PurchasingPage.tsx`.

---

### 7. Testing

- Unit tests for `resolveApiParams`: period key → API params, custom range → `startDate`/`endDate`/`groupBy`, `compareWith` passthrough, entity field passthrough
- Unit tests for `compare` field type in `filterBar.url.ts`: serialize/parse round-trip, invalid value falls back to null, null omitted from URL
- Update or remove any existing tests importing from `DashboardFilterBar` or `useDashboardFilters`

---

## URL Param Compatibility

The new implementation produces identical URL params to `useDashboardFilters`:

| Filter | Old param | New param |
|--------|-----------|-----------|
| Period | `sales_period` | `sales_period` |
| Compare | `sales_compare` | `sales_compare` |
| Customer | `sales_customer` | `sales_customer` |
| Fulfilled | `sales_fulfilled` | `sales_fulfilled` |
| Payment | `sales_payment` | `sales_payment` |

No URL breakage for bookmarked/shared links.

> **Note:** `useDashboardFilters` used `_fulfilled`, `_payment`, `_stock_status` as param suffixes. The new `FilterBarConfig` for each field should set `paramKey` explicitly to preserve these exact param names (e.g. `paramKey: 'fulfilled'` on the `isFulfilled` field).
