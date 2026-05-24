import { Box, Button, CircularProgress, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import { useNavigate } from 'react-router-dom'

import { EntityStatusChip } from '@/components/common/EntityStatusChip'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { useGetSalesOrdersQuery } from '@/store/api/salesApi'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/formatters'

interface CustomerOrdersTabProps {
  customerId: string
}

export default function CustomerOrdersTab({ customerId }: CustomerOrdersTabProps) {
  const navigate = useNavigate()
  const { data, isLoading } = useGetSalesOrdersQuery({ customerId })
  const orders = data?.data ?? []

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (orders.length === 0) {
    return (
      <Typography sx={{ color: 'text.secondary', py: 4, textAlign: 'center' }}>
        No orders yet for this customer.
      </Typography>
    )
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size={TABLE_STYLES.size}>
        <TableHead>
          <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50' } }}>
            <TableCell sx={{ width: '18%' }}>Order #</TableCell>
            <TableCell sx={{ width: '18%' }}>Date</TableCell>
            <TableCell sx={{ width: '20%' }}>Status</TableCell>
            <TableCell align="right" sx={{ width: '18%' }}>Total</TableCell>
            <TableCell sx={{ width: '26%' }} />
          </TableRow>
        </TableHead>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id} hover>
              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {order.orderNumber}
                </Typography>
              </TableCell>
              <TableCell>{formatDate(order.orderDate)}</TableCell>
              <TableCell>
                <EntityStatusChip status={order.isCompleted || order.isFulfilled ? 'completed' : 'pending'} />
              </TableCell>
              <TableCell align="right">{formatCurrency(order.totalAmount)}</TableCell>
              <TableCell align="right">
                <Button
                  size="small"
                  variant="text"
                  onClick={() => navigate(`/sales/orders/${order.orderNumber}/edit`)}
                >
                  View
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
