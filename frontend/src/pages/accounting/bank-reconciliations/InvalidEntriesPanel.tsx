import React from 'react'
import { Alert, Box, Button, Typography } from '@mui/material'
import type { ReconciliationLineDto } from '@/types'
import { formatDate } from '@/utils/formatters'

export interface InvalidEntriesPanelProps {
  invalidMatched: ReconciliationLineDto[]
  invalidClassifications: ReconciliationLineDto[]
  onUntick: (id: string) => void
  onClearClassification: (line: ReconciliationLineDto) => void
}

export default function InvalidEntriesPanel({
  invalidMatched,
  invalidClassifications,
  onUntick,
  onClearClassification,
}: InvalidEntriesPanelProps): React.ReactElement | null {
  if (invalidMatched.length === 0 && invalidClassifications.length === 0) {
    return null
  }

  return (
    <Alert severity="warning" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
        The following selections are no longer eligible and must be resolved before saving:
      </Typography>

      {invalidMatched.length > 0 && (
        <Box sx={{ mt: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Matched entries dated after the statement period or no longer eligible:
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {invalidMatched.map((line) => (
              <Box
                component="li"
                key={line.journalEntryLineId}
                sx={{ display: 'flex', alignItems: 'center', gap: 1.5, my: 0.5 }}
              >
                <Typography variant="body2">
                  {line.journalNo} ({formatDate(line.entryDate)}) — {line.description || 'No description'}
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  color="warning"
                  onClick={() => onUntick(line.journalEntryLineId)}
                  sx={{ py: 0, px: 1, minHeight: 24, fontSize: '0.75rem', textTransform: 'none' }}
                >
                  Untick
                </Button>
              </Box>
            ))}
          </Box>
        </Box>
      )}

      {invalidClassifications.length > 0 && (
        <Box sx={{ mt: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Classified setup entries that are no longer before the period start date:
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {invalidClassifications.map((line) => (
              <Box
                component="li"
                key={line.journalEntryLineId}
                sx={{ display: 'flex', alignItems: 'center', gap: 1.5, my: 0.5 }}
              >
                <Typography variant="body2">
                  {line.journalNo} ({formatDate(line.entryDate)}) — {line.description || 'No description'}
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  color="warning"
                  aria-label="Clear classification"
                  onClick={() => onClearClassification(line)}
                  sx={{ py: 0, px: 1, minHeight: 24, fontSize: '0.75rem', textTransform: 'none' }}
                >
                  Clear classification
                </Button>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Alert>
  )
}
