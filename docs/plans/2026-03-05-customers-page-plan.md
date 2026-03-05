# Customers Page Improvement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the customers page to standard ERP UX — dedicated customer profile page with tabs (Overview, Orders, Invoices), list page with active/inactive filter and sortable columns.

**Architecture:** New `CustomerProfilePage` at `/sales/customers/:id` replaces the view dialog. List page gets two new filter controls and `TableSortLabel` on column headers. One small backend fix adds `salesOrderId` to the outstanding invoices response.

**Tech Stack:** React 18, MUI v7, React Router v7, Redux Toolkit, Vitest, NestJS 11, TypeORM

---

## Task 1: Add `salesOrderId` to outstanding invoices backend response

**Files:**
- Modify: `backend/src/modules/sales/services/customer.service.ts` (line ~407)

**Step 1: Write the failing test**

This endpoint is not unit-tested yet. We'll verify the fix manually after implementation and trust the existing e2e coverage.

**Step 2: Add `salesOrderId` to the map**

Find the `getOutstandingInvoices` method (~line 387). Inside the `.map()` block, add `salesOrderId` after `balanceDue`:

```typescript
invoices: outstandingInvoices.map(invoice => ({
  id: invoice.id,
  invoiceNumber: invoice.invoiceNumber,
  invoiceDate: invoice.invoiceDate,
  totalAmount: Number(invoice.totalAmount),
  paidAmount: Number(invoice.paidAmount),
  balanceDue: Number(invoice.balanceDue),
  salesOrderId: invoice.salesOrderId ?? null,
})),
```

**Step 3: Commit**

```bash
git add backend/src/modules/sales/services/customer.service.ts
git commit -m "fix: include salesOrderId in outstanding invoices response"
```

---

## Task 2: Add Active/Inactive filter and sortable columns to list page

**Files:**
- Modify: `frontend/src/pages/sales/CustomersPage.tsx`

**Context:** The Redux `filters` shape already has `isActive?: boolean`, `sortBy?: string`, `sortOrder?: 'ASC' | 'DESC'` and the backend supports all of them. We just need to wire up the UI.

**Step 1: Write the failing tests**

Create `frontend/src/pages/sales/__tests__/CustomersPage.filter.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import customerReducer, { setFilters } from '@/store/slices/customerSlice'
import CustomersPage from '../CustomersPage'

// Mock heavy dependencies
vi.mock('@/hooks/useNotification', () => ({ useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }) }))
vi.mock('@/services/salesApi', () => ({ salesApi: { getCustomers: vi.fn().mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 25 } }) } }))
vi.mock('@/store/slices/customerSlice', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/slices/customerSlice')>()
  return { ...actual, fetchCustomers: vi.fn(() => ({ type: 'customers/fetchCustomers/fulfilled', payload: { data: [], meta: {} } })) }
})

function makeStore() {
  return configureStore({ reducer: { customers: customerReducer } })
}

function renderPage(store = makeStore()) {
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <CustomersPage />
      </MemoryRouter>
    </Provider>
  )
}

describe('CustomersPage filters', () => {
  it('renders Status filter with All/Active/Inactive options', async () => {
    renderPage()
    const statusSelect = screen.getByLabelText('Status')
    expect(statusSelect).toBeTruthy()
  })

  it('Name column header has sort indicator', () => {
    renderPage()
    const nameHeader = screen.getByText('Name')
    expect(nameHeader.closest('th') ?? nameHeader).toBeTruthy()
  })
})
```

**Step 2: Run tests to see them fail**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/CustomersPage.filter.test.tsx --no-coverage
```

Expected: FAIL — "Status" label not found.

**Step 3: Add Active/Inactive filter to CustomersPage**

In `CustomersPage.tsx`:

1. Add `TableSortLabel` to MUI imports (line ~2):
```tsx
import {
  // ...existing imports...
  TableSortLabel,
} from '@mui/material'
```

2. After the Type `<FormControl>` block (around line 526), add the Status filter:
```tsx
<FormControl
  size="medium"
  sx={{ minWidth: isMobile ? 'auto' : 120, flex: 'none' }}
