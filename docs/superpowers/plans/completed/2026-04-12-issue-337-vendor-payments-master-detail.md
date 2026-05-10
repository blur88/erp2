# VendorPaymentsPage Master-Detail Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite `VendorPaymentsPage.tsx` from a monolithic manual-grid layout into the standardized Master-Detail pattern matching `GoodsReceivedPage`.

**Architecture:** Extract state into `useVendorPaymentsPageState`, selection/nav into `useVendorPaymentsSelection`, and UI into four focused components (`VendorPaymentTable`, `VendorPaymentContextHeader`, `VendorPaymentWorkspaceCard`, `VendorPaymentsDialogs`). The page becomes a thin orchestrator using `MasterDetailWorkspace` and `FilterBar`.

**Tech Stack:** React 19, MUI v7, RTK Query, Redux Toolkit, Vitest/React Testing Library, TypeScript (strict: false).

---

## File Map

| Action | Path |
|---|---|
| Modify | `frontend/src/store/api/purchasingApi.ts` |
| Create | `frontend/src/pages/purchasing/hooks/useVendorPaymentsPageState.ts` |
| Create | `frontend/src/pages/purchasing/hooks/useVendorPaymentsSelection.ts` |
| Create | `frontend/src/pages/purchasing/components/VendorPaymentTable.tsx` |
| Create | `frontend/src/pages/purchasing/components/VendorPaymentContextHeader.tsx` |
| Create | `frontend/src/pages/purchasing/components/VendorPaymentWorkspaceCard.tsx` |
| Create | `frontend/src/pages/purchasing/components/VendorPaymentsDialogs.tsx` |
| Rewrite | `frontend/src/pages/purchasing/VendorPaymentsPage.tsx` |
| Create | `frontend/src/pages/purchasing/__tests__/VendorPaymentsPage.filterbar.test.tsx` |

---

## Task 1: Add `getVendorPayment` lazy query to purchasingApi

**Files:**
- Modify: `frontend/src/store/api/purchasingApi.ts`

- [ ] **Step 1: Open the file and locate the endpoint block**

Read `frontend/src/store/api/purchasingApi.ts`. Find the `getDeletedVendorPayments` endpoint (around line 233). The new endpoint goes immediately after `getVendorPayments` and before `getDeletedVendorPayments`.

- [ ] **Step 2: Add the single-item query**

Insert after `getVendorPayments` (before `getDeletedVendorPayments`):

```ts
    getVendorPayment: builder.query<VendorPayment, string>({
      query: (id) => ({ url: `/purchasing/vendor-payments/${id}` }),
      transformResponse: normalizeSingle<VendorPayment>,
      providesTags: (_result, _error, id) => [{ type: 'VendorPayment' as const, id }],
    }),
```

Note: `normalizeSingle` is already imported — it's used by `getGoodsReceivedNote`. Check the import at the top of the file to confirm.

- [ ] **Step 3: Export the lazy hook**

In the export block at the bottom of the file, add `useLazyGetVendorPaymentQuery` alongside the existing exports:

```ts
  useLazyGetVendorPaymentQuery,
```

Place it after `useGetDeletedVendorPaymentsQuery`.

- [ ] **Step 4: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "purchasingApi\|VendorPayment" | head -20
```

Expected: no errors related to `purchasingApi.ts`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/store/api/purchasingApi.ts
git commit -m "feat: add useLazyGetVendorPaymentQuery to purchasingApi"
```

---

## Task 2: Create `useVendorPaymentsPageState` hook

**Files:**
- Create: `frontend/src/pages/purchasing/hooks/useVendorPaymentsPageState.ts`

- [ ] **Step 1: Create the file**

```ts
import { useRef, useState } from 'react'

export interface VPSorting {
  sortBy: string
  sortOrder: 'asc' | 'desc'
}

export interface VPJournalEntryRef {
  referenceNumber: string
  sourceType: string
  sourceId: string
}

export function useVendorPaymentsPageState() {
  const [sorting, setSorting] = useState<VPSorting>({
    sortBy: 'paymentNumber',
    sortOrder: 'asc',
  })
  const [focusedPaymentIndex, setFocusedPaymentIndex] = useState(-1)
  const [deletedPaymentsOpen, setDeletedPaymentsOpen] = useState(false)
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [journalEntryRef, setJournalEntryRef] = useState<VPJournalEntryRef | null>(null)
  const [journalEntryRefLoading, setJournalEntryRefLoading] = useState(false)

  const paymentListRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const userHasNavigatedRef = useRef(false)

  return {
    sorting,
    setSorting,
    focusedPaymentIndex,
    setFocusedPaymentIndex,
    deletedPaymentsOpen,
    setDeletedPaymentsOpen,
    printDialogOpen,
    setPrintDialogOpen,
    journalEntryRef,
    setJournalEntryRef,
    journalEntryRefLoading,
    setJournalEntryRefLoading,
    paymentListRef,
    searchInputRef,
    userHasNavigatedRef,
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep "useVendorPaymentsPageState" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/purchasing/hooks/useVendorPaymentsPageState.ts
git commit -m "feat: add useVendorPaymentsPageState hook"
```

