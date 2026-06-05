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

import type { PaymentListItem } from '../hooks/usePaymentsWorkspace'

import { WorkspaceCardSectionHeader } from '@/components/common/WorkspaceCardSectionHeader'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { formatCurrency, formatWholeQuantity } from '@/utils/formatters'

interface PaymentWorkspaceCardProps {
  selectedPayment: PaymentListItem | null
}

const PaymentWorkspaceCard: React.FC<PaymentWorkspaceCardProps> = ({ selectedPayment }) => {
  if (!selectedPayment) {
    return <Paper sx={{ flex: 1 }} />
  }

  const items: any[] = []

  return (
    <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <WorkspaceCardSectionHeader title="Payment Items" />

      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', p: TABLE_STYLES.cell.padding.px }}>
        <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {items.length > 0 ? (
            <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
              <Table
                size={TABLE_STYLES.size}
                sx={{
                  '& .MuiTableCell-root': {
                    borderBottom: TABLE_STYLES.cell.border,
                    py: TABLE_STYLES.cell.padding.py,
                    px: TABLE_STYLES.cell.padding.px,
                  },
                }}
              >
                <TableHead>
                  <TableRow
                    sx={{
                      '& .MuiTableCell-head': {
                        fontWeight: 600,
                        backgroundColor: 'grey.50',
                        color: 'text.primary',
                        fontSize: '0.8rem',
                      },
                    }}
                  >
                    <TableCell sx={{ width: '40%' }}>Product</TableCell>
                    <TableCell align="center" sx={{ width: '12%' }}>Quantity</TableCell>
                    <TableCell align="right" sx={{ width: '16%' }}>Unit Price</TableCell>
                    <TableCell align="right" sx={{ width: '16%' }}>Discount</TableCell>
                    <TableCell align="right" sx={{ width: '16%' }}>Total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((item, index) => (
                    <TableRow
                      key={item.id ?? index}
                      hover
                      sx={{ '&:hover': { backgroundColor: 'action.hover' }, height: TABLE_STYLES.row.height }}
                    >
                      <TableCell sx={{ fontSize: '0.8rem' }}>{item.product?.name ?? 'Unknown Product'}</TableCell>
                      <TableCell align="center" sx={{ fontSize: '0.8rem' }}>{formatWholeQuantity(item.quantity)}</TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{formatCurrency(item.unitPrice)}</TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                        {item.discountType === 'percentage' && item.discountPercent
                          ? `${item.discountPercent}%`
                          : item.discount
                            ? `-${formatCurrency(item.discount)}`
                            : '-'}
                      </TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                        {formatCurrency(item.totalAmount ?? item.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Alert severity="info">No payment items available</Alert>
          )}
        </Box>

        {selectedPayment.notes && (
          <Box sx={{ mt: 1 }}>
            <Typography
              variant="tableHeader"
              sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1 }}
            >
              NOTES
            </Typography>
            <Box
              sx={{
                p: 2,
                backgroundColor: 'grey.50',
                borderRadius: 1,
                fontSize: '0.8rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {selectedPayment.notes}
            </Box>
          </Box>
        )}
      </Box>
    </Paper>
  )
}

export default PaymentWorkspaceCard
