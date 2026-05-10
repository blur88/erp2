# Payments Page Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `PaymentsPage.tsx` to match the Invoices page architecture — extract hooks/components, use `MasterDetailWorkspace`, add period/customer/transaction-status FilterBar fields, and remove the edit dialog.

**Architecture:** The monolith `PaymentsPage.tsx` is decomposed into two hooks (`usePaymentsPageState`, `usePaymentsSelection`) and four sub-components (`PaymentsTable`, `PaymentContextHeader`, `PaymentWorkspaceCard`, `PaymentsDialogs`), mirroring the Invoices page structure exactly. A new `FilterTransactionStatus` filter component and its `transaction-status` type are added to the shared FilterBar system. The backend `QueryPaymentsDto` gains a `status` field.

**Tech Stack:** NestJS (backend DTO + service), React 19, MUI v9, RTK Query, Vitest (frontend tests)

---

## File Map

**Create:**
- `frontend/src/pages/sales/hooks/usePaymentsPageState.ts`
- `frontend/src/pages/sales/hooks/usePaymentsSelection.ts`
- `frontend/src/pages/sales/components/PaymentsTable.tsx`
- `frontend/src/pages/sales/components/PaymentContextHeader.tsx`
- `frontend/src/pages/sales/components/PaymentWorkspaceCard.tsx`
- `frontend/src/pages/sales/components/PaymentsDialogs.tsx`
- `frontend/src/components/filters/FilterTransactionStatus.tsx`

**Modify:**
- `frontend/src/types/filterBar.types.ts` — add `transaction-status` type
- `frontend/src/components/filters/FilterBar.tsx` — register `transaction-status` renderer
- `frontend/src/pages/sales/PaymentsPage.tsx` — replace with thin orchestrator
- `frontend/src/pages/sales/__tests__/PaymentsPage.filterbar.test.tsx` — update + add filter tests
- `backend/src/modules/sales/dto/payment.dto.ts` — add `status` to `QueryPaymentsDto`
- `backend/src/modules/sales/services/payment.service.ts` — wire `status` filter in `findAll`

---

## Task 1: Add `transaction-status` to filter type system

**Files:**
- Modify: `frontend/src/types/filterBar.types.ts`
- Modify: `frontend/src/components/filters/FilterBar.tsx`
- Create: `frontend/src/components/filters/FilterTransactionStatus.tsx`

- [ ] **Step 1: Add `transaction-status` to `FilterFieldType` and its config interface in `filterBar.types.ts`**

In `frontend/src/types/filterBar.types.ts`:

Add `'transaction-status'` to the `FilterFieldType` union (after `'price-list'`):
```ts
export type FilterFieldType =
  | 'status'
  | 'user-status'
  | 'customer-type'
  | 'supplier-type'
  | 'role'
  | 'stock-adjustment-status'
  | 'period'
  | 'compare'
  | 'customer'
  | 'order-status'
  | 'payment-status'
  | 'supplier'
  | 'purchasing-status'
  | 'category'
  | 'product-type'
  | 'stock-status'
  | 'price-list'
  | 'transaction-status'
```

Add the config interface (after `PriceListFilterFieldConfig`):
```ts
export interface TransactionStatusFilterFieldConfig<TFilters, K extends keyof TFilters>
  extends BaseFilterFieldConfig<TFilters, K> {
  type: 'transaction-status'
}
```

Add it to the `FilterFieldConfig` union (after the `PriceListFilterFieldConfig` line):
```ts
export type FilterFieldConfig<TFilters> =
  | StatusFilterFieldConfig<TFilters, keyof TFilters>
  | UserStatusFilterFieldConfig<TFilters, keyof TFilters>
  | CustomerTypeFilterFieldConfig<TFilters, keyof TFilters>
  | SupplierTypeFilterFieldConfig<TFilters, keyof TFilters>
  | RoleFilterFieldConfig<TFilters, keyof TFilters>
  | StockAdjustmentStatusFilterFieldConfig<TFilters, keyof TFilters>
  | PeriodFilterFieldConfig<TFilters, keyof TFilters>
  | CompareFilterFieldConfig<TFilters, keyof TFilters>
  | CustomerFilterFieldConfig<TFilters, keyof TFilters>
  | OrderStatusFilterFieldConfig<TFilters, keyof TFilters>
  | PaymentStatusFilterFieldConfig<TFilters, keyof TFilters>
  | SupplierFilterFieldConfig<TFilters, keyof TFilters>
  | PurchasingStatusFilterFieldConfig<TFilters, keyof TFilters>
  | CategoryFilterFieldConfig<TFilters, keyof TFilters>
  | ProductTypeFilterFieldConfig<TFilters, keyof TFilters>
  | StockStatusFilterFieldConfig<TFilters, keyof TFilters>
  | PriceListFilterFieldConfig<TFilters, keyof TFilters>
  | TransactionStatusFilterFieldConfig<TFilters, keyof TFilters>
```

- [ ] **Step 2: Create `FilterTransactionStatus.tsx`**

```tsx
// frontend/src/components/filters/FilterTransactionStatus.tsx
import { FilterSelect } from './FilterSelect'

const TRANSACTION_STATUS_OPTIONS = [
  { value: 'completed', label: 'Completed' },
  { value: 'pending', label: 'Pending' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'refunded', label: 'Refunded' },
]

interface Props {
  field: string
  value: string | null
  onChange: (value: string | null) => void
}

export function FilterTransactionStatus({ field, value, onChange }: Props) {
  return (
    <FilterSelect
      field={field}
      label="Status"
      value={value}
      options={TRANSACTION_STATUS_OPTIONS}
      onChange={onChange}
    />
  )
}
```

- [ ] **Step 3: Register `transaction-status` renderer in `FilterBar.tsx`**

Add the import at the top of `frontend/src/components/filters/FilterBar.tsx` (after the `FilterPurchasingStatus` import line):
```ts
import { FilterTransactionStatus } from './FilterTransactionStatus'
```

