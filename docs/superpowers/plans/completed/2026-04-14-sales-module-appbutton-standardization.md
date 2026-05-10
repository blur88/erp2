# Sales Module AppButton Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all MUI `Button` and `IconButton` command-action buttons in the Sales module's four context header components with the project's `AppButton` component.

**Architecture:** Pure mechanical refactor — no new components, no logic changes. Each context header gets its `IconButton`/`Button` imports swapped for `AppButton`, its `actionIconSx` constant removed, and its buttons replaced with labeled `AppButton` elements using appropriate `variant` and `size` props.

**Tech Stack:** React 19, TypeScript, MUI v7, `AppButton` (`frontend/src/components/common/AppButton.tsx`)

---

## File Map

| File | Change |
|---|---|
| `frontend/src/pages/sales/components/CustomerContextHeader.tsx` | Replace Edit + Delete `IconButton` → `AppButton` |
| `frontend/src/pages/sales/components/OrderContextHeader.tsx` | Replace Edit + Delete + Print `IconButton` + Pay/Fulfill `Button` → `AppButton` |
| `frontend/src/pages/sales/components/InvoiceContextHeader.tsx` | Replace Print `IconButton` → `AppButton` |
| `frontend/src/pages/sales/components/PaymentContextHeader.tsx` | Replace Print `IconButton` → `AppButton` |

---

### Task 1: Refactor CustomerContextHeader

**Files:**
- Modify: `frontend/src/pages/sales/components/CustomerContextHeader.tsx`
- Test: `frontend/src/pages/sales/components/__tests__/CustomerContextHeader.test.tsx`

- [ ] **Step 1: Run existing tests to establish baseline**

```bash
cd frontend && npx vitest run src/pages/sales/components/__tests__/CustomerContextHeader.test.tsx
```

Expected: all tests pass.

- [ ] **Step 2: Refactor the component**

Replace the entire file content with:

```tsx
import React from 'react'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'
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
import Grid from '@mui/material/Grid'

import { AppButton } from '@/components/common/AppButton'
import { TABLE_STYLES } from '@/constants/tableStyles'
import type { Customer } from '@/types'
import { CustomerType } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface CustomerContextHeaderProps {
  selectedCustomer: Customer | null
  onEdit: () => void
  onDelete: () => void
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
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <AppButton
            size="small"
            variant="secondary"
            startIcon={<EditIcon />}
            title="Edit Customer"
            onClick={onEdit}
          >
            Edit
          </AppButton>
          <AppButton
            size="small"
            variant="danger"
            startIcon={<DeleteIcon />}
            title="Delete Customer"
            onClick={onDelete}
          >
            Delete
          </AppButton>
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
                      <Typography
                        variant="h6"
                        sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}
                      >
                        Customer Information
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Type</TableCell>
                    <TableCell sx={valueCellSx}>
                      {selectedCustomer.type === CustomerType.BUSINESS ? 'Business' : 'Individual'}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Status</TableCell>
                    <TableCell
                      sx={{
                        ...valueCellSx,
                        color: selectedCustomer.isActive ? 'success.main' : 'text.disabled',
                      }}
                    >
                      {selectedCustomer.isActive ? 'Active' : 'Inactive'}
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
                    <TableCell sx={valueCellSx}>{selectedCustomer.priceList?.name || '—'}</TableCell>
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
                      <Typography
                        variant="h6"
                        sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}
                      >
                        Account Summary
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Total Orders</TableCell>
                    <TableCell sx={valueCellSx}>{selectedCustomer.totalOrders ?? 0}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Total Sales</TableCell>
                    <TableCell sx={valueCellSx}>
                      {formatCurrency(selectedCustomer.totalSales ?? 0)}
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Avg Order Value</TableCell>
                    <TableCell sx={valueCellSx}>
                      {formatCurrency(selectedCustomer.averageOrderValue ?? 0)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>First Purchase</TableCell>
                    <TableCell sx={valueCellSx}>
                      {selectedCustomer.firstPurchaseDate
                        ? formatDate(selectedCustomer.firstPurchaseDate)
                        : '—'}
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Last Purchase</TableCell>
                    <TableCell sx={valueCellSx}>
                      {selectedCustomer.lastPurchaseDate
                        ? formatDate(selectedCustomer.lastPurchaseDate)
                        : '—'}
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

export default CustomerContextHeader
```

