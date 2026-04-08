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
  Payment as PaymentIcon,
  ShoppingCart as OrdersIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'

import { TABLE_STYLES } from '@/constants/tableStyles'
import api from '@/services/api'
import { useGetCustomerPaymentsQuery } from '@/store/api/salesApi'
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
  const customerId = selectedCustomer?.id ?? ''

  const { data: paymentsData, isLoading: paymentsLoading } = useGetCustomerPaymentsQuery(customerId, {
    skip: !customerId || tabValue !== 2,
  })

  const payments = paymentsData ?? []

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
      api
        .get(`/customers/${selectedCustomer.id}/sales-history`)
        .then((res: any) => setOrders(res.data?.orders ?? res.data ?? []))
        .catch(() => {})
        .finally(() => setOrdersLoaded(true))
    }
  }, [tabValue, ordersLoaded, selectedCustomer?.id])

  useEffect(() => {
    if (tabValue === 1 && !invoicesLoaded && selectedCustomer?.id) {
      api
        .get(`/customers/${selectedCustomer.id}/outstanding-invoices`)
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
          <Tab icon={<PaymentIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Payments" />
        </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0}>
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
                      <Typography
                        variant="body2"
                        sx={{
                          color: order.isFulfilled
                            ? 'success.main'
                            : order.isPaid
                              ? 'primary.main'
                              : 'text.secondary',
                        }}
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
                        <Typography
                          variant="body2"
                          color={invoice.salesOrderId ? 'primary' : 'text.primary'}
                          fontWeight={600}
                        >
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

      <TabPanel value={tabValue} index={2}>
        {paymentsLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : payments.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            No payments found.
          </Typography>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size={TABLE_STYLES.size}>
              <TableHead>
                <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50' } }}>
                  <TableCell>Payment #</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {payment.paymentNumber}
                      </Typography>
                    </TableCell>
                    <TableCell>{formatDate(payment.paymentDate)}</TableCell>
                    <TableCell>{payment.status}</TableCell>
                    <TableCell align="right">{formatCurrency(payment.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </TabPanel>
    </Paper>
  )
}

export default CustomerWorkspaceCard
