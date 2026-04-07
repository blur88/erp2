import React, { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
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
  AccountBalance as InvoiceIcon,
  LocationOn as LocationIcon,
  People as CustomersIcon,
  Phone as PhoneIcon,
  ShoppingCart as OrdersIcon,
  Star as StarIcon,
  TrendingUp as SalesIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'

import { TABLE_STYLES } from '@/constants/tableStyles'
import api from '@/services/api'
import type { Customer } from '@/types'
import { CustomerType } from '@/types'
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
    setStatistics(null)
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

  useEffect(() => {
    if (tabValue === 1 && !ordersLoaded && selectedCustomer?.id) {
      api.get(`/customers/${selectedCustomer.id}/sales-history`)
        .then((res: any) => setOrders(res.data?.orders ?? res.data ?? []))
        .catch(() => {})
        .finally(() => setOrdersLoaded(true))
    }
  }, [tabValue, ordersLoaded, selectedCustomer?.id])

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

      <SalesStatsCards stats={stats} />

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={(_, value) => setTabValue(value)}>
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
