# Customers Page Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the Customers page and its components to match the modernized UI patterns of the Sales Orders page, resolving all 6 inconsistencies from issue #305.

**Architecture:** Six targeted file changes plus one new file — each component is updated independently. No backend changes. Tests are updated in place in two existing test files.

**Tech Stack:** React 19, TypeScript, Material-UI v7, Vitest, RTK Query

**Spec:** `docs/superpowers/specs/2026-04-07-customers-page-modernization-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/pages/sales/components/CustomerList.tsx` | Modify | Rewrite as Paper+Table list matching OrdersTable |
| `frontend/src/pages/sales/components/CustomerContextHeader.tsx` | Modify | Rewrite as Paper with title bar + detail rows |
| `frontend/src/pages/sales/components/CustomerWorkspaceCard.tsx` | Modify | Change outer Box → Paper |
| `frontend/src/pages/sales/components/CustomersDialogs.tsx` | Create | Centralized dialog component |
| `frontend/src/pages/sales/hooks/useCustomersPageState.ts` | Modify | Add shouldPreserveSearchFocus |
| `frontend/src/pages/sales/CustomersPage.tsx` | Modify | Sort state, focus management, wire new components |
| `frontend/src/pages/sales/__tests__/CustomersPage.filter.test.tsx` | Modify | Update mock for new pageState shape |
| `frontend/src/pages/sales/__tests__/CustomersPage.filterbar.test.tsx` | Modify | Update mock for new pageState shape |

---

## Task 1: Rewrite CustomerList as a Paper+Table component

**Files:**
- Modify: `frontend/src/pages/sales/components/CustomerList.tsx`

- [ ] **Step 1: Replace the entire file content**

```tsx
import React, { memo } from 'react'
import {
  Box,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { Customer } from '@/types'

interface CustomerRowProps {
  customer: Customer
  index: number
  selectedCustomerId: string | undefined
  focusedIndex: number
  onSelect: (customer: Customer) => void
}

const CustomerRow = memo(({ customer, index, selectedCustomerId, focusedIndex, onSelect }: CustomerRowProps) => {
  const isSelected = selectedCustomerId === customer.id
  const isFocused = index === focusedIndex

  return (
    <TableRow
      hover
      onClick={() => onSelect(customer)}
      data-customer-index={index}
      sx={{
        cursor: 'pointer',
        backgroundColor: isSelected ? 'action.selected' : isFocused ? 'action.focus' : 'inherit',
        '&:hover': {
          backgroundColor: isSelected ? 'action.selected' : 'action.hover',
        },
        transition: 'background-color 0.2s ease',
        height: TABLE_STYLES.row.height,
        ...(isFocused && {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: '-2px',
        }),
      }}
    >
      <TableCell>
        <Typography
          variant="body2"
          sx={{
            fontWeight: 400,
            fontSize: '0.8rem',
            lineHeight: 1.2,
          }}
        >
          {customer.name}
        </Typography>
      </TableCell>
    </TableRow>
  )
})

CustomerRow.displayName = 'CustomerRow'

interface CustomerListProps {
  customers: Customer[]
  loading: boolean
  total: number
  selectedCustomerId: string | undefined
  focusedIndex: number
  onSelect: (customer: Customer) => void
  customerListRef: React.RefObject<HTMLDivElement | null>
}

const CustomerList: React.FC<CustomerListProps> = ({
  customers,
  loading,
  total,
  selectedCustomerId,
  focusedIndex,
  onSelect,
  customerListRef,
}) => {
  return (
    <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography
            variant="tableHeader"
            sx={{
              fontWeight: 600,
              fontSize: '0.8rem',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Customers ({total})
          </Typography>
          {loading && customers.length > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Searching...
              </Typography>
              <Box sx={{ width: 16, height: 16 }}>
                <Skeleton variant="circular" width={16} height={16} />
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} ref={customerListRef}>
        <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
          <Table
            size={TABLE_STYLES.size}
            sx={{
              '& .MuiTableCell-root': {
                borderBottom: TABLE_STYLES.cell.border,
                py: TABLE_STYLES.cell.padding.py * 0.75,
                px: TABLE_STYLES.cell.padding.px * 0.75,
              },
            }}
          >
            <TableBody>
              {loading && customers.length === 0
                ? [...Array(10)].map((_, index) => (
                    <TableRow key={`skeleton-${index}`}>
                      <TableCell>
                        <Skeleton height={40} />
                      </TableCell>
                    </TableRow>
                  ))
                : customers.length === 0
                  ? (
                      <TableRow>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                            No customers found
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )
                  : customers.map((customer, index) => (
                      <CustomerRow
                        key={customer.id}
                        customer={customer}
                        index={index}
                        selectedCustomerId={selectedCustomerId}
                        focusedIndex={focusedIndex}
                        onSelect={onSelect}
                      />
                    ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Paper>
  )
}

export default CustomerList
```

