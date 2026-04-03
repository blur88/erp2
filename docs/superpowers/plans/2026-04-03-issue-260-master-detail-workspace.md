# Master-Detail-Items Workspace Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single scrolling detail panel in Sales Orders and Purchase Orders with a triple-card workspace (order list | context header | items workspace) that keeps all data visible simultaneously on desktop.

**Architecture:** A pure layout shell component `MasterDetailWorkspace` accepts three named slots and handles the desktop/mobile split. Each existing detail panel is split into a `ContextHeader` (metadata + actions) and a `WorkspaceCard` (items table). Page components wire the slots together; no hooks or API logic changes.

**Tech Stack:** React 19, MUI v7 (`Box`, `Paper`, `Grid` legacy), TypeScript strict: false, RTK Query (no changes)

**Spec:** `docs/superpowers/specs/2026-04-03-issue-260-master-detail-workspace-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `frontend/src/components/common/MasterDetailWorkspace.tsx` | Pure layout shell — 3-slot grid, desktop/mobile |
| Create | `frontend/src/pages/sales/components/OrderContextHeader.tsx` | SO metadata, financials, Pay/Fulfill actions |
| Create | `frontend/src/pages/sales/components/OrderWorkspaceCard.tsx` | SO items table with independent scroll |
| Delete | `frontend/src/pages/sales/components/OrderDetailsPanel.tsx` | Replaced by the two above |
| Modify | `frontend/src/pages/sales/OrdersPage.tsx` | Swap Grid+panel for MasterDetailWorkspace |
| Create | `frontend/src/pages/purchasing/components/PurchaseOrderContextHeader.tsx` | PO metadata, financials, Pay/Receive actions |
| Create | `frontend/src/pages/purchasing/components/PurchaseOrderWorkspaceCard.tsx` | PO items table with independent scroll |
| Delete | `frontend/src/pages/purchasing/components/PurchaseOrderDetailsPanel.tsx` | Replaced by the two above |
| Modify | `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx` | Swap Grid+panel for MasterDetailWorkspace |

---

## Task 1: Create `MasterDetailWorkspace` layout shell

**Files:**
- Create: `frontend/src/components/common/MasterDetailWorkspace.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/components/common/MasterDetailWorkspace.tsx`:

```tsx
import React from 'react'
import { Box } from '@mui/material'

interface MasterDetailWorkspaceProps {
  listSlot: React.ReactNode
  headerSlot: React.ReactNode
  workspaceSlot: React.ReactNode
  isMobile: boolean
}

const MasterDetailWorkspace: React.FC<MasterDetailWorkspaceProps> = ({
  listSlot,
  headerSlot,
  workspaceSlot,
  isMobile,
}) => {
  if (isMobile) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {listSlot}
        {headerSlot}
        {workspaceSlot}
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'row', height: 'calc(100vh - 300px)', gap: 3 }}>
      <Box sx={{ width: '25%', flexShrink: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {listSlot}
      </Box>
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
        {headerSlot}
        <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {workspaceSlot}
        </Box>
      </Box>
    </Box>
  )
}

export default MasterDetailWorkspace
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep MasterDetailWorkspace
```

Expected: no output (no errors)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/common/MasterDetailWorkspace.tsx
git commit -m "feat: add MasterDetailWorkspace layout shell component"
```

---

## Task 2: Create `OrderContextHeader` (Sales)

**Files:**
- Create: `frontend/src/pages/sales/components/OrderContextHeader.tsx`
- Reference: `frontend/src/pages/sales/components/OrderDetailsPanel.tsx` (read for props/JSX)

- [ ] **Step 1: Create the component**

Create `frontend/src/pages/sales/components/OrderContextHeader.tsx` with the metadata and actions section extracted from `OrderDetailsPanel`. This is the top portion of the existing panel — everything except the "SO Items" table and notes:

