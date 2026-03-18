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

Use the **lazy query** pattern, matching `CreateSalesOrderPage`:

- **Remove:** `ApiService.get('/inventory/stock-adjustments/:id')` call inside `loadStockAdjustment`
- **Add:** `const [triggerGetStockAdjustment] = useLazyGetStockAdjustmentQuery()` from `inventoryApi`
- Call `const adjustment = await triggerGetStockAdjustment(adjustmentId).unwrap()` inside `loadStockAdjustment` in place of `ApiService.get`
- **Keep:** `loadingAdjustment` state, `adjustmentToLoad` state, and the two-step `useEffect` sequencing (seed products → reset form) — these are unchanged; only the fetch mechanism changes
- The `isLoading` flag from the lazy trigger is not used directly; `setLoadingAdjustment(true/false)` continues to drive loading UI as before

### Create/Update mutations

- **Remove:** `ApiService.post('/inventory/stock-adjustments', ...)` and `ApiService.put('/inventory/stock-adjustments/:id', ...)`
- **Add:**
  ```ts
  const [createStockAdjustment, { isLoading: isCreating }] = useCreateStockAdjustmentMutation()
  const [updateStockAdjustment, { isLoading: isUpdating }] = useUpdateStockAdjustmentMutation()
  ```
- Call shapes:
  - Create: `const result = await createStockAdjustment(adjustmentData).unwrap()`
  - Update: `const result = await updateStockAdjustment({ id, data: adjustmentData }).unwrap()` — note the `{ id, data }` shape required by the mutation definition
- These mutations already `invalidatesTags: ['StockAdjustment']`, triggering automatic refetch of the list
- **Submit button loading state:** replace manual `loading` state with `const loading = isCreating || isUpdating` — remove `setLoading` calls
- **Error handling:** keep `try/catch` around `.unwrap()` calls (`.unwrap()` throws on error). Remove the `if (!adjustment || !adjustment.id)` guard — RTK Query throws if the server returns an error response. **Update the catch expression:** RTK Query serialized errors use `err.data?.message`, not `err.response?.data?.message`. Replace:
  ```ts
  err.response?.data?.message || err.message || 'Failed to record stock adjustments'
  ```
  with:
  ```ts
  err.data?.message || err.message || 'Failed to record stock adjustments'
  ```
- The `error` state variable (`const [error, setError] = useState<string | null>(null)`) is unaffected — it is distinct from any mutation error object and the naming does not clash

### Response field access

After migration, `normalizeSingle<StockAdjustment>` unwraps the backend envelope. The `StockAdjustment` type has `adjustmentNumber`, `itemCount`, and `status` as top-level fields.

- **Create path:** `result.adjustmentNumber`, `result.itemCount`, `result.status` — no change needed
- **Update path:** `result.adjustmentNumber` — no change needed. Today `ApiService.put` also returns the unwrapped body, so the field access is identical after migration

### Unchanged

- `handleProductSelect` keeps its `ApiService.get('/inventory/products/:id')` call — one-off fetch for fresh `stockQuantity` at selection time; RTK Query adds no value here
- All UI, form logic, validation, and notification calls are unchanged
- Remove the `console.log` debug statement on line 210 (left over from development)

## Testing

The existing test file mocks both `ApiService.get` (for the edit-mode adjustment fetch and per-item product fetch) and `ApiService.post`/`ApiService.put`. After migration:

- **Edit-mode GET mock:** replace `mockGet` for `/inventory/stock-adjustments/:id` with a mock of `useLazyGetStockAdjustmentQuery` returning a trigger that resolves the adjustment — same as how `CreateSalesOrderPage.test.tsx` mocks `useLazyGetSalesOrderQuery`
- **POST/PUT mocks:** the existing `post: vi.fn()` and `put: vi.fn()` in the `@/services/api` mock are unused — there are currently no tests covering the `onSubmit` flow. Add new tests for the create and update paths using mocks of `useCreateStockAdjustmentMutation` and `useUpdateStockAdjustmentMutation` (do not rely on the bare `vi.fn()` stubs)
- **Per-item product GET:** `mockGet` for `/inventory/products/:id` in `handleProductSelect` is unchanged — `ApiService.get` is still used there

## Reference

- Hooks: `useLazyGetStockAdjustmentQuery`, `useCreateStockAdjustmentMutation`, `useUpdateStockAdjustmentMutation` — exported from `frontend/src/store/api/inventoryApi.ts`
- Pattern reference: `CreateSalesOrderPage.tsx` (lazy query + `orderToLoad` state + two-step useEffect)
- Type reference: `StockAdjustment` in `frontend/src/types/index.ts` — has `adjustmentNumber`, `itemCount`, `status`