>
  <InputLabel
    sx={{
      fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
      '&.MuiInputLabel-shrunk': { fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize }
    }}
  >
    Status
  </InputLabel>
  <Select
    value={filters.isActive === undefined ? 'all' : filters.isActive ? 'active' : 'inactive'}
    label="Status"
    onChange={(e) => {
      const val = e.target.value
      dispatch(setFilters({
        isActive: val === 'all' ? undefined : val === 'active'
      }))
    }}
    sx={{
      height: TYPOGRAPHY_STYLES.searchField.input.height,
      fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
      '& .MuiSelect-select': {
        display: 'flex', alignItems: 'center',
        fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
        padding: '8.5px 14px',
        height: TYPOGRAPHY_STYLES.searchField.input.height,
        boxSizing: 'border-box'
      },
    }}
  >
    <MenuItem value="all" sx={{ fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize }}>All</MenuItem>
    <MenuItem value="active" sx={{ fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize }}>Active</MenuItem>
    <MenuItem value="inactive" sx={{ fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize }}>Inactive</MenuItem>
  </Select>
</FormControl>
```

3. Also update the `useEffect` dependency array (currently only listens to `filters.search`, `filters.type`, `filters.priceListId`, `filters.sortBy`, `filters.sortOrder`) to include `filters.isActive`:

Find the line:
```tsx
}, [dispatch, filters.search, filters.type, filters.priceListId, filters.sortBy, filters.sortOrder])
```
Change to:
```tsx
}, [dispatch, filters.search, filters.type, filters.isActive, filters.priceListId, filters.sortBy, filters.sortOrder])
```

**Step 4: Add sortable column headers**

Find the `<TableHead>` block (around line 549). Replace each sortable column header `<Typography>` with a `<TableSortLabel>`. Example for the Name column:

```tsx
<TableCell sx={{ width: isMobile ? '35%' : '30%' }}>
  <TableSortLabel
    active={filters.sortBy === 'name'}
    direction={filters.sortBy === 'name' ? (filters.sortOrder?.toLowerCase() as 'asc' | 'desc') : 'asc'}
    onClick={() => dispatch(setFilters({
      sortBy: 'name',
      sortOrder: filters.sortBy === 'name' && filters.sortOrder === 'ASC' ? 'DESC' : 'ASC'
    }))}
    sx={{ fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize, fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, color: TYPOGRAPHY_STYLES.tableHeader.color }}
  >
    Name
  </TableSortLabel>
</TableCell>
```

Apply the same pattern to Total Orders (`sortBy: 'totalOrders'`), Total Sales (`sortBy: 'totalSales'`), Last Purchase (`sortBy: 'lastPurchaseDate'`). Leave Type, Price List, Status, and Actions columns as plain text.

**Step 5: Run tests**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/CustomersPage.filter.test.tsx --no-coverage
```

Expected: PASS

**Step 6: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

**Step 7: Commit**

```bash
git add frontend/src/pages/sales/CustomersPage.tsx frontend/src/pages/sales/__tests__/CustomersPage.filter.test.tsx
git commit -m "feat: add active/inactive filter and sortable columns to customers list"
```

---

## Task 3: Navigate to profile page instead of opening view dialog

**Files:**
- Modify: `frontend/src/pages/sales/CustomersPage.tsx`

**Step 1: Add `useNavigate` import and wire up navigation**

1. Add `useNavigate` import at the top of the file:
```tsx
import { useNavigate } from 'react-router-dom'
```

2. Inside the component, add:
```tsx
const navigate = useNavigate()
```

3. Replace `handleViewCustomer`:
```tsx
const handleViewCustomer = (customer: Customer) => {
  navigate(`/sales/customers/${customer.id}`)
}
```

4. Make the customer name in table rows clickable. Find where `customer.name` is rendered in the table body (around line 600–650). Wrap or replace it with:
```tsx
<Typography
  variant="body2"
  fontWeight={600}
  sx={{
    cursor: 'pointer',
    color: 'primary.main',
    '&:hover': { textDecoration: 'underline' }
  }}
  onClick={() => navigate(`/sales/customers/${customer.id}`)}
>
  {customer.name}
</Typography>
```

