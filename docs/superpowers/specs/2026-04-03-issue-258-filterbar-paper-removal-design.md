# Issue #258: Remove Paper Wrapper from FilterBars

**Date:** 2026-04-03  
**Issue:** #258  
**Status:** Design approved

## Problem

FilterBar and DashboardFilterBar have inconsistent styling across pages. Some pages wrap `FilterBar` in a `<Paper>` component (grey background + padding), while others use a flat/transparent layout. The target style is the flat look used in `ProductsPage`.

## Reference Implementation

`frontend/src/pages/inventory/ProductsPage.tsx` — uses `<Box sx={{ mb: 3 }}>` with no background.

## Scope

### 1. Pages with `FilterBar` in `<Paper>` wrapper

Replace `<Paper sx={{ p: 2, mb: 3 }}>` → `<Box sx={{ mb: 3 }}>` on 5 pages:

- `frontend/src/pages/sales/CustomersPage.tsx`
- `frontend/src/pages/sales/PaymentsPage.tsx`
- `frontend/src/pages/purchasing/SuppliersPage.tsx`
- `frontend/src/pages/inventory/StockAdjustmentsPage.tsx`
- `frontend/src/pages/settings/UserManagementPage.tsx`

`Paper` imports remain — all these pages also use `Paper` for their table.

### 2. PriceListsPage — migrate manual filters to FilterBar

`frontend/src/pages/settings/PriceListsPage.tsx` currently uses a manual `TextField` + `Select` inside `<Paper>` driven by Redux state (`state.priceLists.filters`). Migrate to `FilterBar` + `useFilterBar`.

**Changes to `PriceListsPage.tsx`:**
- Add `FilterBar`, `useFilterBar`, `FilterBarConfig` imports
- Remove filter-only imports: `TextField`, `InputAdornment`, `SearchIcon`, `Select`, `InputLabel`, `FormControl` (if not used elsewhere in the file)
- Define `filterConfig` with:
  - `search`: placeholder `"Search by code or name..."`
  - `status` field: type `select`, options Active / Inactive / All (maps to `isActive: true | false | undefined`)
- Replace `useAppSelector(state.priceLists.filters)` + `dispatch(setFilters(...))` with `useFilterBar`
- Pass `appliedFilters.search` and derived `isActive` to RTK Query args
- Replace filter `<Paper>` section with `<Box sx={{ mb: 3 }}><FilterBar .../></Box>`
- Remove `handleSearch` and `handleActiveFilterChange` handlers

**Changes to `frontend/src/store/slices/priceListSlice.ts`:**
- Remove `filters` from `PriceListUIState` interface and `initialState`
- Remove `setFilters` reducer and export
- Keep `pagination`, `setPagination` — still used

### 3. DashboardFilterBar

No changes needed. The component already renders a plain `Box` with no background or border styling. The issue description's mention of `bgcolor: 'background.paper'` was out of date.

## Testing

No new tests needed — purely structural/visual. Check existing `PriceListsPage` tests for filter interactions that may query by old `TextField`/`Select` roles and update selectors if needed.

File: `frontend/src/store/slices/__tests__/priceListSlice.ui.test.ts`

## Out of Scope

- Changes to the `FilterBar` component internals
- Changes to any overview/dashboard pages using `DashboardFilterBar`
