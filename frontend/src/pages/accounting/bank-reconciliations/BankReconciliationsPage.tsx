import { useCallback, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Chip } from '@mui/material'

import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import SimpleListPage from '@/components/common/SimpleListPage'
import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import PagePagination from '@/components/common/PagePagination'
import RowActionMenu from '@/components/common/RowActionMenu'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useNotification } from '@/hooks/useNotification'
import {
  useCancelReopenBankReconciliationMutation,
  useDiscardBankReconciliationMutation,
  useGetAccountsQuery,
  useGetBankReconciliationsQuery,
  useReopenBankReconciliationMutation,
} from '@/store/api/accountingApi'
import type { BankReconciliationDto, BankReconciliationStatus } from '@/types'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { formatCurrency, formatDate } from '@/utils/formatters'
import { reconciliationErrorMessage } from './reconciliationErrorMessage'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'
import { withCurrentListQuery } from '@/utils/listQuery'
import { PAGINATION } from '@/constants/tableStyles'
import {
  CONFIRM_COPY,
  DONE_LABEL,
  availableActions,
  type BankReconciliationActionKey,
} from './bankReconciliationActions'

interface ReconciliationFilters {
  search: string
  bankAccountId: string | null
  period: PeriodValue
  status: BankReconciliationStatus | null
}

type ConfirmedAction = 'discard' | 'reopen' | 'cancelReopen'

const ACTION_LABEL: Record<Exclude<BankReconciliationActionKey, 'complete'>, string> = {
  view: 'View',
  edit: 'Edit',
  discard: 'Discard',
  reopen: 'Reopen',
  cancelReopen: 'Cancel Reopen',
}

export const HEADERS = [
  'Reconciliation No', 'Bank Account', 'From', 'To', 'Closing Balance', 'Difference', 'Status', 'Actions',
]

function getFilterConfig(
  bankOptions: { value: string; label: string }[],
  ready: boolean,
  loading: boolean,
): FilterBarConfig<ReconciliationFilters> {
  return {
    search: { placeholder: 'Search by reconciliation no, bank account...' },
    fields: [
      {
        field: 'bankAccountId', label: 'Bank Account', type: 'select',
        options: bankOptions, optionsReady: ready, optionsLoading: loading,
        emptyLabel: 'All bank accounts',
      },
      { field: 'period', label: 'Period', type: 'period' },
      {
        field: 'status', label: 'Status', type: 'select',
        options: [
          { value: 'DRAFT', label: 'Draft' },
          { value: 'COMPLETED', label: 'Completed' },
        ],
        emptyLabel: 'All statuses',
      },
    ],
  }
}

