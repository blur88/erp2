import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Box, Button } from '@mui/material'
import { skipToken } from '@reduxjs/toolkit/query'

import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import SimpleListPage from '@/components/common/SimpleListPage'
import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import PagePagination from '@/components/common/PagePagination'
import RefundDialog, { type RefundSeed } from '@/components/common/RefundDialog'
import { StatusChip } from '@/components/common/StatusChip'
import RowActionMenu, { type RowAction } from '@/components/common/RowActionMenu'
import { useExpenseAccountOptions } from '@/hooks/useExpenseAccountOptions'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useListUrlState } from '@/hooks/useListUrlState'
import { useNotification } from '@/hooks/useNotification'
import {
  useCancelExpenseMutation,
  useUncancelExpenseMutation,
  useGetExpensesQuery,
  useGetExpenseQuery,
  usePayExpenseMutation,
  useRefundExpenseMutation,
  type ExpenseListParams,
} from '@/store/api/accountingApi'
import {
  useGetActivePaymentMethodsQuery,
  useGetActivePaymentMethodsForPurchasesQuery,
} from '@/store/api/paymentMethodsApi'
import { formatCurrency, toScaledAmount, fromScaledAmount } from '@/utils/currency'
import { withListQuery } from '@/utils/listQuery'
import { formatDate } from '@/utils/formatters'
import { rtkErrorMessage } from '@/utils/errorMessage'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'
import { PAGINATION } from '@/constants/tableStyles'
import { getExpenseActionMetas } from '@/pages/accounting/expenses/expenseActions'
import PaymentDialog from '@/components/common/PaymentDialog'
import type { Expense, ExpenseDocumentStatus, ExpensePaymentStatus } from '@/types'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'

interface ExpenseFilters {
  search: string
  period: PeriodValue
  expenseAccountId: string | null
  paymentStatus: ExpensePaymentStatus | null
  documentStatus: ExpenseDocumentStatus | null
}

function getFilterConfig(
  accountOptions: { value: string; label: string }[],
  accountsReady: boolean,
  accountsLoading: boolean,
): FilterBarConfig<ExpenseFilters> {
  return {
    search: { placeholder: 'Search by expense no., description...' },
    fields: [
      { field: 'period', label: 'Period', type: 'period' },
      { field: 'expenseAccountId', label: 'Account', type: 'select',
        options: accountOptions,
        optionsReady: accountsReady,
        optionsLoading: accountsLoading,
        emptyLabel: 'All accounts' },
      { field: 'paymentStatus', label: 'Payment', type: 'payment-status', valueCase: 'upper' },
      { field: 'documentStatus', label: 'Status', type: 'select',
        options: [
          { value: 'DRAFT', label: 'Draft' },
          { value: 'COMPLETED', label: 'Completed' },
          { value: 'CANCELLED', label: 'Cancelled' },
        ] as const },
    ],
    defaults: {
      search: '',
      period: { key: null, from: null, to: null },
      expenseAccountId: null,
      paymentStatus: null,
      documentStatus: null,
    },
  }
}

// Sorting matches the Sales/Purchase Order list pattern: one fixed field with a
// direction toggle in the filter bar, no field picker. Const, not state, because
// ExpenseListParams.sortBy is a literal union that useState would widen to string.
const EXPENSE_SORT_FIELD = 'expenseNumber' as const