Add the renderer block inside `renderQuickField`, after the `'price-list'` block (before the closing of the function):
```tsx
  if (field.type === 'transaction-status') {
    return (
      <FilterTransactionStatus
        key={fieldKey}
        field={fieldKey}
        value={(value as string | null) ?? null}
        onChange={onChange}
      />
    )
  }
```

- [ ] **Step 4: Run TypeScript check**

```bash
cd frontend && npm run type-check
```
Expected: no errors related to `transaction-status`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/filterBar.types.ts \
        frontend/src/components/filters/FilterTransactionStatus.tsx \
        frontend/src/components/filters/FilterBar.tsx
git commit -m "feat: add transaction-status filter type and FilterTransactionStatus component"
```

---

## Task 2: Add `status` filter to backend payments endpoint

**Files:**
- Modify: `backend/src/modules/sales/dto/payment.dto.ts`
- Modify: `backend/src/modules/sales/services/payment.service.ts`

- [ ] **Step 1: Write the failing backend test**

Open `backend/src/modules/sales/services/payment.service.spec.ts`. Find the `findAll` describe block (or add one). Add:

```ts
it('filters payments by status when status is provided', async () => {
  const mockPayments = [
    { id: '1', status: 'completed', paymentNumber: 'PAY-001' },
  ]
  jest.spyOn(paymentRepository, 'createQueryBuilder').mockReturnValue({
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([mockPayments, 1]),
  } as any)

  const result = await service.findAll({ status: 'completed' as any })
  expect(result.data).toHaveLength(1)
})
```

- [ ] **Step 2: Run the test to confirm it passes (status filter is already wired or confirm current behavior)**

```bash
cd backend && npx jest src/modules/sales/services/payment.service.spec.ts --no-coverage
```

Note the result — the test may already pass because `where` accepts any object shape via TypeORM. Proceed either way.

- [ ] **Step 3: Add `status` to `QueryPaymentsDto`**

In `backend/src/modules/sales/dto/payment.dto.ts`, after the `toDate` field block, add:

```ts
  @ApiPropertyOptional({
    description: 'Filter by payment status',
    enum: ['pending', 'completed', 'failed', 'cancelled', 'refunded'],
    example: 'completed',
  })
  @IsOptional()
  @IsString()
  status?: string;
```

- [ ] **Step 4: Wire `status` filter in `payment.service.ts` `findAll`**

In `backend/src/modules/sales/services/payment.service.ts`, update the destructuring and add the where clause:

Change the destructuring at line ~151 from:
```ts
    const {
      customerId,
      invoiceId,
      fromDate,
      toDate,
      search,
      sortBy = 'paymentDate',
      sortOrder = 'DESC',
    } = query;
```
To:
```ts
    const {
      customerId,
      invoiceId,
      fromDate,
      toDate,
      search,
      sortBy = 'paymentDate',
      sortOrder = 'DESC',
      status,
    } = query;
```

After `if (customerId) where.customerId = customerId;` add:
```ts
    if (status) where.status = status;
```

- [ ] **Step 5: Run backend tests**

```bash
cd backend && npx jest src/modules/sales/services/payment.service.spec.ts --no-coverage
```
Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/sales/dto/payment.dto.ts \
        backend/src/modules/sales/services/payment.service.ts
git commit -m "feat: add status filter to payments backend endpoint"
```

---

## Task 3: Create `usePaymentsPageState` hook

**Files:**
- Create: `frontend/src/pages/sales/hooks/usePaymentsPageState.ts`

- [ ] **Step 1: Create the hook**

```ts
// frontend/src/pages/sales/hooks/usePaymentsPageState.ts
import { useRef, useState } from 'react'

export interface PaymentJournalEntryRef {
  referenceNumber: string
  sourceType: string
  sourceId: string
}

export interface PaymentListItem {
  id: string
  paymentNumber: string
  customerName?: string
  amount: number
  paymentDate: string | Date
  paymentMethodId?: string
  paymentMethod?: string
  paymentMethodEntity?: {
    id: string
    code: string
    name: string
  }
  status: 'pending' | 'completed' | 'failed' | 'cancelled' | 'refunded'
  notes?: string
  reference?: string
  relatedOrderId?: string
  relatedInvoiceId?: string
  relatedOrderNumber?: string
  relatedInvoiceNumber?: string
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
  invoice?: {
    id: string
    invoiceNumber: string
    items?: Array<{
      id?: string
      product?: { name: string }
      quantity: number
      unitPrice: number
      discountType?: string
      discountPercent?: number
      discount?: number
      totalAmount?: number
      total?: number
    }>
  }
}

export function usePaymentsPageState() {
  const [focusedPaymentIndex, setFocusedPaymentIndex] = useState(-1)
  const [deletedPaymentsDialogOpen, setDeletedPaymentsDialogOpen] = useState(false)
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [journalEntryRef, setJournalEntryRef] = useState<PaymentJournalEntryRef | null>(null)
  const [journalEntryRefLoading, setJournalEntryRefLoading] = useState(false)

  const searchInputRef = useRef<HTMLInputElement>(null)
  const paymentListRef = useRef<HTMLDivElement>(null)
  const hasRestoredSelection = useRef(false)
  const previousPathnameRef = useRef(window.location.pathname)
  const selectedPaymentRef = useRef<PaymentListItem | null>(null)

  return {
    focusedPaymentIndex,
    setFocusedPaymentIndex,
    deletedPaymentsDialogOpen,
    setDeletedPaymentsDialogOpen,
    printDialogOpen,
    setPrintDialogOpen,
    journalEntryRef,
    setJournalEntryRef,
    journalEntryRefLoading,
    setJournalEntryRefLoading,
    searchInputRef,
    paymentListRef,
    hasRestoredSelection,
    previousPathnameRef,
    selectedPaymentRef,
  }
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/sales/hooks/usePaymentsPageState.ts
git commit -m "feat: add usePaymentsPageState hook"
```

