# Customer Page Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align `CustomerContextHeader` and `CustomerWorkspaceCard` with the established Master-Detail UI patterns from the Sales Orders page.

**Architecture:** Rewrite `CustomerContextHeader` to a 2-column `GridLegacy` layout matching `OrderContextHeader`; refactor `CustomerWorkspaceCard` to remove stats/overview clutter and fix the scroll bug using the same flex-column pattern as `OrderWorkspaceCard`.

**Tech Stack:** React 19, Material-UI v7, TypeScript (strict: false)

---

## Files

- Modify: `frontend/src/pages/sales/components/CustomerContextHeader.tsx`
- Modify: `frontend/src/pages/sales/components/CustomerWorkspaceCard.tsx`

---

### Task 1: Rewrite CustomerContextHeader to 2-column grid

**Files:**
- Modify: `frontend/src/pages/sales/components/CustomerContextHeader.tsx`

- [ ] **Step 1: Replace the file contents**

Replace the entire file with:

```tsx
import React from 'react'
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
} from '@mui/icons-material'
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
import Grid from '@mui/material/GridLegacy'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { Customer } from '@/types'
import { CustomerType } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

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
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
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
                      {selectedCustomer.type === CustomerType.BUSINESS ? 'Business' : 'Individual'}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Status</TableCell>
                    <TableCell sx={{ ...valueCellSx, color: selectedCustomer.isActive ? 'success.main' : 'text.disabled' }}>
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

          <Grid item xs={12} md={6}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={detailTableSx}>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={2} sx={{ pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}>
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
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
                    <TableCell sx={valueCellSx}>{formatCurrency(selectedCustomer.totalSales ?? 0)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Avg Order Value</TableCell>
                    <TableCell sx={valueCellSx}>{formatCurrency(selectedCustomer.averageOrderValue ?? 0)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>First Purchase</TableCell>
                    <TableCell sx={valueCellSx}>
                      {selectedCustomer.firstPurchaseDate ? formatDate(selectedCustomer.firstPurchaseDate) : '—'}
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Last Purchase</TableCell>
                    <TableCell sx={valueCellSx}>
                      {selectedCustomer.lastPurchaseDate ? formatDate(selectedCustomer.lastPurchaseDate) : '—'}
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

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "CustomerContextHeader|error TS"
```

Expected: no errors referencing `CustomerContextHeader.tsx`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/sales/components/CustomerContextHeader.tsx
git commit -m "feat(frontend): redesign CustomerContextHeader to 2-column grid layout (closes #310 partial)"
```

---

### Task 2: Refactor CustomerWorkspaceCard — remove stats/overview, fix scroll

**Files:**
- Modify: `frontend/src/pages/sales/components/CustomerWorkspaceCard.tsx`

- [ ] **Step 1: Replace the file contents**

Replace the entire file with:

```tsx
import React, { useEffect, useState } from 'react'
import {
  Box,
  CircularProgress,
  Paper,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from '@mui/material'
import {
  AccountBalance as InvoiceIcon,
  ShoppingCart as OrdersIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'

import { TABLE_STYLES } from '@/constants/tableStyles'
import api from '@/services/api'
import type { Customer } from '@/types'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/formatters'

interface SalesOrderItem {
  id: string
  orderNumber: string
  orderDate: string
  isFulfilled: boolean
  isPaid: boolean
  totalAmount: number
  itemsCount: number
}

interface OutstandingInvoice {
  id: string
  invoiceNumber: string
  invoiceDate: string
  totalAmount: number
  paidAmount: number
  balanceDue: number
  salesOrderId: string | null
}

interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <Box
      role="tabpanel"
      hidden={value !== index}
      sx={{
        flex: 1,
        overflow: 'auto',
        display: value === index ? 'flex' : 'none',
        flexDirection: 'column',
      }}
    >
      {value === index && (
        <Box sx={{ p: TABLE_STYLES.cell.padding.px, flex: 1 }}>
          {children}
        </Box>
      )}
    </Box>
  )
}

interface CustomerWorkspaceCardProps {
  selectedCustomer: Customer | null
}

