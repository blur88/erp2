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
import { useGetSupplierPaymentsQuery } from '@/store/api/purchasingApi'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/formatters'

interface SupplierPaymentsTabProps {
  supplierId: string
}

export default function SupplierPaymentsTab({ supplierId }: SupplierPaymentsTabProps) {
  const navigate = useNavigate()
  const { data, isLoading } = useGetSupplierPaymentsQuery(supplierId)
  const payments = data?.data ?? []

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (payments.length === 0) {
    return (
      <Typography sx={{ color: 'text.secondary', py: 4, textAlign: 'center' }}>
        No payments yet for this supplier.
      </Typography>
    )
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size={TABLE_STYLES.size}>
        <TableHead>
          <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50' } }}>
            <TableCell sx={{ width: '18%' }}>Payment #</TableCell>
            <TableCell sx={{ width: '16%' }}>Date</TableCell>
            <TableCell sx={{ width: '18%' }}>Method</TableCell>
            <TableCell sx={{ width: '18%' }}>Reference #</TableCell>
            <TableCell align="right" sx={{ width: '15%' }}>Amount</TableCell>
            <TableCell align="right" sx={{ width: '15%' }}>Action</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {payments.map((payment) => (
            <TableRow key={payment.id} hover>
              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {payment.paymentNumber}
                </Typography>
              </TableCell>
              <TableCell>{formatDate(payment.paymentDate)}</TableCell>
              <TableCell>{payment.paymentMethodEntity?.name ?? '-'}</TableCell>
              <TableCell>{payment.referenceNumber ?? '-'}</TableCell>
              <TableCell align="right">{formatCurrency(payment.amount)}</TableCell>
              <TableCell align="right">
                <Button
                  size="small"
                  variant="text"
                  onClick={() => navigate(`/purchasing/vendor-payments?vpId=${payment.id}`)}
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
