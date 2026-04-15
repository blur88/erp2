import React, { useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import GenericListPage from '@/components/common/GenericListPage'
import PurchaseOrderContextHeader from './components/PurchaseOrderContextHeader'
import PurchaseOrdersDialogs from './components/PurchaseOrdersDialogs'
import PurchaseOrdersTable from './components/PurchaseOrdersTable'
import PurchaseOrderWorkspaceCard from './components/PurchaseOrderWorkspaceCard'
import { usePurchaseOrdersActions } from './hooks/purchaseOrdersActions'
import { usePurchaseOrdersPageState } from './hooks/purchaseOrdersPageState'
import { usePurchaseOrdersSelection } from './hooks/purchaseOrdersSelection'

import { useFilterBar } from '@/hooks/useFilterBar'
import { useNotification } from '@/hooks/useNotification'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  useDeletePurchaseOrderMutation,
  useGetPurchaseOrdersQuery,
  useLazyGetPurchaseOrderQuery,
  useMarkPurchaseOrderAsUnpaidMutation,
  useReceiveGoodsMutation,
  useRecordOrderPaymentsMutation,
  useReturnGoodsMutation,
} from '@/store/api/purchasingApi'
import { selectSelectedPurchaseOrder } from '@/store/slices/purchasingSlice'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'

interface PurchaseOrderFilters {
  search: string
  supplierId: string | null
  paymentStatus: 'unpaid' | 'partial' | 'paid' | 'overpaid' | null
  period: PeriodValue
  status: 'draft' | 'received' | null
}