---

## Task 3: Create `useVendorPaymentsSelection` hook

**Files:**
- Create: `frontend/src/pages/purchasing/hooks/useVendorPaymentsSelection.ts`

- [ ] **Step 1: Create the file**

```ts
import { useCallback, useEffect, type MutableRefObject, type RefObject } from 'react'
import type { SetURLSearchParams } from 'react-router-dom'

import { useLazyGetJournalEntriesQuery } from '@/store/api/accountingApi'
import { useLazyGetVendorPaymentQuery } from '@/store/api/purchasingApi'
import { setSelectedVendorPayment } from '@/store/slices/purchasingSlice'
import type { AppDispatch } from '@/store'
import type { VendorPayment } from '@/types'

import type { VPJournalEntryRef } from './useVendorPaymentsPageState'

interface UseVendorPaymentsSelectionParams {
  dispatch: AppDispatch
  payments: VendorPayment[]
  selectedPayment: VendorPayment | null
  focusedPaymentIndex: number
  setFocusedPaymentIndex: (index: number) => void
  searchParams: URLSearchParams
  setSearchParams: SetURLSearchParams
  paymentListRef: RefObject<HTMLDivElement | null>
  searchInputRef: RefObject<HTMLInputElement | null>
  userHasNavigatedRef: MutableRefObject<boolean>
  setJournalEntryRef: (value: VPJournalEntryRef | null) => void
  setJournalEntryRefLoading: (value: boolean) => void
}

export function useVendorPaymentsSelection({
  dispatch,
  payments,
  selectedPayment,
  focusedPaymentIndex,
  setFocusedPaymentIndex,
  searchParams,
  setSearchParams,
  paymentListRef,
  searchInputRef,
  userHasNavigatedRef,
  setJournalEntryRef,
  setJournalEntryRefLoading,
}: UseVendorPaymentsSelectionParams) {
  const [fetchPayment] = useLazyGetVendorPaymentQuery()
  const [fetchJournalEntries] = useLazyGetJournalEntriesQuery()

  // Fetch journal entry ref whenever selected payment changes
  useEffect(() => {
    if (!selectedPayment?.id) {
      setJournalEntryRef(null)
      setJournalEntryRefLoading(false)
      return
    }

    let cancelled = false
    setJournalEntryRefLoading(true)

    ;(async () => {
      try {
        const res = await fetchJournalEntries({
          sourceType: 'vendor_payment',
          sourceId: selectedPayment.id,
          sortBy: 'createdAt',
          sortOrder: 'DESC',
          limit: 1,
        }).unwrap()

        if (cancelled) return

        const entry = res.data?.[0]
        if (entry) {
          setJournalEntryRef({
            referenceNumber: entry.referenceNumber,
            sourceType: 'vendor_payment',
            sourceId: selectedPayment.id,
          })
        } else {
          setJournalEntryRef(null)
        }
      } catch {
        if (!cancelled) setJournalEntryRef(null)
      } finally {
        if (!cancelled) setJournalEntryRefLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [fetchJournalEntries, selectedPayment?.id, setJournalEntryRef, setJournalEntryRefLoading])

  // Handle vpId deep-link query param
  useEffect(() => {
    const vpId = searchParams.get('vpId')
    if (vpId && payments.length > 0) {
      const payment = payments.find((item) => item.id === vpId)
      if (payment) {
        dispatch(setSelectedVendorPayment(payment))
        const index = payments.findIndex((item) => item.id === payment.id)
        setFocusedPaymentIndex(index)
        setSearchParams((prev) => {
          prev.delete('vpId')
          return prev
        }, { replace: true })
      }
    }
  }, [dispatch, payments, searchParams, setFocusedPaymentIndex, setSearchParams])

  // Auto-select first item on load
  useEffect(() => {
    if (payments.length > 0 && focusedPaymentIndex === -1) {
      if (selectedPayment) {
        const index = payments.findIndex((item) => item.id === selectedPayment.id)
        setFocusedPaymentIndex(index >= 0 ? index : 0)
      } else if (searchInputRef.current !== document.activeElement) {
        const vpId = searchParams.get('vpId')
        if (!vpId) {
          setFocusedPaymentIndex(0)
          dispatch(setSelectedVendorPayment(payments[0]))
        }
      }
    }
  }, [dispatch, focusedPaymentIndex, payments, searchInputRef, searchParams, selectedPayment, setFocusedPaymentIndex])

  // Clear selection when list is empty
  useEffect(() => {
    if (payments.length === 0 && selectedPayment) {
      dispatch(setSelectedVendorPayment(null))
      setFocusedPaymentIndex(-1)
    }
  }, [dispatch, payments.length, selectedPayment, setFocusedPaymentIndex])

  // Scroll focused row into view
  useEffect(() => {
    if (focusedPaymentIndex >= 0 && paymentListRef.current) {
      const row = paymentListRef.current.querySelector(`[data-payment-index="${focusedPaymentIndex}"]`)
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [focusedPaymentIndex, paymentListRef])

  const handlePaymentSelect = useCallback(async (payment: VendorPayment) => {
    const index = payments.findIndex((item) => item.id === payment.id)
    setFocusedPaymentIndex(index)
    userHasNavigatedRef.current = true

    try {
      const freshPayment = await fetchPayment(payment.id).unwrap()
      dispatch(setSelectedVendorPayment(freshPayment))
    } catch {
      dispatch(setSelectedVendorPayment(payment))
    }
  }, [dispatch, fetchPayment, payments, setFocusedPaymentIndex, userHasNavigatedRef])

  const handleNavigateUp = useCallback(() => {
    if (focusedPaymentIndex > 0) {
      const newIndex = focusedPaymentIndex - 1
      setFocusedPaymentIndex(newIndex)
      dispatch(setSelectedVendorPayment(payments[newIndex]))
      userHasNavigatedRef.current = true
    }
  }, [dispatch, focusedPaymentIndex, payments, setFocusedPaymentIndex, userHasNavigatedRef])

  const handleNavigateDown = useCallback(() => {
    if (focusedPaymentIndex < payments.length - 1) {
      const newIndex = focusedPaymentIndex + 1
      setFocusedPaymentIndex(newIndex)
      dispatch(setSelectedVendorPayment(payments[newIndex]))
      userHasNavigatedRef.current = true
    }
  }, [dispatch, focusedPaymentIndex, payments, setFocusedPaymentIndex, userHasNavigatedRef])

  const focusSearchInput = useCallback(() => {
    searchInputRef.current?.focus()
  }, [searchInputRef])

  return {
    handlePaymentSelect,
    handleNavigateUp,
    handleNavigateDown,
    focusSearchInput,
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep "useVendorPaymentsSelection" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/purchasing/hooks/useVendorPaymentsSelection.ts
git commit -m "feat: add useVendorPaymentsSelection hook"
```

