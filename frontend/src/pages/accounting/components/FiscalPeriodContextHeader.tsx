import { Box, Chip, Paper, Stack, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'
import { default as LockIcon } from '@mui/icons-material/Lock'
import { default as LockOpenIcon } from '@mui/icons-material/LockOpen'
import { format } from 'date-fns'

import { AppButton } from '@/components/common/AppButton'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { FiscalPeriod, FiscalPeriodStatus } from '@/types'

interface Props {
  selected: FiscalPeriod | null
  onClose: () => void
  onReopen: () => void
  onEdit: () => void
  onDelete: () => void
}

const cellSx = { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px }

export function FiscalPeriodContextHeader({ selected, onClose, onReopen, onEdit, onDelete }: Props) {
  if (!selected) return <Paper sx={{ p: 2 }}><Typography variant="body2" color="text.secondary">Select a fiscal period to view details</Typography></Paper>

  return (
    <Paper>
      <Box sx={{ px: 2, pt: 1.5, pb: 1, borderBottom: TABLE_STYLES.cell.border }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{selected.name}</Typography>
            <Chip size="small" label={selected.status} color={selected.status === FiscalPeriodStatus.OPEN ? 'success' : 'error'} />
          </Stack>
          <Stack direction="row" spacing={0.5}>
            {selected.isOpen ? <AppButton size="small" variant="warning" startIcon={<LockIcon />} onClick={onClose}>Close</AppButton> : <AppButton size="small" variant="outlined" startIcon={<LockOpenIcon />} onClick={onReopen}>Reopen</AppButton>}
            <AppButton size="small" variant="outlined" startIcon={<EditIcon />} onClick={onEdit}>Edit</AppButton>
            <AppButton size="small" variant="danger" startIcon={<DeleteIcon />} onClick={onDelete}>Delete</AppButton>
          </Stack>
        </Stack>
      </Box>
      <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': cellSx }}>
        <TableBody>
          <TableRow><TableCell sx={{ ...cellSx, color: 'text.secondary', width: 140 }}>Date Range</TableCell><TableCell>{format(new Date(selected.startDate), 'yyyy-MM-dd')} - {format(new Date(selected.endDate), 'yyyy-MM-dd')}</TableCell></TableRow>
        </TableBody>
      </Table>
    </Paper>
  )
}
