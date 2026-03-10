# Product Edit Instant Update Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** After saving a product edit, the product list and detail panel on ProductsPage update instantly without requiring a browser refresh.

**Architecture:** Replace the raw `ApiService.patch` call in `CreateProductPage` with the RTK Query `useUpdateProductMutation`. This triggers `invalidatesTags: ['Product']`, causing `useGetProductsQuery` to refetch automatically. The existing `useProductsSelection` hook already syncs `selectedProduct` from the refreshed list.

**Tech Stack:** React 18, RTK Query (`@reduxjs/toolkit`), `inventoryApi.ts` (RTK Query API slice)

---

### Task 1: Replace ApiService.patch with RTK Query mutation in CreateProductPage

**Files:**
- Modify: `frontend/src/pages/inventory/CreateProductPage.tsx`

**Step 1: Add `useUpdateProductMutation` import**

In `CreateProductPage.tsx`, find the existing import from `@/store/api/inventoryApi` (line ~24):

```ts
import { useGetPriceListsQuery, useBulkUpdatePricesMutation } from '@/store/api/priceListApi'
```

There is no inventoryApi import yet in this file. Add one:

```ts
import { useUpdateProductMutation } from '@/store/api/inventoryApi'
```

**Step 2: Instantiate the mutation hook inside the component**

Inside `CreateProductPage` component body (after the existing hooks, around line ~182), add:

```ts
const [updateProduct] = useUpdateProductMutation()
```

**Step 3: Replace the ApiService.patch call in onSubmit**

Find this block in `onSubmit` (around line ~316):

```ts
if (isEditMode && id) {
  await ApiService.patch(`/inventory/products/${id}`, productData)
  productId = id
```

Replace with:

```ts
if (isEditMode && id) {
  await updateProduct({ id, data: productData }).unwrap()
  productId = id
```

**Step 4: Verify the frontend TypeScript compiles**

```bash
cd frontend && npm run type-check
```

Expected: no errors

**Step 5: Run frontend tests**

```bash
cd frontend && npx vitest run src/pages/inventory/__tests__/CreateProductPage.test.tsx
```

Expected: all tests pass (or same pass/fail as before — no regressions)

**Step 6: Manual smoke test**

1. Start the dev server: `cd frontend && npm run dev`
2. Navigate to `/inventory/products`
3. Select any product, click Edit
4. Change the product name, click Update Product
5. Verify: you land back on Products page and the product name in both the list (left) and detail panel (right) immediately shows the new name — **no refresh needed**

**Step 7: Commit**

```bash
git add frontend/src/pages/inventory/CreateProductPage.tsx
git commit -m "fix(inventory): invalidate product cache after edit so UI updates instantly"
```