---

## Task 4: Create `VendorPaymentTable` component

**Files:**
- Create: `frontend/src/pages/purchasing/components/VendorPaymentTable.tsx`

- [ ] **Step 1: Create the file**

```tsx
import React, { memo } from 'react'
import {
  Box,
  Chip,
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
import type { VendorPayment } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface VendorPaymentRowProps {
  payment: VendorPayment
  index: number
  selectedPaymentId?: string
  focusedPaymentIndex: number
  onPaymentSelect: (payment: VendorPayment) => void
}

const statusColor = (status: VendorPayment['status']): 'default' | 'success' | 'error' => {
  if (status === 'completed') return 'success'
  if (status === 'cancelled') return 'error'
  return 'default'
}

const VendorPaymentRow = memo(({
  payment,
  index,
  selectedPaymentId,
  focusedPaymentIndex,
  onPaymentSelect,
}: VendorPaymentRowProps) => {
  const isSelected = selectedPaymentId === payment.id
  const isFocused = index === focusedPaymentIndex

  return (
    <TableRow
      hover
      onClick={() => onPaymentSelect(payment)}
      data-payment-index={index}
      sx={{
        cursor: 'pointer',
        backgroundColor: isSelected ? 'action.selected' : isFocused ? 'action.focus' : 'inherit',
        '&:hover': { backgroundColor: isSelected ? 'action.selected' : 'action.hover' },
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
        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem', lineHeight: 1.2 }}>
          {payment.paymentNumber}
        </Typography>
        <Typography variant="body2" sx={{ fontSize: '0.75rem', color: 'text.secondary', lineHeight: 1.2 }}>
          {payment.supplier?.companyName}
        </Typography>
      </TableCell>
      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
        <Typography variant="body2" sx={{ fontSize: '0.8rem', lineHeight: 1.2 }}>
          {formatCurrency(payment.amount)}
        </Typography>
        <Typography variant="body2" sx={{ fontSize: '0.75rem', color: 'text.secondary', lineHeight: 1.2 }}>
          {formatDate(payment.paymentDate)}
        </Typography>
      </TableCell>
      <TableCell align="right" sx={{ width: 90 }}>
        <Chip
          label={payment.status}
          size="small"
          color={statusColor(payment.status)}
          sx={{ fontSize: '0.7rem', height: 20, textTransform: 'capitalize' }}
        />
      </TableCell>
    </TableRow>
  )
})

VendorPaymentRow.displayName = 'VendorPaymentRow'

interface VendorPaymentTableProps {
  payments: VendorPayment[]
  loading: boolean
  total: number
  selectedPaymentId?: string
  focusedPaymentIndex: number
  onPaymentSelect: (payment: VendorPayment) => void
  paymentListRef: React.RefObject<HTMLDivElement | null>
}

const VendorPaymentTable: React.FC<VendorPaymentTableProps> = ({
  payments,
  loading,
  total,
  selectedPaymentId,
  focusedPaymentIndex,
  onPaymentSelect,
  paymentListRef,
}) => {
  return (
    <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
        <Typography
          variant="tableHeader"
          sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
        >
          Vendor Payments ({total})
        </Typography>
      </Box>
      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} ref={paymentListRef}>
        <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
          <Table size={TABLE_STYLES.size}>
            <TableBody>
              {loading && payments.length === 0
                ? [...Array(10)].map((_, index) => (
                    <TableRow key={`skeleton-${index}`}>
                      <TableCell colSpan={3}>
                        <Skeleton height={40} />
                      </TableCell>
                    </TableRow>
                  ))
                : payments.map((payment, index) => (
                    <VendorPaymentRow
                      key={payment.id}
                      payment={payment}
                      index={index}
                      selectedPaymentId={selectedPaymentId}
                      focusedPaymentIndex={focusedPaymentIndex}
                      onPaymentSelect={onPaymentSelect}
                    />
                  ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Paper>
  )
}

export default VendorPaymentTable
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep "VendorPaymentTable" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/purchasing/components/VendorPaymentTable.tsx
git commit -m "feat: add VendorPaymentTable component"
```

