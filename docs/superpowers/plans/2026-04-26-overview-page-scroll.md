# Overview Page Independent Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix clipped content on 5 overview/dashboard pages by introducing a `GenericOverviewPage` scroll-container component.

**Architecture:** Create a single thin wrapper component (`GenericOverviewPage`) that applies flex scroll container styles, then replace the root `<>...</>` fragment in each of the 5 affected pages with `<GenericOverviewPage>`. No changes to `MainLayout` or any page logic.

**Tech Stack:** React 19, Material-UI v7 (`Box`), TypeScript

---

## File Map

| Action | File |
|--------|------|
| Create | `frontend/src/components/common/GenericOverviewPage.tsx` |
| Modify | `frontend/src/pages/dashboard/DashboardPage.tsx` |
| Modify | `frontend/src/pages/sales/SalesPage.tsx` |
| Modify | `frontend/src/pages/purchasing/PurchasingPage.tsx` |
| Modify | `frontend/src/pages/inventory/InventoryPage.tsx` |
| Modify | `frontend/src/pages/accounting/AccountingDashboardPage.tsx` |

---

### Task 1: Create GenericOverviewPage component

**Files:**
- Create: `frontend/src/components/common/GenericOverviewPage.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { Box } from '@mui/material'
import type { ReactNode } from 'react'

interface GenericOverviewPageProps {
  children: ReactNode
}

export default function GenericOverviewPage({ children }: GenericOverviewPageProps) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'auto' }}>
      {children}
    </Box>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npm run type-check 2>&1 | tail -5
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/components/common/GenericOverviewPage.tsx
git commit -m "feat(layout): add GenericOverviewPage scroll container (issue #446)"
```

---

### Task 2: Wrap DashboardPage

**Files:**
- Modify: `frontend/src/pages/dashboard/DashboardPage.tsx`

- [ ] **Step 1: Add import and wrap root fragment**

At the top of the file, add the import after the existing `PageHeader` import:

```tsx
import GenericOverviewPage from '@/components/common/GenericOverviewPage'
```

In the loading branch (around line 364), replace:
```tsx
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <CircularProgress size={60} />
      </Box>
    )
```
with:
```tsx
    return (
      <GenericOverviewPage>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
          <CircularProgress size={60} />
        </Box>
      </GenericOverviewPage>
    )
```

In the main return (around line 372), replace the root fragment:
```tsx
  return (
    <>
      <PageHeader
```
with:
```tsx
  return (
    <GenericOverviewPage>
      <PageHeader
```

And replace the closing `</>` at the end of the component with `</GenericOverviewPage>`.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npm run type-check 2>&1 | tail -5
```

Expected: no errors

- [ ] **Step 3: Run existing DashboardPage tests**

```bash
cd frontend && npx vitest run src/pages/dashboard 2>&1 | tail -20
```

Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/dashboard/DashboardPage.tsx
git commit -m "feat(dashboard): wrap with GenericOverviewPage for scroll (issue #446)"
```

---

### Task 3: Wrap SalesPage

**Files:**
- Modify: `frontend/src/pages/sales/SalesPage.tsx`

- [ ] **Step 1: Add import and wrap root fragment**

Add import after the existing `PageHeader` import line:

```tsx
import GenericOverviewPage from '@/components/common/GenericOverviewPage'
```

In the main return (around line 175), replace:
```tsx
  return (
    <>
      <PageHeader
```
with:
```tsx
  return (
    <GenericOverviewPage>
      <PageHeader
```

Replace the closing `</>` at the end with `</GenericOverviewPage>`.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npm run type-check 2>&1 | tail -5
```

Expected: no errors

- [ ] **Step 3: Run existing SalesPage tests**

```bash
cd frontend && npx vitest run src/pages/sales 2>&1 | tail -20
```

Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/sales/SalesPage.tsx
git commit -m "feat(sales): wrap SalesPage with GenericOverviewPage for scroll (issue #446)"
```

