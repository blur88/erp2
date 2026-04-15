import { useCallback } from 'react'
import type { NavigateFunction } from 'react-router-dom'

import { setSelectedPurchaseOrder } from '@/store/slices/purchasingSlice'
import type { AppDispatch } from '@/store'
import type { PurchaseOrder } from '@/types'

interface UsePurchaseOrdersActionsParams {
  dispatch: AppDispatch
  navigate: NavigateFunction
  purchaseOrders: PurchaseOrder[]
  selectedOrder: PurchaseOrder | null
  receiveGoods: (id: string) => { unwrap: () => Promise<any> }
  returnGoods: (id: string) => { unwrap: () => Promise<any> }
  markPurchaseOrderAsUnpaid: (id: string) => { unwrap: () => Promise<any> }
  recordOrderPayments: (body: { purchaseOrderId: string; payments: { paymentMethodId: string; amount: number; reference?: string }[] }) => { unwrap: () => Promise<any> }
  deletePurchaseOrder: (id: string) => { unwrap: () => Promise<any> }
  loadOrders: () => void
  showSuccess: (message: string) => void
  showError: (message: string) => void
  setBlockedDialogType: (type: 'edit' | 'delete') => void
  setBlockedDialogOpen: (open: boolean) => void
  setIsLoading: (loading: boolean) => void
  setPaymentDialogOrder: (order: any) => void
  setPaymentDialogOpen: (open: boolean) => void
  setDeleteConfirmOpen: (open: boolean) => void
  setOrderToDelete: (order: any) => void
  setFocusedOrderIndex: (index: number) => void
}

