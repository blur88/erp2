# Customers Master-Detail Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `CustomersPage` into a Master-Detail layout following the `OrdersPage` pattern, extract Create/Edit into `CustomerFormPage`, embed the full customer profile in the workspace card, and delete `CustomerProfilePage`.

**Architecture:** Incremental extraction in 4 phases — CustomerFormPage first (page still works throughout), then CustomerWorkspaceCard, then the full MasterDetail refactor with Redux + hooks, then tests. Each phase produces independently working software.

**Tech Stack:** React 19, MUI v7, RTK Query, Redux Toolkit, React Router v6, React Hook Form + Yup, Vitest + Testing Library

---

## File Map

| Action | File |
|--------|------|
| Create | `frontend/src/pages/sales/CustomerFormPage.tsx` |
| Create | `frontend/src/pages/sales/components/CustomerList.tsx` |
| Create | `frontend/src/pages/sales/components/CustomerContextHeader.tsx` |
| Create | `frontend/src/pages/sales/components/CustomerWorkspaceCard.tsx` |
| Create | `frontend/src/pages/sales/hooks/useCustomersSelection.ts` |
| Create | `frontend/src/pages/sales/hooks/useCustomersActions.ts` |
| Create | `frontend/src/pages/sales/hooks/useCustomersPageState.ts` |
| Create | `frontend/src/pages/sales/__tests__/CustomerFormPage.test.tsx` |
| Modify | `frontend/src/store/slices/salesSlice.ts` |
| Modify | `frontend/src/router.tsx` |
| Modify | `frontend/src/pages/sales/CustomersPage.tsx` |
| Modify | `frontend/src/pages/sales/__tests__/CustomersPage.filterbar.test.tsx` |
| Modify | `frontend/src/pages/sales/__tests__/CustomersPage.filter.test.tsx` |
| Delete | `frontend/src/pages/sales/CustomerProfilePage.tsx` |
| Delete | `frontend/src/pages/sales/__tests__/CustomerProfilePage.test.tsx` |

---

## Phase 1: Extract CustomerFormPage

Extract the Create/Edit Dialog from `CustomersPage` into a standalone page at `/sales/customers/create` and `/sales/customers/:id/edit`. After this phase, `CustomersPage` still works as before — it just uses navigation instead of a dialog.

### Task 1: Add router routes for CustomerFormPage

**Files:**
- Modify: `frontend/src/router.tsx`

- [ ] **Step 1: Add the lazy import for CustomerFormPage**

In `frontend/src/router.tsx`, after line 21 (`const CustomerProfilePage = ...`), add:

```typescript
const CustomerFormPage = React.lazy(() => import('./pages/sales/CustomerFormPage'))
```

- [ ] **Step 2: Add routes — create before :id to avoid collision**

In `frontend/src/router.tsx`, replace lines 146-147:
```typescript
          { path: '/sales/customers', element: <CustomersPage />, handle: { title: 'Customers' } },
          { path: '/sales/customers/:id', element: <CustomerProfilePage />, handle: { title: 'Customer Profile' } },
```
With:
```typescript
          { path: '/sales/customers', element: <CustomersPage />, handle: { title: 'Customers' } },
          { path: '/sales/customers/create', element: <CustomerFormPage />, handle: { title: 'New Customer' } },
          { path: '/sales/customers/:id/edit', element: <CustomerFormPage />, handle: { title: 'Edit Customer' } },
          { path: '/sales/customers/:id', element: <CustomerProfilePage />, handle: { title: 'Customer Profile' } },
```

(Keep the old CustomerProfilePage route for now — it will be removed in Phase 3.)

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error TS" | head -20
```
Expected: no new errors (CustomerFormPage doesn't exist yet — the lazy import won't error at type-check time).

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/router.tsx
git commit -m "feat(sales): add customer create/edit routes to router"
```

---

### Task 2: Create CustomerFormPage

**Files:**
- Create: `frontend/src/pages/sales/CustomerFormPage.tsx`

- [ ] **Step 1: Create the file**

Create `frontend/src/pages/sales/CustomerFormPage.tsx` with this complete content (extracted from the Dialog in `CustomersPage.tsx` lines 802-1049, plus navigation logic):

