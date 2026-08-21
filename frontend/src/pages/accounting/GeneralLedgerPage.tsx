import { useEffect, useMemo, useState } from 'react'
import { DatePicker } from '@mui/x-date-pickers'
import { format, parseISO } from 'date-fns'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import {
  Alert,
  Box,
  Chip,
  Link,
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
import { formatDate, isValidIsoDate, toMuiDatePickerFormat } from '@/utils/formatters'
import SourceLink from './components/SourceLink'

const SOURCE_TYPES: { value: AccountingSourceType | ''; label: string }[] = [
  { value: '', label: 'All Sources' },
  { value: 'SALES_ORDER', label: 'Sales Order' },
  { value: 'PURCHASE_ORDER', label: 'Purchase Order' },
  { value: 'STOCK_ADJUSTMENT', label: 'Stock Adjustment' },
  { value: 'OPENING_BALANCE', label: 'Opening Balance' },
  { value: 'OWNER_EQUITY', label: 'Owner Equity' },
]

const VALID_SOURCE_TYPES = new Set<AccountingSourceType>([
  'SALES_ORDER',
  'PURCHASE_ORDER',
  'STOCK_ADJUSTMENT',
  'OPENING_BALANCE',
  'OWNER_EQUITY',
])

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

  // The pickers are controlled, and MUI X resets every section whenever the
  // committed candidate is not echoed back into `value`. Mid-typing commits
  // are complete-but-implausible (the first year keystroke is e.g. 0002-07-01)
  // and must never reach the URL — the read path would reject them and the
  // cleanup effect below would delete the key, desyncing the value again.
  // So each field keeps a draft that mirrors every commit verbatim, while the
  // URL only ever receives plausible dates. When the URL changes externally
  // (back/forward navigation, cleanup), the draft follows it.
  const [fromDraft, setFromDraft] = useState(effectiveFromDate)
  const [toDraft, setToDraft] = useState(effectiveToDate)
  useEffect(() => {
    setFromDraft(effectiveFromDate)
  }, [effectiveFromDate])
  useEffect(() => {
    setToDraft(effectiveToDate)
  }, [effectiveToDate])

  const storedFormat = useMemo(() => localStorage.getItem('dateFormat') || 'DD/MM/YYYY', [])
  const pickerFormat = useMemo(() => toMuiDatePickerFormat(storedFormat), [storedFormat])

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
      <DatePicker
        label="From Date"
        value={fromDraft ? parseISO(fromDraft) : null}
        format={pickerFormat}
        onChange={(d) => {
          if (!d || Number.isNaN(d.getTime())) {
            setFromDraft('')
            setFilter('fromDate', '')
            return
          }
          const next = format(d, 'yyyy-MM-dd')
          setFromDraft(next)
          if (isValidIsoDate(next)) setFilter('fromDate', next)
        }}
        slotProps={{
          textField: { size: 'small', sx: { flex: '0 0 160px' } },
          field: { clearable: true },
        }}
      />
      <DatePicker
        label="To Date"
        value={toDraft ? parseISO(toDraft) : null}
        format={pickerFormat}
        onChange={(d) => {
          if (!d || Number.isNaN(d.getTime())) {
            setToDraft('')
            setFilter('toDate', '')
            return
          }
          const next = format(d, 'yyyy-MM-dd')
          setToDraft(next)
          if (isValidIsoDate(next)) setFilter('toDate', next)
        }}
        slotProps={{
          textField: {
            size: 'small',
            error: dateRangeInvalid,
            helperText: dateRangeInvalid ? 'To Date is before From Date' : undefined,
            sx: { flex: '0 0 160px' },
          },
          field: { clearable: true },
        }}
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

  const accountBadge = glData ? (
    <Chip
      size="small"
      data-testid="gl-account-badge"
      label={`${glData.account.code} - ${glData.account.name}`}
    />
  ) : undefined

  const summaryStrip = glData ? (
    <Box
      data-testid="gl-summary-strip"
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        columnGap: 3,
        rowGap: 2,
        mb: 2,
      }}
    >
      {[
        { label: 'Opening Balance', value: glData.openingBalance },
        { label: 'Total Debit', value: glData.totalDebit },
        { label: 'Total Credit', value: glData.totalCredit },
        { label: 'Closing Balance', value: glData.closingBalance },
      ].map((item) => (
        <Box key={item.label} sx={{ flex: '1 1 auto', minWidth: 140 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
            {item.label}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
            {formatCurrency(item.value)}
          </Typography>
        </Box>
      ))}
    </Box>
  ) : null

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
        titleBadge={accountBadge}
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
            {summaryStrip}

            {/* Movements Table */}
            <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
              <Table
                size={TABLE_STYLES.size}
                sx={{
                  '& .MuiTableCell-root': {
                    py: TABLE_STYLES.cell.padding.py,
                    px: TABLE_STYLES.cell.padding.px,
                  },
                  '& .MuiTableCell-head': {
                    fontWeight: 600,
                    py: TABLE_STYLES.header.padding.py,
                    backgroundColor: TABLE_STYLES.header.backgroundColor,
                  },
                }}
              >
                <TableHead>
                  <TableRow>
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
                              component={RouterLink}
                              to={`/accounting/journal-entries/${movement.journalEntryId}`}
                              underline="hover"
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

          </>
        ) : null}
      </Box>
    </Box>
  )
}
