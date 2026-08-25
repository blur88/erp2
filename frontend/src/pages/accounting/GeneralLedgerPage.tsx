import { useMemo } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Box,
  Chip,
  Link,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'

import { TableCard } from '@/components/common/TableCard'
import SimpleListPage from '@/components/common/SimpleListPage'
import { ListSkeleton } from '@/components/common/ListSkeleton'
import { JOURNAL_SOURCE_TYPE_OPTIONS } from '@/constants/filterOptions'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useGetAccountsQuery, useGetGeneralLedgerQuery } from '@/store/api/accountingApi'
import type { AccountingSourceType } from '@/types'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { formatCurrency } from '@/utils/currency'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'
import { formatDate } from '@/utils/formatters'
import SourceLink from './components/SourceLink'

interface GLFilters {
  account: string | null
  period: PeriodValue
  sourceType: AccountingSourceType | null
}

const GL_DEFAULTS: GLFilters = {
  account: null,
  period: { key: null, from: null, to: null },
  sourceType: null,
}

export default function GeneralLedgerPage() {
  const { data: accountsData, isFetching: accountsFetching } = useGetAccountsQuery({})
  const accounts = useMemo(() => accountsData?.data ?? [], [accountsData])

  // Query-backed options, so `optionsReady` is REQUIRED (see filterBar.types.ts):
  // while accounts are unresolved the empty array is not authoritative, and an
  // accountId from the URL must be preserved rather than allow-listed away.
  // Once it lands, useFilterBar's revalidation clears an id that is not a member
  // and drops the URL key — replacing this page's former hand-rolled membership
  // check and accountId cleanup effect.
  const accountsReady = Boolean(accountsData)

  const filterConfig = useMemo<FilterBarConfig<GLFilters>>(
    () => ({
      fields: [
        {
          field: 'account',
          label: 'Account',
          type: 'select',
          emptyLabel: 'Select an account',
          minWidth: 240,
          options: accounts.map((acct) => ({
            value: acct.id,
            label: `${acct.code} - ${acct.name}`,
          })),
          optionsReady: accountsReady,
          optionsLoading: accountsFetching,
        },
        { field: 'period', label: 'Period', type: 'period' },
        {
          field: 'sourceType',
          label: 'Source Type',
          type: 'select',
          options: JOURNAL_SOURCE_TYPE_OPTIONS,
        },
      ],
      defaults: GL_DEFAULTS,
    }),
    [accounts, accountsReady, accountsFetching],
  )

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } =
    useFilterBar(filterConfig)

  const weekStartsOn = getStartOfWeek()

  const dateRange = useMemo(() => {
    const period = appliedFilters.period
    if (!period || period.key === null) return { fromDate: undefined, toDate: undefined }
    if (period.key === 'custom') {
      return { fromDate: period.from ?? undefined, toDate: period.to ?? undefined }
    }
    const range = getPeriodDateRange(period.key, weekStartsOn)
    return { fromDate: range.from, toDate: range.to }
  }, [appliedFilters.period, weekStartsOn])

  const effectiveAccountId = appliedFilters.account ?? ''

  const glParams: Record<string, string> = { accountId: effectiveAccountId }
  if (dateRange.fromDate) glParams.fromDate = dateRange.fromDate
  if (dateRange.toDate) glParams.toDate = dateRange.toDate
  if (appliedFilters.sourceType) glParams.sourceType = appliedFilters.sourceType

  const { data: glData, isFetching, error } = useGetGeneralLedgerQuery(
    glParams as { accountId: string; fromDate?: string; toDate?: string; sourceType?: string },
    { skip: !effectiveAccountId },
  )

  const hasSelection = Boolean(effectiveAccountId)

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

  return (
    <SimpleListPage
      title="General Ledger"
      subtitle="View account movements and balances."
      titleBadge={accountBadge}
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={handlers}
      hasActiveFilters={hasActiveFilters}
      isFetching={isFetching}
      error={error ? 'Unable to load the general ledger. Please try again.' : null}
      // General Ledger is a report, not a list: the endpoint returns the whole
      // ledger with a per-row running balance, so there is no pagination and no
      // user-selectable sort (either would break the balance column). The scroll
      // and padding box below is GL's own -- SimpleListPage's tableSlot container
      // does not own overflow (issue #1143).
      tableSlot={(
        <Box sx={{ flex: 1, overflow: 'auto', p: TABLE_STYLES.cell.padding.px }}>
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
              <TableCard sx={{ mb: 3 }}>
                <Table
                  size={TABLE_STYLES.size}
                  sx={{
                    '& .MuiTableCell-root': {
                      py: TABLE_STYLES.cell.padding.py,
                      px: TABLE_STYLES.cell.padding.px,
                    },
                    '& .MuiTableCell-head': {
                      py: TABLE_STYLES.header.padding.py,
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
              </TableCard>

            </>
          ) : null}
        </Box>
      )}
    />
  )
}