```tsx
import React from 'react'
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  Print as PrintIcon,
} from '@mui/icons-material'
import {
  Box,
  Button,
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

const actionIconSx = {
  height: `${TABLE_STYLES.row.height * 0.75}px`,
  width: `${TABLE_STYLES.row.height * 0.75}px`,
  minHeight: 20,
  minWidth: 20,
  p: 0.125,
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
        <Typography variant="h6" color="text.secondary">
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

  return (
    <Paper>
      <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          SO Details - {selectedOrder.orderNumber}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <IconButton size="small" title="Edit Order" onClick={onEditOrder} sx={{ ...actionIconSx, color: 'primary.main' }}>
            <EditIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
          <IconButton size="small" title="Delete Order" onClick={onDeleteOrder} sx={{ ...actionIconSx, color: 'error.main' }}>
            <DeleteIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
          <IconButton size="small" title="Print Order" onClick={onPrintOrder} sx={{ ...actionIconSx, color: 'info.main' }}>
            <PrintIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
        </Box>
      </Box>

      <Box sx={{ p: TABLE_STYLES.cell.padding.px }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={{ tableLayout: 'fixed', '& .MuiTableCell-root': { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px, '&:nth-of-type(1)': { width: '40%' }, '&:nth-of-type(2)': { width: '60%' } } }}>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={2} sx={{ pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}>
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>SO Information</Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>Customer Name</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{selectedOrder.customer?.name || 'Unknown Customer'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>SO Date</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{formatDate(selectedOrder.orderDate)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>Invoice No</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>
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
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>Payment No</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>
                      {allPayments.length === 0 ? (
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>No payments</Typography>
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
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>Journal Entry No</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>
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

          <Grid item xs={12} md={6}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={{ tableLayout: 'fixed', '& .MuiTableCell-root': { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px, '&:nth-of-type(1)': { width: '40%' }, '&:nth-of-type(2)': { width: '60%' } } }}>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={2} sx={{ pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}>
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>Payment and Fulfillment</Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>Sub-total</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>
                      {formatCurrency(selectedOrder.items?.reduce((sum: number, item: any) => sum + (Number(item.totalAmount) || 0), 0) || 0)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>Shipping</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{formatCurrency((selectedOrder as any).shippingAmount || 0)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>Total</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{formatCurrency(selectedOrder.totalAmount || 0)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>Paid</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{formatCurrency(selectedOrder.paidAmount || 0)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>Balance</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{balance < 0 ? `-${formatCurrency(Math.abs(balance))}` : formatCurrency(balance)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={2} sx={{ textAlign: 'center' }}>
                      <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
                        <Button
                          variant="contained"
                          size="small"
                          color={isOverpaid ? 'warning' : selectedOrder.isPaidInFull ? 'warning' : 'primary'}
                          onClick={isOverpaid ? onRefundOrder : selectedOrder.isPaidInFull ? onUnpayOrder : onOpenPaymentDialog}
                          disabled={isLoading || selectedOrder.isFulfilled}
                          sx={{ minWidth: 110 }}
                        >
                          {isOverpaid ? 'Refund' : selectedOrder.isPaidInFull ? 'Unpay' : selectedOrder.paidAmount > 0 ? 'Pay More' : 'Pay'}
                        </Button>
                        <Button
                          variant="contained"
                          size="small"
                          color={selectedOrder.isFulfilled ? 'warning' : 'success'}
                          onClick={selectedOrder.isFulfilled ? onUnfulfillOrder : onFulfillOrder}
                          disabled={isLoading || (!selectedOrder.isFulfilled && !selectedOrder.isPaidInFull)}
                          sx={{ minWidth: 110 }}
                        >
                          {selectedOrder.isFulfilled ? 'Unfulfill' : 'Fulfill'}
                        </Button>
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

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep OrderContextHeader
```