export default function BankReconciliationsPage() {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState<number>(PAGINATION.defaultPageSize)
  const resetPage = useCallback(() => setPage(1), [])

  const { data: accountsPage, isLoading: accountsLoading } = useGetAccountsQuery({})
  // Filled below from the loaded rows so an account that is no longer flagged
  // stays reachable through the Bank Account filter.
  const [seenAccounts, setSeenAccounts] = useState<Record<string, string>>({})

  const bankOptions = useMemo(() => {
    const byId = new Map<string, string>()
    for (const a of accountsPage?.data ?? []) {
      if (a.isBankAccount) byId.set(a.id, `${a.code} ${a.name}`)
    }
    for (const [id, label] of Object.entries(seenAccounts)) {
      if (!byId.has(id)) byId.set(id, label)
    }
    return [...byId].map(([value, label]) => ({ value, label }))
  }, [accountsPage, seenAccounts])

  const filterConfig = useMemo(
    () => getFilterConfig(bankOptions, !accountsLoading, accountsLoading),
    [bankOptions, accountsLoading],
  )

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } =
    useFilterBar(filterConfig, { onApply: resetPage })

  const weekStartsOn = getStartOfWeek()
  const dateRange = useMemo(() => {
    const period = appliedFilters.period
    if (!period || period.key === null) return { from: undefined, to: undefined }
    if (period.key === 'custom') return { from: period.from ?? undefined, to: period.to ?? undefined }
    const range = getPeriodDateRange(period.key, weekStartsOn)
    return { from: range.from, to: range.to }
  }, [appliedFilters.period, weekStartsOn])

  const { data, isFetching, error } = useGetBankReconciliationsQuery({
    search: appliedFilters.search || undefined,
    bankAccountId: appliedFilters.bankAccountId ?? undefined,
    periodFrom: dateRange.from,
    periodTo: dateRange.to,
    status: appliedFilters.status ?? undefined,
    page,
    limit,
  })

  const rows = data?.data ?? []
  const total = data?.meta.total ?? 0

  // Accounts that appear on a loaded reconciliation join the filter options.
  const missing = rows.filter((r) => seenAccounts[r.bankAccountId] === undefined)
  if (missing.length > 0) {
    setSeenAccounts((prev) => {
      const next = { ...prev }
      for (const r of missing) next[r.bankAccountId] = `${r.bankAccount.code} ${r.bankAccount.name}`
      return next
    })
  }

  const [discard] = useDiscardBankReconciliationMutation()
  const [reopen] = useReopenBankReconciliationMutation()
  const [cancelReopen] = useCancelReopenBankReconciliationMutation()
  const [confirm, setConfirm] = useState<{ action: ConfirmedAction; row: BankReconciliationDto } | null>(null)

  const handleView = useCallback(
    (row: BankReconciliationDto) =>
      navigate(withCurrentListQuery(`/accounting/bank-reconciliations/${row.id}/view`)),
    [navigate],
  )

  function handleAction(key: BankReconciliationActionKey, row: BankReconciliationDto) {
    if (key === 'view') return handleView(row)
    if (key === 'edit') {
      return navigate(withCurrentListQuery(`/accounting/bank-reconciliations/${row.id}/edit`), {
        state: { bankReconciliationEditOrigin: 'list' },
      })
    }
    if (key === 'complete') return handleView(row)
    setConfirm({ action: key, row })
  }

  async function runConfirmed() {
    if (!confirm) return
    const { action, row } = confirm
    const arg = { id: row.id, lockVersion: row.lockVersion }
    try {
      if (action === 'discard') await discard(arg).unwrap()
      if (action === 'reopen') await reopen(arg).unwrap()
      if (action === 'cancelReopen') await cancelReopen(arg).unwrap()
      showSuccess(`${row.reconciliationNo}: ${DONE_LABEL[action]}`)
    } catch (err) {
      showError(reconciliationErrorMessage(err, `Failed to ${CONFIRM_COPY[action].title.replace(/\?$/, '').toLowerCase()}`))
    } finally {
      setConfirm(null)
    }
  }

  const columns: ColumnConfig<BankReconciliationDto>[] = [
    { key: 'reconciliationNo', render: (r) => r.reconciliationNo },
    { key: 'bankAccount', render: (r) => `${r.bankAccount.code} ${r.bankAccount.name}` },
    { key: 'periodFrom', render: (r) => formatDate(r.periodFrom) },
    { key: 'periodTo', render: (r) => formatDate(r.periodTo) },
    {
      key: 'closingBalance', align: 'right',
      render: (r) => <span data-testid="closing-balance">{formatCurrency(r.summary.closingBalance)}</span>,
    },
    {
      key: 'difference', align: 'right',
      render: (r) => <span data-testid="difference">{formatCurrency(r.summary.difference)}</span>,
    },
    {
      key: 'status', raw: true,
      render: (r) => (
        <Box component="span" sx={{ display: 'inline-flex', gap: 1 }}>
          <Chip
            size="small"
            color={r.status === 'COMPLETED' ? 'success' : 'default'}
            label={r.status === 'COMPLETED' ? 'Completed' : 'Draft'}
          />
          {r.reopened && <Chip size="small" color="warning" label="Reopened" />}
        </Box>
      ),
    },
    {
      key: 'actions', raw: true,
      render: (r) => (
        <RowActionMenu
          actions={availableActions(r)
            .filter((k): k is Exclude<BankReconciliationActionKey, 'complete'> => k !== 'complete')
            .map((k) => ({ label: ACTION_LABEL[k], onClick: () => handleAction(k, r) }))}
        />
      ),
    },
  ]

  const copy = CONFIRM_COPY[confirm?.action ?? 'discard']

  return (
    <SimpleListPage
      title="Bank Reconciliations"
      subtitle="Match bank statements to the ledger"
      primaryAction={{
        label: '+ New Reconciliation',
        onClick: () => navigate('/accounting/bank-reconciliations/create'),
      }}
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={handlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={searchInputRef}
      isFetching={isFetching}
      error={error ? 'Failed to load bank reconciliations.' : null}
      tableSlot={
        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <EntityTable
            rows={rows}
            columns={columns}
            loading={isFetching}
            total={total}
            label="Bank Reconciliations"
            emptyLabel="bank reconciliations"
            showHeader={false}
            hasActiveFilters={hasActiveFilters}
            focusedIndex={-1}
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
          title={copy.title}
          message={copy.message}
          confirmText={copy.confirmText}
          severity="warning"
          onConfirm={runConfirmed}
          onCancel={() => setConfirm(null)}
        />
      }
    />
  )
}
