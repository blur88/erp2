import { Box, CircularProgress, Link, Typography } from '@mui/material'
import { useNavigate } from 'react-router-dom'

import { EntityStatusChip } from '@/components/common/EntityStatusChip'
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
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['Invoice #', 'Order #', 'Date', 'Amount', 'Outstanding', 'Status', ''].map((header) => (
              <th
                key={header}
                style={{
                  textAlign: 'left',
                  padding: '8px 12px',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  color: '#8B95A6',
                  borderBottom: '2px solid #2D3748',
                }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr
              key={invoice.id}
              style={{ borderBottom: '1px solid #2D3748' }}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = 'rgba(255,255,255,0.04)'
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = ''
              }}
            >
              <td style={{ padding: '10px 12px', fontSize: '0.875rem' }}>{invoice.invoiceNumber}</td>
              <td style={{ padding: '10px 12px', fontSize: '0.875rem' }}>
                {invoice.salesOrder?.orderNumber ?? '—'}
              </td>
              <td style={{ padding: '10px 12px', fontSize: '0.875rem' }}>{formatDate(invoice.issueDate)}</td>
              <td style={{ padding: '10px 12px', fontSize: '0.875rem' }}>{formatCurrency(invoice.total)}</td>
              <td style={{ padding: '10px 12px', fontSize: '0.875rem' }}>{formatCurrency(invoice.dueAmount)}</td>
              <td style={{ padding: '10px 12px' }}>
                <EntityStatusChip status={invoice.status} />
              </td>
              <td style={{ padding: '10px 12px' }}>
                <Link
                  component="button"
                  variant="body2"
                  onClick={() => navigate('/sales/invoices')}
                  sx={{ color: '#3B82F6', cursor: 'pointer' }}
                >
                  View
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Box>
  )
}