---

## Task 5: Create `VendorPaymentContextHeader` component

**Files:**
- Create: `frontend/src/pages/purchasing/components/VendorPaymentContextHeader.tsx`

- [ ] **Step 1: Create the file**

```tsx
import React from 'react'
import { default as PrintIcon } from '@mui/icons-material/Print'
import {
  Box,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material'
import Grid from '@mui/material/Grid'
import { useNavigate } from 'react-router-dom'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { VendorPayment } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

import type { VPJournalEntryRef } from '../hooks/useVendorPaymentsPageState'

interface VendorPaymentContextHeaderProps {
  selectedPayment: VendorPayment | null
  journalEntryRef: VPJournalEntryRef | null
  journalEntryRefLoading: boolean
  onPrint: () => void
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
  tableLayout: 'fixed' as const,
  '& .MuiTableCell-root': {
    border: 'none',
    py: TABLE_STYLES.cell.padding.py,
    px: TABLE_STYLES.cell.padding.px,
    '&:nth-of-type(1)': { width: '40%' },
    '&:nth-of-type(2)': { width: '60%' },
  },
}

const labelCellSx = { fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }
const valueCellSx = { fontSize: '0.8rem' }

const VendorPaymentContextHeader: React.FC<VendorPaymentContextHeaderProps> = ({
  selectedPayment,
  journalEntryRef,
  journalEntryRefLoading,
  onPrint,
  onNavigateToJournalEntry,
}) => {
  const navigate = useNavigate()

  if (!selectedPayment) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
          Select a vendor payment to view details
        </Typography>
      </Paper>
    )
  }

  const handleNavigateToPO = () => {
    if (selectedPayment.purchaseOrder?.id) {
      navigate(`/purchasing/purchase-orders?poId=${selectedPayment.purchaseOrder.id}`)
    }
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
          sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
        >
          Payment Details — {selectedPayment.paymentNumber}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <IconButton size="small" title="Print Payment" onClick={onPrint} sx={{ ...actionIconSx, color: 'info.main' }}>
            <PrintIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
        </Box>
      </Box>

      <Box sx={{ p: TABLE_STYLES.cell.padding.px }}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={detailTableSx}>
                <TableBody>
                  <TableRow>
                    <TableCell
                      colSpan={2}
                      sx={{
                        pb: TABLE_STYLES.cell.padding.py * 0.67,
                        py: TABLE_STYLES.cell.padding.py * 0.67,
                        borderTop: TABLE_STYLES.cell.border,
                      }}
                    >
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                        Payment Information
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Payment Number</TableCell>
                    <TableCell sx={valueCellSx}>{selectedPayment.paymentNumber}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Status</TableCell>
                    <TableCell sx={valueCellSx} style={{ textTransform: 'capitalize' }}>
                      {selectedPayment.status}
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Payment Date</TableCell>
                    <TableCell sx={valueCellSx}>{formatDate(selectedPayment.paymentDate)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Journal Entry</TableCell>
                    <TableCell sx={valueCellSx}>
                      {journalEntryRefLoading ? (
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>
                          Loading...
                        </Typography>
                      ) : journalEntryRef ? (
                        <Typography
                          component="button"
                          onClick={onNavigateToJournalEntry}
                          sx={{
                            fontSize: '0.8rem',
                            color: 'primary.main',
                            cursor: 'pointer',
                            textDecoration: 'none',
                            border: 'none',
                            background: 'none',
                            padding: 0,
                          }}
                        >
                          {journalEntryRef.referenceNumber}
                        </Typography>
                      ) : (
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>
                          Pending
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={detailTableSx}>
                <TableBody>
                  <TableRow>
                    <TableCell
                      colSpan={2}
                      sx={{
                        pb: TABLE_STYLES.cell.padding.py * 0.67,
                        py: TABLE_STYLES.cell.padding.py * 0.67,
                        borderTop: TABLE_STYLES.cell.border,
                      }}
                    >
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                        Supplier & Order
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Supplier</TableCell>
                    <TableCell sx={valueCellSx}>{selectedPayment.supplier?.companyName || '—'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Purchase Order</TableCell>
                    <TableCell sx={valueCellSx}>
                      {selectedPayment.purchaseOrder ? (
                        <Typography
                          component="button"
                          onClick={handleNavigateToPO}
                          sx={{
                            fontSize: '0.8rem',
                            color: 'primary.main',
                            cursor: 'pointer',
                            textDecoration: 'none',
                            border: 'none',
                            background: 'none',
                            padding: 0,
                          }}
                        >
                          {selectedPayment.purchaseOrder.orderNumber}
                        </Typography>
                      ) : '—'}
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Amount</TableCell>
                    <TableCell sx={valueCellSx}>{formatCurrency(selectedPayment.amount)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Payment Method</TableCell>
                    <TableCell sx={valueCellSx}>
                      {selectedPayment.paymentMethodEntity?.name ?? selectedPayment.paymentMethodId ?? '—'}
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

export default VendorPaymentContextHeader
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep "VendorPaymentContextHeader" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/purchasing/components/VendorPaymentContextHeader.tsx
git commit -m "feat: add VendorPaymentContextHeader component"
```

