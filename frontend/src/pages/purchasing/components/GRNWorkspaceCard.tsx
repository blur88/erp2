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
import type { GoodsReceivedNote } from '@/types'

interface GRNWorkspaceCardProps {
  selectedGRN: GoodsReceivedNote | null
}

const GRNWorkspaceCard: React.FC<GRNWorkspaceCardProps> = ({ selectedGRN }) => {
  if (!selectedGRN) {
    return <Paper sx={{ flex: 1 }} />
  }

  return (
    <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <WorkspaceCardSectionHeader title="GRN Items" />

      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', p: TABLE_STYLES.cell.padding.px }}>
        {selectedGRN.items && selectedGRN.items.length > 0 ? (
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
                  <TableCell align="center" sx={{ width: '20%' }}>
                    Ordered Qty
                  </TableCell>
                  <TableCell align="center" sx={{ width: '20%' }}>
                    Received Qty
                  </TableCell>
                  <TableCell align="center" sx={{ width: '20%' }}>
                    Status
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {selectedGRN.items.map((item, index) => (
                  <TableRow
                    key={item.id || index}
                    hover
                    sx={{
                      '&:hover': { backgroundColor: 'action.hover' },
                      transition: 'background-color 0.2s ease',
                      height: TABLE_STYLES.row.height,
                    }}
                  >
                    <TableCell sx={{ fontSize: '0.8rem' }}>
                      {item.purchaseOrderItem?.product?.name || item.product?.name || item.productName || 'N/A'}
                    </TableCell>
                    <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                      {item.orderedQuantity}
                    </TableCell>
                    <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                      {item.receivedQuantity}
                    </TableCell>
                    <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                      {Number(item.receivedQuantity) >= Number(item.orderedQuantity) ? (
                        <Typography sx={{ fontSize: '0.75rem', color: 'success.main', fontWeight: 600 }}>
                          Full
                        </Typography>
                      ) : (
                        <Typography sx={{ fontSize: '0.75rem', color: 'warning.main', fontWeight: 600 }}>
                          Partial
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Alert severity="info">No items in this GRN</Alert>
        )}
      </Box>
    </Paper>
  )
}

export default GRNWorkspaceCard