Expected: no output (no errors)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/sales/components/OrderContextHeader.tsx
git commit -m "feat(sales): add OrderContextHeader component"
```

---

## Task 3: Create `OrderWorkspaceCard` (Sales)

**Files:**
- Create: `frontend/src/pages/sales/components/OrderWorkspaceCard.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/pages/sales/components/OrderWorkspaceCard.tsx` with the items table extracted from `OrderDetailsPanel`:

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

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { SalesOrder } from '@/types'
import { formatCurrency } from '@/utils/formatters'

interface OrderWorkspaceCardProps {
  selectedOrder: SalesOrder | null
}

const OrderWorkspaceCard: React.FC<OrderWorkspaceCardProps> = ({ selectedOrder }) => {
  if (!selectedOrder) {
    return <Paper sx={{ flex: 1 }} />
  }

  return (
    <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
        <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          SO Items
        </Typography>
      </Box>

      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {selectedOrder.items && selectedOrder.items.length > 0 ? (
          <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
            <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': { borderBottom: TABLE_STYLES.cell.border, py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px } }}>
              <TableHead>
                <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50', color: 'text.primary', fontSize: '0.8rem' } }}>
                  <TableCell sx={{ width: '40%' }}>Product</TableCell>
                  <TableCell align="center" sx={{ width: '12%' }}>Quantity</TableCell>
                  <TableCell align="right" sx={{ width: '16%' }}>Unit Price</TableCell>
                  <TableCell align="right" sx={{ width: '16%' }}>Discount</TableCell>
                  <TableCell align="right" sx={{ width: '16%' }}>Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {selectedOrder.items.map((item: any, index: number) => (
                  <TableRow key={index} hover sx={{ '&:hover': { backgroundColor: 'action.hover' }, transition: 'background-color 0.2s ease', height: TABLE_STYLES.row.height }}>
                    <TableCell sx={{ fontSize: '0.8rem', lineHeight: 1.2 }}>
                      {item.product?.name || 'Unknown Product'}
                      {item.description && (
                        <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', display: 'block' }}>
                          {item.description}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="center" sx={{ fontSize: '0.8rem', fontWeight: 400, lineHeight: 1.2 }}>{item.quantity || 0}</TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 400, lineHeight: 1.2 }}>{formatCurrency(item.unitPrice || 0)}</TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 400, lineHeight: 1.2 }}>
                      {item.discountType === 'percentage' && item.discountPercent ? `${item.discountPercent}%` : item.discountAmount ? `-${formatCurrency(item.discountAmount)}` : '-'}
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.8rem', lineHeight: 1.2 }}>
                      {formatCurrency(item.totalAmount || item.quantity * item.unitPrice || 0)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Box sx={{ p: TABLE_STYLES.cell.padding.px }}>
            <Alert severity="info">No items in this order</Alert>
          </Box>
        )}
      </Box>

      {selectedOrder.notes && (
        <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderTop: TABLE_STYLES.cell.border }}>
          <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1 }}>
            NOTES
          </Typography>
          <Box sx={{ p: 2, backgroundColor: 'grey.50', borderRadius: 1, fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {selectedOrder.notes}
          </Box>
        </Box>
      )}
    </Paper>
  )
}

export default OrderWorkspaceCard
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep OrderWorkspaceCard
```

Expected: no output (no errors)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/sales/components/OrderWorkspaceCard.tsx
git commit -m "feat(sales): add OrderWorkspaceCard component"
```

---

## Task 4: Wire Sales Orders page + delete old panel

**Files:**
- Modify: `frontend/src/pages/sales/OrdersPage.tsx`
- Delete: `frontend/src/pages/sales/components/OrderDetailsPanel.tsx`

- [ ] **Step 1: Update `OrdersPage.tsx`**

Replace the `Grid container` block and `OrderDetailsPanel` import with `MasterDetailWorkspace` + the two new components.

Remove these imports:
```tsx
import Grid from '@mui/material/GridLegacy'
import OrderDetailsPanel from './components/OrderDetailsPanel'
```

Add these imports (after existing imports):
```tsx
import MasterDetailWorkspace from '@/components/common/MasterDetailWorkspace'
import OrderContextHeader from './components/OrderContextHeader'
import OrderWorkspaceCard from './components/OrderWorkspaceCard'
```

Replace this JSX block (lines 236–267 in current file):
```tsx
      <Grid container spacing={3}>
        <Grid item xs={12} md={3}>
          <OrdersTable
            orders={orders}
            loading={loading}
            total={pagination?.total || 0}
            selectedOrderId={selectedOrder?.id}
            focusedOrderIndex={pageState.focusedOrderIndex}
            onOrderSelect={selection.handleOrderSelect}
            orderListRef={pageState.orderListRef}
          />
        </Grid>
        <Grid item xs={12} md={9}>
          <OrderDetailsPanel
            selectedOrder={selectedOrder}
            isLoading={pageState.isLoading}
            journalEntryRef={pageState.journalEntryRef}
            journalEntryRefLoading={pageState.journalEntryRefLoading}
            onEditOrder={actions.handleEditOrder}
            onDeleteOrder={() => selectedOrder && void actions.handleOrderAction('delete', selectedOrder.id)}
            onPrintOrder={() => pageState.setPrintDialogOpen(true)}
            onNavigateToInvoice={selection.handleNavigateToInvoice}
            onNavigateToPayment={selection.handleNavigateToPayment}
            onNavigateToJournalEntry={navigateToJournalEntry}
            onRefundOrder={actions.handleRefundOrder}
            onUnpayOrder={actions.handleUnpayOrder}
            onOpenPaymentDialog={actions.openPaymentDialog}
            onFulfillOrder={actions.handleFulfillOrder}
            onUnfulfillOrder={actions.handleUnfulfillOrder}
          />
        </Grid>
      </Grid>
