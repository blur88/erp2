# Filter System Relocation Design

**Issue:** #245
**Date:** 2026-04-01

## Goal

Move filter system logic out of `components/filters/` into the correct directories, following existing project conventions. This separates UI components from business logic, types, and utilities.

## File Moves

| File | From | To |
|---|---|---|
| `useFilterBar.ts` | `components/filters/` | `hooks/` |
| `filterBar.url.ts` | `components/filters/` | `utils/` |
| `filterBar.types.ts` | `components/filters/` | `types/` |

**Rationale per file:**
- `useFilterBar.ts` — React hook; belongs with other hooks in `hooks/`
- `filterBar.url.ts` — pure URL serialization/deserialization utility (no React); belongs with other utilities in `utils/`
- `filterBar.types.ts` — shared types used by both UI components and the hook; belongs in `types/` alongside other shared types

## Files Staying in `components/filters/`

`FilterBar.tsx`, `DashboardFilterBar.tsx`, `FilterPeriod.tsx`, `FilterSearch.tsx`, `FilterSelect.tsx` — all pure UI components, correctly placed.

## `components/filters/index.ts` Changes

Remove re-exports of `useFilterBar` and filter types. Keep only UI component exports:

```ts
export { FilterBar } from './FilterBar'
export { FilterPeriod } from './FilterPeriod'
```

## Import Updates

**Inside `components/filters/`:**
- `FilterBar.tsx` — update type imports to `@/types/filterBar.types`
- `DashboardFilterBar.tsx` — same
- `FilterSelect.tsx` — same

**Page files (8 files):**
- `pages/purchasing/PurchaseOrdersPage.tsx`
- `pages/purchasing/SuppliersPage.tsx`
- `pages/inventory/ProductsPage.tsx`
- `pages/inventory/StockAdjustmentsPage.tsx`
- `pages/sales/OrdersPage.tsx`
- `pages/sales/PaymentsPage.tsx`
- `pages/sales/CustomersPage.tsx`
- `pages/settings/UserManagementPage.tsx`

Each updates `useFilterBar` import from `../components/filters/useFilterBar` (or via index) to `@/hooks/useFilterBar`. Type imports update to `@/types/filterBar.types`.

**Test files:**
- `components/filters/__tests__/useFilterBar.test.tsx` — move to `hooks/__tests__/useFilterBar.test.tsx` (or `hooks/useFilterBar.test.ts` flat, matching existing pattern); update imports
- `components/filters/__tests__/filterBar.url.test.ts` — move to `utils/filterBar.url.test.ts`; update imports
- `components/filters/__tests__/FilterBar.test.tsx` — stays in `components/filters/__tests__/`; update type imports only

## Verification

1. `cd frontend && npm run type-check` — must pass with zero errors
2. `cd frontend && npx vitest run src/hooks/useFilterBar.test.tsx` — must pass
3. `cd frontend && npx vitest run src/utils/filterBar.url.test.ts` — must pass
4. `cd frontend && npx vitest run src/components/filters/__tests__/FilterBar.test.tsx` — must pass