---

## Task 6: Create `VendorPaymentWorkspaceCard` component

**Files:**
- Create: `frontend/src/pages/purchasing/components/VendorPaymentWorkspaceCard.tsx`

- [ ] **Step 1: Create the file**

```tsx
import React from 'react'
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { VendorPayment } from '@/types'
import { formatDate } from '@/utils/formatters'

interface VendorPaymentWorkspaceCardProps {
  selectedPayment: VendorPayment | null
}

const detailTableSx = {
  tableLayout: 'fixed' as const,
  '& .MuiTableCell-root': {
    borderBottom: TABLE_STYLES.cell.border,
    py: TABLE_STYLES.cell.padding.py,
    px: TABLE_STYLES.cell.padding.px,
    '&:nth-of-type(1)': { width: '35%' },
    '&:nth-of-type(2)': { width: '65%' },
  },
}

const labelCellSx = { fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }
const valueCellSx = { fontSize: '0.8rem' }

const VendorPaymentWorkspaceCard: React.FC<VendorPaymentWorkspaceCardProps> = ({ selectedPayment }) => {
  if (!selectedPayment) {
    return <Paper sx={{ flex: 1 }} />
  }

  return (
    <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
        <Typography
          variant="tableHeader"
          sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
        >
          Payment Details
        </Typography>
      </Box>

      <Box sx={{ flex: 1, overflow: 'auto', p: TABLE_STYLES.cell.padding.px }}>
        <TableContainer>
          <Table size={TABLE_STYLES.size} sx={detailTableSx}>
            <TableBody>
              <TableRow sx={{ backgroundColor: 'grey.50' }}>
                <TableCell sx={labelCellSx}>Reference Number</TableCell>
                <TableCell sx={valueCellSx}>{selectedPayment.referenceNumber || '—'}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={labelCellSx}>Notes</TableCell>
                <TableCell sx={valueCellSx}>{selectedPayment.notes || '—'}</TableCell>
              </TableRow>
              <TableRow sx={{ backgroundColor: 'grey.50' }}>
                <TableCell sx={labelCellSx}>Created By</TableCell>
                <TableCell sx={valueCellSx}>{selectedPayment.createdBy || '—'}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={labelCellSx}>Created At</TableCell>
                <TableCell sx={valueCellSx}>{formatDate(selectedPayment.createdAt)}</TableCell>
              </TableRow>
              <TableRow sx={{ backgroundColor: 'grey.50' }}>
                <TableCell sx={labelCellSx}>Updated At</TableCell>
                <TableCell sx={valueCellSx}>{formatDate(selectedPayment.updatedAt)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Paper>
  )
}

export default VendorPaymentWorkspaceCard
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep "VendorPaymentWorkspaceCard" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/purchasing/components/VendorPaymentWorkspaceCard.tsx
git commit -m "feat: add VendorPaymentWorkspaceCard component"
```

---

## Task 7: Create `VendorPaymentsDialogs` component

**Files:**
- Create: `frontend/src/pages/purchasing/components/VendorPaymentsDialogs.tsx`

- [ ] **Step 1: Create the file**

```tsx
import React from 'react'

import DeletedVendorPaymentsDialog from '@/components/purchasing/DeletedVendorPaymentsDialog'
import { VendorPaymentPrint } from '@/components/print'
import type { VendorPayment } from '@/types'

interface VendorPaymentsDialogsProps {
  selectedPayment: VendorPayment | null
  deletedPaymentsOpen: boolean
  onCloseDeletedPayments: () => void
  printDialogOpen: boolean
  onClosePrintDialog: () => void
}

const VendorPaymentsDialogs: React.FC<VendorPaymentsDialogsProps> = ({
  selectedPayment,
  deletedPaymentsOpen,
  onCloseDeletedPayments,
  printDialogOpen,
  onClosePrintDialog,
}) => {
  return (
    <>
      <DeletedVendorPaymentsDialog
        open={deletedPaymentsOpen}
        onClose={onCloseDeletedPayments}
      />

      {selectedPayment && (
        <VendorPaymentPrint
          open={printDialogOpen}
          onClose={onClosePrintDialog}
          payment={selectedPayment}
        />
      )}
    </>
  )
}

export default VendorPaymentsDialogs
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep "VendorPaymentsDialogs" | head -10
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/purchasing/components/VendorPaymentsDialogs.tsx
git commit -m "feat: add VendorPaymentsDialogs component"
```

