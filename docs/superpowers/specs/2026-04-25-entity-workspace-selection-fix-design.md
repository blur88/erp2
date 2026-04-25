# Design: Entity Workspace Selection Reset Fix (Issue #444)

## Problem

Clicking a row in any entity list page (Customers, Suppliers, Products, Orders, etc.) sometimes fails to update the workspace card and context header. They revert to the "Select a …" placeholder or stay empty.

## Root Cause

Two independent bugs combine to cause this:

1. **Unstable `selectEntity` reference.** Every page/workspace-hook passes `selectEntity` as an inline arrow function directly to `useEntityWorkspace`. This creates a new function reference on every render, causing the auto-selection `useEffect` (which lists `selectEntity` as a dependency) to re-run after every render — resetting `hasAutoSelected` and potentially clearing the selection.

2. **Unconditional clear on empty entities.** The effect at `useEntityWorkspace.ts:74–86` calls `selectEntity(null)` whenever `entities.length === 0`. During an RTK Query background refetch, if the response hasn't resolved yet and the calling component defaults to `[]` (`customersResponse?.data ?? []`), selection gets wiped even though data is on its way.

## Solution (Option C — Fix Both)

### Change 1 — `useEntityWorkspace.ts`: add `isFetching` guard

Add an optional `isFetching?: boolean` field to `UseEntityWorkspaceConfig`. In the auto-selection effect, skip the `selectEntity(null)` call when `isFetching` is true:

```ts
if (entities.length === 0) {
  if (!isFetching) {
    hasAutoSelected.current = false
    setFocusedIndex(-1)
    selectEntity(null)
  }
  return
}
```

This prevents selection from being wiped while data is in flight. When `isFetching` is omitted it defaults to `false`, so existing behaviour is preserved for hooks that don't have access to fetch state.

### Change 2 — All 10 call sites: memoize `selectEntity`

Every call site that passes `selectEntity` as an inline arrow must wrap it in `useCallback`. Since `dispatch` is stable (Redux guarantees this), the memoized callback never changes identity, ending the render-loop.

**Direct page components** (2 files):
- `CustomersPage.tsx` — also pass `isFetching` from `useGetCustomersQuery`
- `SuppliersPage.tsx` — also pass `isFetching` from `useGetSuppliersQuery`

**Intermediate workspace hooks** (8 files — no access to `isFetching`, fix `useCallback` only):
- `useVendorPaymentsWorkspace.ts`
- `useGRNWorkspace.ts`
- `useProductsWorkspace.ts`
- `useStockAdjustmentsWorkspace.ts`
- `useCategoriesWorkspace.ts`
- `useInvoicesWorkspace.ts`
- `useOrdersWorkspace.ts`
- `useChartOfAccountsWorkspace.ts`
- `usePaymentsWorkspace.ts`
- `useJournalEntriesWorkspace.ts`

## Testing

- Update `useEntityWorkspace.test.ts` with two new cases:
  1. **`isFetching` guard:** when `entities` transitions to `[]` with `isFetching: true`, `selectEntity` should NOT be called with `null`.
  2. **Stable `selectEntity`:** verify the auto-selection effect does not fire a second time when `selectEntity` reference is replaced (simulates the inline-arrow bug).
- Run the full hook test file after changes.
- Manual smoke test: navigate to `/sales/customers`, click several customers, confirm header and workspace card update reliably each time.

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/useEntityWorkspace.ts` | Add `isFetching?: boolean` to config; guard effect |
| `src/hooks/useEntityWorkspace.test.ts` | Add 2 regression tests |
| `src/pages/sales/CustomersPage.tsx` | `useCallback` for `selectEntity`; pass `isFetching` |
| `src/pages/purchasing/SuppliersPage.tsx` | `useCallback` for `selectEntity`; pass `isFetching` |
| `src/pages/purchasing/hooks/useVendorPaymentsWorkspace.ts` | `useCallback` for `selectEntity` |
| `src/pages/purchasing/hooks/useGRNWorkspace.ts` | `useCallback` for `selectEntity` |
| `src/pages/inventory/hooks/useProductsWorkspace.ts` | `useCallback` for `selectEntity` |
| `src/pages/inventory/hooks/useStockAdjustmentsWorkspace.ts` | `useCallback` for `selectEntity` |
| `src/pages/inventory/hooks/useCategoriesWorkspace.ts` | `useCallback` for `selectEntity` |
| `src/pages/sales/hooks/useInvoicesWorkspace.ts` | `useCallback` for `selectEntity` |
| `src/pages/sales/hooks/useOrdersWorkspace.ts` | `useCallback` for `selectEntity` |
| `src/pages/accounting/hooks/useChartOfAccountsWorkspace.ts` | `useCallback` for `selectEntity` |
| `src/pages/sales/hooks/usePaymentsWorkspace.ts` | `useCallback` for `selectEntity` |
| `src/pages/accounting/hooks/useJournalEntriesWorkspace.ts` | `useCallback` for `selectEntity` |
