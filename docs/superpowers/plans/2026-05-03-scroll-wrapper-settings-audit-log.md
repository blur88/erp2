# Scroll Wrapper for Settings & Audit Log Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap all 13 settings and audit-log pages in `GenericOverviewPage` to provide a scrollable flex container, matching the `DashboardPage` pattern (issue #512).

**Architecture:** Each page currently returns a root React fragment `<>` or a plain `<Box>`. Replace the root with `<GenericOverviewPage>` which provides `display: flex, flexDirection: column, flex: 1, minHeight: 0, overflow: auto`. `AuditLogsPage` has a horizontal flex layout — its outer Box is replaced; the inner sidebar + content row becomes a direct child.

**Tech Stack:** React 19, MUI v7, TypeScript. No backend changes.

---

## Files Modified

- `frontend/src/pages/settings/CompanySettingsPage.tsx`
- `frontend/src/pages/settings/InventoryCostingPage.tsx`
- `frontend/src/pages/settings/StockLevelSettingsPage.tsx`
- `frontend/src/pages/settings/RegionalSettingsPage.tsx`
- `frontend/src/pages/settings/PriceListsPage.tsx`
- `frontend/src/pages/settings/PaymentMethodsPage.tsx`
- `frontend/src/pages/settings/PrintSettingsPage.tsx`
- `frontend/src/pages/settings/DocumentNumbersPage.tsx`
- `frontend/src/pages/settings/UserManagementPage.tsx`
- `frontend/src/pages/settings/RoleManagementPage.tsx`
- `frontend/src/pages/settings/SecuritySettingsPage.tsx`
- `frontend/src/pages/settings/BackupManagement.tsx`
- `frontend/src/pages/audit-logs/AuditLogsPage.tsx`

---

### Task 1: Wrap CompanySettingsPage

**Files:**
- Modify: `frontend/src/pages/settings/CompanySettingsPage.tsx`

- [ ] **Step 1: Add import**

  Open `frontend/src/pages/settings/CompanySettingsPage.tsx`. Add after the existing MUI imports:

  ```tsx
  import GenericOverviewPage from '@/components/common/GenericOverviewPage'
  ```

- [ ] **Step 2: Replace root fragment**

  The `return` at line ~195 currently opens with `<>`. Replace:

  ```tsx
  return (
    <>
  ```

  with:

  ```tsx
  return (
    <GenericOverviewPage>
  ```

  And the closing `</>` with `</GenericOverviewPage>`.