const CustomerWorkspaceCard: React.FC<CustomerWorkspaceCardProps> = ({ selectedCustomer }) => {
  const navigate = useNavigate()

  const [orders, setOrders] = useState<SalesOrderItem[]>([])
  const [invoices, setInvoices] = useState<OutstandingInvoice[]>([])
  const [totalOutstanding, setTotalOutstanding] = useState(0)
  const [tabValue, setTabValue] = useState(0)
  const [ordersLoaded, setOrdersLoaded] = useState(false)
  const [invoicesLoaded, setInvoicesLoaded] = useState(false)

  useEffect(() => {
    if (!selectedCustomer) {
      setOrders([])
      setInvoices([])
      setTotalOutstanding(0)
      setTabValue(0)
      setOrdersLoaded(false)
      setInvoicesLoaded(false)
      return
    }

    setTabValue(0)
    setOrdersLoaded(false)
    setInvoicesLoaded(false)
    setOrders([])
    setInvoices([])
  }, [selectedCustomer?.id])

  useEffect(() => {
    if (tabValue === 0 && !ordersLoaded && selectedCustomer?.id) {
      api.get(`/customers/${selectedCustomer.id}/sales-history`)
        .then((res: any) => setOrders(res.data?.orders ?? res.data ?? []))
        .catch(() => {})
        .finally(() => setOrdersLoaded(true))
    }
  }, [tabValue, ordersLoaded, selectedCustomer?.id])

  useEffect(() => {
    if (tabValue === 1 && !invoicesLoaded && selectedCustomer?.id) {
      api.get(`/customers/${selectedCustomer.id}/outstanding-invoices`)
        .then((res: any) => {
          const data = res.data?.data ?? res.data
          setInvoices(data?.invoices ?? [])
          setTotalOutstanding(data?.totalOutstanding ?? 0)
        })
        .catch(() => {})
        .finally(() => setInvoicesLoaded(true))
    }
  }, [tabValue, invoicesLoaded, selectedCustomer?.id])

  if (!selectedCustomer) {
    return <Paper sx={{ flex: 1 }} />
  }

  return (
    <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={(_, value) => setTabValue(value)}>
          <Tab icon={<OrdersIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Orders" />
          <Tab icon={<InvoiceIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Invoices" />
        </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0}>
        {!ordersLoaded ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : orders.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>No orders found.</Typography>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size={TABLE_STYLES.size}>
              <TableHead>
                <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50' } }}>
                  <TableCell>Order #</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {orders.map((order) => (
                  <TableRow
                    key={order.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/sales/orders/${order.id}/edit`)}
                  >
                    <TableCell>
                      <Typography variant="body2" color="primary" fontWeight={600}>{order.orderNumber}</Typography>
                    </TableCell>
                    <TableCell>{formatDate(order.orderDate)}</TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{ color: order.isFulfilled ? 'success.main' : order.isPaid ? 'primary.main' : 'text.secondary' }}
                      >
                        {order.isFulfilled ? 'Fulfilled' : order.isPaid ? 'Paid' : 'Pending'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{formatCurrency(order.totalAmount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        {!invoicesLoaded ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : invoices.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>No outstanding invoices.</Typography>
        ) : (
          <>
            <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
              <Typography variant="subtitle2" color="text.secondary">
                Total Outstanding: <strong>{formatCurrency(totalOutstanding)}</strong>
              </Typography>
            </Box>
            <TableContainer component={Paper} variant="outlined">
              <Table size={TABLE_STYLES.size}>
                <TableHead>
                  <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50' } }}>
                    <TableCell>Invoice #</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell align="right">Total</TableCell>
                    <TableCell align="right">Balance Due</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {invoices.map((invoice) => (
                    <TableRow
                      key={invoice.id}
                      hover
                      sx={{ cursor: invoice.salesOrderId ? 'pointer' : 'default' }}
                      onClick={() => invoice.salesOrderId && navigate(`/sales/orders/${invoice.salesOrderId}/edit`)}
                    >
                      <TableCell>
                        <Typography variant="body2" color={invoice.salesOrderId ? 'primary' : 'text.primary'} fontWeight={600}>
                          {invoice.invoiceNumber}
                        </Typography>
                      </TableCell>
                      <TableCell>{formatDate(invoice.invoiceDate)}</TableCell>
                      <TableCell align="right">{formatCurrency(invoice.totalAmount)}</TableCell>
                      <TableCell align="right">
                        <Typography fontWeight={600} color="error.main">{formatCurrency(invoice.balanceDue)}</Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </TabPanel>
    </Paper>
  )
}

export default CustomerWorkspaceCard
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "CustomerWorkspaceCard|error TS"
```

Expected: no errors referencing `CustomerWorkspaceCard.tsx`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/sales/components/CustomerWorkspaceCard.tsx
git commit -m "feat(frontend): refactor CustomerWorkspaceCard — remove stats/overview, fix scroll, closes #310"
```
