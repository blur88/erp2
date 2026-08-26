import { useMemo, useRef } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import {
  Box,
  Chip,
  Link,
  Paper,
  Typography,
} from '@mui/material'

import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import PagePagination from '@/components/common/PagePagination'
import SimpleListPage from '@/components/common/SimpleListPage'
import { JOURNAL_SOURCE_TYPE_OPTIONS } from '@/constants/filterOptions'
import { PAGINATION } from '@/constants/tableStyles'
import { useFilterBar } from '@/hooks/useFilterBar'
import {
  useGetAccountsQuery,
  useGetGeneralLedgerQuery,
  type GeneralLedgerQueryParams,
} from '@/store/api/accountingApi'
import type { AccountingSourceType, GeneralLedgerMovement } from '@/types'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { formatCurrency } from '@/utils/currency'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'
import { formatDate } from '@/utils/formatters'
import { useListUrlState } from '@/hooks/useListUrlState'
import { withCurrentListQuery } from '@/utils/listQuery'
import { JOURNAL_ENTRY_ORIGIN_PARAM } from './journal-entry-navigation'
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
  const navigate = useNavigate()
  // Pagination only — no sort config, because the running balance is meaningful
  // only in the backend's canonical chronological order.
  const { page, limit, setPage, setLimit, resetPage } = useListUrlState()
  const listRef = useRef<HTMLDivElement | null>(null)

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
    useFilterBar(filterConfig, { onApply: resetPage })

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

  const glParams: GeneralLedgerQueryParams = {
    accountId: effectiveAccountId,
    page,
    limit,
    ...(dateRange.fromDate ? { fromDate: dateRange.fromDate } : {}),
    ...(dateRange.toDate ? { toDate: dateRange.toDate } : {}),
    ...(appliedFilters.sourceType ? { sourceType: appliedFilters.sourceType } : {}),
  }

  const { data: glData, isFetching, error } = useGetGeneralLedgerQuery(glParams, {
    skip: !effectiveAccountId,
  })

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

  const journalEntryHref = (movement: GeneralLedgerMovement) =>
    withCurrentListQuery(
      `/accounting/journal-entries/${movement.journalEntryId}?${JOURNAL_ENTRY_ORIGIN_PARAM}=general-ledger`,
    )

  const columns: ColumnConfig<GeneralLedgerMovement>[] = [
    { key: 'date', render: (m) => formatDate(m.date) },
    {
      key: 'journalNo',
      raw: true,
      render: (m) => (
        <Link
          component={RouterLink}
          to={journalEntryHref(m)}
          underline="hover"
          // The row is clickable too; without this the link and the row
          // handler would both navigate.
          onClick={(e) => e.stopPropagation()}
        >
          {m.journalNo}
        </Link>
      ),
    },
    { key: 'description', render: (m) => m.description ?? '—' },
    {
      key: 'debit',
      align: 'right',
      render: (m) => (m.debit !== '0.0000' ? formatCurrency(m.debit) : '—'),
    },
    {
      key: 'credit',
      align: 'right',
      render: (m) => (m.credit !== '0.0000' ? formatCurrency(m.credit) : '—'),
    },
    {
      key: 'balance',
      align: 'right',
      raw: true,
      render: (m) => (
        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
          {formatCurrency(m.balance)}
        </Typography>
      ),
    },
    {
      key: 'source',
      raw: true,
      render: (m) => (
        <Box onClick={(e) => e.stopPropagation()} sx={{ display: 'inline-flex' }}>
          <SourceLink
            sourceType={m.sourceType}
            sourceDocumentId={m.sourceDocumentId}
            sourceRef={m.sourceRef}
          />
        </Box>
      ),
    },
  ]

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
      tableSlot={(
        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          {!hasSelection ? (
            <Paper sx={{ p: 6, textAlign: 'center' }}>
              <Typography variant="body1" color="text.secondary">
                Select an account to view ledger movements.
              </Typography>
            </Paper>
          ) : (
            <>
              {summaryStrip}
              <Box sx={{ flex: 1, minHeight: 0 }}>
                <EntityTable
                  rows={glData?.movements ?? []}
                  columns={columns}
                  loading={isFetching}
                  total={glData?.meta.total ?? 0}
                  label="Movements"
                  emptyLabel="movements"
                  showHeader={false}
                  focusedIndex={-1}
                  onSelect={(m) => navigate(journalEntryHref(m))}
                  listRef={listRef}
                  headers={['Date', 'Journal No.', 'Description', 'Debit', 'Credit', 'Balance', 'Source']}
                  paginationSlot={
                    (glData?.meta.total ?? 0) > 0 ? (
                      <PagePagination
                        total={glData!.meta.total}
                        page={page}
                        limit={limit}
                        onPageChange={setPage}
                        onLimitChange={setLimit}
                        pageSizeOptions={PAGINATION.options}
                      />
                    ) : undefined
                  }
                />
              </Box>
            </>
          )}
        </Box>
      )}
    />
  )
}