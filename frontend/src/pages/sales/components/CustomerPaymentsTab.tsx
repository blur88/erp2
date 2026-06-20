import PagePagination from '@/components/common/PagePagination'
import { DataTable, type Column, bold } from '@/components/common/DataTable'
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
    sortBy: 'paymentNumber',
    sortOrder: 'ASC',
  })
  const payments = data?.data ?? []
  const total = data?.meta?.total ?? 0

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
      footer={<PagePagination total={total} {...paginationProps} />}
    />
  )
}