export function usePurchaseOrdersActions({
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
  setBlockedDialogType,
  setBlockedDialogOpen,
  setIsLoading,
  setPaymentDialogOrder,
  setPaymentDialogOpen,
  setDeleteConfirmOpen,
  setOrderToDelete,
  setFocusedOrderIndex,
}: UsePurchaseOrdersActionsParams) {
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
      if (updatedOrder) {
        dispatch(setSelectedPurchaseOrder(updatedOrder))
      }
      loadOrders()
    } catch (error: any) {
      console.error('Receive error:', error)
      showError(error?.response?.data?.message || 'Failed to receive goods')
    }
  }, [dispatch, loadOrders, receiveGoods, selectedOrder, showError, showSuccess])

  const handleReturn = useCallback(async () => {
    if (!selectedOrder || !selectedOrder.goodsReceivedNotes || selectedOrder.goodsReceivedNotes.length === 0) {
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
      if (updatedOrder) {
        dispatch(setSelectedPurchaseOrder(updatedOrder))
      }
      loadOrders()
    } catch (error: any) {
      console.error('Return error:', error)
      showError(error?.response?.data?.message || 'Failed to return goods')
    }
  }, [dispatch, loadOrders, returnGoods, selectedOrder, showError, showSuccess])

  const handleEditClick = useCallback(() => {
    if (!selectedOrder) return
    const isReceived = selectedOrder.goodsReceivedNotes && selectedOrder.goodsReceivedNotes.length > 0 && selectedOrder.goodsReceivedNotes[0].status === 'received'
    const isPaid = selectedOrder.vendorPayments && selectedOrder.vendorPayments.length > 0
    if (isReceived || isPaid) {
      setBlockedDialogType('edit')
      setBlockedDialogOpen(true)
    } else {
      navigate(`/purchasing/orders/${selectedOrder.id}/edit`)
    }
  }, [navigate, selectedOrder, setBlockedDialogOpen, setBlockedDialogType])

  const handleReturnAndEdit = useCallback(async () => {
    if (!selectedOrder) return
    setIsLoading(true)
    try {
      const response = await returnGoods(selectedOrder.id).unwrap()
      showSuccess('Goods returned successfully. You can now edit the order.')
      const updatedOrder = (response as any).data || response
      if (updatedOrder) {
        dispatch(setSelectedPurchaseOrder(updatedOrder))
      }
      setBlockedDialogOpen(false)
      loadOrders()
      navigate(`/purchasing/orders/${selectedOrder.id}/edit`)
    } catch (error: any) {
      console.error('Return error:', error)
      showError(error?.response?.data?.message || 'Failed to return goods')
    } finally {
      setIsLoading(false)
    }
  }, [dispatch, loadOrders, navigate, returnGoods, selectedOrder, setBlockedDialogOpen, setIsLoading, showError, showSuccess])

  const handleReturnOnly = useCallback(async () => {
    if (!selectedOrder) return
    setIsLoading(true)
    try {
      const response = await returnGoods(selectedOrder.id).unwrap()
      showSuccess('Goods returned successfully. Product quantities reverted.')
      const updatedOrder = (response as any).data || response
      if (updatedOrder) {
        dispatch(setSelectedPurchaseOrder(updatedOrder))
      }
      setBlockedDialogOpen(false)
      loadOrders()
    } catch (error: any) {
      console.error('Return error:', error)
      showError(error?.response?.data?.message || 'Failed to return goods')
    } finally {
      setIsLoading(false)
    }
  }, [dispatch, loadOrders, returnGoods, selectedOrder, setBlockedDialogOpen, setIsLoading, showError, showSuccess])

  const handleUnpayAndEdit = useCallback(async () => {
    if (!selectedOrder) return
    setIsLoading(true)
    try {
      const isReceived = selectedOrder.goodsReceivedNotes && selectedOrder.goodsReceivedNotes.length > 0 && selectedOrder.goodsReceivedNotes[0].status === 'received'
      if (isReceived) {
        await returnGoods(selectedOrder.id).unwrap()
        const unpayResponse = await markPurchaseOrderAsUnpaid(selectedOrder.id).unwrap()
        showSuccess('Goods returned and payment deleted successfully. You can now edit the order.')
        const unpayData: any = (unpayResponse as any).data || unpayResponse
        const updatedOrder = unpayData.data || unpayData
        if (updatedOrder && updatedOrder.id) {
          dispatch(setSelectedPurchaseOrder({ ...(updatedOrder as any), vendorPayments: [] }))
        }
      } else {
        const unpayResponse = await markPurchaseOrderAsUnpaid(selectedOrder.id).unwrap()
        showSuccess('Payment deleted successfully. You can now edit the order.')
        const unpayData: any = (unpayResponse as any).data || unpayResponse
        const updatedOrder = unpayData.data || unpayData
        if (updatedOrder && updatedOrder.id) {
          dispatch(setSelectedPurchaseOrder({ ...(updatedOrder as any), vendorPayments: [] }))
        }
      }
      setBlockedDialogOpen(false)
      loadOrders()
      navigate(`/purchasing/orders/${selectedOrder.id}/edit`)
    } catch (error: any) {
      console.error('Unpay/Return error:', error)
      showError(error?.response?.data?.message || 'Failed to prepare order for editing')
    } finally {
      setIsLoading(false)
    }
  }, [dispatch, loadOrders, markPurchaseOrderAsUnpaid, navigate, returnGoods, selectedOrder, setBlockedDialogOpen, setIsLoading, showError, showSuccess])

  const selectAfterDelete = useCallback((deletedId: string) => {
    const deletedIndex = purchaseOrders.findIndex((order) => order.id === deletedId)
    if (purchaseOrders.length > 1) {
      const newIndex = deletedIndex > 0 ? deletedIndex - 1 : 0
      const orderToSelect = purchaseOrders[newIndex].id === deletedId ? purchaseOrders[newIndex + 1] : purchaseOrders[newIndex]
      dispatch(setSelectedPurchaseOrder(orderToSelect))
      setFocusedOrderIndex(newIndex)
    } else {
      dispatch(setSelectedPurchaseOrder(null))
      setFocusedOrderIndex(-1)
    }
  }, [dispatch, purchaseOrders, setFocusedOrderIndex])

  const handleReturnAndDelete = useCallback(async () => {
    if (!selectedOrder) return
    setIsLoading(true)
    try {
      await returnGoods(selectedOrder.id).unwrap()
      await deletePurchaseOrder(selectedOrder.id).unwrap()
      showSuccess('Goods returned and purchase order deleted successfully.')
      setBlockedDialogOpen(false)
      selectAfterDelete(selectedOrder.id)
      loadOrders()
    } catch (error: any) {
      console.error('Return/Delete error:', error)
      showError(error?.response?.data?.message || 'Failed to return and delete order')
    } finally {
      setIsLoading(false)
    }
  }, [deletePurchaseOrder, loadOrders, returnGoods, selectedOrder, selectAfterDelete, setBlockedDialogOpen, setIsLoading, showError, showSuccess])

  const handleUnpayAndDelete = useCallback(async () => {
    if (!selectedOrder) return
    setIsLoading(true)
    try {
      const isReceived = selectedOrder.goodsReceivedNotes && selectedOrder.goodsReceivedNotes.length > 0 && selectedOrder.goodsReceivedNotes[0].status === 'received'
      if (isReceived) {
        await returnGoods(selectedOrder.id).unwrap()
      }
      await markPurchaseOrderAsUnpaid(selectedOrder.id).unwrap()
      await deletePurchaseOrder(selectedOrder.id).unwrap()
      showSuccess(isReceived ? 'Goods returned, payment deleted, and purchase order deleted successfully.' : 'Payment deleted and purchase order deleted successfully.')
      setBlockedDialogOpen(false)
      selectAfterDelete(selectedOrder.id)
      loadOrders()
    } catch (error: any) {
      console.error('Unpay/Return/Delete error:', error)
      showError(error?.response?.data?.message || 'Failed to prepare and delete order')
    } finally {
      setIsLoading(false)
    }
  }, [deletePurchaseOrder, loadOrders, markPurchaseOrderAsUnpaid, returnGoods, selectedOrder, selectAfterDelete, setBlockedDialogOpen, setIsLoading, showError, showSuccess])

  const handleUnpay = useCallback(async () => {
    if (!selectedOrder) return
    setIsLoading(true)
    try {
      const response = await markPurchaseOrderAsUnpaid(selectedOrder.id).unwrap()
      showSuccess('Payment deleted successfully')
      const responseData: any = (response as any).data || response
      const updatedOrder = responseData.data || responseData
      if (updatedOrder && updatedOrder.id) {
        dispatch(setSelectedPurchaseOrder({ ...(updatedOrder as any), vendorPayments: [], paidAmount: 0 }))
      }
      loadOrders()
    } catch (error: any) {
      console.error('Unpay error:', error)
      if (error?.response?.status === 404) {
        showError('No payment found for this purchase order')
      } else {
        showError(error?.response?.data?.message || 'Failed to delete payment')
      }
    } finally {
      setIsLoading(false)
    }
  }, [dispatch, loadOrders, markPurchaseOrderAsUnpaid, selectedOrder, setIsLoading, showError, showSuccess])

  const handleOpenPaymentDialog = useCallback((order: PurchaseOrder) => {
    setPaymentDialogOrder(order)
    setPaymentDialogOpen(true)
  }, [setPaymentDialogOpen, setPaymentDialogOrder])

  const handleRecordPayments = useCallback(async (payments: { paymentMethodId: string; amount: number; reference?: string }[]) => {
    if (!selectedOrder) return
    const response = await recordOrderPayments({ purchaseOrderId: selectedOrder.id, payments }).unwrap()
    const responseData: any = (response as any).data || response
    const updatedOrder = responseData.data || responseData
    if (updatedOrder && updatedOrder.id) {
      dispatch(setSelectedPurchaseOrder(updatedOrder))
    }
    loadOrders()
    showSuccess('Payment recorded successfully.')
  }, [dispatch, loadOrders, recordOrderPayments, selectedOrder, showSuccess])

  const handleDeleteClick = useCallback(() => {
    if (!selectedOrder) return
    const isReceived = selectedOrder.goodsReceivedNotes && selectedOrder.goodsReceivedNotes.length > 0 && selectedOrder.goodsReceivedNotes[0].status === 'received'
    const isPaid = selectedOrder.vendorPayments && selectedOrder.vendorPayments.length > 0
    if (isReceived || isPaid) {
      setBlockedDialogType('delete')
      setBlockedDialogOpen(true)
    } else {
      setOrderToDelete(selectedOrder)
      setDeleteConfirmOpen(true)
    }
  }, [selectedOrder, setBlockedDialogOpen, setBlockedDialogType, setDeleteConfirmOpen, setOrderToDelete])

  const handleDeleteConfirm = useCallback(async (orderToDelete: PurchaseOrder | null) => {
    if (!orderToDelete) return
    try {
      await deletePurchaseOrder(orderToDelete.id).unwrap()
      showSuccess('Purchase order deleted successfully')
      setDeleteConfirmOpen(false)
      setOrderToDelete(null)
      selectAfterDelete(orderToDelete.id)
      loadOrders()
    } catch (error: any) {
      showError(error?.response?.data?.message || 'Failed to delete purchase order')
    }
  }, [deletePurchaseOrder, loadOrders, selectAfterDelete, setDeleteConfirmOpen, setOrderToDelete, showError, showSuccess])

  return {
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
  }
}
