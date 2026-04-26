import type { ReactNode } from 'react'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import { Box, CircularProgress, IconButton, Tooltip, Typography } from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'

import type { JournalEntryRef } from '@/hooks/useJournalEntryRef'

interface EntityContextHeaderBarProps {
  title: string
  statusChip?: ReactNode
  actions?: ReactNode
  journalEntryRef?: JournalEntryRef | null
  journalEntryRefLoading?: boolean
  onNavigateToJournalEntry?: () => void
}

export function EntityContextHeaderBar({
  title,
  statusChip,
  actions,
  journalEntryRef,
  journalEntryRefLoading,
  onNavigateToJournalEntry,
}: EntityContextHeaderBarProps) {
  return (
    <Box
      sx={{
        p: TABLE_STYLES.cell.padding.px,
        borderBottom: TABLE_STYLES.cell.border,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Typography
          variant="tableHeader"
          sx={{
            fontWeight: 600,
            fontSize: '0.8rem',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          {title}
        </Typography>
        {statusChip}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {actions}
        {journalEntryRefLoading && !journalEntryRef && (
          <CircularProgress size={16} sx={{ mx: 0.5 }} />
        )}
        {journalEntryRef && (
          <Tooltip title={`Journal Entry: ${journalEntryRef.referenceNumber}`}>
            <IconButton size="small" onClick={onNavigateToJournalEntry}>
              <MenuBookIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  )
}
