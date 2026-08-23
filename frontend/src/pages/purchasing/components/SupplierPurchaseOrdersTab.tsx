import { useNavigate } from 'react-router-dom'

import PagePagination from '@/components/common/PagePagination'
import { StatusChip } from '@/components/common/StatusChip'
import { DataTable, type Column, bold, viewAction } from '@/components/common/DataTable'
import { useListUrlState } from '@/hooks/useListUrlState'
import { useGetSupplierPurchaseOrdersQuery } from '@/store/api/purchasingApi'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/formatters'

interface SupplierPurchaseOrdersTabProps {
  supplierId: string
}

export default function SupplierPurchaseOrdersTab({ supplierId }: SupplierPurchaseOrdersTabProps) {
  const navigate = useNavigate()
  const { page, limit, setPage, setLimit } = useListUrlState({ namespace: 'supOrders' })
  const paginationProps = { page, limit, onPageChange: setPage, onLimitChange: setLimit }
  const { data, isLoading, isError } = useGetSupplierPurchaseOrdersQuery({ supplierId, page, limit })
  const orders = data?.data ?? []
  const total = data?.meta?.total ?? 0

  const columns: Column<(typeof orders)[number]>[] = [
    { header: 'PO #', width: '20%', render: (o) => bold(o.orderNumber) },
    { header: 'Date', width: '20%', render: (o) => formatDate(o.orderDate) },
    { header: 'Status', width: '20%', render: (o) => <StatusChip status={o.status} /> },
    {
      header: 'Total',
      align: 'right',
      width: '20%',
      render: (o) => formatCurrency(o.totalAmount ?? o.total ?? 0),
    },
    {
      header: 'Action',
      align: 'right',
      width: '20%',
      render: (o) => viewAction(() => navigate(`/purchasing/orders/${o.orderNumber}/view`)),
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={orders}
      getRowKey={(o) => o.id}
      emptyText="No purchase orders yet for this supplier."
      isLoading={isLoading}
      isError={isError}
      errorText="Failed to load purchase orders."
      paginationSlot={<PagePagination total={total} {...paginationProps} />}
    />
  )
}
