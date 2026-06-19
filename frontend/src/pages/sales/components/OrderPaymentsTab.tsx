import { Box, Typography } from '@mui/material'

import { DataTable, type Column } from '@/components/common/DataTable'
import { useGetSalesOrderPaymentsQuery } from '@/store/api/salesApi'
import type { SalesOrderPayment } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface OrderPaymentsTabProps {
  orderId: string
  totalAmount: number
}

export default function OrderPaymentsTab({ orderId, totalAmount }: OrderPaymentsTabProps) {
  const { data: payments = [], isLoading, isError } = useGetSalesOrderPaymentsQuery(orderId)

  const totalPaid = payments.reduce((sum, payment) => sum + Number(payment.amount), 0)
  const balance = totalAmount - totalPaid

  const columns: Column<SalesOrderPayment>[] = [
    { header: 'Payment Date', width: '22%', render: (p) => formatDate(p.paymentDate) },
    { header: 'Payment Method', width: '28%', render: (p) => p.paymentMethod?.name ?? '—' },
    { header: 'Reference Number', width: '28%', render: (p) => p.referenceNumber ?? '—' },
    {
      header: 'Amount',
      align: 'right',
      width: '22%',
      render: (p) => (
        <Typography
          variant="body2"
          component="span"
          data-testid={`payment-amount-${p.id}`}
          sx={{ color: Number(p.amount) < 0 ? 'error.main' : 'text.primary' }}
        >
          {formatCurrency(p.amount)}
        </Typography>
      ),
    },
  ]

  const summary =
    payments.length > 0 ? (
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
        <Box sx={{ minWidth: 240 }}>
          {[
            { label: 'Total Paid', value: formatCurrency(totalPaid) },
            { label: 'Balance', value: formatCurrency(balance) },
          ].map(({ label, value }) => (
            <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {label}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {value}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
    ) : undefined

  return (
    <DataTable
      columns={columns}
      rows={payments}
      getRowKey={(p) => p.id}
      emptyText="No payments recorded for this sales order."
      isLoading={isLoading}
      isError={isError}
      errorText="Failed to load payments."
      footer={summary}
    />
  )
}
