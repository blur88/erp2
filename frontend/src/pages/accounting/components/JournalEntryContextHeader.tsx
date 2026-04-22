import { Box, Chip, Link, Paper, Table, TableBody, TableCell, TableContainer, TableRow, Typography } from '@mui/material'
import Grid from '@mui/material/Grid'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'
import { default as PostIcon } from '@mui/icons-material/PostAdd'
import { default as ReverseIcon } from '@mui/icons-material/Undo'

import { AppButton } from '@/components/common/AppButton'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { JournalEntry, JournalEntryStatus } from '@/types'
import { formatCurrency, formatDate } from '@/utils/formatters'

import { SOURCE_ROUTES } from '../hooks/useJournalEntriesWorkspace'

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

const detailTableSx = {
  tableLayout: 'fixed',
  '& .MuiTableCell-root': {
    border: 'none',
    py: TABLE_STYLES.cell.padding.py,
    px: TABLE_STYLES.cell.padding.px,
    '&:nth-of-type(1)': { width: '40%' },
    '&:nth-of-type(2)': { width: '60%' },
  },
}

const labelCellSx = {
  fontWeight: 600,
  color: 'text.secondary',
  fontSize: '0.8rem',
}

const valueCellSx = {
  fontSize: '0.8rem',
}

const sectionHeaderCellSx = {
  pb: TABLE_STYLES.cell.padding.py * 0.67,
  py: TABLE_STYLES.cell.padding.py * 0.67,
  borderTop: TABLE_STYLES.cell.border,
}

function statusColor(status: JournalEntryStatus) {
  if (status === JournalEntryStatus.POSTED) return 'success' as const
  if (status === JournalEntryStatus.REVERSED) return 'error' as const
  return 'default' as const
}

interface Props {
  selectedEntry: JournalEntry | null
  onEdit: () => void
  onPost: () => void
  onReverse: () => void
  onDelete: () => void
  onViewSource: (sourceType: string, sourceId: string) => void
}

export function JournalEntryContextHeader({
  selectedEntry,
  onEdit,
  onPost,
  onReverse,
  onDelete,
  onViewSource,
}: Props) {
  if (!selectedEntry) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
          Select a journal entry to view details
        </Typography>
      </Paper>
    )
  }

  const isDraft = selectedEntry.status === JournalEntryStatus.DRAFT
  const isPosted = selectedEntry.status === JournalEntryStatus.POSTED
  const isBalanced = Math.abs(selectedEntry.totalDebits - selectedEntry.totalCredits) < 0.01
  const hasSource = selectedEntry.sourceType && selectedEntry.sourceId && SOURCE_ROUTES[selectedEntry.sourceType]

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <Box
        sx={{
          p: TABLE_STYLES.cell.padding.px,
          borderBottom: TABLE_STYLES.cell.border,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Typography
          variant="tableHeader"
          sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
        >
          JE Details - {selectedEntry.referenceNumber}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {isDraft && (
            <>
              <AppButton size="small" variant="outlined" startIcon={<EditIcon />} onClick={onEdit}>
                Edit
              </AppButton>
              <AppButton size="small" variant="success" startIcon={<PostIcon />} onClick={onPost} disabled={!isBalanced}>
                Post
              </AppButton>
              <AppButton size="small" variant="danger" startIcon={<DeleteIcon />} onClick={onDelete}>
                Delete
              </AppButton>
            </>
          )}
          {isPosted && (
            <AppButton size="small" variant="warning" startIcon={<ReverseIcon />} onClick={onReverse}>
              Reverse
            </AppButton>
          )}
        </Box>
      </Box>

      <Box sx={{ p: TABLE_STYLES.cell.padding.px }}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={detailTableSx}>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={2} sx={sectionHeaderCellSx}>
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                        Entry Information
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Date</TableCell>
                    <TableCell sx={valueCellSx}>{formatDate(selectedEntry.entryDate)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Description</TableCell>
                    <TableCell sx={valueCellSx}>{selectedEntry.description}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Type</TableCell>
                    <TableCell sx={valueCellSx}>
                      <Chip
                        size="small"
                        label={ENTRY_TYPE_LABELS[selectedEntry.sourceType ?? ''] ?? 'Manual Entry'}
                      />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Source</TableCell>
                    <TableCell sx={valueCellSx}>
                      {hasSource ? (
                        <Link
                          component="button"
                          variant="body2"
                          onClick={() => onViewSource(selectedEntry.sourceType!, selectedEntry.sourceId!)}
                        >
                          View {ENTRY_TYPE_LABELS[selectedEntry.sourceType!] ?? selectedEntry.sourceType}
                        </Link>
                      ) : '—'}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <TableContainer>
              <Table size={TABLE_STYLES.size} sx={detailTableSx}>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={2} sx={sectionHeaderCellSx}>
                      <Typography variant="h6" sx={{ fontWeight: 600, color: 'primary.main', fontSize: '0.8rem' }}>
                        Financials
                      </Typography>
                    </TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Status</TableCell>
                    <TableCell sx={valueCellSx}>
                      <Chip label={selectedEntry.status} color={statusColor(selectedEntry.status)} size="small" />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={labelCellSx}>Debits</TableCell>
                    <TableCell sx={valueCellSx}>{formatCurrency(selectedEntry.totalDebits)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Credits</TableCell>
                    <TableCell sx={valueCellSx}>{formatCurrency(selectedEntry.totalCredits)}</TableCell>
                  </TableRow>
                  {!isBalanced && (
                    <TableRow>
                      <TableCell sx={labelCellSx}>Balance</TableCell>
                      <TableCell sx={valueCellSx}>
                        <Chip label="Unbalanced" color="warning" size="small" />
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
        </Grid>
      </Box>
    </Paper>
  )
}
