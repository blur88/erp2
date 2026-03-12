# Design: Remove Pagination + Fix New Product Selection (Issue #63)

**Date:** 2026-03-10
**Issue:** [#63 - Newly created products fail to highlight and show details in Inventory List](https://github.com/blur88/erp2/issues/63)

## Problem

When a user creates a new product and is navigated back to the Products page, the newly created product fails to be highlighted or shown in the details panel. The root cause is a "killer effect" in `useProductsSelection.ts` that clears `selectedProduct` when the product is not found in the current `products[]` array. Since the product list is paginated, a new product may land on a page other than page 1, causing the effect to wipe the selection.

## Solution

Remove pagination from the backend products endpoint entirely, so all products are always returned in a single response. At ~3000 products this is acceptable. With all products always present in the list, the killer effect's bad case is eliminated — the newly created product will always be in `products[]` after refetch, so the selection is never incorrectly cleared.

## Backend Changes

### `backend/src/modules/inventory/dto/product.dto.ts`
- Remove `page` and `limit` fields from `QueryProductsDto`
- Remove `page`, `limit`, `totalPages`, `hasNextPage`, `hasPreviousPage` from `ProductListResponseDto` meta object — keep only `total`

### `backend/src/modules/inventory/services/product.service.ts`
- Remove offset/limit calculations in `findAll` and `findDeleted`
- Remove `.skip(offset).take(limit)` from both query builders
- Simplify the returned `meta` to `{ total }`

## Frontend Changes

### `frontend/src/store/api/inventoryApi.ts`
- Remove `page: 1` from default query args for `getProducts`

### `frontend/src/pages/inventory/ProductsPage.tsx`
- Remove `page: 1` hardcode from query params
- Replace `pagination?.meta` total usage with `products.length` or response `meta.total`

### `frontend/src/pages/inventory/components/ProductsTable.tsx`
- Replace `total` prop (used for "Product List (N)" count) with `products.length`

### `frontend/src/pages/inventory/hooks/useProductsSelection.ts`
Remove dead code that only existed to handle the "product not on current page" case:
- `fetchProductById` param and all usages
- `pendingProductId` / `setPendingProductId` — fallback fetch path is gone
- `hasNavigatedWithSelection` / `setHasNavigatedWithSelection` — only existed to suppress auto-selection during the async fetch window
- The `else` branch in the pending product effect (the `fetchProductById` fallback)

The killer effect (lines 61-73) is retained but becomes benign — with full product list always loaded, a valid selected product will always be found.

## Why Not Option A (guard the killer effect)?

Guarding the killer effect with `pendingProductId` would fix the immediate symptom but leave behind pagination infrastructure that is no longer needed. Removing pagination is the correct long-term fix — it eliminates the entire class of "product not in current page" bugs and simplifies the selection logic significantly.

## Scale Consideration

3000 products × ~500 bytes/record ≈ 1.5MB payload. Acceptable for a single fetch. The frontend list is not virtualized; if rendering performance becomes an issue at scale, virtualization can be added separately.
