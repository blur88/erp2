import { useCallback, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box } from '@mui/material'

import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import SimpleListPage from '@/components/common/SimpleListPage'
import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import PagePagination from '@/components/common/PagePagination'
import RowActionMenu from '@/components/common/RowActionMenu'
import { StatusChip } from '@/components/common/StatusChip'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useNotification } from '@/hooks/useNotification'
import {
  useGetProviderSettlementsQuery,
  useDiscardProviderSettlementMutation,
  usePostProviderSettlementMutation,
  useReverseProviderSettlementMutation,
  useGetPaymentMethodMappingsQuery,
} from '@/store/api/accountingApi'
import type { ProviderSettlement, ProviderSettlementStatus } from '@/types'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { formatCurrency, formatDate } from '@/utils/formatters'
import { rtkErrorMessage } from '@/utils/errorMessage'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'
import { PAGINATION } from '@/constants/tableStyles'
import { getProviderSettlementActionMetas } from './providerSettlementActions'

interface SettlementFilters {
  search: string
  period: PeriodValue
  providerPaymentMethodId: string | null
  status: ProviderSettlementStatus | null
}

// Shape from ExpensesPage.tsx:49-70.
function getFilterConfig(
  providerOptions: { value: string; label: string }[],
  providersReady: boolean,
  providersLoading: boolean,
): FilterBarConfig<SettlementFilters> {
  return {
    search: { placeholder: 'Search by reference, provider reference...' },
    fields: [
      { field: 'period', label: 'Period', type: 'period' },
      {
        field: 'providerPaymentMethodId', label: 'Provider', type: 'select',
        options: providerOptions,
        optionsReady: providersReady,
        optionsLoading: providersLoading,
        emptyLabel: 'All providers',
      },
      {
        field: 'status', label: 'Status', type: 'select',
        options: [
          { value: 'DRAFT', label: 'Draft' },
          { value: 'POSTED', label: 'Posted' },
          { value: 'REVERSED', label: 'Reversed' },
        ],
        emptyLabel: 'All statuses',
      },
    ],
  }
}

// ConfirmationDialog requires `message` (ConfirmationDialog.tsx:16); title
// alone does not compile. Each action says what it will actually do, because
// all three are hard to undo from the list.
const CONFIRM_COPY = {
  post: {
    title: 'Post settlement?',
    message:
      'Posting creates the journal entry and makes this settlement immutable. ' +
      'It can afterwards only be reversed, not edited.',
    confirmText: 'Post',
  },
  discard: {
    title: 'Discard draft?',
    message:
      'This deletes the draft and releases its claimed payments. This cannot be undone.',
    confirmText: 'Discard',
  },
  reverse: {
    title: 'Reverse settlement?',
    message:
      'This creates a reversing journal entry and releases the claimed payments. ' +
      'The original entry is preserved.',
    confirmText: 'Reverse',
  },
} as const

export const HEADERS = [
  'Settlement No', 'Settlement Date', 'Provider', 'Provider Reference',
  'Provider Clearing Account', 'Bank Account', 'Settlement Amount',
  'Status', 'Actions',
]

