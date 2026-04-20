import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'
import { Box, Chip, Paper, Stack, Typography } from '@mui/material'

import { AppButton } from '@/components/common/AppButton'
import { TABLE_STYLES } from '@/constants/tableStyles'
import type { AccountType, ChartOfAccount } from '@/types'

interface Props {
  selected: ChartOfAccount | null
  onEdit: () => void
  onDelete: () => void
}

const TYPE_COLORS: Record<AccountType, 'success' | 'error' | 'primary' | 'info' | 'warning'> = {
  ASSET: 'success',
  LIABILITY: 'error',
  EQUITY: 'primary',
  REVENUE: 'info',
  EXPENSE: 'warning',
}

export function ChartOfAccountContextHeader({ selected, onEdit, onDelete }: Props) {
  if (!selected) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
          Select an account to view details
        </Typography>
      </Paper>
    )
  }

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
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography
            variant="tableHeader"
            sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
          >
            {selected.code} - {selected.name}
          </Typography>
          <Chip
            size="small"
            label={selected.type.charAt(0) + selected.type.slice(1).toLowerCase()}
            color={TYPE_COLORS[selected.type]}
            variant="outlined"
          />
        </Stack>
        <Stack direction="row" spacing={0.5}>
          <AppButton size="small" variant="outlined" startIcon={<EditIcon />} onClick={onEdit}>
            Edit
          </AppButton>
          <AppButton size="small" variant="danger" startIcon={<DeleteIcon />} onClick={onDelete}>
            Delete
          </AppButton>
        </Stack>
      </Box>
    </Paper>
  )
}
