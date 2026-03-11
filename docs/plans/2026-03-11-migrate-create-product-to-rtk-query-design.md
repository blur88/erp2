# Design: Migrate CreateProductPage ApiService Calls to RTK Query

**Date:** 2026-03-11
**Issue:** [#63 - Newly created products fail to highlight and show details in Inventory List](https://github.com/blur88/erp2/issues/63) (follow-up comment)

## Problem

`CreateProductPage.tsx` uses `ApiService.post` for product creation and `ApiService.get` for loading a product in edit mode. Because `ApiService` bypasses RTK Query entirely:

1. **No cache invalidation** — creating a product does not invalidate the `['Product']` tag, so the product list remains stale after redirect
2. **Selection fails** — `useProductsSelection` tries to find the new product in the stale cached list and fails, leaving the details panel blank
3. **Inconsistent pattern** — the edit path already uses `useUpdateProductMutation` from RTK Query; creation is the only outlier

The edit-mode load (`ApiService.get`) also bypasses the cache and uses axios-specific error shapes, making error handling inconsistent.

## Solution

Replace both `ApiService` calls with RTK Query hooks:

- `ApiService.post` → `useCreateProductMutation` (already defined in `inventoryApi.ts` with `invalidatesTags: ['Product']`)
- `ApiService.get` → `useLazyGetProductQuery` (already exported from `inventoryApi.ts`)

Remove `ApiService` import from the file entirely.

## Changes

### `frontend/src/pages/inventory/CreateProductPage.tsx`

**Imports:**
- Add `useCreateProductMutation`, `useLazyGetProductQuery` to the `inventoryApi` import
- Remove `import { ApiService } from '@/services/api'`

**Hook wiring (alongside existing `useUpdateProductMutation`):**
```typescript
const [createProduct] = useCreateProductMutation()
const [fetchProduct, { isFetching: isFetchingProduct }] = useLazyGetProductQuery()
```

**Remove `loadingProduct` state** — replaced by `isFetchingProduct` from lazy query.

**Replace `loadProduct` function:**
```typescript
const loadProduct = async (productId: string) => {
  try {
    const product = await fetchProduct(productId).unwrap()
    if (product.category) setSelectedCategory(product.category)
    reset({ ...fields from product... })
    if (product.priceListItems) { ...setPriceListPrices... }
  } catch (err: any) {
    showError(err?.message || 'Failed to load product')
    setError('Failed to load product')
  }
}
```

**Replace creation in `onSubmit`:**
```typescript
// BEFORE:
const response = await ApiService.post('/inventory/products', productData) as any
productId = response?.id

// AFTER:
const response = await createProduct(productData).unwrap()
productId = response?.id
```

**Update JSX loading spinner:**
```tsx
{isFetchingProduct ? (
  <Box>...</Box>
) : (
  <form>...</form>
)}
```

**Error handling** — change `err?.response?.data?.message` to `err?.message || 'Failed to load product'` to match RTK Query error shape from `axiosBaseQuery`.

## Why Not Option A (create-only)?

Migrating only the creation call would leave `ApiService.get` in place with axios-specific error handling, perpetuating the mixed pattern. Option B costs one extra hook line and removes the inconsistency entirely.
