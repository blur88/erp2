# Products Page Filter Bar — Design Spec

**Issue:** #301  
**Date:** 2026-04-06

## Overview

Refactor the `ProductsPage` filter bar to align with the standard `FilterBar` system, add three new filters (Category, Product Type, Stock Status), and remove the existing Status filter.

## Current State

`ProductsPage` has two filters: `search` and `status` (Active/Inactive). The backend already supports `categoryId`, `type`, `lowStock`, and `outOfStock` query params — no backend changes are needed.

## New Filter Components

Three new components in `frontend/src/components/filters/`:

### `FilterCategory.tsx`
- Fetches categories via `useGetCategoriesQuery`
- Maps to flat, alphabetically-sorted options using `category.name` as the label and `category.id` as the value
- Renders via `FilterSelect` (single select)
- Pattern: identical to `FilterSupplier.tsx`

### `FilterProductType.tsx`
- Static options: `goods` → "Goods", `service` → "Service"
- Renders via `FilterSelect` (single select)
- Pattern: identical to `FilterPurchasingStatus.tsx`

### `FilterStockStatus.tsx`
- Static options: `low_stock` → "Low Stock", `out_of_stock` → "Out of Stock"
- Renders via `FilterSelect` (single select)
- Pattern: identical to `FilterPurchasingStatus.tsx`

## Type System Changes

**`frontend/src/types/filterBar.types.ts`:**

- Add `'category' | 'product-type' | 'stock-status'` to `FilterFieldType`
- Add three config interfaces extending `BaseFilterFieldConfig` with no extra fields:
  - `CategoryFilterFieldConfig`
  - `ProductTypeFilterFieldConfig`
  - `StockStatusFilterFieldConfig`
- Add all three to the `FilterFieldConfig` union type

## FilterBar Changes

**`frontend/src/components/filters/FilterBar.tsx`:**

- Import the three new components
- Add three `if` blocks in `renderQuickField` for `'category'`, `'product-type'`, and `'stock-status'`, each rendering its dedicated component
- Pattern: identical to existing `supplier` and `purchasing-status` blocks

## ProductsPage Changes

**`frontend/src/pages/inventory/ProductsPage.tsx`:**

### Updated `InventoryProductFilters` interface
Remove `status`. Final shape:
```typescript
interface InventoryProductFilters {
  search: string
  categoryId: string | null
  type: 'goods' | 'service' | null
  stockStatus: 'low_stock' | 'out_of_stock' | null
}
```

### Updated `filterConfig` fields
Remove the existing `status` select field. Add:
```typescript
{ field: 'categoryId', label: 'Category', type: 'category' },
{ field: 'type', label: 'Product Type', type: 'product-type' },
{ field: 'stockStatus', label: 'Stock Status', type: 'stock-status' },
```

### Updated `defaults`
```typescript
defaults: {
  search: '',
  categoryId: null,
  type: null,
  stockStatus: null,
}
```

### Updated `productQueryParams` mapping
Remove `isActive` mapping. The API default (`isActive: true` set in `inventoryApi.ts`) is retained as-is.
```typescript
const productQueryParams = useMemo(() => ({
  search: appliedFilters.search || undefined,
  categoryId: appliedFilters.categoryId ?? undefined,
  type: appliedFilters.type ?? undefined,
  lowStock: appliedFilters.stockStatus === 'low_stock' ? true : undefined,
  outOfStock: appliedFilters.stockStatus === 'out_of_stock' ? true : undefined,
}), [appliedFilters])
```

## Backend

No changes required. `QueryProductsDto` already supports `categoryId`, `type`, `lowStock`, and `outOfStock`.

## Testing

- Unit tests for each new filter component (render, onChange, options)
- Update `ProductsPage` tests to cover new filter fields and query param mapping
- Verify `stockStatus` correctly maps to mutually exclusive `lowStock`/`outOfStock` params
