# Issue #538 Knip Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all unused files, exports, types, and dependencies flagged by Knip across frontend and backend, and add three genuinely-used but unlisted backend dependencies.

**Architecture:** Pure cleanup — no new behavior. Delete dead files, unexport or delete unused symbols, remove redundant default exports (converting default-importing test files to named imports), and add `express`, `luxon`, `uuid` as explicit backend dependencies.

**Tech Stack:** React 19 / Vite / Vitest (frontend), NestJS 11 / Jest (backend), Knip 5

---

## File Map

### Frontend — Deleted
- `src/components/common/LoadingSpinner.tsx` — deleted (zero imports)
- `src/pages/accounting/components/JournalEntriesDialogs.tsx` — deleted (zero imports)
- `src/pages/purchasing/utils.ts` — deleted (zero imports)

### Frontend — Modified
- `src/hooks/useSearchAndFilter.ts` — remove `export` from `useSearchAndFilter`
- `src/store/slices/inventorySlice.ts` — remove `export` from `selectCategoryFilters`
- `src/store/slices/purchasingSlice.ts` — remove `export` from `selectSupplierFilters`
- `src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.ts` — delete `PurchaseOrdersSorting` interface entirely
- `src/components/common/ListSkeleton.tsx` — remove `export default ListSkeleton`
- `src/pages/accounting/JournalEntriesPage.tsx` — remove `export default JournalEntriesPage`
- `src/pages/inventory/ProductsPage.tsx` — remove `export default ProductsPage`
- `src/pages/purchasing/GoodsReceivedPage.tsx` — remove `export default GoodsReceivedPage`
- `src/pages/purchasing/PurchaseOrdersPage.tsx` — remove `export default PurchaseOrdersPage`
- `src/pages/sales/OrdersPage.tsx` — remove `export default OrdersPage`
- `frontend/src/__tests__/integration/accounting-auto-posting.integration.test.tsx` — convert default import of `JournalEntriesPage` to named import
- `frontend/src/pages/accounting/__tests__/JournalEntriesPage.test.tsx` — convert default import to named import
- `frontend/package.json` — remove `@types/dompurify` from devDependencies
- `frontend/knip.json` — remove `@vitest/coverage-v8` from ignoreDependencies

### Backend — Deleted
- `src/common/controllers/base-crud.controller.ts` — deleted (zero references)
- `src/database/entities/base-transaction-header.entity.ts` — deleted (zero references)
- `src/database/entities/base-transaction-item.entity.ts` — deleted (zero references)

### Backend — Modified
- `src/common/services/base-crud.service.ts` — delete `BaseBulkResult` interface entirely
- `src/modules/search/search.permissions.ts` — inline `PRODUCT_SEARCH_ROLES` into `canSearchProducts()`, delete the export
- `backend/package.json` — add `express`, `luxon`, `uuid` to dependencies
- `backend/knip.json` — remove `supertest` and `@types/supertest` from ignoreDependencies

---

## Task 1: Delete unused frontend files

**Files:**
- Delete: `frontend/src/components/common/LoadingSpinner.tsx`
- Delete: `frontend/src/pages/accounting/components/JournalEntriesDialogs.tsx`
- Delete: `frontend/src/pages/purchasing/utils.ts`

- [ ] **Step 1: Delete the three files**

```bash
rm frontend/src/components/common/LoadingSpinner.tsx
rm frontend/src/pages/accounting/components/JournalEntriesDialogs.tsx
rm frontend/src/pages/purchasing/utils.ts
```

