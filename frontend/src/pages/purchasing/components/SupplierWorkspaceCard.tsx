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
  LocalShipping as GRNIcon,
  Payment as PaymentIcon,
  ShoppingCart as OrdersIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'

import { TABLE_STYLES } from '@/constants/tableStyles'
import {
  useGetSupplierGRNsQuery,
  useGetSupplierPaymentsQuery,
  useGetSupplierPurchaseOrdersQuery,
} from '@/store/api/purchasingApi'
import type { Supplier } from '@/types'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/formatters'

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

interface SupplierWorkspaceCardProps {
  selectedSupplier: Supplier | null
}

const SupplierWorkspaceCard: React.FC<SupplierWorkspaceCardProps> = ({ selectedSupplier }) => {
  const navigate = useNavigate()
  const [tabValue, setTabValue] = useState(0)

  const supplierId = selectedSupplier?.id ?? ''

  useEffect(() => {
    setTabValue(0)
  }, [supplierId])

  const { data: posData, isLoading: posLoading } = useGetSupplierPurchaseOrdersQuery(supplierId, {
    skip: !supplierId || tabValue !== 0,
  })
  const { data: grnsData, isLoading: grnsLoading } = useGetSupplierGRNsQuery(supplierId, {
    skip: !supplierId || tabValue !== 1,
  })
  const { data: paymentsData, isLoading: paymentsLoading } = useGetSupplierPaymentsQuery(supplierId, {
    skip: !supplierId || tabValue !== 2,
  })

  const purchaseOrders = posData?.data ?? []
  const grns = grnsData?.data ?? []
  const payments = paymentsData?.data ?? []

  if (!selectedSupplier) {
    return <Paper sx={{ flex: 1 }} />
  }

  return (
    <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tabValue} onChange={(_, value) => setTabValue(value)}>
          <Tab icon={<OrdersIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Purchase Orders" />
          <Tab icon={<GRNIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="GRNs" />
          <Tab icon={<PaymentIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Payments" />
        </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0}>
        {posLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : purchaseOrders.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            No purchase orders found.
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
                {purchaseOrders.map((po) => (
                  <TableRow
                    key={po.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/purchasing/orders/${po.id}/edit`)}
                  >
                    <TableCell>
                      <Typography variant="body2" color="primary" fontWeight={600}>
                        {po.orderNumber}
                      </Typography>
                    </TableCell>
                    <TableCell>{formatDate(po.orderDate)}</TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {po.receivedDate ? 'Received' : po.paidAmount ? 'Paid' : 'Pending'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{formatCurrency(po.total ?? po.totalAmount ?? 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        {grnsLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : grns.length === 0 ? (
          <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
            No GRNs found.
          </Typography>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size={TABLE_STYLES.size}>
              <TableHead>
                <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50' } }}>
                  <TableCell>GRN #</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>PO #</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {grns.map((grn) => (
                  <TableRow
                    key={grn.id}
                    hover
                    sx={{ cursor: grn.purchaseOrder?.id ? 'pointer' : 'default' }}
                    onClick={() => grn.purchaseOrder?.id && navigate(`/purchasing/orders/${grn.purchaseOrder.id}/edit`)}
                  >
                    <TableCell>
                      <Typography variant="body2" color="primary" fontWeight={600}>
                        {grn.grnNumber}
                      </Typography>
                    </TableCell>
                    <TableCell>{formatDate(grn.receivedDate)}</TableCell>
                    <TableCell>{grn.purchaseOrder?.orderNumber ?? '—'}</TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{ color: grn.status === 'received' ? 'success.main' : 'text.secondary' }}
                      >
                        {grn.status === 'received' ? 'Received' : 'Draft'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
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

export default SupplierWorkspaceCard