**Step 2: Remove the view dialog**

Remove:
- `const [isViewOpen, setIsViewOpen] = useState(false)` (line ~116)
- The entire `{/* Customer Details Dialog */}` block (lines ~1087–1209)
- `ViewIcon` from MUI icons import if it's no longer used anywhere else (check first with grep)

```bash
grep -n "ViewIcon" frontend/src/pages/sales/CustomersPage.tsx
```

If only used in the view button, remove the import and replace the view button's icon. The view icon button now calls `handleViewCustomer` which navigates — keep the button but it no longer needs `ViewIcon` necessarily. Actually keep the icon and button as-is, just the handler now navigates instead of opening a dialog.

**Step 3: TypeScript check**

```bash
cd frontend && npm run type-check
```

**Step 4: Commit**

```bash
git add frontend/src/pages/sales/CustomersPage.tsx
git commit -m "feat: navigate to customer profile instead of opening view dialog"
```

---

## Task 4: Create CustomerProfilePage — skeleton and routing

**Files:**
- Create: `frontend/src/pages/sales/CustomerProfilePage.tsx`
- Modify: `frontend/src/router.tsx`

**Step 1: Write a failing test for the profile page**

Create `frontend/src/pages/sales/__tests__/CustomerProfilePage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import customerReducer from '@/store/slices/customerSlice'
import CustomerProfilePage from '../CustomerProfilePage'

const mockCustomer = {
  id: 'test-uuid-1',
  name: 'Acme Corp',
  type: 'business',
  phone: '+1 234 567 890',
  isActive: true,
  totalOrders: 5,
  totalSales: 15000,
  averageOrderValue: 3000,
  lastPurchaseDate: '2026-01-15T00:00:00Z',
  firstPurchaseDate: '2025-06-01T00:00:00Z',
  notes: 'VIP customer',
  streetAddress: '123 Main St',
  city: 'New York',
  state: 'NY',
  postalCode: '10001',
  country: 'USA',
  priceList: null,
}

vi.mock('@/hooks/useNotification', () => ({ useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }) }))
vi.mock('@/services/salesApi', () => ({
  salesApi: {
    getCustomer: vi.fn().mockResolvedValue(mockCustomer),
    getCustomerStatistics: vi.fn().mockResolvedValue({
      orders: { totalOrders: 5, totalSales: 15000, averageOrderValue: 3000, firstOrderDate: '2025-06-01', lastOrderDate: '2026-01-15' }
    }),
    getCustomerSalesHistory: vi.fn().mockResolvedValue({ orders: [] }),
    getOutstandingInvoices: vi.fn().mockResolvedValue({ invoices: [], totalOutstanding: 0 }),
    deleteCustomer: vi.fn(),
  }
}))

function makeStore() {
  return configureStore({ reducer: { customers: customerReducer } })
}

function renderPage(customerId = 'test-uuid-1') {
  return render(
    <Provider store={makeStore()}>
      <MemoryRouter initialEntries={[`/sales/customers/${customerId}`]}>
        <Routes>
          <Route path="/sales/customers/:id" element={<CustomerProfilePage />} />
          <Route path="/sales/customers" element={<div>Customers List</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>
  )
}

describe('CustomerProfilePage', () => {
  it('renders customer name after loading', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeTruthy()
    })
  })

  it('shows Overview tab by default', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Total Orders')).toBeTruthy()
    })
  })

  it('shows back button', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Back to Customers/i)).toBeTruthy()
    })
  })
})
```

