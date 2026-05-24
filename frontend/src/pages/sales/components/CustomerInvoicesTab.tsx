import { Box, Button, CircularProgress, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material'
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
            <TableCell sx={{ width: '14%' }}>Invoice #</TableCell>
            <TableCell sx={{ width: '14%' }}>Order #</TableCell>
            <TableCell sx={{ width: '12%' }}>Date</TableCell>
            <TableCell align="right" sx={{ width: '13%' }}>Amount</TableCell>
            <TableCell align="right" sx={{ width: '13%' }}>Balance Due</TableCell>
            <TableCell sx={{ width: '14%' }}>Status</TableCell>
            <TableCell sx={{ width: '20%' }}>Action</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {invoices.map((invoice) => (
            <TableRow key={invoice.id} hover>
              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {invoice.invoiceNumber}
                </Typography>
              </TableCell>
              <TableCell>{invoice.salesOrder?.orderNumber ?? '—'}</TableCell>
              <TableCell>{formatDate(invoice.invoiceDate)}</TableCell>
              <TableCell align="right">{formatCurrency(invoice.totalAmount)}</TableCell>
              <TableCell align="right">
                <Typography sx={{ fontWeight: 600, color: invoice.balanceDue > 0 ? 'error.main' : 'text.primary' }}>
                  {formatCurrency(invoice.balanceDue)}
                </Typography>
              </TableCell>
              <TableCell>
                <EntityStatusChip status={invoice.status} />
              </TableCell>
              <TableCell align="right">
                <Button
                  size="small"
                  variant="text"
                  onClick={() => navigate('/sales/invoices', { state: { highlightInvoiceId: invoice.id } })}
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
