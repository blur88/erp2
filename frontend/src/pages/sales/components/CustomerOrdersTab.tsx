import { useNavigate } from 'react-router-dom'

import PagePagination from '@/components/common/PagePagination'
import { StatusChip } from '@/components/common/StatusChip'
import { DataTable, type Column, bold, viewAction } from '@/components/common/DataTable'
import { useListUrlState } from '@/hooks/useListUrlState'
import { useGetSalesOrdersQuery } from '@/store/api/salesApi'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/formatters'

interface CustomerOrdersTabProps {
  customerId: string
}

export default function CustomerOrdersTab({ customerId }: CustomerOrdersTabProps) {
  const navigate = useNavigate()
  const { page, limit, setPage, setLimit } = useListUrlState({ namespace: 'custOrders' })
  const paginationProps = { page, limit, onPageChange: setPage, onLimitChange: setLimit }
  const { data, isLoading, isError } = useGetSalesOrdersQuery({ customerId, page, limit })
  const orders = data?.data ?? []
  const total = data?.meta?.total ?? 0

  const columns: Column<(typeof orders)[number]>[] = [
    { header: 'Order #', width: '18%', render: (o) => bold(o.orderNumber) },
    { header: 'Date', width: '18%', render: (o) => formatDate(o.orderDate) },
    {
      header: 'Status',
      width: '20%',
      render: (o) => <StatusChip status={o.isCompleted || o.isFulfilled ? 'completed' : 'pending'} />,
    },
    { header: 'Total', align: 'right', width: '18%', render: (o) => formatCurrency(o.totalAmount) },
    {
      header: 'Action',
      align: 'right',
      width: '26%',
      render: (o) => viewAction(() => navigate(`/sales/orders/${o.orderNumber}/view`)),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={orders}
      getRowKey={(o) => o.id}
      emptyText="No orders yet for this customer."
      isLoading={isLoading}
      isError={isError}
      errorText="Failed to load orders."
      paginationSlot={<PagePagination total={total} {...paginationProps} />}
    />
  )
}
