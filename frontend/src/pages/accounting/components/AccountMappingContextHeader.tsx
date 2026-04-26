import { Paper, Stack, Typography } from '@mui/material'
import { default as ClearIcon } from '@mui/icons-material/Clear'
import { default as EditIcon } from '@mui/icons-material/Edit'
import { AppButton } from '@/components/common/AppButton'
import { EntityContextHeaderBar } from '@/components/common/EntityContextHeaderBar'
import type { AccountMapping } from '@/types/accountMapping'

interface Props {
  selected: AccountMapping | null
  label: string
  category: string
  onEdit: () => void
  onDelete: () => void
}

export function AccountMappingContextHeader({ selected, label, category, onEdit, onDelete }: Props) {
  if (!selected) return <Paper sx={{ p: 2 }}><Typography variant="body2" color="text.secondary">Select an account mapping to view details</Typography></Paper>
  return (
    <Paper>
      <EntityContextHeaderBar
        title={label}
        statusChip={<Typography variant="body2" color="text.secondary">{category}</Typography>}
        actions={(
          <Stack direction="row" spacing={0.5}>
            <AppButton size="small" variant="outlined" startIcon={<EditIcon />} onClick={onEdit}>
              Edit
            </AppButton>
            <AppButton size="small" variant="warning" startIcon={<ClearIcon />} onClick={onDelete}>
              Clear
            </AppButton>
          </Stack>
        )}
      />
    </Paper>
  )
}