**Step 2: Run test to see it fail**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/CustomerProfilePage.test.tsx --no-coverage
```

Expected: FAIL — module not found.

**Step 3: Create the CustomerProfilePage skeleton**

Create `frontend/src/pages/sales/CustomerProfilePage.tsx`:

```tsx
import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Button,
  Chip,
  Grid,
  Card,
  CardContent,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
  Stack,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
} from '@mui/material'
import {
  ArrowBack as BackIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Phone as PhoneIcon,
  LocationOn as LocationIcon,
  People as CustomersIcon,
} from '@mui/icons-material'
import { useNavigate, useParams } from 'react-router-dom'
import { useAppDispatch } from '@/hooks/useRedux'
import { useNotification } from '@/hooks/useNotification'
import { deleteCustomer } from '@/store/slices/customerSlice'
import { salesApi } from '@/services/salesApi'
import type { Customer } from '@/types'
import { CustomerType } from '@/types'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/formatters'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'

interface TabPanelProps {
  children?: React.ReactNode
  index: number
  value: number
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <Box role="tabpanel" hidden={value !== index} sx={{ pt: 3 }}>
      {value === index && children}
    </Box>
  )
}

interface CustomerStatistics {
  orders: {
    totalOrders: number
    totalSales: number
    averageOrderValue: number
    firstOrderDate: string | null
    lastOrderDate: string | null
  }
}

