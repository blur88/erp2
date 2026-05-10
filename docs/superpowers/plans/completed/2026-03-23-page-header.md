# PageHeader Component Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a shared `PageHeader` component and refactor the Sales module to use it, validating the reusable layout primitive pattern across list, form, and dashboard page types.

**Architecture:** A pure presentational `PageHeader` component using MUI theme tokens (no hardcoded colors) with a strict max-2-action API. The header is embedded in Toolbar sub-components for list pages (not in the page root) — those toolbar components get refactored. `CreateSalesOrderPage` has its header inline. `SalesPage` has its header inline. `CustomersPage` has its header inline.

**Tech Stack:** React 19, MUI v7, Vitest + React Testing Library

---

## File Map

| Action | File | What changes |
|--------|------|--------------|
| Create | `frontend/src/components/common/PageHeader.tsx` | New shared component |
| Create | `frontend/src/components/common/__tests__/PageHeader.test.tsx` | Unit tests |
| Modify | `frontend/src/pages/sales/components/OrdersToolbar.tsx` | Replace inline header block with `<PageHeader>` |
| Modify | `frontend/src/pages/sales/components/InvoicesToolbar.tsx` | Replace inline header block with `<PageHeader>` |
| Modify | `frontend/src/pages/sales/CustomersPage.tsx` | Replace inline header block with `<PageHeader>` |
| Modify | `frontend/src/pages/sales/CreateSalesOrderPage.tsx` | Replace inline header block with `<PageHeader showDivider={false}>` |
| Modify | `frontend/src/pages/sales/SalesPage.tsx` | Replace inline header block with `<PageHeader>` (no actions — period selector stays in toolbar) |

> **Note on `PaymentsPage`:** PaymentsPage header is in `PaymentsPage.tsx` inline — assess during implementation and include if it follows the standard shell. Skip if the header contains non-standard elements (e.g. inline period selectors that belong to the header area).

---

## Task 1: Create `PageHeader` component (TDD)

**Files:**
- Create: `frontend/src/components/common/__tests__/PageHeader.test.tsx`
- Create: `frontend/src/components/common/PageHeader.tsx`

### Step 1.1: Write the failing tests

- [ ] Create `frontend/src/components/common/__tests__/PageHeader.test.tsx` with all 16 test cases:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeProvider, createTheme } from '@mui/material'
import { describe, it, expect, vi } from 'vitest'
import PageHeader from '../PageHeader'

const theme = createTheme()

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>)
}

