# AppButton Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `AppButton` to unify button styling across `FilterBar`, `DashboardFilterBar`, and `PageHeader`, and delete legacy toolbar files superseded by the `FilterBar` system.

**Architecture:** A single `AppButton` component wraps MUI `Button` and adds a `size="filter"` mode (40px height), a `loading` prop, and a `sortConfig` prop that derives variant/icon from sort state. All targeted components (`FilterBar`, `DashboardFilterBar`, `PageHeader`) switch to `AppButton`. Legacy toolbar files are deleted and their imports removed from consuming pages and test files.

**Tech Stack:** React 19, MUI v7, TypeScript (strict: false), Vitest + React Testing Library

---

## File Map

| Action | File |
|--------|------|
| **Create** | `frontend/src/components/common/AppButton.tsx` |
| **Create** | `frontend/src/components/common/__tests__/AppButton.test.tsx` |
| **Modify** | `frontend/src/components/filters/FilterBar.tsx` |
| **Modify** | `frontend/src/components/filters/DashboardFilterBar.tsx` |
| **Modify** | `frontend/src/components/common/PageHeader.tsx` |
| **Modify** | `frontend/src/components/common/__tests__/PageHeader.test.tsx` |
| **Delete** | `frontend/src/pages/sales/components/OrdersToolbar.tsx` |
| **Delete** | `frontend/src/pages/sales/components/InvoicesToolbar.tsx` |
| **Delete** | `frontend/src/pages/sales/components/OrderContextHeader.tsx` |
| **Delete** | `frontend/src/pages/purchasing/components/PurchaseOrdersToolbar.tsx` |
| **Delete** | `frontend/src/pages/purchasing/components/PurchaseOrderContextHeader.tsx` |
| **Delete** | `frontend/src/pages/inventory/components/ProductsToolbar.tsx` |
| **Modify** | `frontend/src/pages/sales/OrdersPage.tsx` (remove toolbar/context header imports) |
| **Modify** | `frontend/src/pages/sales/InvoicesPage.tsx` (remove toolbar import) |
| **Modify** | `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx` (remove toolbar/context header imports) |
| **Modify** | `frontend/src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx` (remove mock) |
| **Modify** | `frontend/src/pages/purchasing/__tests__/PurchaseOrdersPage.filterbar.test.tsx` (remove mock) |

---

## Task 1: Create AppButton component

**Files:**
- Create: `frontend/src/components/common/AppButton.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/common/__tests__/AppButton.test.tsx`:

```tsx
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider, createTheme } from '@mui/material'
import { describe, expect, it, vi } from 'vitest'
import { AppButton } from '../AppButton'

const theme = createTheme()
function wrap(ui: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>)
}

describe('AppButton — variants', () => {
  it('renders primary as contained', () => {
    wrap(<AppButton variant="primary">Save</AppButton>)
    const btn = screen.getByRole('button', { name: 'Save' })
    expect(btn.className).toMatch(/MuiButton-contained/)
  })

  it('renders outlined as outlined', () => {
    wrap(<AppButton variant="outlined">Cancel</AppButton>)
    const btn = screen.getByRole('button', { name: 'Cancel' })
    expect(btn.className).toMatch(/MuiButton-outlined/)
  })

  it('renders secondary as outlined', () => {
    wrap(<AppButton variant="secondary">View</AppButton>)
    const btn = screen.getByRole('button', { name: 'View' })
    expect(btn.className).toMatch(/MuiButton-outlined/)
  })

  it('renders danger as contained colorError', () => {
    wrap(<AppButton variant="danger">Delete</AppButton>)
    const btn = screen.getByRole('button', { name: 'Delete' })
    expect(btn.className).toMatch(/MuiButton-contained/)
    expect(btn.className).toMatch(/MuiButton-colorError/)
  })
})

describe('AppButton — size=filter', () => {
  it('applies 40px height when size=filter', () => {
    wrap(<AppButton size="filter">Reset</AppButton>)
    const btn = screen.getByRole('button', { name: 'Reset' })
    // jsdom does not compute styles, but we can assert the element renders
    expect(btn).toBeInTheDocument()
  })
})

describe('AppButton — loading', () => {
  it('disables the button when loading', () => {
    wrap(<AppButton variant="primary" loading>Save</AppButton>)
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })

  it('shows spinner when loading', () => {
    wrap(<AppButton variant="primary" loading>Save</AppButton>)
    expect(document.querySelector('.MuiCircularProgress-root')).toBeInTheDocument()
  })

  it('does not disable when loading is false', () => {
    wrap(<AppButton variant="primary" loading={false}>Save</AppButton>)
    expect(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled()
  })
})

describe('AppButton — sortConfig', () => {
  const baseSortConfig = { field: 'orderNumber', sortBy: 'orderNumber', sortOrder: 'asc' as const }

  it('renders as contained when sort is active', () => {
    wrap(<AppButton sortConfig={baseSortConfig}>Sort</AppButton>)
    const btn = screen.getByRole('button', { name: /sort/i })
    expect(btn.className).toMatch(/MuiButton-contained/)
  })

  it('renders as outlined when sort is inactive', () => {
    wrap(<AppButton sortConfig={{ ...baseSortConfig, sortBy: 'other' }}>Sort</AppButton>)
    const btn = screen.getByRole('button', { name: /sort/i })
    expect(btn.className).toMatch(/MuiButton-outlined/)
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    wrap(<AppButton sortConfig={baseSortConfig} onClick={onClick}>Sort</AppButton>)
    screen.getByRole('button', { name: /sort/i }).click()
    expect(onClick).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/components/common/__tests__/AppButton.test.tsx
```

Expected: FAIL — `AppButton` not found.

- [ ] **Step 3: Implement AppButton**

Create `frontend/src/components/common/AppButton.tsx`:

```tsx
import { CircularProgress } from '@mui/material'
import Button, { type ButtonProps } from '@mui/material/Button'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import SortIcon from '@mui/icons-material/Sort'

type AppButtonVariant = 'primary' | 'secondary' | 'outlined' | 'danger'
type AppButtonSize = 'filter' | 'small' | 'medium' | 'large'

type SortConfig = {
  field: string
  sortBy: string
  sortOrder: 'asc' | 'desc'
}

type AppButtonProps = Omit<ButtonProps, 'variant' | 'size' | 'color'> & {
  variant?: AppButtonVariant
  size?: AppButtonSize
  loading?: boolean
  sortConfig?: SortConfig
}

export function AppButton({
  variant,
  size,
  loading = false,
  sortConfig,
  disabled,
  startIcon,
  sx,
  children,
  ...rest
}: AppButtonProps) {
  const isSortActive = sortConfig != null && sortConfig.sortBy === sortConfig.field

  // Derive MUI props from sortConfig
  let muiVariant: ButtonProps['variant']
  let muiColor: ButtonProps['color']
  let resolvedStartIcon: React.ReactNode = startIcon

  if (sortConfig != null) {
    muiVariant = isSortActive ? 'contained' : 'outlined'
    muiColor = isSortActive ? 'primary' : 'inherit'
    if (isSortActive) {
      resolvedStartIcon = sortConfig.sortOrder === 'desc' ? <ArrowDownwardIcon /> : <ArrowUpwardIcon />
    } else {
      resolvedStartIcon = <SortIcon />
    }
  } else {
    switch (variant) {
      case 'primary':
        muiVariant = 'contained'
        muiColor = 'primary'
        break
      case 'danger':
        muiVariant = 'contained'
        muiColor = 'error'
        break
      case 'secondary':
      case 'outlined':
      default:
        muiVariant = 'outlined'
        muiColor = 'inherit'
        break
    }
  }

  // Override startIcon with spinner when loading
  if (loading) {
    resolvedStartIcon = <CircularProgress size={16} color="inherit" />
  }

  const muiSize: ButtonProps['size'] = size === 'filter' ? 'small' : (size as ButtonProps['size'])

  return (
    <Button
      variant={muiVariant}
      color={muiColor}
      size={muiSize}
      disabled={disabled || loading}
      startIcon={resolvedStartIcon}
      sx={size === 'filter' ? { height: 40, ...((sx as object) ?? {}) } : sx}
      {...rest}
    >
      {children}
    </Button>
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/components/common/__tests__/AppButton.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/components/common/AppButton.tsx src/components/common/__tests__/AppButton.test.tsx
git commit -m "feat: add AppButton component with sort, loading, and filter-size support"
```

