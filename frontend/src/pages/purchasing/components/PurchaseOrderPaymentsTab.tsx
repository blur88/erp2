import { Box, Typography } from '@mui/material'

import { DataTable, type Column } from '@/components/common/DataTable'
import { StatusChip } from '@/components/common/StatusChip'
import { useGetPurchaseOrderPaymentsQuery } from '@/store/api/purchasingApi'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface PurchaseOrderPaymentsTabProps {
  orderId: string
  totalAmount: number
}

export default function PurchaseOrderPaymentsTab({ orderId, totalAmount }: PurchaseOrderPaymentsTabProps) {
  const { data: payments = [], isLoading, isError } = useGetPurchaseOrderPaymentsQuery(orderId)

  const totalPaid = payments.reduce((sum, payment) => sum + Number(payment.amount), 0)
  const balance = totalAmount - totalPaid

  const columns: Column<(typeof payments)[number]>[] = [
    { header: 'Payment Date', render: (p) => formatDate(p.paymentDate) },
    { header: 'Payment Method', render: (p) => p.paymentMethodEntity?.name ?? '—' },
    { header: 'Reference Number', render: (p) => p.referenceNumber ?? '—' },
    { header: 'Status', render: (p) => <StatusChip status={p.status} /> },
    {
      header: 'Amount',
      align: 'right',
      render: (p) => (
        <Box
          component="span"
          data-testid={`payment-amount-${p.id}`}
          sx={{ color: Number(p.amount) < 0 ? 'error.main' : 'text.primary' }}
        >
          {formatCurrency(p.amount)}
        </Box>
      ),
    },
  ]

  const footer =
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
      emptyText="No payments recorded for this purchase order."
      isLoading={isLoading}
      isError={isError}
      errorText="Failed to load payments."
      footer={footer}
    />
  )
}