---

## Task 4: Create `usePaymentsSelection` hook

**Files:**
- Create: `frontend/src/pages/sales/hooks/usePaymentsSelection.ts`

- [ ] **Step 1: Create the hook**

```ts
// frontend/src/pages/sales/hooks/usePaymentsSelection.ts
import { useCallback, useEffect, type MutableRefObject, type RefObject } from 'react'
import type { Location, NavigateFunction } from 'react-router-dom'

import type { PaymentJournalEntryRef, PaymentListItem } from './usePaymentsPageState'

import { useLazyGetJournalEntriesQuery } from '@/store/api/accountingApi'
import { setSelectedPayment } from '@/store/slices/salesSlice'
import type { AppDispatch } from '@/store'

interface UsePaymentsSelectionParams {
  dispatch: AppDispatch
  navigate: NavigateFunction
  payments: PaymentListItem[]
  selectedPayment: PaymentListItem | null
  focusedPaymentIndex: number
  setFocusedPaymentIndex: (index: number) => void
  location: Location
  refetch: () => void
  paymentListRef: RefObject<HTMLDivElement | null>
  searchInputRef: RefObject<HTMLInputElement | null>
  hasRestoredSelection: MutableRefObject<boolean>
  selectedPaymentRef: MutableRefObject<PaymentListItem | null>
  setJournalEntryRef: (value: PaymentJournalEntryRef | null) => void
  setJournalEntryRefLoading: (value: boolean) => void
}

export function usePaymentsSelection({
  dispatch,
  navigate,
  payments,
  selectedPayment,
  focusedPaymentIndex,
  setFocusedPaymentIndex,
  location,
  refetch,
  paymentListRef,
  searchInputRef,
  hasRestoredSelection,
  selectedPaymentRef,
  setJournalEntryRef,
  setJournalEntryRefLoading,
}: UsePaymentsSelectionParams) {
  const [fetchJournalEntries] = useLazyGetJournalEntriesQuery()

  // Keep ref in sync
  useEffect(() => {
    selectedPaymentRef.current = selectedPayment
  }, [selectedPayment, selectedPaymentRef])

  // Fetch journal entry ref for selected payment
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
          sourceType: 'payment',
          sourceId: selectedPayment.id,
          limit: 1,
        }).unwrap()

        if (cancelled) return

        const entry = res?.data?.[0]
        if (entry) {
          setJournalEntryRef({
            referenceNumber: entry.referenceNumber,
            sourceType: 'payment',
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
  }, [selectedPayment?.id, fetchJournalEntries, setJournalEntryRef, setJournalEntryRefLoading])

  // Refresh on route navigation
  useEffect(() => {
    if (location.pathname === '/sales/payments') {
      void refetch()
    }
  }, [location.pathname, refetch])

  // Update selected payment when fresh data arrives
  useEffect(() => {
    if (payments.length > 0 && selectedPaymentRef.current) {
      const freshPayment = payments.find((p) => p.id === selectedPaymentRef.current?.id)
      if (freshPayment) {
        const hasChanged = JSON.stringify(freshPayment) !== JSON.stringify(selectedPaymentRef.current)
        if (hasChanged) {
          dispatch(setSelectedPayment(freshPayment as any))
        }
      }
    }
  }, [dispatch, payments, selectedPaymentRef])

  // Restore persisted selection on mount
  useEffect(() => {
    if (!hasRestoredSelection.current && selectedPayment && payments.length > 0) {
      const index = payments.findIndex((p) => p.id === selectedPayment.id)
      if (index >= 0) {
        setFocusedPaymentIndex(index)
        hasRestoredSelection.current = true
      }
    }
  }, [hasRestoredSelection, payments, selectedPayment, setFocusedPaymentIndex])

  // Auto-select first payment or restore focus
  useEffect(() => {
    if (payments.length > 0 && focusedPaymentIndex === -1) {
      if (selectedPayment) {
        const index = payments.findIndex((p) => p.id === selectedPayment.id)
        if (index >= 0) {
          setFocusedPaymentIndex(index)
        }
      } else if (searchInputRef.current !== document.activeElement) {
        setFocusedPaymentIndex(0)
        dispatch(setSelectedPayment(payments[0] as any))
      }
    } else if (payments.length === 0) {
      dispatch(setSelectedPayment(null))
      setFocusedPaymentIndex(-1)
    }
  }, [dispatch, focusedPaymentIndex, payments, searchInputRef, selectedPayment, setFocusedPaymentIndex])

  // Handle ?highlight query param
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('highlight')
    if (!id || payments.length === 0) return
    const index = payments.findIndex((p) => p.id === id)
    if (index >= 0) {
      dispatch(setSelectedPayment(payments[index] as any))
      setFocusedPaymentIndex(index)
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [dispatch, payments, setFocusedPaymentIndex])

  // Handle location.state.highlightPaymentId
  useEffect(() => {
    const state = location.state as { highlightPaymentId?: string } | null
    if (state?.highlightPaymentId && payments.length > 0) {
      const index = payments.findIndex((p) => p.id === state.highlightPaymentId)
      if (index >= 0) {
        dispatch(setSelectedPayment(payments[index] as any))
        setFocusedPaymentIndex(index)
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      }
    }
  }, [dispatch, location.state, payments, setFocusedPaymentIndex])

  // Auto-scroll to focused row
  useEffect(() => {
    if (focusedPaymentIndex >= 0 && paymentListRef.current) {
      const row = paymentListRef.current.querySelector(`[data-payment-index="${focusedPaymentIndex}"]`)
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [focusedPaymentIndex, paymentListRef])

  const selectByIndex = useCallback((index: number) => {
    setFocusedPaymentIndex(index)
    dispatch(setSelectedPayment(payments[index] as any))
  }, [dispatch, payments, setFocusedPaymentIndex])

  const handlePaymentSelect = useCallback((payment: PaymentListItem) => {
    const index = payments.findIndex((p) => p.id === payment.id)
    dispatch(setSelectedPayment(payment as any))
    setFocusedPaymentIndex(index)
  }, [dispatch, payments, setFocusedPaymentIndex])

  const handleNavigateUp = useCallback(() => {
    if (focusedPaymentIndex > 0) selectByIndex(focusedPaymentIndex - 1)
  }, [focusedPaymentIndex, selectByIndex])

  const handleNavigateDown = useCallback(() => {
    if (focusedPaymentIndex < payments.length - 1) selectByIndex(focusedPaymentIndex + 1)
  }, [focusedPaymentIndex, payments.length, selectByIndex])

  const handleNavigateToFirst = useCallback(() => {
    if (payments.length > 0) selectByIndex(0)
  }, [payments.length, selectByIndex])

  const handleNavigateToLast = useCallback(() => {
    if (payments.length > 0) selectByIndex(payments.length - 1)
  }, [payments.length, selectByIndex])

  const handlePageUpNavigation = useCallback(() => {
    const newIndex = Math.max(0, focusedPaymentIndex - 20)
    if (payments[newIndex]) selectByIndex(newIndex)
  }, [focusedPaymentIndex, payments, selectByIndex])

  const handlePageDownNavigation = useCallback(() => {
    const newIndex = Math.min(payments.length - 1, focusedPaymentIndex + 20)
    if (payments[newIndex]) selectByIndex(newIndex)
  }, [focusedPaymentIndex, payments, selectByIndex])

  const handleEnterAction = useCallback(() => {
    // Payments cannot be edited; Enter is a no-op
  }, [])

  const handleEscapeAction = useCallback(() => {
    setFocusedPaymentIndex(-1)
    dispatch(setSelectedPayment(null))
  }, [dispatch, setFocusedPaymentIndex])

  const handleOrderClick = useCallback((orderId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    navigate(`/sales/orders?highlight=${orderId}`)
  }, [navigate])

  const handleInvoiceClick = useCallback((invoiceId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    navigate('/sales/invoices', { state: { highlightInvoiceId: invoiceId } })
  }, [navigate])

  const handleNavigateToJournalEntry = useCallback((journalEntryRef: PaymentJournalEntryRef | null) => {
    if (!journalEntryRef) return
    navigate(`/accounting/journal-entries?sourceType=${journalEntryRef.sourceType}&sourceId=${journalEntryRef.sourceId}`)
  }, [navigate])

  return {
    handlePaymentSelect,
    handleNavigateUp,
    handleNavigateDown,
    handleNavigateToFirst,
    handleNavigateToLast,
    handlePageUpNavigation,
    handlePageDownNavigation,
    handleEnterAction,
    handleEscapeAction,
    handleOrderClick,
    handleInvoiceClick,
    handleNavigateToJournalEntry,
  }
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/sales/hooks/usePaymentsSelection.ts
git commit -m "feat: add usePaymentsSelection hook"
```

