import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Alert,
  Box,
  Grid,
  MenuItem,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'

import PageHeader from '@/components/common/PageHeader'
import { ListSkeleton } from '@/components/common/ListSkeleton'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { useGetAccountsQuery, useGetGeneralLedgerQuery } from '@/store/api/accountingApi'
import type { AccountingSourceType } from '@/types'
import { formatCurrency } from '@/utils/currency'
import { formatDate } from '@/utils/formatters'
import SourceLink from './components/SourceLink'

const SOURCE_TYPES: { value: AccountingSourceType | ''; label: string }[] = [
  { value: '', label: 'All Sources' },
  { value: 'SALES_ORDER', label: 'Sales Order' },
  { value: 'PURCHASE_ORDER', label: 'Purchase Order' },
  { value: 'STOCK_ADJUSTMENT', label: 'Stock Adjustment' },
  { value: 'OPENING_BALANCE', label: 'Opening Balance' },
]

const VALID_SOURCE_TYPES = new Set<AccountingSourceType>([
  'SALES_ORDER',
  'PURCHASE_ORDER',
  'STOCK_ADJUSTMENT',
  'OPENING_BALANCE',
])

// Real calendar date, not merely a regex match: 2026-02-31 must be rejected.
function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  )
}

export default function GeneralLedgerPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const rawAccountId = searchParams.get('accountId') ?? ''
  const rawSourceType = searchParams.get('sourceType') ?? ''
  const rawFromDate = searchParams.get('fromDate') ?? ''
  const rawToDate = searchParams.get('toDate') ?? ''

  const { data: accountsData } = useGetAccountsQuery({})
  const accounts = accountsData?.data ?? []
  const accountsLoaded = Boolean(accountsData)

  // Account membership can only be confirmed once accounts have loaded. Until then,
  // and for any id not in the list, the effective account id is '' (GL request skipped).
  const accountIsMember =
    accountsLoaded && accounts.some((acct) => acct.id === rawAccountId)
  const effectiveAccountId = accountIsMember ? rawAccountId : ''

  const effectiveSourceType: AccountingSourceType | '' =
    rawSourceType && VALID_SOURCE_TYPES.has(rawSourceType as AccountingSourceType)
      ? (rawSourceType as AccountingSourceType)
      : ''
  const effectiveFromDate = isValidIsoDate(rawFromDate) ? rawFromDate : ''
  const effectiveToDate = isValidIsoDate(rawToDate) ? rawToDate : ''

  const setFilter = (key: string, value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )
  }

  // Inverted range (from > to): both dates are individually valid but the window is empty.
  // Flag it, and drop toDate from the request rather than send a guaranteed-empty query.
  const dateRangeInvalid =
    Boolean(effectiveFromDate) &&
    Boolean(effectiveToDate) &&
    effectiveFromDate > effectiveToDate

  const glParams: Record<string, string> = { accountId: effectiveAccountId }
  if (effectiveFromDate) glParams.fromDate = effectiveFromDate
  if (effectiveToDate && !dateRangeInvalid) glParams.toDate = effectiveToDate
  if (effectiveSourceType) glParams.sourceType = effectiveSourceType

  const { data: glData, isFetching, error } = useGetGeneralLedgerQuery(
    glParams as { accountId: string; fromDate?: string; toDate?: string; sourceType?: string },
    { skip: !effectiveAccountId },
  )

  const hasSelection = Boolean(effectiveAccountId)

  const filterToolbar = (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 1.5,
        alignItems: 'flex-start',
      }}
    >
      <TextField
        select
        size="small"
        label="Account"
        value={effectiveAccountId}
        onChange={(e) => setFilter('accountId', e.target.value)}
        required
        sx={{ flex: '2 1 260px' }}
      >
        <MenuItem value="">
          <em>Select an account</em>
        </MenuItem>
        {accounts.map((acct) => (
          <MenuItem key={acct.id} value={acct.id}>
            {acct.code} - {acct.name}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        size="small"
        label="From Date"
        type="date"
        value={effectiveFromDate}
        onChange={(e) => setFilter('fromDate', e.target.value)}
        slotProps={{ inputLabel: { shrink: true } }}
        sx={{ flex: '0 0 160px' }}
      />
      <TextField
        size="small"
        label="To Date"
        type="date"
        value={effectiveToDate}
        onChange={(e) => setFilter('toDate', e.target.value)}
        error={dateRangeInvalid}
        helperText={dateRangeInvalid ? 'To Date is before From Date' : undefined}
        slotProps={{ inputLabel: { shrink: true } }}
        sx={{ flex: '0 0 160px' }}
      />
      <TextField
        select
        size="small"
        label="Source Type"
        value={effectiveSourceType}
        onChange={(e) => setFilter('sourceType', e.target.value)}
        sx={{ flex: '1 1 180px' }}
      >
        {SOURCE_TYPES.map((st) => (
          <MenuItem key={st.value} value={st.value}>
            {st.label}
          </MenuItem>
        ))}
      </TextField>
    </Box>
  )

  // Single atomic cleanup: clone once, delete every key that is PRESENT in the URL but whose
  // effective value is empty (covers both invalid values AND present-but-empty keys like
  // `?sourceType=`), plus (only once accounts have loaded) an accountId not in the loaded list.
  // At most one setSearchParams, guarded so it only fires when something changed → no loop.
  // Use searchParams.has(key), NOT truthiness of the raw string, so `?sourceType=` is deleted.
  useEffect(() => {
    const next = new URLSearchParams(searchParams)

    if (searchParams.has('sourceType') && !effectiveSourceType) next.delete('sourceType')
    if (searchParams.has('fromDate') && !effectiveFromDate) next.delete('fromDate')
    if (searchParams.has('toDate') && !effectiveToDate) next.delete('toDate')
    // accountId: preserve while membership is unconfirmed (accounts still loading); once loaded,
    // delete a present accountId that is not a member (or is present-but-empty).
    if (accountsLoaded && searchParams.has('accountId') && !accountIsMember) {
      next.delete('accountId')
    }

    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [
    searchParams,
    effectiveSourceType,
    effectiveFromDate,
    effectiveToDate,
    accountsLoaded,
    accountIsMember,
    setSearchParams,
  ])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PageHeader
        variant="workflow"
        title="General Ledger"
        subtitle="View account movements and balances."
        toolbar={filterToolbar}
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Unable to load the general ledger. Please try again.
        </Alert>
      )}

      <Box sx={{ flex: 1, overflow: 'auto', p: TABLE_STYLES.cell.padding.px }}>
        {/* Content */}
        {!hasSelection ? (
          <Paper sx={{ p: 6, textAlign: 'center' }}>
            <Typography variant="body1" color="text.secondary">
              Select an account to view ledger movements.
            </Typography>
          </Paper>
        ) : isFetching && !glData ? (
          <ListSkeleton rows={8} columns={7} />
        ) : glData ? (
          <>
            {/* Account Info */}
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
                {glData.account.code} - {glData.account.name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Opening Balance: {formatCurrency(glData.openingBalance)}
              </Typography>
            </Paper>

            {/* Movements Table */}
            <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
              <Table size={TABLE_STYLES.size}>
                <TableHead>
                  <TableRow
                    sx={{ '& .MuiTableCell-head': { fontWeight: 600 } }}
                  >
                    <TableCell>Date</TableCell>
                    <TableCell>Journal No.</TableCell>
                    <TableCell>Description</TableCell>
                    <TableCell align="right">Debit</TableCell>
                    <TableCell align="right">Credit</TableCell>
                    <TableCell align="right">Balance</TableCell>
                    <TableCell>Source</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {glData.movements.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center">
                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{ py: 3 }}
                        >
                          No movements found for this account.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    glData.movements.map((movement, idx) => {
                      return (
                        <TableRow
                          key={`${movement.journalEntryId}-${idx}`}
                          hover
                        >
                          <TableCell>{formatDate(movement.date)}</TableCell>
                          <TableCell>
                            <Link
                              to={`/accounting/journal-entries/${movement.journalEntryId}`}
                              style={{ textDecoration: 'none' }}
                            >
                              {movement.journalNo}
                            </Link>
                          </TableCell>
                          <TableCell>{movement.description ?? '—'}</TableCell>
                          <TableCell align="right">
                            {movement.debit !== '0.0000'
                              ? formatCurrency(movement.debit)
                              : '—'}
                          </TableCell>
                          <TableCell align="right">
                            {movement.credit !== '0.0000'
                              ? formatCurrency(movement.credit)
                              : '—'}
                          </TableCell>
                          <TableCell
                            align="right"
                            sx={{ fontWeight: 600 }}
                          >
                            {formatCurrency(movement.balance)}
                          </TableCell>
                          <TableCell>
                            <SourceLink
                              sourceType={movement.sourceType}
                              sourceDocumentId={movement.sourceDocumentId}
                              sourceRef={movement.sourceRef}
                            />
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Summary */}
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Summary
              </Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 6, md: 3 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block' }}
                  >
                    Opening Balance
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {formatCurrency(glData.openingBalance)}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block' }}
                  >
                    Total Debit
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {formatCurrency(glData.totalDebit)}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block' }}
                  >
                    Total Credit
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {formatCurrency(glData.totalCredit)}
                  </Typography>
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block' }}
                  >
                    Closing Balance
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {formatCurrency(glData.closingBalance)}
                  </Typography>
                </Grid>
              </Grid>
            </Paper>
          </>
        ) : null}
      </Box>
    </Box>
  )
}
