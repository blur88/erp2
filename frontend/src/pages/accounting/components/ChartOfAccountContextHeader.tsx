import { Box, Chip, Paper, Stack, Typography } from '@mui/material'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'

import { AppButton } from '@/components/common/AppButton'
import type { ChartOfAccount } from '@/types'

interface Props {
  selected: ChartOfAccount | null
  onEdit: () => void
  onDelete: () => void
}

export function ChartOfAccountContextHeader({ selected, onEdit, onDelete }: Props) {
  if (!selected) return <Paper sx={{ p: 2 }}><Typography variant="body2" color="text.secondary">Select an account to view details</Typography></Paper>

  return (
    <Paper>
      <Box sx={{ px: 2, py: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{selected.code} - {selected.name}</Typography>
          <Chip size="small" label={selected.type} color="primary" variant="outlined" />
        </Stack>
        <Stack direction="row" spacing={0.5}>
          <AppButton size="small" variant="outlined" startIcon={<EditIcon />} onClick={onEdit}>Edit</AppButton>
          <AppButton size="small" variant="danger" startIcon={<DeleteIcon />} onClick={onDelete}>Delete</AppButton>
        </Stack>
      </Box>
    </Paper>
  )
}
