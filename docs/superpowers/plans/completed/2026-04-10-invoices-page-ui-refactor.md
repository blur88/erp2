# Invoices Page UI Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Invoices page UI to match the modern Sales Orders page pattern — `PageHeader` + `FilterBar` + `MasterDetailWorkspace` + split context header / workspace card — while keeping all functionality identical.

**Architecture:** Replace the monolithic `InvoiceDetailsPanel` with two focused components (`InvoiceContextHeader` and `InvoiceWorkspaceCard`) mirroring the Orders page split. Slim `useInvoicesPageState` down to UI-only state by removing manual filter state (search/sort/date) and delegating those to `useFilterBar`. Wire `InvoicesPage` with `PageHeader`, `FilterBar`, and `MasterDetailWorkspace` exactly as `OrdersPage` does.

**Tech Stack:** React 19, MUI v7, RTK Query (`useGetInvoicesQuery`), `useFilterBar` hook, `MasterDetailWorkspace` component, `PageHeader` component, `getPeriodDateRange` utility.

**Spec:** `docs/superpowers/specs/2026-04-10-invoices-page-ui-refactor-design.md`
**Issue:** #327

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Modify | `frontend/src/pages/sales/hooks/useInvoicesPageState.ts` | Remove filter/sort state; keep UI-only state |
| Create | `frontend/src/pages/sales/components/InvoiceContextHeader.tsx` | Metadata panel + print button (replaces top of InvoiceDetailsPanel) |
| Create | `frontend/src/pages/sales/components/InvoiceWorkspaceCard.tsx` | Items table + notes (replaces bottom of InvoiceDetailsPanel) |
| Modify | `frontend/src/pages/sales/InvoicesPage.tsx` | Wire PageHeader, FilterBar, MasterDetailWorkspace |
| Modify | `frontend/src/pages/sales/components/InvoicesTable.tsx` | Add "Searching..." spinner |
| Delete | `frontend/src/pages/sales/components/InvoiceDetailsPanel.tsx` | Replaced by the two new components above |

---

## Task 1: Slim down `useInvoicesPageState`

Remove all filter/sort state from the hook. `useFilterBar` will own those in `InvoicesPage`.

**Files:**
- Modify: `frontend/src/pages/sales/hooks/useInvoicesPageState.ts`

- [ ] **Step 1: Replace the file contents**

Replace the entire file with:

```typescript
import { useRef, useState } from 'react'

import type { InvoiceItem } from '@/types'

export interface InvoiceListItem {
  id: string
  invoiceNumber: string
  customerName?: string
  orderNumber?: string
  invoiceDate?: string
  shippingAmount?: number
  totalAmount?: number
  paidAmount: number
  balanceDue?: number
  status: 'draft' | 'partial_paid' | 'paid'
  isOverdue?: boolean
  notes?: string
  customer?: {
    id: string
    name: string
    email?: string
    phone?: string
  }
  salesOrder?: {
    id: string
    orderNumber: string
  }
  total?: number
  issueDate?: Date | string
  dueAmount?: number
  items?: InvoiceItem[]
}

export interface InvoiceJournalEntryRef {
  referenceNumber: string
  sourceType: string
  sourceId: string
}

export function useInvoicesPageState() {
  const [createDialog, setCreateDialog] = useState(false)
  const [editDialog, setEditDialog] = useState(false)
  const [focusedInvoiceIndex, setFocusedInvoiceIndex] = useState(-1)
  const [shouldPreserveSearchFocus, setShouldPreserveSearchFocus] = useState(false)
  const [deletedInvoicesDialogOpen, setDeletedInvoicesDialogOpen] = useState(false)
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [journalEntryRef, setJournalEntryRef] = useState<InvoiceJournalEntryRef | null>(null)
  const [journalEntryRefLoading, setJournalEntryRefLoading] = useState(false)

  const searchInputRef = useRef<HTMLInputElement>(null)
  const invoiceListRef = useRef<HTMLDivElement>(null)
  const hasRestoredSelection = useRef(false)
  const previousPathnameRef = useRef(window.location.pathname)
  const selectedInvoiceRef = useRef<InvoiceListItem | null>(null)

  return {
    createDialog,
    setCreateDialog,
    editDialog,
    setEditDialog,
    focusedInvoiceIndex,
    setFocusedInvoiceIndex,
    shouldPreserveSearchFocus,
    setShouldPreserveSearchFocus,
    deletedInvoicesDialogOpen,
    setDeletedInvoicesDialogOpen,
    printDialogOpen,
    setPrintDialogOpen,
    journalEntryRef,
    setJournalEntryRef,
    journalEntryRefLoading,
    setJournalEntryRefLoading,
    searchInputRef,
    invoiceListRef,
    hasRestoredSelection,
    previousPathnameRef,
    selectedInvoiceRef,
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "useInvoicesPageState|InvoiceFilters" | head -30
```

