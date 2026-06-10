import {
  Box,
  Button,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { useNavigate } from 'react-router-dom'

import { TABLE_STYLES } from '@/constants/tableStyles'
import { useGetSupplierPurchaseOrdersQuery } from '@/store/api/purchasingApi'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/formatters'

import { StatusChip } from '@/components/common/StatusChip'

interface SupplierPurchaseOrdersTabProps {
  supplierId: string
}

export default function SupplierPurchaseOrdersTab({ supplierId }: SupplierPurchaseOrdersTabProps) {
  const navigate = useNavigate()
  const { data, isLoading } = useGetSupplierPurchaseOrdersQuery(supplierId)
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
        No purchase orders yet for this supplier.
      </Typography>
    )
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size={TABLE_STYLES.size}>
        <TableHead>
          <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50' } }}>
            <TableCell sx={{ width: '20%' }}>PO #</TableCell>
            <TableCell sx={{ width: '20%' }}>Date</TableCell>
            <TableCell sx={{ width: '20%' }}>Status</TableCell>
            <TableCell align="right" sx={{ width: '20%' }}>Total</TableCell>
            <TableCell align="right" sx={{ width: '20%' }}>Action</TableCell>
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
                <StatusChip status={order.status} />
              </TableCell>
              <TableCell align="right">{formatCurrency(order.totalAmount ?? order.total ?? 0)}</TableCell>
              <TableCell align="right">
                <Button
                  size="small"
                  variant="text"
                  onClick={() => navigate(`/purchasing/orders/${order.orderNumber}/view`)}
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
