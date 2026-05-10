# Design: Knip Cleanup (Issue #538)

**Date:** 2026-05-07  
**Branch strategy:** Single PR, closes #538

---

## Overview

Remove unused files, exports, types, and dependencies identified by Knip across frontend and backend. Add three genuinely-used but unlisted backend dependencies as direct deps. No behavior changes — purely structural cleanup.

---

## Frontend

### File Deletions

| File | Reason |
|------|--------|
| `src/components/common/LoadingSpinner.tsx` | Zero imports anywhere |
| `src/pages/accounting/components/JournalEntriesDialogs.tsx` | Zero imports anywhere |
| `src/pages/purchasing/utils.ts` | Zero imports; date logic duplicated by `@/utils/dateRange` |

### Unused Exports

Remove `export` keyword only (keep the code if used locally, delete if not):

- `useSearchAndFilter` in `src/hooks/useSearchAndFilter.ts` — unexport only; `useKeyboardShortcuts` from same file is still used
- `selectCategoryFilters` in `src/store/slices/inventorySlice.ts` — unexport
- `selectSupplierFilters` in `src/store/slices/purchasingSlice.ts` — unexport
- `PurchaseOrdersSorting` interface in `src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.ts` — remove export or delete if only local

### Enum Member to Keep

`REVERSED` in `JournalEntryStatus` (`src/types/index.ts`) — **do not remove**. The string literal `'REVERSED'` is actively used in reports and filter utils. Knip flags it because `JournalEntryStatus.REVERSED` is never referenced directly, but the value is in use.

### Duplicate Default Exports

Remove `export default` from each file below. Named export is the one actually imported throughout the codebase. Verify no file uses a default import before removing; if any do, convert those import sites to named style.

- `src/components/common/ListSkeleton.tsx`
- `src/pages/accounting/JournalEntriesPage.tsx`
- `src/pages/inventory/ProductsPage.tsx`
- `src/pages/purchasing/GoodsReceivedPage.tsx`
- `src/pages/purchasing/PurchaseOrdersPage.tsx`
- `src/pages/sales/OrdersPage.tsx`

### Dependencies & Config

- Remove `@types/dompurify` from `devDependencies` in `frontend/package.json`
- Remove `@vitest/coverage-v8` from `ignoreDependencies` in `frontend/knip.json`

---

## Backend

### File Deletions

| File | Reason |
|------|--------|
| `src/common/controllers/base-crud.controller.ts` | Zero references |
| `src/database/entities/base-transaction-header.entity.ts` | Zero references |
| `src/database/entities/base-transaction-item.entity.ts` | Zero references |

### Unused Exports

- `BaseBulkResult` interface in `src/common/services/base-crud.service.ts` — remove export; delete entirely if not used locally
- `PRODUCT_SEARCH_ROLES` in `src/modules/search/search.permissions.ts` — inline into `canSearchProducts()` as `ALL_ROLES.includes(role)`, then delete the export

### Unlisted Dependencies

Add as direct `dependencies` in `backend/package.json`:

| Package | Used in |
|---------|---------|
| `express` | Filters, interceptors, middleware (`Request`, `Response`, `NextFunction`) |
| `luxon` | `src/common/utils/date-range.util.ts` |
| `uuid` | `src/modules/search/search.service.ts` |

Versions: match what is currently installed transitively (check `npm ls <pkg>` during implementation).

### Config

- Remove `supertest` and `@types/supertest` from `ignoreDependencies` in `backend/knip.json`
- Keep `ts-loader` in `ignoreDependencies` (known unused dep, tracked separately)

---

## Testing

- Run `cd frontend && npm run type-check` — must pass
- Run `cd frontend && npx knip` — should produce a clean or near-clean report
- Run `cd backend && npm run build` — must pass
- Run `cd backend && npx knip` — should produce a clean or near-clean report
- Run targeted tests on any file touched (e.g. slices, hooks)

---

## Out of Scope

- Removing `ts-loader` from backend `package.json` (tracked separately per project notes)
- Any refactoring beyond what Knip flagged
