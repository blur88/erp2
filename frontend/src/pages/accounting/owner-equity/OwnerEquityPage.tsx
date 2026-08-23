import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Box } from '@mui/material'
import { skipToken } from '@reduxjs/toolkit/query'

import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import SimpleListPage from '@/components/common/SimpleListPage'
import EntityTable, { type ColumnConfig } from '@/components/common/EntityTable'
import PagePagination from '@/components/common/PagePagination'
import PaymentDialog from '@/components/common/PaymentDialog'
import RefundDialog, { type RefundSeed } from '@/components/common/RefundDialog'
import { StatusChip } from '@/components/common/StatusChip'
import RowActionMenu, { type RowAction } from '@/components/common/RowActionMenu'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useListUrlState } from '@/hooks/useListUrlState'
import { useNotification } from '@/hooks/useNotification'
import {
  useCancelOwnerEquityMutation,
  useCompleteOwnerEquityMutation,
  useGetOwnerEquityListQuery,
  useGetOwnerEquityQuery,
  useRefundOwnerEquityMutation,
  useSettleOwnerEquityMutation,
  useUncancelOwnerEquityMutation,
  useUncompleteOwnerEquityMutation,
} from '@/store/api/accountingApi'
import {
  useGetActivePaymentMethodsForPurchasesQuery,
  useGetActivePaymentMethodsQuery,
} from '@/store/api/paymentMethodsApi'
import type {
  OwnerEquityDocument,
  OwnerEquityListParams,
  OwnerEquityType,
} from '@/types'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { fromScaledAmount, toScaledAmount } from '@/utils/currency'
import { formatCurrency, formatDate } from '@/utils/formatters'
import { rtkErrorMessage } from '@/utils/errorMessage'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'
import { PAGINATION } from '@/constants/tableStyles'
import { withListQuery } from '@/utils/listQuery'
import { getOwnerEquityActionMetas } from './ownerEquityActions'

export const OWNER_EQUITY_TYPE_LABELS: Record<OwnerEquityType, string> = {
  CAPITAL_INJECTION: 'Capital Injection',
  CASH_DRAWING: 'Cash Drawing',
  STOCK_DRAWING: 'Stock Drawing',
}

interface EquityFilters {
  search: string
  period: PeriodValue
  type: OwnerEquityType | null
  documentStatus: OwnerEquityDocument['documentStatus'] | null
  settlementStatus: OwnerEquityDocument['settlementStatus'] | null
}

const EQUITY_SORT_FIELD = 'referenceNumber' as const

const filterConfig: FilterBarConfig<EquityFilters> = {
  search: { placeholder: 'Search by equity no., description...' },
  fields: [
    { field: 'period', label: 'Period', type: 'period' },
    {
      field: 'type',
      label: 'Type',
      type: 'select',
      options: [
        { value: 'CAPITAL_INJECTION', label: 'Capital Injection' },
        { value: 'CASH_DRAWING', label: 'Cash Drawing' },
        { value: 'STOCK_DRAWING', label: 'Stock Drawing' },
      ],
      emptyLabel: 'All types',
    },
    {
      field: 'documentStatus',
      label: 'Status',
      type: 'select',
      options: [
        { value: 'DRAFT', label: 'Draft' },
        { value: 'COMPLETED', label: 'Completed' },
        { value: 'CANCELLED', label: 'Cancelled' },
      ],
      emptyLabel: 'All statuses',
    },
    {
      field: 'settlementStatus',
      label: 'Settlement',
      type: 'select',
      options: [
        { value: 'UNSETTLED', label: 'Unsettled' },
        { value: 'PARTIAL', label: 'Partial' },
        { value: 'SETTLED', label: 'Settled' },
        { value: 'OVERSETTLED', label: 'Oversettled' },
      ],
      emptyLabel: 'All settlements',
    },
  ],
  defaults: {
    search: '',
    period: { key: null, from: null, to: null },
    type: null,
    documentStatus: null,
    settlementStatus: null,
  },
}

