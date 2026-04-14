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
  Typography,
} from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { StockAdjustment } from '@/types'

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

      <Box sx={{ px: TABLE_STYLES.cell.padding.px, py: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          {selectedAdjustment.status === 'draft' && (
            <Button variant="contained" size="small" color="primary" onClick={onComplete} sx={{ minWidth: 110 }}>
              Complete
            </Button>
          )}
          {selectedAdjustment.status === 'completed' && (
            <Button variant="contained" size="small" color="warning" onClick={onRevert} sx={{ minWidth: 110 }}>
              Revert to Draft
            </Button>
          )}
        </Stack>

        {selectedAdjustment.status === 'completed' && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>Journal Entry:</Typography>
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
          </Box>
        )}
      </Box>
    </Paper>
  )
}

export default StockAdjustmentContextHeader
