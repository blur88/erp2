import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Alert,
  Box,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material'
import PageHeader from '@/components/common/PageHeader'
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

  const { data, currentData, isFetching, error } = useGetTrialBalanceQuery(
    { asOfDate: effectiveAsOfDate, showZero },
    { refetchOnFocus: true, refetchOnMountOrArgChange: true },
  )

  // currentData, never data: RTK Query keeps `data` pointing at the PREVIOUS
  // argument's result while a new one is in flight, which would show another
  // date's totals under the selected date.
  void data
  const trialBalance = currentData as TrialBalanceResponse | undefined
  const hasError = Boolean(error)

  return (
    <Box>
      <PageHeader
        title="Trial Balance"
        subtitle="View account balances for a given date."
      />

      <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          label="As of Date"
          type="date"
          value={effectiveAsOfDate}
          onChange={(e) => setFilter('asOfDate', e.target.value)}
          size="small"
          slotProps={{ inputLabel: { shrink: true } }}
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

      {hasError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Failed to load trial balance.
        </Alert>
      )}

      {isFetching && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}

      {trialBalance && !isFetching && (
        <>
          {!trialBalance.balanced && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              The trial balance is not balanced. Difference: {formatCurrency(trialBalance.difference)}
            </Alert>
          )}

          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Account Code</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    Debit
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    Credit
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {trialBalance.rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      align="center"
                      sx={{ py: 3, color: 'text.secondary' }}
                    >
                      No accounts found.
                    </TableCell>
                  </TableRow>
                )}
                {trialBalance.rows.map((row) => (
                  <TableRow key={row.code}>
                    <TableCell>{row.code}</TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell align="right">
                      {row.debit !== '0.0000' ? formatCurrency(row.debit) : '—'}
                    </TableCell>
                    <TableCell align="right">
                      {row.credit !== '0.0000' ? formatCurrency(row.credit) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
                {trialBalance.rows.length > 0 && (
                  <>
                    <TableRow
                      sx={{
                        '& td': {
                          borderTop: 2,
                          borderTopColor: 'divider',
                          fontWeight: 700,
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
                    <TableRow>
                      <TableCell colSpan={2} />
                      <TableCell
                        colSpan={2}
                        align="right"
                        sx={{ fontStyle: 'italic', color: 'text.secondary' }}
                      >
                        Difference: {formatCurrency(trialBalance.difference)}
                      </TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Box>
  )
}