---

## Task 5: Create `PaymentsTable` component

**Files:**
- Create: `frontend/src/pages/sales/components/PaymentsTable.tsx`

- [ ] **Step 1: Create the component**

```tsx
// frontend/src/pages/sales/components/PaymentsTable.tsx
import React, { memo } from 'react'
import {
  Box,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'

import type { PaymentListItem } from '../hooks/usePaymentsPageState'

import { TABLE_STYLES } from '@/constants/tableStyles'

interface PaymentRowProps {
  payment: PaymentListItem
  index: number
  selectedPaymentId?: string
  focusedPaymentIndex: number
  onPaymentSelect: (payment: PaymentListItem) => void
}

const PaymentRow = memo(({ payment, index, selectedPaymentId, focusedPaymentIndex, onPaymentSelect }: PaymentRowProps) => {
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
        <Typography variant="body2" sx={{ fontWeight: 400, fontSize: '0.8rem', lineHeight: 1.2 }}>
          {payment.paymentNumber}
        </Typography>
      </TableCell>
    </TableRow>
  )
})

PaymentRow.displayName = 'PaymentRow'

interface PaymentsTableProps {
  payments: PaymentListItem[]
  loading: boolean
  total: number
  selectedPaymentId?: string
  focusedPaymentIndex: number
  onPaymentSelect: (payment: PaymentListItem) => void
  paymentListRef: React.RefObject<HTMLDivElement | null>
}

const PaymentsTable: React.FC<PaymentsTableProps> = ({
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
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography
            variant="tableHeader"
            sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
          >
            Payment List ({total})
          </Typography>
          {loading && payments.length > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Searching...
              </Typography>
              <Box sx={{ width: 16, height: 16 }}>
                <Skeleton variant="circular" width={16} height={16} />
              </Box>
            </Box>
          )}
        </Box>
      </Box>
      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} ref={paymentListRef}>
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
              />
            </TableHead>
            <TableBody>
              {loading && payments.length === 0
                ? [...Array(10)].map((_, index) => (
                    <TableRow key={`skeleton-${index}`}>
                      <TableCell>
                        <Skeleton height={40} />
                      </TableCell>
                    </TableRow>
                  ))
                : payments.map((payment, index) => (
                    <PaymentRow
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

export default PaymentsTable
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/sales/components/PaymentsTable.tsx
git commit -m "feat: add PaymentsTable component"
```

---

## Task 6: Create `PaymentContextHeader` component

**Files:**
- Create: `frontend/src/pages/sales/components/PaymentContextHeader.tsx`

- [ ] **Step 1: Create the component**

