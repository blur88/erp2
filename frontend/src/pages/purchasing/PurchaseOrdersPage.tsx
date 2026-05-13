import React, { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import GenericListPage from '@/components/common/GenericListPage'
import PurchaseOrderContextHeader from './components/PurchaseOrderContextHeader'
import PurchaseOrdersDialogs from './components/PurchaseOrdersDialogs'
import PurchaseOrdersTable from './components/PurchaseOrdersTable'
import PurchaseOrderWorkspaceCard from './components/PurchaseOrderWorkspaceCard'
import { usePurchaseOrdersWorkspace } from './hooks/usePurchaseOrdersWorkspace'

import { useFilterBar } from '@/hooks/useFilterBar'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  useGetPurchaseOrdersQuery,
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

const PurchaseOrdersPage: React.FC = () => {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const selectedOrder = useAppSelector(selectSelectedPurchaseOrder)
  const [sorting, setSorting] = useState<{ sortBy: string; sortOrder: 'asc' | 'desc' }>({
    sortBy: 'orderNumber',
    sortOrder: 'asc',
  })

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
    sortBy: sorting.sortBy,
    sortOrder: sorting.sortOrder.toUpperCase(),
    search: filterBar.appliedFilters.search || undefined,
    supplierId: filterBar.appliedFilters.supplierId || undefined,
    paymentStatus: filterBar.appliedFilters.paymentStatus || undefined,
    status: filterBar.appliedFilters.status || undefined,
    orderDateFrom: dateRange.fromDate,
    orderDateTo: dateRange.toDate,
  }), [dateRange, filterBar.appliedFilters, sorting.sortBy, sorting.sortOrder])

  const {
    data: purchaseOrdersResponse,
    isFetching: loading,
    error: purchaseOrdersError,
    refetch: refetchOrders,
  } = useGetPurchaseOrdersQuery(queryParams)

  const purchaseOrders = purchaseOrdersResponse?.data || []
  const pagination = purchaseOrdersResponse?.meta
  const error =
    purchaseOrdersError && typeof purchaseOrdersError === 'object'
      ? ((purchaseOrdersError as any).data?.message || (purchaseOrdersError as any).data || 'Failed to fetch purchase orders')
      : null

  const loadOrders = useCallback(() => {
    void refetchOrders()
  }, [refetchOrders])
  const workspace = usePurchaseOrdersWorkspace({
    dispatch,
    purchaseOrders,
    selectedOrder,
    refetchOrders: loadOrders,
    isLoading: loading,
  })

  const handleSort = useCallback((field: string) => {
    setSorting((prev) => ({
      ...prev,
      sortBy: field,
      sortOrder: prev.sortBy === field && prev.sortOrder === 'desc' ? 'asc' : 'desc',
    }))
  }, [])

  return (
    <GenericListPage
      title="Purchase Orders"
      subtitle="Manage supplier purchase orders and procurement"
      secondaryAction={{ label: 'View Deleted', onClick: () => workspace.setDeletedOrdersDialogOpen(true) }}
      primaryAction={{ label: 'Create Order', onClick: () => navigate('/purchasing/orders/create') }}
      filterConfig={filterConfig}
      draftFilters={filterBar.draftFilters}
      handlers={filterBar.handlers}
      hasActiveFilters={filterBar.hasActiveFilters}
      searchInputRef={workspace.searchInputRef}
      sort={{
        field: 'orderNumber',
        sortBy: sorting.sortBy,
        sortOrder: sorting.sortOrder,
        onSort: handleSort,
      }}
      error={error}
      listSlot={(
        <PurchaseOrdersTable
          purchaseOrders={purchaseOrders}
          loading={loading}
          total={pagination?.total || 0}
          selectedOrderId={selectedOrder?.id}
          focusedOrderIndex={workspace.focusedOrderIndex}
          onOrderSelect={workspace.handleOrderSelect}
          orderListRef={workspace.orderListRef}
        />
      )}
      headerSlot={(
        <PurchaseOrderContextHeader
          selectedOrder={selectedOrder}
          isLoading={workspace.isLoading}
          journalEntryRefs={workspace.journalEntryRefs}
          journalEntryRefLoading={workspace.journalEntryRefsLoading}
          onEditClick={workspace.handleEditClick}
          onDeleteClick={workspace.handleDeleteClick}
          onPrint={() => workspace.setPrintDialogOpen(true)}
          onNavigateToGoodsReceived={workspace.navigateToGoodsReceived}
          onNavigateToVendorPayment={workspace.navigateToVendorPayment}
          onNavigateToJournalEntry={workspace.navigateToJournalEntries}
          onUnpay={workspace.handleUnpay}
          onOpenPaymentDialog={workspace.handleOpenPaymentDialog}
          onReturn={workspace.handleReturn}
          onReceive={workspace.handleReceive}
          isLocked={
            !!(selectedOrder?.goodsReceivedNotes?.some((grn: any) => grn.status === 'received')) ||
            Number(selectedOrder?.paidAmount || 0) > 0
          }
          lockTooltip={(() => {
            const hasReceivedGoods = !!(selectedOrder?.goodsReceivedNotes?.some((grn: any) => grn.status === 'received'))
            const hasPayments = Number(selectedOrder?.paidAmount || 0) > 0
            if (hasReceivedGoods && hasPayments) return 'return goods and unpay before editing'
            if (hasReceivedGoods) return 'return goods before editing'
            if (hasPayments) return 'unpay before editing'
            return 'unlocked — editable'
          })()}
        />
      )}
      workspaceSlot={<PurchaseOrderWorkspaceCard selectedOrder={selectedOrder} />}
      dialogs={(
        <PurchaseOrdersDialogs
          selectedOrder={selectedOrder}
          deleteConfirmOpen={workspace.deleteConfirmOpen}
          orderToDelete={workspace.orderToDelete}
          onCancelDelete={() => {
            workspace.setDeleteConfirmOpen(false)
            workspace.setOrderToDelete(null)
          }}
          onConfirmDelete={() => workspace.handleDeleteConfirm(workspace.orderToDelete)}
          deletedOrdersDialogOpen={workspace.deletedOrdersDialogOpen}
          onCloseDeletedOrdersDialog={() => workspace.setDeletedOrdersDialogOpen(false)}
          onRefreshDeletedOrders={loadOrders}
          blockedDialogOpen={workspace.blockedDialogOpen}
          blockedDialogType={workspace.blockedDialogType}
          onCloseBlockedDialog={() => workspace.setBlockedDialogOpen(false)}
          onReturnAndEdit={workspace.handleReturnAndEdit}
          onReturnOnly={workspace.handleReturnOnly}
          onUnpayAndEdit={workspace.handleUnpayAndEdit}
          onReturnAndDelete={workspace.handleReturnAndDelete}
          onUnpayAndDelete={workspace.handleUnpayAndDelete}
          isLoading={workspace.isLoading}
          printDialogOpen={workspace.printDialogOpen}
          onClosePrintDialog={() => workspace.setPrintDialogOpen(false)}
          paymentDialogOpen={workspace.paymentDialogOpen}
          paymentDialogOrder={workspace.paymentDialogOrder}
          onClosePaymentDialog={() => workspace.setPaymentDialogOpen(false)}
          onSubmitPayments={workspace.handleRecordPayments}
        />
      )}
    />
  )
}

export default PurchaseOrdersPage
