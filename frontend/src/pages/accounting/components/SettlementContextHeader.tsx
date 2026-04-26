import { Paper, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material'
import { default as CancelIcon } from '@mui/icons-material/Cancel'

import { AppButton } from '@/components/common/AppButton'
import { EntityContextHeaderBar } from '@/components/common/EntityContextHeaderBar'
import { EntityStatusChip } from '@/components/common/EntityStatusChip'
import { TABLE_STYLES } from '@/constants/tableStyles'
import type { Settlement } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface Props {
  selected: Settlement | null
  onCancel: () => void
}

const cellSx = { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px }

export function SettlementContextHeader({ selected, onCancel }: Props) {
  if (!selected) return <Paper sx={{ p: 2 }}><Typography variant="body2" color="text.secondary">Select a settlement to view details</Typography></Paper>

  return (
    <Paper>
      <EntityContextHeaderBar
        title={selected.settlementNumber}
        statusChip={<EntityStatusChip status={selected.status} />}
        actions={
          selected.status === 'completed' ? (
            <AppButton size="small" variant="danger" startIcon={<CancelIcon />} onClick={onCancel}>
              Cancel
            </AppButton>
          ) : null
        }
      />
      <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': cellSx }}>
        <TableBody>
          <TableRow><TableCell sx={{ ...cellSx, color: 'text.secondary', width: 120 }}>Date</TableCell><TableCell>{formatDate(selected.settlementDate)}</TableCell><TableCell sx={{ ...cellSx, color: 'text.secondary', width: 120 }}>Total</TableCell><TableCell align="right">{formatCurrency(Number(selected.totalAmount || 0))}</TableCell></TableRow>
        </TableBody>
      </Table>
    </Paper>
  )
}
