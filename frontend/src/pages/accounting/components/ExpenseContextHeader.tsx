import { Paper, Stack, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'
import { default as PostIcon } from '@mui/icons-material/PostAdd'

import { AppButton } from '@/components/common/AppButton'
import { EntityContextHeaderBar } from '@/components/common/EntityContextHeaderBar'
import { EntityStatusChip } from '@/components/common/EntityStatusChip'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { ExpenseRecord } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface Props {
  selected: ExpenseRecord | null
  onEdit: () => void
  onPost: () => void
  onDelete: () => void
}

const cellSx = { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px }

export function ExpenseContextHeader({ selected, onEdit, onPost, onDelete }: Props) {
  if (!selected) {
    return (
      <Paper sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">Select an expense to view details</Typography>
      </Paper>
    )
  }

  const isDraft = selected.status === 'draft'

  return (
    <Paper>
      <EntityContextHeaderBar
        title={selected.referenceNumber}
        statusChip={<EntityStatusChip status={selected.status} />}
        actions={
          isDraft ? (
            <Stack direction="row" spacing={0.5}>
              <AppButton size="small" variant="outlined" startIcon={<EditIcon />} onClick={onEdit}>
                Edit
              </AppButton>
              <AppButton size="small" variant="success" startIcon={<PostIcon />} onClick={onPost}>
                Post
              </AppButton>
              <AppButton size="small" variant="danger" startIcon={<DeleteIcon />} onClick={onDelete}>
                Delete
              </AppButton>
            </Stack>
          ) : null
        }
      />
      <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': cellSx }}>
        <TableBody>
          <TableRow>
            <TableCell sx={{ ...cellSx, color: 'text.secondary', width: 120 }}>Date</TableCell>
            <TableCell>{formatDate(selected.expenseDate)}</TableCell>
            <TableCell sx={{ ...cellSx, color: 'text.secondary', width: 120 }}>Amount</TableCell>
            <TableCell align="right">{formatCurrency(selected.amount)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell sx={{ ...cellSx, color: 'text.secondary' }}>Vendor</TableCell>
            <TableCell>{selected.vendor ?? '—'}</TableCell>
            <TableCell sx={{ ...cellSx, color: 'text.secondary' }}>Account</TableCell>
            <TableCell>{selected.expenseAccount?.name ?? '—'}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Paper>
  )
}