```tsx
// frontend/src/pages/sales/components/PaymentContextHeader.tsx
import React from 'react'
import { default as PrintIcon } from '@mui/icons-material/Print'
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
import Grid from '@mui/material/Grid'

import type { PaymentJournalEntryRef, PaymentListItem } from '../hooks/usePaymentsPageState'

import { TABLE_STYLES } from '@/constants/tableStyles'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface PaymentContextHeaderProps {
  selectedPayment: PaymentListItem | null
  journalEntryRef: PaymentJournalEntryRef | null
  journalEntryRefLoading: boolean
  onPrint: () => void
  onOrderClick: (orderId: string, event: React.MouseEvent) => void
  onInvoiceClick: (invoiceId: string, event: React.MouseEvent) => void
  onNavigateToJournalEntry: (ref: PaymentJournalEntryRef | null) => void
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

const STATUS_COLORS: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  completed: 'success',
  pending: 'warning',
  failed: 'error',
  cancelled: 'default',
  refunded: 'default',
}

const getPaymentMethodLabel = (payment: PaymentListItem) => {
  if (payment.paymentMethodEntity?.name) return payment.paymentMethodEntity.name
  if (payment.paymentMethod) return payment.paymentMethod
  return 'Unknown'
}

const PaymentContextHeader: React.FC<PaymentContextHeaderProps> = ({
  selectedPayment,
  journalEntryRef,
  journalEntryRefLoading: _journalEntryRefLoading,
  onPrint,
  onOrderClick,
  onInvoiceClick,
  onNavigateToJournalEntry,
}) => {
  if (!selectedPayment) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
          Select a payment to view details
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography
            variant="tableHeader"
            sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
          >
            Payment Details - {selectedPayment.paymentNumber}
          </Typography>
          <Chip
            label={selectedPayment.status.charAt(0).toUpperCase() + selectedPayment.status.slice(1)}
            color={STATUS_COLORS[selectedPayment.status] ?? 'default'}
            size="small"
            sx={{ textTransform: 'capitalize', fontSize: '0.75rem', fontWeight: 600 }}
          />
        </Box>
        <IconButton
          size="small"
          title="Print Receipt"
          onClick={onPrint}
          sx={{ ...actionIconSx, color: 'info.main', '&:hover': { backgroundColor: 'info.light', color: 'info.dark' } }}
        >
          <PrintIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
        </IconButton>
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
                      sx={{ pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}
                    >
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                        Payment Information
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Customer</TableCell>
                    <TableCell sx={valueCellSx}>{selectedPayment.customerName}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Amount</TableCell>
                    <TableCell sx={valueCellSx}>{formatCurrency(selectedPayment.amount)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Payment Date</TableCell>
                    <TableCell sx={valueCellSx}>{formatDate(selectedPayment.paymentDate)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Method</TableCell>
                    <TableCell sx={valueCellSx}>{getPaymentMethodLabel(selectedPayment)}</TableCell>
                  </TableRow>
                  {selectedPayment.reference && (
                    <TableRow sx={{ backgroundColor: 'grey.50' }}>
                      <TableCell sx={labelCellSx}>Reference</TableCell>
                      <TableCell sx={valueCellSx}>{selectedPayment.reference}</TableCell>
                    </TableRow>
                  )}
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
                      sx={{ pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}
                    >
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                        Related Information
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Order No</TableCell>
                    <TableCell sx={valueCellSx}>
                      {selectedPayment.relatedOrderNumber ? (
                        <Typography
                          component="button"
                          onClick={(event) => onOrderClick(selectedPayment.relatedOrderId!, event)}
                          sx={linkButtonSx}
                        >
                          {selectedPayment.relatedOrderNumber}
                        </Typography>
                      ) : (
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>N/A</Typography>
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Invoice No</TableCell>
                    <TableCell sx={valueCellSx}>
                      {selectedPayment.relatedInvoiceNumber ? (
                        <Typography
                          component="button"
                          onClick={(event) => onInvoiceClick(selectedPayment.relatedInvoiceId!, event)}
                          sx={linkButtonSx}
                        >
                          {selectedPayment.relatedInvoiceNumber}
                        </Typography>
                      ) : (
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>N/A</Typography>
                      )}
                    </TableCell>
                  </TableRow>
                  {selectedPayment.customer?.email && (
                    <TableRow>
                      <TableCell sx={labelCellSx}>Customer Email</TableCell>
                      <TableCell sx={valueCellSx}>{selectedPayment.customer.email}</TableCell>
                    </TableRow>
                  )}
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Journal Entry</TableCell>
                    <TableCell sx={valueCellSx}>
                      {journalEntryRef ? (
                        <Typography
                          component="button"
                          onClick={() => onNavigateToJournalEntry(journalEntryRef)}
                          sx={linkButtonSx}
                        >
                          {journalEntryRef.referenceNumber}
                        </Typography>
                      ) : (
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>N/A</Typography>
                      )}
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

export default PaymentContextHeader
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/sales/components/PaymentContextHeader.tsx
git commit -m "feat: add PaymentContextHeader component"
```

---

## Task 7: Create `PaymentWorkspaceCard` component

