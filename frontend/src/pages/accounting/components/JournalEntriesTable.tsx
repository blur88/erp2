import type { RefObject } from 'react'
import { Checkbox, Chip, CircularProgress, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from '@mui/material'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as PostIcon } from '@mui/icons-material/PostAdd'

import { AppButton } from '@/components/common/AppButton'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { JournalEntry, JournalEntryStatus } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

interface Props {
  entries: JournalEntry[]
  loading: boolean
  total: number
  selectedEntryId: string | null
  selectedIds: Set<string>
  onSelect: (entry: JournalEntry) => void
  onToggleCheck: (id: string) => void
  onSelectAll: () => void
  onPost: (entry: JournalEntry) => void
  onDelete: (entry: JournalEntry) => void
  listRef?: RefObject<HTMLDivElement | null>
}

const ENTRY_TYPE_LABELS: Record<string, string> = {
  manual: 'Manual Entry',
  sales_order: 'Sales Order',
  payment: 'Customer Payment',
  settlement: 'Settlement',
  goods_received_note: 'Goods Receipt',
  vendor_payment: 'Vendor Payment',
  stock_adjustment: 'Stock Adjustment',
  owner_equity_transaction: 'Owner Equity',
  expense: 'Expense',
  opening_balance: 'Opening Balance',
  fund_transfer: 'Fund Transfer',
}

function statusColor(status: JournalEntryStatus) {
  if (status === JournalEntryStatus.POSTED) return 'success' as const
  if (status === JournalEntryStatus.REVERSED) return 'error' as const
  return 'default' as const
}

export function JournalEntriesTable({
  entries,
  loading,
  selectedEntryId,
  selectedIds,
  onSelect,
  onToggleCheck,
  onSelectAll,
  onPost,
  onDelete,
  listRef,
}: Props) {
  const selectableEntries = entries.filter((entry) => entry.status === JournalEntryStatus.DRAFT)
  const allSelected = selectableEntries.length > 0 && selectedIds.size === selectableEntries.length
  const someSelected = selectedIds.size > 0 && selectedIds.size < selectableEntries.length

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
              <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">Debits</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="right">Credits</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 600 }} align="center">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                  <CircularProgress />
                </TableCell>
              </TableRow>
            ) : entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">No journal entries found</Typography>
                </TableCell>
              </TableRow>
            ) : entries.map((entry) => (
              <TableRow
                key={entry.id}
                hover
                selected={entry.id === selectedEntryId}
                onClick={() => onSelect(entry)}
                sx={{ cursor: 'pointer', height: TABLE_STYLES.row.height }}
              >
                <TableCell padding="checkbox" onClick={(event) => event.stopPropagation()}>
                  <Checkbox
                    disabled={entry.status !== JournalEntryStatus.DRAFT}
                    checked={selectedIds.has(entry.id)}
                    onChange={() => onToggleCheck(entry.id)}
                  />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 500, color: 'primary.main' }}>
                    {entry.referenceNumber}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{formatDate(entry.entryDate)}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.description}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip label={ENTRY_TYPE_LABELS[entry.sourceType ?? ''] ?? 'Manual Entry'} size="small" />
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2">{formatCurrency(entry.totalDebits)}</Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2">{formatCurrency(entry.totalCredits)}</Typography>
                </TableCell>
                <TableCell>
                  <Chip label={entry.status} color={statusColor(entry.status)} size="small" />
                </TableCell>
                <TableCell align="center" onClick={(event) => event.stopPropagation()}>
                  <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'center' }}>
                    {entry.status === JournalEntryStatus.DRAFT && (
                      <>
                        <Tooltip title="Post">
                          <span>
                            <AppButton size="small" variant="success" onClick={() => onPost(entry)} startIcon={<PostIcon fontSize="small" />} />
                          </span>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <span>
                            <AppButton size="small" variant="danger" onClick={() => onDelete(entry)} startIcon={<DeleteIcon fontSize="small" />} />
                          </span>
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
