import {
  Box,
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

import { TABLE_STYLES } from '@/constants/tableStyles'
import { useGetSalesOrderPaymentsQuery } from '@/store/api/salesApi'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface OrderPaymentsTabProps {
  orderId: string
  totalAmount: number
}

export default function OrderPaymentsTab({ orderId, totalAmount }: OrderPaymentsTabProps) {
  const { data: payments = [], isLoading } = useGetSalesOrderPaymentsQuery(orderId)

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
        No payments recorded for this sales order.
      </Typography>
    )
  }

  const totalPaid = payments.reduce((sum, payment) => sum + Number(payment.amount), 0)
  const balance = totalAmount - totalPaid

  return (
    <Box>
      <TableContainer component={Paper} variant="outlined">
        <Table size={TABLE_STYLES.size}>
          <TableHead>
            <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600 } }}>
              <TableCell>Payment Date</TableCell>
              <TableCell>Payment Method</TableCell>
              <TableCell>Reference Number</TableCell>
              <TableCell align="right">Amount</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {payments.map((payment) => (
              <TableRow key={payment.id} hover>
                <TableCell>{formatDate(payment.paymentDate)}</TableCell>
                <TableCell>{payment.paymentMethod?.name ?? '—'}</TableCell>
                <TableCell>{payment.referenceNumber ?? '—'}</TableCell>
                <TableCell
                  align="right"
                  data-testid={`payment-amount-${payment.id}`}
                  sx={{ color: Number(payment.amount) < 0 ? 'error.main' : 'text.primary' }}
                >
                  {formatCurrency(payment.amount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
        <Box sx={{ minWidth: 240 }}>
          {[
            { label: 'Total Paid', value: formatCurrency(totalPaid), bold: true },
            { label: 'Balance', value: formatCurrency(balance), bold: true },
          ].map(({ label, value, bold }) => (
            <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="body2" sx={{ fontWeight: bold ? 600 : 400 }}>
                {label}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: bold ? 600 : 400 }}>
                {value}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  )
}