---

## Task 8: Write the filterbar test (failing first)

**Files:**
- Create: `frontend/src/pages/purchasing/__tests__/VendorPaymentsPage.filterbar.test.tsx`

- [ ] **Step 1: Create the test file**

```tsx
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import VendorPaymentsPage from '../VendorPaymentsPage'
import purchasingReducer from '@/store/slices/purchasingSlice'

const { useGetVendorPaymentsQuery } = vi.hoisted(() => ({
  useGetVendorPaymentsQuery: vi.fn(() => ({
    data: { data: [], meta: { total: 0 } },
    isFetching: false,
    error: null,
  })),
}))

const filterBarSpy = vi.fn()

vi.mock('@/store/api/purchasingApi', () => ({
  useGetVendorPaymentsQuery,
  useLazyGetVendorPaymentQuery: vi.fn(() => [vi.fn()]),
  useGetSuppliersQuery: vi.fn(() => ({
    data: { data: [{ id: 'sup-1', companyName: 'Anaheim Electronics' }] },
  })),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useLazyGetJournalEntriesQuery: vi.fn(() => [vi.fn()]),
}))

vi.mock('@/components/filters', () => ({
  FilterBar: (props: unknown) => {
    filterBarSpy(props)
    return (
      <div>
        <input placeholder="Search vendor payments..." />
      </div>
    )
  },
}))

vi.mock('@/components/common/MasterDetailWorkspace', () => ({
  default: ({ listSlot, headerSlot, workspaceSlot }: any) => (
    <div>
      <div>MasterDetailWorkspace</div>
      <div>{listSlot}</div>
      <div>{headerSlot}</div>
      <div>{workspaceSlot}</div>
    </div>
  ),
}))

vi.mock('../components/VendorPaymentContextHeader', () => ({ default: () => <div>VendorPaymentContextHeader</div> }))
vi.mock('../components/VendorPaymentTable', () => ({ default: () => <div>VendorPaymentTable</div> }))
vi.mock('../components/VendorPaymentWorkspaceCard', () => ({ default: () => <div>VendorPaymentWorkspaceCard</div> }))
vi.mock('../components/VendorPaymentsDialogs', () => ({ default: () => <div>VendorPaymentsDialogs</div> }))
vi.mock('../hooks/useVendorPaymentsSelection', () => ({
  useVendorPaymentsSelection: () => ({
    handlePaymentSelect: vi.fn(),
    handleNavigateUp: vi.fn(),
    handleNavigateDown: vi.fn(),
    focusSearchInput: vi.fn(),
  }),
}))

function renderPage(initialUrl = '/') {
  const store = configureStore({
    reducer: { purchasing: purchasingReducer },
  })

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <VendorPaymentsPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('VendorPaymentsPage FilterBar integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the shared filter search input', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/search vendor payments/i)).toBeInTheDocument()
  })

  it('renders the master-detail workspace with VP components', () => {
    renderPage()
    expect(screen.getByText('MasterDetailWorkspace')).toBeInTheDocument()
    expect(screen.getByText('VendorPaymentTable')).toBeInTheDocument()
    expect(screen.getByText('VendorPaymentWorkspaceCard')).toBeInTheDocument()
  })

  it('passes search and supplierId from URL params to the query', () => {
    renderPage('/?search=vp-001&supplierId=sup-1')
    expect(useGetVendorPaymentsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: 'vp-001',
        supplierId: 'sup-1',
      }),
    )
  })

  it('passes status filter to the query', () => {
    renderPage('/?status=completed')
    expect(useGetVendorPaymentsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: 'completed',
      }),
    )
  })

  it('configures the supplier filter with the supplier type', () => {
    renderPage()
    const latestProps = filterBarSpy.mock.calls.at(-1)?.[0] as {
      config: { fields: Array<{ field: string; type: string }> }
    }
    expect(latestProps.config.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'supplierId', type: 'supplier' }),
      ]),
    )
  })

  it('configures the status filter with purchasing-status type', () => {
    renderPage()
    const latestProps = filterBarSpy.mock.calls.at(-1)?.[0] as {
      config: { fields: Array<{ field: string; type: string }> }
    }
    expect(latestProps.config.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'status', type: 'purchasing-status' }),
      ]),
    )
  })

  it('sends no startDate or endDate when period is not selected (default)', () => {
    renderPage()
    expect(useGetVendorPaymentsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        startDate: undefined,
        endDate: undefined,
      }),
    )
  })

  it('restores period=this_week from URL and resolves to startDate/endDate in the query', () => {
    renderPage('/?period=this_week')
    expect(useGetVendorPaymentsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        startDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        endDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
  })

  it('sort default is paymentNumber', () => {
    renderPage()
    const latestProps = filterBarSpy.mock.calls.at(-1)?.[0] as {
      sort: { field: string }
    }
    expect(latestProps.sort.field).toBe('paymentNumber')
  })
})
```

