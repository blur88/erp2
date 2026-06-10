import { Chip, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableRow, Typography } from '@mui/material'
import Grid from '@mui/material/Grid'
import { useNavigate } from 'react-router-dom'

import { EntityContextHeaderBar } from '@/components/common/EntityContextHeaderBar'
import { StatusChip } from '@/components/common/StatusChip'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { useLazyGetVendorPaymentQuery } from '@/store/api/purchasingApi'
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

const SOURCE_ROUTES: Record<string, (id: string, refNumber?: string) => string> = {
  sales_order: (_id, refNumber) => `/sales/orders/${refNumber ?? _id}/view`,
  purchase_order: (_id, refNumber) => `/purchasing/orders/${refNumber ?? _id}/view`,
  expense: () => `/accounting/expenses`,
  owner_equity_transaction: () => `/accounting/owner-equity`,
  fund_transfer: () => `/accounting/fund-transfers`,
  settlement: (id) => `/accounting/settlements?highlight=${id}`,
  stock_adjustment: (id) => `/inventory/stock-adjustments/${id}/edit`,
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

interface Props {
  selectedEntry: JournalEntry | null
}

export function JournalEntryContextHeader({ selectedEntry }: Props) {
  const navigate = useNavigate()
  const [fetchVendorPayment] = useLazyGetVendorPaymentQuery()

  if (!selectedEntry) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
          Select a journal entry to view details
        </Typography>
      </Paper>
    )
  }

  const hasSource =
    !!selectedEntry.sourceType &&
    selectedEntry.sourceType !== 'manual' &&
    !!selectedEntry.sourceId

  const isReversalEntry = !!selectedEntry.reversalOfId && !!selectedEntry.reversalOf
  const originalEntry = selectedEntry.reversalOf

  const navigateToSource = async (
    sourceType: string | undefined,
    sourceId: string | undefined,
    sourceRefNumber: string | undefined,
  ) => {
    if (!sourceType || !sourceId) return

    if (sourceType === 'vendor_payment') {
      try {
        const payment = await fetchVendorPayment(sourceId).unwrap()
        const orderNumber = payment.purchaseOrder?.orderNumber
        if (orderNumber) {
          navigate(`/purchasing/orders/${orderNumber}/view`)
        }
      } catch {
        // Legacy vendor-payment entries can fail to resolve; leave the link inert.
      }
      return
    }

    const route = SOURCE_ROUTES[sourceType]
    if (route) navigate(route(sourceId, sourceRefNumber))
  }

  const renderSourceValue = (
    sourceType: string | undefined,
    sourceId: string | undefined,
    sourceRefNumber: string | undefined,
  ) => {
    if (!sourceType || !sourceId) {
      return <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>—</Typography>
    }

    const canNavigate = sourceType === 'vendor_payment' || Boolean(SOURCE_ROUTES[sourceType])
    const label = sourceRefNumber ?? sourceId

    if (!canNavigate) {
      return <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>{label}</Typography>
    }

    return (
      <Typography
        component="button"
        onClick={() => {
          void navigateToSource(sourceType, sourceId, sourceRefNumber)
        }}
        sx={{
          fontSize: '0.8rem',
          color: 'primary.main',
          cursor: 'pointer',
          textDecoration: 'none',
          border: 'none',
          background: 'none',
          padding: 0,
        }}
      >
        {label}
      </Typography>
    )
  }

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <EntityContextHeaderBar
        title={`Journal Entry Details - ${selectedEntry.referenceNumber}`}
        statusChip={(
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <StatusChip status={selectedEntry.status} />
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
      <Grid container spacing={3} sx={{ p: TABLE_STYLES.cell.padding.px }}>
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
                  <TableCell sx={labelCellSx}>Entry Type</TableCell>
                  <TableCell sx={valueCellSx}>
                    {ENTRY_TYPE_LABELS[selectedEntry.sourceType ?? ''] ?? 'Manual Entry'}
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
                      References & Amounts
                    </Typography>
                  </TableCell>
                </TableRow>
                {isReversalEntry && (
                  <TableRow sx={{ backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Reversal of</TableCell>
                    <TableCell sx={valueCellSx}>
                      {renderSourceValue(
                        originalEntry?.sourceType,
                        originalEntry?.sourceId,
                        originalEntry?.referenceNumber,
                      )}
                    </TableCell>
                  </TableRow>
                )}
                {hasSource && (
                  <TableRow sx={isReversalEntry ? {} : { backgroundColor: 'grey.50' }}>
                    <TableCell sx={labelCellSx}>Source</TableCell>
                    <TableCell sx={valueCellSx}>
                      {renderSourceValue(
                        selectedEntry.sourceType,
                        selectedEntry.sourceId,
                        selectedEntry.sourceRefNumber,
                      )}
                    </TableCell>
                  </TableRow>
                )}
                <TableRow sx={hasSource ? {} : { backgroundColor: 'grey.50' }}>
                  <TableCell sx={labelCellSx}>Debits</TableCell>
                  <TableCell sx={valueCellSx}>{formatCurrency(selectedEntry.totalDebits)}</TableCell>
                </TableRow>
                <TableRow sx={hasSource ? { backgroundColor: 'grey.50' } : {}}>
                  <TableCell sx={labelCellSx}>Credits</TableCell>
                  <TableCell sx={valueCellSx}>{formatCurrency(selectedEntry.totalCredits)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Grid>
      </Grid>
    </Paper>
  )
}