export default function ProviderSettlementsPage() {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState<number>(PAGINATION.defaultPageSize)
  const resetPage = useCallback(() => setPage(1), [])

  // Only mapped methods can own a settlement, so only they can filter one.
  const { data: mappings, isLoading: mappingsLoading } = useGetPaymentMethodMappingsQuery()
  const providerOptions = useMemo(
    () =>
      (mappings ?? [])
        .filter((m) => m.status === 'mapped')
        .map((m) => ({ value: m.paymentMethodId, label: m.paymentMethodName })),
    [mappings],
  )
  const filterConfig = useMemo(
    () => getFilterConfig(providerOptions, !mappingsLoading, mappingsLoading),
    [providerOptions, mappingsLoading],
  )

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } =
    useFilterBar(filterConfig, { onApply: resetPage })

  // getPeriodDateRange takes a PeriodKey (dateRange.ts:23), but
  // appliedFilters.period is a PeriodValue — an object carrying `key` plus
  // custom `from`/`to`. Unwrap it exactly as ExpensesPage.tsx:123-131 does;
  // passing the PeriodValue straight in is a type error.
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

  const { data, isFetching, error } = useGetProviderSettlementsQuery({
    search: appliedFilters.search || undefined,
    startDate: dateRange.fromDate,
    endDate: dateRange.toDate,
    providerPaymentMethodId: appliedFilters.providerPaymentMethodId ?? undefined,
    status: appliedFilters.status ?? undefined,
    page,
    limit,
  })

  const rows = data?.data ?? []
  const total = data?.meta.total ?? 0

  const [discard] = useDiscardProviderSettlementMutation()
  const [postSettlement] = usePostProviderSettlementMutation()
  const [reverse] = useReverseProviderSettlementMutation()
  const [confirm, setConfirm] = useState<
    { action: 'post' | 'discard' | 'reverse'; row: ProviderSettlement } | null
  >(null)

  const handleView = useCallback(
    (row: ProviderSettlement) =>
      navigate(`/accounting/provider-settlements/${row.id}/view`),
    [navigate],
  )

  function handleAction(key: string, row: ProviderSettlement) {
    if (key === 'view') return handleView(row)
    if (key === 'edit') return navigate(`/accounting/provider-settlements/${row.id}/edit`)
    // Post, discard and reverse each move money or destroy work — confirm first.
    setConfirm({ action: key as 'post' | 'discard' | 'reverse', row })
  }

  async function runConfirmed() {
    if (!confirm) return
    const { action, row } = confirm
    try {
      if (action === 'post') await postSettlement(row.id).unwrap()
      if (action === 'discard') await discard(row.id).unwrap()
      if (action === 'reverse') await reverse(row.id).unwrap()
      showSuccess(`Settlement ${row.referenceNumber} ${action}ed`)
    } catch (err) {
      showError(rtkErrorMessage(err, `Failed to ${action} settlement`))
    } finally {
      setConfirm(null)
    }
  }

  // ColumnConfig uses `key`, not `id`/`label`; headers are passed separately.
  // Amounts are decimal STRINGS from the API — formatCurrency takes them
  // directly. fromScaledAmount is for bigint minor units only.
  const columns: ColumnConfig<ProviderSettlement>[] = [
    // Generated by the shared Document Numbers flow and persisted on the
    // entity — render it verbatim, never reformat or derive it here.
    { key: 'referenceNumber', render: (r) => r.referenceNumber },
    { key: 'settlementDate', render: (r) => formatDate(r.settlementDate) },
    { key: 'provider', render: (r) => r.providerPaymentMethod?.name ?? '—' },
    { key: 'providerReference', render: (r) => r.providerReference ?? '—' },
    {
      key: 'clearingAccount',
      render: (r) =>
        r.clearingAccount ? `${r.clearingAccount.code} ${r.clearingAccount.name}` : '—',
    },
    {
      key: 'bankAccount',
      render: (r) => (r.bankAccount ? `${r.bankAccount.code} ${r.bankAccount.name}` : '—'),
    },
    {
      key: 'settlementAmount', align: 'right',
      render: (r) => (
        <span data-testid="settlement-amount">{formatCurrency(r.settlementAmount)}</span>
      ),
    },
    // `raw` skips EntityTable's Typography wrapper: a Chip is a <div> and
    // cannot nest inside that wrapper's <p>.
    { key: 'status', raw: true, render: (r) => <StatusChip status={r.status} /> },
    {
      key: 'actions', raw: true,
      render: (r) => (
        <RowActionMenu
          actions={getProviderSettlementActionMetas(r.status).map((m) => ({
            ...m,
            onClick: () => handleAction(m.key, r),
          }))}
        />
      ),
    },
  ]

  return (
    <SimpleListPage
      title="Provider Settlements"
      subtitle="Clear provider balances to a bank account"
      primaryAction={{
        label: '+ New Settlement',
        onClick: () => navigate('/accounting/provider-settlements/create'),
      }}
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={handlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={searchInputRef}
      isFetching={isFetching}
      error={error ? 'Failed to load provider settlements.' : null}
      tableSlot={
        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <EntityTable
            rows={rows}
            columns={columns}
            loading={isFetching}
            total={total}
            label="Provider Settlements"
            emptyLabel="provider settlements"
            showHeader={false}
            hasActiveFilters={hasActiveFilters}
            focusedIndex={-1}
            // A real handler. NEVER `onSelect={() => {}}` — a no-op makes row
            // clicks silently dead while the action menu keeps working, so the
            // breakage looks like styling.
            onSelect={handleView}
            listRef={searchInputRef}
            headers={HEADERS}
            paginationSlot={
              total > 0 ? (
                <PagePagination
                  total={total}
                  page={page}
                  limit={limit}
                  onPageChange={setPage}
                  onLimitChange={setLimit}
                />
              ) : undefined
            }
          />
        </Box>
      }
      dialogs={
        <ConfirmationDialog
          open={confirm !== null}
          title={CONFIRM_COPY[confirm?.action ?? 'post'].title}
          message={CONFIRM_COPY[confirm?.action ?? 'post'].message}
          confirmText={CONFIRM_COPY[confirm?.action ?? 'post'].confirmText}
          severity={confirm?.action === 'post' ? 'info' : 'warning'}
          onConfirm={runConfirmed}
          onCancel={() => setConfirm(null)}
        />
      }
    />
  )
}
