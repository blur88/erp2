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
import { default as GRNIcon } from '@mui/icons-material/LocalShipping'
import { default as PaymentIcon } from '@mui/icons-material/Payment'
import { default as OrdersIcon } from '@mui/icons-material/ShoppingCart'
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

  const { data: posData, isLoading: posLoading, isError: posError } = useGetSupplierPurchaseOrdersQuery(supplierId, {
    skip: !supplierId || tabValue !== 0,
  })
  const { data: grnsData, isLoading: grnsLoading, isError: grnsError } = useGetSupplierGRNsQuery(supplierId, {
    skip: !supplierId || tabValue !== 1,
  })
  const { data: paymentsData, isLoading: paymentsLoading, isError: paymentsError } = useGetSupplierPaymentsQuery(supplierId, {
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
        <Tabs value={tabValue} onChange={(_, value) => setTabValue(value)} sx={{ minHeight: 36 }}>
          <Tab icon={<OrdersIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Purchase Orders" sx={{ minHeight: 36 }} />
          <Tab icon={<GRNIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="GRNs" sx={{ minHeight: 36 }} />
          <Tab icon={<PaymentIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Payments" sx={{ minHeight: 36 }} />
        </Tabs>
      </Box>
      <TabPanel value={tabValue} index={0}>
        {posLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : posError ? (
          <Typography sx={{ color: 'error.main', py: 4, textAlign: 'center' }}>
            Failed to load purchase orders.
          </Typography>
        ) : purchaseOrders.length === 0 ? (
          <Typography
            sx={{
              color: "text.secondary",
              py: 4,
              textAlign: 'center'
            }}>
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
                    onClick={() => navigate(`/purchasing/orders?highlight=${po.id}`)}
                  >
                    <TableCell>
                      <Typography variant="body2" color="primary" sx={{
                        fontWeight: 600
                      }}>
                        {po.orderNumber}
                      </Typography>
                    </TableCell>
                    <TableCell>{formatDate(po.orderDate)}</TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{
                        color: "text.secondary"
                      }}>
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
        ) : grnsError ? (
          <Typography sx={{ color: 'error.main', py: 4, textAlign: 'center' }}>
            Failed to load GRNs.
          </Typography>
        ) : grns.length === 0 ? (
          <Typography
            sx={{
              color: "text.secondary",
              py: 4,
              textAlign: 'center'
            }}>
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
                      <Typography variant="body2" color="primary" sx={{
                        fontWeight: 600
                      }}>
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
        ) : paymentsError ? (
          <Typography sx={{ color: 'error.main', py: 4, textAlign: 'center' }}>
            Failed to load payments.
          </Typography>
        ) : payments.length === 0 ? (
          <Typography
            sx={{
              color: "text.secondary",
              py: 4,
              textAlign: 'center'
            }}>
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
                  <TableRow
                    key={payment.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/purchasing/vendor-payments?vpId=${payment.id}`)}
                  >
                    <TableCell>
                      <Typography variant="body2" sx={{
                        fontWeight: 600
                      }}>
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
  );
}

export default SupplierWorkspaceCard
