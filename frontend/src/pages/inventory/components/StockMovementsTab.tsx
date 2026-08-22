import { useNavigate } from 'react-router-dom'

import PagePagination from '@/components/common/PagePagination'
import { DataTable, type Column, bold, viewAction } from '@/components/common/DataTable'
import { usePagination } from '@/hooks/usePagination'
import { useLazyGetPurchaseOrderQuery } from '@/store/api/purchasingApi'
import { useLazyGetSalesOrderQuery } from '@/store/api/salesApi'
import { useGetStockMovementsQuery } from '@/store/api/inventoryApi'
import type { StockMovement } from '@/types'
import { formatDate, formatNumber } from '@/utils/formatters'

import { getMovementLabel, getMovementNavTarget, getReferenceLabel } from '../utils/stockMovementDisplay'

export default function StockMovementsTab({ productId }: { productId: string }) {
  const navigate = useNavigate()
  const { page, limit, paginationProps } = usePagination()

  const { data, isLoading, isError } = useGetStockMovementsQuery({
    productId,
    page,
    limit,
  })
  const movements = data?.data ?? []
  const total = data?.meta?.total ?? 0

  const [fetchSalesOrder] = useLazyGetSalesOrderQuery()
  const [fetchPurchaseOrder] = useLazyGetPurchaseOrderQuery()

  const handleView = async (movement: StockMovement) => {
    const target = getMovementNavTarget(movement.referenceType)
    if (!target || !movement.referenceId) return
    try {
      if (target === 'sales_order') {
        const order = await fetchSalesOrder(movement.referenceId).unwrap()
        navigate(`/sales/orders/${order.orderNumber}/view`)
      } else {
        const order = await fetchPurchaseOrder(movement.referenceId).unwrap()
        navigate(`/purchasing/orders/${order.orderNumber}/view`)
      }
    } catch {
      // lookup failed — stay on the tab
    }
  }

  const columns: Column<StockMovement>[] = [
    { header: 'Date', width: '14%', render: (m) => formatDate(m.movementDate) },
    { header: 'Type', width: '16%', render: (m) => getMovementLabel(m.movementType) },
    { header: 'Reference', width: '16%', render: (m) => bold(m.referenceNumber ?? getReferenceLabel(m.referenceType)) },
    {
      header: 'Qty Change',
      align: 'right',
      width: '12%',
      render: (m) => `${m.isInward ? '+' : '-'}${formatNumber(m.quantity)}`,
    },
    { header: 'Balance', align: 'right', width: '12%', render: (m) => formatNumber(m.newBalance) },
    { header: 'Notes', width: '20%', render: (m) => m.notes ?? '—' },
    {
      header: 'Action',
      align: 'right',
      width: '10%',
      render: (m) => {
        const navigable = getMovementNavTarget(m.referenceType) != null && m.referenceId != null
        return viewAction(() => void handleView(m), !navigable)
      },
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={movements}
      getRowKey={(m) => m.id}
      emptyText="No stock movements recorded for this product"
      isLoading={isLoading}
      isError={isError}
      errorText="Failed to load stock movements."
      sticky
      footer={
        <PagePagination total={total} {...paginationProps} />
      }
    />
  )
}