---

### Task 4: Wrap PurchasingPage

**Files:**
- Modify: `frontend/src/pages/purchasing/PurchasingPage.tsx`

- [ ] **Step 1: Add import and wrap root fragment**

Add import after the existing `PageHeader` import line:

```tsx
import GenericOverviewPage from '@/components/common/GenericOverviewPage'
```

Find the main `return (` in the component (around line 208) and replace:
```tsx
  return (
    <>
      <PageHeader
```
with:
```tsx
  return (
    <GenericOverviewPage>
      <PageHeader
```

Replace the closing `</>` at the end of the return with `</GenericOverviewPage>`.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npm run type-check 2>&1 | tail -5
```

Expected: no errors

- [ ] **Step 3: Run existing PurchasingPage tests**

```bash
cd frontend && npx vitest run src/pages/purchasing 2>&1 | tail -20
```

Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/purchasing/PurchasingPage.tsx
git commit -m "feat(purchasing): wrap PurchasingPage with GenericOverviewPage for scroll (issue #446)"
```

---

### Task 5: Wrap InventoryPage

**Files:**
- Modify: `frontend/src/pages/inventory/InventoryPage.tsx`

- [ ] **Step 1: Add import and wrap root fragment**

Add import after the existing `PageHeader` import line:

```tsx
import GenericOverviewPage from '@/components/common/GenericOverviewPage'
```

Find the main `return (` in the component (around line 242) and replace:
```tsx
  return (
    <>
      <PageHeader
```
with:
```tsx
  return (
    <GenericOverviewPage>
      <PageHeader
```

Replace the closing `</>` at the end of the return with `</GenericOverviewPage>`.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npm run type-check 2>&1 | tail -5
```

Expected: no errors

- [ ] **Step 3: Run existing InventoryPage tests**

```bash
cd frontend && npx vitest run src/pages/inventory 2>&1 | tail -20
```

Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/inventory/InventoryPage.tsx
git commit -m "feat(inventory): wrap InventoryPage with GenericOverviewPage for scroll (issue #446)"
```

---

### Task 6: Wrap AccountingDashboardPage

**Files:**
- Modify: `frontend/src/pages/accounting/AccountingDashboardPage.tsx`

- [ ] **Step 1: Add import and wrap root fragment**

Add import after the existing `PageHeader` import line:

```tsx
import GenericOverviewPage from '@/components/common/GenericOverviewPage'
```

In the main return (around line 234), replace:
```tsx
  return (
    <>
      <PageHeader
```
with:
```tsx
  return (
    <GenericOverviewPage>
      <PageHeader
```

Replace the closing `</>` at the end with `</GenericOverviewPage>`.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npm run type-check 2>&1 | tail -5
```

Expected: no errors

- [ ] **Step 3: Run existing AccountingDashboardPage tests**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/AccountingDashboardPage 2>&1 | tail -20
```

Expected: all tests pass

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/accounting/AccountingDashboardPage.tsx
git commit -m "feat(accounting): wrap AccountingDashboardPage with GenericOverviewPage for scroll (issue #446)"
```

---

### Task 7: Open PR

- [ ] **Step 1: Push branch and open PR**

```bash
git push origin main
gh pr create \
  --title "feat: add independent scroll to overview/dashboard pages" \
  --body "$(cat <<'EOF'
## Summary

- Adds `GenericOverviewPage` thin scroll-container component
- Wraps all 5 overview/dashboard pages so content scrolls independently within the fixed layout
- No changes to `MainLayout` or any page logic

Closes #446

## Test plan
- [ ] Verify each affected page scrolls on a small viewport (< 768px height)
- [ ] Verify `TopBar` and sidebar remain fixed while page content scrolls
- [ ] Verify no double scrollbars appear
- [ ] All existing frontend tests pass

🤖 Generated with [Claude Code](https://claude.ai/claude-code)
EOF
)"
```

Expected: PR URL printed to console
