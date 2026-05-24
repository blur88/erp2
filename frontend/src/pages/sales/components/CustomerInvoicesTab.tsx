import { Box, CircularProgress, Link, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material'
import { useNavigate } from 'react-router-dom'

import { EntityStatusChip } from '@/components/common/EntityStatusChip'
import { useGetInvoicesQuery } from '@/store/api/salesApi'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/formatters'

interface CustomerInvoicesTabProps {
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

export default function CustomerInvoicesTab({ customerId }: CustomerInvoicesTabProps) {
  const navigate = useNavigate()
  const { data, isLoading } = useGetInvoicesQuery({ customerId })
  const invoices = data?.data ?? []

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (invoices.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <Typography variant="body2" color="text.secondary">
          No invoices yet for this customer.
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={headerSx}>Invoice #</TableCell>
            <TableCell sx={headerSx}>Order #</TableCell>
            <TableCell sx={headerSx}>Date</TableCell>
            <TableCell sx={headerSx}>Amount</TableCell>
            <TableCell sx={headerSx}>Outstanding</TableCell>
            <TableCell sx={headerSx}>Status</TableCell>
            <TableCell sx={headerSx} />
          </TableRow>
        </TableHead>
        <TableBody>
          {invoices.map((invoice) => (
            <TableRow key={invoice.id} hover>
              <TableCell>{invoice.invoiceNumber}</TableCell>
              <TableCell>{invoice.salesOrder?.orderNumber ?? '—'}</TableCell>
              <TableCell>{formatDate(invoice.issueDate)}</TableCell>
              <TableCell>{formatCurrency(invoice.total)}</TableCell>
              <TableCell>{formatCurrency(invoice.dueAmount)}</TableCell>
              <TableCell>
                <EntityStatusChip status={invoice.status} />
              </TableCell>
              <TableCell>
                <Link
                  component="button"
                  variant="body2"
                  onClick={() => navigate('/sales/invoices')}
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
