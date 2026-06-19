import { DataTable, type Column, bold } from '@/components/common/DataTable'
import { useGetPaymentsQuery } from '@/store/api/salesApi'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/formatters'

interface CustomerPaymentsTabProps {
  customerId: string
}

export default function CustomerPaymentsTab({ customerId }: CustomerPaymentsTabProps) {
  const { data, isLoading } = useGetPaymentsQuery({ customerId })
  const payments = [...(data?.data ?? [])].sort((a, b) =>
    (a.paymentNumber ?? '').localeCompare(b.paymentNumber ?? '', undefined, { numeric: true }),
  )

  const columns: Column<(typeof payments)[number]>[] = [
    { header: 'Payment #', width: '20%', render: (p) => bold(p.paymentNumber) },
    { header: 'Invoice #', width: '20%', render: (p) => p.salesOrderId ?? '—' },
    { header: 'Date', width: '18%', render: (p) => formatDate(p.paymentDate) },
    { header: 'Method', width: '20%', render: (p) => p.paymentMethodEntity?.name ?? '—' },
    { header: 'Amount', align: 'right', width: '22%', render: (p) => formatCurrency(p.amount) },
  ]

  return (
    <DataTable
      columns={columns}
      rows={payments}
      getRowKey={(p) => p.id}
      emptyText="No payments yet for this customer."
      isLoading={isLoading}
    />
  )
}
