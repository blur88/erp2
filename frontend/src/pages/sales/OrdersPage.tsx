import React, { useCallback, useEffect } from 'react'
import { Alert, Box, useMediaQuery, useTheme } from '@mui/material'
import Grid from '@mui/material/GridLegacy'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

import OrdersDialogs from './components/OrdersDialogs'
import OrderDetailsPanel from './components/OrderDetailsPanel'
import OrdersTable from './components/OrdersTable'
import OrdersToolbar from './components/OrdersToolbar'
import { useOrdersActions } from './hooks/useOrdersActions'
import { useOrdersPageState } from './hooks/useOrdersPageState'
import { useOrdersSelection } from './hooks/useOrdersSelection'

import { useNotification } from '@/hooks/useNotification'
import { useSearchAndFilter, useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  useDeleteSalesOrderMutation,
  useGetCustomersQuery,
  useGetSalesOrdersQuery,
  useLazyGetSalesOrderQuery,
} from '@/store/api/salesApi'
import {
  clearError,
  selectOrderFilters,
  selectSalesError,
  selectSelectedOrder,
  setOrderFilters,
} from '@/store/slices/salesSlice'

const OrdersPage: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const location = useLocation()
  const navigate = useNavigate()
  const [, setSearchParams] = useSearchParams()
  const dispatch = useAppDispatch()
  const { showSuccess, showError } = useNotification()
  const error = useAppSelector(selectSalesError)
  const selectedOrder = useAppSelector(selectSelectedOrder)
  const orderFilters = useAppSelector(selectOrderFilters)
  const [triggerGetSalesOrder] = useLazyGetSalesOrderQuery()
  const [deleteSalesOrder] = useDeleteSalesOrderMutation()
  const pageState = useOrdersPageState()

  const getDateRange = useCallback((filter: string) => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const startOfWeek = new Date(today)
    startOfWeek.setDate(today.getDate() - today.getDay())
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    const startOfYear = new Date(today.getFullYear(), 0, 1)
    const toDateParam = (date: Date) => date.toISOString().split('T')[0]

    switch (filter) {
      case 'today':
        return { fromDate: toDateParam(today), toDate: toDateParam(today) }
      case 'yesterday':
        return { fromDate: toDateParam(yesterday), toDate: toDateParam(yesterday) }
      case 'this_week':
        return { fromDate: toDateParam(startOfWeek), toDate: toDateParam(today) }
      case 'this_month':
        return { fromDate: toDateParam(startOfMonth), toDate: toDateParam(today) }
      case 'this_year':
        return { fromDate: toDateParam(startOfYear), toDate: toDateParam(today) }
      case 'custom':
        return { fromDate: orderFilters.customFromDate, toDate: orderFilters.customToDate }
      default:
        return { fromDate: undefined, toDate: undefined }
    }
  }, [orderFilters.customFromDate, orderFilters.customToDate])

  const dateRange = getDateRange(orderFilters.dateFilter)
  const orderQueryArgs = {
    sortBy: orderFilters.sortBy,
    sortOrder: orderFilters.sortOrder,
    search: orderFilters.search || undefined,
    customerId: orderFilters.customerId === 'all' ? undefined : orderFilters.customerId,
    fromDate: dateRange.fromDate,
    toDate: dateRange.toDate,
    paymentStatus: orderFilters.paymentStatus === 'all' ? undefined : orderFilters.paymentStatus,
    fulfillmentStatus: orderFilters.fulfillmentStatus === 'all' ? undefined : orderFilters.fulfillmentStatus,
  }

  const { data: ordersData, isLoading: loading, refetch: refetchOrders } = useGetSalesOrdersQuery(orderQueryArgs)
  const { data: customersData } = useGetCustomersQuery({ limit: 999999 })
  const orders = ordersData?.data ?? []
  const customers = customersData?.data ?? []
  const pagination = ordersData?.meta

  const onSearchChange = useCallback((search: string) => {
    dispatch(setOrderFilters({ search }))
  }, [dispatch])

  const { searchTerm, setSearchTerm: originalSetSearchTerm, focusSearchInput } = useSearchAndFilter({
    initialSearchTerm: orderFilters.search,
    onSearchChange,
    searchInputRef: pageState.searchInputRef,
  })

  const setSearchTerm = useCallback((value: string) => {
    pageState.setShouldPreserveSearchFocus(true)
    originalSetSearchTerm(value)
  }, [originalSetSearchTerm, pageState])

  useEffect(() => {
    if (pageState.shouldPreserveSearchFocus && pageState.searchInputRef.current && document.activeElement !== pageState.searchInputRef.current) {
      const timer = setTimeout(() => {
        pageState.searchInputRef.current?.focus()
        pageState.setShouldPreserveSearchFocus(false)
      }, 0)
      return () => clearTimeout(timer)
    }
    if (pageState.shouldPreserveSearchFocus) {
      pageState.setShouldPreserveSearchFocus(false)
    }
  }, [loading, pageState])

  const loadOrders = useCallback(() => {
    void refetchOrders()
  }, [refetchOrders])

  const actions = useOrdersActions({
    dispatch,
    navigate,
    orders,
    selectedOrder,
    triggerGetSalesOrder,
    deleteSalesOrder,
    refetchOrders: loadOrders,
    showSuccess,
    showError,
    setBlockedDialogAction: pageState.setBlockedDialogAction,
    setBlockedDialogOpen: pageState.setBlockedDialogOpen,
    setDeleteConfirmOpen: pageState.setDeleteConfirmOpen,
    setOrderToDelete: pageState.setOrderToDelete,
    setOrderToDeleteName: pageState.setOrderToDeleteName,
    setIsLoading: pageState.setIsLoading,
    setPaymentDialogOpen: pageState.setPaymentDialogOpen,
  })

  const selection = useOrdersSelection({
    dispatch,
    orders,
    selectedOrder,
    pendingOrderToSelect: pageState.pendingOrderToSelect,
    setPendingOrderToSelect: pageState.setPendingOrderToSelect,
    focusedOrderIndex: pageState.focusedOrderIndex,
    setFocusedOrderIndex: pageState.setFocusedOrderIndex,
    triggerGetSalesOrder,
    loadOrders,
    navigate,
    locationPathname: location.pathname,
    setSearchParams,
    orderListRef: pageState.orderListRef,
    searchInputRef: pageState.searchInputRef,
    processedHighlightRef: pageState.processedHighlightRef,
    userHasNavigatedRef: pageState.userHasNavigatedRef,
    hasRefreshedPersistedOrder: pageState.hasRefreshedPersistedOrder,
    isRefreshingPersistedOrder: pageState.isRefreshingPersistedOrder,
    setJournalEntryRef: pageState.setJournalEntryRef,
    setJournalEntryRefLoading: pageState.setJournalEntryRefLoading,
    setViewDialog: pageState.setViewDialog,
    setBlockedDialogOpen: pageState.setBlockedDialogOpen,
    setDeletedOrdersDialogOpen: pageState.setDeletedOrdersDialogOpen,
    setDeleteConfirmOpen: pageState.setDeleteConfirmOpen,
  })

  const handleSort = useCallback((field: string) => {
    const newSortOrder = orderFilters.sortBy === field && orderFilters.sortOrder === 'desc' ? 'asc' : 'desc'
    dispatch(setOrderFilters({ sortBy: field, sortOrder: newSortOrder }))
  }, [dispatch, orderFilters.sortBy, orderFilters.sortOrder])

  useKeyboardShortcuts({
    onSearch: focusSearchInput,
    onArrowUp: selection.handleNavigateUp,
    onArrowDown: selection.handleNavigateDown,
    onEnter: selection.handleEnterAction,
    onPageUp: selection.handlePageUpNavigation,
    onPageDown: selection.handlePageDownNavigation,
    onHome: selection.handleNavigateToFirst,
    onEnd: selection.handleNavigateToLast,
    onEscape: selection.handleEscapeAction,
  })

  const resetFilters = useCallback(() => {
    dispatch(setOrderFilters({
      dateFilter: 'all',
      customFromDate: '',
      customToDate: '',
      customerId: 'all',
      paymentStatus: 'all',
      fulfillmentStatus: 'all',
    }))
  }, [dispatch])

  const navigateToJournalEntry = useCallback(() => {
    if (selectedOrder) {
      navigate(`/accounting/journal-entries?sourceType=sales_order&sourceId=${selectedOrder.id}`)
    }
  }, [navigate, selectedOrder])

  return (
    <Box sx={{ p: 3 }}>
      <OrdersToolbar
        isMobile={isMobile}
        ordersCount={orders.length}
        searchInputRef={pageState.searchInputRef}
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        orderFilters={orderFilters}
        customers={customers}
        onFilterChange={(filters) => dispatch(setOrderFilters(filters))}
        onClearFilters={resetFilters}
        onSort={handleSort}
        onOpenDeleted={() => pageState.setDeletedOrdersDialogOpen(true)}
        onCreateOrder={() => navigate('/sales/orders/create')}
      />

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} md={3}>
          <OrdersTable
            orders={orders}
            loading={loading}
            total={pagination?.total || 0}
            selectedOrderId={selectedOrder?.id}
            focusedOrderIndex={pageState.focusedOrderIndex}
            onOrderSelect={selection.handleOrderSelect}
            orderListRef={pageState.orderListRef}
          />
        </Grid>
        <Grid item xs={12} md={9}>
          <OrderDetailsPanel
            selectedOrder={selectedOrder}
            isLoading={pageState.isLoading}
            journalEntryRef={pageState.journalEntryRef}
            journalEntryRefLoading={pageState.journalEntryRefLoading}
            onEditOrder={actions.handleEditOrder}
            onDeleteOrder={() => selectedOrder && void actions.handleOrderAction('delete', selectedOrder.id)}
            onPrintOrder={() => pageState.setPrintDialogOpen(true)}
            onNavigateToInvoice={selection.handleNavigateToInvoice}
            onNavigateToPayment={selection.handleNavigateToPayment}
            onNavigateToJournalEntry={navigateToJournalEntry}
            onRefundOrder={actions.handleRefundOrder}
            onUnpayOrder={actions.handleUnpayOrder}
            onOpenPaymentDialog={actions.openPaymentDialog}
            onFulfillOrder={actions.handleFulfillOrder}
            onUnfulfillOrder={actions.handleUnfulfillOrder}
          />
        </Grid>
      </Grid>

      <OrdersDialogs
        selectedOrder={selectedOrder}
        viewDialogOpen={pageState.viewDialog}
        onCloseViewDialog={() => pageState.setViewDialog(false)}
        blockedDialogOpen={pageState.blockedDialogOpen}
        blockedDialogAction={pageState.blockedDialogAction}
        onCloseBlockedDialog={() => pageState.setBlockedDialogOpen(false)}
        onUnfulfillAndEdit={actions.handleUnfulfillAndEdit}
        onUnfulfillOnly={actions.handleUnfulfillOnly}
        onUnpayAndEdit={actions.handleUnpayAndEdit}
        onUnfulfillAndDelete={actions.handleUnfulfillAndDelete}
        onUnpayAndDelete={actions.handleUnpayAndDelete}
        deletedOrdersDialogOpen={pageState.deletedOrdersDialogOpen}
        onCloseDeletedOrdersDialog={() => pageState.setDeletedOrdersDialogOpen(false)}
        deleteConfirmOpen={pageState.deleteConfirmOpen}
        orderToDeleteName={pageState.orderToDeleteName}
        onConfirmDelete={() => actions.handleConfirmDelete(pageState.orderToDelete, pageState.orderToDeleteName)}
        onCancelDelete={actions.handleCancelDelete}
        printDialogOpen={pageState.printDialogOpen}
        onClosePrintDialog={() => pageState.setPrintDialogOpen(false)}
        paymentDialogOpen={pageState.paymentDialogOpen}
        onClosePaymentDialog={() => pageState.setPaymentDialogOpen(false)}
        onSubmitPayments={actions.handleRecordPayments}
        isLoading={pageState.isLoading}
      />
    </Box>
  )
}

export default OrdersPage
