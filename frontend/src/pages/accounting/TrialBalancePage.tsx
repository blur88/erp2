import { useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert,
  Box,
  Chip,
  TableCell,
  TableRow,
  Typography,
} from '@mui/material'

import EntityTable from '@/components/common/EntityTable'
import SimpleListPage from '@/components/common/SimpleListPage'
import { ListSkeleton } from '@/components/common/ListSkeleton'
import { useFilterBar } from '@/hooks/useFilterBar'
import type { FilterBarConfig } from '@/types/filterBar.types'
import { useGetTrialBalanceQuery } from '@/store/api/accountingApi'
import { formatCurrency } from '@/utils/currency'
import { getCurrentDate } from '@/utils/formatters'
import type { TrialBalanceResponse } from '@/types'

/**
 * Lower bound for the General Ledger drill-through range. Not a real filter
 * value the user chose — it stands in for "no start date", which the shared
 * Period filter has no way to express alongside an end date. Any date safely
 * before any posting in the system works; the Unix epoch is the conventional
 * choice.
 */
const GENERAL_LEDGER_DRILLDOWN_FLOOR = '1970-01-01'

interface TBFilters {
  asOfDate: string | null
  showZero: boolean
}

const TB_DEFAULTS: TBFilters = { asOfDate: null, showZero: false }

export default function TrialBalancePage() {
  const navigate = useNavigate()
  const listRef = useRef<HTMLDivElement>(null)

  const filterConfig = useMemo<FilterBarConfig<TBFilters>>(
    () => ({
      fields: [
        {
          field: 'asOfDate',
          label: 'As of Date',
          type: 'date',
          clearTo: getCurrentDate,
        },
        {
          field: 'showZero',
          label: 'Show zero-balance accounts',
          type: 'boolean',
        },
      ],
      defaults: TB_DEFAULTS,
    }),
    [],
  )

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)

  // Trial Balance always needs a date, so an absent or impossible value means
  // today — unlike the General Ledger, where an absent account skips the query.
  // Today is deliberately never written to the URL — a bare URL is the canonical
  // form for "today".
  const effectiveAsOfDate = appliedFilters.asOfDate ?? getCurrentDate()

  const openLedger = (accountId: string) => {
    // The General Ledger uses the shared Period filter, whose only open-ended
    // shape is `custom` — and `custom` serializes its bounds ONLY when both are
    // present (filterBar.url.ts), so a to-date-only drill-through cannot be
    // expressed. Pass an explicit floor far below any bookkeeping date so the
    // range still reads as "everything up to the as-of date".
    const params = new URLSearchParams({
      account: accountId,
      period: 'custom',
      period_from: GENERAL_LEDGER_DRILLDOWN_FLOOR,
      period_to: effectiveAsOfDate,
    })
    navigate(`/accounting/general-ledger?${params.toString()}`)
  }

  const { currentData, isFetching, error, isError } = useGetTrialBalanceQuery(
    { asOfDate: effectiveAsOfDate, showZero: appliedFilters.showZero },
    { refetchOnFocus: true, refetchOnMountOrArgChange: true },
  ) as { currentData: TrialBalanceResponse | undefined; isFetching: boolean; error: unknown; isError: boolean }

  // currentData, never data: RTK Query keeps `data` pointing at the PREVIOUS
  // argument's result while a new one is in flight, which would show another
  // date's totals under the selected date — and would keep showing them if the
  // new request failed. Every visible element below is gated on this one value.
  const trialBalance = currentData as TrialBalanceResponse | undefined

  const rows = useMemo(() => (trialBalance?.rows ?? []).map((r) => ({ ...r, id: r.accountId })), [trialBalance])

  const columns = useMemo(
    () => [
      { key: 'code', render: (row: (typeof rows)[number]) => row.code },
      { key: 'name', render: (row: (typeof rows)[number]) => row.name },
      {
        key: 'debit',
        align: 'right' as const,
        render: (row: (typeof rows)[number]) => (row.debit !== '0.0000' ? formatCurrency(row.debit) : '—'),
      },
      {
        key: 'credit',
        align: 'right' as const,
        render: (row: (typeof rows)[number]) => (row.credit !== '0.0000' ? formatCurrency(row.credit) : '—'),
      },
    ],
    [],
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

  const unbalancedAlert =
    trialBalance && !trialBalance.balanced ? (
      <Alert severity="warning" sx={{ mb: 2 }}>
        The trial balance is not balanced. Difference: {formatCurrency(trialBalance.difference)}
      </Alert>
    ) : null

  const tableFooter = trialBalance ? (
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
      <TableCell align="right">{formatCurrency(trialBalance.totalDebit)}</TableCell>
      <TableCell align="right">{formatCurrency(trialBalance.totalCredit)}</TableCell>
    </TableRow>
  ) : undefined

  const hasError = Boolean(error) || isError

  return (
    <SimpleListPage
      title="Trial Balance"
      subtitle="View account balances for a given date."
      titleBadge={balancedChip}
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={handlers}
      hasActiveFilters={hasActiveFilters}
      isFetching={isFetching}
      error={hasError ? 'Unable to load the trial balance. Please try again.' : null}
      tableSlot={
        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          {isFetching && !trialBalance ? (
            <ListSkeleton rows={8} columns={4} />
          ) : trialBalance ? (
            <>
              {unbalancedAlert}
              {summaryStrip}
              <Box sx={{ flex: 1, minHeight: 0 }}>
                <EntityTable
                  rows={rows}
                  columns={columns}
                  tableFooter={tableFooter}
                  selectableRowRole="link"
                  onSelect={(row) => openLedger(row.accountId)}
                  showHeader={false}
                  headers={['Account Code', 'Name', 'Debit', 'Credit']}
                  focusedIndex={-1}
                  listRef={listRef}
                  loading={isFetching}
                  total={rows.length}
                  label="Accounts"
                  emptyLabel="accounts"
                />
              </Box>
            </>
          ) : null}
        </Box>
      }
    />
  )
}
