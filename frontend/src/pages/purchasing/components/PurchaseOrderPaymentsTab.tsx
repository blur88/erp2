import { Box, Typography } from '@mui/material'

import { DataTable, type Column } from '@/components/common/DataTable'
import { StatusChip } from '@/components/common/StatusChip'
import { useGetPurchaseOrderPaymentsQuery } from '@/store/api/purchasingApi'
import { formatCurrency, formatDate } from '@/utils/formatters'
import { toScaledAmount, fromScaledAmount, sumScaledAmounts } from '@/utils/currency'

interface PurchaseOrderPaymentsTabProps {
  orderId: string
  totalAmount: string
}

export default function PurchaseOrderPaymentsTab({ orderId, totalAmount }: PurchaseOrderPaymentsTabProps) {
  const { data: payments = [], isLoading, isError } = useGetPurchaseOrderPaymentsQuery(orderId)

  const totalPaidMinor = sumScaledAmounts(payments.map((p) => p.amount)) ?? 0n
  const balanceMinor = (toScaledAmount(totalAmount) ?? 0n) - totalPaidMinor

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
          sx={{ color: (toScaledAmount(p.amount) ?? 0n) < 0n ? 'error.main' : 'text.primary' }}
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
            { label: 'Total Paid', value: formatCurrency(fromScaledAmount(totalPaidMinor)) },
            { label: 'Balance', value: formatCurrency(fromScaledAmount(balanceMinor)) },
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
