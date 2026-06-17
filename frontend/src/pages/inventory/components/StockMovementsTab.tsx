import { useState } from 'react'
import {
  Box,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from '@mui/material'
import { useNavigate } from 'react-router-dom'

import { TABLE_STYLES } from '@/constants/tableStyles'
import { useLazyGetPurchaseOrderQuery } from '@/store/api/purchasingApi'
import { useLazyGetSalesOrderQuery } from '@/store/api/salesApi'
import { useGetStockMovementsQuery } from '@/store/api/inventoryApi'
import type { StockMovement } from '@/types'
import { formatDate, formatNumber } from '@/utils/formatters'

import { getMovementLabel, getMovementNavTarget, getReferenceLabel } from '../utils/stockMovementDisplay'

export default function StockMovementsTab({ productId }: { productId: string }) {
  const navigate = useNavigate()
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(25)

  const { data, isLoading } = useGetStockMovementsQuery({
    productId,
    page: page + 1,
    limit: rowsPerPage,
  })
  const movements = data?.data ?? []
  const total = data?.meta?.total ?? 0

  const [fetchSalesOrder] = useLazyGetSalesOrderQuery()
  const [fetchPurchaseOrder] = useLazyGetPurchaseOrderQuery()

  const handleRowClick = async (movement: StockMovement) => {
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

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (movements.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <Typography variant="body1" sx={{ color: 'text.secondary' }}>
          No stock movements recorded for this product
        </Typography>
      </Box>
    )
  }

  return (
    <>
      <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
        <Table size={TABLE_STYLES.size} stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, width: '14%' }}>Date</TableCell>
              <TableCell sx={{ fontWeight: 600, width: '16%' }}>Type</TableCell>
              <TableCell sx={{ fontWeight: 600, width: '16%' }}>Reference</TableCell>
              <TableCell sx={{ fontWeight: 600, width: '12%' }} align="right">Qty Change</TableCell>
              <TableCell sx={{ fontWeight: 600, width: '12%' }} align="right">Balance</TableCell>
              <TableCell sx={{ fontWeight: 600, width: '30%' }}>Notes</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {movements.map((movement) => {
              const navigable = getMovementNavTarget(movement.referenceType) != null
              const qtySign = movement.isInward ? '+' : '-'
              return (
                <TableRow
                  key={movement.id}
                  hover={navigable}
                  sx={{ cursor: navigable ? 'pointer' : 'default' }}
                  onClick={navigable ? () => void handleRowClick(movement) : undefined}
                >
                  <TableCell>{formatDate(movement.movementDate)}</TableCell>
                  <TableCell>{getMovementLabel(movement.movementType)}</TableCell>
                  <TableCell>{getReferenceLabel(movement.referenceType)}</TableCell>
                  <TableCell align="right">{qtySign}{formatNumber(movement.quantity)}</TableCell>
                  <TableCell align="right">{formatNumber(movement.newBalance)}</TableCell>
                  <TableCell>{movement.notes ?? '—'}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        rowsPerPageOptions={[10, 25, 50]}
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
    </>
  )
}
