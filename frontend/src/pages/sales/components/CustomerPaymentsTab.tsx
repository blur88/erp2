import { Box, CircularProgress, Link, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import { useNavigate } from 'react-router-dom'

import { useGetPaymentsQuery } from '@/store/api/salesApi'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/formatters'

interface CustomerPaymentsTabProps {
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

export default function CustomerPaymentsTab({ customerId }: CustomerPaymentsTabProps) {
  const navigate = useNavigate()
  const { data, isLoading } = useGetPaymentsQuery({ customerId })
  const payments = data?.data ?? []

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (payments.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <Typography variant="body2" color="text.secondary">
          No payments yet for this customer.
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={headerSx}>Payment #</TableCell>
            <TableCell sx={headerSx}>Invoice #</TableCell>
            <TableCell sx={headerSx}>Date</TableCell>
            <TableCell sx={headerSx}>Amount</TableCell>
            <TableCell sx={headerSx}>Method</TableCell>
            <TableCell sx={headerSx} />
          </TableRow>
        </TableHead>
        <TableBody>
          {payments.map((payment) => (
            <TableRow key={payment.id} hover>
              <TableCell>{payment.paymentNumber}</TableCell>
              <TableCell>{payment.invoice?.invoiceNumber ?? '—'}</TableCell>
              <TableCell>{formatDate(payment.paymentDate)}</TableCell>
              <TableCell>{formatCurrency(payment.amount)}</TableCell>
              <TableCell>{payment.paymentMethodEntity?.name ?? '—'}</TableCell>
              <TableCell>
                <Link
                  component="button"
                  variant="body2"
                  onClick={() => navigate('/sales/payments')}
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
