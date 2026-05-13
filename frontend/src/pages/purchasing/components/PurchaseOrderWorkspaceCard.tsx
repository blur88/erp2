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

import { WorkspaceCardSectionHeader } from '@/components/common/WorkspaceCardSectionHeader'
import { TABLE_STYLES } from '@/constants/tableStyles'
import type { PurchaseOrder } from '@/types'
import { formatCurrency } from '@/utils/formatters'

interface PurchaseOrderWorkspaceCardProps {
  selectedOrder: PurchaseOrder | null
}

const PurchaseOrderWorkspaceCard: React.FC<PurchaseOrderWorkspaceCardProps> = ({ selectedOrder }) => {
  if (!selectedOrder) {
    return <Paper sx={{ flex: 1 }} />
  }

  return (
    <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <WorkspaceCardSectionHeader title="PO Items" />

      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', p: TABLE_STYLES.cell.padding.px }}>
        <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {selectedOrder.items && selectedOrder.items.length > 0 ? (
            <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
              <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': { borderBottom: TABLE_STYLES.cell.border, py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px } }}>
                <TableHead>
                  <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50', color: 'text.primary', fontSize: '0.8rem' } }}>
                    <TableCell sx={{ width: '35%' }}>Product</TableCell>
                    <TableCell align="center" sx={{ width: '13%' }}>Quantity</TableCell>
                    <TableCell align="center" sx={{ width: '13%' }}>Price</TableCell>
                    <TableCell align="center" sx={{ width: '13%' }}>Discount</TableCell>
                    <TableCell align="center" sx={{ width: '13%' }}>Sub-total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {selectedOrder.items.map((item: any, index: number) => (
                    <TableRow key={item.id || index} hover sx={{ '&:hover': { backgroundColor: 'action.hover' }, transition: 'background-color 0.2s ease', height: TABLE_STYLES.row.height }}>
                      <TableCell sx={{ fontSize: '0.8rem' }}>{item.product?.name || item.description || 'N/A'}</TableCell>
                      <TableCell align="center" sx={{ fontSize: '0.8rem' }}>{item.quantity}</TableCell>
                      <TableCell align="center" sx={{ fontSize: '0.8rem' }}>{formatCurrency(item.unitPrice || item.unitCost || 0)}</TableCell>
                      <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                        {item.discountAmount ? (
                          <Box component="span">
                            {`-${formatCurrency(item.discountAmount)}`}
                            {item.discountPercent > 0 && (
                              <Typography component="span" sx={{ fontSize: '0.7rem', color: 'text.secondary', ml: 0.5 }}>
                                ({item.discountPercent}%)
                              </Typography>
                            )}
                          </Box>
                        ) : '-'}
                      </TableCell>
                      <TableCell align="center" sx={{ fontSize: '0.8rem' }}>{formatCurrency(item.totalAmount || item.total || item.quantity * (item.unitPrice || item.unitCost || 0))}</TableCell>
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
              Notes
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

export default PurchaseOrderWorkspaceCard
