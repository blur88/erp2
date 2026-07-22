import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Alert,
  Box,
  Checkbox,
  Chip,
  FormControlLabel,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'

import PageHeader from '@/components/common/PageHeader'
import { ListSkeleton } from '@/components/common/ListSkeleton'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { useGetTrialBalanceQuery } from '@/store/api/accountingApi'
import { formatCurrency } from '@/utils/currency'
import { getCurrentDate, isValidIsoDate } from '@/utils/formatters'
import type { TrialBalanceResponse } from '@/types'

export default function TrialBalancePage() {
  const [searchParams, setSearchParams] = useSearchParams()

  const rawAsOfDate = searchParams.get('asOfDate') ?? ''
  // Trial Balance always needs a date, so an absent or impossible value means
  // today — unlike the General Ledger, where an absent account skips the query.
  const effectiveAsOfDate = isValidIsoDate(rawAsOfDate) ? rawAsOfDate : getCurrentDate()
  // Only the exact string 'true' is truthy. Anything else (?showZero=1, an empty
  // value) is false and gets cleaned out of the URL below.
  const showZero = searchParams.get('showZero') === 'true'

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

  // Single atomic cleanup: delete every key PRESENT in the URL whose effective
  // value is empty or invalid. Guarded on a real string difference so it cannot
  // loop. Uses searchParams.has(key), not truthiness of the raw value, so
  // `?showZero=` is deleted too. Today's date is deliberately never written —
  // a bare URL is the canonical form for "today".
  useEffect(() => {
    const next = new URLSearchParams(searchParams)

    if (searchParams.has('asOfDate') && !isValidIsoDate(rawAsOfDate)) {
      next.delete('asOfDate')
    }
    if (searchParams.has('showZero') && searchParams.get('showZero') !== 'true') {
      next.delete('showZero')
    }

    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, rawAsOfDate, setSearchParams])

  const { currentData, isFetching, error } = useGetTrialBalanceQuery(
    { asOfDate: effectiveAsOfDate, showZero },
    { refetchOnFocus: true, refetchOnMountOrArgChange: true },
  )

  // currentData, never data: RTK Query keeps `data` pointing at the PREVIOUS
  // argument's result while a new one is in flight, which would show another
  // date's totals under the selected date — and would keep showing them if the
  // new request failed. Every visible element below is gated on this one value.
  const trialBalance = currentData as TrialBalanceResponse | undefined

  const filterToolbar = (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 1.5,
        alignItems: 'center',
      }}
    >
      <TextField
        size="small"
        label="As of Date"
        type="date"
        value={effectiveAsOfDate}
        onChange={(e) => setFilter('asOfDate', e.target.value)}
        slotProps={{ inputLabel: { shrink: true } }}
        sx={{ flex: '0 0 160px' }}
      />
      <FormControlLabel
        control={
          <Checkbox
            checked={showZero}
            onChange={(e) => setFilter('showZero', e.target.checked ? 'true' : '')}
          />
        }
        label="Show zero-balance accounts"
      />
    </Box>
  )

  const balancedChip = trialBalance ? (
    <Chip
      size="small"
      data-testid="tb-balanced-chip"
      color={trialBalance.balanced ? 'success' : 'warning'}
      label={trialBalance.balanced ? 'Balanced' : 'Unbalanced'}
    />
  ) : undefined

  const summaryStrip = trialBalance ? (
    <Box
      data-testid="tb-summary-strip"
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        columnGap: 3,
        rowGap: 2,
        mb: 2,
      }}
    >
      {[
        { label: 'Total Debit', value: trialBalance.totalDebit },
        { label: 'Total Credit', value: trialBalance.totalCredit },
        // No Math.abs: the sign is the API's, and it tells the reader which
        // side the books are out on.
        { label: 'Difference', value: trialBalance.difference },
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

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PageHeader
        variant="workflow"
        title="Trial Balance"
        subtitle="View account balances for a given date."
        toolbar={filterToolbar}
        titleBadge={balancedChip}
      />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Unable to load the trial balance. Please try again.
        </Alert>
      )}

      {trialBalance && !trialBalance.balanced && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          The trial balance is not balanced. Difference:{' '}
          {formatCurrency(trialBalance.difference)}
        </Alert>
      )}

      <Box sx={{ flex: 1, overflow: 'auto', p: TABLE_STYLES.cell.padding.px }}>
        {isFetching && !trialBalance ? (
          <ListSkeleton rows={8} columns={4} />
        ) : trialBalance ? (
          <>
            {summaryStrip}

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
                    <TableCell>Account Code</TableCell>
                    <TableCell>Name</TableCell>
                    <TableCell align="right">Debit</TableCell>
                    <TableCell align="right">Credit</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {trialBalance.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} align="center">
                        <Typography variant="body2" color="text.secondary" sx={{ py: 3 }}>
                          No accounts found.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    trialBalance.rows.map((row) => (
                      <TableRow key={row.code} hover>
                        <TableCell>{row.code}</TableCell>
                        <TableCell>{row.name}</TableCell>
                        <TableCell align="right">
                          {row.debit !== '0.0000' ? formatCurrency(row.debit) : '—'}
                        </TableCell>
                        <TableCell align="right">
                          {row.credit !== '0.0000' ? formatCurrency(row.credit) : '—'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
                {trialBalance.rows.length > 0 && (
                  <TableFooter>
                    <TableRow
                      sx={{
                        '& td': {
                          borderTop: 2,
                          borderTopColor: 'divider',
                          fontWeight: 700,
                          color: 'text.primary',
                          fontSize: '0.875rem',
                        },
                      }}
                    >
                      <TableCell colSpan={2}>Total</TableCell>
                      <TableCell align="right">
                        {formatCurrency(trialBalance.totalDebit)}
                      </TableCell>
                      <TableCell align="right">
                        {formatCurrency(trialBalance.totalCredit)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </TableContainer>
          </>
        ) : null}
      </Box>
    </Box>
  )
}
