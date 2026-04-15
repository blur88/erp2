import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { useNotification } from '@/hooks/useNotification'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import type { AppDispatch } from '@/store'
import { useLazyGetJournalEntriesQuery } from '@/store/api/accountingApi'
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

  const [focusedOrderIndex, setFocusedOrderIndex] = useState(-1)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [orderToDelete, setOrderToDelete] = useState<PurchaseOrder | null>(null)
  const [deletedOrdersDialogOpen, setDeletedOrdersDialogOpen] = useState(false)
  const [blockedDialogOpen, setBlockedDialogOpen] = useState(false)
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [blockedDialogType, setBlockedDialogType] = useState<'edit' | 'delete'>('edit')
  const [isLoading, setIsLoading] = useState(false)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [paymentDialogOrder, setPaymentDialogOrder] = useState<PurchaseOrder | null>(null)
  const [journalEntryRef, setJournalEntryRef] = useState<PurchaseJournalEntryRef | null>(null)
  const [journalEntryRefLoading, setJournalEntryRefLoading] = useState(false)
  const [pendingHighlightId, setPendingHighlightId] = useState<string | null>(
    searchParams.get('highlight'),
  )

  const orderListRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const processedHighlightRef = useRef<string | null>(null)
  const userHasNavigatedRef = useRef(false)

  const [fetchPurchaseOrder] = useLazyGetPurchaseOrderQuery()
  const [fetchJournalEntries] = useLazyGetJournalEntriesQuery()
  const [receiveGoods] = useReceiveGoodsMutation()
  const [returnGoods] = useReturnGoodsMutation()
  const [markPurchaseOrderAsUnpaid] = useMarkPurchaseOrderAsUnpaidMutation()
  const [recordOrderPayments] = useRecordOrderPaymentsMutation()
  const [deletePurchaseOrder] = useDeletePurchaseOrderMutation()

  useEffect(() => {
    if (!searchParams.get('highlight')) {
      return
    }

    setSearchParams((prev) => {
      prev.delete('highlight')
      return prev
    }, { replace: true })
  }, [searchParams, setSearchParams])

  useEffect(() => {
    if (!selectedOrder?.id) {
      setJournalEntryRef(null)
      setJournalEntryRefLoading(false)
      return
    }

    const grnSources = (selectedOrder.goodsReceivedNotes || []).map((grn: any) => ({
      sourceType: 'goods_received_note',
      sourceId: grn.id,
    }))
    const paymentSources = (selectedOrder.vendorPayments || []).map((payment: any) => ({
      sourceType: 'vendor_payment',
      sourceId: payment.id,
    }))
    const sources = [...grnSources, ...paymentSources]

    if (sources.length === 0) {
      setJournalEntryRef(null)
      setJournalEntryRefLoading(false)
      return
    }

    let cancelled = false
    setJournalEntryRefLoading(true)

    ;(async () => {
      try {
        for (const source of sources) {
          const response = await fetchJournalEntries({
            sourceType: source.sourceType,
            sourceId: source.sourceId,
            sortBy: 'createdAt',
            sortOrder: 'DESC',
            limit: 1,
          }).unwrap()

          if (cancelled) {
            return
          }

          const entry = response.data?.[0]
          if (entry) {
            setJournalEntryRef({
              referenceNumber: entry.referenceNumber,
              sourceType: source.sourceType,
              sourceId: source.sourceId,
            })
            return
          }
        }

        if (!cancelled) {
          setJournalEntryRef(null)
        }
      } catch {
        if (!cancelled) {
          setJournalEntryRef(null)
        }
      } finally {
        if (!cancelled) {
          setJournalEntryRefLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [
    fetchJournalEntries,
    selectedOrder?.goodsReceivedNotes,
    selectedOrder?.id,
    selectedOrder?.vendorPayments,
  ])

  useEffect(() => {
    const poId = searchParams.get('poId')
    if (!poId || purchaseOrders.length === 0) {
      return
    }

    const order = purchaseOrders.find((candidate) => candidate.id === poId)
    if (order) {
      dispatch(setSelectedPurchaseOrder(order))
      setFocusedOrderIndex(purchaseOrders.findIndex((candidate) => candidate.id === poId))
      setSearchParams({})
    }
  }, [dispatch, purchaseOrders, searchParams, setSearchParams])

  useEffect(() => {
    const hasHighlightOrderId = !!pendingHighlightId || !!processedHighlightRef.current

    if (purchaseOrders.length > 0 && focusedOrderIndex === -1) {
      if (selectedOrder && !pendingHighlightId) {
        const orderIndex = purchaseOrders.findIndex((order) => order.id === selectedOrder.id)
        setFocusedOrderIndex(orderIndex >= 0 ? orderIndex : 0)
      } else if (searchInputRef.current !== document.activeElement && !hasHighlightOrderId) {
        const poId = searchParams.get('poId')
        if (!poId) {
          setFocusedOrderIndex(0)
          dispatch(setSelectedPurchaseOrder(purchaseOrders[0]))
        }
      }
    }
  }, [
    dispatch,
    focusedOrderIndex,
    pendingHighlightId,
    purchaseOrders,
    searchParams,
    selectedOrder,
  ])

  useEffect(() => {
    if (purchaseOrders.length === 0 && selectedOrder) {
      dispatch(setSelectedPurchaseOrder(null))
      setFocusedOrderIndex(-1)
    }
  }, [dispatch, purchaseOrders.length, selectedOrder])

  useEffect(() => {
    if (!pendingHighlightId || purchaseOrders.length === 0) {
      return
    }

    const orderIndex = purchaseOrders.findIndex((order) => order.id === pendingHighlightId)
    if (orderIndex >= 0) {
      dispatch(setSelectedPurchaseOrder(purchaseOrders[orderIndex]))
      setFocusedOrderIndex(orderIndex)
      processedHighlightRef.current = pendingHighlightId
      userHasNavigatedRef.current = false
      setPendingHighlightId(null)
    }
  }, [dispatch, pendingHighlightId, purchaseOrders])

  useEffect(() => {
    if (focusedOrderIndex >= 0 && orderListRef.current) {
      const focusedRow = orderListRef.current.querySelector(`[data-order-index="${focusedOrderIndex}"]`)
      if (focusedRow && typeof focusedRow.scrollIntoView === 'function') {
        focusedRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [focusedOrderIndex])

  const focusSearchInput = useCallback(() => {
    searchInputRef.current?.focus()
  }, [])

  const handleOrderSelect = useCallback(async (order: PurchaseOrder) => {
    const orderIndex = purchaseOrders.findIndex((item) => item.id === order.id)
    setFocusedOrderIndex(orderIndex)
    userHasNavigatedRef.current = true

    try {
      const freshOrder = await fetchPurchaseOrder(order.id).unwrap()
      dispatch(setSelectedPurchaseOrder(freshOrder))
      dispatch(updatePurchaseOrderInPlace(freshOrder))
    } catch (error) {
      console.error('Error fetching purchase order:', error)
      dispatch(setSelectedPurchaseOrder(order))
    }
  }, [dispatch, fetchPurchaseOrder, purchaseOrders])

  const handleNavigateUp = useCallback(() => {
    if (focusedOrderIndex > 0) {
      const nextIndex = focusedOrderIndex - 1
      setFocusedOrderIndex(nextIndex)
      dispatch(setSelectedPurchaseOrder(purchaseOrders[nextIndex]))
      userHasNavigatedRef.current = true
    }
  }, [dispatch, focusedOrderIndex, purchaseOrders])

  const handleNavigateDown = useCallback(() => {
    if (focusedOrderIndex < purchaseOrders.length - 1) {
      const nextIndex = focusedOrderIndex + 1
      setFocusedOrderIndex(nextIndex)
      dispatch(setSelectedPurchaseOrder(purchaseOrders[nextIndex]))
      userHasNavigatedRef.current = true
    }
  }, [dispatch, focusedOrderIndex, purchaseOrders])

  const selectAfterDelete = useCallback((deletedId: string) => {
    const deletedIndex = purchaseOrders.findIndex((order) => order.id === deletedId)
    if (purchaseOrders.length > 1) {
      const nextIndex = deletedIndex > 0 ? deletedIndex - 1 : 0
      const nextOrder =
        purchaseOrders[nextIndex].id === deletedId
          ? purchaseOrders[nextIndex + 1]
          : purchaseOrders[nextIndex]

      dispatch(setSelectedPurchaseOrder(nextOrder))
      setFocusedOrderIndex(nextIndex)
    } else {
      dispatch(setSelectedPurchaseOrder(null))
      setFocusedOrderIndex(-1)
    }
  }, [dispatch, purchaseOrders])

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
      refetchOrders()
    } catch (error: any) {
      console.error('Receive error:', error)
      showError(error?.response?.data?.message || 'Failed to receive goods')
    }
  }, [dispatch, receiveGoods, refetchOrders, selectedOrder, showError, showSuccess])

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
      refetchOrders()
    } catch (error: any) {
      console.error('Return error:', error)
      showError(error?.response?.data?.message || 'Failed to return goods')
    }
  }, [dispatch, refetchOrders, returnGoods, selectedOrder, showError, showSuccess])

  const handleEditClick = useCallback(() => {
    if (!selectedOrder) {
      return
    }

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
    if (!selectedOrder) {
      return
    }

    setIsLoading(true)
    try {
      const response = await returnGoods(selectedOrder.id).unwrap()
      showSuccess('Goods returned successfully. You can now edit the order.')
      const updatedOrder = (response as any).data || response
      if (updatedOrder) {
        dispatch(setSelectedPurchaseOrder(updatedOrder))
      }
      setBlockedDialogOpen(false)
      refetchOrders()
      navigate(`/purchasing/orders/${selectedOrder.id}/edit`)
    } catch (error: any) {
      console.error('Return error:', error)
      showError(error?.response?.data?.message || 'Failed to return goods')
    } finally {
      setIsLoading(false)
    }
  }, [dispatch, navigate, refetchOrders, returnGoods, selectedOrder, showError, showSuccess])

  const handleReturnOnly = useCallback(async () => {
    if (!selectedOrder) {
      return
    }

    setIsLoading(true)
    try {
      const response = await returnGoods(selectedOrder.id).unwrap()
      showSuccess('Goods returned successfully. Product quantities reverted.')
      const updatedOrder = (response as any).data || response
      if (updatedOrder) {
        dispatch(setSelectedPurchaseOrder(updatedOrder))
      }
      setBlockedDialogOpen(false)
      refetchOrders()
    } catch (error: any) {
      console.error('Return error:', error)
      showError(error?.response?.data?.message || 'Failed to return goods')
    } finally {
      setIsLoading(false)
    }
  }, [dispatch, refetchOrders, returnGoods, selectedOrder, showError, showSuccess])

  const handleUnpayAndEdit = useCallback(async () => {
    if (!selectedOrder) {
      return
    }

    setIsLoading(true)
    try {
      const isReceived =
        selectedOrder.goodsReceivedNotes &&
        selectedOrder.goodsReceivedNotes.length > 0 &&
        selectedOrder.goodsReceivedNotes[0].status === 'received'

      if (isReceived) {
        await returnGoods(selectedOrder.id).unwrap()
        const unpayResponse = await markPurchaseOrderAsUnpaid(selectedOrder.id).unwrap()
        showSuccess('Goods returned and payment deleted successfully. You can now edit the order.')
        const unpayData: any = (unpayResponse as any).data || unpayResponse
        const updatedOrder = unpayData.data || unpayData
        if (updatedOrder?.id) {
          dispatch(setSelectedPurchaseOrder({ ...(updatedOrder as any), vendorPayments: [] }))
        }
      } else {
        const unpayResponse = await markPurchaseOrderAsUnpaid(selectedOrder.id).unwrap()
        showSuccess('Payment deleted successfully. You can now edit the order.')
        const unpayData: any = (unpayResponse as any).data || unpayResponse
        const updatedOrder = unpayData.data || unpayData
        if (updatedOrder?.id) {
          dispatch(setSelectedPurchaseOrder({ ...(updatedOrder as any), vendorPayments: [] }))
        }
      }

      setBlockedDialogOpen(false)
      refetchOrders()
      navigate(`/purchasing/orders/${selectedOrder.id}/edit`)
    } catch (error: any) {
      console.error('Unpay/Return error:', error)
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
    if (!selectedOrder) {
      return
    }

    setIsLoading(true)
    try {
      await returnGoods(selectedOrder.id).unwrap()
      await deletePurchaseOrder(selectedOrder.id).unwrap()
      showSuccess('Goods returned and purchase order deleted successfully.')
      setBlockedDialogOpen(false)
      selectAfterDelete(selectedOrder.id)
      refetchOrders()
    } catch (error: any) {
      console.error('Return/Delete error:', error)
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
    if (!selectedOrder) {
      return
    }

    setIsLoading(true)
    try {
      const isReceived =
        selectedOrder.goodsReceivedNotes &&
        selectedOrder.goodsReceivedNotes.length > 0 &&
        selectedOrder.goodsReceivedNotes[0].status === 'received'

      if (isReceived) {
        await returnGoods(selectedOrder.id).unwrap()
      }

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
      console.error('Unpay/Return/Delete error:', error)
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
    if (!selectedOrder) {
      return
    }

    setIsLoading(true)
    try {
      const response = await markPurchaseOrderAsUnpaid(selectedOrder.id).unwrap()
      showSuccess('Payment deleted successfully')
      const responseData: any = (response as any).data || response
      const updatedOrder = responseData.data || responseData
      if (updatedOrder?.id) {
        dispatch(setSelectedPurchaseOrder({ ...(updatedOrder as any), vendorPayments: [], paidAmount: 0 }))
      }
      refetchOrders()
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
  }, [dispatch, markPurchaseOrderAsUnpaid, refetchOrders, selectedOrder, showError, showSuccess])

  const handleOpenPaymentDialog = useCallback((order: PurchaseOrder) => {
    setPaymentDialogOrder(order)
    setPaymentDialogOpen(true)
  }, [])

  const handleRecordPayments = useCallback(async (
    payments: { paymentMethodId: string; amount: number; reference?: string }[],
  ) => {
    if (!selectedOrder) {
      return
    }

    const response = await recordOrderPayments({
      purchaseOrderId: selectedOrder.id,
      payments,
    }).unwrap()
    const responseData: any = (response as any).data || response
    const updatedOrder = responseData.data || responseData
    if (updatedOrder?.id) {
      dispatch(setSelectedPurchaseOrder(updatedOrder))
    }
    refetchOrders()
    showSuccess('Payment recorded successfully.')
  }, [dispatch, recordOrderPayments, refetchOrders, selectedOrder, showSuccess])

  const handleDeleteClick = useCallback(() => {
    if (!selectedOrder) {
      return
    }

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

  const handleDeleteConfirm = useCallback(async (order: PurchaseOrder | null) => {
    if (!order) {
      return
    }

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
  }, [deletePurchaseOrder, refetchOrders, selectAfterDelete, showError, showSuccess])

  const navigateToGoodsReceived = useCallback((grnId: string) => {
    navigate(`/purchasing/goods-received?grnId=${grnId}`)
  }, [navigate])

  const navigateToVendorPayment = useCallback((paymentId: string) => {
    navigate(`/purchasing/vendor-payments?vpId=${paymentId}`)
  }, [navigate])

  const navigateToJournalEntry = useCallback(() => {
    if (!journalEntryRef) {
      return
    }

    navigate(
      `/accounting/journal-entries?sourceType=${journalEntryRef.sourceType}&sourceId=${journalEntryRef.sourceId}`,
    )
  }, [journalEntryRef, navigate])

  useKeyboardShortcuts({
    onSearch: focusSearchInput,
    onArrowUp: handleNavigateUp,
    onArrowDown: handleNavigateDown,
  })

  return {
    focusedOrderIndex,
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
    orderListRef,
    searchInputRef,
    handleOrderSelect,
    handleNavigateUp,
    handleNavigateDown,
    focusSearchInput,
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
