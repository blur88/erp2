import { Paper, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material'
import { default as CancelIcon } from '@mui/icons-material/Cancel'

import { AppButton } from '@/components/common/AppButton'
import { EntityContextHeaderBar } from '@/components/common/EntityContextHeaderBar'
import { EntityStatusChip } from '@/components/common/EntityStatusChip'
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
      <EntityContextHeaderBar
        title={selected.referenceNumber}
        statusChip={<EntityStatusChip status={selected.status} />}
        actions={
          canManageTransfers && selected.status === 'ACTIVE' ? (
            <AppButton size="small" variant="danger" startIcon={<CancelIcon />} onClick={onCancel}>
              Cancel
            </AppButton>
          ) : null
        }
      />
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