- [ ] **Step 2: Verify type-check still passes**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: delete unused frontend files (issue #538)"
```

---

## Task 2: Remove unused frontend exports

**Files:**
- Modify: `frontend/src/hooks/useSearchAndFilter.ts`
- Modify: `frontend/src/store/slices/inventorySlice.ts`
- Modify: `frontend/src/store/slices/purchasingSlice.ts`
- Modify: `frontend/src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.ts`

- [ ] **Step 1: Unexport `useSearchAndFilter` in `src/hooks/useSearchAndFilter.ts`**

Find this line:
```ts
export const useSearchAndFilter = ({
```
Change to:
```ts
const useSearchAndFilter = ({
```

- [ ] **Step 2: Unexport `selectCategoryFilters` in `src/store/slices/inventorySlice.ts`**

Find this line:
```ts
export const selectCategoryFilters = (state: RootState) => state.inventory.filters.categories
```
Change to:
```ts
const selectCategoryFilters = (state: RootState) => state.inventory.filters.categories
```

- [ ] **Step 3: Unexport `selectSupplierFilters` in `src/store/slices/purchasingSlice.ts`**

Find this line:
```ts
export const selectSupplierFilters = (state: RootState) => state.purchasing.supplierFilters
```
Change to:
```ts
const selectSupplierFilters = (state: RootState) => state.purchasing.supplierFilters
```

- [ ] **Step 4: Delete `PurchaseOrdersSorting` interface in `src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.ts`**

Delete the entire interface block (it is defined but never used locally or externally):
```ts
export interface PurchaseOrdersSorting {
  // ... all lines until closing brace
}
```

- [ ] **Step 5: Verify type-check passes**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 6: Run targeted tests on modified slices and hooks**

```bash
cd frontend && npx vitest run src/store/slices/inventorySlice.ts src/store/slices/purchasingSlice.ts src/hooks/useSearchAndFilter.ts 2>/dev/null || npx vitest run src/store src/hooks
```

Expected: all pass

- [ ] **Step 7: Commit**

```bash
git add frontend/src/hooks/useSearchAndFilter.ts \
        frontend/src/store/slices/inventorySlice.ts \
        frontend/src/store/slices/purchasingSlice.ts \
        frontend/src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.ts
git commit -m "chore: remove unused frontend exports (issue #538)"
```

---

## Task 3: Remove duplicate default exports from frontend pages

**Files:**
- Modify: `frontend/src/components/common/ListSkeleton.tsx`
- Modify: `frontend/src/pages/accounting/JournalEntriesPage.tsx`
- Modify: `frontend/src/pages/inventory/ProductsPage.tsx`
- Modify: `frontend/src/pages/purchasing/GoodsReceivedPage.tsx`
- Modify: `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx`
- Modify: `frontend/src/pages/sales/OrdersPage.tsx`
- Modify: `frontend/src/__tests__/integration/accounting-auto-posting.integration.test.tsx`
- Modify: `frontend/src/pages/accounting/__tests__/JournalEntriesPage.test.tsx`

All six pages already use `export const PageName` (named export). The `export default` at the bottom of each file is the redundant duplicate. Two test files import `JournalEntriesPage` as a default import — convert those first.

- [ ] **Step 1: Convert default imports in test files to named imports**

In `frontend/src/__tests__/integration/accounting-auto-posting.integration.test.tsx`, find:
```ts
import JournalEntriesPage from '@/pages/accounting/JournalEntriesPage'
```
Replace with:
```ts
import { JournalEntriesPage } from '@/pages/accounting/JournalEntriesPage'
```

In `frontend/src/pages/accounting/__tests__/JournalEntriesPage.test.tsx`, find:
```ts
import JournalEntriesPage from '../JournalEntriesPage'
```
Replace with:
```ts
import { JournalEntriesPage } from '../JournalEntriesPage'
```

- [ ] **Step 2: Remove `export default` from all six page files**

In each file below, delete the last line that reads `export default <ComponentName>`:

- `frontend/src/components/common/ListSkeleton.tsx` — delete `export default ListSkeleton`
- `frontend/src/pages/accounting/JournalEntriesPage.tsx` — delete `export default JournalEntriesPage`
- `frontend/src/pages/inventory/ProductsPage.tsx` — delete `export default ProductsPage`
- `frontend/src/pages/purchasing/GoodsReceivedPage.tsx` — delete `export default GoodsReceivedPage`
- `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx` — delete `export default PurchaseOrdersPage`
- `frontend/src/pages/sales/OrdersPage.tsx` — delete `export default OrdersPage`

Note: `router.tsx` uses `React.lazy(() => import('./pages/...'))` — this uses the module's default export at runtime. Since we're removing default exports, **do not touch router.tsx**. React.lazy with named exports requires a different pattern. Instead, verify the router still works by checking type-check — if it errors, add `export default` back only for the router-used pages and keep the named export as the canonical one. Check now:

```bash
cd frontend && npm run type-check
```

If type-check errors on router.tsx, add back only the default exports needed by router (all 5 pages — not ListSkeleton which isn't lazy-loaded). In that case, the Knip "duplicate" flag is a false positive for router-used pages and those lines should stay.

- [ ] **Step 3: Run the affected test files**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/JournalEntriesPage.test.tsx
cd frontend && npx vitest run src/__tests__/integration/accounting-auto-posting.integration.test.tsx
```

Expected: all pass

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove duplicate default exports from frontend pages (issue #538)"
```

---

## Task 4: Clean up frontend package config

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/knip.json`

- [ ] **Step 1: Remove `@types/dompurify` from devDependencies in `frontend/package.json`**

Find and delete this line in the `devDependencies` section:
```json
"@types/dompurify": "^3.0.5",
```

- [ ] **Step 2: Remove `@vitest/coverage-v8` from ignoreDependencies in `frontend/knip.json`**

Current `frontend/knip.json`:
```json
"ignoreDependencies": ["@vitest/coverage-v8"],
```

Replace with:
```json
"ignoreDependencies": [],
```

- [ ] **Step 3: Verify type-check still passes**

```bash
cd frontend && npm run type-check
```

Expected: no errors (dompurify itself is still in dependencies; only the types package is removed)

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/knip.json
git commit -m "chore: clean up frontend package config (issue #538)"
```

---

## Task 5: Delete unused backend files

**Files:**
- Delete: `backend/src/common/controllers/base-crud.controller.ts`
- Delete: `backend/src/database/entities/base-transaction-header.entity.ts`
- Delete: `backend/src/database/entities/base-transaction-item.entity.ts`

- [ ] **Step 1: Delete the three files**

```bash
rm backend/src/common/controllers/base-crud.controller.ts
rm backend/src/database/entities/base-transaction-header.entity.ts
rm backend/src/database/entities/base-transaction-item.entity.ts
```

- [ ] **Step 2: Verify backend build passes**

```bash
cd backend && npm run build 2>&1 | tail -20
```

Expected: build completes with no errors

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: delete unused backend files (issue #538)"
```

---

## Task 6: Remove unused backend exports

**Files:**
- Modify: `backend/src/common/services/base-crud.service.ts`
- Modify: `backend/src/modules/search/search.permissions.ts`

- [ ] **Step 1: Delete `BaseBulkResult` interface from `base-crud.service.ts`**

The interface is defined but never used anywhere. Delete the entire block:
```ts
export interface BaseBulkResult {
  success: number;
  failed: number;
  errors: string[];
}
```
(Exact content may vary — delete whatever is between `export interface BaseBulkResult {` and its closing `}`)

- [ ] **Step 2: Inline `PRODUCT_SEARCH_ROLES` in `search.permissions.ts`**

Find:
```ts
export const PRODUCT_SEARCH_ROLES: UserRole[] = ALL_ROLES;
```
Delete that line entirely.

Then find:
```ts
export function canSearchProducts(role: UserRole): boolean {
  return PRODUCT_SEARCH_ROLES.includes(role);
}
```
Replace with:
```ts
export function canSearchProducts(role: UserRole): boolean {
  return ALL_ROLES.includes(role);
}
```

- [ ] **Step 3: Verify backend build passes**

```bash
cd backend && npm run build 2>&1 | tail -20
```

Expected: no errors

- [ ] **Step 4: Run backend tests**

```bash
cd backend && npx jest src/common/services/base-crud.service --no-coverage 2>&1 | tail -20
cd backend && npx jest src/modules/search --no-coverage 2>&1 | tail -20
```

Expected: all pass (or "no tests found" if no spec files exist for these)

- [ ] **Step 5: Commit**

```bash
git add backend/src/common/services/base-crud.service.ts \
        backend/src/modules/search/search.permissions.ts
git commit -m "chore: remove unused backend exports (issue #538)"
```

---

## Task 7: Add unlisted backend dependencies and clean up knip config

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/knip.json`

- [ ] **Step 1: Add `express`, `luxon`, `uuid` to dependencies in `backend/package.json`**

In the `dependencies` section, add these three entries (installed versions confirmed via `npm ls`):
```json
"express": "^5.2.1",
"luxon": "^3.7.2",
"uuid": "^14.0.0",
```

Add them in alphabetical order within the dependencies block.

- [ ] **Step 2: Remove `supertest` and `@types/supertest` from ignoreDependencies in `backend/knip.json`**

Current:
```json
"ignoreDependencies": ["ts-loader", "supertest", "@types/supertest"],
```

Replace with:
```json
"ignoreDependencies": ["ts-loader"],
```

- [ ] **Step 3: Verify backend build still passes**

```bash
cd backend && npm run build 2>&1 | tail -20
```

Expected: no errors (no install needed — packages already present transitively)

- [ ] **Step 4: Commit**

```bash
git add backend/package.json backend/knip.json
git commit -m "chore: add unlisted backend deps and clean up knip config (issue #538)"
```

---

## Task 8: Final verification and PR

- [ ] **Step 1: Run full frontend type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 2: Run full backend build**

```bash
cd backend && npm run build 2>&1 | tail -20
```

Expected: no errors

- [ ] **Step 3: Run backend lint**

```bash
cd backend && npm run lint 2>&1 | tail -20
```

Expected: no errors

- [ ] **Step 4: Create PR closing issue #538**

```bash
gh pr create \
  --title "chore: remove unused code and dependencies (Knip cleanup #538)" \
  --body "$(cat <<'EOF'
## Summary

- Deletes 6 unused files (3 frontend, 3 backend) with zero references
- Removes 5 unused/duplicate exports across frontend and backend
- Removes 2 redundant `export default` statements from page components (where safe)
- Adds `express`, `luxon`, `uuid` as explicit backend dependencies (were used but unlisted)
- Cleans up `ignoreDependencies` entries in both `frontend/knip.json` and `backend/knip.json`

## Test plan

- [ ] `cd frontend && npm run type-check` passes
- [ ] `cd backend && npm run build` passes
- [ ] `cd backend && npm run lint` passes
- [ ] Affected test files pass (JournalEntriesPage tests, search module tests)

Closes #538

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
