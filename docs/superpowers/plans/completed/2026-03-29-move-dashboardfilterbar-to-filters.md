# Move DashboardFilterBar to filters folder — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `DashboardFilterBar.tsx` and its test into `components/filters/` to co-locate it with the generic filter system, updating all import paths.

**Architecture:** Pure file move — no logic changes. Copy files to new locations, update all import references, delete old files, verify tests pass.

**Tech Stack:** React 19, TypeScript, Vitest

---

## File Map

| Action | Path |
|--------|------|
| Create | `src/components/filters/DashboardFilterBar.tsx` |
| Create | `src/components/filters/__tests__/DashboardFilterBar.test.tsx` |
| Modify | `src/pages/sales/SalesPage.tsx` (import path only) |
| Modify | `src/pages/purchasing/PurchasingPage.tsx` (import path only) |
| Modify | `src/pages/inventory/InventoryPage.tsx` (import path only) |
| Delete | `src/components/dashboard/DashboardFilterBar.tsx` |
| Delete | `src/components/dashboard/DashboardFilterBar.test.tsx` |

---

### Task 1: Move the component file

**Files:**
- Create: `src/components/filters/DashboardFilterBar.tsx`
- Delete: `src/components/dashboard/DashboardFilterBar.tsx`

- [ ] **Step 1: Copy the file to its new location**

```bash
cp frontend/src/components/dashboard/DashboardFilterBar.tsx \
   frontend/src/components/filters/DashboardFilterBar.tsx
```

- [ ] **Step 2: Verify the file exists at the new path**

```bash
ls frontend/src/components/filters/DashboardFilterBar.tsx
```

Expected output: `frontend/src/components/filters/DashboardFilterBar.tsx`

- [ ] **Step 3: Delete the old file**

```bash
rm frontend/src/components/dashboard/DashboardFilterBar.tsx
```

- [ ] **Step 4: Verify the old path is gone**

```bash
ls frontend/src/components/dashboard/
```

Expected output: `DashboardFilterBar.test.tsx` (only the test file remains)

---

### Task 2: Move the test file

**Files:**
- Create: `src/components/filters/__tests__/DashboardFilterBar.test.tsx`
- Modify: `src/components/filters/__tests__/DashboardFilterBar.test.tsx` (fix relative import)
- Delete: `src/components/dashboard/DashboardFilterBar.test.tsx`

- [ ] **Step 1: Copy the test file to its new location**

```bash
cp frontend/src/components/dashboard/DashboardFilterBar.test.tsx \
   frontend/src/components/filters/__tests__/DashboardFilterBar.test.tsx
```

- [ ] **Step 2: Fix the relative import in the new test file**

The old test (in `dashboard/`) imported: `import { DashboardFilterBar } from './DashboardFilterBar'`

The new test (in `filters/__tests__/`) must import from one level up:

Open `frontend/src/components/filters/__tests__/DashboardFilterBar.test.tsx` and change line 8:

```ts
// Before
import { DashboardFilterBar } from './DashboardFilterBar'

// After
import { DashboardFilterBar } from '../DashboardFilterBar'
```

- [ ] **Step 3: Run the moved test to verify it passes**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/DashboardFilterBar.test.tsx
```

Expected: all tests pass (same count as before the move)

- [ ] **Step 4: Delete the old test file**

```bash
rm frontend/src/components/dashboard/DashboardFilterBar.test.tsx
```

- [ ] **Step 5: Verify the dashboard folder is now empty**

```bash
ls frontend/src/components/dashboard/
```

Expected: `ls: cannot access ... No such file or directory` or empty listing (directory should be gone or empty)

- [ ] **Step 6: Remove the empty dashboard directory if it still exists**

```bash
rmdir frontend/src/components/dashboard/ 2>/dev/null || true
```

---

### Task 3: Update consumer imports

**Files:**
- Modify: `src/pages/sales/SalesPage.tsx`
- Modify: `src/pages/purchasing/PurchasingPage.tsx`
- Modify: `src/pages/inventory/InventoryPage.tsx`

- [ ] **Step 1: Update SalesPage.tsx**

In `frontend/src/pages/sales/SalesPage.tsx`, change line 28:

```ts
// Before
import { DashboardFilterBar } from '@/components/dashboard/DashboardFilterBar'

// After
import { DashboardFilterBar } from '@/components/filters/DashboardFilterBar'
```

- [ ] **Step 2: Update PurchasingPage.tsx**

In `frontend/src/pages/purchasing/PurchasingPage.tsx`, change line 45:

```ts
// Before
import { DashboardFilterBar } from '@/components/dashboard/DashboardFilterBar'

// After
import { DashboardFilterBar } from '@/components/filters/DashboardFilterBar'
```

- [ ] **Step 3: Update InventoryPage.tsx**

In `frontend/src/pages/inventory/InventoryPage.tsx`, change line 44:

```ts
// Before
import { DashboardFilterBar } from '@/components/dashboard/DashboardFilterBar'

// After
import { DashboardFilterBar } from '@/components/filters/DashboardFilterBar'
```

- [ ] **Step 4: TypeScript check — verify no broken imports**

```bash
cd frontend && npm run type-check
```

Expected: no errors

---

### Task 4: Final verification and commit

- [ ] **Step 1: Confirm no remaining references to the old path**

```bash
grep -r "components/dashboard/DashboardFilterBar" frontend/src --include="*.ts" --include="*.tsx"
```

Expected: no output (zero matches)

- [ ] **Step 2: Run the full filter test suite**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/
```

Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add \
  frontend/src/components/filters/DashboardFilterBar.tsx \
  frontend/src/components/filters/__tests__/DashboardFilterBar.test.tsx \
  frontend/src/pages/sales/SalesPage.tsx \
  frontend/src/pages/purchasing/PurchasingPage.tsx \
  frontend/src/pages/inventory/InventoryPage.tsx
git rm \
  frontend/src/components/dashboard/DashboardFilterBar.tsx \
  frontend/src/components/dashboard/DashboardFilterBar.test.tsx 2>/dev/null || true
git commit -m "refactor: move DashboardFilterBar to filters folder (#212)"
```
