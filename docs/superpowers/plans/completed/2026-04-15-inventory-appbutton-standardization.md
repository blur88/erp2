# Inventory Module AppButton Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all MUI `Button` and `IconButton` command-action usages in the Inventory module with `AppButton`, matching the Sales/Purchasing pattern.

**Architecture:** Four component files are updated in-place — no new files created. Each `IconButton` becomes an `AppButton` with `startIcon`, text label, and semantic variant. A dead-code `actionIconSx` constant is removed from the three context header files that define it. The existing `CategoryContextHeader.test.tsx` gains two new test cases covering button rendering and callback firing.

**Tech Stack:** React 19, MUI v7, AppButton (`@/components/common/AppButton`), Vitest, `@testing-library/user-event`

---

### Task 1: Refactor `InventoryPage.tsx` — replace Retry Button

**Files:**
- Modify: `frontend/src/pages/inventory/InventoryPage.tsx`

- [ ] **Step 1: Update the MUI import — remove `Button`**

In `InventoryPage.tsx`, find the MUI import block (line 2–20) and remove `Button` from it:

```tsx
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useTheme,
} from '@mui/material'
```

- [ ] **Step 2: Add the AppButton import**

After the existing `import PageHeader` line, add:

```tsx
import { AppButton } from '@/components/common/AppButton'
```

- [ ] **Step 3: Replace the Retry button (line ~265)**

Find:
```tsx
          action={
            <Button size="small" onClick={() => window.location.reload()}>
              Retry
            </Button>
          }
```

Replace with:
```tsx
          action={
            <AppButton size="small" variant="secondary" onClick={() => window.location.reload()}>
              Retry
            </AppButton>
          }
```

- [ ] **Step 4: Run type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/inventory/InventoryPage.tsx
git commit -m "refactor(inventory): replace Button with AppButton in InventoryPage error alert"
```

---

### Task 2: Refactor `ProductContextHeader.tsx` — replace Edit/Delete IconButtons

**Files:**
- Modify: `frontend/src/pages/inventory/components/ProductContextHeader.tsx`

- [ ] **Step 1: Update imports**

Replace the current import block at the top of `ProductContextHeader.tsx`:

```tsx
import React from 'react'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'
import { Box, Paper, Typography } from '@mui/material'

import { AppButton } from '@/components/common/AppButton'
import { TABLE_STYLES } from '@/constants/tableStyles'
import type { Product } from '@/types'
```

(`IconButton` removed, `AppButton` added.)

- [ ] **Step 2: Remove the `actionIconSx` constant**

Delete these lines entirely (they appear just below the imports):

```tsx
const actionIconSx = {
  height: `${TABLE_STYLES.row.height * 0.75}px`,
  width: `${TABLE_STYLES.row.height * 0.75}px`,
  minHeight: 20,
  minWidth: 20,
  p: 0.125,
}
```

- [ ] **Step 3: Replace the IconButtons in the header row**

Find:
```tsx
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <IconButton
            size="small"
            title={`Edit ${selectedProduct.name}`}
            aria-label={`Edit product ${selectedProduct.name}`}
            onClick={onEdit}
            sx={{ ...actionIconSx, color: 'primary.main' }}
          >
            <EditIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
          <IconButton
            size="small"
            title={`Delete ${selectedProduct.name}`}
            aria-label={`Delete product ${selectedProduct.name}`}
            onClick={onDelete}
            sx={{ ...actionIconSx, color: 'error.main' }}
          >
            <DeleteIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
        </Box>
```

Replace with:
```tsx
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <AppButton
            size="small"
            variant="secondary"
            startIcon={<EditIcon />}
            title={`Edit ${selectedProduct.name}`}
            onClick={onEdit}
          >
            Edit
          </AppButton>
          <AppButton
            size="small"
            variant="danger"
            startIcon={<DeleteIcon />}
            title={`Delete ${selectedProduct.name}`}
            onClick={onDelete}
          >
            Delete
          </AppButton>
        </Box>
```

- [ ] **Step 4: Run type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/inventory/components/ProductContextHeader.tsx
git commit -m "refactor(inventory): replace IconButton with AppButton in ProductContextHeader"
```

