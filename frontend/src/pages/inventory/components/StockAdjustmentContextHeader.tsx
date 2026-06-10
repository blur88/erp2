import React from 'react'
import { default as CheckCircleIcon } from '@mui/icons-material/CheckCircle'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'
import {
  Box,
  CircularProgress,
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

import { AppButton } from '@/components/common/AppButton'
import { EntityContextHeaderBar } from '@/components/common/EntityContextHeaderBar'
import { StatusChip } from '@/components/common/StatusChip'
import { TABLE_STYLES } from '@/constants/tableStyles'
import type { StockAdjustment } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

import type { StockAdjustmentsJournalEntryRef } from '../hooks/useStockAdjustmentsWorkspace'

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

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <EntityContextHeaderBar
        title={`Stock Adjustment - ${selectedAdjustment.adjustmentNumber}`}
        statusChip={<StatusChip status={selectedAdjustment.status} />}
        actions={(
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <AppButton
              size="small"
              variant="secondary"
              startIcon={<EditIcon />}
              title="Edit Adjustment"
              onClick={onEdit}
            >
              Edit
            </AppButton>
            <AppButton
              size="small"
              variant="danger"
              startIcon={<DeleteIcon />}
              title="Delete Adjustment"
              onClick={onDelete}
            >
              Delete
            </AppButton>
          </Box>
        )}
      />

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
                            <AppButton
                              variant="success"
                              size="small"
                              startIcon={<CheckCircleIcon />}
                              onClick={onComplete}
                              sx={{ minWidth: 110 }}
                            >
                              Complete
                            </AppButton>
                          )}
                          {selectedAdjustment.status === 'completed' && (
                            <AppButton
                              variant="warning"
                              size="small"
                              onClick={onRevert}
                              sx={{ minWidth: 110 }}
                            >
                              Revert to Draft
                            </AppButton>
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
