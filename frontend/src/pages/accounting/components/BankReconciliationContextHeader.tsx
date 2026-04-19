import { Box, Chip, Paper, Stack, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material'
import { default as CheckCircleIcon } from '@mui/icons-material/CheckCircle'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as ReopenIcon } from '@mui/icons-material/LockOpen'
import { format } from 'date-fns'

import { AppButton } from '@/components/common/AppButton'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { BankReconciliation, BankReconciliationStatus } from '@/types'
import { formatCurrency } from '@/utils/formatters'

interface Props {
  selected: BankReconciliation | null
  onComplete: () => void
  onReopen: () => void
  onDelete: () => void
}

const cellSx = { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px }

export function BankReconciliationContextHeader({ selected, onComplete, onReopen, onDelete }: Props) {
  if (!selected) {
    return (
      <Paper sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">Select a reconciliation to view details</Typography>
      </Paper>
    )
  }

  const isInProgress = selected.status === BankReconciliationStatus.IN_PROGRESS
  const isCompleted = selected.status === BankReconciliationStatus.COMPLETED

  return (
    <Paper>
      <Box sx={{ px: 2, pt: 1.5, pb: 1, borderBottom: TABLE_STYLES.cell.border }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{selected.account?.name ?? 'Bank Account'}</Typography>
            <Chip label={selected.status} color={isCompleted ? 'success' : 'warning'} size="small" />
          </Stack>
          <Stack direction="row" spacing={0.5}>
            {isInProgress && <AppButton size="small" variant="success" startIcon={<CheckCircleIcon />} onClick={onComplete}>Complete</AppButton>}
            {isCompleted && <AppButton size="small" variant="outlined" startIcon={<ReopenIcon />} onClick={onReopen}>Reopen</AppButton>}
            <AppButton size="small" variant="danger" startIcon={<DeleteIcon />} onClick={onDelete}>Delete</AppButton>
          </Stack>
        </Stack>
      </Box>
      <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': cellSx }}>
        <TableBody>
          <TableRow>
            <TableCell sx={{ ...cellSx, color: 'text.secondary', width: 140 }}>Period</TableCell>
            <TableCell>{format(new Date(selected.reconciliationDate), 'MMMM yyyy')}</TableCell>
            <TableCell sx={{ ...cellSx, color: 'text.secondary', width: 140 }}>Statement Balance</TableCell>
            <TableCell align="right">{formatCurrency(selected.statementBalance)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Paper>
  )
}
