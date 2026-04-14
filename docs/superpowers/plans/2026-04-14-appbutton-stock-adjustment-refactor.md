# AppButton Stock Adjustment Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all raw MUI `Button` usages in the Stock Adjustment page and sub-components with the standardized `AppButton` component, and extend `AppButton` with `warning` and `success` variants.

**Architecture:** `AppButton` (`frontend/src/components/common/AppButton.tsx`) wraps MUI `Button` with a standardized variant API. We extend it with two new variants, then migrate three files that currently import MUI `Button` directly. No logic changes — pure component swap.

**Tech Stack:** React 19, MUI v7, TypeScript (strict: false), Vitest

**Closes:** #361

---

## File Map

| File | Change |
|---|---|
| `frontend/src/components/common/AppButton.tsx` | Add `warning` and `success` variants |
| `frontend/src/pages/inventory/components/StockAdjustmentContextHeader.tsx` | Replace `Button` → `AppButton` |
| `frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx` | Replace `Button` → `AppButton` |
| `frontend/src/components/inventory/DeletedStockAdjustmentsDialog.tsx` | Replace `Button` → `AppButton` |

---

## Task 1: Extend AppButton with `warning` and `success` variants

**Files:**
- Modify: `frontend/src/components/common/AppButton.tsx`

- [ ] **Step 1: Open the file and read the current variant type and switch block**

  `frontend/src/components/common/AppButton.tsx` — the relevant section is lines 8–68. The current variants are `'primary' | 'secondary' | 'outlined' | 'danger'`.

- [ ] **Step 2: Add `warning` and `success` to the variant type (line 8)**

  Change:
  ```ts
  type AppButtonVariant = 'primary' | 'secondary' | 'outlined' | 'danger'
  ```
  To:
  ```ts
  type AppButtonVariant = 'primary' | 'secondary' | 'outlined' | 'danger' | 'warning' | 'success'
  ```

- [ ] **Step 3: Add cases to the switch block (after the `danger` case, before `default`)**

  The switch block is inside the `else` branch (when `sortConfig == null`). Add after the `danger` case:
  ```ts
  case 'warning':
    muiVariant = 'contained'
    muiColor = 'warning'
    break
  case 'success':
    muiVariant = 'contained'
    muiColor = 'success'
    break
  ```

  The full switch after the change should read:
  ```ts
  switch (variant) {
    case 'primary':
      muiVariant = 'contained'
      muiColor = 'primary'
      break
    case 'danger':
      muiVariant = 'contained'
      muiColor = 'error'
      break
    case 'warning':
      muiVariant = 'contained'
      muiColor = 'warning'
      break
    case 'success':
      muiVariant = 'contained'
      muiColor = 'success'
      break
    case 'secondary':
    case 'outlined':
    default:
      muiVariant = 'outlined'
      muiColor = 'inherit'
      break
  }
  ```