---

### Task 3: Refactor `CategoryContextHeader.tsx` — replace Edit/Delete IconButtons

**Files:**
- Modify: `frontend/src/pages/inventory/components/CategoryContextHeader.tsx`

- [ ] **Step 1: Update imports**

Replace the current import block at the top of `CategoryContextHeader.tsx`:

```tsx
import React from 'react'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'
import {
  Box,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material'

import { AppButton } from '@/components/common/AppButton'
import { TABLE_STYLES } from '@/constants/tableStyles'
import type { Category } from '@/types'
import { formatDate } from '@/utils/formatters'
```

(`IconButton` removed, `AppButton` added.)

- [ ] **Step 2: Remove the `actionIconSx` constant**

Delete these lines entirely:

```tsx
const actionIconSx = {
  height: `${TABLE_STYLES.row.height * 0.75}px`,
  width: `${TABLE_STYLES.row.height * 0.75}px`,
  minHeight: 20,
  minWidth: 20,
  p: 0.125,
}
```

- [ ] **Step 3: Replace the IconButtons in the header row**

Find:
```tsx
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <IconButton
            size="small"
            title={`Edit ${selectedCategory.name}`}
            aria-label={`Edit category ${selectedCategory.name}`}
            onClick={onEdit}
            sx={{ ...actionIconSx, color: 'primary.main' }}
          >
            <EditIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
          <IconButton
            size="small"
            title={`Delete ${selectedCategory.name}`}
            aria-label={`Delete category ${selectedCategory.name}`}
            onClick={onDelete}
            sx={{ ...actionIconSx, color: 'error.main' }}
          >
            <DeleteIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
        </Box>
```

Replace with:
```tsx
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <AppButton
            size="small"
            variant="secondary"
            startIcon={<EditIcon />}
            title={`Edit ${selectedCategory.name}`}
            onClick={onEdit}
          >
            Edit
          </AppButton>
          <AppButton
            size="small"
            variant="danger"
            startIcon={<DeleteIcon />}
            title={`Delete ${selectedCategory.name}`}
            onClick={onDelete}
          >
            Delete
          </AppButton>
        </Box>
```

