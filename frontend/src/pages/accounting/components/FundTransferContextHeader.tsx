import { Box, Chip, Paper, Stack, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material'
import { default as CancelIcon } from '@mui/icons-material/Cancel'

import { AppButton } from '@/components/common/AppButton'
import { TABLE_STYLES } from '@/constants/tableStyles'
import type { FundTransfer } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface Props {
  selected: FundTransfer | null
  onCancel: () => void
  canManageTransfers: boolean
}

const cellSx = { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px }

export function FundTransferContextHeader({ selected, onCancel, canManageTransfers }: Props) {
  if (!selected) return <Paper sx={{ p: 2 }}><Typography variant="body2" color="text.secondary">Select a fund transfer to view details</Typography></Paper>

  return (
    <Paper>
      <Box sx={{ px: 2, pt: 1.5, pb: 1, borderBottom: TABLE_STYLES.cell.border }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{selected.referenceNumber}</Typography>
            <Chip size="small" label={selected.status} color={selected.status === 'ACTIVE' ? 'success' : 'error'} />
          </Stack>
          {canManageTransfers && selected.status === 'ACTIVE' && (
            <AppButton size="small" variant="danger" startIcon={<CancelIcon />} onClick={onCancel}>Cancel</AppButton>
          )}
        </Stack>
      </Box>
      <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': cellSx }}>
        <TableBody>
          <TableRow>
            <TableCell sx={{ ...cellSx, color: 'text.secondary', width: 120 }}>Date</TableCell>
            <TableCell>{formatDate(selected.transferDate)}</TableCell>
            <TableCell sx={{ ...cellSx, color: 'text.secondary', width: 120 }}>Amount</TableCell>
            <TableCell align="right">{formatCurrency(selected.amount)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell sx={{ ...cellSx, color: 'text.secondary' }}>From</TableCell>
            <TableCell>{selected.sourceAccount.code} - {selected.sourceAccount.name}</TableCell>
            <TableCell sx={{ ...cellSx, color: 'text.secondary' }}>To</TableCell>
            <TableCell>{selected.destinationAccount.code} - {selected.destinationAccount.name}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Paper>
  )
}