```typescript
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Box,
  Button,
  CircularProgress,
  FormControl,
  Grid,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
  Paper,
  Alert,
} from '@mui/material'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { useNotification } from '@/hooks/useNotification'
import {
  useCreateCustomerMutation,
  useUpdateCustomerMutation,
} from '@/store/api/salesApi'
import type { Customer } from '@/types'
import { CustomerType } from '@/types'
import api from '@/services/api'
import PriceListSelector from '@/components/price-lists/PriceListSelector'
import PageHeader from '@/components/common/PageHeader'

const customerSchema = yup.object({
  name: yup.string().required('Name is required').max(200, 'Name must be less than 200 characters'),
  type: yup.string().oneOf(['individual', 'business']).required('Type is required'),
  phone: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(20, 'Phone must be less than 20 characters'),
  streetAddress: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(255, 'Street address must be less than 255 characters'),
  city: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(100, 'City must be less than 100 characters'),
  state: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(100, 'State must be less than 100 characters'),
  postalCode: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(20, 'Postal code must be less than 20 characters'),
  country: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(100, 'Country must be less than 100 characters'),
  priceListId: yup.string().optional().nullable(),
  notes: yup.string().optional().nullable().transform((value) => value?.trim() || null),
})

interface CustomerFormData {
  name: string
  type: CustomerType
  phone?: string | null
  streetAddress?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country?: string | null
  priceListId?: string | null
  notes?: string | null
}

const CustomerFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const isEdit = !!id

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loadingCustomer, setLoadingCustomer] = useState(isEdit)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [phoneValue, setPhoneValue] = useState('')
  const [isCheckingPhone, setIsCheckingPhone] = useState(false)
  const [phoneError, setPhoneError] = useState<string | null>(null)

  const [createCustomer, { isLoading: isCreating }] = useCreateCustomerMutation()
  const [updateCustomer, { isLoading: isUpdating }] = useUpdateCustomerMutation()
  const isSaving = isCreating || isUpdating

  const { control, handleSubmit, reset, formState: { errors } } = useForm<CustomerFormData>({
    resolver: yupResolver(customerSchema) as any,
    defaultValues: {
      name: '',
      type: CustomerType.BUSINESS,
      priceListId: null,
      phone: null,
      streetAddress: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
      notes: null,
    },
  })

  useEffect(() => {
    if (!id) return
    setLoadingCustomer(true)
    api.get(`/customers/${id}`)
      .then((res) => {
        const c: Customer = res.data?.data ?? res.data
        setCustomer(c)
        reset({
          name: c.name,
          type: c.type,
          priceListId: c.priceListId || null,
          phone: c.phone || null,
          streetAddress: c.streetAddress || null,
          city: c.city || null,
          state: c.state || null,
          postalCode: c.postalCode || null,
          country: c.country || null,
          notes: c.notes || null,
        })
        setPhoneValue(c.phone || '')
      })
      .catch(() => setLoadError('Customer not found.'))
      .finally(() => setLoadingCustomer(false))
  }, [id, reset])

  const checkPhoneDuplicate = useCallback(async (phone: string) => {
    if (!phone || phone.trim().length === 0) {
      setPhoneError(null)
      return
    }
    const normalizedPhone = phone.replace(/[\s\-\(\)\+]/g, '')
    if (normalizedPhone.length === 0) {
      setPhoneError(null)
      return
    }
    setIsCheckingPhone(true)
    setPhoneError(null)
    try {
      const [activeResponse, deletedResponse] = await Promise.all([
        api.get('/customers', { params: { search: phone } }),
        api.get('/customers/deleted', { params: { search: phone } }),
      ])
      const allCustomers = [
        ...(activeResponse.data?.data || []),
        ...(deletedResponse.data?.data || []),
      ]
      if (allCustomers.length > 0) {
        const duplicateCustomer = allCustomers.find((c: Customer) => {
          if (!c.phone) return false
          const existing = c.phone.replace(/[\s\-\(\)\+]/g, '')
          return existing === normalizedPhone && (!customer || c.id !== customer.id)
        })
        if (duplicateCustomer) {
          setPhoneError(`Phone number already exists for customer: ${duplicateCustomer.name}`)
        }
      }
    } catch {
      // ignore duplicate check errors
    } finally {
      setIsCheckingPhone(false)
    }
  }, [customer])

  const debouncedPhoneCheck = useMemo(() => {
    let timeoutId: ReturnType<typeof setTimeout>
    return (phone: string) => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => checkPhoneDuplicate(phone), 500)
    }
  }, [checkPhoneDuplicate])

  const handleFormSubmit = async (data: CustomerFormData) => {
    const cleanedData = {
      ...data,
      phone: data.phone?.trim() || null,
      streetAddress: data.streetAddress?.trim() || null,
      city: data.city?.trim() || null,
      state: data.state?.trim() || null,
      postalCode: data.postalCode?.trim() || null,
      country: data.country?.trim() || null,
      notes: data.notes?.trim() || null,
    }
    try {
      if (isEdit && id) {
        await updateCustomer({ id, data: cleanedData }).unwrap()
        showSuccess('Customer updated successfully')
      } else {
        await createCustomer(cleanedData).unwrap()
        showSuccess('Customer created successfully')
      }
      navigate('/sales/customers')
    } catch (error) {
      showError(`Failed to ${isEdit ? 'update' : 'create'} customer: ${error}`)
    }
  }

  if (loadingCustomer) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 10 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (loadError) {
    return <Alert severity="error">{loadError}</Alert>
  }

  return (
    <>
      <PageHeader
        title={isEdit ? 'Edit Customer' : 'New Customer'}
        subtitle={isEdit ? `Editing ${customer?.name ?? ''}` : 'Add a new customer to your account'}
        variant="standard"
      />
      <Paper sx={{ p: 3, maxWidth: 800 }}>
        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <Grid container spacing={2}>
            <Grid size={12}>
              <Typography variant="h6" gutterBottom>Basic Information</Typography>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <FormControl fullWidth error={!!errors.type}>
                    <InputLabel>Customer Type</InputLabel>
                    <Select {...field} label="Customer Type">
                      <MenuItem value={CustomerType.INDIVIDUAL}>Individual</MenuItem>
                      <MenuItem value={CustomerType.BUSINESS}>Business</MenuItem>
                    </Select>
                  </FormControl>
                )}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="priceListId"
                control={control}
                render={({ field }) => (
                  <PriceListSelector
                    value={field.value}
                    onChange={(value) => field.onChange(value)}
                    error={errors.priceListId?.message}
                    label="Price List"
                  />
                )}
              />
            </Grid>

            <Grid size={12}>
              <Controller
                name="name"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Customer Name"
                    error={!!errors.name}
                    helperText={errors.name?.message}
                  />
                )}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="phone"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    value={field.value || ''}
                    fullWidth
                    label="Phone"
                    error={!!errors.phone || !!phoneError}
                    helperText={errors.phone?.message || phoneError}
                    onChange={(e) => {
                      field.onChange(e)
                      setPhoneValue(e.target.value)
                      debouncedPhoneCheck(e.target.value)
                    }}
                    InputProps={{
                      endAdornment: isCheckingPhone ? (
                        <InputAdornment position="end">
                          <CircularProgress size={20} />
                        </InputAdornment>
                      ) : undefined,
                    }}
                  />
                )}
              />
            </Grid>

            <Grid size={12}>
              <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>Address Information</Typography>
            </Grid>

            <Grid size={12}>
              <Controller
                name="streetAddress"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    value={field.value || ''}
                    fullWidth
                    label="Street Address"
                    error={!!errors.streetAddress}
                    helperText={errors.streetAddress?.message}
                  />
                )}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="city"
                control={control}
                render={({ field }) => (
                  <TextField {...field} value={field.value || ''} fullWidth label="City"
                    error={!!errors.city} helperText={errors.city?.message} />
                )}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="state"
                control={control}
                render={({ field }) => (
                  <TextField {...field} value={field.value || ''} fullWidth label="State"
                    error={!!errors.state} helperText={errors.state?.message} />
                )}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="postalCode"
                control={control}
                render={({ field }) => (
                  <TextField {...field} value={field.value || ''} fullWidth label="Postal Code"
                    error={!!errors.postalCode} helperText={errors.postalCode?.message} />
                )}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="country"
                control={control}
                render={({ field }) => (
                  <TextField {...field} value={field.value || ''} fullWidth label="Country"
                    error={!!errors.country} helperText={errors.country?.message} />
                )}
              />
            </Grid>

            <Grid size={12}>
              <Controller
                name="notes"
                control={control}
                render={({ field }) => (
                  <TextField {...field} value={field.value || ''} fullWidth multiline rows={3}
                    label="Notes" error={!!errors.notes} helperText={errors.notes?.message} />
                )}
              />
            </Grid>

            <Grid size={12}>
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', pt: 1 }}>
                <Button onClick={() => navigate('/sales/customers')}>Cancel</Button>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={isSaving || !!phoneError || isCheckingPhone}
                >
                  {isSaving ? <CircularProgress size={20} /> : (isEdit ? 'Update' : 'Create')}
                </Button>
              </Box>
            </Grid>
          </Grid>
        </form>
      </Paper>
    </>
  )
}

export default CustomerFormPage
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error TS" | head -20
```
Expected: no errors in CustomerFormPage.tsx

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/pages/sales/CustomerFormPage.tsx
git commit -m "feat(sales): add CustomerFormPage for create/edit customer routes"
```

---

### Task 3: Wire CustomersPage to use navigation instead of Dialog

**Files:**
- Modify: `frontend/src/pages/sales/CustomersPage.tsx`

- [ ] **Step 1: Replace Edit button handler in the table**

In `frontend/src/pages/sales/CustomersPage.tsx`, find the Edit IconButton's `onClick` (around line 722):
```typescript
                          onClick={() => handleOpenForm(customer)}
