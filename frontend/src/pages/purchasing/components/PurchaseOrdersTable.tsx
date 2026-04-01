import React, { memo } from 'react'
import {
  Box,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { PurchaseOrder } from '@/types'

interface OrderRowProps {
  order: PurchaseOrder
  index: number
  selectedOrderId?: string
  focusedOrderIndex: number
  onOrderSelect: (order: PurchaseOrder) => void
}

const OrderRow = memo(({ order, index, selectedOrderId, focusedOrderIndex, onOrderSelect }: OrderRowProps) => {
  const isSelected = selectedOrderId === order.id
  const isFocused = index === focusedOrderIndex

  return (
    <TableRow
      hover
      onClick={() => onOrderSelect(order)}
      data-order-index={index}
      sx={{
        cursor: 'pointer',
        backgroundColor: isSelected ? 'action.selected' : isFocused ? 'action.focus' : 'inherit',
        '&:hover': { backgroundColor: isSelected ? 'action.selected' : 'action.hover' },
        transition: 'background-color 0.2s ease',
        height: TABLE_STYLES.row.height,
        ...(isFocused && {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: '-2px',
        }),
      }}
    >
      <TableCell>
        <Typography variant="body2" sx={{ fontWeight: 400, fontSize: '0.8rem', lineHeight: 1.2 }}>
          {order.orderNumber}
        </Typography>
      </TableCell>
    </TableRow>
  )
})

OrderRow.displayName = 'OrderRow'

interface PurchaseOrdersTableProps {
  purchaseOrders: PurchaseOrder[]
  loading: boolean
  total: number
  selectedOrderId?: string
  focusedOrderIndex: number
  onOrderSelect: (order: PurchaseOrder) => void
  orderListRef: React.RefObject<HTMLDivElement | null>
}

const PurchaseOrdersTable: React.FC<PurchaseOrdersTableProps> = ({
  purchaseOrders,
  loading,
  total,
  selectedOrderId,
  focusedOrderIndex,
  onOrderSelect,
  orderListRef,
}) => {
  return (
    <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
        <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          PO List ({total})
        </Typography>
      </Box>
      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} ref={orderListRef}>
        <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
          <Table size={TABLE_STYLES.size}>
            <TableBody>
              {loading && purchaseOrders.length === 0
                ? [...Array(10)].map((_, index) => (
                    <TableRow key={`skeleton-${index}`}>
                      <TableCell>
                        <Skeleton height={40} />
                      </TableCell>
                    </TableRow>
                  ))
                : purchaseOrders.map((order, index) => (
                    <OrderRow
                      key={order.id}
                      order={order}
                      index={index}
                      selectedOrderId={selectedOrderId}
                      focusedOrderIndex={focusedOrderIndex}
                      onOrderSelect={onOrderSelect}
                    />
                  ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Paper>
  )
}

export default PurchaseOrdersTable