```

With:
```tsx
      <MasterDetailWorkspace
        isMobile={isMobile}
        listSlot={
          <OrdersTable
            orders={orders}
            loading={loading}
            total={pagination?.total || 0}
            selectedOrderId={selectedOrder?.id}
            focusedOrderIndex={pageState.focusedOrderIndex}
            onOrderSelect={selection.handleOrderSelect}
            orderListRef={pageState.orderListRef}
          />
        }
        headerSlot={
          <OrderContextHeader
            selectedOrder={selectedOrder}
            isLoading={pageState.isLoading}
            journalEntryRef={pageState.journalEntryRef}
            journalEntryRefLoading={pageState.journalEntryRefLoading}
            onEditOrder={actions.handleEditOrder}
            onDeleteOrder={() => selectedOrder && void actions.handleOrderAction('delete', selectedOrder.id)}
            onPrintOrder={() => pageState.setPrintDialogOpen(true)}
            onNavigateToInvoice={selection.handleNavigateToInvoice}
            onNavigateToPayment={selection.handleNavigateToPayment}
            onNavigateToJournalEntry={navigateToJournalEntry}
            onRefundOrder={actions.handleRefundOrder}
            onUnpayOrder={actions.handleUnpayOrder}
            onOpenPaymentDialog={actions.openPaymentDialog}
            onFulfillOrder={actions.handleFulfillOrder}
            onUnfulfillOrder={actions.handleUnfulfillOrder}
          />
        }
        workspaceSlot={<OrderWorkspaceCard selectedOrder={selectedOrder} />}
      />
```

- [ ] **Step 2: Delete the old panel**

```bash
rm frontend/src/pages/sales/components/OrderDetailsPanel.tsx
```

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | head -30
```

