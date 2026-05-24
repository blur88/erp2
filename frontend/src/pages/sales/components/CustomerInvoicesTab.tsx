import { Box, CircularProgress, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
import { useNavigate } from 'react-router-dom'

import { EntityStatusChip } from '@/components/common/EntityStatusChip'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { useGetInvoicesQuery } from '@/store/api/salesApi'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/formatters'

interface CustomerInvoicesTabProps {
  customerId: string
}

export default function CustomerInvoicesTab({ customerId }: CustomerInvoicesTabProps) {
  const navigate = useNavigate()
  const { data, isLoading } = useGetInvoicesQuery({ customerId })
  const invoices = data?.data ?? []

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (invoices.length === 0) {
    return (
      <Typography sx={{ color: 'text.secondary', py: 4, textAlign: 'center' }}>
        No invoices yet for this customer.
      </Typography>
    )
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size={TABLE_STYLES.size}>
        <TableHead>
          <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50' } }}>
            <TableCell>Invoice #</TableCell>
            <TableCell>Order #</TableCell>
            <TableCell>Date</TableCell>
            <TableCell align="right">Amount</TableCell>
            <TableCell align="right">Outstanding</TableCell>
            <TableCell>Status</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {invoices.map((invoice) => (
            <TableRow
              key={invoice.id}
              hover
              sx={{ cursor: 'pointer' }}
              onClick={() => navigate('/sales/invoices')}
            >
              <TableCell>
                <Typography variant="body2" color="primary" sx={{ fontWeight: 600 }}>
                  {invoice.invoiceNumber}
                </Typography>
              </TableCell>
              <TableCell>{invoice.salesOrder?.orderNumber ?? '—'}</TableCell>
              <TableCell>{formatDate(invoice.issueDate)}</TableCell>
              <TableCell align="right">{formatCurrency(invoice.total)}</TableCell>
              <TableCell align="right">
                <Typography sx={{ fontWeight: 600, color: invoice.dueAmount > 0 ? 'error.main' : 'text.primary' }}>
                  {formatCurrency(invoice.dueAmount)}
                </Typography>
              </TableCell>
              <TableCell>
                <EntityStatusChip status={invoice.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
