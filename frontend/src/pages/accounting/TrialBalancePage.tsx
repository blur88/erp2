import { useState } from 'react'
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
import type { TrialBalanceResponse } from '@/types'

export default function TrialBalancePage() {
  const today = new Date().toISOString().split('T')[0]
  const [asOfDate, setAsOfDate] = useState(today)
  const [showZero, setShowZero] = useState(false)

  const { data, isFetching, error } = useGetTrialBalanceQuery(
    { asOfDate, showZero },
    { skip: false },
  )

  const trialBalance = data as TrialBalanceResponse | undefined
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
          value={asOfDate}
          onChange={(e) => setAsOfDate(e.target.value)}
          size="small"
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={showZero}
              onChange={(e) => setShowZero(e.target.checked)}
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
