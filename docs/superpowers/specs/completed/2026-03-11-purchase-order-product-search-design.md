# Design: Fix Product Search Accumulation Bug in Create Purchase Order

**Issue**: #72
**Date**: 2026-03-11

## Problem

When searching for products in the PO Items table, the dropdown accumulates results from all previous searches instead of showing only results matching the current term. This happens because `loadProducts` merges new results into the existing `products` state array rather than replacing it.

## Root Cause

`CreatePurchaseOrderPage.tsx` — `loadProducts` function (lines 263–267):

```tsx
setProducts((prevProducts) => {
  const existingIds = new Set(prevProducts.map(p => p.id))
  const productsToAdd = newProducts.filter((p: any) => !existingIds.has(p.id))
  return [...prevProducts, ...productsToAdd]
})
```

Because the Autocomplete uses `filterOptions={(options) => options}` (server-side filtering, no client-side filtering), the entire accumulated array is displayed — growing with every search.

## Fix

Replace the merge with a simple state replacement:

```tsx
setProducts(newProducts)
```

## Scope

- **File**: `frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx`
- **Lines affected**: 263–267 (the `setProducts` call inside `loadProducts`)
- **No backend changes** — `findAll` already returns all matching products without pagination
- **No frontend limit param changes** — no limit was ever sent

## What Is NOT Changed

- `loadPurchaseOrder` (lines 158–163) retains its merge logic — this correctly seeds the selected products from an existing order into state when entering edit mode, which is a different concern.
- `filterOptions={(options) => options}` remains — server-side filtering is correct.
- Autocomplete `value` prop remains controlled (`products.find(p => p.id === productField.value) || null`) — MUI handles the case where the selected product is not in the current search results gracefully.

## Behavior After Fix

- Searching "A" shows only products matching "A"
- Clearing and searching "B" shows only products matching "B"
- Selected products in existing rows are not lost when the options list changes
- Edit mode continues to work — existing order items' products are seeded via `loadPurchaseOrder`
