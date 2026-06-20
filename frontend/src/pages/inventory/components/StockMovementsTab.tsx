import { useState } from 'react'
import { TablePagination } from '@mui/material'
import { useNavigate } from 'react-router-dom'

import { DataTable, type Column, bold, viewAction } from '@/components/common/DataTable'
import { useLazyGetPurchaseOrderQuery } from '@/store/api/purchasingApi'
import { useLazyGetSalesOrderQuery } from '@/store/api/salesApi'
import { useGetStockMovementsQuery } from '@/store/api/inventoryApi'
import type { StockMovement } from '@/types'
import { formatDate, formatNumber } from '@/utils/formatters'
import { PAGINATION } from '@/constants/tableStyles'

import { getMovementLabel, getMovementNavTarget, getReferenceLabel } from '../utils/stockMovementDisplay'

export default function StockMovementsTab({ productId }: { productId: string }) {
  const navigate = useNavigate()
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState<number>(PAGINATION.defaultPageSize)

  const { data, isLoading } = useGetStockMovementsQuery({
    productId,
    page: page + 1,
    limit: rowsPerPage,
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
      sticky
      footer={
        <TablePagination
          rowsPerPageOptions={PAGINATION.options}
          component="div"
          count={total}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10))
            setPage(0)
          }}
          size="small"
        />
      }
    />
  )
}
