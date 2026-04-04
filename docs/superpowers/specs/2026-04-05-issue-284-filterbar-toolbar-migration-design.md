# FilterBar → PageHeader toolbar Migration (Issue #284)

**Date:** 2026-04-05  
**Issue:** #284  
**Scope:** 13 pages

## Summary

Migrate all remaining pages from rendering `<FilterBar>` as a sibling element after `<PageHeader>` to passing it via the `toolbar` prop on `<PageHeader>`. This standardizes the 16px gap between filters and page content (provided by `PageHeader`'s `mb: 2` outer box) and removes manual `<Box sx={{ mb: 2 }}>` wrappers.

`PageHeader` already supports this — `toolbar` renders inside the header with `mt: 1`, and the `mb: 2` on the outer container provides the gap to content. No changes to `PageHeader.tsx` are needed.

## Pages in Scope

### Overview / Dashboard pages (`variant="overview"`)
- `SalesPage.tsx` — marked done in issue but not actually migrated
- `PurchasingPage.tsx`
- `InventoryPage.tsx`

### List / CRUD pages (`variant="workflow"`)
- `OrdersPage.tsx`
- `CustomersPage.tsx`
- `InvoicesPage.tsx`
- `PaymentsPage.tsx`
- `ProductsPage.tsx`
- `SuppliersPage.tsx`
- `StockAdjustmentsPage.tsx`
- `PurchaseOrdersPage.tsx`
- `UserManagementPage.tsx`
- `PriceListsPage.tsx`

## Pages Excluded

- `DashboardPage.tsx` — no FilterBar
- `AccountingDashboardPage.tsx` — no FilterBar
- `JournalEntriesPage.tsx` — uses a custom filter row with conditional batch-action buttons (Post, Delete), not a `FilterBar` component; out of scope

## Change Pattern

For each page in scope:

1. Move `<FilterBar config={...} draftFilters={...} handlers={...} hasActiveFilters={...} isFetching={...} />` to `toolbar={<FilterBar ... />}` on `<PageHeader>`
2. Remove the wrapping `<Box sx={{ mb: 2 }}>` or `<Stack sx={{ mb: 2 }}>` around the FilterBar
3. Add `variant="overview"` or `variant="workflow"` to `PageHeader` where missing

## Special Cases

### `OrdersPage`
FilterBar lives inside `<Box sx={{ mb: 2 }}>` which is itself inside a flex column layout `<Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>`. Remove only the inner `mb: 2` Box; the outer flex Box stays.

### `ProductsPage`
FilterBar is wrapped in a `<Stack sx={{ mb: 2, marginRight: contentMarginRight }}>` for the calculator panel slide animation. After moving FilterBar into `toolbar`, remove the Stack entirely — the `marginRight` shift is already on the outer `<Box>` wrapping `<PageHeader>`, so it's inherited.

### `StockAdjustmentsPage`
FilterBar is nested inside a `<Box sx={{ mb: 3 }}>` that also wraps other elements. Only remove the inner FilterBar wrapper, not the outer Box.

## Acceptance Criteria

- All 13 pages pass `FilterBar` via `toolbar` prop on `PageHeader`
- No `<Box sx={{ mb: 2 }}>` or `<Stack sx={{ mb: 2 }}>` wrappers remain around FilterBar instances
- All 13 pages have `variant="overview"` or `variant="workflow"` on `PageHeader`
- Every page has consistent 16px gap between filters and page content
