import type { RefObject } from 'react'
import { Checkbox, Chip, CircularProgress, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from '@mui/material'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'
import { default as PostIcon } from '@mui/icons-material/PostAdd'

import { AppButton } from '@/components/common/AppButton'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { ExpenseRecord } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface Props {
  expenses: ExpenseRecord[]
  loading: boolean
  selectedId: string | null
  selectedIds: Set<string>
  onSelect: (item: ExpenseRecord) => void
  onToggleCheck: (id: string) => void
  onSelectAll: () => void
  onPost: (item: ExpenseRecord) => void
  onEdit: (item: ExpenseRecord) => void
  onDelete: (item: ExpenseRecord) => void
  listRef?: RefObject<HTMLDivElement | null>
}

function statusColor(status: string) {
  return status === 'posted' ? 'success' as const : 'default' as const
}

export function ExpensesTable({
  expenses,
  loading,
  selectedId,
  selectedIds,
  onSelect,
  onToggleCheck,
  onSelectAll,
  onPost,
  onEdit,
  onDelete,
  listRef,
}: Props) {
  const draftExpenses = expenses.filter((expense) => expense.status === 'draft')
  const allSelected = draftExpenses.length > 0 && selectedIds.size === draftExpenses.length
  const someSelected = selectedIds.size > 0 && selectedIds.size < draftExpenses.length

  return (
    <Paper ref={listRef} sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
        <Table size={TABLE_STYLES.size} stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox indeterminate={someSelected} checked={allSelected} onChange={onSelectAll} />
              </TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Reference</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Vendor</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Account</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">Amount</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                  <CircularProgress />
                </TableCell>
              </TableRow>
            ) : expenses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">No expenses found</Typography>
                </TableCell>
              </TableRow>
            ) : expenses.map((item) => (
              <TableRow key={item.id} hover selected={item.id === selectedId} onClick={() => onSelect(item)} sx={{ cursor: 'pointer', height: TABLE_STYLES.row.height }}>
                <TableCell padding="checkbox" onClick={(event) => event.stopPropagation()}>
                  <Checkbox disabled={item.status !== 'draft'} checked={selectedIds.has(item.id)} onChange={() => onToggleCheck(item.id)} />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 500, color: 'primary.main' }}>{item.referenceNumber}</Typography>
                </TableCell>
                <TableCell><Typography variant="body2">{formatDate(item.expenseDate)}</Typography></TableCell>
                <TableCell><Typography variant="body2">{item.vendor ?? '—'}</Typography></TableCell>
                <TableCell><Typography variant="body2">{item.expenseAccount?.name ?? '—'}</Typography></TableCell>
                <TableCell align="right"><Typography variant="body2">{formatCurrency(item.amount)}</Typography></TableCell>
                <TableCell><Chip label={item.status} color={statusColor(item.status)} size="small" /></TableCell>
                <TableCell align="center" onClick={(event) => event.stopPropagation()}>
                  <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'center' }}>
                    {item.status === 'draft' && (
                      <>
                        <Tooltip title="Edit">
                          <span><AppButton size="small" variant="outlined" onClick={() => onEdit(item)} startIcon={<EditIcon fontSize="small" />} /></span>
                        </Tooltip>
                        <Tooltip title="Post">
                          <span><AppButton size="small" variant="success" onClick={() => onPost(item)} startIcon={<PostIcon fontSize="small" />} /></span>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <span><AppButton size="small" variant="danger" onClick={() => onDelete(item)} startIcon={<DeleteIcon fontSize="small" />} /></span>
                        </Tooltip>
                      </>
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  )
}