- [ ] **Step 3: Run tests to verify they still pass**

```bash
cd frontend && npx vitest run src/pages/sales/components/__tests__/CustomerContextHeader.test.tsx
```

Expected: all tests pass.

- [ ] **Step 4: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep CustomerContextHeader
```

Expected: no errors for this file.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/sales/components/CustomerContextHeader.tsx
git commit -m "refactor(sales): replace IconButton with AppButton in CustomerContextHeader"
```

---

### Task 2: Refactor OrderContextHeader

**Files:**
- Modify: `frontend/src/pages/sales/components/OrderContextHeader.tsx`

- [ ] **Step 1: Replace the file content**

```tsx
import React from 'react'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'
import { default as PrintIcon } from '@mui/icons-material/Print'
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
import Grid from '@mui/material/Grid'

import { AppButton } from '@/components/common/AppButton'
import { TABLE_STYLES } from '@/constants/tableStyles'
import type { SalesOrder } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface JournalEntryRef {
  id: string
  referenceNumber: string
}

interface OrderContextHeaderProps {
  selectedOrder: SalesOrder | null
  isLoading: boolean
  journalEntryRef: JournalEntryRef | null
  journalEntryRefLoading: boolean
  onEditOrder: () => void
  onDeleteOrder: () => void
  onPrintOrder: () => void
  onNavigateToInvoice: (invoice: any, event?: React.MouseEvent) => void
  onNavigateToPayment: (paymentId: string, event?: React.MouseEvent) => void
  onNavigateToJournalEntry: () => void
  onRefundOrder: () => void
  onUnpayOrder: () => void
  onOpenPaymentDialog: () => void
  onFulfillOrder: () => void
  onUnfulfillOrder: () => void
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

const OrderContextHeader: React.FC<OrderContextHeaderProps> = ({
  selectedOrder,
  isLoading,
  journalEntryRef,
  journalEntryRefLoading,
  onEditOrder,
  onDeleteOrder,
  onPrintOrder,
  onNavigateToInvoice,
  onNavigateToPayment,
  onNavigateToJournalEntry,
  onRefundOrder,
  onUnpayOrder,
  onOpenPaymentDialog,
  onFulfillOrder,
  onUnfulfillOrder,
}) => {
  if (!selectedOrder) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
          Select an order to view details
        </Typography>
      </Paper>
    )
  }

  const allPaymentsWithDuplicates = [
    ...(((selectedOrder as any).directPayments || []) as any[]),
    ...((selectedOrder.invoices && selectedOrder.invoices.length > 0
      ? selectedOrder.invoices.flatMap((invoice: any) => invoice.payments || [])
      : []) as any[]),
  ]
  const allPayments = allPaymentsWithDuplicates.filter(
    (payment, index, self) => index === self.findIndex((item) => item.id === payment.id),
  )
  const balance = (selectedOrder.totalAmount || 0) - (selectedOrder.paidAmount || 0)
  const isOverpaid = (selectedOrder.paidAmount || 0) > (selectedOrder.totalAmount || 0)

  const payLabel = isOverpaid
    ? 'Refund'
    : selectedOrder.isPaidInFull
      ? 'Unpay'
      : selectedOrder.paidAmount > 0
        ? 'Pay More'
        : 'Pay'
  const payVariant: 'primary' | 'warning' =
    isOverpaid || selectedOrder.isPaidInFull ? 'warning' : 'primary'
  const payHandler = isOverpaid
    ? onRefundOrder
    : selectedOrder.isPaidInFull
      ? onUnpayOrder
      : onOpenPaymentDialog

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
          SO Details - {selectedOrder.orderNumber}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <AppButton
            size="small"
            variant="secondary"
            startIcon={<EditIcon />}
            title="Edit Order"
            onClick={onEditOrder}
          >
            Edit
          </AppButton>
          <AppButton
            size="small"
            variant="danger"
            startIcon={<DeleteIcon />}
            title="Delete Order"
            onClick={onDeleteOrder}
          >
            Delete
          </AppButton>
          <AppButton
            size="small"
            variant="secondary"
            startIcon={<PrintIcon />}
            title="Print Order"
            onClick={onPrintOrder}
          >
            Print
          </AppButton>
        </Box>
      </Box>
      <Box sx={{ p: TABLE_STYLES.cell.padding.px }}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={detailTableSx}>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={2} sx={{ pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}>
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                        SO Information
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Customer Name</TableCell>
                    <TableCell sx={valueCellSx}>{selectedOrder.customer?.name || 'Unknown Customer'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>SO Date</TableCell>
                    <TableCell sx={valueCellSx}>{formatDate(selectedOrder.orderDate)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Invoice No</TableCell>
                    <TableCell sx={valueCellSx}>
                      {selectedOrder.invoices && selectedOrder.invoices.length > 0 ? (
                        selectedOrder.invoices.map((invoice: any, index: number) => (
                          <Box key={invoice.id} component="span">
                            <Typography component="button" onClick={(event) => onNavigateToInvoice(invoice, event)} sx={{ fontSize: '0.8rem', color: 'primary.main', cursor: 'pointer', textDecoration: 'none', border: 'none', background: 'none', padding: 0 }}>
                              {invoice.invoiceNumber}
                            </Typography>
                            {index < selectedOrder.invoices!.length - 1 && <Typography component="span" sx={{ fontSize: '0.8rem' }}>,</Typography>}
                          </Box>
                        ))
                      ) : (
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>
                          {selectedOrder.isFulfilled ? 'Pending' : 'Not fulfilled'}
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Payment No</TableCell>
                    <TableCell sx={valueCellSx}>
                      {allPayments.length === 0 ? (
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>
                          No payments
                        </Typography>
                      ) : (
                        <Stack spacing={0.75}>
                          {allPayments.map((payment: any) => (
                            <Box key={payment.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                              <Typography component="button" onClick={(event) => onNavigateToPayment(payment.id, event)} sx={{ fontSize: '0.8rem', color: 'primary.main', cursor: 'pointer', textDecoration: 'none', border: 'none', background: 'none', padding: 0 }}>
                                {payment.paymentNumber}
                              </Typography>
                            </Box>
                          ))}
                        </Stack>
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Journal Entry No</TableCell>
                    <TableCell sx={valueCellSx}>
                      {!selectedOrder.isFulfilled ? (
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>Not fulfilled</Typography>
                      ) : journalEntryRefLoading ? (
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>Loading...</Typography>
                      ) : journalEntryRef ? (
                        <Typography component="button" onClick={onNavigateToJournalEntry} sx={{ fontSize: '0.8rem', color: 'primary.main', cursor: 'pointer', textDecoration: 'none', border: 'none', background: 'none', padding: 0 }}>
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

          <Grid size={{ xs: 12, md: 6 }}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={detailTableSx}>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={2} sx={{ pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}>
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                        Payment and Fulfillment
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Sub-total</TableCell>
                    <TableCell sx={valueCellSx}>
                      {formatCurrency(selectedOrder.items?.reduce((sum: number, item: any) => sum + (Number(item.totalAmount) || 0), 0) || 0)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Shipping</TableCell>
                    <TableCell sx={valueCellSx}>{formatCurrency((selectedOrder as any).shippingAmount || 0)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Total</TableCell>
                    <TableCell sx={valueCellSx}>{formatCurrency(selectedOrder.totalAmount || 0)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Paid</TableCell>
                    <TableCell sx={valueCellSx}>{formatCurrency(selectedOrder.paidAmount || 0)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Balance</TableCell>
                    <TableCell sx={valueCellSx}>{balance < 0 ? `-${formatCurrency(Math.abs(balance))}` : formatCurrency(balance)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={2} sx={{ textAlign: 'center' }}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'center' }}>
                        <AppButton
                          size="small"
                          variant={payVariant}
                          onClick={payHandler}
                          disabled={isLoading || selectedOrder.isFulfilled}
                          sx={{ minWidth: 110 }}
                        >
                          {payLabel}
                        </AppButton>
                        <AppButton
                          size="small"
                          variant={selectedOrder.isFulfilled ? 'warning' : 'success'}
                          onClick={selectedOrder.isFulfilled ? onUnfulfillOrder : onFulfillOrder}
                          disabled={isLoading || (!selectedOrder.isFulfilled && !selectedOrder.isPaidInFull)}
                          sx={{ minWidth: 110 }}
                        >
                          {selectedOrder.isFulfilled ? 'Unfulfill' : 'Fulfill'}
                        </AppButton>
                      </Stack>
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

export default OrderContextHeader
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep OrderContextHeader
```

