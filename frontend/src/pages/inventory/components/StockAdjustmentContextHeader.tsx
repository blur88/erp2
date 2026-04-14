import React from 'react'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material'
import Grid from '@mui/material/Grid'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { StockAdjustment } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

import type { StockAdjustmentsJournalEntryRef } from '../hooks/useStockAdjustmentsPageState'

interface StockAdjustmentContextHeaderProps {
  selectedAdjustment: StockAdjustment | null
  journalEntryRef: StockAdjustmentsJournalEntryRef | null
  journalEntryRefLoading: boolean
  onEdit: () => void
  onDelete: () => void
  onComplete: () => void
  onRevert: () => void
  onNavigateToJournalEntry: () => void
}

const actionIconSx = {
  height: `${TABLE_STYLES.row.height * 0.75}px`,
  width: `${TABLE_STYLES.row.height * 0.75}px`,
  minHeight: 20,
  minWidth: 20,
  p: 0.125,
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

const StockAdjustmentContextHeader: React.FC<StockAdjustmentContextHeaderProps> = ({
  selectedAdjustment,
  journalEntryRef,
  journalEntryRefLoading,
  onEdit,
  onDelete,
  onComplete,
  onRevert,
  onNavigateToJournalEntry,
}) => {
  if (!selectedAdjustment) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
          Select an adjustment to view details
        </Typography>
      </Paper>
    )
  }

  const statusColor: 'default' | 'success' | 'error' =
    selectedAdjustment.status === 'completed'
      ? 'success'
      : selectedAdjustment.status === 'cancelled'
        ? 'error'
        : 'default'

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <Box
        sx={{
          p: TABLE_STYLES.cell.padding.px,
          borderBottom: TABLE_STYLES.cell.border,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography
            variant="tableHeader"
            sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
          >
            SA Details — {selectedAdjustment.adjustmentNumber}
          </Typography>
          <Chip
            label={selectedAdjustment.status}
            size="small"
            color={statusColor}
            sx={{ textTransform: 'capitalize', fontSize: '0.75rem', fontWeight: 600 }}
          />
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <IconButton
            size="small"
            title="Edit Adjustment"
            onClick={onEdit}
            sx={{ ...actionIconSx, color: 'primary.main' }}
          >
            <EditIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
          <IconButton
            size="small"
            title="Delete Adjustment"
            onClick={onDelete}
            sx={{ ...actionIconSx, color: 'error.main' }}
          >
            <DeleteIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
        </Box>
      </Box>

      <Box sx={{ p: TABLE_STYLES.cell.padding.px }}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={detailTableSx}>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={2} sx={sectionHeaderCellSx}>
                      <Typography variant="h6" sx={sectionTitleSx}>
                        SA Information
                      </Typography>
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
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Total Value</TableCell>
                    <TableCell sx={valueCellSx}>{formatCurrency(selectedAdjustment.totalValue)}</TableCell>
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
                      <Typography variant="h6" sx={sectionTitleSx}>
                        SA Confirmation
                      </Typography>
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
                  {selectedAdjustment.status === 'completed' && (
                    <TableRow sx={{ backgroundColor: 'grey.50' }}>
                      <TableCell sx={labelCellSx}>Journal Entry</TableCell>
                      <TableCell sx={valueCellSx}>
                        {journalEntryRefLoading ? (
                          <CircularProgress size={12} />
                        ) : journalEntryRef ? (
                          <Typography
                            component="button"
                            onClick={onNavigateToJournalEntry}
                            sx={{
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              color: 'primary.main',
                              cursor: 'pointer',
                              border: 'none',
                              background: 'none',
                              padding: 0,
                              '&:hover': { textDecoration: 'underline' },
                            }}
                          >
                            {journalEntryRef.referenceNumber}
                          </Typography>
                        ) : (
                          <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>
                            Pending
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow>
                    <TableCell colSpan={2} sx={{ textAlign: 'center' }}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'center' }}>
                        {selectedAdjustment.status === 'draft' && (
                          <Button
                            variant="contained"
                            size="small"
                            color="primary"
                            onClick={onComplete}
                            sx={{ minWidth: 110 }}
                          >
                            Complete
                          </Button>
                        )}
                        {selectedAdjustment.status === 'completed' && (
                          <Button
                            variant="contained"
                            size="small"
                            color="warning"
                            onClick={onRevert}
                            sx={{ minWidth: 110 }}
                          >
                            Revert to Draft
                          </Button>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
        </Grid>
      </Box>
    </Paper>
  )
}

export default StockAdjustmentContextHeader
