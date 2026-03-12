# Product Edit Instant Update Design

**Date:** 2026-03-10
**Status:** Approved

## Problem

When editing a product and saving, the Products page does not reflect the updated data until the browser is manually refreshed.

## Root Cause

`CreateProductPage.tsx` uses `ApiService.patch(...)` directly to save edits. This bypasses RTK Query's cache invalidation, so `useGetProductsQuery` on ProductsPage never refetches and both the product list and detail panel show stale data.

## Solution

Replace the raw `ApiService.patch` call with the RTK Query `useUpdateProductMutation`, which already exists in `inventoryApi.ts` with `invalidatesTags: ['Product']`. This causes RTK Query to automatically refetch the products list after a successful edit.

The existing `useProductsSelection` hook already syncs `selectedProduct` from the refreshed list, so the detail panel updates too.

## Scope

- **1 file changed:** `frontend/src/pages/inventory/CreateProductPage.tsx`
- Add `useUpdateProductMutation` import
- Replace `ApiService.patch(...)` with `updateProduct({ id, data }).unwrap()`

## Why Not Alternatives

- **Manual refetch via navigation state:** Awkward cross-page communication, more complexity.
- **Optimistic cache update:** Overkill; can drift from server state.