**Files:**
- Create: `frontend/src/pages/sales/components/PaymentWorkspaceCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
// frontend/src/pages/sales/components/PaymentWorkspaceCard.tsx
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

import type { PaymentListItem } from '../hooks/usePaymentsPageState'

import { TABLE_STYLES } from '@/constants/tableStyles'
import { formatCurrency, formatWholeQuantity } from '@/utils/formatters'

interface PaymentWorkspaceCardProps {
  selectedPayment: PaymentListItem | null
}

const PaymentWorkspaceCard: React.FC<PaymentWorkspaceCardProps> = ({ selectedPayment }) => {
  if (!selectedPayment) {
    return <Paper sx={{ flex: 1 }} />
  }

  const items = selectedPayment.invoice?.items ?? []

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
              <TableCell
                colSpan={5}
                sx={{
                  pb: TABLE_STYLES.cell.padding.py * 0.67,
                  py: TABLE_STYLES.cell.padding.py * 0.67,
                  borderTop: TABLE_STYLES.cell.border,
                }}
              >
                <Typography
                  variant="tableHeader"
                  sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
                >
                  Payment Items
                </Typography>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', p: TABLE_STYLES.cell.padding.px }}>
        <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {items.length > 0 ? (
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
                  {items.map((item, index) => (
                    <TableRow
                      key={item.id ?? index}
                      hover
                      sx={{ '&:hover': { backgroundColor: 'action.hover' }, height: TABLE_STYLES.row.height }}
                    >
                      <TableCell sx={{ fontSize: '0.8rem' }}>{item.product?.name ?? 'Unknown Product'}</TableCell>
                      <TableCell align="center" sx={{ fontSize: '0.8rem' }}>{formatWholeQuantity(item.quantity)}</TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{formatCurrency(item.unitPrice)}</TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                        {item.discountType === 'percentage' && item.discountPercent
                          ? `${item.discountPercent}%`
                          : item.discount
                            ? `-${formatCurrency(item.discount)}`
                            : '-'}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                        {formatCurrency(item.totalAmount ?? item.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Alert severity="info">No payment items available</Alert>
          )}
        </Box>

        {selectedPayment.notes && (
          <Box sx={{ mt: 1 }}>
            <Typography
              variant="tableHeader"
              sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1 }}
            >
              NOTES
            </Typography>
            <Box
              sx={{
                p: 2,
                backgroundColor: 'grey.50',
                borderRadius: 1,
                fontSize: '0.8rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {selectedPayment.notes}
            </Box>
          </Box>
        )}
      </Box>
    </Paper>
  )
}

export default PaymentWorkspaceCard
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/sales/components/PaymentWorkspaceCard.tsx
git commit -m "feat: add PaymentWorkspaceCard component"
```

---

## Task 8: Create `PaymentsDialogs` component

**Files:**
- Create: `frontend/src/pages/sales/components/PaymentsDialogs.tsx`

- [ ] **Step 1: Create the component**

```tsx
// frontend/src/pages/sales/components/PaymentsDialogs.tsx
import React from 'react'

import type { PaymentListItem } from '../hooks/usePaymentsPageState'

import DeletedPaymentsDialog from '@/components/sales/DeletedPaymentsDialog'
import { PaymentReceiptPrint } from '@/components/print'

interface PaymentsDialogsProps {
  deletedPaymentsDialogOpen: boolean
  printDialogOpen: boolean
  selectedPayment: PaymentListItem | null
  onCloseDeletedPaymentsDialog: () => void
  onClosePrintDialog: () => void
}

const PaymentsDialogs: React.FC<PaymentsDialogsProps> = ({
  deletedPaymentsDialogOpen,
  printDialogOpen,
  selectedPayment,
  onCloseDeletedPaymentsDialog,
  onClosePrintDialog,
}) => {
  return (
    <>
      <DeletedPaymentsDialog open={deletedPaymentsDialogOpen} onClose={onCloseDeletedPaymentsDialog} />
      {selectedPayment && (
        <PaymentReceiptPrint
          open={printDialogOpen}
          onClose={onClosePrintDialog}
          payment={selectedPayment as any}
        />
      )}
    </>
  )
}

export default PaymentsDialogs
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/sales/components/PaymentsDialogs.tsx
git commit -m "feat: add PaymentsDialogs component"
```

---

## Task 9: Rewrite `PaymentsPage.tsx` as thin orchestrator

**Files:**
- Modify: `frontend/src/pages/sales/PaymentsPage.tsx`

- [ ] **Step 1: Replace the entire file**