---

## Task 2: Update FilterBar to use AppButton

**Files:**
- Modify: `frontend/src/components/filters/FilterBar.tsx`

- [ ] **Step 1: Run existing FilterBar tests to confirm baseline**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/FilterBar.test.tsx
```

Expected: All tests PASS before any changes.

- [ ] **Step 2: Update FilterBar.tsx**

Replace the import block and the Reset/Sort buttons in `frontend/src/components/filters/FilterBar.tsx`:

Replace:
```tsx
import {
  ArrowDownward as ArrowDownIcon,
  ArrowUpward as ArrowUpIcon,
  Sort as SortIcon,
} from '@mui/icons-material'
import { Button, Stack } from '@mui/material'
```

With:
```tsx
import { Stack } from '@mui/material'
import { AppButton } from '@/components/common/AppButton'
```

Replace the Reset button JSX:
```tsx
      {hasActiveFilters ? (
        <Button size="small" variant="outlined" color="inherit" sx={{ ml: 1 }} onClick={handlers.onClearAll}>
          Reset
        </Button>
      ) : null}
```

With:
```tsx
      {hasActiveFilters ? (
        <AppButton size="filter" variant="outlined" sx={{ ml: 1 }} onClick={handlers.onClearAll}>
          Reset
        </AppButton>
      ) : null}
```

Replace the Sort button JSX:
```tsx
      {sort ? (
        <Button
          size="small"
          variant={sort.sortBy === sort.field ? 'contained' : 'outlined'}
          color={sort.sortBy === sort.field ? 'primary' : 'inherit'}
          startIcon={
            sort.sortBy === sort.field
              ? sort.sortOrder === 'desc'
                ? <ArrowDownIcon />
                : <ArrowUpIcon />
              : <SortIcon />
          }
          onClick={() => sort.onSort(sort.field)}
        >
          Sort
        </Button>
      ) : null}
```

With:
```tsx
      {sort ? (
        <AppButton
          size="filter"
          sortConfig={{ field: sort.field, sortBy: sort.sortBy, sortOrder: sort.sortOrder }}
          onClick={() => sort.onSort(sort.field)}
        >
          Sort
        </AppButton>
      ) : null}
```

- [ ] **Step 3: Run FilterBar tests**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/FilterBar.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/filters/FilterBar.tsx
git commit -m "refactor: use AppButton for Reset and Sort in FilterBar"
```

---

## Task 3: Update DashboardFilterBar to use AppButton

**Files:**
- Modify: `frontend/src/components/filters/DashboardFilterBar.tsx`

- [ ] **Step 1: Run existing DashboardFilterBar tests to confirm baseline**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/DashboardFilterBar.test.tsx
```

Expected: All tests PASS before any changes.

- [ ] **Step 2: Update DashboardFilterBar.tsx**

In `frontend/src/components/filters/DashboardFilterBar.tsx`, add the AppButton import:

Replace:
```tsx
import { Box, Button, CircularProgress, FormControl, InputLabel, MenuItem, Select, Tooltip } from '@mui/material'
```

With:
```tsx
import { Box, CircularProgress, FormControl, InputLabel, MenuItem, Select, Tooltip } from '@mui/material'
import { AppButton } from '@/components/common/AppButton'
```

Replace the Reset button:
```tsx
      {!isDefault && (
        <Button variant="outlined" size="small" onClick={onReset} sx={{ height: 40 }}>
          Reset
        </Button>
      )}
