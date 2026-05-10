# COA Chip to Plain Colored Text Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three MUI `Chip` components in the Chart of Accounts views with plain colored text, matching the existing Customers page pattern.

**Architecture:** Two component files are modified — `ChartOfAccountContextHeader.tsx` (two Chips: Account Type and Status) and `ChartOfAccountWorkspaceCard.tsx` (one Chip: Account Type in the Sub-Accounts table). The existing `ACCOUNT_TYPE_COLORS` map (values: `'success' | 'error' | 'primary' | 'info' | 'warning'`) is reused as MUI theme color strings by appending `.main`.

**Tech Stack:** React 19, Material UI v7, Vitest, Testing Library

---

## File Map

- **Modify:** `frontend/src/pages/accounting/components/ChartOfAccountContextHeader.tsx`
- **Modify:** `frontend/src/pages/accounting/components/ChartOfAccountWorkspaceCard.tsx`
- **Modify:** `frontend/src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx` (update assertions if they query by Chip role/class)

---

### Task 1: Update `ChartOfAccountContextHeader.tsx`

**Files:**
- Modify: `frontend/src/pages/accounting/components/ChartOfAccountContextHeader.tsx`

- [ ] **Step 1: Replace Account Type Chip with plain colored text**

In `ChartOfAccountContextHeader.tsx`, replace the Account Type `TableCell` block (lines 110–118):

```tsx
// BEFORE
<TableCell sx={valueCellSx}>
  <Chip
    size="small"
    label={selected.type.charAt(0) + selected.type.slice(1).toLowerCase()}
    color={ACCOUNT_TYPE_COLORS[selected.type]}
    variant="outlined"
  />
</TableCell>

// AFTER
<TableCell sx={{ ...valueCellSx, color: `${ACCOUNT_TYPE_COLORS[selected.type]}.main` }}>
  {selected.type.charAt(0) + selected.type.slice(1).toLowerCase()}
</TableCell>
```

- [ ] **Step 2: Replace Status Chip with plain colored text**

Replace the Status `TableCell` block (lines 152–159):

```tsx
// BEFORE
<TableCell sx={valueCellSx}>
  <Chip
    size="small"
    label={selected.isActive ? 'Active' : 'Inactive'}
    color={selected.isActive ? 'success' : 'default'}
    variant="outlined"
  />
</TableCell>

// AFTER
<TableCell sx={{ ...valueCellSx, color: selected.isActive ? 'success.main' : 'text.disabled' }}>
  {selected.isActive ? 'Active' : 'Inactive'}
</TableCell>
```

- [ ] **Step 3: Remove unused `Chip` import**

Remove `Chip` from the MUI import list at the top of the file. The import block should become:

```tsx
import {
  Box,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material'
```

- [ ] **Step 4: Run the test to verify no regressions**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/accounting/components/ChartOfAccountContextHeader.tsx
git commit -m "feat(accounting): replace Chip with plain text in COA context header"
```

---

### Task 2: Update `ChartOfAccountWorkspaceCard.tsx`

**Files:**
- Modify: `frontend/src/pages/accounting/components/ChartOfAccountWorkspaceCard.tsx`

- [ ] **Step 1: Replace Account Type Chip in Sub-Accounts table**

In `ChartOfAccountWorkspaceCard.tsx`, replace the Type `TableCell` block (lines 72–79):

```tsx
// BEFORE
<TableCell sx={{ ...tdSx }}>
  <Chip
    size="small"
    label={child.type.charAt(0) + child.type.slice(1).toLowerCase()}
    color={ACCOUNT_TYPE_COLORS[child.type]}
    variant="outlined"
  />
</TableCell>

// AFTER
<TableCell sx={{ ...tdSx, color: `${ACCOUNT_TYPE_COLORS[child.type]}.main` }}>
  {child.type.charAt(0) + child.type.slice(1).toLowerCase()}
</TableCell>
```

- [ ] **Step 2: Remove unused `Chip` import**

Remove `Chip` from the MUI import list at the top of the file. The import block should become:

```tsx
import {
  Box,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
```

- [ ] **Step 3: Run the test**

```bash
cd frontend && npx vitest run src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx
```

Expected: all tests pass.

- [ ] **Step 4: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/accounting/components/ChartOfAccountWorkspaceCard.tsx
git commit -m "feat(accounting): replace Chip with plain text in COA workspace sub-accounts table"
```

---

### Task 3: Close issue

- [ ] **Step 1: Open the PR and reference the issue**

```bash
gh pr create --title "feat(accounting): convert COA chips to plain colored text" --body "$(cat <<'EOF'
## Summary
- Replace `Chip` for Account Type and Status in `ChartOfAccountContextHeader.tsx` with plain colored text
- Replace `Chip` for Account Type in `ChartOfAccountWorkspaceCard.tsx` Sub-Accounts table with plain colored text
- Removes unused `Chip` imports from both components

Closes #534

## Test plan
- [ ] Navigate to Accounting > Chart of Accounts, select an account — verify Account Type and Status are plain colored text (not chips)
- [ ] Select a parent account with sub-accounts — verify the Type column in the Sub-Accounts table is plain colored text
- [ ] Verify colors: Active = green (`success.main`), Inactive = grey (`text.disabled`), Asset = green, Liability = red, Equity = blue, Revenue = light blue, Expense = orange
- [ ] All existing `ChartOfAccountsPage` tests pass

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