Expected: no errors for this file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/sales/components/OrderContextHeader.tsx
git commit -m "refactor(sales): replace Button/IconButton with AppButton in OrderContextHeader"
```

---

### Task 3: Refactor InvoiceContextHeader

**Files:**
- Modify: `frontend/src/pages/sales/components/InvoiceContextHeader.tsx`

- [ ] **Step 1: Replace the file content**

```tsx
import React from 'react'
import { default as PrintIcon } from '@mui/icons-material/Print'
import {
  Box,
  Chip,
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

import type { InvoiceJournalEntryRef, InvoiceListItem } from '../hooks/useInvoicesPageState'

import { AppButton } from '@/components/common/AppButton'
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
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
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
        <AppButton
          size="small"
          variant="secondary"
          startIcon={<PrintIcon />}
          title="Print Invoice"
          onClick={onPrint}
        >
          Print
        </AppButton>
      </Box>

      <Box sx={{ p: TABLE_STYLES.cell.padding.px }}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
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

          <Grid size={{ xs: 12, md: 6 }}>
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

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep InvoiceContextHeader
```

Expected: no errors for this file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/sales/components/InvoiceContextHeader.tsx
git commit -m "refactor(sales): replace IconButton with AppButton in InvoiceContextHeader"
```

---

### Task 4: Refactor PaymentContextHeader

**Files:**
- Modify: `frontend/src/pages/sales/components/PaymentContextHeader.tsx`

- [ ] **Step 1: Replace the file content**

```tsx
import React from 'react'
import { default as PrintIcon } from '@mui/icons-material/Print'
import {
  Box,
  Chip,
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

import { AppButton } from '@/components/common/AppButton'
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
  journalEntryRefLoading,
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
        <AppButton
          size="small"
          variant="secondary"
          startIcon={<PrintIcon />}
          title="Print Receipt"
          onClick={onPrint}
        >
          Print
        </AppButton>
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
                      {journalEntryRefLoading ? (
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>Loading...</Typography>
                      ) : journalEntryRef ? (
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

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep PaymentContextHeader
```

Expected: no errors for this file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/sales/components/PaymentContextHeader.tsx
git commit -m "refactor(sales): replace IconButton with AppButton in PaymentContextHeader"
```

---

### Task 5: Final verification

- [ ] **Step 1: Confirm no MUI Button/IconButton remains in these files**

```bash
grep -n "IconButton\|<Button" \
  frontend/src/pages/sales/components/CustomerContextHeader.tsx \
  frontend/src/pages/sales/components/OrderContextHeader.tsx \
  frontend/src/pages/sales/components/InvoiceContextHeader.tsx \
  frontend/src/pages/sales/components/PaymentContextHeader.tsx
```

Expected: no output.

- [ ] **Step 2: Full type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Run CustomerContextHeader tests**

```bash
cd frontend && npx vitest run src/pages/sales/components/__tests__/CustomerContextHeader.test.tsx
```

Expected: all tests pass.

- [ ] **Step 4: Create PR**

```bash
gh pr create \
  --title "refactor(sales): standardize context header buttons with AppButton (#367)" \
  --body "Replaces all MUI \`Button\` and \`IconButton\` command-action buttons in the Sales module context headers with \`AppButton\`. Covers CustomerContextHeader, OrderContextHeader, InvoiceContextHeader, and PaymentContextHeader.

Closes #367"
```
