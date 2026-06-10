import React, { useEffect, useState } from 'react'
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  CircularProgress,
} from '@mui/material'
import { ApiService } from '@/services/api'
import { useNotification } from '@/hooks/useNotification'
import { StatusChip } from '@/components/common/StatusChip'
import { formatCurrency } from '@/utils/currency'
import { formatDate as formatDisplayDate } from '@/utils/formatters'
import { TABLE_STYLES } from '@/constants/tableStyles'

interface OrderHistoryTabProps {
  productId: string
}

interface OrderHistoryItem {
  id: string
  type: 'sales_order' | 'purchase_order'
  orderNumber: string
  customerOrVendor: string
  date: Date | string
  paymentStatus?: string
  fulfillmentStatus?: string
  receivedStatus?: string
  quantity: number
  subTotal: number
}

const OrderHistoryTab: React.FC<OrderHistoryTabProps> = ({ productId }) => {
  const { showError } = useNotification()
  const [orders, setOrders] = useState<OrderHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(20)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    const fetchOrderHistory = async () => {
      try {
        setLoading(true)
        const response = await ApiService.get(`/inventory/products/${productId}/order-history`, {
          params: {
            page: page + 1,
            limit: rowsPerPage,
          },
        }) as any

        // Extract data from ApiResponse
        const data = response.data?.data || response.data || []
        const meta = response.data?.meta || response.meta || {}

        setOrders(data)
        setTotal(meta.total || 0)
      } catch (error: any) {
        console.error('Failed to fetch order history:', error)
        showError(error?.message || 'Failed to load order history')
      } finally {
        setLoading(false)
      }
    }

    if (productId) {
      fetchOrderHistory()
    }
  }, [productId, page, rowsPerPage, showError])

  const formatDate = (date: Date | string) => {
    return formatDisplayDate(date)
  }

  const getOrderTypeLabel = (type: string): string => {
    return type === 'sales_order' ? 'Sales Order' : 'Purchase Order'
  }

  const getStatusChip = (order: OrderHistoryItem) => {
    if (order.type === 'sales_order') {
      return (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          <StatusChip status={order.paymentStatus === 'paid' ? 'paid' : order.paymentStatus === 'partial' ? 'partial' : 'unpaid'} sx={{ fontSize: '0.7rem' }} />
          <StatusChip status={order.fulfillmentStatus === 'fulfilled' ? 'fulfilled' : 'unfulfilled'} sx={{ fontSize: '0.7rem' }} />
        </Box>
      )
    } else {
      return (
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          <StatusChip status={order.paymentStatus === 'paid' ? 'paid' : order.paymentStatus === 'partial' ? 'partial' : 'unpaid'} sx={{ fontSize: '0.7rem' }} />
          <StatusChip status={order.receivedStatus === 'received' ? 'received' : 'not_received'} sx={{ fontSize: '0.7rem' }} />
        </Box>
      )
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (orders.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
        <Typography variant="body1" sx={{
          color: "text.secondary"
        }}>
          No order history found for this product
        </Typography>
      </Box>
    );
  }

  return (
    <>
      <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
        <Table
          size={TABLE_STYLES.size}
          stickyHeader
          sx={{
            '& .MuiTableCell-root': {
              py: TABLE_STYLES.cell.padding.py,
              px: TABLE_STYLES.cell.padding.px,
              borderBottom: TABLE_STYLES.cell.border,
            },
          }}
        >
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>
                Type
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }}>
                Order #
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }}>
                Customer/Vendor
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }}>
                Date
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }}>
                Order Status
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">
                Quantity
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">
                Sub-Total
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id} hover>
                <TableCell>
                  <Typography
                    variant="body2"
                    sx={{ fontSize: '0.8rem' }}
                  >
                    {getOrderTypeLabel(order.type)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography
                    variant="body2"
                    sx={{ fontSize: '0.8rem' }}
                  >
                    {order.orderNumber}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography
                    variant="body2"
                    sx={{ fontSize: '0.8rem' }}
                  >
                    {order.customerOrVendor}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography
                    variant="body2"
                    sx={{ fontSize: '0.8rem' }}
                  >
                    {formatDate(order.date)}
                  </Typography>
                </TableCell>
                <TableCell>{getStatusChip(order)}</TableCell>
                <TableCell align="right">
                  <Typography
                    variant="body2"
                    sx={{ fontSize: '0.8rem' }}
                  >
                    {Math.floor(order.quantity)}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography
                    variant="body2"
                    sx={{
                      fontSize: '0.8rem',
                      fontWeight: 600,
                    }}
                  >
                    {formatCurrency(order.subTotal)}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        rowsPerPageOptions={[10, 20, 50]}
        component="div"
        count={total}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={(_, newPage) => setPage(newPage)}
        onRowsPerPageChange={(e) => {
          setRowsPerPage(parseInt(e.target.value, 10))
          setPage(0)
        }}
        size="small"
      />
    </>
  )
}

export default OrderHistoryTab