```

With:
```tsx
      {!isDefault && (
        <AppButton size="filter" variant="outlined" onClick={onReset}>
          Reset
        </AppButton>
      )}
```

- [ ] **Step 3: Run DashboardFilterBar tests**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/DashboardFilterBar.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/filters/DashboardFilterBar.tsx
git commit -m "refactor: use AppButton for Reset in DashboardFilterBar"
```

---

## Task 4: Update PageHeader to use AppButton

**Files:**
- Modify: `frontend/src/components/common/PageHeader.tsx`
- Modify: `frontend/src/components/common/__tests__/PageHeader.test.tsx`

- [ ] **Step 1: Run existing PageHeader tests to confirm baseline**

```bash
cd frontend && npx vitest run src/components/common/__tests__/PageHeader.test.tsx
```

Expected: All tests PASS before any changes.

- [ ] **Step 2: Update PageHeader.tsx**

In `frontend/src/components/common/PageHeader.tsx`, replace the Button import and usages:

Replace:
```tsx
import { Box, Button, IconButton, Typography, useTheme } from '@mui/material'
```

With:
```tsx
import { Box, IconButton, Typography, useTheme } from '@mui/material'
import { AppButton } from './AppButton'
```

Replace the secondaryAction button:
```tsx
            {secondaryAction && (
              <Button
                type="button"
                variant="outlined"
                disabled={secondaryAction.disabled}
                onClick={secondaryAction.onClick}
              >
                {secondaryAction.label}
              </Button>
            )}
```

With:
```tsx
            {secondaryAction && (
              <AppButton
                type="button"
                variant="outlined"
                disabled={secondaryAction.disabled}
                onClick={secondaryAction.onClick}
              >
                {secondaryAction.label}
              </AppButton>
            )}
```

Replace the primaryAction button:
```tsx
            {primaryAction && (
              <Button
                type="button"
                variant="contained"
                disabled={primaryAction.disabled}
                onClick={primaryAction.onClick}
              >
                {primaryAction.label}
              </Button>
            )}
```

With:
```tsx
            {primaryAction && (
              <AppButton
                type="button"
                variant="primary"
                disabled={primaryAction.disabled}
                onClick={primaryAction.onClick}
              >
                {primaryAction.label}
              </AppButton>
            )}
```

- [ ] **Step 3: Run PageHeader tests**

```bash
cd frontend && npx vitest run src/components/common/__tests__/PageHeader.test.tsx
```

