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
import { TYPOGRAPHY_STYLES } from '@/constants/typography'
import type { SalesOrder } from '@/types'

interface OrderRowProps {
  order: SalesOrder
  index: number
  selectedOrderId?: string
  focusedOrderIndex: number
  onOrderSelect: (order: SalesOrder) => void
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
        '&:hover': {
          backgroundColor: isSelected ? 'action.selected' : 'action.hover',
        },
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
        <Typography
          variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant}
          sx={{
            fontWeight: TYPOGRAPHY_STYLES.tableCell.secondary.fontWeight,
            fontSize: TYPOGRAPHY_STYLES.tableCell.secondary.fontSize,
            lineHeight: TYPOGRAPHY_STYLES.tableCell.secondary.lineHeight,
          }}
        >
          {order.orderNumber}
        </Typography>
      </TableCell>
    </TableRow>
  )
})

OrderRow.displayName = 'OrderRow'

interface OrdersTableProps {
  orders: SalesOrder[]
  loading: boolean
  total: number
  selectedOrderId?: string
  focusedOrderIndex: number
  onOrderSelect: (order: SalesOrder) => void
  orderListRef: React.RefObject<HTMLDivElement | null>
}

const OrdersTable: React.FC<OrdersTableProps> = ({
  orders,
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
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography
            variant={TYPOGRAPHY_STYLES.tableHeader.variant}
            sx={{
              fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
              fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            SO List ({total})
          </Typography>
          {loading && orders.length > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" color="text.secondary">
                Searching...
              </Typography>
              <Box sx={{ width: 16, height: 16 }}>
                <Skeleton variant="circular" width={16} height={16} />
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} ref={orderListRef}>
        <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
          <Table
            size={TABLE_STYLES.size}
            sx={{
              '& .MuiTableCell-root': {
                borderBottom: TABLE_STYLES.cell.border,
                py: TABLE_STYLES.cell.padding.py * 0.75,
                px: TABLE_STYLES.cell.padding.px * 0.75,
              },
            }}
          >
            <TableBody>
              {loading && orders.length === 0
                ? [...Array(10)].map((_, index) => (
                    <TableRow key={`skeleton-${index}`}>
                      <TableCell>
                        <Skeleton height={40} />
                      </TableCell>
                    </TableRow>
                  ))
                : orders.map((order, index) => (
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

export default OrdersTable
