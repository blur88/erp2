# Suppliers Page Sort Button — Design Spec

**Issue:** #325  
**Date:** 2026-04-10

## Summary

Add a sort toggle button to the Suppliers page FilterBar, allowing users to sort the supplier list by company name (A→Z / Z→A). Mirrors the existing pattern on CustomersPage exactly.

## Scope

Frontend-only. The backend already supports `sortBy` and `sortOrder` query params on `GET /purchasing/suppliers` (valid sort fields include `companyName`, `type`, `totalPurchases`, `totalOrders`, `createdAt`, `lastPurchaseDate`). This feature uses `companyName` only.

## Changes

**File: `frontend/src/pages/purchasing/SuppliersPage.tsx`**

1. Add `sortBy` state — `useState('companyName')`
2. Add `sortOrder` state — `useState<'asc' | 'desc'>('asc')`
3. Add `handleSort` callback — flips order when same field clicked, resets to `'asc'` when field changes (same logic as `CustomersPage`)
4. Include `sortBy` and `sortOrder` (uppercased) in `supplierQueryParams`
5. Pass `sort={{ field: 'companyName', sortBy, sortOrder, onSort: handleSort }}` to `FilterBar`

No other files need changes.

## UI Behaviour

- Sort button appears in the FilterBar alongside existing Status and Supplier Type filters
- Inactive state: outlined button with `SortIcon`, label "Sort" (rendered by `AppButton` + `FilterBar` existing logic)
- Active state: contained/primary button with `ArrowUpward` (A→Z) or `ArrowDownward` (Z→A) icon
- Default: A→Z (`companyName ASC`)
- Clicking toggles between ASC and DESC; a new API call is made automatically via RTK Query

## What Does Not Change

- `SupplierList` component — no changes
- Backend — no changes
- `FilterBar`, `AppButton` — no changes (already support sort via `sort` prop and `sortConfig`)
- Keyboard navigation, selection, dialogs — unaffected
