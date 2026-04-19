import { Box, Chip, Paper, Stack, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material'
import { default as CancelIcon } from '@mui/icons-material/Cancel'

import { AppButton } from '@/components/common/AppButton'
import { TABLE_STYLES } from '@/constants/tableStyles'
import type { Settlement } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface Props {
  selected: Settlement | null
  onCancel: () => void
}

const cellSx = { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px }
const statusColor = (status: Settlement['status']) => status === 'completed' ? 'success' : status === 'cancelled' ? 'error' : 'default'

export function SettlementContextHeader({ selected, onCancel }: Props) {
  if (!selected) return <Paper sx={{ p: 2 }}><Typography variant="body2" color="text.secondary">Select a settlement to view details</Typography></Paper>

  return (
    <Paper>
      <Box sx={{ px: 2, pt: 1.5, pb: 1, borderBottom: TABLE_STYLES.cell.border }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{selected.settlementNumber}</Typography>
            <Chip size="small" color={statusColor(selected.status) as any} label={selected.status} />
          </Stack>
          {selected.status === 'completed' && <AppButton size="small" variant="danger" startIcon={<CancelIcon />} onClick={onCancel}>Cancel</AppButton>}
        </Stack>
      </Box>
      <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': cellSx }}>
        <TableBody>
          <TableRow><TableCell sx={{ ...cellSx, color: 'text.secondary', width: 120 }}>Date</TableCell><TableCell>{formatDate(selected.settlementDate)}</TableCell><TableCell sx={{ ...cellSx, color: 'text.secondary', width: 120 }}>Total</TableCell><TableCell align="right">{formatCurrency(Number(selected.totalAmount || 0))}</TableCell></TableRow>
        </TableBody>
      </Table>
    </Paper>
  )
}
