import PagePagination from '@/components/common/PagePagination'
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
  const { data, isLoading } = useGetPaymentsQuery({
    customerId,
    page,
    limit,
    sortBy: 'paymentDate',
    sortOrder: 'DESC',
  })
  const payments = data?.data ?? []
  const total = data?.meta?.total ?? 0

  const columns: Column<(typeof payments)[number]>[] = [
    { header: 'Date', width: '25%', render: (p) => formatDate(p.paymentDate) },
    { header: 'Invoice #', width: '25%', render: (p) => p.salesOrder?.orderNumber ?? '—' },
    { header: 'Method', width: '25%', render: (p) => p.paymentMethodEntity?.name ?? '—' },
    { header: 'Amount', align: 'right', width: '25%', render: (p) => formatCurrency(p.amount) },
  ]

  return (
    <DataTable
      columns={columns}
      rows={payments}
      getRowKey={(p) => p.id}
      emptyText="No payments yet for this customer."
      isLoading={isLoading}
      paginationSlot={<PagePagination total={total} {...paginationProps} />}
    />
  )
}
