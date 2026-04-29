import React, { useCallback, useMemo, useState } from 'react'

import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { useGetVendorPaymentsQuery } from '@/store/api/purchasingApi'
import { selectSelectedVendorPayment } from '@/store/slices/purchasingSlice'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'

import VendorPaymentContextHeader from './components/VendorPaymentContextHeader'
import VendorPaymentsDialogs from './components/VendorPaymentsDialogs'
import VendorPaymentTable from './components/VendorPaymentTable'
import VendorPaymentWorkspaceCard from './components/VendorPaymentWorkspaceCard'
import { useVendorPaymentsWorkspace } from './hooks/useVendorPaymentsWorkspace'

interface VPFilters {
  search: string
  supplierId: string | null
  period: PeriodValue
  status: 'pending' | 'completed' | 'cancelled' | null
}

interface VPSortingState {
  sortBy: string
  sortOrder: 'asc' | 'desc'
}

const VendorPaymentsPage: React.FC = () => {
  const dispatch = useAppDispatch()
  const [sorting, setSorting] = useState<VPSortingState>({
    sortBy: 'paymentNumber',
    sortOrder: 'asc',
  })
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
    sortBy: sorting.sortBy,
    sortOrder: sorting.sortOrder,
    search: filterBar.appliedFilters.search || undefined,
    supplierId: filterBar.appliedFilters.supplierId || undefined,
    status: filterBar.appliedFilters.status || undefined,
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  }), [dateRange, filterBar.appliedFilters, sorting])

  const {
    data: paymentsResponse,
    isFetching: loading,
    error: paymentsError,
    refetch,
  } = useGetVendorPaymentsQuery(queryParams)

  const payments = paymentsResponse?.data || []
  const total = paymentsResponse?.meta?.total || 0
  const error = paymentsError && typeof paymentsError === 'object'
    ? ((paymentsError as any).data?.message || (paymentsError as any).data || 'Failed to fetch vendor payments')
    : null

  const workspace = useVendorPaymentsWorkspace({
    dispatch,
    payments,
    selectedPayment,
    refetch: () => void refetch(),
  })

  const handleSort = useCallback((field: string) => {
    setSorting((prev) => ({
      sortBy: field,
      sortOrder: prev.sortBy === field && prev.sortOrder === 'desc' ? 'asc' : 'desc',
    }))
  }, [])

  const navigateToJournalEntry = useCallback(() => {
    workspace.navigateToJournalEntries()
  }, [workspace.navigateToJournalEntries])

  return (
    <GenericListPage
      title="Vendor Payments"
      subtitle="Track and manage payments to suppliers"
      secondaryAction={{ label: 'View Deleted', onClick: () => workspace.setDeletedPaymentsOpen(true) }}
      filterConfig={filterConfig}
      draftFilters={filterBar.draftFilters}
      handlers={filterBar.handlers}
      hasActiveFilters={filterBar.hasActiveFilters}
      searchInputRef={workspace.searchInputRef}
      sort={{
        field: 'paymentNumber',
        sortBy: sorting.sortBy,
        sortOrder: sorting.sortOrder,
        onSort: handleSort,
      }}
      error={error}
      listSlot={(
        <VendorPaymentTable
          payments={payments}
          loading={loading}
          total={total}
          selectedPaymentId={selectedPayment?.id}
          focusedPaymentIndex={workspace.focusedIndex}
          onPaymentSelect={workspace.handleSelect}
          paymentListRef={workspace.listRef}
        />
      )}
      headerSlot={(
        <VendorPaymentContextHeader
          selectedPayment={selectedPayment}
          journalEntryRefs={workspace.journalEntryRefs}
          journalEntryRefLoading={workspace.journalEntryRefsLoading}
          onPrint={() => workspace.setPrintDialogOpen(true)}
          onNavigateToJournalEntry={navigateToJournalEntry}
        />
      )}
      workspaceSlot={<VendorPaymentWorkspaceCard selectedPayment={selectedPayment} />}
      dialogs={(
        <VendorPaymentsDialogs
          selectedPayment={selectedPayment}
          deletedPaymentsOpen={workspace.deletedPaymentsOpen}
          onCloseDeletedPayments={() => workspace.setDeletedPaymentsOpen(false)}
          printDialogOpen={workspace.printDialogOpen}
          onClosePrintDialog={() => workspace.setPrintDialogOpen(false)}
        />
      )}
    />
  )
}

export default VendorPaymentsPage
