import { Box, Chip, Link, Paper, Stack, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'
import { default as PostIcon } from '@mui/icons-material/PostAdd'
import { default as ReverseIcon } from '@mui/icons-material/Undo'

import { AppButton } from '@/components/common/AppButton'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { JournalEntry, JournalEntryStatus } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

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

const SOURCE_ROUTES: Record<string, (id: string) => string> = {
  sales_order: (id) => `/sales/orders?highlight=${id}`,
  payment: (id) => `/sales/payments?highlight=${id}`,
  goods_received_note: (id) => `/purchasing/goods-received?grnId=${id}`,
  vendor_payment: (id) => `/purchasing/vendor-payments?vpId=${id}`,
  expense: () => `/accounting/expenses`,
  owner_equity_transaction: () => `/accounting/owner-equity`,
  fund_transfer: () => `/accounting/fund-transfers`,
  stock_adjustment: (id) => `/inventory/stock-adjustments/${id}/edit`,
}

interface Props {
  selectedEntry: JournalEntry | null
  onEdit: () => void
  onPost: () => void
  onReverse: () => void
  onDelete: () => void
  onNavigateToSource: (path: string) => void
}

const cellSx = { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px }

function statusColor(status: JournalEntryStatus) {
  if (status === JournalEntryStatus.POSTED) return 'success' as const
  if (status === JournalEntryStatus.REVERSED) return 'error' as const
  return 'default' as const
}

export function JournalEntryContextHeader({ selectedEntry, onEdit, onPost, onReverse, onDelete, onNavigateToSource }: Props) {
  if (!selectedEntry) {
    return (
      <Paper sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">Select a journal entry to view details</Typography>
      </Paper>
    )
  }

  const isDraft = selectedEntry.status === JournalEntryStatus.DRAFT
  const isPosted = selectedEntry.status === JournalEntryStatus.POSTED
  const isBalanced = Math.abs(selectedEntry.totalDebits - selectedEntry.totalCredits) < 0.01

  return (
    <Paper sx={{ p: 0 }}>
      <Box sx={{ px: 2, pt: 1.5, pb: 1, borderBottom: TABLE_STYLES.cell.border }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{selectedEntry.referenceNumber}</Typography>
            <Chip label={selectedEntry.status} color={statusColor(selectedEntry.status)} size="small" />
            {selectedEntry.sourceType && (
              <Chip label={ENTRY_TYPE_LABELS[selectedEntry.sourceType] ?? selectedEntry.sourceType} size="small" variant="outlined" />
            )}
            {!isBalanced && <Chip label="Unbalanced" color="warning" size="small" />}
          </Stack>
          <Stack direction="row" spacing={0.5}>
            {isDraft && (
              <>
                <AppButton size="small" variant="outlined" startIcon={<EditIcon />} onClick={onEdit}>Edit</AppButton>
                <AppButton size="small" variant="success" startIcon={<PostIcon />} onClick={onPost} disabled={!isBalanced}>Post</AppButton>
                <AppButton size="small" variant="danger" startIcon={<DeleteIcon />} onClick={onDelete}>Delete</AppButton>
              </>
            )}
            {isPosted && (
              <AppButton size="small" variant="warning" startIcon={<ReverseIcon />} onClick={onReverse}>Reverse</AppButton>
            )}
          </Stack>
        </Stack>
      </Box>
      <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': cellSx }}>
        <TableBody>
          <TableRow>
            <TableCell sx={{ ...cellSx, color: 'text.secondary', width: 120 }}>Date</TableCell>
            <TableCell>{formatDate(selectedEntry.entryDate)}</TableCell>
            <TableCell sx={{ ...cellSx, color: 'text.secondary', width: 120 }}>Debits</TableCell>
            <TableCell align="right">{formatCurrency(selectedEntry.totalDebits)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell sx={{ ...cellSx, color: 'text.secondary' }}>Description</TableCell>
            <TableCell>{selectedEntry.description}</TableCell>
            <TableCell sx={{ ...cellSx, color: 'text.secondary' }}>Credits</TableCell>
            <TableCell align="right">{formatCurrency(selectedEntry.totalCredits)}</TableCell>
          </TableRow>
          {selectedEntry.sourceType && selectedEntry.sourceId && SOURCE_ROUTES[selectedEntry.sourceType] && (
            <TableRow>
              <TableCell sx={{ ...cellSx, color: 'text.secondary' }}>Source</TableCell>
              <TableCell colSpan={3}>
                <Link
                  component="button"
                  variant="body2"
                  onClick={() => onNavigateToSource(SOURCE_ROUTES[selectedEntry.sourceType!]!(selectedEntry.sourceId!))}
                >
                  View {ENTRY_TYPE_LABELS[selectedEntry.sourceType] ?? selectedEntry.sourceType}
                </Link>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Paper>
  )
}
