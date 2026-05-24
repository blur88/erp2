import { Box, CircularProgress, Link, Typography } from '@mui/material'
import { useNavigate } from 'react-router-dom'

import { EntityStatusChip } from '@/components/common/EntityStatusChip'
import { useGetSalesOrdersQuery } from '@/store/api/salesApi'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/formatters'

interface CustomerOrdersTabProps {
  customerId: string
}

export default function CustomerOrdersTab({ customerId }: CustomerOrdersTabProps) {
  const navigate = useNavigate()
  const { data, isLoading } = useGetSalesOrdersQuery({ customerId })
  const orders = data?.data ?? []

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (orders.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <Typography variant="body2" color="text.secondary">
          No orders yet for this customer.
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['Order #', 'Date', 'Status', 'Total', ''].map((header) => (
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
          {orders.map((order) => (
            <tr
              key={order.id}
              style={{ borderBottom: '1px solid #2D3748' }}
              onMouseEnter={(event) => {
                event.currentTarget.style.background = 'rgba(255,255,255,0.04)'
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.background = ''
              }}
            >
              <td style={{ padding: '10px 12px', fontSize: '0.875rem' }}>{order.orderNumber}</td>
              <td style={{ padding: '10px 12px', fontSize: '0.875rem' }}>{formatDate(order.orderDate)}</td>
              <td style={{ padding: '10px 12px' }}>
                <EntityStatusChip status={order.isCompleted || order.isFulfilled ? 'completed' : 'pending'} />
              </td>
              <td style={{ padding: '10px 12px', fontSize: '0.875rem' }}>{formatCurrency(order.totalAmount)}</td>
              <td style={{ padding: '10px 12px' }}>
                <Link
                  component="button"
                  variant="body2"
                  onClick={() => navigate('/sales/orders')}
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
