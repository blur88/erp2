# Filter Select Migration Design

**Issue:** #320 — UI: Customer Type filter wording blocked by dropdown arrow  
**Date:** 2026-04-09

## Problem

`FilterBar` routes `type: 'select'` and `type: 'multi-select'` config entries to the generic `FilterSelect` component. This causes two problems:

1. **MUI label bug** — the single-select branch is missing `displayEmpty`, `OutlinedInput` with `notched`, and has a too-small default `minWidth` (140px), causing labels like "Customer Type" to be clipped by the dropdown arrow.
2. **Inconsistency** — all other filter types have dedicated components (`FilterOrderStatus`, `FilterPaymentStatus`, `FilterSupplier`, etc.) wired directly in `FilterBar`. The `select`/`multi-select` generic fallback is the odd one out and makes filters harder to find and manage.

The `multi-select` type has zero usages anywhere in the codebase.

## Design

### 1. Fix `FilterSelect` (shared primitive)

`FilterSelect` remains as the shared rendering primitive used internally by all dedicated components. Fix the MUI label rendering bug in the single-select branch:

- Add `displayEmpty` to `<Select>`
- Replace inline `label` prop with `<OutlinedInput label={label} notched />`
- Increase default `minWidth` from `140` to `160`
- Remove the `multi-select` branch entirely (unused)
- Simplify props: remove `type`, `emptyLabel` becomes optional with default `'All'` (already is)

Keeping `FilterSelect` as a shared primitive means MUI fixes and style changes apply to all dedicated components from one place.

### 2. Create Missing Dedicated Components

Following the exact pattern of existing dedicated components (`FilterOrderStatus`, `FilterStockStatus`, etc.) — each wraps `FilterSelect` with hardcoded label and options, typed `onChange`, and receives `field` from `FilterBar` (no `useId()`).

| Component | Options | Pages |
|---|---|---|
| `FilterStatus` | Active, Inactive | CustomersPage, SuppliersPage, PriceListsPage, UserManagementPage |
| `FilterCustomerType` | Individual, Business | CustomersPage |
| `FilterRole` | Admin, Manager, Sales Staff, Inventory Staff, Procurement Staff | UserManagementPage |
| `FilterStockAdjustmentStatus` | Draft, Completed | StockAdjustmentsPage |

Existing components that already exist and just need `useId()` removed:
- `FilterStockStatus`
- `FilterSupplier`
- `FilterCategory`

### 3. Wire into `FilterBar`

Add new field types to `filterBar.types.ts`:
- `'status'`
- `'customer-type'`
- `'role'`
- `'stock-adjustment-status'`

Add corresponding `if` branches in `FilterBar.tsx` `renderQuickField`, dispatching to dedicated components and passing `field` from the config. Remove the `select`/`multi-select` fallback branch entirely.

### 4. Update Pages

Replace `type: 'select'` config entries with dedicated types and remove `options`/`label` from those entries (dedicated components own them):

| Page | Field | Old type | New type |
|---|---|---|---|
| CustomersPage | `status` | `select` | `status` |
| CustomersPage | `type` | `select` | `customer-type` |
| SuppliersPage | `status` | `select` | `status` |
| PriceListsPage | `status` | `select` | `status` |
| UserManagementPage | `status` | `select` | `status` |
| UserManagementPage | `role` | `select` | `role` |
| StockAdjustmentsPage | `status` | `select` | `stock-adjustment-status` |
| InventoryPage | `supplierId` | `select` | `supplier` |
| InventoryPage | `categoryId` | `select` | `category` |
| InventoryPage | `stockStatus` | `select` | `stock-status` |

### 5. Cleanup

- Remove `type: 'select' | 'multi-select'` from `FilterBarFieldConfig` in `filterBar.types.ts`
- Remove `options` from the field config type (dedicated components own their options; dynamic ones like `FilterSupplier`/`FilterCategory` fetch internally)
- Remove `useId()` from `FilterStockStatus`, `FilterSupplier`, `FilterCategory` — `field` is passed from `FilterBar`

## Files Affected

- `frontend/src/components/filters/FilterSelect.tsx` — fix MUI bug, remove multi-select branch
- `frontend/src/components/filters/FilterBar.tsx` — add new type branches, remove select/multi-select
- `frontend/src/types/filterBar.types.ts` — add new types, remove select/multi-select/options
- `frontend/src/components/filters/FilterStatus.tsx` — new
- `frontend/src/components/filters/FilterCustomerType.tsx` — new
- `frontend/src/components/filters/FilterRole.tsx` — new
- `frontend/src/components/filters/FilterStockAdjustmentStatus.tsx` — new
- `frontend/src/components/filters/FilterStockStatus.tsx` — remove useId()
- `frontend/src/components/filters/FilterSupplier.tsx` — remove useId()
- `frontend/src/components/filters/FilterCategory.tsx` — remove useId()
- `frontend/src/pages/sales/CustomersPage.tsx` — update filter config
- `frontend/src/pages/purchasing/SuppliersPage.tsx` — update filter config
- `frontend/src/pages/settings/PriceListsPage.tsx` — update filter config
- `frontend/src/pages/settings/UserManagementPage.tsx` — update filter config
- `frontend/src/pages/inventory/StockAdjustmentsPage.tsx` — update filter config
- `frontend/src/pages/inventory/InventoryPage.tsx` — update filter config

## Testing

- Existing `FilterBar.test.tsx` and `FilterSelect.test.tsx` — update to remove select/multi-select cases
- Existing `CustomersPage.filter.test.tsx` — verify Customer Type and Status filters still work
- Smoke test each affected page: filter dropdowns render correctly, labels are not clipped, values filter the list
