import { Link, Paper, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material'
import { Chip, Stack } from '@mui/material'

import { EntityContextHeaderBar } from '@/components/common/EntityContextHeaderBar'
import { EntityStatusChip } from '@/components/common/EntityStatusChip'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { JournalEntry } from '@/types'
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

const labelSx = { fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem', width: 120, border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px }
const valueSx = { fontSize: '0.8rem', border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px }

interface Props {
  selectedEntry: JournalEntry | null
  onNavigateToSource: (path: string) => void
}

export function JournalEntryContextHeader({ selectedEntry, onNavigateToSource }: Props) {
  if (!selectedEntry) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
          Select a journal entry to view details
        </Typography>
      </Paper>
    )
  }

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <EntityContextHeaderBar
        title={selectedEntry.referenceNumber}
        statusChip={(
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <EntityStatusChip status={selectedEntry.status} />
            {selectedEntry.sourceType && (
              <Chip
                label={ENTRY_TYPE_LABELS[selectedEntry.sourceType] ?? selectedEntry.sourceType}
                size="small"
                variant="outlined"
              />
            )}
          </Stack>
        )}
      />
      <Table size={TABLE_STYLES.size} sx={{ '& .MuiTableCell-root': { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px } }}>
        <TableBody>
          <TableRow>
            <TableCell sx={labelSx}>Date</TableCell>
            <TableCell sx={valueSx}>{formatDate(selectedEntry.entryDate)}</TableCell>
            <TableCell sx={labelSx}>Debits</TableCell>
            <TableCell sx={{ ...valueSx, textAlign: 'right' }}>{formatCurrency(selectedEntry.totalDebits)}</TableCell>
          </TableRow>
          <TableRow>
            <TableCell sx={labelSx}>Description</TableCell>
            <TableCell sx={valueSx}>{selectedEntry.description}</TableCell>
            <TableCell sx={labelSx}>Credits</TableCell>
            <TableCell sx={{ ...valueSx, textAlign: 'right' }}>{formatCurrency(selectedEntry.totalCredits)}</TableCell>
          </TableRow>
          {selectedEntry.sourceType && selectedEntry.sourceId && SOURCE_ROUTES[selectedEntry.sourceType] && (
            <TableRow>
              <TableCell sx={labelSx}>Source</TableCell>
              <TableCell colSpan={3} sx={valueSx}>
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