- [ ] **Step 2: Update CustomersPage to pass new props**

In `frontend/src/pages/sales/CustomersPage.tsx`, find the `<CustomerList ... />` usage and update the props:

Old:
```tsx
<CustomerList
  customers={customers}
  loading={loading}
  selectedCustomerId={selectedCustomer?.id}
  focusedIndex={pageState.focusedCustomerIndex}
  onSelect={selection.handleCustomerSelect}
  listRef={pageState.customerListRef}
/>
```

New:
```tsx
<CustomerList
  customers={customers}
  loading={loading}
  total={customers.length}
  selectedCustomerId={selectedCustomer?.id}
  focusedIndex={pageState.focusedCustomerIndex}
  onSelect={selection.handleCustomerSelect}
  customerListRef={pageState.customerListRef}
/>
```

- [ ] **Step 3: Run the TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "CustomerList\|customerList\|customer-list" | head -20
```

Expected: no errors related to CustomerList.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/pages/sales/components/CustomerList.tsx src/pages/sales/CustomersPage.tsx
git commit -m "feat(sales): modernize CustomerList to Paper+Table style matching OrdersTable"
```

---

## Task 2: Rewrite CustomerContextHeader as Paper with detail rows

**Files:**
- Modify: `frontend/src/pages/sales/components/CustomerContextHeader.tsx`

- [ ] **Step 1: Replace the entire file content**

```tsx
import React from 'react'
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
} from '@mui/icons-material'
import {
  Box,
  Chip,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { Customer } from '@/types'
import { CustomerType } from '@/types'

interface CustomerContextHeaderProps {
  selectedCustomer: Customer | null
  onEdit: () => void
  onDelete: () => void
}

const actionIconSx = {
  height: `${TABLE_STYLES.row.height * 0.75}px`,
  width: `${TABLE_STYLES.row.height * 0.75}px`,
  minHeight: 20,
  minWidth: 20,
  p: 0.125,
}

const detailTableSx = {
  tableLayout: 'fixed',
  '& .MuiTableCell-root': {
    border: 'none',
    py: TABLE_STYLES.cell.padding.py,
    px: TABLE_STYLES.cell.padding.px,
    '&:nth-of-type(1)': { width: '40%' },
    '&:nth-of-type(2)': { width: '60%' },
  },
}

const labelCellSx = {
  fontWeight: 600,
  color: 'text.secondary',
  fontSize: '0.8rem',
}

const valueCellSx = {
  fontSize: '0.8rem',
}

const CustomerContextHeader: React.FC<CustomerContextHeaderProps> = ({
  selectedCustomer,
  onEdit,
  onDelete,
}) => {
  if (!selectedCustomer) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" color="text.secondary">
          Select a customer to view details
        </Typography>
      </Paper>
    )
  }

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <Box
        sx={{
          p: TABLE_STYLES.cell.padding.px,
          borderBottom: TABLE_STYLES.cell.border,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Typography
          variant="tableHeader"
          sx={{
            fontWeight: 600,
            fontSize: '0.8rem',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Customer - {selectedCustomer.name}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <IconButton size="small" title="Edit Customer" onClick={onEdit} sx={{ ...actionIconSx, color: 'primary.main' }}>
            <EditIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
          <IconButton size="small" title="Delete Customer" onClick={onDelete} sx={{ ...actionIconSx, color: 'error.main' }}>
            <DeleteIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
        </Box>
      </Box>

      <Box sx={{ p: TABLE_STYLES.cell.padding.px }}>
        <TableContainer>
          <Table size={TABLE_STYLES.size} sx={detailTableSx}>
            <TableBody>
              <TableRow>
                <TableCell colSpan={2} sx={{ pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                    Customer Information
                  </Typography>
                </TableCell>
              </TableRow>
              <TableRow sx={{ backgroundColor: 'grey.50' }}>
                <TableCell sx={labelCellSx}>Type</TableCell>
                <TableCell sx={valueCellSx}>
                  <Chip
                    label={selectedCustomer.type === CustomerType.BUSINESS ? 'Business' : 'Individual'}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: '0.75rem' }}
                  />
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={labelCellSx}>Status</TableCell>
                <TableCell sx={valueCellSx}>
                  <Chip
                    label={selectedCustomer.isActive ? 'Active' : 'Inactive'}
                    size="small"
                    color={selectedCustomer.isActive ? 'success' : 'default'}
                    sx={{ fontSize: '0.75rem' }}
                  />
                </TableCell>
              </TableRow>
              <TableRow sx={{ backgroundColor: 'grey.50' }}>
                <TableCell sx={labelCellSx}>Phone</TableCell>
                <TableCell sx={valueCellSx}>{selectedCustomer.phone || '—'}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={labelCellSx}>Email</TableCell>
                <TableCell sx={valueCellSx}>{selectedCustomer.email || '—'}</TableCell>
              </TableRow>
              <TableRow sx={{ backgroundColor: 'grey.50' }}>
                <TableCell sx={labelCellSx}>Price List</TableCell>
                <TableCell sx={valueCellSx}>
                  {selectedCustomer.priceList
                    ? <Chip label={selectedCustomer.priceList.name} size="small" sx={{ fontSize: '0.75rem' }} />
                    : '—'}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Paper>
  )
}

export default CustomerContextHeader
```

