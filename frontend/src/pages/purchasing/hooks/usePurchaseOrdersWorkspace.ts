import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { useJournalEntryRef } from '@/hooks/useJournalEntryRef'
import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import type { AppDispatch } from '@/store'
import {
  useDeletePurchaseOrderMutation,
  useLazyGetPurchaseOrderQuery,
  useMarkPurchaseOrderAsUnpaidMutation,
  useReceiveGoodsMutation,
  useRecordOrderPaymentsMutation,
  useReturnGoodsMutation,
} from '@/store/api/purchasingApi'
import {
  setSelectedPurchaseOrder,
  updatePurchaseOrderInPlace,
} from '@/store/slices/purchasingSlice'
import type { PurchaseOrder } from '@/types'

export interface PurchaseOrdersSorting {
  sortBy: string
  sortOrder: 'asc' | 'desc'
}

export interface PurchaseJournalEntryRef {
  referenceNumber: string
  sourceType: string
  sourceId: string
}

export interface UsePurchaseOrdersWorkspaceConfig {
  dispatch: AppDispatch
  purchaseOrders: PurchaseOrder[]
  selectedOrder: PurchaseOrder | null
  refetchOrders: () => void
}

export function usePurchaseOrdersWorkspace({
  dispatch,
  purchaseOrders,
  selectedOrder,
  refetchOrders,
}: UsePurchaseOrdersWorkspaceConfig) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const [searchParams, setSearchParams] = useSearchParams()

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [orderToDelete, setOrderToDelete] = useState<PurchaseOrder | null>(null)
  const [deletedOrdersDialogOpen, setDeletedOrdersDialogOpen] = useState(false)
  const [blockedDialogOpen, setBlockedDialogOpen] = useState(false)
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [blockedDialogType, setBlockedDialogType] = useState<'edit' | 'delete'>('edit')
  const [isLoading, setIsLoading] = useState(false)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [paymentDialogOrder, setPaymentDialogOrder] = useState<PurchaseOrder | null>(null)

  const [fetchPurchaseOrder] = useLazyGetPurchaseOrderQuery()
  const [receiveGoods] = useReceiveGoodsMutation()
  const [returnGoods] = useReturnGoodsMutation()
  const [markPurchaseOrderAsUnpaid] = useMarkPurchaseOrderAsUnpaidMutation()
  const [recordOrderPayments] = useRecordOrderPaymentsMutation()
  const [deletePurchaseOrder] = useDeletePurchaseOrderMutation()

  const workspace = useEntityWorkspace({
    entities: purchaseOrders,
    selectedEntity: selectedOrder,
    selectEntity: (order) => dispatch(setSelectedPurchaseOrder(order)),
    refetch: refetchOrders,
    navigate,
    highlightParam: 'highlight',
    routes: {
      create: '/purchasing/orders/create',
      edit: (id) => `/purchasing/orders/${id}/edit`,
    },
    notifications: { showSuccess, showError },
    deleteMutation: async (id) => {
      await deletePurchaseOrder(id).unwrap()
    },
    onEscape: () => {
      dispatch(setSelectedPurchaseOrder(null))
      setDeleteConfirmOpen(false)
      setBlockedDialogOpen(false)
      setDeletedOrdersDialogOpen(false)
    },
  })

  const { setFocusedIndex } = workspace

  // Legacy ?poId= navigation param (cross-page navigation from GRN/VP pages)
  useEffect(() => {
    const poId = searchParams.get('poId')
    if (!poId || purchaseOrders.length === 0) {
      return
    }

    const order = purchaseOrders.find((candidate) => candidate.id === poId)
    if (order) {
      dispatch(setSelectedPurchaseOrder(order))
      setFocusedIndex(purchaseOrders.findIndex((candidate) => candidate.id === poId))
      setSearchParams({})
    }
  }, [dispatch, purchaseOrders, searchParams, setFocusedIndex, setSearchParams])

  const journalSources = [
    ...(selectedOrder?.goodsReceivedNotes ?? []).map((grn: any) => ({
      sourceType: 'goods_received_note',
      sourceId: grn.id as string | undefined,
    })),
    ...(selectedOrder?.vendorPayments ?? []).map((payment: any) => ({
      sourceType: 'vendor_payment',
      sourceId: payment.id as string | undefined,
    })),
  ]

  const { journalEntryRef, journalEntryRefLoading, navigateToJournalEntry } =
    useJournalEntryRef(journalSources)

  const handleOrderSelect = useCallback(
    async (order: PurchaseOrder) => {
      workspace.handleSelect(order)
      try {
        const freshOrder = await fetchPurchaseOrder(order.id).unwrap()
        dispatch(setSelectedPurchaseOrder(freshOrder))
        dispatch(updatePurchaseOrderInPlace(freshOrder))
      } catch {
        dispatch(setSelectedPurchaseOrder(order))
      }
    },
    [dispatch, fetchPurchaseOrder, workspace],
  )

  const selectAfterDelete = useCallback(
    (deletedId: string) => {
      const deletedIndex = purchaseOrders.findIndex((order) => order.id === deletedId)
      if (purchaseOrders.length > 1) {
        const nextIndex = deletedIndex > 0 ? deletedIndex - 1 : 0
        const nextOrder =
          purchaseOrders[nextIndex].id === deletedId
            ? purchaseOrders[nextIndex + 1]
            : purchaseOrders[nextIndex]
        dispatch(setSelectedPurchaseOrder(nextOrder))
        workspace.setFocusedIndex(nextIndex)
      } else {
        dispatch(setSelectedPurchaseOrder(null))
        workspace.setFocusedIndex(-1)
      }
    },
    [dispatch, purchaseOrders, workspace],
  )

  const handleReceive = useCallback(async () => {
    if (!selectedOrder || !selectedOrder.items || selectedOrder.items.length === 0) {
      showError('No items to receive in this order')
      return
    }
    if (selectedOrder.goodsReceivedNotes && selectedOrder.goodsReceivedNotes.length > 0) {
      const grn = selectedOrder.goodsReceivedNotes[0]
      if (grn.status !== 'draft') {
        showError('GRN must be in draft status to receive goods')
        return
      }
    }
    try {
      const response = await receiveGoods(selectedOrder.id).unwrap()
      showSuccess('Goods received successfully. Product quantities updated.')
      const updatedOrder = (response as any).data || response
      if (updatedOrder) dispatch(setSelectedPurchaseOrder(updatedOrder))
      refetchOrders()
    } catch (error: any) {
      showError(error?.response?.data?.message || 'Failed to receive goods')
    }
  }, [dispatch, receiveGoods, refetchOrders, selectedOrder, showError, showSuccess])

  const handleReturn = useCallback(async () => {
    if (
      !selectedOrder ||
      !selectedOrder.goodsReceivedNotes ||
      selectedOrder.goodsReceivedNotes.length === 0
    ) {
      showError('No GRN found to return')
      return
    }
    const grn = selectedOrder.goodsReceivedNotes[0]
    if (grn.status !== 'received') {
      showError('GRN must be in received status to return goods')
      return
    }
    try {
      const response = await returnGoods(selectedOrder.id).unwrap()
      showSuccess('Goods returned successfully. Product quantities reverted.')
      const updatedOrder = (response as any).data || response
      if (updatedOrder) dispatch(setSelectedPurchaseOrder(updatedOrder))
      refetchOrders()
    } catch (error: any) {
      showError(error?.response?.data?.message || 'Failed to return goods')
    }
  }, [dispatch, refetchOrders, returnGoods, selectedOrder, showError, showSuccess])

  const handleEditClick = useCallback(() => {
    if (!selectedOrder) return
    const isReceived =
      selectedOrder.goodsReceivedNotes &&
      selectedOrder.goodsReceivedNotes.length > 0 &&
      selectedOrder.goodsReceivedNotes[0].status === 'received'
    const isPaid = selectedOrder.vendorPayments && selectedOrder.vendorPayments.length > 0
    if (isReceived || isPaid) {
      setBlockedDialogType('edit')
      setBlockedDialogOpen(true)
    } else {
      navigate(`/purchasing/orders/${selectedOrder.id}/edit`)
    }
  }, [navigate, selectedOrder])

  const handleReturnAndEdit = useCallback(async () => {
    if (!selectedOrder) return
    setIsLoading(true)
    try {
      const response = await returnGoods(selectedOrder.id).unwrap()
      showSuccess('Goods returned successfully. You can now edit the order.')
      const updatedOrder = (response as any).data || response
      if (updatedOrder) dispatch(setSelectedPurchaseOrder(updatedOrder))
      setBlockedDialogOpen(false)
      refetchOrders()
      navigate(`/purchasing/orders/${selectedOrder.id}/edit`)
    } catch (error: any) {
      showError(error?.response?.data?.message || 'Failed to return goods')
    } finally {
      setIsLoading(false)
    }
  }, [dispatch, navigate, refetchOrders, returnGoods, selectedOrder, showError, showSuccess])

  const handleReturnOnly = useCallback(async () => {
    if (!selectedOrder) return
    setIsLoading(true)
    try {
      const response = await returnGoods(selectedOrder.id).unwrap()
      showSuccess('Goods returned successfully. Product quantities reverted.')
      const updatedOrder = (response as any).data || response
      if (updatedOrder) dispatch(setSelectedPurchaseOrder(updatedOrder))
      setBlockedDialogOpen(false)
      refetchOrders()
    } catch (error: any) {
      showError(error?.response?.data?.message || 'Failed to return goods')
    } finally {
      setIsLoading(false)
    }
  }, [dispatch, refetchOrders, returnGoods, selectedOrder, showError, showSuccess])

  const handleUnpayAndEdit = useCallback(async () => {
    if (!selectedOrder) return
    setIsLoading(true)
    try {
      const isReceived =
        selectedOrder.goodsReceivedNotes &&
        selectedOrder.goodsReceivedNotes.length > 0 &&
        selectedOrder.goodsReceivedNotes[0].status === 'received'
      if (isReceived) {
        await returnGoods(selectedOrder.id).unwrap()
        const unpayResponse = await markPurchaseOrderAsUnpaid(selectedOrder.id).unwrap()
        showSuccess(
          'Goods returned and payment deleted successfully. You can now edit the order.',
        )
        const unpayData: any = (unpayResponse as any).data || unpayResponse
        const updatedOrder = unpayData.data || unpayData
        if (updatedOrder?.id)
          dispatch(setSelectedPurchaseOrder({ ...(updatedOrder as any), vendorPayments: [] }))
      } else {
        const unpayResponse = await markPurchaseOrderAsUnpaid(selectedOrder.id).unwrap()
        showSuccess('Payment deleted successfully. You can now edit the order.')
        const unpayData: any = (unpayResponse as any).data || unpayResponse
        const updatedOrder = unpayData.data || unpayData
        if (updatedOrder?.id)
          dispatch(setSelectedPurchaseOrder({ ...(updatedOrder as any), vendorPayments: [] }))
      }
      setBlockedDialogOpen(false)
      refetchOrders()
      navigate(`/purchasing/orders/${selectedOrder.id}/edit`)
    } catch (error: any) {
      showError(error?.response?.data?.message || 'Failed to prepare order for editing')
    } finally {
      setIsLoading(false)
    }
  }, [
    dispatch,
    markPurchaseOrderAsUnpaid,
    navigate,
    refetchOrders,
    returnGoods,
    selectedOrder,
    showError,
    showSuccess,
  ])

  const handleReturnAndDelete = useCallback(async () => {
    if (!selectedOrder) return
    setIsLoading(true)
    try {
      await returnGoods(selectedOrder.id).unwrap()
      await deletePurchaseOrder(selectedOrder.id).unwrap()
      showSuccess('Goods returned and purchase order deleted successfully.')
      setBlockedDialogOpen(false)
      selectAfterDelete(selectedOrder.id)
      refetchOrders()
    } catch (error: any) {
      showError(error?.response?.data?.message || 'Failed to return and delete order')
    } finally {
      setIsLoading(false)
    }
  }, [
    deletePurchaseOrder,
    refetchOrders,
    returnGoods,
    selectAfterDelete,
    selectedOrder,
    showError,
    showSuccess,
  ])

  const handleUnpayAndDelete = useCallback(async () => {
    if (!selectedOrder) return
    setIsLoading(true)
    try {
      const isReceived =
        selectedOrder.goodsReceivedNotes &&
        selectedOrder.goodsReceivedNotes.length > 0 &&
        selectedOrder.goodsReceivedNotes[0].status === 'received'
      if (isReceived) await returnGoods(selectedOrder.id).unwrap()
      await markPurchaseOrderAsUnpaid(selectedOrder.id).unwrap()
      await deletePurchaseOrder(selectedOrder.id).unwrap()
      showSuccess(
        isReceived
          ? 'Goods returned, payment deleted, and purchase order deleted successfully.'
          : 'Payment deleted and purchase order deleted successfully.',
      )
      setBlockedDialogOpen(false)
      selectAfterDelete(selectedOrder.id)
      refetchOrders()
    } catch (error: any) {
      showError(error?.response?.data?.message || 'Failed to prepare and delete order')
    } finally {
      setIsLoading(false)
    }
  }, [
    deletePurchaseOrder,
    markPurchaseOrderAsUnpaid,
    refetchOrders,
    returnGoods,
    selectAfterDelete,
    selectedOrder,
    showError,
    showSuccess,
  ])

  const handleUnpay = useCallback(async () => {
    if (!selectedOrder) return
    setIsLoading(true)
    try {
      const response = await markPurchaseOrderAsUnpaid(selectedOrder.id).unwrap()
      showSuccess('Payment deleted successfully')
      const responseData: any = (response as any).data || response
      const updatedOrder = responseData.data || responseData
      if (updatedOrder?.id)
        dispatch(
          setSelectedPurchaseOrder({
            ...(updatedOrder as any),
            vendorPayments: [],
            paidAmount: 0,
          }),
        )
      refetchOrders()
    } catch (error: any) {
      if (error?.response?.status === 404) {
        showError('No payment found for this purchase order')
      } else {
        showError(error?.response?.data?.message || 'Failed to delete payment')
      }
    } finally {
      setIsLoading(false)
    }
  }, [dispatch, markPurchaseOrderAsUnpaid, refetchOrders, selectedOrder, showError, showSuccess])

  const handleOpenPaymentDialog = useCallback((order: PurchaseOrder) => {
    setPaymentDialogOrder(order)
    setPaymentDialogOpen(true)
  }, [])

  const handleRecordPayments = useCallback(
    async (payments: { paymentMethodId: string; amount: number; reference?: string }[]) => {
      if (!selectedOrder) return
      const response = await recordOrderPayments({
        purchaseOrderId: selectedOrder.id,
        payments,
      }).unwrap()
      const responseData: any = (response as any).data || response
      const updatedOrder = responseData.data || responseData
      if (updatedOrder?.id) dispatch(setSelectedPurchaseOrder(updatedOrder))
      refetchOrders()
      showSuccess('Payment recorded successfully.')
    },
    [dispatch, recordOrderPayments, refetchOrders, selectedOrder, showSuccess],
  )

  const handleDeleteClick = useCallback(() => {
    if (!selectedOrder) return
    const isReceived =
      selectedOrder.goodsReceivedNotes &&
      selectedOrder.goodsReceivedNotes.length > 0 &&
      selectedOrder.goodsReceivedNotes[0].status === 'received'
    const isPaid = selectedOrder.vendorPayments && selectedOrder.vendorPayments.length > 0
    if (isReceived || isPaid) {
      setBlockedDialogType('delete')
      setBlockedDialogOpen(true)
    } else {
      setOrderToDelete(selectedOrder)
      setDeleteConfirmOpen(true)
    }
  }, [selectedOrder])

  const handleDeleteConfirm = useCallback(
    async (order: PurchaseOrder | null) => {
      if (!order) return
      try {
        await deletePurchaseOrder(order.id).unwrap()
        showSuccess('Purchase order deleted successfully')
        setDeleteConfirmOpen(false)
        setOrderToDelete(null)
        selectAfterDelete(order.id)
        refetchOrders()
      } catch (error: any) {
        showError(error?.response?.data?.message || 'Failed to delete purchase order')
      }
    },
    [deletePurchaseOrder, refetchOrders, selectAfterDelete, showError, showSuccess],
  )

  const navigateToGoodsReceived = useCallback(
    (grnId: string) => {
      navigate(`/purchasing/goods-received?grnId=${grnId}`)
    },
    [navigate],
  )

  const navigateToVendorPayment = useCallback(
    (paymentId: string) => {
      navigate(`/purchasing/vendor-payments?vpId=${paymentId}`)
    },
    [navigate],
  )

  return {
    ...workspace,
    focusedOrderIndex: workspace.focusedIndex,
    orderListRef: workspace.listRef,
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    orderToDelete,
    setOrderToDelete,
    deletedOrdersDialogOpen,
    setDeletedOrdersDialogOpen,
    blockedDialogOpen,
    setBlockedDialogOpen,
    printDialogOpen,
    setPrintDialogOpen,
    blockedDialogType,
    isLoading,
    paymentDialogOpen,
    setPaymentDialogOpen,
    paymentDialogOrder,
    journalEntryRef,
    journalEntryRefLoading,
    handleOrderSelect,
    handleReceive,
    handleReturn,
    handleEditClick,
    handleReturnAndEdit,
    handleReturnOnly,
    handleUnpayAndEdit,
    handleReturnAndDelete,
    handleUnpayAndDelete,
    handleUnpay,
    handleOpenPaymentDialog,
    handleRecordPayments,
    handleDeleteClick,
    handleDeleteConfirm,
    navigateToGoodsReceived,
    navigateToVendorPayment,
    navigateToJournalEntry,
  }
}