export const PurchaseOrdersPage: React.FC = () => {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { showSuccess, showError } = useNotification()
  const [searchParams, setSearchParams] = useSearchParams()
  const pageState = usePurchaseOrdersPageState()
  const selectedOrder = useAppSelector(selectSelectedPurchaseOrder)

  const filterConfig = useMemo<FilterBarConfig<PurchaseOrderFilters>>(
    () => ({
      search: { placeholder: 'Search purchase orders...' },
      fields: [
        {
          field: 'period',
          label: 'Period',
          type: 'period',
        },
        {
          field: 'supplierId',
          label: 'Supplier',
          type: 'supplier',
        },
        {
          field: 'paymentStatus',
          label: 'Payment',
          type: 'payment-status',
        },
        {
          field: 'status',
          label: 'Order Status',
          type: 'purchasing-status',
        },
      ],
      defaults: {
        search: '',
        supplierId: null,
        paymentStatus: null,
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
    if (!period || period.key === null) {
      return { fromDate: undefined, toDate: undefined }
    }
    if (period.key === 'custom') {
      return { fromDate: period.from ?? undefined, toDate: period.to ?? undefined }
    }

    const range = getPeriodDateRange(period.key, weekStartsOn)
    return { fromDate: range.from, toDate: range.to }
  }, [filterBar.appliedFilters.period, weekStartsOn])

  const queryParams = useMemo(() => ({
    sortBy: pageState.sorting.sortBy,
    sortOrder: pageState.sorting.sortOrder.toUpperCase(),
    search: filterBar.appliedFilters.search || undefined,
    supplierId: filterBar.appliedFilters.supplierId || undefined,
    paymentStatus: filterBar.appliedFilters.paymentStatus || undefined,
    status: filterBar.appliedFilters.status || undefined,
    orderDateFrom: dateRange.fromDate,
    orderDateTo: dateRange.toDate,
  }), [dateRange, filterBar.appliedFilters, pageState.sorting.sortBy, pageState.sorting.sortOrder])

  const {
    data: purchaseOrdersResponse,
    isFetching: loading,
    error: purchaseOrdersError,
    refetch: refetchOrders,
  } = useGetPurchaseOrdersQuery(queryParams)
  const [fetchPurchaseOrder] = useLazyGetPurchaseOrderQuery()
  const [receiveGoods] = useReceiveGoodsMutation()
  const [returnGoods] = useReturnGoodsMutation()
  const [markPurchaseOrderAsUnpaid] = useMarkPurchaseOrderAsUnpaidMutation()
  const [recordOrderPayments] = useRecordOrderPaymentsMutation()
  const [deletePurchaseOrder] = useDeletePurchaseOrderMutation()

  const purchaseOrders = purchaseOrdersResponse?.data || []
  const pagination = purchaseOrdersResponse?.meta
  const error =
    purchaseOrdersError && typeof purchaseOrdersError === 'object'
      ? ((purchaseOrdersError as any).data?.message || (purchaseOrdersError as any).data || 'Failed to fetch purchase orders')
      : null

  const loadOrders = useCallback(() => {
    void refetchOrders()
  }, [refetchOrders])

  const selection = usePurchaseOrdersSelection({
    dispatch,
    purchaseOrders,
    selectedOrder,
    focusedOrderIndex: pageState.focusedOrderIndex,
    setFocusedOrderIndex: pageState.setFocusedOrderIndex,
    searchParams,
    setSearchParams,
    fetchPurchaseOrder,
    pendingHighlightId: pageState.pendingHighlightId,
    setPendingHighlightId: pageState.setPendingHighlightId,
    orderListRef: pageState.orderListRef,
    searchInputRef: pageState.searchInputRef,
    processedHighlightRef: pageState.processedHighlightRef,
    userHasNavigatedRef: pageState.userHasNavigatedRef,
    setJournalEntryRef: pageState.setJournalEntryRef,
    setJournalEntryRefLoading: pageState.setJournalEntryRefLoading,
  })

  const actions = usePurchaseOrdersActions({
    dispatch,
    navigate,
    purchaseOrders,
    selectedOrder,
    receiveGoods,
    returnGoods,
    markPurchaseOrderAsUnpaid,
    recordOrderPayments,
    deletePurchaseOrder,
    loadOrders,
    showSuccess,
    showError,
    setBlockedDialogType: pageState.setBlockedDialogType,
    setBlockedDialogOpen: pageState.setBlockedDialogOpen,
    setIsLoading: pageState.setIsLoading,
    setPaymentDialogOrder: pageState.setPaymentDialogOrder,
    setPaymentDialogOpen: pageState.setPaymentDialogOpen,
    setDeleteConfirmOpen: pageState.setDeleteConfirmOpen,
    setOrderToDelete: pageState.setOrderToDelete,
    setFocusedOrderIndex: pageState.setFocusedOrderIndex,
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

  const navigateToGoodsReceived = useCallback((grnId: string) => {
    navigate(`/purchasing/goods-received?grnId=${grnId}`)
  }, [navigate])

  const navigateToVendorPayment = useCallback((paymentId: string) => {
    navigate(`/purchasing/vendor-payments?vpId=${paymentId}`)
  }, [navigate])

  const navigateToJournalEntry = useCallback(() => {
    if (!pageState.journalEntryRef) return
    navigate(
      `/accounting/journal-entries?sourceType=${pageState.journalEntryRef.sourceType}&sourceId=${pageState.journalEntryRef.sourceId}`,
    )
  }, [navigate, pageState.journalEntryRef])

  return (
    <GenericListPage
      title="Purchase Orders"
      subtitle="Manage supplier purchase orders and procurement"
      secondaryAction={{ label: 'View Deleted', onClick: () => pageState.setDeletedOrdersDialogOpen(true) }}
      primaryAction={{ label: 'Create Order', onClick: () => navigate('/purchasing/orders/create') }}
      filterConfig={filterConfig}
      draftFilters={filterBar.draftFilters}
      handlers={filterBar.handlers}
      hasActiveFilters={filterBar.hasActiveFilters}
      searchInputRef={pageState.searchInputRef}
      sort={{
        field: 'orderNumber',
        sortBy: pageState.sorting.sortBy,
        sortOrder: pageState.sorting.sortOrder,
        onSort: handleSort,
      }}
      error={error}
      listSlot={(
        <PurchaseOrdersTable
          purchaseOrders={purchaseOrders}
          loading={loading}
          total={pagination?.total || 0}
          selectedOrderId={selectedOrder?.id}
          focusedOrderIndex={pageState.focusedOrderIndex}
          onOrderSelect={selection.handleOrderSelect}
          orderListRef={pageState.orderListRef}
        />
      )}
      headerSlot={(
        <PurchaseOrderContextHeader
          selectedOrder={selectedOrder}
          isLoading={pageState.isLoading}
          journalEntryRef={pageState.journalEntryRef}
          journalEntryRefLoading={pageState.journalEntryRefLoading}
          onEditClick={actions.handleEditClick}
          onDeleteClick={actions.handleDeleteClick}
          onPrint={() => pageState.setPrintDialogOpen(true)}
          onNavigateToGoodsReceived={navigateToGoodsReceived}
          onNavigateToVendorPayment={navigateToVendorPayment}
          onNavigateToJournalEntry={navigateToJournalEntry}
          onUnpay={actions.handleUnpay}
          onOpenPaymentDialog={actions.handleOpenPaymentDialog}
          onReturn={actions.handleReturn}
          onReceive={actions.handleReceive}
        />
      )}
      workspaceSlot={<PurchaseOrderWorkspaceCard selectedOrder={selectedOrder} />}
      dialogs={(
        <PurchaseOrdersDialogs
          selectedOrder={selectedOrder}
          deleteConfirmOpen={pageState.deleteConfirmOpen}
          orderToDelete={pageState.orderToDelete}
          onCancelDelete={() => {
            pageState.setDeleteConfirmOpen(false)
            pageState.setOrderToDelete(null)
          }}
          onConfirmDelete={() => actions.handleDeleteConfirm(pageState.orderToDelete)}
          deletedOrdersDialogOpen={pageState.deletedOrdersDialogOpen}
          onCloseDeletedOrdersDialog={() => pageState.setDeletedOrdersDialogOpen(false)}
          onRefreshDeletedOrders={loadOrders}
          blockedDialogOpen={pageState.blockedDialogOpen}
          blockedDialogType={pageState.blockedDialogType}
          onCloseBlockedDialog={() => pageState.setBlockedDialogOpen(false)}
          onReturnAndEdit={actions.handleReturnAndEdit}
          onReturnOnly={actions.handleReturnOnly}
          onUnpayAndEdit={actions.handleUnpayAndEdit}
          onReturnAndDelete={actions.handleReturnAndDelete}
          onUnpayAndDelete={actions.handleUnpayAndDelete}
          isLoading={pageState.isLoading}
          printDialogOpen={pageState.printDialogOpen}
          onClosePrintDialog={() => pageState.setPrintDialogOpen(false)}
          paymentDialogOpen={pageState.paymentDialogOpen}
          paymentDialogOrder={pageState.paymentDialogOrder}
          onClosePaymentDialog={() => pageState.setPaymentDialogOpen(false)}
          onSubmitPayments={actions.handleRecordPayments}
        />
      )}
    />
  )
}

export default PurchaseOrdersPage