- [ ] **Step 2: Update CustomersPage to pass onEdit prop**

In `frontend/src/pages/sales/CustomersPage.tsx`, find the `<CustomerContextHeader ... />` usage and add `onEdit`:

Old:
```tsx
<CustomerContextHeader
  selectedCustomer={selectedCustomer}
  onDelete={() => pageState.setDeleteConfirmOpen(true)}
/>
```

New:
```tsx
<CustomerContextHeader
  selectedCustomer={selectedCustomer}
  onEdit={() => navigate(`/sales/customers/${selectedCustomer!.id}/edit`)}
  onDelete={() => pageState.setDeleteConfirmOpen(true)}
/>
```

- [ ] **Step 3: Add email to the Customer type**

`email` is not currently on the `Customer` interface. Open `frontend/src/types/index.ts` and find the `Customer` interface (around line 158). Add `email?: string` after `phone?: string`:

```ts
export interface Customer {
  id: string;
  type: CustomerType;
  name: string;
  phone?: string;
  email?: string;   // add this line
  // Address Information
  ...
```

- [ ] **Step 4: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "CustomerContextHeader\|customerContext" | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/sales/components/CustomerContextHeader.tsx frontend/src/pages/sales/CustomersPage.tsx
git commit -m "feat(sales): modernize CustomerContextHeader to Paper with title bar and detail rows"
```

---

## Task 3: Fix CustomerWorkspaceCard outer wrapper

**Files:**
- Modify: `frontend/src/pages/sales/components/CustomerWorkspaceCard.tsx`

- [ ] **Step 1: Change outer wrapper from Box to Paper**

Find the empty state return (around line 153):

Old:
```tsx
if (!selectedCustomer) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 2, color: 'text.secondary' }}>
      <CustomersIcon sx={{ fontSize: 64, opacity: 0.3 }} />
      <Typography variant="h6" color="text.secondary">
        Select a customer to view details
      </Typography>
    </Box>
  )
}
```

New:
```tsx
if (!selectedCustomer) {
  return <Paper sx={{ flex: 1 }} />
}
```

- [ ] **Step 2: Change the main return outer wrapper**

Find the main return (around line 209):

Old:
```tsx
return (
  <Box sx={{ overflow: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
```

New:
```tsx
return (
  <Paper sx={{ overflow: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 2, p: 2 }}>
```

And change the closing `</Box>` at the end to `</Paper>`.

Also remove the now-redundant `<Paper sx={{ p: 2 }}>` wrapper that wraps the contact info stack (the first child inside the outer container), since the outer `Paper` now provides padding. That inner block currently looks like:

```tsx
<Paper sx={{ p: 2 }}>
  <Stack spacing={0.5}>
    ...
  </Stack>
</Paper>
```

Replace it with just:
```tsx
<Stack spacing={0.5}>
  ...
</Stack>
```

- [ ] **Step 3: Remove unused Box import if no longer used**

Check if `Box` is still used elsewhere in the file (it is — in `TabPanel` and other places). Keep the import.

Remove `CustomersIcon` import if the empty state no longer uses it:

Old import line (around line 25):
```tsx
import {
  AccountBalance as InvoiceIcon,
  LocationOn as LocationIcon,
  People as CustomersIcon,
  Phone as PhoneIcon,
  ShoppingCart as OrdersIcon,
  Star as StarIcon,
  TrendingUp as SalesIcon,
} from '@mui/icons-material'
```

New (remove `People as CustomersIcon`):
```tsx
import {
  AccountBalance as InvoiceIcon,
  LocationOn as LocationIcon,
  Phone as PhoneIcon,
  ShoppingCart as OrdersIcon,
  Star as StarIcon,
  TrendingUp as SalesIcon,
} from '@mui/icons-material'
```

- [ ] **Step 4: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "CustomerWorkspaceCard\|customerWorkspace" | head -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/sales/components/CustomerWorkspaceCard.tsx
git commit -m "feat(sales): change CustomerWorkspaceCard outer wrapper from Box to Paper"
```

---

## Task 4: Create CustomersDialogs component

**Files:**
- Create: `frontend/src/pages/sales/components/CustomersDialogs.tsx`
- Modify: `frontend/src/pages/sales/CustomersPage.tsx`

- [ ] **Step 1: Create the new file**

```tsx
import React from 'react'

import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import DeletedCustomersDialog from '@/components/sales/DeletedCustomersDialog'
import type { Customer } from '@/types'

interface CustomersDialogsProps {
  selectedCustomer: Customer | null
  deleteConfirmOpen: boolean
  onConfirmDelete: () => Promise<void> | void
  onCancelDelete: () => void
  deletedCustomersDialogOpen: boolean
  onCloseDeletedCustomersDialog: () => void
}

const CustomersDialogs: React.FC<CustomersDialogsProps> = ({
  selectedCustomer,
  deleteConfirmOpen,
  onConfirmDelete,
  onCancelDelete,
  deletedCustomersDialogOpen,
  onCloseDeletedCustomersDialog,
}) => {
  return (
    <>
      <ConfirmationDialog
        open={deleteConfirmOpen}
        title="Confirm Delete"
        message={`Are you sure you want to delete "${selectedCustomer?.name}"? This will move it to deleted items.`}
        confirmText="Delete Customer"
        cancelText="Cancel"
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
        severity="warning"
      />

      <DeletedCustomersDialog
        open={deletedCustomersDialogOpen}
        onClose={onCloseDeletedCustomersDialog}
      />
    </>
  )
}

export default CustomersDialogs
```

- [ ] **Step 2: Update CustomersPage to use CustomersDialogs**

In `frontend/src/pages/sales/CustomersPage.tsx`:

Add the import after the existing component imports:
```tsx
import CustomersDialogs from './components/CustomersDialogs'
```

Remove these two imports (they move into `CustomersDialogs`):
```tsx
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import DeletedCustomersDialog from '@/components/sales/DeletedCustomersDialog'
```

Replace the two inline dialog JSX blocks at the bottom of the return:

Old:
```tsx
      <ConfirmationDialog
        open={pageState.deleteConfirmOpen}
        title="Confirm Delete"
        message={`Are you sure you want to delete "${selectedCustomer?.name}"? This will move it to deleted items.`}
        confirmText="Delete Customer"
        cancelText="Cancel"
        onConfirm={actions.handleDelete}
        onCancel={actions.handleCancelDelete}
        severity="warning"
      />

      <DeletedCustomersDialog
        open={pageState.deletedCustomersDialogOpen}
        onClose={() => pageState.setDeletedCustomersDialogOpen(false)}
      />
```

New:
```tsx
      <CustomersDialogs
        selectedCustomer={selectedCustomer}
        deleteConfirmOpen={pageState.deleteConfirmOpen}
        onConfirmDelete={actions.handleDelete}
        onCancelDelete={actions.handleCancelDelete}
        deletedCustomersDialogOpen={pageState.deletedCustomersDialogOpen}
        onCloseDeletedCustomersDialog={() => pageState.setDeletedCustomersDialogOpen(false)}
      />
```

- [ ] **Step 3: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "CustomersDialogs\|customersDialogs" | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/sales/components/CustomersDialogs.tsx frontend/src/pages/sales/CustomersPage.tsx
git commit -m "feat(sales): extract inline dialogs into centralized CustomersDialogs component"
```

---

## Task 5: Add shouldPreserveSearchFocus to useCustomersPageState

**Files:**
- Modify: `frontend/src/pages/sales/hooks/useCustomersPageState.ts`

- [ ] **Step 1: Add the new state**

Replace the entire file:

```ts
import { useRef, useState } from 'react'

export function useCustomersPageState() {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletedCustomersDialogOpen, setDeletedCustomersDialogOpen] = useState(false)
  const [focusedCustomerIndex, setFocusedCustomerIndex] = useState(-1)
  const [shouldPreserveSearchFocus, setShouldPreserveSearchFocus] = useState(false)

  const customerListRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  return {
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    deletedCustomersDialogOpen,
    setDeletedCustomersDialogOpen,
    focusedCustomerIndex,
    setFocusedCustomerIndex,
    shouldPreserveSearchFocus,
    setShouldPreserveSearchFocus,
    customerListRef,
    searchInputRef,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/sales/hooks/useCustomersPageState.ts
git commit -m "feat(sales): add shouldPreserveSearchFocus to useCustomersPageState"
```

---

## Task 6: Add sort state, focus preservation, and FilterBar sort to CustomersPage

**Files:**
- Modify: `frontend/src/pages/sales/CustomersPage.tsx`

- [ ] **Step 1: Add sort state and handleSort**

After the existing `const pageState = useCustomersPageState()` line, add:

```tsx
const [sortBy, setSortBy] = useState('name')
const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
```

After the `useFilterBar` call, add `handleSort`:

```tsx
const handleSort = useCallback((field: string) => {
  setSortOrder((prev) => (sortBy === field && prev === 'desc' ? 'asc' : 'desc'))
  setSortBy(field)
}, [sortBy])
```

Add `useCallback` to the import from `react` if not already present.

- [ ] **Step 2: Add focus preservation useEffect**

After the `handleSort` definition, add:

```tsx
useEffect(() => {
  if (pageState.shouldPreserveSearchFocus && pageState.searchInputRef.current && document.activeElement !== pageState.searchInputRef.current) {
    const timer = setTimeout(() => {
      pageState.searchInputRef.current?.focus()
      pageState.setShouldPreserveSearchFocus(false)
    }, 0)
    return () => clearTimeout(timer)
  }
  if (pageState.shouldPreserveSearchFocus) {
    pageState.setShouldPreserveSearchFocus(false)
  }
}, [loading, pageState])
```

Add `useEffect` to the import from `react` if not already present.

- [ ] **Step 3: Wrap handlers.onSearchChange to preserve focus**

After the `useFilterBar` destructuring, add:

```tsx
const filterHandlers = useMemo(() => ({
  ...handlers,
  onSearchChange: (value: string) => {
    pageState.setShouldPreserveSearchFocus(true)
    handlers.onSearchChange(value)
  },
}), [handlers, pageState])
```

Add `useMemo` to the import from `react` if not already present.

- [ ] **Step 4: Update customerQueryParams to use sort state**

Old:
```tsx
const customerQueryParams = useMemo(
  () => ({
    search: appliedFilters.search || undefined,
    isActive:
      appliedFilters.status === 'active'
        ? true
        : appliedFilters.status === 'inactive'
          ? false
          : undefined,
    sortBy: 'name',
    sortOrder: 'ASC' as const,
  }),
  [appliedFilters],
)
```

New:
```tsx
const customerQueryParams = useMemo(
  () => ({
    search: appliedFilters.search || undefined,
    isActive:
      appliedFilters.status === 'active'
        ? true
        : appliedFilters.status === 'inactive'
          ? false
          : undefined,
    sortBy,
    sortOrder: sortOrder.toUpperCase() as 'ASC' | 'DESC',
  }),
  [appliedFilters, sortBy, sortOrder],
)
```

- [ ] **Step 5: Pass filterHandlers and sort prop to FilterBar**

Old:
```tsx
<FilterBar
  config={filterConfig}
  draftFilters={draftFilters}
  handlers={handlers}
  hasActiveFilters={hasActiveFilters}
  searchInputRef={pageState.searchInputRef}
/>
```

New:
```tsx
<FilterBar
  config={filterConfig}
  draftFilters={draftFilters}
  handlers={filterHandlers}
  hasActiveFilters={hasActiveFilters}
  searchInputRef={pageState.searchInputRef}
  sort={{ field: 'name', sortBy, sortOrder, onSort: handleSort }}
/>
```

- [ ] **Step 6: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "CustomersPage\|customersPage" | head -20
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/sales/CustomersPage.tsx
git commit -m "feat(sales): add sort state, search focus preservation, and FilterBar sort to CustomersPage"
```

---

## Task 7: Update test mocks for new pageState shape

**Files:**
- Modify: `frontend/src/pages/sales/__tests__/CustomersPage.filter.test.tsx`
- Modify: `frontend/src/pages/sales/__tests__/CustomersPage.filterbar.test.tsx`

- [ ] **Step 1: Update CustomersPage.filter.test.tsx mock**

Find the `useCustomersPageState` mock in `CustomersPage.filter.test.tsx` (around line 89):

Old:
```tsx
vi.mock('../hooks/useCustomersPageState', () => ({
  useCustomersPageState: () => ({
    deleteConfirmOpen: false,
    setDeleteConfirmOpen: vi.fn(),
    deletedCustomersDialogOpen: false,
    setDeletedCustomersDialogOpen: vi.fn(),
    focusedCustomerIndex: -1,
    setFocusedCustomerIndex: vi.fn(),
    customerListRef: { current: null },
    searchInputRef: { current: null },
  }),
}))
```

New:
```tsx
vi.mock('../hooks/useCustomersPageState', () => ({
  useCustomersPageState: () => ({
    deleteConfirmOpen: false,
    setDeleteConfirmOpen: vi.fn(),
    deletedCustomersDialogOpen: false,
    setDeletedCustomersDialogOpen: vi.fn(),
    focusedCustomerIndex: -1,
    setFocusedCustomerIndex: vi.fn(),
    shouldPreserveSearchFocus: false,
    setShouldPreserveSearchFocus: vi.fn(),
    customerListRef: { current: null },
    searchInputRef: { current: null },
  }),
}))
```

Also update the `CustomerList` mock to accept the `total` prop (prevents React unknown prop warning):

Old:
```tsx
vi.mock('../components/CustomerList', () => ({
  default: ({ customers, onSelect }: any) => (
    <div data-testid="customer-list">
      {customers.map((customer: any) => (
        <div key={customer.id} data-testid={`customer-item-${customer.id}`} onClick={() => onSelect(customer)}>
          {customer.name}
        </div>
      ))}
    </div>
  ),
}))
```

New (add `total` to destructured props):
```tsx
vi.mock('../components/CustomerList', () => ({
  default: ({ customers, onSelect, total: _total }: any) => (
    <div data-testid="customer-list">
      {customers.map((customer: any) => (
        <div key={customer.id} data-testid={`customer-item-${customer.id}`} onClick={() => onSelect(customer)}>
          {customer.name}
        </div>
      ))}
    </div>
  ),
}))
```

- [ ] **Step 2: Update CustomersPage.filterbar.test.tsx mock**

Apply the same two changes (same mock blocks, same fixes) to `CustomersPage.filterbar.test.tsx`.

- [ ] **Step 3: Run the targeted tests**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/CustomersPage.filter.test.tsx src/pages/sales/__tests__/CustomersPage.filterbar.test.tsx
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/sales/__tests__/CustomersPage.filter.test.tsx frontend/src/pages/sales/__tests__/CustomersPage.filterbar.test.tsx
git commit -m "test(sales): update CustomersPage test mocks for shouldPreserveSearchFocus and total props"
```

---

## Task 8: Final type-check and test run

- [ ] **Step 1: Full TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: exit 0, no errors.

- [ ] **Step 2: Run all affected test files**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/CustomersPage.filter.test.tsx src/pages/sales/__tests__/CustomersPage.filterbar.test.tsx src/pages/sales/__tests__/CustomerFormPage.test.tsx
```

Expected: all tests pass.

- [ ] **Step 3: Lint**

```bash
cd frontend && npm run lint -- --max-warnings=0 src/pages/sales/CustomersPage.tsx src/pages/sales/components/CustomerList.tsx src/pages/sales/components/CustomerContextHeader.tsx src/pages/sales/components/CustomerWorkspaceCard.tsx src/pages/sales/components/CustomersDialogs.tsx src/pages/sales/hooks/useCustomersPageState.ts
```

Expected: no warnings or errors.
