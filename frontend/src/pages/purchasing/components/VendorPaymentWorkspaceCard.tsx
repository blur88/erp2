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
import type { VendorPayment } from '@/types'
import { formatCurrency, formatWholeQuantity } from '@/utils/formatters'

interface VendorPaymentWorkspaceCardProps {
  selectedPayment: VendorPayment | null
}

const VendorPaymentWorkspaceCard: React.FC<VendorPaymentWorkspaceCardProps> = ({ selectedPayment }) => {
  if (!selectedPayment) {
    return <Paper sx={{ flex: 1 }} />
  }

  const items = selectedPayment.purchaseOrder?.items ?? []

  return (
    <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <WorkspaceCardSectionHeader title="PO Items" />

      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', p: TABLE_STYLES.cell.padding.px }}>
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
                  <TableCell align="center" sx={{ width: '20%' }}>Quantity</TableCell>
                  <TableCell align="right" sx={{ width: '20%' }}>Unit Price</TableCell>
                  <TableCell align="right" sx={{ width: '20%' }}>Total</TableCell>
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
                    <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{formatCurrency(item.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Alert severity="info">No PO items available</Alert>
        )}
      </Box>
    </Paper>
  )
}

export default VendorPaymentWorkspaceCard
