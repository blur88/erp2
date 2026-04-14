import React, { useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { useGetVendorPaymentsQuery } from '@/store/api/purchasingApi'
import { selectSelectedVendorPayment } from '@/store/slices/purchasingSlice'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'

import VendorPaymentContextHeader from './components/VendorPaymentContextHeader'
import VendorPaymentsDialogs from './components/VendorPaymentsDialogs'
import VendorPaymentTable from './components/VendorPaymentTable'
import VendorPaymentWorkspaceCard from './components/VendorPaymentWorkspaceCard'
import { useVendorPaymentsPageState } from './hooks/useVendorPaymentsPageState'
import { useVendorPaymentsSelection } from './hooks/useVendorPaymentsSelection'

interface VPFilters {
  search: string
  supplierId: string | null
  period: PeriodValue
  status: 'pending' | 'completed' | 'cancelled' | null
}

const VendorPaymentsPage: React.FC = () => {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const [searchParams, setSearchParams] = useSearchParams()
  const pageState = useVendorPaymentsPageState()
  const selectedPayment = useAppSelector(selectSelectedVendorPayment)

  const filterConfig = useMemo<FilterBarConfig<VPFilters>>(
    () => ({
      search: { placeholder: 'Search vendor payments...' },
      fields: [
        { field: 'period', label: 'Period', type: 'period' },
        { field: 'supplierId', label: 'Supplier', type: 'supplier' },
        { field: 'status', label: 'Status', type: 'vendor-payment-status' },
      ],
      defaults: {
        search: '',
        supplierId: null,
        period: { key: null, from: null, to: null },
        status: null,
      },
    }),
    [],
  )

  const filterBar = useFilterBar(filterConfig)
  const weekStartsOn = getStartOfWeek()

  const dateRange = useMemo(() => {
    const period = filterBar.appliedFilters.period
    if (!period || period.key === null) return { startDate: undefined, endDate: undefined }
    if (period.key === 'custom') return { startDate: period.from ?? undefined, endDate: period.to ?? undefined }
    const range = getPeriodDateRange(period.key, weekStartsOn)
    return { startDate: range.from, endDate: range.to }
  }, [filterBar.appliedFilters.period, weekStartsOn])

  const queryParams = useMemo(() => ({
    sortBy: pageState.sorting.sortBy,
    sortOrder: pageState.sorting.sortOrder,
    search: filterBar.appliedFilters.search || undefined,
    supplierId: filterBar.appliedFilters.supplierId || undefined,
    status: filterBar.appliedFilters.status || undefined,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  }), [dateRange, filterBar.appliedFilters, pageState.sorting])

  const {
    data: paymentsResponse,
    isFetching: loading,
    error: paymentsError,
  } = useGetVendorPaymentsQuery(queryParams)

  const payments = paymentsResponse?.data || []
  const total = paymentsResponse?.meta?.total || 0
  const error = paymentsError && typeof paymentsError === 'object'
    ? ((paymentsError as any).data?.message || (paymentsError as any).data || 'Failed to fetch vendor payments')
    : null

  const selection = useVendorPaymentsSelection({
    dispatch,
    payments,
    selectedPayment,
    focusedPaymentIndex: pageState.focusedPaymentIndex,
    setFocusedPaymentIndex: pageState.setFocusedPaymentIndex,
    searchParams,
    setSearchParams,
    paymentListRef: pageState.paymentListRef,
    searchInputRef: pageState.searchInputRef,
    userHasNavigatedRef: pageState.userHasNavigatedRef,
    setJournalEntryRef: pageState.setJournalEntryRef,
    setJournalEntryRefLoading: pageState.setJournalEntryRefLoading,
  })

  const handleSort = useCallback((field: string) => {
    pageState.setSorting((prev) => ({
      ...prev,
      sortBy: field,
      sortOrder: prev.sortBy === field && prev.sortOrder === 'desc' ? 'asc' : 'desc',
    }))
  }, [pageState])

  useKeyboardShortcuts({
    onSearch: selection.focusSearchInput,
    onArrowUp: selection.handleNavigateUp,
    onArrowDown: selection.handleNavigateDown,
  })

  const navigateToJournalEntry = useCallback(() => {
    if (!pageState.journalEntryRef) return
    navigate(
      `/accounting/journal-entries?sourceType=${pageState.journalEntryRef.sourceType}&sourceId=${pageState.journalEntryRef.sourceId}`,
    )
  }, [navigate, pageState.journalEntryRef])

  return (
    <GenericListPage
      title="Vendor Payments"
      subtitle="Track and manage payments to suppliers"
      secondaryAction={{ label: 'View Deleted', onClick: () => pageState.setDeletedPaymentsOpen(true) }}
      filterConfig={filterConfig}
      draftFilters={filterBar.draftFilters}
      handlers={filterBar.handlers}
      hasActiveFilters={filterBar.hasActiveFilters}
      searchInputRef={pageState.searchInputRef}
      sort={{
        field: 'paymentNumber',
        sortBy: pageState.sorting.sortBy,
        sortOrder: pageState.sorting.sortOrder,
        onSort: handleSort,
      }}
      error={error}
      listSlot={(
        <VendorPaymentTable
          payments={payments}
          loading={loading}
          total={total}
          selectedPaymentId={selectedPayment?.id}
          focusedPaymentIndex={pageState.focusedPaymentIndex}
          onPaymentSelect={selection.handlePaymentSelect}
          paymentListRef={pageState.paymentListRef}
        />
      )}
      headerSlot={(
        <VendorPaymentContextHeader
          selectedPayment={selectedPayment}
          journalEntryRef={pageState.journalEntryRef}
          journalEntryRefLoading={pageState.journalEntryRefLoading}
          onPrint={() => pageState.setPrintDialogOpen(true)}
          onNavigateToJournalEntry={navigateToJournalEntry}
        />
      )}
      workspaceSlot={<VendorPaymentWorkspaceCard selectedPayment={selectedPayment} />}
      dialogs={(
        <VendorPaymentsDialogs
          selectedPayment={selectedPayment}
          deletedPaymentsOpen={pageState.deletedPaymentsOpen}
          onCloseDeletedPayments={() => pageState.setDeletedPaymentsOpen(false)}
          printDialogOpen={pageState.printDialogOpen}
          onClosePrintDialog={() => pageState.setPrintDialogOpen(false)}
        />
      )}
    />
  )
}

export default VendorPaymentsPage
