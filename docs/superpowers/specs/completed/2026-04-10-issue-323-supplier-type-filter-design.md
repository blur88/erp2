# Supplier Type Filter — Issue #323

**Date:** 2026-04-10
**Issue:** [blur88/erp2#323](https://github.com/blur88/erp2/issues/323)

## Summary

Add a "Supplier Type" filter (`local` / `international`) to the Suppliers page filter bar, mirroring the `customer-type` filter pattern on the Customers page.

## Context

- `SupplierType` enum has two values: `local` and `international` (defined in `supplier.entity.ts`)
- `SupplierQueryDto` already accepts a `type` field; `SupplierService.findAll()` already filters by it — **no backend changes needed**
- The filter bar system has an established pattern: `FilterCustomerType` wraps `FilterSelect` with a static options list and is wired into `FilterBar.tsx` via a type discriminant

## Changes

### 1. `frontend/src/types/filterBar.types.ts`
- Add `'supplier-type'` to the `FilterFieldType` union
- Add `SupplierTypeFilterFieldConfig` interface (mirrors `CustomerTypeFilterFieldConfig`)
- Add it to the `FilterFieldConfig` union

### 2. `frontend/src/components/filters/FilterSupplierType.tsx` (new)
- Wraps `FilterSelect` with label `"Supplier Type"` and options:
  - `{ value: 'local', label: 'Local' }`
  - `{ value: 'international', label: 'International' }`

### 3. `frontend/src/components/filters/FilterBar.tsx`
- Import `FilterSupplierType`
- Add `supplier-type` branch in `renderQuickField` (mirrors `customer-type` branch)

### 4. `frontend/src/pages/purchasing/SuppliersPage.tsx`
- Extend `SupplierFilters` interface: add `type: 'local' | 'international' | null`
- Add `{ field: 'type', label: 'Supplier Type', type: 'supplier-type' }` to `filterConfig.fields`
- Add `type: null` to `filterConfig.defaults`
- Pass `type: appliedFilters.type ?? undefined` to `supplierQueryParams`

### 5. `frontend/src/pages/purchasing/__tests__/SuppliersPage.filterbar.test.tsx`
- Add test: URL `?type=local` → query called with `{ type: 'local' }`
- Add test: URL with no type → query not called with `type`

## Out of Scope
- Deleted suppliers dialog (no filter bar there)
- Backend changes (already complete)
- URL persistence (handled automatically by `useFilterBar`)
