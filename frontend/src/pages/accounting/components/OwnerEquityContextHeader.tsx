import { Chip, Paper, Stack, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'
import { default as PostIcon } from '@mui/icons-material/PostAdd'
import { default as UndoIcon } from '@mui/icons-material/Undo'

import { AppButton } from '@/components/common/AppButton'
import { EntityContextHeaderBar } from '@/components/common/EntityContextHeaderBar'
import { EntityStatusChip } from '@/components/common/EntityStatusChip'
import { TABLE_STYLES } from '@/constants/tableStyles'
import type { OwnerEquityTransaction } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface Props {
  selected: OwnerEquityTransaction | null
  onEdit: () => void
  onPost: () => void
  onDelete: () => void
  onReverse: () => void
}

const typeLabel: Record<OwnerEquityTransaction['type'], string> = {
  capital_injection: 'Capital Injection',
  owner_drawing: 'Owner Drawing',
}
const cellSx = { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px }

export function OwnerEquityContextHeader({ selected, onEdit, onPost, onDelete, onReverse }: Props) {
  if (!selected) return <Paper sx={{ p: 2 }}><Typography variant="body2" color="text.secondary">Select a transaction to view details</Typography></Paper>

  return (
    <Paper>
      <EntityContextHeaderBar
        title={selected.referenceNumber}
        statusChip={(
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Chip
              size="small"
              label={typeLabel[selected.type]}
              color={selected.type === 'capital_injection' ? 'primary' : 'warning'}
            />
            <EntityStatusChip status={selected.status} />
          </Stack>
        )}
        actions={(
          <Stack direction="row" spacing={0.5}>
            {selected.status === 'draft' && (
              <>
                <AppButton size="small" variant="outlined" startIcon={<EditIcon />} onClick={onEdit}>
                  Edit
                </AppButton>
                <AppButton size="small" variant="success" startIcon={<PostIcon />} onClick={onPost}>
                  Post
                </AppButton>
                <AppButton size="small" variant="danger" startIcon={<DeleteIcon />} onClick={onDelete}>
                  Delete
                </AppButton>
              </>
            )}
            {selected.status === 'posted' && (
              <AppButton size="small" variant="warning" startIcon={<UndoIcon />} onClick={onReverse}>
                Reverse
              </AppButton>
            )}
          </Stack>
        )}
      />
      <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': cellSx }}>
        <TableBody>
          <TableRow><TableCell sx={{ ...cellSx, color: 'text.secondary', width: 120 }}>Date</TableCell><TableCell>{formatDate(selected.transactionDate)}</TableCell><TableCell sx={{ ...cellSx, color: 'text.secondary', width: 120 }}>Amount</TableCell><TableCell align="right">{formatCurrency(Number(selected.amount || 0))}</TableCell></TableRow>
        </TableBody>
      </Table>
    </Paper>
  )
}
