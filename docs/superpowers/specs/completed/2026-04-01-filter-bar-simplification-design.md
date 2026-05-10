# Filter Bar Simplification Design

**Issue:** #242
**Date:** 2026-04-01
**Status:** Approved

## Summary

Remove the advanced filters drawer, active filter chips, and all associated infrastructure from the filter bar system. The result is a simpler filter bar with search + quick filters + a Reset button only. Advanced fields are dropped entirely — removed from both the config types and all page implementations.

## Files to Delete

| File | Reason |
|------|--------|
| `frontend/src/components/filters/AdvancedFiltersDrawer.tsx` | Drawer UI removed |
| `frontend/src/components/filters/ActiveFilterChips.tsx` | Chips UI removed |
| `frontend/src/components/filters/MoreFiltersButton.tsx` | Drawer trigger removed |
| `frontend/src/components/filters/filterBar.chips.ts` | Chip derivation logic removed |
| `frontend/src/components/filters/__tests__/filterBar.chips.test.ts` | Tests for deleted module |

## `filterBar.types.ts`

- Remove `ActiveChip` interface
- Remove `advanced` field from `FilterBarConfig`
- Remove `onAdvancedDraftChange`, `onAdvancedApply`, `onAdvancedCancel` from `FilterBarHandlers`

## `useFilterBar.ts`

- Remove `deriveChips` import and `activeChips` useMemo
- Remove `hasUnappliedChanges` useMemo
- Remove `onAdvancedDraftChange`, `onAdvancedApply`, `onAdvancedCancel` callbacks
- Update `getDefaults` to iterate only `config.quick` (remove `config.advanced` spread)
- Remove `activeChips` and `hasUnappliedChanges` from return object

## `FilterBar.tsx`

- Remove imports: `ActiveFilterChips`, `AdvancedFiltersDrawer`, `MoreFiltersButton`, `ActiveChip`
- Remove `drawerOpen` state, `advancedFields`, `activeAdvancedCount` locals
- Remove `activeChips` and `hasUnappliedChanges` from `Props` interface
- Remove `<MoreFiltersButton>`, `<ActiveFilterChips>`, `<AdvancedFiltersDrawer>` from JSX

## `index.ts`

- Remove `ActiveChip` from exports

## Page Files (7 pages)

Each page requires three changes:
1. Remove `advanced: [...]` array from filter config (and drop those fields from the filter type and `defaults`)
2. Remove dropped fields from `useFilterBar` destructuring (`activeChips`, `hasUnappliedChanges`)
3. Remove dropped fields from query args passed to RTK Query

| Page | Dropped advanced fields | Dropped query args |
|------|------------------------|--------------------|
| `ProductsPage.tsx` | `categoryId`, `stockRange` | `categoryId`, `minStock`, `maxStock` (2 locations) |
| `OrdersPage.tsx` | `fulfillmentStatus`, `dateRange` | `fromDate`, `toDate`, `fulfillmentStatus` |
| `PaymentsPage.tsx` | `customerId`, `dateRange` | `customerId`, `fromDate`, `toDate` |
| `CustomersPage.tsx` | `type` | `type` |
| `SuppliersPage.tsx` | `type` | `type` |
| `StockAdjustmentsPage.tsx` | `dateRange` | `fromDate`, `toDate` |
| `PurchaseOrdersPage.tsx` | `dateRange` | `orderDateFrom`, `orderDateTo` |

## Tests

### `FilterBar.test.tsx`
- Remove `activeChips` and `hasUnappliedChanges` from `baseProps`
- Remove `ActiveChip` import and type usage
- Remove test: "renders chips and allows removal"
- Remove test: "opens advanced drawer and forwards actions"
- Remove `advanced` from test config

### `useFilterBar.test.tsx`
- Remove any tests covering `activeChips`, `hasUnappliedChanges`, `onAdvancedDraftChange`, `onAdvancedApply`, `onAdvancedCancel`
- Remove `advanced` from test configs

## Verification

- Filter bar renders search + quick filters + Reset button correctly on all 7 pages
- URL sync still works for remaining quick filter fields
- TypeScript compiles cleanly (`npm run type-check`)
- No test regressions in core filter logic (`filterBar.url.test.ts`, `useFilterBar.test.tsx`)