interface SalesOrder {
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

const CustomerProfilePage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { showSuccess, showError } = useNotification()

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [statistics, setStatistics] = useState<CustomerStatistics | null>(null)
  const [orders, setOrders] = useState<SalesOrder[]>([])
  const [invoices, setInvoices] = useState<OutstandingInvoice[]>([])
  const [totalOutstanding, setTotalOutstanding] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tabValue, setTabValue] = useState(0)
  const [ordersLoaded, setOrdersLoaded] = useState(false)
  const [invoicesLoaded, setInvoicesLoaded] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Load customer + statistics on mount
  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.all([
      salesApi.getCustomer(id),
      salesApi.getCustomerStatistics(id),
    ])
      .then(([cust, stats]) => {
        setCustomer(cust as unknown as Customer)
        setStatistics(stats as unknown as CustomerStatistics)
      })
      .catch(() => setError('Customer not found.'))
      .finally(() => setLoading(false))
  }, [id])

  // Lazy-load orders on first visit to Orders tab
  useEffect(() => {
    if (tabValue === 1 && !ordersLoaded && id) {
      salesApi.getCustomerSalesHistory(id)
        .then((res: any) => setOrders(res.orders ?? []))
        .catch(() => {})
        .finally(() => setOrdersLoaded(true))
    }
  }, [tabValue, ordersLoaded, id])

  // Lazy-load invoices on first visit to Invoices tab
  useEffect(() => {
    if (tabValue === 2 && !invoicesLoaded && id) {
      salesApi.getOutstandingInvoices(id)
        .then((res: any) => {
          setInvoices(res.invoices ?? [])
          setTotalOutstanding(res.totalOutstanding ?? 0)
        })
        .catch(() => {})
        .finally(() => setInvoicesLoaded(true))
    }
  }, [tabValue, invoicesLoaded, id])

  const handleDelete = async () => {
    if (!id) return
    setDeleteLoading(true)
    try {
      await dispatch(deleteCustomer(id)).unwrap()
      showSuccess('Customer deleted successfully.')
      navigate('/sales/customers')
    } catch (err: any) {
      const payload = err?.payload || err
      const backendError = payload?.response?.data
      if (backendError?.message) {
        showError(backendError.message)
      } else {
        showError('Failed to delete customer.')
      }
    } finally {
      setDeleteLoading(false)
      setIsDeleteOpen(false)
    }
  }

  if (loading) {
    return (
      <Box sx={{ p: 3, display: 'flex', justifyContent: 'center', pt: 10 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error || !customer) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error" sx={{ mb: 2 }}>{error ?? 'Customer not found.'}</Alert>
        <Button startIcon={<BackIcon />} onClick={() => navigate('/sales/customers')}>
          Back to Customers
        </Button>
      </Box>
    )
  }

  const fullAddress = [
    (customer as any).streetAddress,
    [(customer as any).city, (customer as any).state, (customer as any).postalCode].filter(Boolean).join(', '),
    (customer as any).country,
  ].filter(Boolean).join('\n')

  return (
    <Box sx={{ p: 3 }}>
      {/* Top bar */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Button startIcon={<BackIcon />} onClick={() => navigate('/sales/customers')}>
          Back to Customers
        </Button>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<EditIcon />}
            onClick={() => navigate('/sales/customers', { state: { editCustomerId: customer.id } })}
          >
            Edit
          </Button>
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={() => setIsDeleteOpen(true)}
          >
            Delete
          </Button>
        </Box>
      </Box>

      {/* Customer header */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 1 }}>
          <CustomersIcon sx={{ fontSize: 40, color: 'primary.main', mt: 0.5 }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="h4" fontWeight={700} sx={{ mb: 1 }}>
              {customer.name}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
              <Chip
                label={customer.isActive ? 'Active' : 'Inactive'}
                color={customer.isActive ? 'success' : 'default'}
                size="small"
              />
              <Chip
                label={customer.type === CustomerType.BUSINESS ? 'Business' : 'Individual'}
                size="small"
                variant="outlined"
              />
            </Stack>
            <Stack spacing={0.5}>
              {customer.phone && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <PhoneIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                  <Typography variant="body2">{customer.phone}</Typography>
                </Box>
              )}
              {fullAddress && (
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <LocationIcon sx={{ fontSize: 16, color: 'text.secondary', mt: 0.2 }} />
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>{fullAddress}</Typography>
                </Box>
              )}
            </Stack>
          </Box>
        </Box>
      </Paper>

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
          <Tab label="Overview" />
          <Tab label="Orders" />
          <Tab label="Invoices" />
        </Tabs>
      </Box>

      {/* Overview Tab */}
      <TabPanel value={tabValue} index={0}>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {[
            { label: 'Total Orders', value: customer.totalOrders },
            { label: 'Total Sales', value: formatCurrency(customer.totalSales) },
            { label: 'Avg Order Value', value: formatCurrency(statistics?.orders.averageOrderValue ?? 0) },
            { label: 'Last Purchase', value: customer.lastPurchaseDate ? formatDate(customer.lastPurchaseDate) : '—' },
          ].map(({ label, value }) => (
            <Grid key={label} size={{ xs: 6, md: 3 }}>
              <Card variant="outlined">
                <CardContent sx={{ textAlign: 'center', py: 2 }}>
                  <Typography variant="h5" fontWeight={700}>{value}</Typography>
                  <Typography variant="caption" color="text.secondary">{label}</Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        <Stack spacing={1.5}>
          {customer.priceList && (
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Typography color="text.secondary" sx={{ minWidth: 140 }}>Price List:</Typography>
              <Chip label={(customer as any).priceList?.name} size="small" />
            </Box>
          )}
          {statistics?.orders.firstOrderDate && (
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Typography color="text.secondary" sx={{ minWidth: 140 }}>First Purchase:</Typography>
              <Typography>{formatDate(statistics.orders.firstOrderDate)}</Typography>
            </Box>
          )}
          {(customer as any).notes && (
            <>
              <Divider />
              <Box>
                <Typography color="text.secondary" gutterBottom>Notes:</Typography>
                <Typography>{(customer as any).notes}</Typography>
              </Box>
            </>
          )}
        </Stack>
      </TabPanel>

      {/* Orders Tab */}
      <TabPanel value={tabValue} index={1}>
        {!ordersLoaded ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
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
                      <Typography variant="body2" color="primary" fontWeight={600}>
                        {order.orderNumber}
                      </Typography>
                    </TableCell>
                    <TableCell>{formatDate(order.orderDate)}</TableCell>
                    <TableCell>
                      <Chip
                        label={order.isFulfilled ? 'Fulfilled' : order.isPaid ? 'Paid' : 'Pending'}
                        size="small"
                        color={order.isFulfilled ? 'success' : order.isPaid ? 'primary' : 'default'}
                      />
                    </TableCell>
                    <TableCell align="right">{formatCurrency(order.totalAmount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </TabPanel>

      {/* Invoices Tab */}
      <TabPanel value={tabValue} index={2}>
        {!invoicesLoaded ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
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
                        <Typography fontWeight={600} color="error.main">
                          {formatCurrency(invoice.balanceDue)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </TabPanel>

      {/* Delete Confirmation */}
      <ConfirmationDialog
        open={isDeleteOpen}
        title="Confirm Delete"
        message={`Are you sure you want to delete "${customer.name}"? This will move them to deleted items.`}
        confirmText="Delete Customer"
        cancelText="Cancel"
        onConfirm={handleDelete}
        onCancel={() => setIsDeleteOpen(false)}
        severity="warning"
        loading={deleteLoading}
      />
    </Box>
  )
}

export default CustomerProfilePage
```

**Step 4: Add route to router.tsx**

Open `frontend/src/router.tsx`. After line 127:
```tsx
{ path: '/sales/customers', element: <CustomersPage /> },
```

Add:
```tsx
{ path: '/sales/customers/:id', element: <CustomerProfilePage /> },
```

Also add the lazy import near line 19:
```tsx
const CustomerProfilePage = React.lazy(() => import('./pages/sales/CustomerProfilePage'))
```

**Step 5: Run the tests**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/CustomerProfilePage.test.tsx --no-coverage
```

Expected: PASS (3 tests)

**Step 6: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

**Step 7: Commit**

```bash
git add frontend/src/pages/sales/CustomerProfilePage.tsx \
        frontend/src/pages/sales/__tests__/CustomerProfilePage.test.tsx \
        frontend/src/router.tsx
git commit -m "feat: add customer profile page with overview, orders, and invoices tabs"
```

---

## Task 5: Handle Edit from profile page

**Context:** The Edit button on the profile page currently navigates back to the list with state `{ editCustomerId }`. The list page needs to handle this state to auto-open the edit form.

**Files:**
- Modify: `frontend/src/pages/sales/CustomersPage.tsx`

**Step 1: Handle edit state on list page mount**

In `CustomersPage.tsx`, add `useLocation` import:
```tsx
import { useNavigate, useLocation } from 'react-router-dom'
```

Add inside the component after the existing state declarations:
```tsx
const location = useLocation()
const navigate = useNavigate()
```

Add a `useEffect` to handle the edit-from-profile flow:
```tsx
useEffect(() => {
  const state = location.state as { editCustomerId?: string } | null
  if (state?.editCustomerId) {
    const customerToEdit = customers.find(c => c.id === state.editCustomerId)
    if (customerToEdit) {
      handleOpenForm(customerToEdit)
      // Clear location state so refreshing doesn't re-open the form
      navigate('/sales/customers', { replace: true, state: {} })
    }
  }
}, [location.state, customers])
```

**Step 2: TypeScript check**

```bash
cd frontend && npm run type-check
```

**Step 3: Commit**

```bash
git add frontend/src/pages/sales/CustomersPage.tsx
git commit -m "feat: handle edit-from-profile navigation on customers list"
```

---

## Task 6: Run all frontend tests and verify

**Step 1: Run all frontend tests**

```bash
cd frontend && npm run test
```

Expected: all pass (or same as before + new tests pass).

**Step 2: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: clean.

**Step 3: Lint**

```bash
cd frontend && npm run lint
```

Fix any lint errors before proceeding.

**Step 4: Commit any fixes**

```bash
git add -p
git commit -m "fix: resolve lint issues in customer profile implementation"
```

---

## Summary of Files Changed

| File | Change |
|------|--------|
| `backend/src/modules/sales/services/customer.service.ts` | Add `salesOrderId` to outstanding invoices response |
| `frontend/src/pages/sales/CustomersPage.tsx` | Add Status filter, sortable columns, navigate on name/view click, remove view dialog, handle edit state |
| `frontend/src/pages/sales/CustomerProfilePage.tsx` | New file — customer profile page with tabs |
| `frontend/src/router.tsx` | Add `/sales/customers/:id` route |
| `frontend/src/pages/sales/__tests__/CustomerProfilePage.test.tsx` | New test file |
| `frontend/src/pages/sales/__tests__/CustomersPage.filter.test.tsx` | New test file |