- [ ] **Step 2: Run the test — expect it to fail (VendorPaymentsPage not yet rewritten)**

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/VendorPaymentsPage.filterbar.test.tsx 2>&1 | tail -30
```

Expected: test failures (import errors or assertion failures because the page doesn't use `MasterDetailWorkspace` yet). This confirms the tests are wired correctly.

- [ ] **Step 3: Commit the failing test**

```bash
git add frontend/src/pages/purchasing/__tests__/VendorPaymentsPage.filterbar.test.tsx
git commit -m "test: add VendorPaymentsPage filterbar tests (failing — page not yet rewritten)"
```

---

## Task 9: Rewrite `VendorPaymentsPage` as thin orchestrator

**Files:**
- Rewrite: `frontend/src/pages/purchasing/VendorPaymentsPage.tsx`

- [ ] **Step 1: Replace the file entirely**

```tsx
import React, { useCallback, useMemo } from 'react'
import { Alert, Box, useMediaQuery, useTheme } from '@mui/material'
import { useNavigate, useSearchParams } from 'react-router-dom'

import MasterDetailWorkspace from '@/components/common/MasterDetailWorkspace'
import PageHeader from '@/components/common/PageHeader'
import { FilterBar } from '@/components/filters'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { useGetVendorPaymentsQuery } from '@/store/api/purchasingApi'
import { selectSelectedVendorPayment } from '@/store/slices/purchasingSlice'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'

import VendorPaymentContextHeader from './components/VendorPaymentContextHeader'
import VendorPaymentsDialogs from './components/VendorPaymentsDialogs'
import VendorPaymentTable from './components/VendorPaymentTable'
import VendorPaymentWorkspaceCard from './components/VendorPaymentWorkspaceCard'
import { useVendorPaymentsPageState } from './hooks/useVendorPaymentsPageState'
import { useVendorPaymentsSelection } from './hooks/useVendorPaymentsSelection'

interface VPFilters {
  search: string
  supplierId: string | null
  period: PeriodValue
  status: 'pending' | 'completed' | 'cancelled' | null
}

