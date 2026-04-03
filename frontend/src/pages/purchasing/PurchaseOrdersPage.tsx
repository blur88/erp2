import React, { useCallback, useMemo } from 'react'
import { ArrowDownward as ArrowDownIcon, ArrowUpward as ArrowUpIcon, Sort as SortIcon } from '@mui/icons-material'
import { Alert, Box, Button, Stack, useMediaQuery, useTheme } from '@mui/material'
import { useNavigate, useSearchParams } from 'react-router-dom'

import MasterDetailWorkspace from '@/components/common/MasterDetailWorkspace'
import PageHeader from '@/components/common/PageHeader'
import { FilterBar } from '@/components/filters'
import PurchaseOrderContextHeader from './components/PurchaseOrderContextHeader'
import PurchaseOrdersDialogs from './components/PurchaseOrdersDialogs'
import PurchaseOrdersTable from './components/PurchaseOrdersTable'
import PurchaseOrderWorkspaceCard from './components/PurchaseOrderWorkspaceCard'
import { usePurchaseOrdersActions } from './hooks/usePurchaseOrdersActions'
import { usePurchaseOrdersPageState } from './hooks/usePurchaseOrdersPageState'
import { usePurchaseOrdersSelection } from './hooks/usePurchaseOrdersSelection'

import { useFilterBar } from '@/hooks/useFilterBar'
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
import type { FilterBarConfig } from '@/types/filterBar.types'

interface PurchaseOrderFilters {
  search: string
  supplierId: string | null
}

export const PurchaseOrdersPage: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { showSuccess, showError } = useNotification()
  const [searchParams, setSearchParams] = useSearchParams()
  const pageState = usePurchaseOrdersPageState()
  const selectedOrder = useAppSelector(selectSelectedPurchaseOrder)

  const { data: suppliersResponse } = useGetSuppliersQuery({})
  const suppliers = suppliersResponse?.data || []

  const filterConfig = useMemo<FilterBarConfig<PurchaseOrderFilters>>(
    () => ({
      search: { placeholder: 'Search purchase orders...' },
      fields: [
        {
          field: 'supplierId',
          label: 'Supplier',
          type: 'select',
          options: suppliers.map((supplier: any) => ({
            value: supplier.id,
            label: supplier.companyName ?? supplier.name,
          })),
        },
      ],
      defaults: {
        search: '',
        supplierId: null,
      },
    }),
    [suppliers],
  )

  const filterBar = useFilterBar(filterConfig)

  const queryParams = useMemo(() => ({
    sortBy: pageState.sorting.sortBy,
    sortOrder: pageState.sorting.sortOrder.toUpperCase(),
    search: filterBar.appliedFilters.search || undefined,
    supplierId: filterBar.appliedFilters.supplierId || undefined,
  }), [filterBar.appliedFilters, pageState.sorting.sortBy, pageState.sorting.sortOrder])

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
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Purchase Orders"
        subtitle="Manage supplier purchase orders and procurement"
        secondaryAction={{ label: 'View Deleted', onClick: () => pageState.setDeletedOrdersDialogOpen(true) }}
        primaryAction={{ label: 'Create Order', onClick: () => navigate('/purchasing/orders/create') }}
      />

      <Stack direction={isMobile ? 'column' : 'row'} spacing={1} alignItems={isMobile ? 'stretch' : 'center'} sx={{ mb: 3 }}>
        <Box sx={{ flex: 1 }}>
          <FilterBar
            config={filterConfig}
            draftFilters={filterBar.draftFilters}
            handlers={filterBar.handlers}
            hasActiveFilters={filterBar.hasActiveFilters}
            searchInputRef={pageState.searchInputRef}
          />
        </Box>
        <Button
          variant={pageState.sorting.sortBy === 'orderNumber' ? 'contained' : 'outlined'}
          size="small"
          startIcon={pageState.sorting.sortBy === 'orderNumber'
            ? pageState.sorting.sortOrder === 'desc'
              ? <ArrowDownIcon />
              : <ArrowUpIcon />
            : <SortIcon />}
          onClick={() => handleSort('orderNumber')}
        >
          Sort
        </Button>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <MasterDetailWorkspace
        isMobile={isMobile}
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
      />

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