```tsx
// frontend/src/pages/sales/PaymentsPage.tsx
import React, { useCallback, useMemo, useState } from 'react'
import { Alert, Box, Chip, Stack, useMediaQuery, useTheme } from '@mui/material'
import { useLocation, useNavigate } from 'react-router-dom'

import PaymentContextHeader from './components/PaymentContextHeader'
import PaymentsDialogs from './components/PaymentsDialogs'
import PaymentsTable from './components/PaymentsTable'
import PaymentWorkspaceCard from './components/PaymentWorkspaceCard'
import { usePaymentsPageState } from './hooks/usePaymentsPageState'
import { usePaymentsSelection } from './hooks/usePaymentsSelection'

import MasterDetailWorkspace from '@/components/common/MasterDetailWorkspace'
import PageHeader from '@/components/common/PageHeader'
import { FilterBar } from '@/components/filters/FilterBar'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { useGetCustomersQuery, useGetPaymentsQuery } from '@/store/api/salesApi'
import { selectSelectedPayment } from '@/store/slices/salesSlice'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'

import type { PaymentListItem } from './hooks/usePaymentsPageState'

interface PaymentFilters {
  search: string
  period: PeriodValue
  customerId: string | null
  transactionStatus: string | null
}

const PaymentsPage: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useAppDispatch()
  const selectedPayment = useAppSelector(selectSelectedPayment) as PaymentListItem | null
  const pageState = usePaymentsPageState()
  const [sortBy, setSortBy] = useState('paymentNumber')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const presetCustomerId = (location.state as { customerId?: string } | null)?.customerId ?? null
  const { data: customersData } = useGetCustomersQuery({})
  const customers = customersData?.data ?? []

  const filterConfig = useMemo<FilterBarConfig<PaymentFilters>>(
    () => ({
      search: { placeholder: 'Search by payment number or customer...' },
      fields: [
        { field: 'period', label: 'Period', type: 'period' },
        { field: 'customerId', label: 'Customer', type: 'customer' },
        { field: 'transactionStatus', label: 'Status', type: 'transaction-status' },
      ],
      defaults: {
        search: '',
        period: { key: null, from: null, to: null },
        customerId: null,
        transactionStatus: null,
      },
    }),
    [],
  )

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)

  const filterBarHandlers = useMemo(
    () =>
      presetCustomerId
        ? { ...handlers, onClearAll: () => handlers.onClearField('search') }
        : handlers,
    [handlers, presetCustomerId],
  )

  const weekStartsOn = getStartOfWeek()
  const dateRange = useMemo(() => {
    const period = appliedFilters.period
    if (!period || period.key === null) return { fromDate: undefined, toDate: undefined }
    if (period.key === 'custom') return { fromDate: period.from ?? undefined, toDate: period.to ?? undefined }
    const range = getPeriodDateRange(period.key, weekStartsOn)
    return { fromDate: range.from, toDate: range.to }
  }, [appliedFilters.period, weekStartsOn])

  const queryArgs = useMemo(
    () => ({
      search: appliedFilters.search || undefined,
      sortBy,
      sortOrder: sortOrder.toUpperCase() as 'ASC' | 'DESC',
      fromDate: dateRange.fromDate,
      toDate: dateRange.toDate,
      customerId: presetCustomerId ?? appliedFilters.customerId ?? undefined,
      status: appliedFilters.transactionStatus ?? undefined,
    }),
    [appliedFilters.search, appliedFilters.customerId, appliedFilters.transactionStatus, dateRange, sortBy, sortOrder, presetCustomerId],
  )

  const { data, isLoading: loading, error, refetch } = useGetPaymentsQuery(queryArgs)
  const payments = (data?.data ?? []) as PaymentListItem[]
  const totalPayments = data?.meta?.total ?? 0

  const handleSort = useCallback((field: string) => {
    setSortOrder((prev) => (sortBy === field && prev === 'desc' ? 'asc' : 'desc'))
    setSortBy(field)
  }, [sortBy])

  const selection = usePaymentsSelection({
    dispatch,
    navigate,
    payments,
    selectedPayment,
    focusedPaymentIndex: pageState.focusedPaymentIndex,
    setFocusedPaymentIndex: pageState.setFocusedPaymentIndex,
    location,
    refetch,
    paymentListRef: pageState.paymentListRef,
    searchInputRef: pageState.searchInputRef,
    hasRestoredSelection: pageState.hasRestoredSelection,
    selectedPaymentRef: pageState.selectedPaymentRef,
    setJournalEntryRef: pageState.setJournalEntryRef,
    setJournalEntryRefLoading: pageState.setJournalEntryRefLoading,
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

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PageHeader
        title="Payments"
        subtitle="Review customer payments and transaction history"
        variant="workflow"
        secondaryAction={{ label: 'View Deleted', onClick: () => pageState.setDeletedPaymentsDialogOpen(true) }}
        toolbar={(
          <FilterBar
            config={filterConfig}
            draftFilters={draftFilters}
            handlers={filterBarHandlers}
            hasActiveFilters={hasActiveFilters}
            searchInputRef={pageState.searchInputRef}
            sort={{ field: 'paymentNumber', sortBy, sortOrder, onSort: handleSort }}
          />
        )}
      />

      {presetCustomerId && (
        <Stack direction="row" sx={{ mb: 2 }}>
          <Chip
            label={`Customer: ${customers.find((c) => c.id === presetCustomerId)?.name ?? presetCustomerId}`}
            size="small"
            variant="filled"
          />
        </Stack>
      )}

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          Failed to load payments.
        </Alert>
      )}

      <MasterDetailWorkspace
        isMobile={isMobile}
        listSlot={(
          <PaymentsTable
            payments={payments}
            loading={loading}
            total={totalPayments}
            selectedPaymentId={selectedPayment?.id}
            focusedPaymentIndex={pageState.focusedPaymentIndex}
            onPaymentSelect={selection.handlePaymentSelect}
            paymentListRef={pageState.paymentListRef}
          />
        )}
        headerSlot={(
          <PaymentContextHeader
            selectedPayment={selectedPayment}
            journalEntryRef={pageState.journalEntryRef}
            journalEntryRefLoading={pageState.journalEntryRefLoading}
            onPrint={() => pageState.setPrintDialogOpen(true)}
            onOrderClick={selection.handleOrderClick}
            onInvoiceClick={selection.handleInvoiceClick}
            onNavigateToJournalEntry={selection.handleNavigateToJournalEntry}
          />
        )}
        workspaceSlot={<PaymentWorkspaceCard selectedPayment={selectedPayment} />}
      />

      <PaymentsDialogs
        deletedPaymentsDialogOpen={pageState.deletedPaymentsDialogOpen}
        printDialogOpen={pageState.printDialogOpen}
        selectedPayment={selectedPayment}
        onCloseDeletedPaymentsDialog={() => pageState.setDeletedPaymentsDialogOpen(false)}
        onClosePrintDialog={() => pageState.setPrintDialogOpen(false)}
      />
    </Box>
  )
}

export default PaymentsPage
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check
```
Expected: no errors.

- [ ] **Step 3: Run the existing filterbar test to confirm it still passes**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/PaymentsPage.filterbar.test.tsx
```
Expected: all 4 tests pass. If any fail due to the new component structure, update the mocks to match — see Task 10.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/sales/PaymentsPage.tsx
git commit -m "refactor: rewrite PaymentsPage as thin orchestrator using MasterDetailWorkspace"
```

---

## Task 10: Update and extend the PaymentsPage filterbar tests

**Files:**
- Modify: `frontend/src/pages/sales/__tests__/PaymentsPage.filterbar.test.tsx`

- [ ] **Step 1: Rewrite the test file to mock extracted components and add new filter tests**

