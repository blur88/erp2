# Stock Adjustment Page — RTK Query Migration Design

**Date:** 2026-03-13
**Issue:** #90 — Stock adjustment page requires manual refresh to see new adjustments
**File:** `frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx`

## Problem

`CreateStockAdjustmentPage` uses `ApiService` (Axios wrapper) for its POST and PUT operations. This bypasses RTK Query's cache management, so the `StockAdjustment` tag is never invalidated after a create or update. `StockAdjustmentsPage` uses `useGetStockAdjustmentsQuery` which relies on tag invalidation — result: the list stays stale until a manual browser refresh.

## Solution

Full migration of `CreateStockAdjustmentPage` to RTK Query for all network calls except the per-item product fetch on selection.

## Changes

### Edit-mode GET

- **Remove:** `loadStockAdjustment` function, `adjustmentToLoad` state, `loadingAdjustment` state
- **Add:** `useGetStockAdjustmentQuery(id!, { skip: !id })` from `inventoryApi`
- `isLoading` from the hook drives the loading UI in JSX directly — no local state variable
- The two-step sequencing (seed products → reset form) is preserved via a `useEffect` that watches the query `data` and `products.length`

### Create/Update mutations

- **Remove:** `ApiService.post('/inventory/stock-adjustments', ...)` and `ApiService.put('/inventory/stock-adjustments/:id', ...)`
- **Add:** `useCreateStockAdjustmentMutation` and `useUpdateStockAdjustmentMutation` from `inventoryApi`
- These mutations already `invalidatesTags: ['StockAdjustment']`, which triggers automatic refetch of the list
- Submit button loading state uses `isLoading` from the active mutation hook — no manual `setLoading` state
- Error handling switches from `try/catch` to checking the `error` object returned by the mutation call

### Unchanged

- `handleProductSelect` keeps its `ApiService.get(/inventory/products/:id)` call — this is a one-off fetch to get fresh `stockQuantity` at selection time, not a cached list query; RTK Query adds no value here
- All UI, form logic, validation, and notification calls are unchanged

## Testing

Existing tests that mock `ApiService` for POST/PUT calls must be updated to mock the RTK Query mutation hooks instead, consistent with `CreateSalesOrderPage` and `CreatePurchaseOrderPage` test patterns.

## Reference

- Mutation hooks available: `useCreateStockAdjustmentMutation`, `useUpdateStockAdjustmentMutation`, `useGetStockAdjustmentQuery` — all exported from `frontend/src/store/api/inventoryApi.ts`
- Comparable implementations: `CreateSalesOrderPage.tsx`, `CreatePurchaseOrderPage.tsx`
