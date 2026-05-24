import { Box, CircularProgress, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import { useNavigate } from 'react-router-dom'

import { TABLE_STYLES } from '@/constants/tableStyles'
import { useGetPaymentsQuery } from '@/store/api/salesApi'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/formatters'

interface CustomerPaymentsTabProps {
  customerId: string
}

export default function CustomerPaymentsTab({ customerId }: CustomerPaymentsTabProps) {
  const navigate = useNavigate()
  const { data, isLoading } = useGetPaymentsQuery({ customerId })
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
        No payments yet for this customer.
      </Typography>
    )
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size={TABLE_STYLES.size}>
        <TableHead>
          <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50' } }}>
            <TableCell>Payment #</TableCell>
            <TableCell>Invoice #</TableCell>
            <TableCell>Date</TableCell>
            <TableCell>Method</TableCell>
            <TableCell align="right">Amount</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {payments.map((payment) => (
            <TableRow
              key={payment.id}
              hover
              sx={{ cursor: 'pointer' }}
              onClick={() => navigate('/sales/payments')}
            >
              <TableCell>
                <Typography variant="body2" color="primary" sx={{ fontWeight: 600 }}>
                  {payment.paymentNumber}
                </Typography>
              </TableCell>
              <TableCell>{payment.invoice?.invoiceNumber ?? '—'}</TableCell>
              <TableCell>{formatDate(payment.paymentDate)}</TableCell>
              <TableCell>{payment.paymentMethodEntity?.name ?? '—'}</TableCell>
              <TableCell align="right">{formatCurrency(payment.amount)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
