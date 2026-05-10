# Issue #292 — Purchasing Filter Components

**Date:** 2026-04-05
**Issue:** blur88/erp2#292

## Overview

Create two reusable filter components for the Purchasing module — `FilterSupplier` and `FilterPurchasingStatus` — following the exact pattern of `FilterCustomer` and `FilterOrderStatus` in the Sales module. Register them as named types in the filter type system, then refactor `PurchasingPage` and `PurchaseOrdersPage` to use them instead of inline query/options logic.

## New Components

### `FilterSupplier.tsx`

- Calls `useGetSuppliersQuery({ limit: 999999 })` internally
- Maps response: `{ value: supplier.id, label: supplier.companyName ?? supplier.name }`
- Renders `FilterSelect` with label "Supplier"
- Props: `{ value: string | null, onChange: (value: string | null) => void }`

### `FilterPurchasingStatus.tsx`

- Static options: `[{ value: 'pending', label: 'Pending' }, { value: 'received', label: 'Received' }]`
- Renders `FilterSelect` with label "Order Status"
- Props: `{ value: string | null, onChange: (value: string | null) => void }`

## Type System Changes

**`filterBar.types.ts`:**
- Add `'supplier'` and `'purchasing-status'` to `FilterFieldType` union
- Add `SupplierFilterFieldConfig` and `PurchasingStatusFilterFieldConfig` interfaces (no extra props beyond base)
- Add both to the `FilterFieldConfig` discriminated union

**`FilterBar.tsx`:**
- Add `if (field.type === 'supplier')` branch rendering `<FilterSupplier>`
- Add `if (field.type === 'purchasing-status')` branch rendering `<FilterPurchasingStatus>`

## Consumer Refactors

### `PurchasingPage.tsx`
- Remove `useGetSuppliersQuery` import, `suppliersData`, and `supplierOptions` local vars
- `supplierId` field: `type: 'select'` → `type: 'supplier'`, remove `options` array and `'All Suppliers'` placeholder
- `status` field: `type: 'select'` → `type: 'purchasing-status'`, remove hardcoded `options`

### `PurchaseOrdersPage.tsx`
- Remove `useGetSuppliersQuery` from imports and `suppliers` local var
- `supplierId` field: `type: 'select'` → `type: 'supplier'`, remove `options` array
- Remove `[suppliers]` from `useMemo` dependency array (config becomes stable, no deps needed)

### `index.ts`
- Export `FilterSupplier` and `FilterPurchasingStatus`

## Testing

No new test files. Both components are thin wrappers with no novel logic. Existing filterbar tests for `PurchasingPage` and `PurchaseOrdersPage` continue to pass unchanged — filter field keys (`supplierId`, `status`) are unchanged.

## Files Touched

| File | Change |
|------|--------|
| `src/components/filters/FilterSupplier.tsx` | New |
| `src/components/filters/FilterPurchasingStatus.tsx` | New |
| `src/components/filters/index.ts` | Add 2 exports |
| `src/types/filterBar.types.ts` | Add 2 types to union |
| `src/components/filters/FilterBar.tsx` | Add 2 render branches |
| `src/pages/purchasing/PurchasingPage.tsx` | Remove inline supplier query + static options |
| `src/pages/purchasing/PurchaseOrdersPage.tsx` | Remove inline supplier query |