```
Replace with:
```typescript
                          onClick={() => navigate(`/sales/customers/${customer.id}/edit`)}
```

- [ ] **Step 2: Replace "New Customer" button handler**

In `CustomersPage.tsx`, find `primaryAction` in PageHeader (around line 423):
```typescript
        primaryAction={{ label: 'New Customer', onClick: () => handleOpenForm() }}
```
Replace with:
```typescript
        primaryAction={{ label: 'New Customer', onClick: () => navigate('/sales/customers/create') }}
```

- [ ] **Step 3: Remove Dialog JSX and form-related state/logic**

The Dialog (lines 802-1049) and all form-related state/handlers can now be removed. Remove:
- The Dialog JSX block (lines 802-1049, starting `{/* Customer Form Dialog */}`)
- `isFormOpen` state and `setIsFormOpen`
- `phoneValue`, `setPhoneValue`, `isCheckingPhone`, `setIsCheckingPhone`, `phoneError`, `setPhoneError` state
- `checkPhoneDuplicate`, `debouncedPhoneCheck` callbacks
- `handleFormSubmit`, `handleOpenForm`, `handleCloseForm` handlers
- The `editCustomerId` route-state effect (lines 381-393)
- The `useForm` / `reset` / `control` / `handleSubmit` / `errors` / `setValue` setup (lines 172-187)
- Unused imports: `Dialog`, `DialogTitle`, `DialogContent`, `DialogActions`, `FormControl`, `InputLabel`, `Select`, `MenuItem`, `InputAdornment`, `Controller`, `useForm`, `yupResolver`, `yup`, `PriceListSelector`

Keep:
- `selectedCustomer` / `setSelectedCustomer` local state (still used for delete confirm)
- `handleDelete`
- `handleViewCustomer` → will be removed in Phase 3, keep for now
- `handleSort`
- All table JSX
- Delete confirm dialog
- Deleted customers dialog

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error TS" | head -20
```
Expected: no errors

- [ ] **Step 5: Run existing filter tests to confirm nothing broke**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/CustomersPage.filterbar.test.tsx src/pages/sales/__tests__/CustomersPage.filter.test.tsx 2>&1 | tail -20
```
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/pages/sales/CustomersPage.tsx
git commit -m "feat(sales): wire CustomersPage Edit/New to CustomerFormPage routes, remove inline dialog"
```

---

## Phase 2: Extract CustomerWorkspaceCard

### Task 4: Create CustomerWorkspaceCard

**Files:**
- Create: `frontend/src/pages/sales/components/CustomerWorkspaceCard.tsx`

- [ ] **Step 1: Create the file**

Create `frontend/src/pages/sales/components/CustomerWorkspaceCard.tsx`:

```typescript
import React, { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  Paper,
  Stack,
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
  LocationOn as LocationIcon,
  People as CustomersIcon,
  Phone as PhoneIcon,
  ShoppingCart as OrdersIcon,
  AccountBalance as InvoiceIcon,
  TrendingUp as SalesIcon,
  Star as StarIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import api from '@/services/api'
import type { Customer } from '@/types'
import { CustomerType } from '@/types'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/formatters'
import SalesStatsCards from './SalesStatsCards'
import type { StatItem } from './SalesStatsCards'

interface CustomerStatistics {
  orders: {
    totalOrders: number
    totalSales: number
    averageOrderValue: number
    firstOrderDate: string | null
    lastOrderDate: string | null
  }
}

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
    <Box role="tabpanel" hidden={value !== index} sx={{ pt: 2, overflow: 'auto' }}>
      {value === index && children}
    </Box>
  )
}

interface CustomerWorkspaceCardProps {
  selectedCustomer: Customer | null
}

const CustomerWorkspaceCard: React.FC<CustomerWorkspaceCardProps> = ({ selectedCustomer }) => {
  const navigate = useNavigate()

  const [statistics, setStatistics] = useState<CustomerStatistics | null>(null)
  const [orders, setOrders] = useState<SalesOrderItem[]>([])
  const [invoices, setInvoices] = useState<OutstandingInvoice[]>([])
  const [totalOutstanding, setTotalOutstanding] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tabValue, setTabValue] = useState(0)
  const [ordersLoaded, setOrdersLoaded] = useState(false)
  const [invoicesLoaded, setInvoicesLoaded] = useState(false)

  // Reset on customer change
  useEffect(() => {
    if (!selectedCustomer) {
      setStatistics(null)
      setOrders([])
      setInvoices([])
      setTotalOutstanding(0)
      setTabValue(0)
      setOrdersLoaded(false)
      setInvoicesLoaded(false)
      setError(null)
      return
    }

    setLoading(true)
    setTabValue(0)
    setOrdersLoaded(false)
    setInvoicesLoaded(false)
    setOrders([])
    setInvoices([])
    setError(null)

    api.get(`/customers/${selectedCustomer.id}/statistics`)
      .then((res) => {
        setStatistics(res.data?.data ?? res.data)
      })
      .catch(() => setError('Failed to load customer statistics.'))
      .finally(() => setLoading(false))
  }, [selectedCustomer?.id])

  // Lazy-load orders on tab switch
  useEffect(() => {
    if (tabValue === 1 && !ordersLoaded && selectedCustomer?.id) {
      api.get(`/customers/${selectedCustomer.id}/sales-history`)
        .then((res: any) => setOrders(res.data?.orders ?? res.data ?? []))
        .catch(() => {})
        .finally(() => setOrdersLoaded(true))
    }
  }, [tabValue, ordersLoaded, selectedCustomer?.id])

  // Lazy-load invoices on tab switch
  useEffect(() => {
    if (tabValue === 2 && !invoicesLoaded && selectedCustomer?.id) {
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
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 2, color: 'text.secondary' }}>
        <CustomersIcon sx={{ fontSize: 64, opacity: 0.3 }} />
        <Typography variant="h6" color="text.secondary">
          Select a customer to view details
        </Typography>
      </Box>
    )
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 6 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>
  }

  const fullAddress = [
    selectedCustomer.streetAddress,
    [selectedCustomer.city, selectedCustomer.state, selectedCustomer.postalCode].filter(Boolean).join(', '),
    selectedCustomer.country,
  ].filter(Boolean).join('\n')

  const stats: StatItem[] = [
    {
      title: 'Total Orders',
      value: selectedCustomer.totalOrders ?? 0,
      icon: OrdersIcon,
      color: 'primary',
    },
    {
      title: 'Total Sales',
      value: formatCurrency(selectedCustomer.totalSales ?? 0),
      icon: SalesIcon,
      color: 'success',
    },
    {
      title: 'Avg Order Value',
      value: formatCurrency(statistics?.orders.averageOrderValue ?? 0),
      icon: StarIcon,
      color: 'info',
    },
    {
      title: 'Outstanding',
      value: formatCurrency(totalOutstanding),
      icon: InvoiceIcon,
      color: totalOutstanding > 0 ? 'warning' : 'success',
    },
  ]

  return (
    <Box sx={{ overflow: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Contact info header */}
      <Paper sx={{ p: 2 }}>
        <Stack spacing={0.5}>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Chip
              label={selectedCustomer.isActive ? 'Active' : 'Inactive'}
              color={selectedCustomer.isActive ? 'success' : 'default'}
              size="small"
            />
            <Chip
              label={selectedCustomer.type === CustomerType.BUSINESS ? 'Business' : 'Individual'}
              size="small"
              variant="outlined"
            />
          </Stack>
          {selectedCustomer.phone && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <PhoneIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
              <Typography variant="body2">{selectedCustomer.phone}</Typography>
            </Box>
          )}
          {fullAddress && (
            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
              <LocationIcon sx={{ fontSize: 16, color: 'text.secondary', mt: 0.2 }} />
              <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>{fullAddress}</Typography>
            </Box>
          )}
        </Stack>
      </Paper>

      {/* Stats */}
      <SalesStatsCards stats={stats} />

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
          <Tab label="Overview" />
          <Tab label="Orders" />
          <Tab label="Invoices" />
        </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0}>
        <Stack spacing={1.5}>
          {selectedCustomer.priceList && (
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Typography color="text.secondary" sx={{ minWidth: 140 }}>Price List:</Typography>
              <Chip label={selectedCustomer.priceList.name} size="small" />
            </Box>
          )}
          {statistics?.orders.firstOrderDate && (
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Typography color="text.secondary" sx={{ minWidth: 140 }}>First Purchase:</Typography>
              <Typography>{formatDate(statistics.orders.firstOrderDate)}</Typography>
            </Box>
          )}
          {selectedCustomer.lastPurchaseDate && (
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Typography color="text.secondary" sx={{ minWidth: 140 }}>Last Purchase:</Typography>
              <Typography>{formatDate(selectedCustomer.lastPurchaseDate)}</Typography>
            </Box>
          )}
          {selectedCustomer.notes && (
            <>
              <Divider />
              <Box>
                <Typography color="text.secondary" gutterBottom>Notes:</Typography>
                <Typography>{selectedCustomer.notes}</Typography>
              </Box>
            </>
          )}
        </Stack>
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
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

      <TabPanel value={tabValue} index={2}>
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
    </Box>
  )
}

export default CustomerWorkspaceCard
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error TS" | head -20
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/pages/sales/components/CustomerWorkspaceCard.tsx
git commit -m "feat(sales): add CustomerWorkspaceCard with full profile tabs"
```

---

## Phase 3: Full MasterDetail Refactor

### Task 5: Add selectedCustomer to salesSlice

**Files:**
- Modify: `frontend/src/store/slices/salesSlice.ts`

- [ ] **Step 1: Add Customer import and selectedCustomer state**

In `frontend/src/store/slices/salesSlice.ts`, replace the file content with:

```typescript
import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { RootState } from '@/store'
import type { Customer, Invoice, Payment, SalesOrder } from '@/types'

interface SalesState {
  selectedOrder: SalesOrder | null
  selectedInvoice: Invoice | null
  selectedPayment: Payment | null
  selectedCustomer: Customer | null
  error: string | null
}

const initialState: SalesState = {
  selectedOrder: null,
  selectedInvoice: null,
  selectedPayment: null,
  selectedCustomer: null,
  error: null,
}

const salesSlice = createSlice({
  name: 'sales',
  initialState,
  reducers: {
    setSelectedOrder: (state, action: PayloadAction<SalesOrder | null>) => {
      state.selectedOrder = action.payload
    },
    setSelectedInvoice: (state, action: PayloadAction<Invoice | null>) => {
      state.selectedInvoice = action.payload
    },
    setSelectedPayment: (state, action: PayloadAction<Payment | null>) => {
      state.selectedPayment = action.payload
    },
    setSelectedCustomer: (state, action: PayloadAction<Customer | null>) => {
      state.selectedCustomer = action.payload
    },
    clearError: (state) => {
      state.error = null
    },
  },
})

export const {
  setSelectedOrder,
  setSelectedInvoice,
  setSelectedPayment,
  setSelectedCustomer,
  clearError,
} = salesSlice.actions

export const selectSelectedOrder = (state: RootState) => state.sales.selectedOrder
export const selectSelectedInvoice = (state: RootState) => state.sales.selectedInvoice
export const selectSelectedPayment = (state: RootState) => state.sales.selectedPayment
export const selectSelectedCustomer = (state: RootState) => state.sales.selectedCustomer
export const selectSalesError = (state: RootState) => state.sales.error

export default salesSlice.reducer
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error TS" | head -20
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/store/slices/salesSlice.ts
git commit -m "feat(sales): add selectedCustomer state to salesSlice"
```

---

### Task 6: Create useCustomersPageState hook

**Files:**
- Create: `frontend/src/pages/sales/hooks/useCustomersPageState.ts`

- [ ] **Step 1: Create the file**

Create `frontend/src/pages/sales/hooks/useCustomersPageState.ts`:

```typescript
import { useRef, useState } from 'react'

export function useCustomersPageState() {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletedCustomersDialogOpen, setDeletedCustomersDialogOpen] = useState(false)
  const [focusedCustomerIndex, setFocusedCustomerIndex] = useState(-1)

  const customerListRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  return {
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    deletedCustomersDialogOpen,
    setDeletedCustomersDialogOpen,
    focusedCustomerIndex,
    setFocusedCustomerIndex,
    customerListRef,
    searchInputRef,
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd frontend && git add src/pages/sales/hooks/useCustomersPageState.ts
git commit -m "feat(sales): add useCustomersPageState hook"
```

---

### Task 7: Create useCustomersActions hook

**Files:**
- Create: `frontend/src/pages/sales/hooks/useCustomersActions.ts`