- [ ] **Step 3: TypeScript check**

  ```bash
  cd frontend && npm run type-check 2>&1 | grep -i "CompanySettings"
  ```

  Expected: no errors for this file.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/pages/settings/CompanySettingsPage.tsx
  git commit -m "feat(settings): wrap CompanySettingsPage in GenericOverviewPage"
  ```

---

### Task 2: Wrap InventoryCostingPage

**Files:**
- Modify: `frontend/src/pages/settings/InventoryCostingPage.tsx`

- [ ] **Step 1: Add import**

  Add after existing imports:

  ```tsx
  import GenericOverviewPage from '@/components/common/GenericOverviewPage'
  ```

- [ ] **Step 2: Replace root fragment**

  The `return` at line ~141 opens with `<>`. Replace:

  ```tsx
  return (
    <>
  ```

  with:

  ```tsx
  return (
    <GenericOverviewPage>
  ```

  And the closing `</>` with `</GenericOverviewPage>`.

- [ ] **Step 3: TypeScript check**

  ```bash
  cd frontend && npm run type-check 2>&1 | grep -i "InventoryCosting"
  ```

  Expected: no errors for this file.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/pages/settings/InventoryCostingPage.tsx
  git commit -m "feat(settings): wrap InventoryCostingPage in GenericOverviewPage"
  ```

---

### Task 3: Wrap StockLevelSettingsPage

**Files:**
- Modify: `frontend/src/pages/settings/StockLevelSettingsPage.tsx`

- [ ] **Step 1: Add import**

  Add after existing imports:

  ```tsx
  import GenericOverviewPage from '@/components/common/GenericOverviewPage'
  ```

- [ ] **Step 2: Replace root fragment**

  The `return` at line ~88 opens with `<>`. Replace:

  ```tsx
  return (
    <>
  ```

  with:

  ```tsx
  return (
    <GenericOverviewPage>
  ```

  And the closing `</>` with `</GenericOverviewPage>`.

- [ ] **Step 3: Run existing test**

  ```bash
  cd frontend && npx vitest run src/pages/settings/__tests__/StockLevelSettingsPage.test.tsx
  ```

  Expected: all tests pass.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/pages/settings/StockLevelSettingsPage.tsx
  git commit -m "feat(settings): wrap StockLevelSettingsPage in GenericOverviewPage"
  ```

---

### Task 4: Wrap RegionalSettingsPage

**Files:**
- Modify: `frontend/src/pages/settings/RegionalSettingsPage.tsx`

- [ ] **Step 1: Add import**

  Add after existing imports:

  ```tsx
  import GenericOverviewPage from '@/components/common/GenericOverviewPage'
  ```

- [ ] **Step 2: Replace root fragment**

  The `return` at line ~221 opens with `<>`. Replace:

  ```tsx
  return (
    <>
  ```

  with:

  ```tsx
  return (
    <GenericOverviewPage>
  ```

  And the closing `</>` with `</GenericOverviewPage>`.

- [ ] **Step 3: TypeScript check**

  ```bash
  cd frontend && npm run type-check 2>&1 | grep -i "RegionalSettings"
  ```

  Expected: no errors for this file.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/pages/settings/RegionalSettingsPage.tsx
  git commit -m "feat(settings): wrap RegionalSettingsPage in GenericOverviewPage"
  ```

---

### Task 5: Wrap PriceListsPage

**Files:**
- Modify: `frontend/src/pages/settings/PriceListsPage.tsx`

- [ ] **Step 1: Add import**

  Add after existing imports:

  ```tsx
  import GenericOverviewPage from '@/components/common/GenericOverviewPage'
  ```

- [ ] **Step 2: Replace root fragment**

  The `return` at line ~231 opens with `<>`. Replace:

  ```tsx
  return (
    <>
  ```

  with:

  ```tsx
  return (
    <GenericOverviewPage>
  ```

  And the closing `</>` with `</GenericOverviewPage>`.

- [ ] **Step 3: TypeScript check**

  ```bash
  cd frontend && npm run type-check 2>&1 | grep -i "PriceLists"
  ```

  Expected: no errors for this file.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/pages/settings/PriceListsPage.tsx
  git commit -m "feat(settings): wrap PriceListsPage in GenericOverviewPage"
  ```

---

### Task 6: Wrap PaymentMethodsPage

**Files:**
- Modify: `frontend/src/pages/settings/PaymentMethodsPage.tsx`

- [ ] **Step 1: Add import**

  Add after existing imports:

  ```tsx
  import GenericOverviewPage from '@/components/common/GenericOverviewPage'
  ```

- [ ] **Step 2: Replace root fragment**

  The `return` at line ~90 opens with `<>`. Replace:

  ```tsx
  return (
    <>
  ```

  with:

  ```tsx
  return (
    <GenericOverviewPage>
  ```

  And the closing `</>` with `</GenericOverviewPage>`.

- [ ] **Step 3: Run existing test**

  ```bash
  cd frontend && npx vitest run src/pages/settings/__tests__/PaymentMethodsPage.test.tsx
  ```

  Expected: all tests pass.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/pages/settings/PaymentMethodsPage.tsx
  git commit -m "feat(settings): wrap PaymentMethodsPage in GenericOverviewPage"
  ```

---

### Task 7: Wrap PrintSettingsPage

**Files:**
- Modify: `frontend/src/pages/settings/PrintSettingsPage.tsx`

- [ ] **Step 1: Add import**

  Add after existing imports:

  ```tsx
  import GenericOverviewPage from '@/components/common/GenericOverviewPage'
  ```

- [ ] **Step 2: Replace root fragment**

  The main component `return` at line ~83 opens with `<>`. Replace:

  ```tsx
  return (
    <>
  ```

  with:

  ```tsx
  return (
    <GenericOverviewPage>
  ```

  And the closing `</>` with `</GenericOverviewPage>`.

  Note: There is also an inner loading-state `return` at line ~76 that also returns `<>` — that one should also be wrapped:

  ```tsx
  return (
    <GenericOverviewPage>
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    </GenericOverviewPage>
  )
  ```

- [ ] **Step 3: TypeScript check**

  ```bash
  cd frontend && npm run type-check 2>&1 | grep -i "PrintSettings"
  ```

  Expected: no errors for this file.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/pages/settings/PrintSettingsPage.tsx
  git commit -m "feat(settings): wrap PrintSettingsPage in GenericOverviewPage"
  ```

---

### Task 8: Wrap DocumentNumbersPage

**Files:**
- Modify: `frontend/src/pages/settings/DocumentNumbersPage.tsx`

- [ ] **Step 1: Add import**

  Add after existing imports:

  ```tsx
  import GenericOverviewPage from '@/components/common/GenericOverviewPage'
  ```

- [ ] **Step 2: Replace root fragment**

  The `return` at line ~110 opens with `<>`. Replace:

  ```tsx
  return (
    <>
  ```

  with:

  ```tsx
  return (
    <GenericOverviewPage>
  ```

  And the closing `</>` with `</GenericOverviewPage>`.

- [ ] **Step 3: TypeScript check**

  ```bash
  cd frontend && npm run type-check 2>&1 | grep -i "DocumentNumbers"
  ```

  Expected: no errors for this file.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/pages/settings/DocumentNumbersPage.tsx
  git commit -m "feat(settings): wrap DocumentNumbersPage in GenericOverviewPage"
  ```

---

### Task 9: Wrap UserManagementPage

**Files:**
- Modify: `frontend/src/pages/settings/UserManagementPage.tsx`

- [ ] **Step 1: Add import**

  Add after existing imports:

  ```tsx
  import GenericOverviewPage from '@/components/common/GenericOverviewPage'
  ```

- [ ] **Step 2: Replace root fragment**

  The `return` at line ~261 opens with `<>`. Replace:

  ```tsx
  return (
    <>
  ```

  with:

  ```tsx
  return (
    <GenericOverviewPage>
  ```

  And the closing `</>` with `</GenericOverviewPage>`.

- [ ] **Step 3: Run existing test**

  ```bash
  cd frontend && npx vitest run src/pages/settings/__tests__/UserManagementPage.filterbar.test.tsx
  ```

  Expected: all tests pass.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/pages/settings/UserManagementPage.tsx
  git commit -m "feat(settings): wrap UserManagementPage in GenericOverviewPage"
  ```

---

### Task 10: Wrap RoleManagementPage

**Files:**
- Modify: `frontend/src/pages/settings/RoleManagementPage.tsx`

- [ ] **Step 1: Add import**

  Add after existing imports:

  ```tsx
  import GenericOverviewPage from '@/components/common/GenericOverviewPage'
  ```

- [ ] **Step 2: Replace root fragment**

  The `return` at line ~94 opens with `<>`. Replace:

  ```tsx
  return (
    <>
  ```

  with:

  ```tsx
  return (
    <GenericOverviewPage>
  ```

  And the closing `</>` with `</GenericOverviewPage>`.

- [ ] **Step 3: TypeScript check**

  ```bash
  cd frontend && npm run type-check 2>&1 | grep -i "RoleManagement"
  ```

  Expected: no errors for this file.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/pages/settings/RoleManagementPage.tsx
  git commit -m "feat(settings): wrap RoleManagementPage in GenericOverviewPage"
  ```

---

### Task 11: Wrap SecuritySettingsPage

**Files:**
- Modify: `frontend/src/pages/settings/SecuritySettingsPage.tsx`

- [ ] **Step 1: Add import**

  Add after existing imports:

  ```tsx
  import GenericOverviewPage from '@/components/common/GenericOverviewPage'
  ```

- [ ] **Step 2: Replace root fragment**

  The `return` at line ~11 opens with `<>`. Replace:

  ```tsx
  return (
    <>
  ```

  with:

  ```tsx
  return (
    <GenericOverviewPage>
  ```

  And the closing `</>` with `</GenericOverviewPage>`.

- [ ] **Step 3: TypeScript check**

  ```bash
  cd frontend && npm run type-check 2>&1 | grep -i "SecuritySettings"
  ```

  Expected: no errors for this file.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/pages/settings/SecuritySettingsPage.tsx
  git commit -m "feat(settings): wrap SecuritySettingsPage in GenericOverviewPage"
  ```

---

### Task 12: Wrap BackupManagement

**Files:**
- Modify: `frontend/src/pages/settings/BackupManagement.tsx`

- [ ] **Step 1: Add import**

  Add after existing imports:

  ```tsx
  import GenericOverviewPage from '@/components/common/GenericOverviewPage'
  ```

- [ ] **Step 2: Replace root fragment**

  The main component `return` at line ~83 opens with `<>`. Replace:

  ```tsx
  return (
    <>
  ```

  with:

  ```tsx
  return (
    <GenericOverviewPage>
  ```

  And the closing `</>` with `</GenericOverviewPage>`.

- [ ] **Step 3: TypeScript check**

  ```bash
  cd frontend && npm run type-check 2>&1 | grep -i "BackupManagement"
  ```

  Expected: no errors for this file.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/pages/settings/BackupManagement.tsx
  git commit -m "feat(settings): wrap BackupManagement in GenericOverviewPage"
  ```

---

### Task 13: Wrap AuditLogsPage

**Files:**
- Modify: `frontend/src/pages/audit-logs/AuditLogsPage.tsx`

This page is different: it has a horizontal sidebar + content layout inside an outer Box. Replace the outer Box with `GenericOverviewPage`.

- [ ] **Step 1: Add import**

  Add after existing imports:

  ```tsx
  import GenericOverviewPage from '@/components/common/GenericOverviewPage'
  ```

- [ ] **Step 2: Replace outer Box**

  The `return` currently opens with:

  ```tsx
  return (
    <Box sx={{ display: 'flex', height: '100%', gap: 2 }}>
  ```

  Replace with:

  ```tsx
  return (
    <GenericOverviewPage>
      <Box sx={{ display: 'flex', gap: 2 }}>
  ```

  And add a closing `</Box>` before `</GenericOverviewPage>` at the end, so the structure becomes:

  ```tsx
  return (
    <GenericOverviewPage>
      <Box sx={{ display: 'flex', gap: 2 }}>
        {/* Sidebar */}
        <Box sx={{ flexShrink: 0, width: sidebarCollapsed ? 48 : 260, transition: 'width 0.2s' }}>
          <FilterSidebar entityTypes={entityTypes} onApply={handleApply} />
        </Box>

        {/* Main content */}
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* ... all existing content unchanged ... */}
        </Box>
      </Box>
    </GenericOverviewPage>
  )
  ```

  Note: `height: '100%'` is intentionally dropped. `GenericOverviewPage` handles height via `flex: 1, minHeight: 0`.

- [ ] **Step 3: TypeScript check**

  ```bash
  cd frontend && npm run type-check 2>&1 | grep -i "AuditLogs"
  ```

  Expected: no errors for this file.

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/pages/audit-logs/AuditLogsPage.tsx
  git commit -m "feat(audit-logs): wrap AuditLogsPage in GenericOverviewPage"
  ```

---

### Task 14: Final type-check and PR

- [ ] **Step 1: Full TypeScript check**

  ```bash
  cd frontend && npm run type-check
  ```

  Expected: zero errors.

- [ ] **Step 2: Open PR**

  ```bash
  gh pr create \
    --title "feat(settings): wrap settings and audit-log pages in GenericOverviewPage" \
    --body "$(cat <<'EOF'
  ## Summary

  - Wraps all 13 settings and audit-log pages in `GenericOverviewPage` to provide a scrollable flex container
  - Matches the existing `DashboardPage` scroll pattern
  - `AuditLogsPage` keeps its sidebar + content horizontal layout as a child of the scroll wrapper

  Closes #512

  ## Test plan
  - [ ] Visit each settings page and confirm it scrolls correctly on a short viewport
  - [ ] Visit Audit Logs and confirm sidebar + content scroll together
  - [ ] TypeScript check passes with zero errors
  EOF
  )"
  ```