Expected: no errors. If `Grid` is still used elsewhere in `OrdersPage.tsx` (it's not — confirm by checking the file), keep the import.

- [ ] **Step 4: Run filterbar test**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/sales/OrdersPage.tsx
git rm frontend/src/pages/sales/components/OrderDetailsPanel.tsx
git commit -m "feat(sales): wire MasterDetailWorkspace into OrdersPage, remove OrderDetailsPanel"
```

---

## Task 5: Create `PurchaseOrderContextHeader`

**Files:**
- Create: `frontend/src/pages/purchasing/components/PurchaseOrderContextHeader.tsx`
- Reference: `frontend/src/pages/purchasing/components/PurchaseOrderDetailsPanel.tsx`
- Reference: `frontend/src/pages/purchasing/hooks/usePurchaseOrdersPageState.ts` (for `PurchaseJournalEntryRef` type)

- [ ] **Step 1: Create the component**

Create `frontend/src/pages/purchasing/components/PurchaseOrderContextHeader.tsx`:

```tsx
import React from 'react'
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  Print as PrintIcon,
} from '@mui/icons-material'
import {
  Box,
  Button,
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

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { PurchaseOrder } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'
import type { PurchaseJournalEntryRef } from '../hooks/usePurchaseOrdersPageState'

interface PurchaseOrderContextHeaderProps {
  selectedOrder: PurchaseOrder | null
  isLoading: boolean
  journalEntryRef: PurchaseJournalEntryRef | null
  journalEntryRefLoading: boolean
  onEditClick: () => void
  onDeleteClick: () => void
  onPrint: () => void
  onNavigateToGoodsReceived: (grnId: string) => void
  onNavigateToVendorPayment: (paymentId: string) => void
  onNavigateToJournalEntry: () => void
  onUnpay: () => void
  onOpenPaymentDialog: (order: PurchaseOrder) => void
  onReturn: () => void
  onReceive: () => void
}

const PurchaseOrderContextHeader: React.FC<PurchaseOrderContextHeaderProps> = ({
  selectedOrder,
  isLoading,
  journalEntryRef,
  journalEntryRefLoading,
  onEditClick,
  onDeleteClick,
  onPrint,
  onNavigateToGoodsReceived,
  onNavigateToVendorPayment,
  onNavigateToJournalEntry,
  onUnpay,
  onOpenPaymentDialog,
  onReturn,
  onReceive,
}) => {
  if (!selectedOrder) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" color="text.secondary">
          Select a purchase order to view details
        </Typography>
      </Paper>
    )
  }

  const isReceived = !!(
    selectedOrder.goodsReceivedNotes &&
    selectedOrder.goodsReceivedNotes.length > 0 &&
    selectedOrder.goodsReceivedNotes[0].status === 'received'
  )
  const hasPayment = !!(selectedOrder.vendorPayments && selectedOrder.vendorPayments.length > 0)

  return (
    <Paper>
      <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          PO Details - {selectedOrder.orderNumber}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <IconButton size="small" title="Edit Order" onClick={onEditClick} sx={{ height: `${TABLE_STYLES.row.height * 0.75}px`, width: `${TABLE_STYLES.row.height * 0.75}px`, color: 'primary.main' }}>
            <EditIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
          <IconButton size="small" title="Delete Order" onClick={onDeleteClick} sx={{ height: `${TABLE_STYLES.row.height * 0.75}px`, width: `${TABLE_STYLES.row.height * 0.75}px`, color: 'error.main' }}>
            <DeleteIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
          <IconButton size="small" title="Print Purchase Order" onClick={onPrint} sx={{ height: `${TABLE_STYLES.row.height * 0.75}px`, width: `${TABLE_STYLES.row.height * 0.75}px`, color: 'info.main' }}>
            <PrintIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
        </Box>
      </Box>

      <Box sx={{ p: TABLE_STYLES.cell.padding.px }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={{ tableLayout: 'fixed', '& .MuiTableCell-root': { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px, '&:nth-of-type(1)': { width: '40%' }, '&:nth-of-type(2)': { width: '60%' } } }}>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={2} sx={{ pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}>
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>PO Information</Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>Supplier</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{selectedOrder.supplier?.companyName || 'N/A'}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>PO Date</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{formatDate(selectedOrder.orderDate)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>GRN No</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>
                      {selectedOrder.goodsReceivedNotes && selectedOrder.goodsReceivedNotes.length > 0
                        ? selectedOrder.goodsReceivedNotes.map((grn: any, index: number) => (
                            <Box key={grn.id} component="span">
                              {index > 0 && ', '}
                              <Typography component="button" onClick={() => onNavigateToGoodsReceived(grn.id)} sx={{ fontSize: '0.8rem', color: 'primary.main', cursor: 'pointer', textDecoration: 'none', border: 'none', background: 'none', padding: 0 }}>
                                {grn.grnNumber}
                              </Typography>
                            </Box>
                          ))
                        : '-'}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>VP No</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>
                      {selectedOrder.vendorPayments && selectedOrder.vendorPayments.length > 0
                        ? selectedOrder.vendorPayments.map((payment: any, index: number) => (
                            <Box key={payment.id} component="span">
                              {index > 0 && ', '}
                              <Typography component="button" onClick={() => onNavigateToVendorPayment(payment.id)} sx={{ fontSize: '0.8rem', color: 'primary.main', cursor: 'pointer', textDecoration: 'none', border: 'none', background: 'none', padding: 0 }}>
                                {payment.paymentNumber}
                              </Typography>
                            </Box>
                          ))
                        : '-'}
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>Journal Entry No</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>
                      {journalEntryRefLoading ? (
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

          <Grid item xs={12} md={6}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={{ tableLayout: 'fixed', '& .MuiTableCell-root': { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px, '&:nth-of-type(1)': { width: '40%' }, '&:nth-of-type(2)': { width: '60%' } } }}>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={2} sx={{ pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}>
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>Payment and Receiving</Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>Sub-total</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{formatCurrency((selectedOrder as any).subtotal || 0)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>Shipping</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{formatCurrency(selectedOrder.shippingAmount || 0)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50', borderTop: TABLE_STYLES.cell.border }}>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>Total</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{formatCurrency(selectedOrder.totalAmount || 0)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>Paid</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{formatCurrency(selectedOrder.paidAmount || 0)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>Balance</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{formatCurrency(Math.max(0, (selectedOrder.totalAmount || 0) - (selectedOrder.paidAmount || 0)))}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={2} sx={{ textAlign: 'center' }}>
                      <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
                        <Button
                          variant="contained"
                          size="small"
                          color={hasPayment ? 'warning' : 'primary'}
                          onClick={hasPayment ? onUnpay : () => onOpenPaymentDialog(selectedOrder)}
                          disabled={(hasPayment && isReceived) || isLoading}
                          sx={{ minWidth: 110 }}
                        >
                          {hasPayment ? 'Unpay' : 'Pay'}
                        </Button>
                        {isReceived ? (
                          <Button variant="contained" size="small" color="warning" sx={{ minWidth: 110 }} onClick={onReturn} disabled={!selectedOrder?.items || selectedOrder.items.length === 0 || isLoading}>
                            Return
                          </Button>
                        ) : (
                          <Button
                            variant="contained"
                            size="small"
                            color="success"
                            sx={{ minWidth: 110 }}
                            onClick={onReceive}
                            disabled={
                              !selectedOrder?.items ||
                              selectedOrder.items.length === 0 ||
                              isLoading ||
                              !((selectedOrder.paidAmount || 0) >= (selectedOrder.totalAmount || 0) && (selectedOrder.paidAmount || 0) > 0)
                            }
                          >
                            Receive
                          </Button>
                        )}
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

export default PurchaseOrderContextHeader
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep PurchaseOrderContextHeader
```

Expected: no output

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/purchasing/components/PurchaseOrderContextHeader.tsx
git commit -m "feat(purchasing): add PurchaseOrderContextHeader component"
```

---

## Task 6: Create `PurchaseOrderWorkspaceCard`

**Files:**
- Create: `frontend/src/pages/purchasing/components/PurchaseOrderWorkspaceCard.tsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/pages/purchasing/components/PurchaseOrderWorkspaceCard.tsx`:

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

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { PurchaseOrder } from '@/types'
import { formatCurrency } from '@/utils/formatters'

interface PurchaseOrderWorkspaceCardProps {
  selectedOrder: PurchaseOrder | null
}

const PurchaseOrderWorkspaceCard: React.FC<PurchaseOrderWorkspaceCardProps> = ({ selectedOrder }) => {
  if (!selectedOrder) {
    return <Paper sx={{ flex: 1 }} />
  }

  return (
    <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
        <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          PO Items
        </Typography>
      </Box>

      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {selectedOrder.items && selectedOrder.items.length > 0 ? (
          <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
            <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': { borderBottom: TABLE_STYLES.cell.border, py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px } }}>
              <TableHead>
                <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50', color: 'text.primary', fontSize: '0.8rem' } }}>
                  <TableCell sx={{ width: '35%' }}>Product</TableCell>
                  <TableCell align="center" sx={{ width: '13%' }}>Quantity</TableCell>
                  <TableCell align="center" sx={{ width: '13%' }}>Price</TableCell>
                  <TableCell align="center" sx={{ width: '13%' }}>Discount</TableCell>
                  <TableCell align="center" sx={{ width: '13%' }}>Sub-total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {selectedOrder.items.map((item: any, index: number) => (
                  <TableRow key={item.id || index} hover sx={{ '&:hover': { backgroundColor: 'action.hover' }, transition: 'background-color 0.2s ease', height: TABLE_STYLES.row.height }}>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{item.product?.name || item.description || 'N/A'}</TableCell>
                    <TableCell align="center" sx={{ fontSize: '0.8rem' }}>{item.quantity}</TableCell>
                    <TableCell align="center" sx={{ fontSize: '0.8rem' }}>{formatCurrency(item.unitPrice || item.unitCost || 0)}</TableCell>
                    <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                      {item.discountAmount ? (
                        <Box component="span">
                          {`-${formatCurrency(item.discountAmount)}`}
                          {item.discountPercent > 0 && (
                            <Typography component="span" sx={{ fontSize: '0.7rem', color: 'text.secondary', ml: 0.5 }}>
                              ({item.discountPercent}%)
                            </Typography>
                          )}
                        </Box>
                      ) : '-'}
                    </TableCell>
                    <TableCell align="center" sx={{ fontSize: '0.8rem' }}>{formatCurrency(item.totalAmount || item.total || item.quantity * (item.unitPrice || item.unitCost || 0))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Box sx={{ p: TABLE_STYLES.cell.padding.px }}>
            <Alert severity="info">No items in this order</Alert>
          </Box>
        )}
      </Box>

      {selectedOrder.notes && (
        <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderTop: TABLE_STYLES.cell.border }}>
          <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1 }}>
            Notes
          </Typography>
          <Box sx={{ p: 2, backgroundColor: 'grey.50', borderRadius: 1, fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {selectedOrder.notes}
          </Box>
        </Box>
      )}
    </Paper>
  )
}

export default PurchaseOrderWorkspaceCard
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep PurchaseOrderWorkspaceCard
```

Expected: no output

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/purchasing/components/PurchaseOrderWorkspaceCard.tsx
git commit -m "feat(purchasing): add PurchaseOrderWorkspaceCard component"
```

---

## Task 7: Wire Purchase Orders page + delete old panel

**Files:**
- Modify: `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx`
- Delete: `frontend/src/pages/purchasing/components/PurchaseOrderDetailsPanel.tsx`

- [ ] **Step 1: Update `PurchaseOrdersPage.tsx`**

Remove these imports:
```tsx
import Grid from '@mui/material/GridLegacy'
import PurchaseOrderDetailsPanel from './components/PurchaseOrderDetailsPanel'
```

Add these imports:
```tsx
import MasterDetailWorkspace from '@/components/common/MasterDetailWorkspace'
import PurchaseOrderContextHeader from './components/PurchaseOrderContextHeader'
import PurchaseOrderWorkspaceCard from './components/PurchaseOrderWorkspaceCard'
```

Replace this JSX block (lines 222–252 in current file):
```tsx
      <Grid container spacing={3}>
        <Grid item xs={12} md={3}>
          <PurchaseOrdersTable
            purchaseOrders={purchaseOrders}
            loading={loading}
            total={pagination?.total || 0}
            selectedOrderId={selectedOrder?.id}
            focusedOrderIndex={pageState.focusedOrderIndex}
            onOrderSelect={selection.handleOrderSelect}
            orderListRef={pageState.orderListRef}
          />
        </Grid>
        <Grid item xs={12} md={9}>
          <PurchaseOrderDetailsPanel
            selectedOrder={selectedOrder}
            isLoading={pageState.isLoading}
            journalEntryRef={pageState.journalEntryRef}
            journalEntryRefLoading={pageState.journalEntryRefLoading}
            onEditClick={actions.handleEditClick}
            onDeleteClick={actions.handleDeleteClick}
            onPrint={() => pageState.setPrintDialogOpen(true)}
            onNavigateToGoodsReceived={navigateToGoodsReceived}
            onNavigateToVendorPayment={navigateToVendorPayment}
            onNavigateToJournalEntry={navigateToJournalEntry}
            onUnpay={actions.handleUnpay}
            onOpenPaymentDialog={actions.handleOpenPaymentDialog}
            onReturn={actions.handleReturn}
            onReceive={actions.handleReceive}
          />
        </Grid>
      </Grid>
```

With:
```tsx
      <MasterDetailWorkspace
        isMobile={isMobile}
        listSlot={
          <PurchaseOrdersTable
            purchaseOrders={purchaseOrders}
            loading={loading}
            total={pagination?.total || 0}
            selectedOrderId={selectedOrder?.id}
            focusedOrderIndex={pageState.focusedOrderIndex}
            onOrderSelect={selection.handleOrderSelect}
            orderListRef={pageState.orderListRef}
          />
        }
        headerSlot={
          <PurchaseOrderContextHeader
            selectedOrder={selectedOrder}
            isLoading={pageState.isLoading}
            journalEntryRef={pageState.journalEntryRef}
            journalEntryRefLoading={pageState.journalEntryRefLoading}
            onEditClick={actions.handleEditClick}
            onDeleteClick={actions.handleDeleteClick}
            onPrint={() => pageState.setPrintDialogOpen(true)}
            onNavigateToGoodsReceived={navigateToGoodsReceived}
            onNavigateToVendorPayment={navigateToVendorPayment}
            onNavigateToJournalEntry={navigateToJournalEntry}
            onUnpay={actions.handleUnpay}
            onOpenPaymentDialog={actions.handleOpenPaymentDialog}
            onReturn={actions.handleReturn}
            onReceive={actions.handleReceive}
          />
        }
        workspaceSlot={<PurchaseOrderWorkspaceCard selectedOrder={selectedOrder} />}
      />
```

Also: `PurchaseOrdersPage` doesn't currently have an `isMobile` variable. Add it after the existing `useNavigate` line, alongside the existing imports:

```tsx
const isMobile = useMediaQuery(theme.breakpoints.down('md'))
```

And add `useTheme` and `useMediaQuery` to the MUI import:
```tsx
import { Alert, Box, Button, Stack, useMediaQuery, useTheme } from '@mui/material'
```

- [ ] **Step 2: Delete the old panel**

```bash
rm frontend/src/pages/purchasing/components/PurchaseOrderDetailsPanel.tsx
```

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | head -30
```

Expected: no errors

- [ ] **Step 4: Run filterbar test**

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/PurchaseOrdersPage.filterbar.test.tsx
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/purchasing/PurchaseOrdersPage.tsx
git rm frontend/src/pages/purchasing/components/PurchaseOrderDetailsPanel.tsx
git commit -m "feat(purchasing): wire MasterDetailWorkspace into PurchaseOrdersPage, remove PurchaseOrderDetailsPanel"
```

---

## Task 8: Final verification

- [ ] **Step 1: Full type check**

```bash
cd frontend && npm run type-check
```

Expected: no errors

- [ ] **Step 2: Run both filterbar tests**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx src/pages/purchasing/__tests__/PurchaseOrdersPage.filterbar.test.tsx
```

Expected: all tests pass

- [ ] **Step 3: Manual smoke check**

Start the dev server (`cd frontend && npm run dev`) and verify:
1. Sales Orders page (`/sales/orders`): List on left, context header top-right, items workspace bottom-right — all visible simultaneously
2. Select an order: items table scrolls independently without moving the context header
3. Resize browser to mobile width: layout stacks vertically
4. Purchase Orders page (`/purchasing/orders`): same verification

- [ ] **Step 4: Commit if any fixups needed, then create PR**

```bash
gh pr create --title "feat: master-detail-items workspace layout (issue #260)" --body "$(cat <<'EOF'
## Summary
- Add `MasterDetailWorkspace` reusable layout shell component
- Split `OrderDetailsPanel` into `OrderContextHeader` + `OrderWorkspaceCard`
- Split `PurchaseOrderDetailsPanel` into `PurchaseOrderContextHeader` + `PurchaseOrderWorkspaceCard`
- Wire both pages to display order list, metadata, and items simultaneously

## Test plan
- [ ] Sales Orders: list, context header, items all visible simultaneously on desktop
- [ ] Purchase Orders: same
- [ ] Items table scrolls independently of context header
- [ ] Mobile: layout stacks correctly
- [ ] `npm run type-check` passes
- [ ] Filterbar tests pass for both pages

Closes #260

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