- [ ] **Step 1: Create the file**

Create `frontend/src/pages/sales/hooks/useCustomersActions.ts`:

```typescript
import { useCallback } from 'react'
import { setSelectedCustomer } from '@/store/slices/salesSlice'
import type { AppDispatch } from '@/store'
import type { Customer } from '@/types'
import { useDeleteCustomerMutation } from '@/store/api/salesApi'

interface UseCustomersActionsParams {
  dispatch: AppDispatch
  selectedCustomer: Customer | null
  refetchCustomers: () => void
  showSuccess: (message: string) => void
  showError: (message: string) => void
  setDeleteConfirmOpen: (open: boolean) => void
  setPageError: (error: string | null) => void
}

export function useCustomersActions({
  dispatch,
  selectedCustomer,
  refetchCustomers,
  showSuccess,
  showError,
  setDeleteConfirmOpen,
  setPageError,
}: UseCustomersActionsParams) {
  const [deleteCustomer] = useDeleteCustomerMutation()

  const handleDelete = useCallback(async () => {
    if (!selectedCustomer) return
    try {
      await deleteCustomer(selectedCustomer.id).unwrap()
      showSuccess(`Customer "${selectedCustomer.name}" deleted successfully`)
      dispatch(setSelectedCustomer(null))
      setDeleteConfirmOpen(false)
      setPageError(null)
      refetchCustomers()
    } catch (error: any) {
      const actualError = error?.payload || error
      const backendError = actualError?.response?.data
      let errorMessage = 'An unexpected error occurred. Please try again.'

      if (backendError?.message) {
        errorMessage = backendError.message
        if (backendError.suggestions?.length > 0) {
          errorMessage += `\n\nSuggestion: ${backendError.suggestions[0]}`
        }
      } else if (actualError?.message && actualError.message !== 'Request failed with status code 400') {
        errorMessage = actualError.message
      }

      setPageError(errorMessage)
      showError(errorMessage)
    }
  }, [deleteCustomer, dispatch, refetchCustomers, selectedCustomer, setDeleteConfirmOpen, setPageError, showError, showSuccess])

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmOpen(false)
  }, [setDeleteConfirmOpen])

  return {
    handleDelete,
    handleCancelDelete,
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd frontend && git add src/pages/sales/hooks/useCustomersActions.ts
git commit -m "feat(sales): add useCustomersActions hook"
```

---

### Task 8: Create useCustomersSelection hook

**Files:**
- Create: `frontend/src/pages/sales/hooks/useCustomersSelection.ts`

- [ ] **Step 1: Create the file**

Create `frontend/src/pages/sales/hooks/useCustomersSelection.ts`:

```typescript
import { useCallback, useEffect, type RefObject } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import { setSelectedCustomer } from '@/store/slices/salesSlice'
import type { AppDispatch } from '@/store'
import type { Customer } from '@/types'

interface UseCustomersSelectionParams {
  dispatch: AppDispatch
  customers: Customer[]
  selectedCustomer: Customer | null
  focusedCustomerIndex: number
  setFocusedCustomerIndex: (index: number) => void
  navigate: NavigateFunction
  customerListRef: RefObject<HTMLDivElement | null>
  setDeleteConfirmOpen: (open: boolean) => void
  setDeletedCustomersDialogOpen: (open: boolean) => void
}

export function useCustomersSelection({
  dispatch,
  customers,
  selectedCustomer,
  focusedCustomerIndex,
  setFocusedCustomerIndex,
  navigate,
  customerListRef,
  setDeleteConfirmOpen,
  setDeletedCustomersDialogOpen,
}: UseCustomersSelectionParams) {
  // Auto-select first customer when list loads
  useEffect(() => {
    if (customers.length > 0 && focusedCustomerIndex === -1 && !selectedCustomer) {
      setFocusedCustomerIndex(0)
      dispatch(setSelectedCustomer(customers[0]))
    } else if (customers.length === 0) {
      dispatch(setSelectedCustomer(null))
      setFocusedCustomerIndex(-1)
    }
  }, [customers, dispatch, focusedCustomerIndex, selectedCustomer, setFocusedCustomerIndex])

  // Scroll focused row into view
  useEffect(() => {
    if (focusedCustomerIndex >= 0 && customerListRef.current) {
      const focusedRow = customerListRef.current.querySelector(`[data-customer-index="${focusedCustomerIndex}"]`)
      if (focusedRow) {
        focusedRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [focusedCustomerIndex, customerListRef])

  const handleCustomerSelect = useCallback((customer: Customer) => {
    const index = customers.findIndex((c) => c.id === customer.id)
    setFocusedCustomerIndex(index)
    dispatch(setSelectedCustomer(customer))
  }, [customers, dispatch, setFocusedCustomerIndex])

  const selectAtIndex = useCallback((index: number) => {
    setFocusedCustomerIndex(index)
    dispatch(setSelectedCustomer(customers[index]))
  }, [customers, dispatch, setFocusedCustomerIndex])

  const handleNavigateUp = useCallback(() => {
    if (focusedCustomerIndex > 0) {
      selectAtIndex(focusedCustomerIndex - 1)
    }
  }, [focusedCustomerIndex, selectAtIndex])

  const handleNavigateDown = useCallback(() => {
    if (focusedCustomerIndex < customers.length - 1) {
      selectAtIndex(focusedCustomerIndex + 1)
    }
  }, [focusedCustomerIndex, customers.length, selectAtIndex])

  const handleNavigateToFirst = useCallback(() => {
    if (customers.length > 0) selectAtIndex(0)
  }, [customers.length, selectAtIndex])

  const handleNavigateToLast = useCallback(() => {
    if (customers.length > 0) selectAtIndex(customers.length - 1)
  }, [customers.length, selectAtIndex])

  const handlePageUpNavigation = useCallback(() => {
    const newIndex = Math.max(0, focusedCustomerIndex - 20)
    if (customers[newIndex]) selectAtIndex(newIndex)
  }, [focusedCustomerIndex, customers, selectAtIndex])

  const handlePageDownNavigation = useCallback(() => {
    const newIndex = Math.min(customers.length - 1, focusedCustomerIndex + 20)
    if (customers[newIndex]) selectAtIndex(newIndex)
  }, [focusedCustomerIndex, customers, selectAtIndex])

  const handleEnterAction = useCallback(() => {
    if (focusedCustomerIndex >= 0 && customers[focusedCustomerIndex]) {
      navigate(`/sales/customers/${customers[focusedCustomerIndex].id}/edit`)
    }
  }, [focusedCustomerIndex, customers, navigate])

  const handleEscapeAction = useCallback(() => {
    setFocusedCustomerIndex(-1)
    dispatch(setSelectedCustomer(null))
    setDeleteConfirmOpen(false)
    setDeletedCustomersDialogOpen(false)
  }, [dispatch, setDeleteConfirmOpen, setDeletedCustomersDialogOpen, setFocusedCustomerIndex])

  return {
    handleCustomerSelect,
    handleNavigateUp,
    handleNavigateDown,
    handleNavigateToFirst,
    handleNavigateToLast,
    handlePageUpNavigation,
    handlePageDownNavigation,
    handleEnterAction,
    handleEscapeAction,
  }
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error TS" | head -20
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd frontend && git add src/pages/sales/hooks/useCustomersSelection.ts
git commit -m "feat(sales): add useCustomersSelection hook with keyboard navigation"
```

