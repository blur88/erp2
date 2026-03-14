import React, { useCallback, useMemo } from 'react'
import { Alert, Box, useMediaQuery, useTheme } from '@mui/material'
import Grid from '@mui/material/GridLegacy'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

import PurchaseOrderDetailsPanel from './components/PurchaseOrderDetailsPanel'
import PurchaseOrdersDialogs from './components/PurchaseOrdersDialogs'
import PurchaseOrdersTable from './components/PurchaseOrdersTable'
import PurchaseOrdersToolbar from './components/PurchaseOrdersToolbar'
import { usePurchaseOrdersActions } from './hooks/usePurchaseOrdersActions'
import { usePurchaseOrdersPageState } from './hooks/usePurchaseOrdersPageState'
import { usePurchaseOrdersSelection } from './hooks/usePurchaseOrdersSelection'
import { getDateRangeFromFilter } from './utils'

import { useNotification } from '@/hooks/useNotification'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  useDeletePurchaseOrderMutation,
  useGetPurchaseOrdersQuery,
  useGetSuppliersQuery,
  useLazyGetPurchaseOrderQuery,
  useMarkPurchaseOrderAsUnpaidMutation,
  useReceiveGoodsMutation,
  useRecordOrderPaymentsMutation,
  useReturnGoodsMutation,
} from '@/store/api/purchasingApi'
import { selectSelectedPurchaseOrder } from '@/store/slices/purchasingSlice'

const PurchaseOrdersPage: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const location = useLocation()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { showSuccess, showError } = useNotification()
  const [searchParams, setSearchParams] = useSearchParams()
  const pageState = usePurchaseOrdersPageState()
  const selectedOrder = useAppSelector(selectSelectedPurchaseOrder)

  const queryParams = useMemo(() => {
    const dateRange = getDateRangeFromFilter(
      pageState.filters.dateFilter,
      pageState.filters.customFromDate,
      pageState.filters.customToDate,
    )
    return {
      sortBy: pageState.filters.sortBy,
      sortOrder: pageState.filters.sortOrder.toUpperCase(),
      search: pageState.filters.search,
      supplierId: pageState.filters.supplierFilter === 'all' ? undefined : pageState.filters.supplierFilter,
      orderDateFrom: dateRange.fromDate,
      orderDateTo: dateRange.toDate,
    }
  }, [pageState.filters])

  const {
    data: purchaseOrdersResponse,
    isFetching: loading,
    error: purchaseOrdersError,
    refetch: refetchOrders,
  } = useGetPurchaseOrdersQuery(queryParams)
  const { data: suppliersResponse } = useGetSuppliersQuery({})
  const [fetchPurchaseOrder] = useLazyGetPurchaseOrderQuery()
  const [receiveGoods] = useReceiveGoodsMutation()
  const [returnGoods] = useReturnGoodsMutation()
  const [markPurchaseOrderAsUnpaid] = useMarkPurchaseOrderAsUnpaidMutation()
  const [recordOrderPayments] = useRecordOrderPaymentsMutation()
  const [deletePurchaseOrder] = useDeletePurchaseOrderMutation()

  const purchaseOrders = purchaseOrdersResponse?.data || []
  const suppliers = suppliersResponse?.data || []
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
    pageState.setFilters((prev) => ({
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
    <Box sx={{ p: 3 }}>
      {import.meta.env.DEV && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Debug: PurchaseOrdersPage loaded | Orders: {purchaseOrders.length} | Loading: {String(loading)} | Error: {error || 'None'}
        </Alert>
      )}

      <PurchaseOrdersToolbar
        isMobile={isMobile}
        ordersCount={purchaseOrders.length}
        filters={pageState.filters}
        suppliers={suppliers}
        searchInputRef={pageState.searchInputRef}
        onFilterChange={(updates) => pageState.setFilters((prev) => ({ ...prev, ...updates }))}
        onClearFilters={() => pageState.setFilters((prev) => ({ ...prev, dateFilter: 'all', customFromDate: '', customToDate: '', supplierFilter: 'all' }))}
        onSort={handleSort}
        onOpenDeleted={() => pageState.setDeletedOrdersDialogOpen(true)}
        onCreateOrder={() => navigate('/purchasing/orders/create')}
      />

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} md={3}>
          <PurchaseOrdersTable
            purchaseOrders={purchaseOrders}
            loading={loading}
            total={pagination?.total || 0}
            selectedOrderId={selectedOrder?.id}
            focusedOrderIndex={pageState.focusedOrderIndex}
            onOrderSelect={selection.handleOrderSelect}
            orderListRef={pageState.orderListRef}
          />
        </Grid>
        <Grid item xs={12} md={9}>
          <PurchaseOrderDetailsPanel
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
        </Grid>
      </Grid>

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
    </Box>
  )
}

export default PurchaseOrdersPage
