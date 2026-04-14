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
import Grid from '@mui/material/Grid'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { StockAdjustment } from '@/types'
import { formatDate } from '@/utils/formatters'

interface StockAdjustmentWorkspaceCardProps {
  selectedAdjustment: StockAdjustment | null
}

const detailTableSx = {
  tableLayout: 'fixed' as const,
  '& .MuiTableCell-root': {
    border: 'none',
    py: TABLE_STYLES.cell.padding.py,
    px: TABLE_STYLES.cell.padding.px,
    '&:nth-of-type(1)': { width: '40%' },
    '&:nth-of-type(2)': { width: '60%' },
  },
}

const sectionHeaderCellSx = {
  pb: TABLE_STYLES.cell.padding.py * 0.67,
  py: TABLE_STYLES.cell.padding.py * 0.67,
  borderTop: TABLE_STYLES.cell.border,
}

const sectionTitleSx = {
  fontWeight: 600,
  color: 'primary.main',
  fontSize: '0.8rem',
}

const labelCellSx = { fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }
const valueCellSx = { fontSize: '0.8rem' }

const StockAdjustmentWorkspaceCard: React.FC<StockAdjustmentWorkspaceCardProps> = ({
  selectedAdjustment,
}) => {
  if (!selectedAdjustment) {
    return <Paper sx={{ flex: 1 }} />
  }

  return (
    <Paper sx={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: TABLE_STYLES.cell.padding.px }}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={detailTableSx}>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={2} sx={sectionHeaderCellSx}>
                      <Typography variant="h6" sx={sectionTitleSx}>SA Information</Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Date</TableCell>
                    <TableCell sx={valueCellSx}>{formatDate(selectedAdjustment.adjustmentDate)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Item Count</TableCell>
                    <TableCell sx={valueCellSx}>{selectedAdjustment.itemCount}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={detailTableSx}>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={2} sx={sectionHeaderCellSx}>
                      <Typography variant="h6" sx={sectionTitleSx}>SA Confirmation</Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Created At</TableCell>
                    <TableCell sx={valueCellSx}>{formatDate(selectedAdjustment.createdAt)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Updated At</TableCell>
                    <TableCell sx={valueCellSx}>{formatDate(selectedAdjustment.updatedAt)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
        </Grid>

        <Box sx={{ borderTop: '2px solid', borderColor: 'divider', my: 1 }} />

        <Typography
          variant="tableHeader"
          sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1, display: 'block' }}
        >
          SA Items
        </Typography>

        {selectedAdjustment.items && selectedAdjustment.items.length > 0 ? (
          <TableContainer>
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
                  <TableCell align="center" sx={{ width: '20%' }}>Old Quantity</TableCell>
                  <TableCell align="center" sx={{ width: '20%' }}>New Quantity</TableCell>
                  <TableCell align="center" sx={{ width: '20%' }}>Difference</TableCell>
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
                    <TableCell align="center" sx={{ fontSize: '0.8rem', color: 'text.secondary', lineHeight: 1.2 }}>
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

        <Box sx={{ borderTop: '2px solid', borderColor: 'divider', my: 1 }} />

        <Typography
          variant="tableHeader"
          sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px', mb: 1, display: 'block' }}
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
          {selectedAdjustment.notes || '—'}
        </Box>
      </Box>
    </Paper>
  )
}

export default StockAdjustmentWorkspaceCard
