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
import type { StockAdjustment } from '@/types'

interface StockAdjustmentWorkspaceCardProps {
  selectedAdjustment: StockAdjustment | null
}

const StockAdjustmentWorkspaceCard: React.FC<StockAdjustmentWorkspaceCardProps> = ({
  selectedAdjustment,
}) => {
  if (!selectedAdjustment) {
    return <Paper sx={{ flex: 1 }} />
  }

  return (
    <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
        <Typography
          variant="tableHeader"
          sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
        >
          SA Items
        </Typography>
      </Box>

      <Box
        sx={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          p: TABLE_STYLES.cell.padding.px,
        }}
      >
        <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {selectedAdjustment.items && selectedAdjustment.items.length > 0 ? (
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
                      Old Quantity
                    </TableCell>
                    <TableCell align="center" sx={{ width: '20%' }}>
                      New Quantity
                    </TableCell>
                    <TableCell align="center" sx={{ width: '20%' }}>
                      Difference
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {selectedAdjustment.items.map((item, index) => (
                    <TableRow
                      key={index}
                      hover
                      sx={{ height: TABLE_STYLES.row.height, transition: 'background-color 0.2s ease' }}
                    >
                      <TableCell sx={{ fontSize: '0.8rem', lineHeight: 1.2 }}>
                        {item.product?.name || 'Unknown Product'}
                      </TableCell>
                      <TableCell
                        align="center"
                        sx={{ fontSize: '0.8rem', color: 'text.secondary', lineHeight: 1.2 }}
                      >
                        {Number(item.oldQuantity).toLocaleString()}
                      </TableCell>
                      <TableCell align="center" sx={{ fontSize: '0.8rem', lineHeight: 1.2 }}>
                        {Number(item.newQuantity).toLocaleString()}
                      </TableCell>
                      <TableCell
                        align="center"
                        sx={{
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          lineHeight: 1.2,
                          color:
                            Number(item.difference) > 0
                              ? 'success.main'
                              : Number(item.difference) < 0
                                ? 'error.main'
                                : 'text.primary',
                        }}
                      >
                        {Number(item.difference) > 0 ? '+' : ''}
                        {Number(item.difference).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Alert severity="info">No items in this adjustment</Alert>
          )}
        </Box>

        {selectedAdjustment.notes && (
          <Box sx={{ mt: 1 }}>
            <Typography
              variant="tableHeader"
              sx={{
                fontWeight: 600,
                fontSize: '0.8rem',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                mb: 1,
                display: 'block',
              }}
            >
              Notes
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
              {selectedAdjustment.notes}
            </Box>
          </Box>
        )}
      </Box>
    </Paper>
  )
}

export default StockAdjustmentWorkspaceCard
