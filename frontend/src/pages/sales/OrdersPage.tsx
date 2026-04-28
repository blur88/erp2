import React, { useCallback, useMemo, useState } from 'react'
import { useStore } from 'react-redux'
import { useNavigate } from 'react-router-dom'

import GenericListPage from '@/components/common/GenericListPage'
import OrderContextHeader from './components/OrderContextHeader'
import OrdersDialogs from './components/OrdersDialogs'
import OrderWorkspaceCard from './components/OrderWorkspaceCard'
import OrdersTable from './components/OrdersTable'
import { useOrdersWorkspace } from './hooks/useOrdersWorkspace'

import { useFilterBar } from '@/hooks/useFilterBar'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import type { RootState } from '@/store'
import {
  useGetSalesOrdersQuery,
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
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const store = useStore()
  const error = useAppSelector(selectSalesError)
  const selectedOrder = useAppSelector(selectSelectedOrder)
  const [sortBy, setSortBy] = useState('orderNumber')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

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
          type: 'customer',
        },
        {
          field: 'paymentStatus',
          label: 'Payment',
          type: 'payment-status',
        },
        {
          field: 'fulfillmentStatus',
          label: 'Order Status',
          type: 'order-status',
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
    [],
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

  const loadOrders = useCallback(() => {
    void refetchOrders()
  }, [refetchOrders])

  const workspace = useOrdersWorkspace({
    dispatch,
    getState: () => store.getState() as RootState,
    orders,
    selectedOrder,
    refetchOrders: loadOrders,
  })

  const handleSort = useCallback((field: string) => {
    setSortOrder((prev) => (sortBy === field && prev === 'desc' ? 'asc' : 'desc'))
    setSortBy(field)
  }, [sortBy])

  const filterHandlers = useMemo(() => ({
    ...handlers,
    onSearchChange: (value: string) => {
      workspace.setShouldPreserveSearchFocus(true)
      handlers.onSearchChange(value)
    },
  }), [handlers, workspace])

  return (
    <GenericListPage
      title="Sales Orders"
      subtitle="Track sales orders and delivery status"
      secondaryAction={{ label: 'View Deleted', onClick: () => workspace.setDeletedOrdersDialogOpen(true) }}
      primaryAction={{ label: 'Create Order', onClick: () => navigate('/sales/orders/create') }}
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={filterHandlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={workspace.searchInputRef}
      sort={{ field: 'orderNumber', sortBy, sortOrder, onSort: handleSort }}
      error={error || null}
      listSlot={(
        <OrdersTable
          orders={orders}
          loading={loading}
          total={pagination?.total || 0}
          selectedOrderId={selectedOrder?.id}
          focusedOrderIndex={workspace.focusedOrderIndex}
          onOrderSelect={workspace.handleOrderSelect}
          orderListRef={workspace.orderListRef}
        />
      )}
      headerSlot={(
        <OrderContextHeader
          selectedOrder={selectedOrder}
          isLoading={workspace.isLoading}
          journalEntryRefs={workspace.journalEntryRefs}
          journalEntryRefsLoading={workspace.journalEntryRefsLoading}
          onEditOrder={workspace.handleEditOrder}
          onDeleteOrder={() => selectedOrder && void workspace.handleOrderAction('delete', selectedOrder.id)}
          onPrintOrder={() => workspace.setPrintDialogOpen(true)}
          onNavigateToInvoice={workspace.handleNavigateToInvoice}
          onNavigateToPayment={workspace.handleNavigateToPayment}
          onNavigateToJournalEntries={workspace.navigateToJournalEntries}
          onRefundOrder={workspace.handleRefundOrder}
          onUnpayOrder={workspace.handleUnpayOrder}
          onOpenPaymentDialog={workspace.openPaymentDialog}
          onFulfillOrder={workspace.handleFulfillOrder}
          onUnfulfillOrder={workspace.handleUnfulfillOrder}
        />
      )}
      workspaceSlot={<OrderWorkspaceCard selectedOrder={selectedOrder} />}
      dialogs={(
        <OrdersDialogs
          selectedOrder={selectedOrder}
          viewDialogOpen={workspace.viewDialog}
          onCloseViewDialog={() => workspace.setViewDialog(false)}
          blockedDialogOpen={workspace.blockedDialogOpen}
          blockedDialogAction={workspace.blockedDialogAction}
          onCloseBlockedDialog={() => workspace.setBlockedDialogOpen(false)}
          onUnfulfillAndEdit={workspace.handleUnfulfillAndEdit}
          onUnfulfillOnly={workspace.handleUnfulfillOnly}
          onUnpayAndEdit={workspace.handleUnpayAndEdit}
          onUnfulfillAndDelete={workspace.handleUnfulfillAndDelete}
          onUnpayAndDelete={workspace.handleUnpayAndDelete}
          deletedOrdersDialogOpen={workspace.deletedOrdersDialogOpen}
          onCloseDeletedOrdersDialog={() => workspace.setDeletedOrdersDialogOpen(false)}
          deleteConfirmOpen={workspace.deleteConfirmOpen}
          orderToDeleteName={workspace.orderToDeleteName}
          onConfirmDelete={() => workspace.handleConfirmDelete(workspace.orderToDelete, workspace.orderToDeleteName)}
          onCancelDelete={workspace.handleCancelDelete}
          printDialogOpen={workspace.printDialogOpen}
          onClosePrintDialog={() => workspace.setPrintDialogOpen(false)}
          paymentDialogOpen={workspace.paymentDialogOpen}
          onClosePaymentDialog={() => workspace.setPaymentDialogOpen(false)}
          onSubmitPayments={workspace.handleRecordPayments}
          isLoading={workspace.isLoading}
        />
      )}
    />
  )
}

export default OrdersPage