---

### Task 9: Create CustomerList component

**Files:**
- Create: `frontend/src/pages/sales/components/CustomerList.tsx`

- [ ] **Step 1: Create the file**

Create `frontend/src/pages/sales/components/CustomerList.tsx`:

```typescript
import React from 'react'
import { Box, List, ListItemButton, ListItemText, Typography } from '@mui/material'
import { ListSkeleton } from '@/components/common/ListSkeleton'
import type { Customer } from '@/types'

interface CustomerListProps {
  customers: Customer[]
  loading: boolean
  selectedCustomerId: string | undefined
  focusedIndex: number
  onSelect: (customer: Customer) => void
  listRef: React.RefObject<HTMLDivElement | null>
}

const CustomerList: React.FC<CustomerListProps> = ({
  customers,
  loading,
  selectedCustomerId,
  focusedIndex,
  onSelect,
  listRef,
}) => {
  if (loading) {
    return <ListSkeleton rows={10} columns={1} />
  }

  return (
    <Box
      ref={listRef}
      sx={{
        flex: 1,
        overflow: 'auto',
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      {customers.length === 0 ? (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body2" color="text.secondary">No customers found</Typography>
        </Box>
      ) : (
        <List dense disablePadding>
          {customers.map((customer, index) => (
            <ListItemButton
              key={customer.id}
              data-customer-index={index}
              selected={customer.id === selectedCustomerId}
              onClick={() => onSelect(customer)}
              sx={{
                borderLeft: index === focusedIndex ? '3px solid' : '3px solid transparent',
                borderColor: index === focusedIndex ? 'primary.main' : 'transparent',
                py: 1,
                px: 1.5,
              }}
            >
              <ListItemText
                primary={customer.name}
                primaryTypographyProps={{ variant: 'body2', noWrap: true }}
              />
            </ListItemButton>
          ))}
        </List>
      )}
    </Box>
  )
}

export default CustomerList
```

- [ ] **Step 2: Commit**

```bash
cd frontend && git add src/pages/sales/components/CustomerList.tsx
git commit -m "feat(sales): add CustomerList component for master pane"
```

---

### Task 10: Create CustomerContextHeader component

**Files:**
- Create: `frontend/src/pages/sales/components/CustomerContextHeader.tsx`

- [ ] **Step 1: Create the file**

Create `frontend/src/pages/sales/components/CustomerContextHeader.tsx`:

```typescript
import React from 'react'
import { Box, Button, Chip, Typography } from '@mui/material'
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import type { Customer } from '@/types'
import { CustomerType } from '@/types'

interface CustomerContextHeaderProps {
  selectedCustomer: Customer | null
  onDelete: () => void
}

const CustomerContextHeader: React.FC<CustomerContextHeaderProps> = ({
  selectedCustomer,
  onDelete,
}) => {
  const navigate = useNavigate()

  if (!selectedCustomer) {
    return (
      <Box sx={{ p: 2, color: 'text.secondary' }}>
        <Typography variant="body2">Select a customer from the list</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="h6" fontWeight={600} noWrap>
          {selectedCustomer.name}
        </Typography>
        <Chip
          label={selectedCustomer.type === CustomerType.BUSINESS ? 'Business' : 'Individual'}
          size="small"
          variant="outlined"
        />
      </Box>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button
          size="small"
          variant="outlined"
          startIcon={<EditIcon />}
          onClick={() => navigate(`/sales/customers/${selectedCustomer.id}/edit`)}
        >
          Edit
        </Button>
        <Button
          size="small"
          variant="outlined"
          color="error"
          startIcon={<DeleteIcon />}
          onClick={onDelete}
        >
          Delete
        </Button>
      </Box>
    </Box>
  )
}

export default CustomerContextHeader
```

- [ ] **Step 2: Commit**

```bash
cd frontend && git add src/pages/sales/components/CustomerContextHeader.tsx
git commit -m "feat(sales): add CustomerContextHeader component"
```

---

### Task 11: Refactor CustomersPage to MasterDetail layout

**Files:**
- Modify: `frontend/src/pages/sales/CustomersPage.tsx`

- [ ] **Step 1: Replace CustomersPage with the refactored version**

Replace the entire content of `frontend/src/pages/sales/CustomersPage.tsx` with:

```typescript
import React, { useMemo, useState } from 'react'
import { Alert, Box, useMediaQuery, useTheme } from '@mui/material'
import { useNavigate } from 'react-router-dom'

import MasterDetailWorkspace from '@/components/common/MasterDetailWorkspace'
import PageHeader from '@/components/common/PageHeader'
import { FilterBar } from '@/components/filters'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import DeletedCustomersDialog from '@/components/sales/DeletedCustomersDialog'
import CustomerList from './components/CustomerList'
import CustomerContextHeader from './components/CustomerContextHeader'
import CustomerWorkspaceCard from './components/CustomerWorkspaceCard'
import { useCustomersPageState } from './hooks/useCustomersPageState'
import { useCustomersSelection } from './hooks/useCustomersSelection'
import { useCustomersActions } from './hooks/useCustomersActions'

import { useFilterBar } from '@/hooks/useFilterBar'
import { useNotification } from '@/hooks/useNotification'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { selectSelectedCustomer } from '@/store/slices/salesSlice'
import { useGetCustomersQuery } from '@/store/api/salesApi'
import type { FilterBarConfig } from '@/types/filterBar.types'

interface CustomerFilters {
  search: string
  status: 'active' | 'inactive' | null
}

const CustomersPage: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { showSuccess, showError } = useNotification()
  const selectedCustomer = useAppSelector(selectSelectedCustomer)
  const [pageError, setPageError] = useState<string | null>(null)

  const pageState = useCustomersPageState()

  const filterConfig = useMemo<FilterBarConfig<CustomerFilters>>(
    () => ({
      search: { placeholder: 'Search by name or phone...' },
      fields: [
        {
          field: 'status',
          label: 'Status',
          type: 'select',
          options: [
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ],
        },
      ],
      defaults: { search: '', status: null },
    }),
    [],
  )

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)

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

  const { data: customersResponse, isLoading, isFetching, error, refetch } = useGetCustomersQuery(customerQueryParams)
  const customers = customersResponse?.data ?? []
  const loading = isLoading || isFetching

  const selection = useCustomersSelection({
    dispatch,
    customers,
    selectedCustomer,
    focusedCustomerIndex: pageState.focusedCustomerIndex,
    setFocusedCustomerIndex: pageState.setFocusedCustomerIndex,
    navigate,
    customerListRef: pageState.customerListRef,
    setDeleteConfirmOpen: pageState.setDeleteConfirmOpen,
    setDeletedCustomersDialogOpen: pageState.setDeletedCustomersDialogOpen,
  })

  const actions = useCustomersActions({
    dispatch,
    selectedCustomer,
    refetchCustomers: refetch,
    showSuccess,
    showError,
    setDeleteConfirmOpen: pageState.setDeleteConfirmOpen,
    setPageError,
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
        title="Customers"
        subtitle="View customer profiles and client account details"
        variant="workflow"
        secondaryAction={{ label: 'View Deleted', onClick: () => pageState.setDeletedCustomersDialogOpen(true) }}
        primaryAction={{ label: 'New Customer', onClick: () => navigate('/sales/customers/create') }}
        toolbar={(
          <FilterBar
            config={filterConfig}
            draftFilters={draftFilters}
            handlers={handlers}
            hasActiveFilters={hasActiveFilters}
            searchInputRef={pageState.searchInputRef}
          />
        )}
      />

      {(pageError || error) && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setPageError(null)}>
          {pageError || 'Failed to load customers.'}
        </Alert>
      )}

      <MasterDetailWorkspace
        isMobile={isMobile}
        listSlot={(
          <CustomerList
            customers={customers}
            loading={loading}
            selectedCustomerId={selectedCustomer?.id}
            focusedIndex={pageState.focusedCustomerIndex}
            onSelect={selection.handleCustomerSelect}
            listRef={pageState.customerListRef}
          />
        )}
        headerSlot={(
          <CustomerContextHeader
            selectedCustomer={selectedCustomer}
            onDelete={() => pageState.setDeleteConfirmOpen(true)}
          />
        )}
        workspaceSlot={<CustomerWorkspaceCard selectedCustomer={selectedCustomer} />}
      />

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
    </Box>
  )
}

export default CustomersPage
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error TS" | head -20
```
Expected: no errors

- [ ] **Step 3: Run the existing filter tests**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/CustomersPage.filterbar.test.tsx src/pages/sales/__tests__/CustomersPage.filter.test.tsx 2>&1 | tail -30
```
Expected: some tests fail because the test renders `CustomersPage` which now renders `CustomerWorkspaceCard`, `CustomerContextHeader`, `CustomerList` — the mock setup needs updating. That's fine — we fix tests in Phase 4.

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/pages/sales/CustomersPage.tsx
git commit -m "feat(sales): refactor CustomersPage to MasterDetail layout"
```

---

### Task 12: Remove CustomerProfilePage and update router

**Files:**
- Modify: `frontend/src/router.tsx`
- Delete: `frontend/src/pages/sales/CustomerProfilePage.tsx`
- Delete: `frontend/src/pages/sales/__tests__/CustomerProfilePage.test.tsx`

- [ ] **Step 1: Remove CustomerProfilePage from router**

In `frontend/src/router.tsx`, remove the lazy import on line 21:
```typescript
const CustomerProfilePage = React.lazy(() => import('./pages/sales/CustomerProfilePage'))
```

And remove the route (now in the customers section):
```typescript
          { path: '/sales/customers/:id', element: <CustomerProfilePage />, handle: { title: 'Customer Profile' } },
```

- [ ] **Step 2: Delete the files**

```bash
rm frontend/src/pages/sales/CustomerProfilePage.tsx
rm frontend/src/pages/sales/__tests__/CustomerProfilePage.test.tsx
```

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error TS" | head -20
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
cd frontend && git add -A
git commit -m "feat(sales): remove CustomerProfilePage — content now in CustomerWorkspaceCard"
```

---

## Phase 4: Tests

### Task 13: Update existing CustomersPage filter tests

**Files:**
- Modify: `frontend/src/pages/sales/__tests__/CustomersPage.filterbar.test.tsx`
- Modify: `frontend/src/pages/sales/__tests__/CustomersPage.filter.test.tsx`

- [ ] **Step 1: Read current filterbar test failures**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/CustomersPage.filterbar.test.tsx 2>&1 | tail -40
```

Note the failing tests — they will fail because the new page renders `CustomerWorkspaceCard` (which calls `api.get` on mount) and `CustomerContextHeader`. We need to mock these new sub-components.

- [ ] **Step 2: Add mocks for new sub-components to CustomersPage.filterbar.test.tsx**

In `frontend/src/pages/sales/__tests__/CustomersPage.filterbar.test.tsx`, add these vi.mock calls after the existing mocks:

```typescript
vi.mock('../components/CustomerWorkspaceCard', () => ({
  default: () => <div data-testid="customer-workspace-card" />,
}))

vi.mock('../components/CustomerContextHeader', () => ({
  default: () => <div data-testid="customer-context-header" />,
}))

vi.mock('../components/CustomerList', () => ({
  default: ({ customers, onSelect }: any) => (
    <div data-testid="customer-list">
      {customers.map((c: any) => (
        <div key={c.id} data-testid={`customer-item-${c.id}`} onClick={() => onSelect(c)}>
          {c.name}
        </div>
      ))}
    </div>
  ),
}))

vi.mock('../hooks/useCustomersSelection', () => ({
  useCustomersSelection: () => ({
    handleCustomerSelect: vi.fn(),
    handleNavigateUp: vi.fn(),
    handleNavigateDown: vi.fn(),
    handleNavigateToFirst: vi.fn(),
    handleNavigateToLast: vi.fn(),
    handlePageUpNavigation: vi.fn(),
    handlePageDownNavigation: vi.fn(),
    handleEnterAction: vi.fn(),
    handleEscapeAction: vi.fn(),
  }),
}))

vi.mock('../hooks/useCustomersActions', () => ({
  useCustomersActions: () => ({
    handleDelete: vi.fn(),
    handleCancelDelete: vi.fn(),
  }),
}))

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

Also update the `renderPage` function to include `useNavigate` mock if missing:

```typescript
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  }
})
```

- [ ] **Step 3: Run the filterbar tests**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/CustomersPage.filterbar.test.tsx 2>&1 | tail -20
```
Expected: all pass

- [ ] **Step 4: Apply same mocks to CustomersPage.filter.test.tsx**