export default function ExpensesPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const { page, limit, sortBy, sortOrder, setPage, setLimit, setSort, resetPage } =
    useListUrlState({
      sort: {
        fields: [EXPENSE_SORT_FIELD],
        defaultField: EXPENSE_SORT_FIELD,
        defaultOrder: 'desc',
      },
    })
  const [payExpenseRow, setPayExpenseRow] = useState<Expense | null>(null)
  const [refundExpenseRow, setRefundExpenseRow] = useState<Expense | null>(null)
  const [cancelExpenseRow, setCancelExpenseRow] = useState<Expense | null>(null)
  const [uncancelExpenseRow, setUncancelExpenseRow] = useState<Expense | null>(null)

  const { showSuccess, showError } = useNotification()

  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const {
    options: accountOptions,
    isReady: accountsReady,
    isLoading: accountsLoading,
  } = useExpenseAccountOptions()

  const filterConfig = useMemo(
    () => getFilterConfig(accountOptions, accountsReady, accountsLoading),
    [accountOptions, accountsReady, accountsLoading],
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

  const queryParams = useMemo(() => {
    const params: ExpenseListParams = {
      page,
      limit,
      sortBy,
      sortOrder: sortOrder.toUpperCase() as 'ASC' | 'DESC',
    }
    const search = appliedFilters.search.trim()
    if (search) params.search = search
    if (appliedFilters.expenseAccountId) params.expenseAccountId = appliedFilters.expenseAccountId
    if (appliedFilters.paymentStatus) params.paymentStatus = appliedFilters.paymentStatus
    if (appliedFilters.documentStatus) params.documentStatus = appliedFilters.documentStatus
    if (dateRange.fromDate) params.fromDate = dateRange.fromDate
    if (dateRange.toDate) params.toDate = dateRange.toDate
    return params
  }, [page, limit, appliedFilters, dateRange, sortBy, sortOrder])

  const { data: response, isFetching, error } = useGetExpensesQuery(queryParams)
  const rows = response?.data ?? []
  const total = response?.meta?.total ?? 0

  const [doPayExpense] = usePayExpenseMutation()
  const [doRefundExpense] = useRefundExpenseMutation()
  const [doCancelExpense, { isLoading: isCancelling }] = useCancelExpenseMutation()
  const [doUncancelExpense, { isLoading: isUncancelling }] = useUncancelExpenseMutation()

  const { data: paymentMethods = [], isLoading: methodsLoading } =
    useGetActivePaymentMethodsForPurchasesQuery(undefined, { skip: !payExpenseRow })

  // Refunds may use ANY active method regardless of useForPurchases (#1096),
  // so this is a second, unfiltered query — it cannot share the Pay one.
  const { data: refundMethods = [], isLoading: refundMethodsLoading } =
    useGetActivePaymentMethodsQuery(undefined, { skip: !refundExpenseRow })

  const { data: cancelExpenseDetail } = useGetExpenseQuery(
    cancelExpenseRow ? cancelExpenseRow.id : skipToken,
  )

  // List rows carry no payments — the refund dialog needs the detail record.
  // currentData (not data) so a previously viewed expense's cache can never
  // leak into another row's refund dialog; guard the id to be safe.
  const {
    currentData: refundExpenseData,
    isLoading: refundDetailLoading,
    isError: refundDetailError,
  } = useGetExpenseQuery(refundExpenseRow ? refundExpenseRow.id : skipToken)
  const refundExpenseDetail =
    refundExpenseRow && refundExpenseData?.id === refundExpenseRow.id
      ? refundExpenseData
      : undefined

  useEffect(() => {
    if (refundExpenseRow && refundDetailError) {
      showError('Failed to load expense payments for refund')
      setRefundExpenseRow(null)
    }
  }, [refundExpenseRow, refundDetailError, showError])

  // An Edit that started from this list hands the row back in location.state.
  // Copy it into local state and drop it from history immediately: the tint is a
  // one-shot confirmation of the return trip, not persistent list state, so it
  // must not survive a reload or a Back/Forward into this entry. The replace
  // target keeps location.search so clearing can't discard query parameters.
  const highlightExpenseId = (location.state as { highlightExpenseId?: string } | null)
    ?.highlightExpenseId

  useEffect(() => {
    if (!highlightExpenseId) return
    setHighlightId(highlightExpenseId)
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
  }, [highlightExpenseId, location.pathname, location.search, navigate])

  // Per-method NET capacity for the refund preset: gross payments minus prior
  // refunds through the same method (refunds are negative rows on the same
  // paymentMethodId). Sum ALL signed rows first, then emit only methods with a
  // positive balance — a cross-method refund can drive one negative, which is
  // not a valid preset line (#1107).
  const seedAllocations: RefundSeed[] = useMemo(() => {
    const netByMethod = new Map<string, bigint>()
    for (const p of refundExpenseDetail?.payments ?? []) {
      netByMethod.set(
        p.paymentMethodId,
        (netByMethod.get(p.paymentMethodId) ?? 0n) + (toScaledAmount(p.amount) ?? 0n),
      )
    }
    return [...netByMethod]
      .filter(([, amount]) => amount > 0n)
      .map(([methodId, amount]) => ({ methodId, amount: fromScaledAmount(amount) }))
  }, [refundExpenseDetail])

  const netPaidMinor = useMemo(
    () => (refundExpenseDetail?.payments ?? []).reduce((s, p) => s + (toScaledAmount(p.amount) ?? 0n), 0n),
    [refundExpenseDetail],
  )
  const availableForRefund = fromScaledAmount(netPaidMinor > 0n ? netPaidMinor : 0n)
  const surplusMinor = netPaidMinor - (toScaledAmount(refundExpenseDetail?.totalAmount ?? '0') ?? 0n)
  const seedTarget = fromScaledAmount(
    surplusMinor > 0n ? surplusMinor : netPaidMinor > 0n ? netPaidMinor : 0n,
  )

  const handleView = (row: Expense) => {
    navigate(withListQuery(`/accounting/expenses/${row.id}`, location.search))
  }

  const handlePaySubmit = useCallback(
    async (payments: { paymentMethodId: string; amount: string; paymentDate: string; reference?: string }[]) => {
      if (!payExpenseRow) return
      try {
        await doPayExpense({
          id: payExpenseRow.id,
          data: {
            payments,
          },
        }).unwrap()
        showSuccess(`Payment recorded for ${payExpenseRow.expenseNumber}`)
        setPayExpenseRow(null)
      } catch (error) {
        showError(rtkErrorMessage(error, 'Failed to record payment'))
        throw error
      }
    },
    [payExpenseRow, doPayExpense, showSuccess, showError],
  )

  const handleRefundSubmit = useCallback(
    async (lines: { paymentMethodId: string; amount: string; reference?: string; date?: string }[]) => {
      if (!refundExpenseRow) return
      try {
        await doRefundExpense({
          id: refundExpenseRow.id,
          data: {
            refunds: lines.map((l) => ({
              paymentMethodId: l.paymentMethodId,
              amount: l.amount,
              reference: l.reference,
              refundDate: l.date as string,
            })),
          },
        }).unwrap()
        showSuccess(`Refund recorded for ${refundExpenseRow.expenseNumber}`)
        setRefundExpenseRow(null)
      } catch (error) {
        showError(rtkErrorMessage(error, 'Failed to record refund'))
        throw error
      }
    },
    [refundExpenseRow, doRefundExpense, showSuccess, showError],
  )

  const handleCancelConfirm = useCallback(async () => {
    if (!cancelExpenseRow) return
    try {
      await doCancelExpense(cancelExpenseRow.id).unwrap()
      showSuccess(`Expense ${cancelExpenseRow.expenseNumber} cancelled`)
      setCancelExpenseRow(null)
    } catch (error) {
      showError(rtkErrorMessage(error, 'Failed to cancel expense'))
    }
  }, [cancelExpenseRow, doCancelExpense, showSuccess, showError])

  const handleUncancelConfirm = useCallback(async () => {
    if (!uncancelExpenseRow) return
    try {
      await doUncancelExpense(uncancelExpenseRow.id).unwrap()
      showSuccess(`Expense ${uncancelExpenseRow.expenseNumber} uncancelled`)
      setUncancelExpenseRow(null)
    } catch (error) {
      showError(rtkErrorMessage(error, 'Failed to uncancel expense'))
    }
  }, [uncancelExpenseRow, doUncancelExpense, showSuccess, showError])

  const buildRowActions = useCallback(
    (row: Expense): RowAction[] => {
      const metas = getExpenseActionMetas(row)
      const actions: RowAction[] = [
        { label: 'View', onClick: () => handleView(row) },
      ]
      for (const meta of metas) {
        actions.push({
          label:
            meta.action.charAt(0).toUpperCase() + meta.action.slice(1),
          onClick: () => {
            if (meta.action === 'edit') {
              // Tell the form where Edit was opened from so Save/Cancel/Back
              // can come back here instead of falling through to Detail.
              navigate(withListQuery(`/accounting/expenses/${row.id}/edit`, location.search), {
                state: { expenseEditOrigin: 'list' },
              })
            } else if (meta.action === 'pay') {
              setPayExpenseRow(row)
            } else if (meta.action === 'refund') {
              setRefundExpenseRow(row)
            } else if (meta.action === 'cancel') {
              setCancelExpenseRow(row)
            } else if (meta.action === 'uncancel') {
              setUncancelExpenseRow(row)
            }
          },
          disabled: meta.disabled,
          tooltip: meta.tooltip,
        })
      }
      return actions
    },
    [],
  )

  const columns: ColumnConfig<Expense>[] = [
    { key: 'expenseNumber', render: (row) => row.expenseNumber },
    { key: 'expenseDate', render: (row) => formatDate(row.expenseDate) },
    { key: 'description', render: (row) => row.description ?? '-' },
    {
      key: 'account',
      render: (row) =>
        row.expenseAccount
          ? `${row.expenseAccount.code} ${row.expenseAccount.name}`
          : '-',
    },
    { key: 'totalAmount', render: (row) => formatCurrency(row.totalAmount) },
    { key: 'paidAmount', render: (row) => formatCurrency(row.paidAmount) },
    { key: 'balance', render: (row) => formatCurrency(row.balance) },
    {
      key: 'documentStatus',
      raw: true,
      render: (row) => <StatusChip status={row.documentStatus} />,
    },
    {
      key: 'paymentStatus',
      raw: true,
      render: (row) => (
        <StatusChip status={row.paymentStatus} />
      ),
    },
    {
      key: 'actions',
      raw: true,
      render: (row) => <RowActionMenu actions={buildRowActions(row)} />,
    },
  ]

  return (
    <SimpleListPage
      title="Expenses"
      subtitle="Track business expenses and payment status"
      primaryAction={{
        label: '+ New Expense',
        onClick: () => navigate(withListQuery('/accounting/expenses/new', location.search)),
      }}
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={handlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={searchInputRef}
      sort={{
        field: EXPENSE_SORT_FIELD,
        sortBy: EXPENSE_SORT_FIELD,
        sortOrder,
        onSort: setSort,
      }}
      isFetching={isFetching}
      error={error ? 'Failed to load expenses.' : null}
      tableSlot={
        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <EntityTable
            rows={rows}
            columns={columns}
            loading={isFetching}
            total={total}
            label="Expenses"
            emptyLabel="expenses"
            showHeader={false}
            focusedIndex={-1}
            selectedId={highlightId ?? undefined}
            onSelect={handleView}
            listRef={searchInputRef}
            headers={[
              'Expense No.',
              'Date',
              'Description',
              'Account',
              'Total',
              'Paid',
              'Balance',
              'Doc Status',
              'Payment Status',
              'Actions',
            ]}
            paginationSlot={
              total > 0 ? (
                <PagePagination
                  total={total}
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
      }
      dialogs={
        <>
          {payExpenseRow && (
            <PaymentDialog
              open
              onClose={() => setPayExpenseRow(null)}
              onSubmit={handlePaySubmit}
              documentNumber={payExpenseRow.expenseNumber}
              totalAmount={payExpenseRow.totalAmount}
              paidAmount={payExpenseRow.paidAmount}
              paymentMethods={paymentMethods}
              loading={methodsLoading}
            />
          )}

          {refundExpenseRow && refundExpenseDetail && (
            <RefundDialog
              methods={refundMethods.map((m) => ({ id: m.id, label: m.name }))}
              seedAllocations={seedAllocations}
              availableForRefund={availableForRefund}
              seedTarget={seedTarget}
              loading={refundDetailLoading || refundMethodsLoading}
              open
              onClose={() => setRefundExpenseRow(null)}
              onSubmit={handleRefundSubmit}
              orderNumber={refundExpenseRow.expenseNumber}
              title={`Refund — ${refundExpenseRow.expenseNumber}`}
              showDateField
            />
          )}

          {cancelExpenseRow && (
            <ConfirmationDialog
              open
              title="Cancel Expense"
              message={`Cancel this expense? (${cancelExpenseRow.expenseNumber})`}
              confirmText="Cancel Expense"
              severity="error"
              onConfirm={handleCancelConfirm}
              onCancel={() => setCancelExpenseRow(null)}
              loading={isCancelling}
            />
          )}

          {uncancelExpenseRow && (
            <ConfirmationDialog
              open
              title="Uncancel Expense"
              message={`Uncancel this expense? (${uncancelExpenseRow.expenseNumber})`}
              confirmText="Uncancel Expense"
              severity="warning"
              onConfirm={handleUncancelConfirm}
              onCancel={() => setUncancelExpenseRow(null)}
              loading={isUncancelling}
            />
          )}
        </>
      }
    />
  )
}