- [ ] **Step 4: Run type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/inventory/components/CategoryContextHeader.tsx
git commit -m "refactor(inventory): replace IconButton with AppButton in CategoryContextHeader"
```

---

### Task 4: Refactor `StockAdjustmentContextHeader.tsx` — replace Edit/Delete IconButtons

**Files:**
- Modify: `frontend/src/pages/inventory/components/StockAdjustmentContextHeader.tsx`

- [ ] **Step 1: Update imports**

Remove `IconButton` from the MUI import block. The existing `AppButton` import is already present. The updated import block:

```tsx
import React from 'react'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'
import {
  Box,
  Chip,
  CircularProgress,
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
import { TABLE_STYLES } from '@/constants/tableStyles'
import type { StockAdjustment } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

import type { StockAdjustmentsJournalEntryRef } from '../hooks/useStockAdjustmentsPageState'
```

- [ ] **Step 2: Remove the `actionIconSx` constant**

Delete these lines entirely:

```tsx
const actionIconSx = {
  height: `${TABLE_STYLES.row.height * 0.75}px`,
  width: `${TABLE_STYLES.row.height * 0.75}px`,
  minHeight: 20,
  minWidth: 20,
  p: 0.125,
}
```

- [ ] **Step 3: Replace the IconButtons in the header row**

Find:
```tsx
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <IconButton
            size="small"
            title="Edit Adjustment"
            onClick={onEdit}
            sx={{ ...actionIconSx, color: 'primary.main' }}
          >
            <EditIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
          <IconButton
            size="small"
            title="Delete Adjustment"
            onClick={onDelete}
            sx={{ ...actionIconSx, color: 'error.main' }}
          >
            <DeleteIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
        </Box>
```

Replace with:
```tsx
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <AppButton
            size="small"
            variant="secondary"
            startIcon={<EditIcon />}
            title="Edit Adjustment"
            onClick={onEdit}
          >
            Edit
          </AppButton>
          <AppButton
            size="small"
            variant="danger"
            startIcon={<DeleteIcon />}
            title="Delete Adjustment"
            onClick={onDelete}
          >
            Delete
          </AppButton>
        </Box>
```

- [ ] **Step 4: Run type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/inventory/components/StockAdjustmentContextHeader.tsx
git commit -m "refactor(inventory): replace IconButton with AppButton in StockAdjustmentContextHeader"
```

---

### Task 5: Add button tests to `CategoryContextHeader.test.tsx`

**Files:**
- Modify: `frontend/src/pages/inventory/components/CategoryContextHeader.test.tsx`

- [ ] **Step 1: Add `userEvent` import**

At the top of the test file, add the `userEvent` import after the existing imports:

```tsx
import userEvent from '@testing-library/user-event'
```

The existing imports to keep:
```tsx
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import CategoryContextHeader from './CategoryContextHeader'

import type { Category } from '@/types'
```

- [ ] **Step 2: Add the two new test cases**

Append these two `it` blocks inside the existing `describe('CategoryContextHeader', () => { ... })` block, after the last existing test:

```tsx
  it('renders Edit and Delete action buttons', () => {
    render(
      <CategoryContextHeader
        selectedCategory={makeCategory()}
        allCategories={[makeCategory()]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByTitle('Edit Root')).toBeInTheDocument()
    expect(screen.getByTitle('Delete Root')).toBeInTheDocument()
  })

  it('fires onEdit and onDelete callbacks when buttons are clicked', async () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()
    const user = userEvent.setup()

    render(
      <CategoryContextHeader
        selectedCategory={makeCategory()}
        allCategories={[makeCategory()]}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    )

    await user.click(screen.getByTitle('Edit Root'))
    expect(onEdit).toHaveBeenCalledOnce()

    await user.click(screen.getByTitle('Delete Root'))
    expect(onDelete).toHaveBeenCalledOnce()
  })
```

- [ ] **Step 3: Run the test file to verify all tests pass**

```bash
cd frontend && npx vitest run src/pages/inventory/components/CategoryContextHeader.test.tsx
```

Expected: all tests pass (5 existing + 2 new = 7 total).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/inventory/components/CategoryContextHeader.test.tsx
git commit -m "test(inventory): add AppButton render and callback tests for CategoryContextHeader"
```

---

### Task 6: Final verification

- [ ] **Step 1: Run type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 2: Run all affected test files**

```bash
cd frontend && npx vitest run src/pages/inventory/components/CategoryContextHeader.test.tsx src/pages/inventory/components/StockAdjustmentPanels.test.tsx
```

Expected: all tests pass.

- [ ] **Step 3: Verify no remaining raw MUI Button/IconButton in the four files**

```bash
grep -n "IconButton\|from '@mui/material'.*Button[^s]" \
  frontend/src/pages/inventory/InventoryPage.tsx \
  frontend/src/pages/inventory/components/ProductContextHeader.tsx \
  frontend/src/pages/inventory/components/CategoryContextHeader.tsx \
  frontend/src/pages/inventory/components/StockAdjustmentContextHeader.tsx
```

Expected: no matches for `IconButton`. The only `Button` reference should be inside `AppButton.tsx` itself (not these files).

- [ ] **Step 4: Open a PR closing issue #370**

```bash
gh pr create \
  --title "refactor(inventory): standardize buttons with AppButton (#370)" \
  --body "$(cat <<'EOF'
## Summary
- Replace MUI `Button` (Retry) in `InventoryPage` error alert with `AppButton`
- Replace `IconButton` Edit/Delete pairs in `ProductContextHeader`, `CategoryContextHeader`, and `StockAdjustmentContextHeader` with `AppButton`
- Remove dead `actionIconSx` constants from all three context headers
- Add button render + callback tests to `CategoryContextHeader.test.tsx`

## Test plan
- [ ] `npm run type-check` passes
- [ ] `CategoryContextHeader.test.tsx` — all 7 tests pass
- [ ] No `IconButton` remaining in the four refactored files

Closes #370
EOF
)"
```
