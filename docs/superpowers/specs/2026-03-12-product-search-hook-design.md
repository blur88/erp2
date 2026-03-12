# Product Search Hook — Design Spec

**Date:** 2026-03-12
**Issue:** [#88 — Product Search in Create Sales Order Not Filtering Results](https://github.com/blur88/erp2/issues/88)

## Problem

`CreateSalesOrderPage` has three bugs in its product search:

1. Search results are **merged** into the existing products list instead of replacing it — so all previously loaded products remain visible after typing a search term.
2. No **race condition guard** — a slow response from an earlier search can overwrite a newer one.
3. The `Autocomplete` `value` prop looks up the selected product by ID from the options list — when the list is replaced by search results the selected product disappears from the field.
4. No `isOptionEqualToValue` — MUI Autocomplete cannot correctly match the selected value to the new options list after a search.

`CreatePurchaseOrderPage` already has correct implementations of all four. This design fixes the SO page and eliminates the duplication by extracting shared logic into a hook.

## Solution

### New file: `frontend/src/hooks/useProductSearch.ts`

A custom hook that owns all product-search state and logic:

```ts
function useProductSearch(): {
  products: Product[]
  loadProducts: (searchTerm?: string) => Promise<void>
  seedProducts: (products: Product[]) => void
}
```

**`loadProducts(searchTerm?)`**
- Increments a request ref before each call; discards responses from stale requests.
- Calls `ApiService.get('/inventory/products', { params: { isActive: true, search?: searchTerm } })`.
- **Replaces** the products list with the response (no merging).
- Passing no argument or an empty string fetches all active products (initial load).
- The backend `search` param matches both product name and barcode via `ILIKE`.

**`seedProducts(products[])`**
- Merges a set of products into the list without duplicates (by `id`).
- Used in edit mode to pre-populate the options list with products from a loaded order, so already-selected products are visible without requiring a search.

### Changes to `CreateSalesOrderPage`

- Remove inline `products` state, `latestProductsRequestRef`, and `loadProducts` function.
- Replace with `const { products, loadProducts, seedProducts } = useProductSearch()`.
- In edit-mode order loading: replace the `setProducts` merge block with `seedProducts(orderProducts)`.
- Fix `Autocomplete` `value` prop:
  ```ts
  // Before
  value={products.find(p => p.id === productField.value) || null}
  // After
  value={watchedItems[index]?.product || products.find(p => p.id === productField.value) || null}
  ```
- Add `isOptionEqualToValue={(option, value) => option.id === value.id}`.
- `filterOptions={(options) => options}` remains — filtering is server-side.

### Changes to `CreatePurchaseOrderPage`

- Remove inline `products` state, `latestProductsRequestRef`, and `loadProducts` function.
- Replace with `const { products, loadProducts, seedProducts } = useProductSearch()`.
- In edit-mode order loading: replace the `setProducts` merge block with `seedProducts(orderProducts)`.
- `Autocomplete` is already correct — no changes needed.

## Files

| File | Change |
|------|--------|
| `frontend/src/hooks/useProductSearch.ts` | New |
| `frontend/src/pages/sales/CreateSalesOrderPage.tsx` | Bug fixes + hook adoption |
| `frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx` | Refactor to hook |

## Out of Scope

- RTK Query migration for product search
- Debouncing (can be added inside the hook later without touching consumers)
- Any other changes to SO or PO pages