describe('PageHeader', () => {
  it('renders title', () => {
    renderWithTheme(<PageHeader title="Sales Orders" />)
    expect(screen.getByText('Sales Orders')).toBeInTheDocument()
  })

  it('renders subtitle when provided', () => {
    renderWithTheme(<PageHeader title="Sales Orders" subtitle="Manage your orders" />)
    expect(screen.getByText('Manage your orders')).toBeInTheDocument()
  })

  it('does not render subtitle when omitted', () => {
    renderWithTheme(<PageHeader title="Sales Orders" />)
    expect(screen.queryByText(/manage/i)).not.toBeInTheDocument()
  })

  it('renders primary action button when provided', () => {
    renderWithTheme(<PageHeader title="T" primaryAction={{ label: 'Create Order', onClick: vi.fn() }} />)
    expect(screen.getByRole('button', { name: 'Create Order' })).toBeInTheDocument()
  })

  it('renders secondary action button when provided', () => {
    renderWithTheme(<PageHeader title="T" secondaryAction={{ label: 'View Deleted', onClick: vi.fn() }} />)
    expect(screen.getByRole('button', { name: 'View Deleted' })).toBeInTheDocument()
  })

  it('calls onClick when primary button is clicked', () => {
    const onClick = vi.fn()
    renderWithTheme(<PageHeader title="T" primaryAction={{ label: 'Create Order', onClick }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Create Order' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('calls onClick when secondary button is clicked', () => {
    const onClick = vi.fn()
    renderWithTheme(<PageHeader title="T" secondaryAction={{ label: 'View Deleted', onClick }} />)
    fireEvent.click(screen.getByRole('button', { name: 'View Deleted' }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('renders disabled primary button correctly', () => {
    renderWithTheme(<PageHeader title="T" primaryAction={{ label: 'Create Order', onClick: vi.fn(), disabled: true }} />)
    expect(screen.getByRole('button', { name: 'Create Order' })).toBeDisabled()
  })

  it('renders disabled secondary button correctly', () => {
    renderWithTheme(<PageHeader title="T" secondaryAction={{ label: 'View Deleted', onClick: vi.fn(), disabled: true }} />)
    expect(screen.getByRole('button', { name: 'View Deleted' })).toBeDisabled()
  })

  it('does not render actions box when neither action is provided', () => {
    renderWithTheme(<PageHeader title="Sales Orders" />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('renders only primary button when only primaryAction is provided', () => {
    renderWithTheme(<PageHeader title="T" primaryAction={{ label: 'Create Order', onClick: vi.fn() }} />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Create Order' })).toBeInTheDocument()
  })

  it('renders only secondary button when only secondaryAction is provided', () => {
    renderWithTheme(<PageHeader title="T" secondaryAction={{ label: 'View Deleted', onClick: vi.fn() }} />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'View Deleted' })).toBeInTheDocument()
  })

  it('does not crash when button onClick is omitted', () => {
    renderWithTheme(<PageHeader title="T" primaryAction={{ label: 'Create Order' }} />)
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Create Order' }))).not.toThrow()
  })

  it('shows divider by default', () => {
    renderWithTheme(<PageHeader title="Sales Orders" />)
    expect(screen.getByTestId('page-header-divider')).toBeInTheDocument()
  })

  it('hides divider when showDivider is false', () => {
    renderWithTheme(<PageHeader title="Create Sales Order" showDivider={false} />)
    expect(screen.queryByTestId('page-header-divider')).not.toBeInTheDocument()
  })

  it('renders children when provided', () => {
    renderWithTheme(
      <PageHeader title="T">
        <span>extra content</span>
      </PageHeader>
    )
    expect(screen.getByText('extra content')).toBeInTheDocument()
  })
})
```

### Step 1.2: Run tests to verify they fail

- [ ] Run: `cd frontend && npx vitest run src/components/common/__tests__/PageHeader.test.tsx --no-coverage`
- [ ] Expected: FAIL — "Cannot find module '../PageHeader'"

### Step 1.3: Implement `PageHeader`

- [ ] Create `frontend/src/components/common/PageHeader.tsx`:

```tsx
import { Box, Button, Typography, useTheme } from '@mui/material'

type PageHeaderAction = {
  label: string
  onClick?: () => void
  disabled?: boolean
}

type PageHeaderProps = {
  title: string
  subtitle?: string
  primaryAction?: PageHeaderAction
  secondaryAction?: PageHeaderAction
  showDivider?: boolean
  children?: React.ReactNode
}

export default function PageHeader({
  title,
  subtitle,
  primaryAction,
  secondaryAction,
  showDivider = true,
  children,
}: PageHeaderProps) {
  const theme = useTheme()
  const hasActions = primaryAction != null || secondaryAction != null

  return (
    <Box
      data-testid={showDivider ? 'page-header-divider' : undefined}
      sx={{
        mb: 3,
        pb: 2,
        ...(showDivider && {
          borderBottom: `1px solid ${theme.palette.divider}`,
        }),
      }}
    >
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 2,
          [theme.breakpoints.down('sm')]: {
            flexDirection: 'column',
            alignItems: 'flex-start',
          },
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="h5"
            sx={{ fontWeight: 600, color: 'text.primary', lineHeight: 1.2 }}
          >
            {title}
          </Typography>
          {subtitle && (
            <Typography
              variant="body2"
              sx={{ mt: 0.5, color: 'text.secondary' }}
            >
              {subtitle}
            </Typography>
          )}
        </Box>

        {hasActions && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              flexShrink: 0,
              [theme.breakpoints.down('sm')]: {
                alignSelf: 'flex-start',
              },
            }}
          >
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
          </Box>
        )}
      </Box>

      {children && <Box sx={{ mt: 1 }}>{children}</Box>}
    </Box>
  )
}
```

### Step 1.4: Run tests to verify they pass

- [ ] Run: `cd frontend && npx vitest run src/components/common/__tests__/PageHeader.test.tsx --no-coverage`
- [ ] Expected: All 16 tests PASS

### Step 1.5: Commit

- [ ] Run:
```bash
git add frontend/src/components/common/PageHeader.tsx frontend/src/components/common/__tests__/PageHeader.test.tsx
git commit -m "feat(ui): add shared PageHeader component with tests"
```

---

## Task 2: Refactor `OrdersToolbar` to use `PageHeader`

**Files:**
- Modify: `frontend/src/pages/sales/components/OrdersToolbar.tsx`

The header block lives at lines ~76–144 in `OrdersToolbar`. It renders title ("Sales Orders"), subtitle with order count, and two buttons (View Deleted / Create Order). Replace this block with `<PageHeader>`.

### Step 2.1: Open and read `OrdersToolbar.tsx`

- [ ] Read `frontend/src/pages/sales/components/OrdersToolbar.tsx` lines 74–145 to locate the exact header block before editing.

### Step 2.2: Replace the header block

- [ ] In `OrdersToolbar.tsx`:
  1. Add import at top: `import PageHeader from '@/components/common/PageHeader'`
  2. Remove the imports no longer needed from this block: `RestoreIcon` (if only used in header), the `Typography` import (if not used elsewhere in the file — check first), the outer header `Box` sx block
  3. Replace the entire header `Box` (lines ~76–144) with:

```tsx
<PageHeader
  title="Sales Orders"
  subtitle={`Manage your sales orders and track delivery status (${ordersCount} total)`}
  secondaryAction={{ label: 'View Deleted', onClick: onOpenDeleted }}
  primaryAction={{ label: 'Create Order', onClick: onCreateOrder }}
/>
```

> **Note:** The existing header has a `RestoreIcon` inside the `Typography` title — remove the icon from the title. The `PageHeader` spec does not include icons in the title. The icon on the "View Deleted" button is also removed — the spec uses label-only buttons.

> **Note:** The `isMobile` responsive behavior is now handled inside `PageHeader` — remove any mobile-conditional logic from the header block. Leave `isMobile` in the toolbar if still used by the filter bar below.

### Step 2.3: Run the existing tests

- [ ] Run: `cd frontend && npx vitest run src/pages/sales --no-coverage`
- [ ] Expected: All existing Sales tests PASS (no new failures introduced)

### Step 2.4: Commit

- [ ] Run:
```bash
git add frontend/src/pages/sales/components/OrdersToolbar.tsx
git commit -m "refactor(sales): use PageHeader in OrdersToolbar"
```

---

## Task 3: Refactor `InvoicesToolbar` to use `PageHeader`

**Files:**
- Modify: `frontend/src/pages/sales/components/InvoicesToolbar.tsx`

Same pattern as `OrdersToolbar`. The header block is at lines ~59–117.

### Step 3.1: Open and read `InvoicesToolbar.tsx`

- [ ] Read `frontend/src/pages/sales/components/InvoicesToolbar.tsx` lines 1–120 to confirm the header block structure and identify the title, subtitle, and action labels.

### Step 3.2: Replace the header block

- [ ] In `InvoicesToolbar.tsx`:
  1. Add import: `import PageHeader from '@/components/common/PageHeader'`
  2. Replace the header `Box` with a `<PageHeader>` call matching the existing title, subtitle, and button actions
  3. Remove the icon from the title, remove `isMobile` from the header (keep it in the filter bar section if still needed)
  4. Clean up unused imports (`Typography`, header-specific icons) if no longer used

### Step 3.3: Run tests

- [ ] Run: `cd frontend && npx vitest run src/pages/sales --no-coverage`
- [ ] Expected: All PASS

### Step 3.4: Commit

- [ ] Run:
```bash
git add frontend/src/pages/sales/components/InvoicesToolbar.tsx
git commit -m "refactor(sales): use PageHeader in InvoicesToolbar"
```

---

## Task 4: Refactor `CustomersPage` header to use `PageHeader`

**Files:**
- Modify: `frontend/src/pages/sales/CustomersPage.tsx`

The header is inline in `CustomersPage.tsx` at lines ~394–455 (inside the return JSX). It renders title, subtitle, and two buttons (View Deleted / New Customer).

### Step 4.1: Open and read `CustomersPage.tsx`

- [ ] Read `frontend/src/pages/sales/CustomersPage.tsx` lines 390–460 to locate the exact header block.

### Step 4.2: Replace the header block

- [ ] In `CustomersPage.tsx`:
  1. Add import: `import PageHeader from '@/components/common/PageHeader'`
  2. Replace the header block with:

```tsx
<PageHeader
  title="Customers"
  subtitle="Manage your customer accounts"
  secondaryAction={{ label: 'View Deleted', onClick: handleOpenDeletedDialog }}
  primaryAction={{ label: 'New Customer', onClick: () => handleOpenForm() }}
/>
```

> Adjust the `onClick` handler references to match the actual function names in the file.

> Remove the icon from the title. Remove `isMobile`-conditional header logic.

### Step 4.3: Run tests

- [ ] Run: `cd frontend && npx vitest run src/pages/sales --no-coverage`
- [ ] Expected: All PASS

### Step 4.4: Commit

- [ ] Run:
```bash
git add frontend/src/pages/sales/CustomersPage.tsx
git commit -m "refactor(sales): use PageHeader in CustomersPage"
```

---

## Task 5: Refactor `CreateSalesOrderPage` header to use `PageHeader`

**Files:**
- Modify: `frontend/src/pages/sales/CreateSalesOrderPage.tsx`

The header is at lines ~421–428: an `IconButton` back-arrow + `Typography` title, inside `<Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>`. This is a form page — use `showDivider={false}`.

### Step 5.1: Open and read `CreateSalesOrderPage.tsx`

- [ ] Read `frontend/src/pages/sales/CreateSalesOrderPage.tsx` lines 415–435 to confirm the header block.

### Step 5.2: Replace the header block

- [ ] In `CreateSalesOrderPage.tsx`:
  1. Add import: `import PageHeader from '@/components/common/PageHeader'`
  2. Replace the header block with:

```tsx
<PageHeader
  title={isEditMode ? 'Edit Sales Order' : 'Create Sales Order'}
  showDivider={false}
/>
```

> The back-arrow `IconButton` is NOT part of the `PageHeader` spec. Keep it. Use this exact structure — remove the existing header `Box` and replace it with two siblings inside the `<Box sx={{ py: 3 }}>` container:
>
> ```tsx
> <IconButton onClick={() => navigate('/sales/orders')} sx={{ mr: 2, mb: 1 }}>
>   <ArrowBackIcon />
> </IconButton>
> <PageHeader
>   title={isEditMode ? 'Edit Sales Order' : 'Create Sales Order'}
>   showDivider={false}
> />
> ```
>
> Do not keep the back-arrow and title in the same flex row — they are separate elements after this refactor.

### Step 5.3: Run tests

- [ ] Run: `cd frontend && npx vitest run src/pages/sales/__tests__/CreateSalesOrderPage.test.tsx --no-coverage`
- [ ] Expected: All PASS

### Step 5.4: Commit

- [ ] Run:
```bash
git add frontend/src/pages/sales/CreateSalesOrderPage.tsx
git commit -m "refactor(sales): use PageHeader in CreateSalesOrderPage"
```

---

## Task 6: Refactor `SalesPage` header to use `PageHeader`

**Files:**
- Modify: `frontend/src/pages/sales/SalesPage.tsx`

The header is at lines ~328–368. It has title, subtitle, and a mix of a `<FormControl>` period selector + a single `<Button>` in the right side — not a standard max-2-action header. The period selector belongs in the page body (or a separate toolbar area), not the page header.

### Step 6.1: Open and read `SalesPage.tsx`

- [ ] Read `frontend/src/pages/sales/SalesPage.tsx` lines 325–375 to confirm the exact header structure.

### Step 6.2: Assess and replace

- [ ] The right-side currently has `[Period selector] [Create Order button]`. Under the max-2 spec:
  - The period selector is a filter control — move it below the header (e.g. as a standalone `FormControl` row or inline with the stats grid)
  - The `Create Order` button becomes the `primaryAction`
  - No `secondaryAction` — this is a dashboard page

- [ ] Replace the header block with:

```tsx
<PageHeader
  title="Sales Overview"
  subtitle="Monitor sales performance and manage customer relationships"
  primaryAction={{ label: 'Create Order', onClick: () => navigate('/sales/orders') }}
/>
```

- [ ] Move the `<FormControl>` period selector to just below the `<PageHeader>`, before the stats grid. Wrap it in a `<Box sx={{ mb: 3 }}>` if needed to maintain spacing.
- [ ] Verify the `navigate('/sales/orders')` target is correct by checking the router config at `frontend/src/App.tsx` or `frontend/src/router.tsx` — confirm the Sales Orders route path before hardcoding it.

### Step 6.3: Run tests

- [ ] Run: `cd frontend && npx vitest run src/pages/sales --no-coverage`
- [ ] Expected: All PASS

### Step 6.4: Commit

- [ ] Run:
```bash
git add frontend/src/pages/sales/SalesPage.tsx
git commit -m "refactor(sales): use PageHeader in SalesPage, move period selector below header"
```

---

## Task 7: Assess and refactor `PaymentsPage` (conditional)

**Files:**
- Modify (if applicable): `frontend/src/pages/sales/PaymentsPage.tsx`

### Step 7.1: Read PaymentsPage header

- [ ] Read `frontend/src/pages/sales/PaymentsPage.tsx` lines 530–590 to evaluate the header structure.
- [ ] If it follows the standard shell (title + subtitle + max 2 buttons, no non-standard controls in the header row), proceed with refactor.
- [ ] If the header contains inline filter controls or other non-standard elements, skip this page — note it as a Phase 2 candidate.

### Step 7.2: Replace header if applicable

- [ ] If proceeding: add import, replace header block with `<PageHeader>`, preserve subtitle and action handlers, remove icon from title.

### Step 7.3: Run tests

- [ ] Run: `cd frontend && npx vitest run src/pages/sales --no-coverage`
- [ ] Expected: All PASS

### Step 7.4: Commit (if changes made)

- [ ] Run:
```bash
git add frontend/src/pages/sales/PaymentsPage.tsx
git commit -m "refactor(sales): use PageHeader in PaymentsPage"
```

---

## Task 8: Run full frontend test suite

- [ ] Run: `cd frontend && npm run test`
- [ ] Expected: All tests PASS, no regressions
- [ ] If any tests fail, fix them before continuing — do not proceed with failures outstanding

---

## Task 9: TypeScript check

- [ ] Run: `cd frontend && npm run type-check`
- [ ] Expected: No type errors
- [ ] Fix any type errors before continuing

---

## Manual QA Checklist

After implementation, verify the following in the browser (`npm run dev` or Docker):

- [ ] Sales Orders list page — 2 actions (View Deleted + Create Order), title + subtitle
- [ ] Invoices list page — verify title, subtitle, actions
- [ ] Customers list page — title, subtitle, 2 actions
- [ ] Create Sales Order form page — title only, no divider, back button still present
- [ ] Sales Overview dashboard — title, subtitle, 1 primary action, period selector below header
- [ ] Any page with no actions — left content block fills row naturally
- [ ] Long subtitle on any page — wraps cleanly without pushing actions
- [ ] Narrow viewport (< 600px) — actions stack below title block

---

## Definition of Done

- [ ] `PageHeader` component created with all 16 tests passing
- [ ] All 5–6 Sales pilot pages refactored
- [ ] All existing Sales page tests pass unchanged
- [ ] TypeScript check passes
- [ ] Manual QA checklist complete