- [ ] **Step 4: Run TypeScript check**

  ```bash
  cd frontend && npm run type-check
  ```
  Expected: no errors.

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/components/common/AppButton.tsx
  git commit -m "feat(ui): add warning and success variants to AppButton"
  ```

---

## Task 2: Migrate StockAdjustmentContextHeader

**Files:**
- Modify: `frontend/src/pages/inventory/components/StockAdjustmentContextHeader.tsx`

- [ ] **Step 1: Replace the MUI import**

  Current (lines 4–18):
  ```ts
  import {
    Box,
    Button,
    Chip,
    CircularProgress,
    IconButton,
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

  Change to (remove `Button`, add `AppButton` import after the MUI block):
  ```ts
  import {
    Box,
    Chip,
    CircularProgress,
    IconButton,
    Paper,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableRow,
    Typography,
  } from '@mui/material'
  import Grid from '@mui/material/Grid'

  import { AppButton } from '@/components/common/AppButton'
  ```

  > Note: `Grid` is already imported on line 19 — keep it where it is, just remove `Button` from the MUI destructure and add the `AppButton` import.

- [ ] **Step 2: Replace the "Complete" button (around line 229)**

  Current:
  ```tsx
  <Button
    variant="contained"
    size="small"
    color="primary"
    onClick={onComplete}
    sx={{ minWidth: 110 }}
  >
    Complete
  </Button>
  ```

  Replace with:
  ```tsx
  <AppButton
    variant="primary"
    size="small"
    onClick={onComplete}
    sx={{ minWidth: 110 }}
  >
    Complete
  </AppButton>
  ```

- [ ] **Step 3: Replace the "Revert to Draft" button (around line 240)**

  Current:
  ```tsx
  <Button
    variant="contained"
    size="small"
    color="warning"
    onClick={onRevert}
    sx={{ minWidth: 110 }}
  >
    Revert to Draft
  </Button>
  ```

  Replace with:
  ```tsx
  <AppButton
    variant="warning"
    size="small"
    onClick={onRevert}
    sx={{ minWidth: 110 }}
  >
    Revert to Draft
  </AppButton>
  ```

- [ ] **Step 4: Run TypeScript check**

  ```bash
  cd frontend && npm run type-check
  ```
  Expected: no errors.

- [ ] **Step 5: Run the panel tests**

  ```bash
  cd frontend && npx vitest run src/pages/inventory/components/StockAdjustmentPanels.test.tsx
  ```
  Expected: all tests pass.

- [ ] **Step 6: Commit**

  ```bash
  git add frontend/src/pages/inventory/components/StockAdjustmentContextHeader.tsx
  git commit -m "refactor(inventory): use AppButton in StockAdjustmentContextHeader (#361)"
  ```

---

## Task 3: Migrate CreateStockAdjustmentPage

**Files:**
- Modify: `frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx`

- [ ] **Step 1: Replace the MUI import**

  Current imports include `Button` in the MUI destructure (line 5). Remove it:
  ```ts
  import {
    Box,
    Grid,
    TextField,
    Typography,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    IconButton,
    Paper,
    Autocomplete,
    Alert,
    Card,
    CardContent,
    // ... rest of imports, no Button
  } from '@mui/material'
  ```

  Add `AppButton` import after the MUI block (near the other local imports):
  ```ts
  import { AppButton } from '@/components/common/AppButton'
  ```

- [ ] **Step 2: Replace the "Add Item" button (around line 346)**

  Current:
  ```tsx
  <Button
    startIcon={<AddIcon />}
    onClick={addItem}
    variant="outlined"
  >
    Add Item
  </Button>
  ```

  Replace with:
  ```tsx
  <AppButton
    variant="outlined"
    startIcon={<AddIcon />}
    onClick={addItem}
  >
    Add Item
  </AppButton>
  ```

- [ ] **Step 3: Replace the "Cancel" button (around line 596)**

  Current:
  ```tsx
  <Button
    variant="outlined"
    onClick={() => navigate('/inventory/stock-adjustments')}
    disabled={loading}
  >
    Cancel
  </Button>
  ```

  Replace with:
  ```tsx
  <AppButton
    variant="outlined"
    onClick={() => navigate('/inventory/stock-adjustments')}
    disabled={loading}
  >
    Cancel
  </AppButton>
  ```

- [ ] **Step 4: Replace the submit button (around line 603)**

  Current:
  ```tsx
  <Button
    type="submit"
    variant="contained"
    disabled={loading}
  >
    {loading ? (isEditMode ? 'Updating...' : 'Creating...') : (isEditMode ? 'Update Adjustment' : 'Create Adjustment')}
  </Button>
  ```

  Replace with (use `loading` prop — `AppButton` handles disabled state and shows a spinner):
  ```tsx
  <AppButton
    variant="primary"
    type="submit"
    loading={loading}
  >
    {isEditMode ? 'Update Adjustment' : 'Create Adjustment'}
  </AppButton>
  ```

  > The text no longer needs to change while loading because `AppButton` shows a `CircularProgress` spinner via `startIcon` when `loading={true}` and disables the button automatically.

- [ ] **Step 5: Run TypeScript check**

  ```bash
  cd frontend && npm run type-check
  ```
  Expected: no errors.

- [ ] **Step 6: Run the create page tests**

  ```bash
  cd frontend && npx vitest run src/pages/inventory/__tests__/CreateStockAdjustmentPage.test.tsx
  ```
  Expected: all tests pass.

- [ ] **Step 7: Commit**

  ```bash
  git add frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx
  git commit -m "refactor(inventory): use AppButton in CreateStockAdjustmentPage (#361)"
  ```

---

## Task 4: Migrate DeletedStockAdjustmentsDialog

**Files:**
- Modify: `frontend/src/components/inventory/DeletedStockAdjustmentsDialog.tsx`

There are 7 `Button` usages to replace:
1. "Restore Selected" toolbar button — `contained/success`
2. "Delete Selected" toolbar button — `contained/error`
3. "Close" dialog action — `outlined` (no color)
4. Bulk restore confirm "Cancel" — plain (no variant/color)
5. Bulk restore confirm "Restore" — `contained/success`
6. Bulk delete confirm "Cancel" — plain (no variant/color)
7. Bulk delete confirm "Permanently Delete" — `contained/error`

- [ ] **Step 1: Replace the MUI import**

  Remove `Button` from the MUI destructure (line 7). Add `AppButton` import after the MUI block:
  ```ts
  import { AppButton } from '@/components/common/AppButton'
  ```

- [ ] **Step 2: Replace "Restore Selected" button (around line 284)**

  Current:
  ```tsx
  <Button
    variant="contained"
    color="success"
    startIcon={<RestoreIcon />}
    onClick={() => setShowBulkRestoreConfirm(true)}
    disabled={bulkRestoring}
    sx={{ whiteSpace: 'nowrap' }}
  >
    Restore Selected ({selectedCount})
  </Button>
  ```

  Replace with:
  ```tsx
  <AppButton
    variant="success"
    startIcon={<RestoreIcon />}
    onClick={() => setShowBulkRestoreConfirm(true)}
    disabled={bulkRestoring}
    sx={{ whiteSpace: 'nowrap' }}
  >
    Restore Selected ({selectedCount})
  </AppButton>
  ```

- [ ] **Step 3: Replace "Delete Selected" button (around line 294)**

  Current:
  ```tsx
  <Button
    variant="contained"
    color="error"
    startIcon={<DeleteIcon />}
    onClick={() => setShowBulkDeleteConfirm(true)}
    disabled={bulkDeleting}
    sx={{ whiteSpace: 'nowrap' }}
  >
    Delete Selected ({selectedCount})
  </Button>
  ```

  Replace with:
  ```tsx
  <AppButton
    variant="danger"
    startIcon={<DeleteIcon />}
    onClick={() => setShowBulkDeleteConfirm(true)}
    disabled={bulkDeleting}
    sx={{ whiteSpace: 'nowrap' }}
  >
    Delete Selected ({selectedCount})
  </AppButton>
  ```

- [ ] **Step 4: Replace "Close" button (around line 557)**

  Current:
  ```tsx
  <Button onClick={onClose} variant="outlined">
    Close
  </Button>
  ```

  Replace with:
  ```tsx
  <AppButton variant="outlined" onClick={onClose}>
    Close
  </AppButton>
  ```

- [ ] **Step 5: Replace bulk restore confirm "Cancel" button (around line 571)**

  Current:
  ```tsx
  <Button onClick={() => setShowBulkRestoreConfirm(false)} disabled={bulkRestoring}>
    Cancel
  </Button>
  ```

  Replace with:
  ```tsx
  <AppButton variant="outlined" onClick={() => setShowBulkRestoreConfirm(false)} disabled={bulkRestoring}>
    Cancel
  </AppButton>
  ```

- [ ] **Step 6: Replace bulk restore confirm "Restore" button (around line 574)**

  Current:
  ```tsx
  <Button
    onClick={handleBulkRestore}
    variant="contained"
    color="success"
    disabled={bulkRestoring}
  >
    {bulkRestoring ? 'Restoring...' : 'Restore'}
  </Button>
  ```

  Replace with (use `loading` prop for the restoring state):
  ```tsx
  <AppButton
    variant="success"
    onClick={handleBulkRestore}
    loading={bulkRestoring}
  >
    Restore
  </AppButton>
  ```

- [ ] **Step 7: Replace bulk delete confirm "Cancel" button (around line 596)**

  Current:
  ```tsx
  <Button onClick={() => setShowBulkDeleteConfirm(false)} disabled={bulkDeleting}>
    Cancel
  </Button>
  ```

  Replace with:
  ```tsx
  <AppButton variant="outlined" onClick={() => setShowBulkDeleteConfirm(false)} disabled={bulkDeleting}>
    Cancel
  </AppButton>
  ```

- [ ] **Step 8: Replace "Permanently Delete" button (around line 599)**

  Current:
  ```tsx
  <Button
    onClick={handleBulkDelete}
    variant="contained"
    color="error"
    disabled={bulkDeleting}
  >
    {bulkDeleting ? 'Deleting...' : 'Permanently Delete'}
  </Button>
  ```

  Replace with (use `loading` prop):
  ```tsx
  <AppButton
    variant="danger"
    onClick={handleBulkDelete}
    loading={bulkDeleting}
  >
    Permanently Delete
  </AppButton>
  ```

- [ ] **Step 9: Run TypeScript check**

  ```bash
  cd frontend && npm run type-check
  ```
  Expected: no errors.

- [ ] **Step 10: Commit**

  ```bash
  git add frontend/src/components/inventory/DeletedStockAdjustmentsDialog.tsx
  git commit -m "refactor(inventory): use AppButton in DeletedStockAdjustmentsDialog (#361)"
  ```

---

## Task 5: Final verification

- [ ] **Step 1: Run all three targeted test files**

  ```bash
  cd frontend && npx vitest run src/pages/inventory/__tests__/StockAdjustmentsPage.filterbar.test.tsx src/pages/inventory/components/StockAdjustmentPanels.test.tsx src/pages/inventory/__tests__/CreateStockAdjustmentPage.test.tsx
  ```
  Expected: all tests pass.

- [ ] **Step 2: Verify no raw MUI Button imports remain in scope**

  ```bash
  grep -n "from '@mui/material'" \
    frontend/src/pages/inventory/StockAdjustmentsPage.tsx \
    frontend/src/pages/inventory/components/StockAdjustmentContextHeader.tsx \
    frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx \
    frontend/src/components/inventory/DeletedStockAdjustmentsDialog.tsx \
    | grep "Button"
  ```
  Expected: no output (no `Button` in these files' MUI imports).

- [ ] **Step 3: Run full TypeScript check one final time**

  ```bash
  cd frontend && npm run type-check
  ```
  Expected: no errors.