export default function OwnerEquityPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const { page, limit, sortBy, sortOrder, setPage, setLimit, setSort, resetPage } =
    useListUrlState({
      sort: {
        fields: [EQUITY_SORT_FIELD],
        defaultField: EQUITY_SORT_FIELD,
        defaultOrder: 'desc',
      },
    })
  const [settleRow, setSettleRow] = useState<OwnerEquityDocument | null>(null)
  const [refundRow, setRefundRow] = useState<OwnerEquityDocument | null>(null)
  const [completeRow, setCompleteRow] = useState<OwnerEquityDocument | null>(null)
  const [cancelRow, setCancelRow] = useState<OwnerEquityDocument | null>(null)
  const [uncancelRow, setUncancelRow] = useState<OwnerEquityDocument | null>(null)

  const { showSuccess, showError } = useNotification()
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  // A Create — or a list-origin Edit (#1090) — that returned to this list hands
  // the affected row back in location.state. Copy it into local state and drop it from history
  // immediately: the tint is a one-shot confirmation of the return trip, not
  // persistent list state, so it must not survive a reload or a Back/Forward
  // into this entry. The replace target keeps location.search so clearing
  // can't discard query parameters. Issue #1088.
  const highlightOwnerEquityId = (location.state as { highlightOwnerEquityId?: string } | null)
    ?.highlightOwnerEquityId

  useEffect(() => {
    if (!highlightOwnerEquityId) return
    setHighlightId(highlightOwnerEquityId)
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
  }, [highlightOwnerEquityId, location.pathname, location.search, navigate])

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig, {
    onApply: resetPage,
  })

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
    const params: OwnerEquityListParams = {
      page,
      limit,
      sortBy,
      sortOrder: sortOrder.toUpperCase() as 'ASC' | 'DESC',
    }
    const search = appliedFilters.search.trim()
    if (search) params.search = search
    if (appliedFilters.type) params.type = appliedFilters.type
    if (appliedFilters.documentStatus) params.documentStatus = appliedFilters.documentStatus
    if (appliedFilters.settlementStatus) params.settlementStatus = appliedFilters.settlementStatus
    if (dateRange.fromDate) params.fromDate = dateRange.fromDate
    if (dateRange.toDate) params.toDate = dateRange.toDate
    return params
  }, [page, limit, appliedFilters, sortBy, sortOrder, dateRange])

  const { data: response, isFetching, error } = useGetOwnerEquityListQuery(queryParams)
  const rows = response?.data ?? []
  const total = response?.meta?.total ?? 0

  const [doSettleOwnerEquity] = useSettleOwnerEquityMutation()
  const [doRefundOwnerEquity] = useRefundOwnerEquityMutation()
  const [doComplete, { isLoading: isCompleting }] = useCompleteOwnerEquityMutation()
  const [doCancel, { isLoading: isCancelling }] = useCancelOwnerEquityMutation()
  const [doUncancel, { isLoading: isUncancelling }] = useUncancelOwnerEquityMutation()

  // Capital Injection receives money and may use any active method; Cash
  // Drawing pays money out and is restricted to purchase-enabled methods,
  // matching the backend guard in OwnerEquitySettlementService.
  const settleNeedsPurchaseMethods = settleRow?.type === 'CASH_DRAWING'
  const { data: purchaseMethods = [], isLoading: purchaseMethodsLoading } =
    useGetActivePaymentMethodsForPurchasesQuery(undefined, {
      skip: !settleRow || !settleNeedsPurchaseMethods,
    })
  const { data: allActiveMethods = [], isLoading: allMethodsLoading } =
    useGetActivePaymentMethodsQuery(undefined, {
      // Live for Capital Injection settle OR for any refund (#1096).
      skip: (!settleRow || settleNeedsPurchaseMethods) && !refundRow,
    })
  const paymentMethods = settleNeedsPurchaseMethods ? purchaseMethods : allActiveMethods
  const methodsLoading = settleNeedsPurchaseMethods ? purchaseMethodsLoading : allMethodsLoading

  const {
    currentData: refundDetail,
    isLoading: refundDetailLoading,
    isError: refundDetailError,
    // Keyed on referenceNumber, not id — the detail endpoint routes on the
    // document number (/accounting/owner-equity/:referenceNumber).
  } = useGetOwnerEquityQuery(refundRow ? refundRow.referenceNumber : skipToken)

  useEffect(() => {
    if (refundRow && refundDetailError) {
      showError('Failed to load equity settlements for refund')
      setRefundRow(null)
    }
  }, [refundRow, refundDetailError, showError])

  // Per-method NET capacity for the refund preset: gross payments minus prior
  // refunds through the same method (refunds are negative rows on the same
  // paymentMethodId). Sum ALL signed rows first, then emit only methods with a
  // positive balance — a cross-method refund can drive one negative, which is
  // not a valid preset line (#1107).
  const seedAllocations: RefundSeed[] = useMemo(() => {
    const netByMethod = new Map<string, bigint>()
    for (const s of refundDetail?.settlements ?? []) {
      netByMethod.set(
        s.paymentMethodId,
        (netByMethod.get(s.paymentMethodId) ?? 0n) + (toScaledAmount(s.amount) ?? 0n),
      )
    }
    return [...netByMethod]
      .filter(([, amount]) => amount > 0n)
      .map(([methodId, amount]) => ({ methodId, amount: fromScaledAmount(amount) }))
  }, [refundDetail])

  const netSettledMinor = useMemo(
    () => (refundDetail?.settlements ?? []).reduce((s, r) => s + (toScaledAmount(r.amount) ?? 0n), 0n),
    [refundDetail],
  )
  const availableForRefund = fromScaledAmount(netSettledMinor > 0n ? netSettledMinor : 0n)
  const surplusMinor = netSettledMinor - (toScaledAmount(refundDetail?.totalAmount ?? '0') ?? 0n)
  const seedTarget = fromScaledAmount(
    surplusMinor > 0n ? surplusMinor : netSettledMinor > 0n ? netSettledMinor : 0n,
  )

  const settleTerminology = useMemo(() => {
    if (!settleRow) return undefined
    // Capital injections are received; cash drawings are paid.
    return settleRow.type === 'CAPITAL_INJECTION'
      ? { noun: 'Receipt', verbPast: 'Received', submitLabel: 'Record Receipt', lineNoun: 'Receipt' }
      : { noun: 'Payment', verbPast: 'Paid', submitLabel: 'Record Payment', lineNoun: 'Payment' }
  }, [settleRow])

  const handleView = (row: OwnerEquityDocument) => {
    navigate(withListQuery(`/accounting/owner-equity/${row.referenceNumber}/view`, location.search))
  }

  const handleSettleSubmit = useCallback(
    async (payments: { paymentMethodId: string; amount: string; paymentDate: string; reference?: string }[]) => {
      if (!settleRow) return
      try {
        await doSettleOwnerEquity({
          referenceNumber: settleRow.referenceNumber,
          data: {
            settlements: payments.map((p) => ({
              paymentMethodId: p.paymentMethodId,
              amount: p.amount,
              settlementDate: p.paymentDate,
              reference: p.reference,
            })),
          },
        }).unwrap()
        showSuccess(`Settlement recorded for ${settleRow.referenceNumber}`)
        setSettleRow(null)
      } catch (error) {
        showError(rtkErrorMessage(error, 'Failed to record settlement'))
        throw error
      }
    },
    [settleRow, doSettleOwnerEquity, showSuccess, showError],
  )

  const handleRefundSubmit = useCallback(
    async (lines: { paymentMethodId: string; amount: string; reference?: string; date?: string }[]) => {
      if (!refundRow) return
      try {
        await doRefundOwnerEquity({
          referenceNumber: refundRow.referenceNumber,
          data: {
            refunds: lines.map((l) => ({
              paymentMethodId: l.paymentMethodId,
              amount: l.amount,
              reference: l.reference,
              refundDate: l.date as string,
            })),
          },
        }).unwrap()
        showSuccess(`Refund recorded for ${refundRow.referenceNumber}`)
        setRefundRow(null)
      } catch (error) {
        showError(rtkErrorMessage(error, 'Failed to record refund'))
        throw error
      }
    },
    [refundRow, doRefundOwnerEquity, showSuccess, showError],
  )

  const handleCompleteConfirm = useCallback(async () => {
    if (!completeRow) return
    try {
      await doComplete({ referenceNumber: completeRow.referenceNumber }).unwrap()
      showSuccess(`${OWNER_EQUITY_TYPE_LABELS[completeRow.type]} ${completeRow.referenceNumber} completed`)
      setCompleteRow(null)
    } catch (error) {
      showError(rtkErrorMessage(error, 'Failed to complete'))
    }
  }, [completeRow, doComplete, showSuccess, showError])

  const handleCancelConfirm = useCallback(async () => {
    if (!cancelRow) return
    try {
      await doCancel({ referenceNumber: cancelRow.referenceNumber }).unwrap()
      showSuccess(`${OWNER_EQUITY_TYPE_LABELS[cancelRow.type]} ${cancelRow.referenceNumber} cancelled`)
      setCancelRow(null)
    } catch (error) {
      showError(rtkErrorMessage(error, 'Failed to cancel'))
    }
  }, [cancelRow, doCancel, showSuccess, showError])

  const handleUncancelConfirm = useCallback(async () => {
    if (!uncancelRow) return
    try {
      await doUncancel({ referenceNumber: uncancelRow.referenceNumber }).unwrap()
      showSuccess(`${OWNER_EQUITY_TYPE_LABELS[uncancelRow.type]} ${uncancelRow.referenceNumber} uncancelled`)
      setUncancelRow(null)
    } catch (error) {
      showError(rtkErrorMessage(error, 'Failed to uncancel'))
    }
  }, [uncancelRow, doUncancel, showSuccess, showError])

  const buildRowActions = useCallback(
    (row: OwnerEquityDocument): RowAction[] => {
      const metas = getOwnerEquityActionMetas(row)
      const actions: RowAction[] = [{ label: 'View', onClick: () => handleView(row) }]
      for (const meta of metas) {
        actions.push({
          label: meta.action.charAt(0).toUpperCase() + meta.action.slice(1),
          onClick: () => {
            if (meta.action === 'edit') {
              // Tell the form where Edit was opened from so Save/Cancel/Back
              // can come back here instead of falling through to Detail.
              // Issue #1090.
              navigate(
                withListQuery(`/accounting/owner-equity/${row.referenceNumber}/edit`, location.search),
                { state: { ownerEquityEditOrigin: 'list' } },
              )
            } else if (meta.action === 'complete') {
              setCompleteRow(row)
            } else if (meta.action === 'uncomplete') {
              navigate(withListQuery(`/accounting/owner-equity/${row.referenceNumber}/view`, location.search))
            } else if (meta.action === 'settle') {
              setSettleRow(row)
            } else if (meta.action === 'refund') {
              setRefundRow(row)
            } else if (meta.action === 'cancel') {
              setCancelRow(row)
            } else if (meta.action === 'uncancel') {
              setUncancelRow(row)
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

  const isMonetary = (row: OwnerEquityDocument) =>
    row.type === 'CAPITAL_INJECTION' || row.type === 'CASH_DRAWING'

  const columns: ColumnConfig<OwnerEquityDocument>[] = [
    { key: 'referenceNumber', render: (row) => row.referenceNumber },
    { key: 'equityDate', render: (row) => formatDate(row.equityDate) },
    { key: 'type', render: (row) => OWNER_EQUITY_TYPE_LABELS[row.type] },
    { key: 'description', render: (row) => row.description ?? '-' },
    {
      key: 'amountOrCost',
      raw: true,
      render: (row) =>
        isMonetary(row) ? formatCurrency(row.totalAmount) : formatCurrency(row.totalCost),
    },
    {
      key: 'settled',
      render: (row) => (isMonetary(row) ? formatCurrency(row.settledAmount) : '—'),
    },
    {
      key: 'balance',
      render: (row) => (isMonetary(row) ? formatCurrency(row.balance) : '—'),
    },
    {
      key: 'documentStatus',
      raw: true,
      render: (row) => <StatusChip status={row.documentStatus} />,
    },
    {
      key: 'settlementStatus',
      raw: true,
      render: (row) =>
        isMonetary(row) ? <StatusChip status={row.settlementStatus ?? 'UNSETTLED'} /> : '—',
    },
    {
      key: 'actions',
      raw: true,
      render: (row) => <RowActionMenu actions={buildRowActions(row)} />,
    },
  ]

  return (
    <SimpleListPage
      title="Owner Equity"
      subtitle="Capital injections, cash drawings and stock drawings"
      primaryAction={{
        label: '+ New Owner Equity',
        onClick: () => navigate(withListQuery('/accounting/owner-equity/create', location.search)),
      }}
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={handlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={searchInputRef}
      sort={{
        field: EQUITY_SORT_FIELD,
        sortBy: EQUITY_SORT_FIELD,
        sortOrder,
        onSort: setSort,
      }}
      isFetching={isFetching}
      error={error ? 'Failed to load owner equity documents.' : null}
      tableSlot={
        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <EntityTable
            rows={rows}
            columns={columns}
            loading={isFetching}
            total={total}
            label="Owner Equity"
            emptyLabel="owner equity documents"
            showHeader={false}
            focusedIndex={-1}
            selectedId={highlightId ?? undefined}
            onSelect={handleView}
            listRef={searchInputRef}
            headers={[
              'Equity No.',
              'Date',
              'Type',
              'Description',
              'Amount/Cost',
              'Received/Paid',
              'Balance',
              'Doc Status',
              'Settlement',
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
          {settleRow && (
            <PaymentDialog
              open
              onClose={() => setSettleRow(null)}
              onSubmit={handleSettleSubmit}
              documentNumber={settleRow.referenceNumber}
              totalAmount={settleRow.totalAmount ?? '0'}
              paidAmount={settleRow.settledAmount ?? '0'}
              paymentMethods={paymentMethods}
              loading={methodsLoading}
              terminology={settleTerminology}
            />
          )}

          {refundRow && refundDetail && (
            <RefundDialog
              methods={allActiveMethods.map((m) => ({ id: m.id, label: m.name }))}
              seedAllocations={seedAllocations}
              availableForRefund={availableForRefund}
              seedTarget={seedTarget}
              loading={refundDetailLoading || allMethodsLoading}
              open
              onClose={() => setRefundRow(null)}
              onSubmit={handleRefundSubmit}
              orderNumber={refundRow.referenceNumber}
              title={`Refund — ${refundRow.referenceNumber}`}
              showDateField
            />
          )}

          {completeRow && (
            <ConfirmationDialog
              open
              title="Complete Owner Equity"
              message={`Mark ${OWNER_EQUITY_TYPE_LABELS[completeRow.type]} ${completeRow.referenceNumber} as completed?`}
              confirmText="Complete"
              severity="info"
              onConfirm={handleCompleteConfirm}
              onCancel={() => setCompleteRow(null)}
              loading={isCompleting}
            />
          )}

          {cancelRow && (
            <ConfirmationDialog
              open
              title="Cancel Owner Equity"
              message={`Cancel this document? (${cancelRow.referenceNumber})`}
              confirmText="Cancel"
              severity="error"
              onConfirm={handleCancelConfirm}
              onCancel={() => setCancelRow(null)}
              loading={isCancelling}
            />
          )}

          {uncancelRow && (
            <ConfirmationDialog
              open
              title="Uncancel Owner Equity"
              message={`Uncancel this document? (${uncancelRow.referenceNumber})`}
              confirmText="Uncancel"
              severity="warning"
              onConfirm={handleUncancelConfirm}
              onCancel={() => setUncancelRow(null)}
              loading={isUncancelling}
            />
          )}
        </>
      }
    />
  )
}
