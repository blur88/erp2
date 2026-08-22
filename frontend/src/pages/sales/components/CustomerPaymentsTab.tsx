import PagePagination from '@/components/common/PagePagination'
import { StatusChip } from '@/components/common/StatusChip'
import { DataTable, type Column } from '@/components/common/DataTable'
import { usePagination } from '@/hooks/usePagination'
import { useGetPaymentsQuery } from '@/store/api/salesApi'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/formatters'

interface CustomerPaymentsTabProps {
  customerId: string
}

export default function CustomerPaymentsTab({ customerId }: CustomerPaymentsTabProps) {
  const { page, limit, paginationProps } = usePagination()
  const { data, isLoading, isError } = useGetPaymentsQuery({
    customerId,
    page,
    limit,
    sortBy: 'paymentDate',
    sortOrder: 'DESC',
  })
  const payments = data?.data ?? []
  const total = data?.meta?.total ?? 0

  const columns: Column<(typeof payments)[number]>[] = [
    { header: 'Date', width: '20%', render: (p) => formatDate(p.paymentDate) },
    { header: 'Invoice #', width: '20%', render: (p) => p.salesOrder?.orderNumber ?? '—' },
    { header: 'Status', width: '20%', render: (p) => <StatusChip status={p.status} /> },
    { header: 'Method', width: '20%', render: (p) => p.paymentMethodEntity?.name ?? '—' },
    { header: 'Amount', align: 'right', width: '20%', render: (p) => formatCurrency(p.amount) },
  ]

  return (
    <DataTable
      columns={columns}
      rows={payments}
      getRowKey={(p) => p.id}
      emptyText="No payments yet for this customer."
      isLoading={isLoading}
      isError={isError}
      errorText="Failed to load payments."
      paginationSlot={<PagePagination total={total} {...paginationProps} />}
    />
  )
}