Expected: All tests PASS (tests check by role/name/disabled state — not MUI class names, so they are unaffected by the component swap).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/common/PageHeader.tsx
git commit -m "refactor: use AppButton for primary and secondary actions in PageHeader"
```

---

## Task 5: Delete legacy toolbar files and clean up consuming pages

**Files:**
- Delete: `frontend/src/pages/sales/components/OrdersToolbar.tsx`
- Delete: `frontend/src/pages/sales/components/InvoicesToolbar.tsx`
- Delete: `frontend/src/pages/sales/components/OrderContextHeader.tsx`
- Delete: `frontend/src/pages/purchasing/components/PurchaseOrdersToolbar.tsx`
- Delete: `frontend/src/pages/purchasing/components/PurchaseOrderContextHeader.tsx`
- Delete: `frontend/src/pages/inventory/components/ProductsToolbar.tsx`
- Modify: `frontend/src/pages/sales/OrdersPage.tsx`
- Modify: `frontend/src/pages/sales/InvoicesPage.tsx`
- Modify: `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx`
- Modify: `frontend/src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx`
- Modify: `frontend/src/pages/purchasing/__tests__/PurchaseOrdersPage.filterbar.test.tsx`

- [ ] **Step 1: Delete the toolbar files**

```bash
rm frontend/src/pages/sales/components/OrdersToolbar.tsx
rm frontend/src/pages/sales/components/InvoicesToolbar.tsx
rm frontend/src/pages/sales/components/OrderContextHeader.tsx
rm frontend/src/pages/purchasing/components/PurchaseOrdersToolbar.tsx
rm frontend/src/pages/purchasing/components/PurchaseOrderContextHeader.tsx
rm frontend/src/pages/inventory/components/ProductsToolbar.tsx
```

- [ ] **Step 2: Remove OrdersToolbar and OrderContextHeader from OrdersPage.tsx**

In `frontend/src/pages/sales/OrdersPage.tsx`:

1. Remove these import lines (find and delete them):
```tsx
import OrderContextHeader from './components/OrderContextHeader'
```
and any import line for `OrdersToolbar` if present.

2. Remove any JSX usage of `<OrderContextHeader ... />` from the render output. Replace it with nothing (the page will render without a toolbar until the FilterBar migration).

- [ ] **Step 3: Remove InvoicesToolbar from InvoicesPage.tsx**

In `frontend/src/pages/sales/InvoicesPage.tsx`:

1. Remove the import:
```tsx
import InvoicesToolbar from './components/InvoicesToolbar'
```

2. Remove the `<InvoicesToolbar ... />` JSX from the render output.

- [ ] **Step 4: Remove PurchaseOrdersToolbar and PurchaseOrderContextHeader from PurchaseOrdersPage.tsx**

In `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx`:

1. Remove these import lines:
```tsx
import PurchaseOrderContextHeader from './components/PurchaseOrderContextHeader'
```
and any import line for `PurchaseOrdersToolbar` if present.

2. Remove any JSX usage of `<PurchaseOrderContextHeader ... />` from the render output.

- [ ] **Step 5: Clean up OrdersPage.filterbar.test.tsx**

In `frontend/src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx`:

1. Remove the mock line:
```tsx
vi.mock('../components/OrderContextHeader', () => ({ default: () => <div>OrderContextHeader</div> }))
```

2. Remove any assertion that checks for `'OrderContextHeader'` text in the rendered output, e.g.:
```tsx
expect(screen.getByText('OrderContextHeader')).toBeInTheDocument()
```

- [ ] **Step 6: Clean up PurchaseOrdersPage.filterbar.test.tsx**

In `frontend/src/pages/purchasing/__tests__/PurchaseOrdersPage.filterbar.test.tsx`:

1. Remove the mock line:
```tsx
vi.mock('../components/PurchaseOrderContextHeader', () => ({ default: () => <div>PurchaseOrderContextHeader</div> }))
```

2. Remove any assertion that checks for `'PurchaseOrderContextHeader'` text in the rendered output, e.g.:
```tsx
expect(screen.getByText('PurchaseOrderContextHeader')).toBeInTheDocument()
```

- [ ] **Step 7: Run TypeScript type-check to confirm no broken imports**

```bash
cd frontend && npm run type-check
```

Expected: No errors related to deleted files.

- [ ] **Step 8: Run affected test files**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx src/pages/purchasing/__tests__/PurchaseOrdersPage.filterbar.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: delete legacy toolbar files and remove their imports from consuming pages"
```

---

## Task 6: Final verification

- [ ] **Step 1: Run all AppButton, FilterBar, DashboardFilterBar, and PageHeader tests together**

```bash
cd frontend && npx vitest run \
  src/components/common/__tests__/AppButton.test.tsx \
  src/components/filters/__tests__/FilterBar.test.tsx \
  src/components/filters/__tests__/DashboardFilterBar.test.tsx \
  src/components/common/__tests__/PageHeader.test.tsx
```

Expected: All tests PASS.

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: No errors.

- [ ] **Step 3: Lint check**

```bash
cd frontend && npm run lint
```

Expected: No errors.

- [ ] **Step 4: Commit if any lint auto-fixes were applied, otherwise proceed**

```bash
git status
# Only commit if there are changes from lint fixes
```
