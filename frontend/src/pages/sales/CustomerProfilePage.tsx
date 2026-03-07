import React, { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
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
  ArrowBack as BackIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  LocationOn as LocationIcon,
  People as CustomersIcon,
  Phone as PhoneIcon,
} from '@mui/icons-material'
import { useNavigate, useParams } from 'react-router-dom'
import { useNotification } from '@/hooks/useNotification'
import { useDeleteCustomerMutation } from '@/store/api/salesApi'
import api from '@/services/api'
import type { Customer } from '@/types'
import { CustomerType } from '@/types'
import { TABLE_STYLES } from '@/constants/typography'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/formatters'
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
  const { showSuccess, showError } = useNotification()
  const [deleteCustomer] = useDeleteCustomerMutation()

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

  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.all([
      api.get(`/customers/${id}`).then(r => r.data?.data ?? r.data),
      api.get(`/customers/${id}/statistics`).then(r => r.data?.data ?? r.data),
    ])
      .then(([cust, stats]) => {
        setCustomer(cust as unknown as Customer)
        setStatistics(stats as unknown as CustomerStatistics)
      })
      .catch(() => setError('Customer not found.'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (tabValue === 1 && !ordersLoaded && id) {
      api
        .get(`/customers/${id}/sales-history`)
        .then((res: any) => setOrders(res.data?.orders ?? res.data ?? []))
        .catch(() => {})
        .finally(() => setOrdersLoaded(true))
    }
  }, [tabValue, ordersLoaded, id])

  useEffect(() => {
    if (tabValue === 2 && !invoicesLoaded && id) {
      api
        .get(`/customers/${id}/outstanding-invoices`)
        .then((res: any) => {
          const data = res.data?.data ?? res.data
          setInvoices(data?.invoices ?? [])
          setTotalOutstanding(data?.totalOutstanding ?? 0)
        })
        .catch(() => {})
        .finally(() => setInvoicesLoaded(true))
    }
  }, [tabValue, invoicesLoaded, id])

  const handleDelete = async () => {
    if (!id) return

    setDeleteLoading(true)
    try {
      await deleteCustomer(id).unwrap()
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
        <Alert severity="error" sx={{ mb: 2 }}>
          {error ?? 'Customer not found.'}
        </Alert>
        <Button startIcon={<BackIcon />} onClick={() => navigate('/sales/customers')}>
          Back to Customers
        </Button>
      </Box>
    )
  }

  const fullAddress = [
    customer.streetAddress,
    [customer.city, customer.state, customer.postalCode].filter(Boolean).join(', '),
    customer.country,
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <Box sx={{ p: 3 }}>
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
          <Button variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={() => setIsDeleteOpen(true)}>
            Delete
          </Button>
        </Box>
      </Box>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 1 }}>
          <CustomersIcon sx={{ fontSize: 40, color: 'primary.main', mt: 0.5 }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="h4" fontWeight={700} sx={{ mb: 1 }}>
              {customer.name}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
              <Chip label={customer.isActive ? 'Active' : 'Inactive'} color={customer.isActive ? 'success' : 'default'} size="small" />
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
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                    {fullAddress}
                  </Typography>
                </Box>
              )}
            </Stack>
          </Box>
        </Box>
      </Paper>

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={(_, value) => setTabValue(value)}>
          <Tab label="Overview" />
          <Tab label="Orders" />
          <Tab label="Invoices" />
        </Tabs>
      </Box>

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
                  <Typography variant="h5" fontWeight={700}>
                    {value}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {label}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        <Stack spacing={1.5}>
          {customer.priceList && (
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Typography color="text.secondary" sx={{ minWidth: 140 }}>
                Price List:
              </Typography>
              <Chip label={customer.priceList.name} size="small" />
            </Box>
          )}
          {statistics?.orders.firstOrderDate && (
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Typography color="text.secondary" sx={{ minWidth: 140 }}>
                First Purchase:
              </Typography>
              <Typography>{formatDate(statistics.orders.firstOrderDate)}</Typography>
            </Box>
          )}
          {customer.notes && (
            <>
              <Divider />
              <Box>
                <Typography color="text.secondary" gutterBottom>
                  Notes:
                </Typography>
                <Typography>{customer.notes}</Typography>
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
          <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            No orders found.
          </Typography>
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

      <TabPanel value={tabValue} index={2}>
        {!invoicesLoaded ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : invoices.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            No outstanding invoices.
          </Typography>
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
