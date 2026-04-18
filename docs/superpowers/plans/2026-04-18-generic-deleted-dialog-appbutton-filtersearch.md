# GenericDeletedDialog — AppButton + FilterSearch Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw `TextField` search and MUI `Button` components in `GenericDeletedDialog` with the project's `FilterSearch` and `AppButton` components, closing issues #383 and #384 in a single PR.

**Architecture:** Single-file change in `GenericDeletedDialog.tsx` — swap imports and JSX, no prop interface changes, no new files. `FilterSearch` wraps in a `Box` for layout; `AppButton` replaces all 8 `Button` usages with semantic variant names and built-in loading state.

**Tech Stack:** React 19, MUI v7, Vitest, `@/components/common/AppButton`, `@/components/filters/FilterSearch`

---

### Task 1: Replace TextField with FilterSearch

**Files:**
- Modify: `frontend/src/components/common/GenericDeletedDialog.tsx`

- [ ] **Step 1: Update imports**

  Remove `TextField`, `InputAdornment` from the MUI import block, and remove the `SearchIcon` icon import. Add the `FilterSearch` import.

  The top of the file should go from:
  ```tsx
  import {
    Alert,
    Box,
    Button,
    Checkbox,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    InputAdornment,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
    useMediaQuery,
    useTheme,
  } from '@mui/material'
  import { default as CloseIcon } from '@mui/icons-material/Close'
  import { default as DeleteForeverIcon } from '@mui/icons-material/DeleteForever'
  import { default as RestoreIcon } from '@mui/icons-material/Restore'
  import { default as SearchIcon } from '@mui/icons-material/Search'
  import { useNotification } from '@/hooks/useNotification'
  ```

  To:
  ```tsx
  import {
    Alert,
    Box,
    Button,
    Checkbox,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tooltip,
    Typography,
    useMediaQuery,
    useTheme,
  } from '@mui/material'
  import { default as CloseIcon } from '@mui/icons-material/Close'
  import { default as DeleteForeverIcon } from '@mui/icons-material/DeleteForever'
  import { default as RestoreIcon } from '@mui/icons-material/Restore'
  import { useNotification } from '@/hooks/useNotification'
  import { FilterSearch } from '@/components/filters/FilterSearch'
  ```

- [ ] **Step 2: Replace the TextField JSX block**

  Find the `<TextField ... />` block (inside the `<Box sx={{ display: 'flex', gap: 2, ...}}>`) and replace it:

  **Before:**
  ```tsx
  <TextField
    fullWidth
    placeholder={searchPlaceholder}
    value={searchTerm}
    onChange={(event) => setSearchTerm(event.target.value)}
    slotProps={{
      input: {
        startAdornment: (
          <InputAdornment position="start">
            <SearchIcon />
          </InputAdornment>
        ),
      },
    }}
    sx={{ flex: 1, minWidth: '300px' }}
  />
  ```

  **After:**
  ```tsx
  <Box sx={{ flex: 1, minWidth: '300px' }}>
    <FilterSearch
      value={searchTerm}
      placeholder={searchPlaceholder}
      onChange={setSearchTerm}
      onCommit={() => {}}
    />
  </Box>
  ```

- [ ] **Step 3: Run existing tests to confirm no regressions**

  ```bash
  cd frontend && npx vitest run src/components/common/GenericDeletedDialog.test.tsx
  ```

  Expected: all 11 tests pass. The tests use `getByPlaceholderText('Search...')` which still resolves correctly because `FilterSearch` renders a `TextField` with the same placeholder.

