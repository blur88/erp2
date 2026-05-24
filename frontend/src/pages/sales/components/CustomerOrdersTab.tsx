import { Box, CircularProgress, Link, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import { useNavigate } from 'react-router-dom'

import { EntityStatusChip } from '@/components/common/EntityStatusChip'
import { useGetSalesOrdersQuery } from '@/store/api/salesApi'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/formatters'

interface CustomerOrdersTabProps {
  customerId: string
}

const headerSx = {
  fontSize: '11px',
  fontWeight: 600,
  textTransform: 'uppercase' as const,
  color: 'text.secondary',
  borderBottom: 2,
  borderColor: 'divider',
}

export default function CustomerOrdersTab({ customerId }: CustomerOrdersTabProps) {
  const navigate = useNavigate()
  const { data, isLoading } = useGetSalesOrdersQuery({ customerId })
  const orders = data?.data ?? []

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (orders.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <Typography variant="body2" color="text.secondary">
          No orders yet for this customer.
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={headerSx}>Order #</TableCell>
            <TableCell sx={headerSx}>Date</TableCell>
            <TableCell sx={headerSx}>Status</TableCell>
            <TableCell sx={headerSx}>Total</TableCell>
            <TableCell sx={headerSx} />
          </TableRow>
        </TableHead>
        <TableBody>
          {orders.map((order) => (
            <TableRow key={order.id} hover>
              <TableCell>{order.orderNumber}</TableCell>
              <TableCell>{formatDate(order.orderDate)}</TableCell>
              <TableCell>
                <EntityStatusChip status={order.isCompleted || order.isFulfilled ? 'completed' : 'pending'} />
              </TableCell>
              <TableCell>{formatCurrency(order.totalAmount)}</TableCell>
              <TableCell>
                <Link
                  component="button"
                  variant="body2"
                  onClick={() => navigate('/sales/orders')}
                  sx={{ color: 'primary.main', cursor: 'pointer' }}
                >
                  View
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  )
}