Open `frontend/src/pages/sales/__tests__/CustomersPage.filter.test.tsx` and add the same set of mocks for `CustomerWorkspaceCard`, `CustomerContextHeader`, `CustomerList`, `useCustomersSelection`, `useCustomersActions`, `useCustomersPageState`, and `useNavigate` as added in Step 2.

- [ ] **Step 5: Run the filter tests**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/CustomersPage.filter.test.tsx 2>&1 | tail -20
```
Expected: all pass

- [ ] **Step 6: Run both filter test files together**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/CustomersPage.filterbar.test.tsx src/pages/sales/__tests__/CustomersPage.filter.test.tsx 2>&1 | tail -10
```
Expected: all pass

- [ ] **Step 7: Commit**

```bash
cd frontend && git add src/pages/sales/__tests__/CustomersPage.filterbar.test.tsx src/pages/sales/__tests__/CustomersPage.filter.test.tsx
git commit -m "test(sales): update CustomersPage filter tests for MasterDetail layout"
```

---

### Task 14: Write CustomerFormPage tests

**Files:**
- Create: `frontend/src/pages/sales/__tests__/CustomerFormPage.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/pages/sales/__tests__/CustomerFormPage.test.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CustomerFormPage from '../CustomerFormPage'
import salesReducer from '@/store/slices/salesSlice'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

const mockCreateCustomer = vi.fn()
const mockUpdateCustomer = vi.fn()

vi.mock('@/store/api/salesApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/salesApi')>()
  return {
    ...actual,
    useCreateCustomerMutation: vi.fn(() => [mockCreateCustomer, { isLoading: false }]),
    useUpdateCustomerMutation: vi.fn(() => [mockUpdateCustomer, { isLoading: false }]),
  }
})

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

vi.mock('@/components/price-lists/PriceListSelector', () => ({
  default: ({ value, onChange }: any) => (
    <input
      data-testid="price-list-selector"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}))

vi.mock('@/services/api', () => ({
  default: {
    get: vi.fn(),
  },
}))

function renderCreatePage() {
  const store = configureStore({ reducer: { sales: salesReducer } })
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/sales/customers/create']}>
        <Routes>
          <Route path="/sales/customers/create" element={<CustomerFormPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

function renderEditPage(customerId = 'cust-1') {
  const store = configureStore({ reducer: { sales: salesReducer } })
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/sales/customers/${customerId}/edit`]}>
        <Routes>
          <Route path="/sales/customers/:id/edit" element={<CustomerFormPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

describe('CustomerFormPage — Create mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders empty form with New Customer heading', () => {
    renderCreatePage()
    expect(screen.getByText('New Customer')).toBeInTheDocument()
    expect(screen.getByLabelText(/customer name/i)).toHaveValue('')
  })

  it('shows validation error when name is empty on submit', async () => {
    const user = userEvent.setup()
    renderCreatePage()

    await user.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument()
    })
    expect(mockCreateCustomer).not.toHaveBeenCalled()
  })

  it('calls createCustomer and navigates away on successful submit', async () => {
    const user = userEvent.setup()
    mockCreateCustomer.mockResolvedValue({ data: { id: 'new-cust' } })
    renderCreatePage()

    await user.type(screen.getByLabelText(/customer name/i), 'Test Corp')
    await user.click(screen.getByRole('button', { name: /create/i }))

    await waitFor(() => {
      expect(mockCreateCustomer).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Test Corp' })
      )
    })
    expect(mockNavigate).toHaveBeenCalledWith('/sales/customers')
  })

  it('navigates back on Cancel click', async () => {
    const user = userEvent.setup()
    renderCreatePage()

    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(mockNavigate).toHaveBeenCalledWith('/sales/customers')
  })
})

describe('CustomerFormPage — Edit mode', () => {
  const mockCustomer = {
    id: 'cust-1',
    name: 'Acme Corp',
    type: 'business',
    phone: '555-1234',
    streetAddress: null,
    city: null,
    state: null,
    postalCode: null,
    country: null,
    priceListId: null,
    notes: null,
    isActive: true,
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    const { default: api } = await import('@/services/api')
    ;(api.get as any).mockImplementation((url: string) => {
      if (url === '/customers/cust-1') {
        return Promise.resolve({ data: { data: mockCustomer } })
      }
      return Promise.resolve({ data: { data: [] } })
    })
  })

  it('shows Edit Customer heading and pre-populates name', async () => {
    renderEditPage('cust-1')

    await waitFor(() => {
      expect(screen.getByText('Edit Customer')).toBeInTheDocument()
    })
    expect(screen.getByLabelText(/customer name/i)).toHaveValue('Acme Corp')
  })

  it('calls updateCustomer and navigates on successful submit', async () => {
    const user = userEvent.setup()
    mockUpdateCustomer.mockResolvedValue({ data: { id: 'cust-1' } })
    renderEditPage('cust-1')

    await waitFor(() => {
      expect(screen.getByLabelText(/customer name/i)).toHaveValue('Acme Corp')
    })

    await user.clear(screen.getByLabelText(/customer name/i))
    await user.type(screen.getByLabelText(/customer name/i), 'Acme Corp Updated')
    await user.click(screen.getByRole('button', { name: /update/i }))

    await waitFor(() => {
      expect(mockUpdateCustomer).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'cust-1',
          data: expect.objectContaining({ name: 'Acme Corp Updated' }),
        })
      )
    })
    expect(mockNavigate).toHaveBeenCalledWith('/sales/customers')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail correctly (file not yet fully wired)**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/CustomerFormPage.test.tsx 2>&1 | tail -30
```
Expected: tests run (may pass already since CustomerFormPage exists, or fail with specific errors)

- [ ] **Step 3: Fix any failures and re-run until all pass**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/CustomerFormPage.test.tsx 2>&1 | tail -20
```
Expected: all 6 tests pass

- [ ] **Step 4: Commit**

```bash
cd frontend && git add src/pages/sales/__tests__/CustomerFormPage.test.tsx
git commit -m "test(sales): add CustomerFormPage tests for create and edit modes"
```

---

### Task 15: Final verification

- [ ] **Step 1: Run all customer-related tests**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/CustomersPage.filterbar.test.tsx src/pages/sales/__tests__/CustomersPage.filter.test.tsx src/pages/sales/__tests__/CustomerFormPage.test.tsx 2>&1 | tail -15
```
Expected: all pass

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error TS" | head -20
```
Expected: no errors

- [ ] **Step 3: Lint check**

```bash
cd frontend && npm run lint 2>&1 | grep -E "error" | head -20
```
Expected: no errors

- [ ] **Step 4: Final commit**

```bash
cd frontend && git add -A
git commit -m "feat(sales): close #303 — Customers page Master-Detail layout complete"
```
