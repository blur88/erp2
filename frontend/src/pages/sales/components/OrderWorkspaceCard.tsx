import React from 'react'
import {
  Alert,
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { SalesOrder } from '@/types'
import { formatCurrency } from '@/utils/formatters'

interface OrderWorkspaceCardProps {
  selectedOrder: SalesOrder | null
}

const OrderWorkspaceCard: React.FC<OrderWorkspaceCardProps> = ({ selectedOrder }) => {
  if (!selectedOrder) {
    return <Paper sx={{ flex: 1 }} />
  }

  const hasPayments = Number(selectedOrder.paidAmount || 0) > 0
  const isLocked = hasPayments || Boolean(selectedOrder.isFulfilled)
  const lockReason = hasPayments && selectedOrder.isFulfilled
    ? 'unpay and unfulfill'
    : hasPayments
      ? 'unpay'
      : 'unfulfill'

  return (
    <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <TableContainer>
        <Table size={TABLE_STYLES.size} sx={{ tableLayout: 'fixed', '& .MuiTableCell-root': { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px } }}>
          <TableBody>
            <TableRow>
              <TableCell colSpan={3} sx={{ pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}>
                <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  SO Items
                </Typography>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>

      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', p: TABLE_STYLES.cell.padding.px }}>
        <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {isLocked && (
            <Alert severity="warning" sx={{ mb: 1, fontSize: '0.8rem', py: 0.5 }}>
              Items are locked - {lockReason} before editing
            </Alert>
          )}

          {selectedOrder.items && selectedOrder.items.length > 0 ? (
            <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
              <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': { borderBottom: TABLE_STYLES.cell.border, py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px } }}>
                <TableHead>
                  <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50', color: 'text.primary', fontSize: '0.8rem' } }}>
                    <TableCell sx={{ width: '40%' }}>Product</TableCell>
                    <TableCell align="center" sx={{ width: '12%' }}>Quantity</TableCell>
                    <TableCell align="right" sx={{ width: '16%' }}>Unit Price</TableCell>
                    <TableCell align="right" sx={{ width: '16%' }}>Discount</TableCell>
                    <TableCell align="right" sx={{ width: '16%' }}>Total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {selectedOrder.items.map((item: any, index: number) => (
                    <TableRow key={index} hover sx={{ '&:hover': { backgroundColor: 'action.hover' }, transition: 'background-color 0.2s ease', height: TABLE_STYLES.row.height }}>
                      <TableCell sx={{ fontSize: '0.8rem', lineHeight: 1.2 }}>
                        {item.product?.name || 'Unknown Product'}
                        {item.description && (
                          <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', display: 'block' }}>
                            {item.description}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="center" sx={{ fontSize: '0.8rem', fontWeight: 400, lineHeight: 1.2 }}>
                        {item.quantity || 0}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 400, lineHeight: 1.2 }}>
                        {formatCurrency(item.unitPrice || 0)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 400, lineHeight: 1.2 }}>
                        {item.discountType === 'percentage' && item.discountPercent ? `${item.discountPercent}%` : item.discountAmount ? `-${formatCurrency(item.discountAmount)}` : '-'}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.8rem', lineHeight: 1.2 }}>
                        {formatCurrency(item.totalAmount || item.quantity * item.unitPrice || 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Alert severity="info">No items in this order</Alert>
          )}
        </Box>

        {selectedOrder.notes && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1 }}>
              NOTES
            </Typography>
            <Box sx={{ p: 2, backgroundColor: 'grey.50', borderRadius: 1, fontSize: '0.8rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {selectedOrder.notes}
            </Box>
          </Box>
        )}
      </Box>
    </Paper>
  )
}

export default OrderWorkspaceCard
