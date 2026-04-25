# Issue #439 — Inventory & Accounting Dashboard Scroll Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable page-level scrolling on `InventoryPage` and `AccountingDashboardPage` by opting them into the existing `LayoutScrollContext` mechanism.

**Architecture:** `MainLayout` already reads `LayoutScrollContext` and sets `overflow: auto` when the value is `true`. Pages opt in by calling `useLayoutScroll(true)` inside the component. `DashboardPage`, `SalesPage`, and `PurchasingPage` already use this pattern — this plan applies the same two-line change to the two missing pages.

**Tech Stack:** React 19, TypeScript, Vitest, `@testing-library/react`

---

## File Map

| Action | File |
|--------|------|
| Modify | `frontend/src/pages/inventory/InventoryPage.tsx` |
| Modify | `frontend/src/pages/inventory/__tests__/InventoryPage.filters.test.tsx` |
| Modify | `frontend/src/pages/accounting/AccountingDashboardPage.tsx` |
| Modify | `frontend/src/pages/accounting/__tests__/AccountingDashboardPage.test.tsx` |

---

### Task 1: Enable scroll on InventoryPage

**Files:**
- Modify: `frontend/src/pages/inventory/InventoryPage.tsx`
- Modify: `frontend/src/pages/inventory/__tests__/InventoryPage.filters.test.tsx`

- [ ] **Step 1: Add the failing scroll assertion to the test**

Open `frontend/src/pages/inventory/__tests__/InventoryPage.filters.test.tsx`.

After the existing imports block (line 6, after `import InventoryPage from '../InventoryPage'`), add:

```ts
import { useLayoutScroll } from '@/contexts/LayoutScrollContext'
```

After the existing `vi.mock` blocks, add:

```ts
vi.mock('@/contexts/LayoutScrollContext', () => ({
  useLayoutScroll: vi.fn(),
}))
```

Then, inside the existing `describe('InventoryPage filters', ...)` block, add a new `it` block. Place it after the existing `beforeEach` and before (or after) other `it` blocks:

```ts
it('enables layout scroll', () => {
  render(
    <MemoryRouter initialEntries={['/']}>
      <InventoryPage />
    </MemoryRouter>,
  )
  expect(useLayoutScroll).toHaveBeenCalledWith(true)
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && npx vitest run src/pages/inventory/__tests__/InventoryPage.filters.test.tsx --reporter=verbose 2>&1 | tail -30
```

Expected: FAIL — `useLayoutScroll` was not called (it is not yet imported or called in `InventoryPage.tsx`).

- [ ] **Step 3: Add the import to InventoryPage**

Open `frontend/src/pages/inventory/InventoryPage.tsx`. After the last `import` line (line 49, `import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'`), add:

```ts
import { useLayoutScroll } from '@/contexts/LayoutScrollContext'
```

- [ ] **Step 4: Call the hook inside the component**

In `frontend/src/pages/inventory/InventoryPage.tsx`, find the `InventoryPage` component body (line 71: `const InventoryPage: React.FC = () => {`). Add the hook call as the first line inside the component, after the opening brace:

```ts
const InventoryPage: React.FC = () => {
  useLayoutScroll(true)
  const theme = useTheme()
  // ... rest unchanged
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd frontend && npx vitest run src/pages/inventory/__tests__/InventoryPage.filters.test.tsx --reporter=verbose 2>&1 | tail -20
```

Expected: PASS — all tests green.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/inventory/InventoryPage.tsx \
        frontend/src/pages/inventory/__tests__/InventoryPage.filters.test.tsx
git commit -m "fix: enable scroll on Inventory Overview page (closes #439 partially)"
```

---

### Task 2: Enable scroll on AccountingDashboardPage

**Files:**
- Modify: `frontend/src/pages/accounting/AccountingDashboardPage.tsx`
- Modify: `frontend/src/pages/accounting/__tests__/AccountingDashboardPage.test.tsx`

- [ ] **Step 1: Add the failing scroll assertion to the test**

Open `frontend/src/pages/accounting/__tests__/AccountingDashboardPage.test.tsx`.

After the existing imports block (after all existing `import` lines near the top), add:

```ts
import { useLayoutScroll } from '@/contexts/LayoutScrollContext'
```

After the existing `vi.mock` blocks, add:

```ts
vi.mock('@/contexts/LayoutScrollContext', () => ({
  useLayoutScroll: vi.fn(),
}))
```

Then add a new `describe` block at the bottom of the file (outside any existing `describe`):

```ts
describe('AccountingDashboardPage scroll', () => {
  it('enables layout scroll', () => {
    renderWithProviders()
    expect(useLayoutScroll).toHaveBeenCalledWith(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/AccountingDashboardPage.test.tsx --reporter=verbose 2>&1 | tail -30
```

Expected: FAIL — `useLayoutScroll` was not called.

- [ ] **Step 3: Add the import to AccountingDashboardPage**

Open `frontend/src/pages/accounting/AccountingDashboardPage.tsx`. After the last `import` line (line 41, `import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter';`), add:

```ts
import { useLayoutScroll } from '@/contexts/LayoutScrollContext'
```

- [ ] **Step 4: Call the hook inside the component**

In `frontend/src/pages/accounting/AccountingDashboardPage.tsx`, find the `AccountingDashboardPage` component body (line 160: `const AccountingDashboardPage: React.FC = () => {`). Add the hook call as the first line inside the component:

```ts
const AccountingDashboardPage: React.FC = () => {
  useLayoutScroll(true)
  const navigate = useNavigate();
  // ... rest unchanged
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/AccountingDashboardPage.test.tsx --reporter=verbose 2>&1 | tail -20
```

Expected: PASS — all tests green.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/accounting/AccountingDashboardPage.tsx \
        frontend/src/pages/accounting/__tests__/AccountingDashboardPage.test.tsx
git commit -m "fix: enable scroll on Accounting Dashboard page (closes #439)"
```

---

### Task 3: Open PR

- [ ] **Step 1: Push branch and open PR**

```bash
git push origin main
gh pr create \
  --title "fix: enable scroll on Inventory and Accounting Dashboard pages" \
  --body "$(cat <<'EOF'
## Summary

- Adds \`useLayoutScroll(true)\` to \`InventoryPage\` and \`AccountingDashboardPage\`
- Follows the identical pattern already used by Dashboard, Sales, and Purchasing overview pages
- Adds scroll assertion tests to both pages' test files

Closes #439

## Test plan
- [ ] Run \`npx vitest run src/pages/inventory/__tests__/InventoryPage.filters.test.tsx\` — all pass
- [ ] Run \`npx vitest run src/pages/accounting/__tests__/AccountingDashboardPage.test.tsx\` — all pass
- [ ] Navigate to \`/inventory\` — content scrolls
- [ ] Navigate to \`/accounting\` — content scrolls

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