const VendorPaymentsPage: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const [searchParams, setSearchParams] = useSearchParams()
  const pageState = useVendorPaymentsPageState()
  const selectedPayment = useAppSelector(selectSelectedVendorPayment)

  const filterConfig = useMemo<FilterBarConfig<VPFilters>>(
    () => ({
      search: { placeholder: 'Search vendor payments...' },
      fields: [
        { field: 'period', label: 'Period', type: 'period' },
        { field: 'supplierId', label: 'Supplier', type: 'supplier' },
        { field: 'status', label: 'Status', type: 'purchasing-status' },
      ],
      defaults: {
        search: '',
        supplierId: null,
        period: { key: null, from: null, to: null },
        status: null,
      },
    }),
    [],
  )

  const filterBar = useFilterBar(filterConfig)
  const weekStartsOn = getStartOfWeek()

  const dateRange = useMemo(() => {
    const period = filterBar.appliedFilters.period
    if (!period || period.key === null) return { startDate: undefined, endDate: undefined }
    if (period.key === 'custom') return { startDate: period.from ?? undefined, endDate: period.to ?? undefined }
    const range = getPeriodDateRange(period.key, weekStartsOn)
    return { startDate: range.from, endDate: range.to }
  }, [filterBar.appliedFilters.period, weekStartsOn])

  const queryParams = useMemo(() => ({
    sortBy: pageState.sorting.sortBy,
    sortOrder: pageState.sorting.sortOrder.toUpperCase(),
    search: filterBar.appliedFilters.search || undefined,
    supplierId: filterBar.appliedFilters.supplierId || undefined,
    status: filterBar.appliedFilters.status || undefined,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  }), [dateRange, filterBar.appliedFilters, pageState.sorting])

  const {
    data: paymentsResponse,
    isFetching: loading,
    error: paymentsError,
  } = useGetVendorPaymentsQuery(queryParams)

  const payments = paymentsResponse?.data || []
  const total = paymentsResponse?.meta?.total || 0
  const error = paymentsError && typeof paymentsError === 'object'
    ? ((paymentsError as any).data?.message || (paymentsError as any).data || 'Failed to fetch vendor payments')
    : null

  const selection = useVendorPaymentsSelection({
    dispatch,
    payments,
    selectedPayment,
    focusedPaymentIndex: pageState.focusedPaymentIndex,
    setFocusedPaymentIndex: pageState.setFocusedPaymentIndex,
    searchParams,
    setSearchParams,
    paymentListRef: pageState.paymentListRef,
    searchInputRef: pageState.searchInputRef,
    userHasNavigatedRef: pageState.userHasNavigatedRef,
    setJournalEntryRef: pageState.setJournalEntryRef,
    setJournalEntryRefLoading: pageState.setJournalEntryRefLoading,
  })

  const handleSort = useCallback((field: string) => {
    pageState.setSorting((prev) => ({
      ...prev,
      sortBy: field,
      sortOrder: prev.sortBy === field && prev.sortOrder === 'desc' ? 'asc' : 'desc',
    }))
  }, [pageState])

  useKeyboardShortcuts({
    onSearch: selection.focusSearchInput,
    onArrowUp: selection.handleNavigateUp,
    onArrowDown: selection.handleNavigateDown,
  })

  const navigateToJournalEntry = useCallback(() => {
    if (!pageState.journalEntryRef) return
    navigate(
      `/accounting/journal-entries?sourceType=${pageState.journalEntryRef.sourceType}&sourceId=${pageState.journalEntryRef.sourceId}`,
    )
  }, [navigate, pageState.journalEntryRef])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PageHeader
        title="Vendor Payments"
        subtitle="Track and manage payments to suppliers"
        variant="workflow"
        secondaryAction={{ label: 'View Deleted', onClick: () => pageState.setDeletedPaymentsOpen(true) }}
        toolbar={(
          <FilterBar
            config={filterConfig}
            draftFilters={filterBar.draftFilters}
            handlers={filterBar.handlers}
            hasActiveFilters={filterBar.hasActiveFilters}
            searchInputRef={pageState.searchInputRef}
            sort={{
              field: 'paymentNumber',
              sortBy: pageState.sorting.sortBy,
              sortOrder: pageState.sorting.sortOrder,
              onSort: handleSort,
            }}
          />
        )}
      />

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <MasterDetailWorkspace
        isMobile={isMobile}
        listSlot={(
          <VendorPaymentTable
            payments={payments}
            loading={loading}
            total={total}
            selectedPaymentId={selectedPayment?.id}
            focusedPaymentIndex={pageState.focusedPaymentIndex}
            onPaymentSelect={selection.handlePaymentSelect}
            paymentListRef={pageState.paymentListRef}
          />
        )}
        headerSlot={(
          <VendorPaymentContextHeader
            selectedPayment={selectedPayment}
            journalEntryRef={pageState.journalEntryRef}
            journalEntryRefLoading={pageState.journalEntryRefLoading}
            onPrint={() => pageState.setPrintDialogOpen(true)}
            onNavigateToJournalEntry={navigateToJournalEntry}
          />
        )}
        workspaceSlot={<VendorPaymentWorkspaceCard selectedPayment={selectedPayment} />}
      />

      <VendorPaymentsDialogs
        selectedPayment={selectedPayment}
        deletedPaymentsOpen={pageState.deletedPaymentsOpen}
        onCloseDeletedPayments={() => pageState.setDeletedPaymentsOpen(false)}
        printDialogOpen={pageState.printDialogOpen}
        onClosePrintDialog={() => pageState.setPrintDialogOpen(false)}
      />
    </Box>
  )
}

export default VendorPaymentsPage
```

- [ ] **Step 2: Run the filterbar tests — expect them to pass now**

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/VendorPaymentsPage.filterbar.test.tsx 2>&1 | tail -30
```

Expected: all 8 tests pass.

- [ ] **Step 3: Type-check the whole frontend**

```bash
cd frontend && npm run type-check 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/purchasing/VendorPaymentsPage.tsx
git commit -m "refactor: rewrite VendorPaymentsPage using MasterDetailWorkspace pattern"
```

---

## Self-Review Checklist

- [x] **Task 1** covers `getVendorPayment` endpoint + `useLazyGetVendorPaymentQuery` export (spec: API Layer)
- [x] **Task 2** covers `useVendorPaymentsPageState` with all state fields from spec
- [x] **Task 3** covers `useVendorPaymentsSelection` with vpId deep-link, journal entry fetch, auto-select, scroll, keyboard nav
- [x] **Task 4** covers `VendorPaymentTable` with all 3 effective columns (payment#/supplier, amount/date, status chip) + `data-payment-index`
- [x] **Task 5** covers `VendorPaymentContextHeader` with both columns, PO link, journal entry link, print action
- [x] **Task 6** covers `VendorPaymentWorkspaceCard` with 5-row details table
- [x] **Task 7** covers `VendorPaymentsDialogs` wrapping existing dialog components
- [x] **Task 8** writes failing tests first (TDD)
- [x] **Task 9** rewrites the page and makes tests pass
- [x] `normalizeSingle` — already used by `getGoodsReceivedNote`, confirmed present
- [x] `VPJournalEntryRef` — defined in Task 2, imported in Tasks 3 and 5 ✓
- [x] `handlePaymentSelect` — defined in Task 3, consumed in Task 9 ✓
- [x] `data-payment-index` — set in Task 4 row, queried in Task 3 scroll effect ✓
- [x] Date params: `startDate`/`endDate` in Task 9 match test assertions in Task 8 ✓
- [x] Payment method filter is NOT included (deferred per spec) ✓