Expected: errors referencing `filters`, `setFilters`, `InvoiceFilters` in `InvoicesPage.tsx` — these will be fixed in Task 4. No errors inside `useInvoicesPageState.ts` itself.

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/pages/sales/hooks/useInvoicesPageState.ts
git commit -m "refactor(invoices): remove filter state from useInvoicesPageState"
```

---

## Task 2: Create `InvoiceContextHeader`

New component replacing the header+metadata portion of `InvoiceDetailsPanel`. Mirrors `OrderContextHeader` structure.

**Files:**
- Create: `frontend/src/pages/sales/components/InvoiceContextHeader.tsx`

- [ ] **Step 1: Create the file**

```tsx
import React from 'react'
import { Print as PrintIcon } from '@mui/icons-material'
import {
  Box,
  Chip,
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
import Grid from '@mui/material/GridLegacy'

import type { InvoiceJournalEntryRef, InvoiceListItem } from '../hooks/useInvoicesPageState'

import { TABLE_STYLES } from '@/constants/tableStyles'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface InvoiceContextHeaderProps {
  selectedInvoice: InvoiceListItem | null
  journalEntryRef: InvoiceJournalEntryRef | null
  journalEntryRefLoading: boolean
  onPrint: () => void
  onNavigateToSalesOrder: (salesOrderId: string, event: React.MouseEvent) => void
  onNavigateToPayment: (paymentId: string, event?: React.MouseEvent) => void
  onNavigateToJournalEntry: () => void
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

const linkButtonSx = {
  fontSize: '0.8rem',
  color: 'primary.main',
  cursor: 'pointer',
  textDecoration: 'none',
  border: 'none',
  background: 'none',
  padding: 0,
  '&:hover': { color: 'primary.dark' },
}

const InvoiceContextHeader: React.FC<InvoiceContextHeaderProps> = ({
  selectedInvoice,
  journalEntryRef,
  journalEntryRefLoading,
  onPrint,
  onNavigateToSalesOrder,
  onNavigateToPayment,
  onNavigateToJournalEntry,
}) => {
  if (!selectedInvoice) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" color="text.secondary">
          Select an invoice to view details
        </Typography>
      </Paper>
    )
  }

  const isOverpaid = (selectedInvoice.paidAmount || 0) > (selectedInvoice.totalAmount || 0)
  const overpaidAmount = (selectedInvoice.paidAmount || 0) - (selectedInvoice.totalAmount || 0)

  const statusChip = isOverpaid ? (
    <Chip label="Overpaid" size="small" color="info" sx={{ fontSize: '0.75rem', fontWeight: 600 }} />
  ) : (
    <Chip
      label={selectedInvoice.status === 'partial_paid' ? 'Partial Paid' : selectedInvoice.status}
      size="small"
      color={selectedInvoice.status === 'paid' ? 'success' : selectedInvoice.status === 'partial_paid' ? 'warning' : 'default'}
      sx={{ textTransform: 'capitalize', fontSize: '0.75rem', fontWeight: 600 }}
    />
  )

  const payments = (selectedInvoice as any).payments ?? []

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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography
            variant="tableHeader"
            sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
          >
            Invoice Details - {selectedInvoice.invoiceNumber}
          </Typography>
          {statusChip}
        </Box>
        <IconButton
          size="small"
          title="Print Invoice"
          onClick={onPrint}
          sx={{ ...actionIconSx, color: 'info.main', '&:hover': { backgroundColor: 'info.light', color: 'info.dark' } }}
        >
          <PrintIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
        </IconButton>
      </Box>

      <Box sx={{ p: TABLE_STYLES.cell.padding.px }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={detailTableSx}>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={2} sx={{ pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}>
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                        Invoice Information
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Customer</TableCell>
                    <TableCell sx={valueCellSx}>{selectedInvoice.customer?.name || selectedInvoice.customerName}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Invoice Date</TableCell>
                    <TableCell sx={valueCellSx}>{formatDate(selectedInvoice.invoiceDate)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Order No</TableCell>
                    <TableCell sx={valueCellSx}>
                      {selectedInvoice.salesOrder?.orderNumber ? (
                        <Typography
                          component="button"
                          onClick={(event) => onNavigateToSalesOrder(selectedInvoice.salesOrder!.id, event)}
                          sx={linkButtonSx}
                        >
                          {selectedInvoice.salesOrder.orderNumber}
                        </Typography>
                      ) : (
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>
                          None
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Payment No</TableCell>
                    <TableCell sx={valueCellSx}>
                      {payments.length > 0 ? (
                        <Stack spacing={0.5}>
                          {payments.map((payment: any, index: number) => (
                            <Box key={payment.id} component="span">
                              <Typography
                                component="button"
                                onClick={(event) => onNavigateToPayment(payment.id, event)}
                                sx={linkButtonSx}
                              >
                                {payment.paymentNumber}
                              </Typography>
                              {index < payments.length - 1 && (
                                <Typography component="span" sx={{ fontSize: '0.8rem' }}>, </Typography>
                              )}
                            </Box>
                          ))}
                        </Stack>
                      ) : (
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>
                          No payments
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Journal Entry No</TableCell>
                    <TableCell sx={valueCellSx}>
                      {journalEntryRefLoading ? (
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>Loading...</Typography>
                      ) : journalEntryRef ? (
                        <Typography component="button" onClick={onNavigateToJournalEntry} sx={linkButtonSx}>
                          {journalEntryRef.referenceNumber}
                        </Typography>
                      ) : (
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>Pending</Typography>
                      )}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>

          <Grid item xs={12} md={6}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={detailTableSx}>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={2} sx={{ pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}>
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                        Payment Information
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Sub-total</TableCell>
                    <TableCell sx={valueCellSx}>
                      {formatCurrency((selectedInvoice.totalAmount || 0) - (selectedInvoice.shippingAmount || 0))}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Shipping</TableCell>
                    <TableCell sx={valueCellSx}>{formatCurrency(selectedInvoice.shippingAmount || 0)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Total Amount</TableCell>
                    <TableCell sx={valueCellSx}>{formatCurrency(selectedInvoice.totalAmount)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Paid Amount</TableCell>
                    <TableCell sx={valueCellSx}>{formatCurrency(selectedInvoice.paidAmount)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>{isOverpaid ? 'Overpaid Amount' : 'Balance Due'}</TableCell>
                    <TableCell sx={{ ...valueCellSx, color: isOverpaid ? 'info.main' : 'inherit', fontWeight: isOverpaid ? 600 : 400 }}>
                      {isOverpaid ? `+${formatCurrency(overpaidAmount)}` : formatCurrency(selectedInvoice.balanceDue)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
        </Grid>
      </Box>
    </Paper>
  )
}

export default InvoiceContextHeader
```

- [ ] **Step 2: Type-check the new file**

```bash
cd frontend && npm run type-check 2>&1 | grep "InvoiceContextHeader" | head -20
```

Expected: no errors for `InvoiceContextHeader.tsx`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/sales/components/InvoiceContextHeader.tsx
git commit -m "feat(invoices): add InvoiceContextHeader component"
```

---

## Task 3: Create `InvoiceWorkspaceCard`

New component replacing the items/notes portion of `InvoiceDetailsPanel`. Mirrors `OrderWorkspaceCard`.

**Files:**
- Create: `frontend/src/pages/sales/components/InvoiceWorkspaceCard.tsx`

- [ ] **Step 1: Create the file**

```tsx
import React from 'react'
import {
  Alert,
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'

import type { InvoiceListItem } from '../hooks/useInvoicesPageState'

import { TABLE_STYLES } from '@/constants/tableStyles'
import { formatCurrency } from '@/utils/formatters'
import type { InvoiceItem } from '@/types'

interface InvoiceWorkspaceCardProps {
  selectedInvoice: InvoiceListItem | null
}

const InvoiceWorkspaceCard: React.FC<InvoiceWorkspaceCardProps> = ({ selectedInvoice }) => {
  if (!selectedInvoice) {
    return <Paper sx={{ flex: 1 }} />
  }

  return (
    <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <TableContainer>
        <Table
          size={TABLE_STYLES.size}
          sx={{
            tableLayout: 'fixed',
            '& .MuiTableCell-root': {
              border: 'none',
              py: TABLE_STYLES.cell.padding.py,
              px: TABLE_STYLES.cell.padding.px,
            },
          }}
        >
          <TableBody>
            <TableRow>
              <TableCell colSpan={5} sx={{ pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}>
                <Typography
                  variant="tableHeader"
                  sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
                >
                  Invoice Items
                </Typography>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', p: TABLE_STYLES.cell.padding.px }}>
        <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {selectedInvoice.items && selectedInvoice.items.length > 0 ? (
            <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
              <Table
                size={TABLE_STYLES.size}
                sx={{
                  '& .MuiTableCell-root': {
                    borderBottom: TABLE_STYLES.cell.border,
                    py: TABLE_STYLES.cell.padding.py,
                    px: TABLE_STYLES.cell.padding.px,
                  },
                }}
              >
                <TableHead>
                  <TableRow
                    sx={{
                      '& .MuiTableCell-head': {
                        fontWeight: 600,
                        backgroundColor: 'grey.50',
                        color: 'text.primary',
                        fontSize: '0.8rem',
                      },
                    }}
                  >
                    <TableCell sx={{ width: '40%' }}>Product</TableCell>
                    <TableCell align="center" sx={{ width: '12%' }}>Quantity</TableCell>
                    <TableCell align="right" sx={{ width: '16%' }}>Unit Price</TableCell>
                    <TableCell align="right" sx={{ width: '16%' }}>Discount</TableCell>
                    <TableCell align="right" sx={{ width: '16%' }}>Total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {selectedInvoice.items.map((item: InvoiceItem, index: number) => (
                    <TableRow
                      key={item.id || index}
                      hover
                      sx={{
                        '&:hover': { backgroundColor: 'action.hover' },
                        transition: 'background-color 0.2s ease',
                        height: TABLE_STYLES.row.height,
                      }}
                    >
                      <TableCell sx={{ fontSize: '0.8rem', lineHeight: 1.2 }}>
                        {item.product?.name || 'Unknown Product'}
                      </TableCell>
                      <TableCell align="center" sx={{ fontSize: '0.8rem' }}>{item.quantity}</TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{formatCurrency(item.unitPrice)}</TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                        {(item as any).discountType === 'percentage' && (item as any).discountPercent
                          ? `${(item as any).discountPercent}%`
                          : item.discount
                            ? `-${formatCurrency(item.discount)}`
                            : '-'}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                        {formatCurrency((item as any).totalAmount || item.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Alert severity="info">No items in this invoice</Alert>
          )}
        </Box>

        {selectedInvoice.notes && (
          <Box sx={{ mt: 1 }}>
            <Typography
              variant="tableHeader"
              sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1 }}
            >
              NOTES
            </Typography>
            <Box sx={{ p: 2, backgroundColor: 'grey.50', borderRadius: 1, fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {selectedInvoice.notes}
            </Box>
          </Box>
        )}
      </Box>
    </Paper>
  )
}

export default InvoiceWorkspaceCard
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep "InvoiceWorkspaceCard" | head -20
```

Expected: no errors for `InvoiceWorkspaceCard.tsx`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/sales/components/InvoiceWorkspaceCard.tsx
git commit -m "feat(invoices): add InvoiceWorkspaceCard component"
```

---

## Task 4: Rewrite `InvoicesPage`

Wire `PageHeader`, `FilterBar`, `MasterDetailWorkspace`, and the new components. Remove all manual filter/date logic.

**Files:**
- Modify: `frontend/src/pages/sales/InvoicesPage.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Box, useMediaQuery, useTheme } from '@mui/material'
import { useLocation, useNavigate } from 'react-router-dom'

import InvoiceContextHeader from './components/InvoiceContextHeader'
import InvoiceWorkspaceCard from './components/InvoiceWorkspaceCard'
import InvoicesDialogs from './components/InvoicesDialogs'
import InvoicesTable from './components/InvoicesTable'
import { useInvoicesActions } from './hooks/useInvoicesActions'
import { type InvoiceListItem, useInvoicesPageState } from './hooks/useInvoicesPageState'
import { useInvoicesSelection } from './hooks/useInvoicesSelection'

import MasterDetailWorkspace from '@/components/common/MasterDetailWorkspace'
import PageHeader from '@/components/common/PageHeader'
import { FilterBar } from '@/components/filters/FilterBar'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useNotification } from '@/hooks/useNotification'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { useGetInvoicesQuery } from '@/store/api/salesApi'
import { selectSelectedInvoice } from '@/store/slices/salesSlice'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'

interface InvoiceFilters {
  search: string
  period: PeriodValue
  customerId: string | null
}

const InvoicesPage: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useAppDispatch()
  const { showError } = useNotification()
  const selectedInvoice = useAppSelector(selectSelectedInvoice) as InvoiceListItem | null
  const pageState = useInvoicesPageState()
  const [sortBy, setSortBy] = useState('invoiceNumber')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const filterConfig = useMemo<FilterBarConfig<InvoiceFilters>>(
    () => ({
      search: { placeholder: 'Search invoices...' },
      fields: [
        { field: 'period', label: 'Period', type: 'period' },
        { field: 'customerId', label: 'Customer', type: 'customer' },
      ],
      defaults: {
        search: '',
        period: { key: null, from: null, to: null },
        customerId: null,
      },
    }),
    [],
  )

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)

  const weekStartsOn = getStartOfWeek()
  const dateRange = useMemo(() => {
    const period = appliedFilters.period
    if (!period || period.key === null) {
      return { fromDate: undefined, toDate: undefined }
    }
    if (period.key === 'custom') {
      return { fromDate: period.from ?? undefined, toDate: period.to ?? undefined }
    }
    const range = getPeriodDateRange(period.key, weekStartsOn)
    return { fromDate: range.from, toDate: range.to }
  }, [appliedFilters.period, weekStartsOn])

  const queryArgs = useMemo(
    () => ({
      search: appliedFilters.search || undefined,
      sortBy,
      sortOrder,
      fromDate: dateRange.fromDate,
      toDate: dateRange.toDate,
      customerId: appliedFilters.customerId || undefined,
    }),
    [appliedFilters.search, appliedFilters.customerId, dateRange, sortBy, sortOrder],
  )

  const { data, isLoading: loading, error, refetch } = useGetInvoicesQuery(queryArgs)
  const invoices = data?.data ?? []
  const pagination = data?.meta ?? { page: 1, limit: 20, total: 0, totalPages: 0 }

  const normalizedInvoices = useMemo(
    () =>
      invoices.map((invoice: any): InvoiceListItem => {
        const customerName = invoice.customerName || invoice.customer?.name || 'Unknown Customer'
        const invoiceDate = invoice.invoiceDate || invoice.issueDate
        const totalAmount = invoice.totalAmount || invoice.total || 0
        const balanceDue = invoice.balanceDue ?? invoice.dueAmount ?? (totalAmount - (invoice.paidAmount || 0))

        return {
          ...invoice,
          customerName,
          invoiceDate,
          totalAmount,
          balanceDue,
          paidAmount: invoice.paidAmount || 0,
          isOverdue: invoice.isOverdue || false,
        }
      }),
    [invoices],
  )

  const handleSort = useCallback((field: string) => {
    setSortOrder((prev) => (sortBy === field && prev === 'desc' ? 'asc' : 'desc'))
    setSortBy(field)
  }, [sortBy])

  const filterHandlers = useMemo(() => ({
    ...handlers,
    onSearchChange: (value: string) => {
      pageState.setShouldPreserveSearchFocus(true)
      handlers.onSearchChange(value)
    },
  }), [handlers, pageState])

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

  const selection = useInvoicesSelection({
    dispatch,
    navigate,
    invoices: normalizedInvoices,
    selectedInvoice,
    focusedInvoiceIndex: pageState.focusedInvoiceIndex,
    setFocusedInvoiceIndex: pageState.setFocusedInvoiceIndex,
    location,
    refetch,
    invoiceListRef: pageState.invoiceListRef,
    searchInputRef: pageState.searchInputRef,
    hasRestoredSelection: pageState.hasRestoredSelection,
    selectedInvoiceRef: pageState.selectedInvoiceRef,
    setJournalEntryRef: pageState.setJournalEntryRef,
    setJournalEntryRefLoading: pageState.setJournalEntryRefLoading,
    setCreateDialog: pageState.setCreateDialog,
    setEditDialog: pageState.setEditDialog,
  })

  const actions = useInvoicesActions({
    selectedInvoice,
    showError,
    setCreateDialog: pageState.setCreateDialog,
    setEditDialog: pageState.setEditDialog,
    setDeletedInvoicesDialogOpen: pageState.setDeletedInvoicesDialogOpen,
  })

  useKeyboardShortcuts({
    onSearch: () => {
      pageState.searchInputRef.current?.focus()
      pageState.searchInputRef.current?.select()
    },
    onArrowUp: selection.handleNavigateUp,
    onArrowDown: selection.handleNavigateDown,
    onEnter: selection.handleEnterAction,
    onPageUp: selection.handlePageUpNavigation,
    onPageDown: selection.handlePageDownNavigation,
    onHome: selection.handleNavigateToFirst,
    onEnd: selection.handleNavigateToLast,
    onEscape: selection.handleEscapeAction,
  })

  const navigateToJournalEntry = useCallback(() => {
    if (!pageState.journalEntryRef) return
    navigate(`/accounting/journal-entries?sourceType=${pageState.journalEntryRef.sourceType}&sourceId=${pageState.journalEntryRef.sourceId}`)
  }, [navigate, pageState.journalEntryRef])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PageHeader
        title="Invoices"
        subtitle="Track and manage customer invoices"
        variant="workflow"
        secondaryAction={{ label: 'View Deleted', onClick: () => pageState.setDeletedInvoicesDialogOpen(true) }}
        toolbar={
          <FilterBar
            config={filterConfig}
            draftFilters={draftFilters}
            handlers={filterHandlers}
            hasActiveFilters={hasActiveFilters}
            searchInputRef={pageState.searchInputRef}
            sort={{ field: 'invoiceNumber', sortBy, sortOrder, onSort: handleSort }}
          />
        }
      />

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          Failed to load invoices.
        </Alert>
      )}

      <MasterDetailWorkspace
        isMobile={isMobile}
        listSlot={(
          <InvoicesTable
            invoices={normalizedInvoices}
            loading={loading}
            total={pagination.total || 0}
            selectedInvoiceId={selectedInvoice?.id}
            focusedInvoiceIndex={pageState.focusedInvoiceIndex}
            onInvoiceSelect={selection.handleInvoiceSelect}
            invoiceListRef={pageState.invoiceListRef}
          />
        )}
        headerSlot={(
          <InvoiceContextHeader
            selectedInvoice={selectedInvoice}
            journalEntryRef={pageState.journalEntryRef}
            journalEntryRefLoading={pageState.journalEntryRefLoading}
            onPrint={() => pageState.setPrintDialogOpen(true)}
            onNavigateToSalesOrder={selection.handleSalesOrderClick}
            onNavigateToPayment={selection.handleNavigateToPayment}
            onNavigateToJournalEntry={navigateToJournalEntry}
          />
        )}
        workspaceSlot={<InvoiceWorkspaceCard selectedInvoice={selectedInvoice} />}
      />

      <InvoicesDialogs
        createDialog={pageState.createDialog}
        editDialog={pageState.editDialog}
        deletedInvoicesDialogOpen={pageState.deletedInvoicesDialogOpen}
        printDialogOpen={pageState.printDialogOpen}
        selectedInvoice={selectedInvoice}
        onCloseCreateDialog={() => pageState.setCreateDialog(false)}
        onCloseEditDialog={() => pageState.setEditDialog(false)}
        onCloseDeletedInvoicesDialog={() => pageState.setDeletedInvoicesDialogOpen(false)}
        onClosePrintDialog={() => pageState.setPrintDialogOpen(false)}
      />
    </Box>
  )
}

export default InvoicesPage
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | head -40
```

Expected: no errors (or only pre-existing unrelated errors).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/sales/InvoicesPage.tsx
git commit -m "refactor(invoices): wire PageHeader, FilterBar, MasterDetailWorkspace"
```

---

## Task 5: Update `InvoicesTable` — add "Searching..." spinner

**Files:**
- Modify: `frontend/src/pages/sales/components/InvoicesTable.tsx`

- [ ] **Step 1: Update the header box to show a spinner when searching**

In `InvoicesTable.tsx`, replace the header `<Box>` section (currently just showing "Invoice List (N)") with:

```tsx
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
      Invoice List ({total})
    </Typography>
    {loading && invoices.length > 0 && (
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
```

The outer `<Box>` previously was:

```tsx
<Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
  <Typography
    variant="tableHeader"
    sx={{
      fontWeight: 600,
      fontSize: '0.8rem',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
    }}
  >
    Invoice List ({total})
  </Typography>
</Box>
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep "InvoicesTable" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/sales/components/InvoicesTable.tsx
git commit -m "feat(invoices): add searching spinner to InvoicesTable"
```

---

## Task 6: Delete `InvoiceDetailsPanel`

**Files:**
- Delete: `frontend/src/pages/sales/components/InvoiceDetailsPanel.tsx`

- [ ] **Step 1: Verify nothing imports it**

```bash
cd frontend && grep -r "InvoiceDetailsPanel" src/ --include="*.tsx" --include="*.ts"
```

Expected: no results (it was only imported by `InvoicesPage.tsx`, which was replaced in Task 4).

- [ ] **Step 2: Delete the file**

```bash
rm frontend/src/pages/sales/components/InvoiceDetailsPanel.tsx
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Run affected tests**

```bash
cd frontend && npx vitest run src/pages/sales/ 2>&1 | tail -20
```

Expected: all tests pass (there are no invoice-specific test files, so this covers the sales directory broadly).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(invoices): delete InvoiceDetailsPanel, replaced by InvoiceContextHeader + InvoiceWorkspaceCard"
```

---

## Task 7: Final verification

- [ ] **Step 1: Full type-check**

```bash
cd frontend && npm run type-check 2>&1
```

Expected: no new errors.

- [ ] **Step 2: Run sales page tests**

```bash
cd frontend && npx vitest run src/pages/sales/ 2>&1 | tail -30
```

Expected: all pass.

- [ ] **Step 3: Lint**

```bash
cd frontend && npm run lint 2>&1 | grep -E "InvoicesPage|InvoiceContext|InvoiceWorkspace|InvoicesTable|useInvoicesPageState" | head -20
```

Expected: no lint errors for the changed files.

- [ ] **Step 4: Final commit if any lint fixes needed**

```bash
git add -A && git commit -m "fix(invoices): lint fixes post-refactor"
```

Only run this step if Step 3 produced fixable lint errors.