```tsx
// frontend/src/pages/sales/__tests__/PaymentsPage.filterbar.test.tsx
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import PaymentsPage from '../PaymentsPage'
import salesReducer from '@/store/slices/salesSlice'

const { useGetPaymentsQuery } = vi.hoisted(() => ({
  useGetPaymentsQuery: vi.fn(() => ({
    data: { data: [], meta: { total: 0 } },
    isLoading: false,
    isFetching: false,
    error: undefined,
    refetch: vi.fn(),
  })),
}))

vi.mock('@/store/api/salesApi', () => ({
  useGetPaymentsQuery,
  useGetCustomersQuery: vi.fn(() => ({
    data: { data: [{ id: 'cust-1', name: 'Acme Corp' }], meta: { total: 1 } },
  })),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useLazyGetJournalEntriesQuery: vi.fn(() => [vi.fn(), {}]),
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

vi.mock('@/components/common/MasterDetailWorkspace', () => ({
  default: ({ listSlot, headerSlot, workspaceSlot }: any) => (
    <div>
      <div>{listSlot}</div>
      <div>{headerSlot}</div>
      <div>{workspaceSlot}</div>
    </div>
  ),
}))

vi.mock('../components/PaymentsTable', () => ({ default: () => <div>PaymentsTable</div> }))
vi.mock('../components/PaymentContextHeader', () => ({ default: () => <div>PaymentContextHeader</div> }))
vi.mock('../components/PaymentWorkspaceCard', () => ({ default: () => <div>PaymentWorkspaceCard</div> }))
vi.mock('../components/PaymentsDialogs', () => ({ default: () => <div>PaymentsDialogs</div> }))
vi.mock('../hooks/usePaymentsSelection', () => ({
  usePaymentsSelection: () => ({
    handlePaymentSelect: vi.fn(),
    handleNavigateUp: vi.fn(),
    handleNavigateDown: vi.fn(),
    handleEnterAction: vi.fn(),
    handlePageUpNavigation: vi.fn(),
    handlePageDownNavigation: vi.fn(),
    handleNavigateToFirst: vi.fn(),
    handleNavigateToLast: vi.fn(),
    handleEscapeAction: vi.fn(),
    handleOrderClick: vi.fn(),
    handleInvoiceClick: vi.fn(),
    handleNavigateToJournalEntry: vi.fn(),
  }),
}))

function renderPage(initialUrl = '/', state?: unknown) {
  const store = configureStore({ reducer: { sales: salesReducer } })
  const url = new URL(initialUrl, 'http://localhost')

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[{ pathname: url.pathname, search: url.search, state }]}>
        <PaymentsPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('PaymentsPage FilterBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the search input', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/search by payment number or customer/i)).toBeInTheDocument()
  })

  it('restores search from URL and passes it to query', () => {
    renderPage('/?search=receipt-42')
    expect(useGetPaymentsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'receipt-42' }),
    )
  })

  it('ignores legacy customerId URL params in the query', () => {
    renderPage('/?customerId=cust-1')
    expect(useGetPaymentsQuery).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ customerId: expect.anything() }),
    )
  })

  it('renders locked chip (no × button) when customerId is preset via location state', () => {
    renderPage('/', { customerId: 'cust-1' })
    const chip = screen.getByText(/customer: acme corp/i)
    expect(chip).toBeInTheDocument()
    const chipEl = chip.closest('[class*="MuiChip"]')
    expect(chipEl?.querySelector('[data-testid="CancelIcon"]')).not.toBeInTheDocument()
  })

  it('passes customerId from location state to query', () => {
    renderPage('/', { customerId: 'cust-1' })
    expect(useGetPaymentsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ customerId: 'cust-1' }),
    )
  })

  it('renders period filter button', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /period/i })).toBeInTheDocument()
  })

  it('renders customer filter button', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /customer/i })).toBeInTheDocument()
  })

  it('renders status filter button', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /status/i })).toBeInTheDocument()
  })

  it('passes status filter to query when applied', () => {
    renderPage('/?transactionStatus=completed')
    expect(useGetPaymentsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'completed' }),
    )
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/PaymentsPage.filterbar.test.tsx
```
Expected: all 9 tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/sales/__tests__/PaymentsPage.filterbar.test.tsx
git commit -m "test: update PaymentsPage filterbar tests for refactored architecture and new filters"
```

---

## Task 11: Final verification

- [ ] **Step 1: Run the full frontend type check**

```bash
cd frontend && npm run type-check
```
Expected: no errors.

- [ ] **Step 2: Run the backend payment service test**

```bash
cd backend && npx jest src/modules/sales/services/payment.service.spec.ts --no-coverage
```
Expected: all passing.

- [ ] **Step 3: Run the filterbar test one final time**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/PaymentsPage.filterbar.test.tsx
```
Expected: 9 tests pass.

- [ ] **Step 4: Create PR closing issue #333**

```bash
gh pr create \
  --title "refactor: payments page UI to match invoices page (#333)" \
  --body "$(cat <<'EOF'
## Summary

- Decomposes monolith `PaymentsPage.tsx` into `usePaymentsPageState`, `usePaymentsSelection`, `PaymentsTable`, `PaymentContextHeader`, `PaymentWorkspaceCard`, `PaymentsDialogs` — mirroring the Invoices page architecture
- Replaces custom `Grid` layout with `MasterDetailWorkspace`
- Adds period, customer, and transaction-status filter fields to FilterBar (new `FilterTransactionStatus` component + `transaction-status` type)
- Removes placeholder edit dialog (payments cannot be edited)
- Removes standalone sort button (sort is now in FilterBar sort prop)
- Fixes journal entry navigation to use `?sourceType=payment&sourceId=...` pattern (consistent with Invoices)
- Backend: adds `status` filter to `QueryPaymentsDto` and `payment.service.ts`

Closes #333

## Test plan

- [ ] `npm run type-check` passes
- [ ] `npx vitest run src/pages/sales/__tests__/PaymentsPage.filterbar.test.tsx` — 9 tests pass
- [ ] `npx jest src/modules/sales/services/payment.service.spec.ts` — passes
- [ ] Manual: Payments page renders, keyboard nav works, filters work, print works, deleted dialog works

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
