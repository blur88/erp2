import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Box, useMediaQuery, useTheme } from '@mui/material'
import { useStore } from 'react-redux'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

import MasterDetailWorkspace from '@/components/common/MasterDetailWorkspace'
import PageHeader from '@/components/common/PageHeader'
import { FilterBar } from '@/components/filters'
import OrderContextHeader from './components/OrderContextHeader'
import OrdersDialogs from './components/OrdersDialogs'
import OrderWorkspaceCard from './components/OrderWorkspaceCard'
import OrdersTable from './components/OrdersTable'
import { useOrdersActions } from './hooks/useOrdersActions'
import { useOrdersPageState } from './hooks/useOrdersPageState'
import { useOrdersSelection } from './hooks/useOrdersSelection'

import { useFilterBar } from '@/hooks/useFilterBar'
import { useNotification } from '@/hooks/useNotification'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import type { RootState } from '@/store'
import {
  useDeleteSalesOrderMutation,
  useGetCustomersQuery,
  useGetSalesOrdersQuery,
  useLazyGetSalesOrderQuery,
} from '@/store/api/salesApi'
import {
  selectSalesError,
  selectSelectedOrder,
} from '@/store/slices/salesSlice'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'

interface SalesOrderFilters {
  search: string
  customerId: string | null
  paymentStatus: 'unpaid' | 'partial' | 'paid' | 'overpaid' | null
  period: PeriodValue
  fulfillmentStatus: 'fulfilled' | 'unfulfilled' | null
}

export const OrdersPage: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const location = useLocation()
  const navigate = useNavigate()
  const [, setSearchParams] = useSearchParams()
  const dispatch = useAppDispatch()
  const store = useStore()
  const { showSuccess, showError } = useNotification()
  const error = useAppSelector(selectSalesError)
  const selectedOrder = useAppSelector(selectSelectedOrder)
  const [triggerGetSalesOrder] = useLazyGetSalesOrderQuery()
  const [deleteSalesOrder] = useDeleteSalesOrderMutation()
  const pageState = useOrdersPageState()
  const [sortBy, setSortBy] = useState('orderNumber')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const { data: customersData } = useGetCustomersQuery({ limit: 999999 })
  const customers = customersData?.data ?? []

  const filterConfig = useMemo<FilterBarConfig<SalesOrderFilters>>(
    () => ({
      search: { placeholder: 'Search orders...' },
      fields: [
        {
          field: 'period',
          label: 'Period',
          type: 'period',
        },
        {
          field: 'customerId',
          label: 'Customer',
          type: 'select',
          options: customers.map((customer) => ({ value: customer.id, label: customer.name })),
        },
        {
          field: 'paymentStatus',
          label: 'Payment',
          type: 'select',
          options: [
            { value: 'unpaid', label: 'Unpaid' },
            { value: 'partial', label: 'Partial' },
            { value: 'paid', label: 'Paid' },
            { value: 'overpaid', label: 'Overpaid' },
          ],
        },
        {
          field: 'fulfillmentStatus',
          label: 'Fulfillment',
          type: 'select',
          options: [
            { value: 'unfulfilled', label: 'Unfulfilled' },
            { value: 'fulfilled', label: 'Fulfilled' },
          ],
        },
      ],
      defaults: {
        search: '',
        customerId: null,
        paymentStatus: null,
        period: { key: null, from: null, to: null },
        fulfillmentStatus: null,
      },
    }),
    [customers],
  )

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)
  const weekStartsOn = getStartOfWeek()
  const dateRange = useMemo(() => {
    const period = appliedFilters.period
    if (!period || period.key === null) {
      return { fromDate: undefined, toDate: undefined }
    }
    if (period.key === 'custom') {
      return { fromDate: period.from ?? undefined, toDate: period.to ?? undefined }
    }

    const range = getPeriodDateRange(period.key, weekStartsOn)
    return { fromDate: range.from, toDate: range.to }
  }, [appliedFilters.period, weekStartsOn])

  const orderQueryArgs = useMemo(() => ({
    sortBy,
    sortOrder,
    search: appliedFilters.search || undefined,
    customerId: appliedFilters.customerId || undefined,
    paymentStatus: appliedFilters.paymentStatus || undefined,
    fulfillmentStatus: appliedFilters.fulfillmentStatus || undefined,
    fromDate: dateRange.fromDate,
    toDate: dateRange.toDate,
  }), [appliedFilters, dateRange, sortBy, sortOrder])

  const { data: ordersData, isLoading: loading, refetch: refetchOrders } = useGetSalesOrdersQuery(orderQueryArgs)
  const orders = ordersData?.data ?? []
  const pagination = ordersData?.meta

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
    getState: () => store.getState() as RootState,
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
    setSortOrder((prev) => (sortBy === field && prev === 'desc' ? 'asc' : 'desc'))
    setSortBy(field)
  }, [sortBy])

  const filterHandlers = useMemo(() => ({
    ...handlers,
    onSearchChange: (value: string) => {
      pageState.setShouldPreserveSearchFocus(true)
      handlers.onSearchChange(value)
    },
  }), [handlers, pageState])

  useKeyboardShortcuts({
    onSearch: () => {
      pageState.searchInputRef.current?.focus()
      pageState.searchInputRef.current?.select()
    },
    onArrowUp: selection.handleNavigateUp,
    onArrowDown: selection.handleNavigateDown,
    onEnter: selection.handleEnterAction,
    onPageUp: selection.handlePageUpNavigation,
    onPageDown: selection.handlePageDownNavigation,
    onHome: selection.handleNavigateToFirst,
    onEnd: selection.handleNavigateToLast,
    onEscape: selection.handleEscapeAction,
  })

  const navigateToJournalEntry = useCallback(() => {
    if (selectedOrder) {
      navigate(`/accounting/journal-entries?sourceType=sales_order&sourceId=${selectedOrder.id}`)
    }
  }, [navigate, selectedOrder])

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Sales Orders"
        subtitle="Track sales orders and delivery status"
        secondaryAction={{ label: 'View Deleted', onClick: () => pageState.setDeletedOrdersDialogOpen(true) }}
        primaryAction={{ label: 'Create Order', onClick: () => navigate('/sales/orders/create') }}
      />

      <Box sx={{ mb: 2 }}>
        <FilterBar
          config={filterConfig}
          draftFilters={draftFilters}
          handlers={filterHandlers}
          hasActiveFilters={hasActiveFilters}
          searchInputRef={pageState.searchInputRef}
          sort={{ field: 'orderNumber', sortBy, sortOrder, onSort: handleSort }}
        />
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <MasterDetailWorkspace
        isMobile={isMobile}
        listSlot={(
          <OrdersTable
            orders={orders}
            loading={loading}
            total={pagination?.total || 0}
            selectedOrderId={selectedOrder?.id}
            focusedOrderIndex={pageState.focusedOrderIndex}
            onOrderSelect={selection.handleOrderSelect}
            orderListRef={pageState.orderListRef}
          />
        )}
        headerSlot={(
          <OrderContextHeader
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
        )}
        workspaceSlot={<OrderWorkspaceCard selectedOrder={selectedOrder} />}
      />

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