- [ ] **Step 4: Run TypeScript check**

  ```bash
  cd frontend && npm run type-check
  ```

  Expected: no errors.

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/components/common/GenericDeletedDialog.tsx
  git commit -m "refactor(common): replace TextField with FilterSearch in GenericDeletedDialog (#383)"
  ```

---

### Task 2: Replace Button with AppButton

**Files:**
- Modify: `frontend/src/components/common/GenericDeletedDialog.tsx`

- [ ] **Step 1: Update imports**

  Remove `Button` and `CircularProgress` from the MUI import block. Add `AppButton` import.

  Change the MUI import from:
  ```tsx
  import {
    Alert,
    Box,
    Button,
    Checkbox,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tooltip,
    Typography,
    useMediaQuery,
    useTheme,
  } from '@mui/material'
  ```

  To:
  ```tsx
  import {
    Alert,
    Box,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tooltip,
    Typography,
    useMediaQuery,
    useTheme,
  } from '@mui/material'
  ```

  And add the AppButton import alongside FilterSearch:
  ```tsx
  import { FilterSearch } from '@/components/filters/FilterSearch'
  import { AppButton } from '@/components/common/AppButton'
  ```

- [ ] **Step 2: Replace bulk action toolbar buttons**

  Find the bulk toolbar buttons (inside the `{hasBulkActions && selectedCount > 0 && (...)}` block) and replace:

  **Before:**
  ```tsx
  {bulkRestore && (
    <Button
      variant="contained"
      color="success"
      startIcon={<RestoreIcon />}
      onClick={() => setShowBulkRestoreConfirm(true)}
      disabled={bulkRestoring || bulkDeleting}
    >
      Restore Selected ({selectedCount})
    </Button>
  )}
  {bulkPermanentDelete && (
    <Button
      variant="contained"
      color="error"
      startIcon={<DeleteForeverIcon />}
      onClick={() => setShowBulkDeleteConfirm(true)}
      disabled={bulkDeleting || bulkRestoring}
    >
      Delete Selected ({selectedCount})
    </Button>
  )}
  ```

  **After:**
  ```tsx
  {bulkRestore && (
    <AppButton
      variant="success"
      startIcon={<RestoreIcon />}
      onClick={() => setShowBulkRestoreConfirm(true)}
      disabled={bulkDeleting}
      loading={bulkRestoring}
    >
      Restore Selected ({selectedCount})
    </AppButton>
  )}
  {bulkPermanentDelete && (
    <AppButton
      variant="danger"
      startIcon={<DeleteForeverIcon />}
      onClick={() => setShowBulkDeleteConfirm(true)}
      disabled={bulkRestoring}
      loading={bulkDeleting}
    >
      Delete Selected ({selectedCount})
    </AppButton>
  )}
  ```

- [ ] **Step 3: Replace main dialog Close button**

  Find the `<DialogActions>` section of the main dialog and replace:

  **Before:**
  ```tsx
  <DialogActions>
    <Button onClick={onClose} variant="outlined">
      Close
    </Button>
  </DialogActions>
  ```

  **After:**
  ```tsx
  <DialogActions>
    <AppButton onClick={onClose} variant="outlined">
      Close
    </AppButton>
  </DialogActions>
  ```

- [ ] **Step 4: Replace confirm-delete dialog buttons**

  Find the `<Dialog open={Boolean(confirmDelete)} ...>` block's `<DialogActions>` and replace:

  **Before:**
  ```tsx
  <DialogActions>
    <Button onClick={() => setConfirmDelete(null)} variant="outlined" disabled={deletingId === confirmDelete?.id}>
      Cancel
    </Button>
    <Button
      onClick={() => confirmDelete && handlePermanentDelete(confirmDelete)}
      variant="contained"
      color="error"
      disabled={deletingId === confirmDelete?.id}
      startIcon={deletingId === confirmDelete?.id ? <CircularProgress size={16} /> : <DeleteForeverIcon />}
    >
      {deletingId === confirmDelete?.id ? 'Deleting...' : 'Permanently Delete'}
    </Button>
  </DialogActions>
  ```

  **After:**
  ```tsx
  <DialogActions>
    <AppButton onClick={() => setConfirmDelete(null)} variant="outlined" disabled={deletingId === confirmDelete?.id}>
      Cancel
    </AppButton>
    <AppButton
      onClick={() => confirmDelete && handlePermanentDelete(confirmDelete)}
      variant="danger"
      startIcon={<DeleteForeverIcon />}
      loading={deletingId === confirmDelete?.id}
    >
      {deletingId === confirmDelete?.id ? 'Deleting...' : 'Permanently Delete'}
    </AppButton>
  </DialogActions>
  ```

- [ ] **Step 5: Replace bulk-restore confirmation dialog buttons**

  Find the `<Dialog open={showBulkRestoreConfirm} ...>` block's `<DialogActions>` and replace:

  **Before:**
  ```tsx
  <DialogActions>
    <Button onClick={() => setShowBulkRestoreConfirm(false)} variant="outlined" disabled={bulkRestoring}>
      Cancel
    </Button>
    <Button
      onClick={handleBulkRestore}
      variant="contained"
      color="success"
      disabled={bulkRestoring}
      startIcon={bulkRestoring ? <CircularProgress size={16} /> : <RestoreIcon />}
    >
      {bulkRestoring ? 'Restoring...' : `Restore ${selectedCount} ${entityLabelPlural}`}
    </Button>
  </DialogActions>
  ```

  **After:**
  ```tsx
  <DialogActions>
    <AppButton onClick={() => setShowBulkRestoreConfirm(false)} variant="outlined" disabled={bulkRestoring}>
      Cancel
    </AppButton>
    <AppButton
      onClick={handleBulkRestore}
      variant="success"
      startIcon={<RestoreIcon />}
      loading={bulkRestoring}
    >
      {bulkRestoring ? 'Restoring...' : `Restore ${selectedCount} ${entityLabelPlural}`}
    </AppButton>
  </DialogActions>
  ```

- [ ] **Step 6: Replace bulk-delete confirmation dialog buttons**

  Find the `<Dialog open={showBulkDeleteConfirm} ...>` block's `<DialogActions>` and replace:

  **Before:**
  ```tsx
  <DialogActions>
    <Button onClick={() => setShowBulkDeleteConfirm(false)} variant="outlined" disabled={bulkDeleting}>
      Cancel
    </Button>
    <Button
      onClick={handleBulkPermanentDelete}
      variant="contained"
      color="error"
      disabled={bulkDeleting}
      startIcon={bulkDeleting ? <CircularProgress size={16} /> : <DeleteForeverIcon />}
    >
      {bulkDeleting ? 'Deleting...' : `Delete ${selectedCount} ${entityLabelPlural}`}
    </Button>
  </DialogActions>
  ```

  **After:**
  ```tsx
  <DialogActions>
    <AppButton onClick={() => setShowBulkDeleteConfirm(false)} variant="outlined" disabled={bulkDeleting}>
      Cancel
    </AppButton>
    <AppButton
      onClick={handleBulkPermanentDelete}
      variant="danger"
      startIcon={<DeleteForeverIcon />}
      loading={bulkDeleting}
    >
      {bulkDeleting ? 'Deleting...' : `Delete ${selectedCount} ${entityLabelPlural}`}
    </AppButton>
  </DialogActions>
  ```

- [ ] **Step 7: Run existing tests to confirm no regressions**

  ```bash
  cd frontend && npx vitest run src/components/common/GenericDeletedDialog.test.tsx
  ```

  Expected: all 11 tests pass. Button text and aria-labels are unchanged so all role/name queries resolve correctly.

- [ ] **Step 8: Run TypeScript check**

  ```bash
  cd frontend && npm run type-check
  ```

  Expected: no errors.

- [ ] **Step 9: Commit**

  ```bash
  git add frontend/src/components/common/GenericDeletedDialog.tsx
  git commit -m "refactor(common): replace Button with AppButton in GenericDeletedDialog (#384)"
  ```

---

### Task 3: Open PR

- [ ] **Step 1: Push branch and open PR**

  ```bash
  git push -u origin HEAD
  gh pr create \
    --title "refactor(common): use AppButton and FilterSearch in GenericDeletedDialog" \
    --body "$(cat <<'EOF'
  ## Summary
  - Replaces raw `TextField` search with `FilterSearch` component, adding a Clear (X) button and visual consistency with main-page search (#383)
  - Replaces all MUI `Button` instances with `AppButton`, using semantic variants (`success`, `danger`, `outlined`) and built-in loading states (#384)
  - No prop interface changes; no new files

  Closes #383
  Closes #384

  ## Test plan
  - [ ] All 11 existing `GenericDeletedDialog` tests pass (`npx vitest run src/components/common/GenericDeletedDialog.test.tsx`)
  - [ ] TypeScript check passes (`npm run type-check`)
  - [ ] Manually open a Deleted Items dialog and verify: search box shows Clear button when text is entered; Restore/Delete buttons match the app's global style; loading spinners appear correctly during async operations

  🤖 Generated with [Claude Code](https://claude.ai/claude-code)
  EOF
  )"
  ```
