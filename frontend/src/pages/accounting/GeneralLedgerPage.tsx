import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
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

export default function GeneralLedgerPage() {
  const [accountId, setAccountId] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [sourceType, setSourceType] = useState<AccountingSourceType | ''>('')

  const { data: accountsData } = useGetAccountsQuery({})
  const accounts = accountsData?.data ?? []

  const glParams: Record<string, string> = { accountId }
  if (fromDate) glParams.fromDate = fromDate
  if (toDate) glParams.toDate = toDate
  if (sourceType) glParams.sourceType = sourceType

  const { data: glData, isFetching } = useGetGeneralLedgerQuery(
    glParams as { accountId: string; fromDate?: string; toDate?: string; sourceType?: string },
    { skip: !accountId },
  )

  const hasSelection = Boolean(accountId)

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PageHeader
        variant="workflow"
        title="General Ledger"
        subtitle="View account movements and balances."
      />

      <Box sx={{ flex: 1, overflow: 'auto', p: TABLE_STYLES.cell.padding.px }}>
        {/* Filters */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
            Filters
          </Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                select
                fullWidth
                size="small"
                label="Account"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                required
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
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField
                fullWidth
                size="small"
                label="From Date"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField
                fullWidth
                size="small"
                label="To Date"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 2 }}>
              <TextField
                select
                fullWidth
                size="small"
                label="Source Type"
                value={sourceType}
                onChange={(e) =>
                  setSourceType(e.target.value as AccountingSourceType | '')
                }
              >
                {SOURCE_TYPES.map((st) => (
                  <MenuItem key={st.value} value={st.value}>
                    {st.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>
        </Paper>

        {/* Content */}
        {!hasSelection ? (
          <Paper sx={{ p: 6, textAlign: 'center' }}>
            <Typography variant="body1" color="text.secondary">
              Select an account to view ledger movements.
            </Typography>
          </Paper>
        ) : isFetching && !glData ? (
          <Paper sx={{ p: 6, textAlign: 'center' }}>
            <Typography variant="body1" color="text.secondary">
              Loading...
            </Typography>
          </Paper>
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
