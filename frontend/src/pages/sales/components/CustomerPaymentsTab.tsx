import { Box, CircularProgress, Link, Typography } from '@mui/material'
import { useNavigate } from 'react-router-dom'

import { useGetPaymentsQuery } from '@/store/api/salesApi'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/formatters'

interface CustomerPaymentsTabProps {
  customerId: string
}

function formatPaymentMethod(method?: string | null): string {
  if (!method) return '—'
  return method.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
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
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['Payment #', 'Invoice #', 'Date', 'Amount', 'Method', 'Reference #', ''].map((header) => (
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
          {payments.map((payment) => (
            <tr
              key={payment.id}
              style={{ borderBottom: '1px solid #2D3748' }}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = 'rgba(255,255,255,0.04)'
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = ''
              }}
            >
              <td style={{ padding: '10px 12px', fontSize: '0.875rem' }}>{payment.paymentNumber}</td>
              <td style={{ padding: '10px 12px', fontSize: '0.875rem' }}>
                {payment.invoice?.invoiceNumber ?? '—'}
              </td>
              <td style={{ padding: '10px 12px', fontSize: '0.875rem' }}>{formatDate(payment.paymentDate)}</td>
              <td style={{ padding: '10px 12px', fontSize: '0.875rem' }}>{formatCurrency(payment.amount)}</td>
              <td style={{ padding: '10px 12px', fontSize: '0.875rem' }}>
                {formatPaymentMethod(payment.paymentMethod ?? payment.method)}
              </td>
              <td style={{ padding: '10px 12px', fontSize: '0.875rem' }}>
                {payment.referenceNumber ?? payment.reference ?? '—'}
              </td>
              <td style={{ padding: '10px 12px' }}>
                <Link
                  component="button"
                  variant="body2"
                  onClick={() => navigate('/sales/payments')}
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
