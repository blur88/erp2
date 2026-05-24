import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { useJournalEntryRefs } from '@/hooks/useJournalEntryRefs'
import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import type { AppDispatch, RootState } from '@/store'
import {
  useCancelSalesOrderMutation,
  useCompleteSalesOrderMutation,
  useConfirmSalesOrderMutation,
  useDeleteSalesOrderMutation,
  useDeliverSalesOrderMutation,
  useDuplicateSalesOrderMutation,
  useFulfillSalesOrderMutation,
  useLazyGetSalesOrderQuery,
  useRecordOrderPaymentMutation,
  useRecordOrderPaymentsMutation,
  useShipSalesOrderMutation,
  useUnfulfillSalesOrderMutation,
  useUnpaySalesOrderMutation,
} from '@/store/api/salesApi'
import { patchSalesOrderCaches } from '@/store/api/salesOrderCache'
import { clearError, setSelectedOrder } from '@/store/slices/salesSlice'
import type { SalesOrder } from '@/types'
import { formatCurrency } from '@/utils/formatters'

export type BlockedOrderAction = 'edit' | 'delete'

interface UseOrdersWorkspaceConfig {
  dispatch: AppDispatch
  getState: () => RootState
  orders: SalesOrder[]
  selectedOrder: SalesOrder | null
  refetchOrders: () => void
  isLoading: boolean
}

export function useOrdersWorkspace({
  dispatch,
  getState,
  orders,
  selectedOrder,
  refetchOrders,
  isLoading: ordersLoading,
}: UseOrdersWorkspaceConfig) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { showSuccess, showError } = useNotification()

  const [viewDialog, setViewDialog] = useState(false)
  const [blockedDialogOpen, setBlockedDialogOpen] = useState(false)
  const [blockedDialogAction, setBlockedDialogAction] = useState<BlockedOrderAction>('edit')
  const [deletedOrdersDialogOpen, setDeletedOrdersDialogOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [orderToDelete, setOrderToDelete] = useState<string | null>(null)
  const [orderToDeleteName, setOrderToDeleteName] = useState('')
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const userHasNavigatedRef = useRef(false)
  const hasRefreshedPersistedOrder = useRef(false)
  const isRefreshingPersistedOrder = useRef(false)
  const workspaceRef = useRef<ReturnType<typeof useEntityWorkspace<SalesOrder>> | null>(null)

  const [triggerGetSalesOrder] = useLazyGetSalesOrderQuery()
  const [deleteSalesOrder] = useDeleteSalesOrderMutation()
  const [confirmSalesOrder] = useConfirmSalesOrderMutation()
  const [shipSalesOrder] = useShipSalesOrderMutation()
  const [deliverSalesOrder] = useDeliverSalesOrderMutation()
  const [completeSalesOrder] = useCompleteSalesOrderMutation()
  const [cancelSalesOrder] = useCancelSalesOrderMutation()
  const [duplicateSalesOrder] = useDuplicateSalesOrderMutation()
  const [recordOrderPayment] = useRecordOrderPaymentMutation()
  const [recordOrderPayments] = useRecordOrderPaymentsMutation()
  const [unpaySalesOrder] = useUnpaySalesOrderMutation()
  const [fulfillSalesOrder] = useFulfillSalesOrderMutation()
  const [unfulfillSalesOrder] = useUnfulfillSalesOrderMutation()

  const workspace = useEntityWorkspace({
    entities: orders,
    selectedEntity: selectedOrder,
    selectEntity: (order) => dispatch(setSelectedOrder(order)),
    refetch: refetchOrders,
    navigate,
    highlightParam: 'highlight',
    locationStateHighlightKey: 'highlightOrderId',
    routes: {
      create: '/sales/orders/create',
      edit: (id) => {
        const order = orders.find((item) => item.id === id)
        if (!order?.orderNumber) throw new Error(`Sales order ${id} not found in list`)
        return `/sales/orders/${order.orderNumber}/edit`
      },
    },
    isLoading: ordersLoading,
    onEnter: () => {
      if (workspaceRef.current?.focusedIndex != null && workspaceRef.current.focusedIndex >= 0) {
        const order = orders[workspaceRef.current.focusedIndex]
        if (order) {
          navigate(`/sales/orders/${order.orderNumber}/edit`)
        }
      }
    },
    onEscape: () => {
      workspaceRef.current?.setFocusedIndex(-1)
      dispatch(setSelectedOrder(null))
      setViewDialog(false)
      setBlockedDialogOpen(false)
      setDeletedOrdersDialogOpen(false)
      setDeleteConfirmOpen(false)
    },
  })
  workspaceRef.current = workspace

  const paymentSources = useMemo(
    () => (selectedOrder?.payments ?? []).map((payment) => ({
      sourceType: 'payment' as const,
      sourceId: payment.id,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedOrder?.payments?.map((payment) => payment.id).join(',')],
  )

  const { journalEntryRefs, journalEntryRefsLoading, navigateToJournalEntries } = useJournalEntryRefs([
    {
      sourceType: 'sales_order',
      sourceId: selectedOrder?.isFulfilled ? selectedOrder?.id : undefined,
    },
    ...paymentSources,
  ])

  const loadOrders = useCallback(() => {
    refetchOrders()
  }, [refetchOrders])

  useEffect(() => {
    loadOrders()

    if (selectedOrder?.id) {
      isRefreshingPersistedOrder.current = true
      hasRefreshedPersistedOrder.current = true

      triggerGetSalesOrder(selectedOrder.id)
        .unwrap()
        .then((order) => {
          dispatch(setSelectedOrder(order))
          isRefreshingPersistedOrder.current = false
        })
        .catch(() => {
          isRefreshingPersistedOrder.current = false
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (orders.length > 0 && selectedOrder && !isRefreshingPersistedOrder.current) {
      const freshOrder = orders.find((order) => order.id === selectedOrder.id)
      if (!freshOrder) {
        return
      }

      const selectedHasInvoices = selectedOrder.invoices && selectedOrder.invoices.length > 0
      const freshHasInvoices = freshOrder.invoices && freshOrder.invoices.length > 0
      const selectedHasItems = selectedOrder.items && selectedOrder.items.length > 0
      const freshHasItems = freshOrder.items && freshOrder.items.length > 0

      if ((freshHasInvoices && !selectedHasInvoices) || (freshHasItems && !selectedHasItems)) {
        dispatch(setSelectedOrder(freshOrder))
      } else if (!selectedHasInvoices && !freshHasInvoices && !selectedHasItems && !freshHasItems) {
        if (JSON.stringify(freshOrder) !== JSON.stringify(selectedOrder)) {
          dispatch(setSelectedOrder(freshOrder))
        }
      }
    }
  }, [dispatch, orders, selectedOrder])

  const handleOrderSelect = useCallback((order: SalesOrder) => {
    dispatch(setSelectedOrder(order))
    const orderIndex = orders.findIndex((item) => item.id === order.id)
    workspace.setFocusedIndex(orderIndex)
    void triggerGetSalesOrder(order.id)
      .unwrap()
      .then((fullOrder) => {
        dispatch(setSelectedOrder(fullOrder))
      })
    userHasNavigatedRef.current = true
  }, [dispatch, orders, triggerGetSalesOrder, workspace])

  useEffect(() => {
    if (orders.length > 0 && workspace.focusedIndex === -1 && !isRefreshingPersistedOrder.current) {
      if (selectedOrder) {
        const orderIndex = orders.findIndex((item) => item.id === selectedOrder.id)
        if (orderIndex >= 0) {
          workspace.setFocusedIndex(orderIndex)
        } else {
          workspace.setFocusedIndex(0)
        }
      } else if (workspace.searchInputRef.current !== document.activeElement) {
        // Don't auto-select when useEntityWorkspace is about to highlight a specific order
        const pendingHighlightId = searchParams.get('highlight')
        const hasPendingHighlight = pendingHighlightId
          ? orders.some((o) => o.id === pendingHighlightId)
          : false
        if (!hasPendingHighlight) {
          workspace.setFocusedIndex(0)
          dispatch(setSelectedOrder(orders[0]))
          void triggerGetSalesOrder(orders[0].id).unwrap().then((order) => dispatch(setSelectedOrder(order)))
        }
      }
    } else if (orders.length === 0) {
      if (ordersLoading) {
        return
      }
      dispatch(setSelectedOrder(null))
      dispatch(clearError())
      workspace.setFocusedIndex(-1)
    }
  }, [dispatch, orders, ordersLoading, searchParams, selectedOrder, triggerGetSalesOrder, workspace])

  useEffect(() => {
    if (!selectedOrder || orders.length === 0) {
      return
    }

    const correctIndex = orders.findIndex((item) => item.id === selectedOrder.id)
    if (correctIndex >= 0 && correctIndex !== workspace.focusedIndex) {
      workspace.setFocusedIndex(correctIndex)
    }
  }, [orders, selectedOrder, workspace])

  const selectAndLoadOrder = useCallback((index: number) => {
    workspace.setFocusedIndex(index)
    dispatch(setSelectedOrder(orders[index]))
    void triggerGetSalesOrder(orders[index].id).unwrap().then((order) => dispatch(setSelectedOrder(order)))
    userHasNavigatedRef.current = true
  }, [dispatch, orders, triggerGetSalesOrder, workspace])

  const handleNavigateUp = useCallback(() => {
    if (workspace.focusedIndex > 0) {
      selectAndLoadOrder(workspace.focusedIndex - 1)
    }
  }, [selectAndLoadOrder, workspace.focusedIndex])

  const handleNavigateDown = useCallback(() => {
    if (workspace.focusedIndex < orders.length - 1) {
      selectAndLoadOrder(workspace.focusedIndex + 1)
    }
  }, [orders.length, selectAndLoadOrder, workspace.focusedIndex])

  const handleNavigateToFirst = useCallback(() => {
    if (orders.length > 0) {
      selectAndLoadOrder(0)
    }
  }, [orders.length, selectAndLoadOrder])

  const handleNavigateToLast = useCallback(() => {
    if (orders.length > 0) {
      selectAndLoadOrder(orders.length - 1)
    }
  }, [orders.length, selectAndLoadOrder])

  const handlePageUpNavigation = useCallback(() => {
    const newIndex = Math.max(0, workspace.focusedIndex - 20)
    if (orders[newIndex]) {
      selectAndLoadOrder(newIndex)
    }
  }, [orders, selectAndLoadOrder, workspace.focusedIndex])

  const handlePageDownNavigation = useCallback(() => {
    const newIndex = Math.min(orders.length - 1, workspace.focusedIndex + 20)
    if (orders[newIndex]) {
      selectAndLoadOrder(newIndex)
    }
  }, [orders, selectAndLoadOrder, workspace.focusedIndex])

  const handleNavigateToInvoice = useCallback((invoice: any, event?: MouseEvent) => {
    event?.stopPropagation()
    navigate('/sales/invoices', { state: { highlightInvoice: invoice } })
  }, [navigate])

  const handleNavigateToPayment = useCallback((paymentId: string, event?: MouseEvent) => {
    event?.stopPropagation()
    navigate('/sales/payments', { state: { highlightPaymentId: paymentId } })
  }, [navigate])

  const handleOrderAction = useCallback(async (action: string, orderId: string, data?: any) => {
    try {
      switch (action) {
        case 'confirm':
          await confirmSalesOrder(orderId).unwrap()
          break
        case 'ship':
          await shipSalesOrder({ id: orderId, data: data || {} }).unwrap()
          break
        case 'deliver':
          await deliverSalesOrder(orderId).unwrap()
          break
        case 'complete':
          await completeSalesOrder(orderId).unwrap()
          break
        case 'cancel':
          await cancelSalesOrder({ id: orderId, reason: data?.reason }).unwrap()
          break
        case 'duplicate':
          await duplicateSalesOrder(orderId).unwrap()
          break
        case 'delete': {
          const order = orders.find((item) => item.id === orderId)
          if (order) {
            const isFulfilled = order.isFulfilled
            const isPaid = order.paidAmount && order.paidAmount > 0

            if (isFulfilled || isPaid) {
              dispatch(setSelectedOrder(order))
              setBlockedDialogAction('delete')
              setBlockedDialogOpen(true)
              return
            }
            setOrderToDelete(orderId)
            setOrderToDeleteName(order.orderNumber || order.id)
            setDeleteConfirmOpen(true)
            return
          }
          break
        }
      }

      refetchOrders()
    } catch (error) {
      console.error(`Failed to ${action} order:`, error)
    }
  }, [
    cancelSalesOrder,
    completeSalesOrder,
    confirmSalesOrder,
    deliverSalesOrder,
    dispatch,
    duplicateSalesOrder,
    orders,
    refetchOrders,
    shipSalesOrder,
  ])

  const handleConfirmDelete = useCallback(async (deletingOrderId: string | null, deletingOrderName: string) => {
    if (!deletingOrderId) {
      return
    }

    try {
      const result = await deleteSalesOrder(deletingOrderId).unwrap()
      if (result?.data) {
        dispatch(setSelectedOrder(result.data))
      } else {
        dispatch(setSelectedOrder(null))
      }
      refetchOrders()
      showSuccess(`Order "${deletingOrderName}" has been deleted successfully`)
      setDeleteConfirmOpen(false)
      setOrderToDelete(null)
      setOrderToDeleteName('')
    } catch (error: any) {
      console.error('Failed to delete order:', error)
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to delete order'
      showError(errorMessage)
      setDeleteConfirmOpen(false)
      setOrderToDelete(null)
      setOrderToDeleteName('')
    }
  }, [deleteSalesOrder, dispatch, refetchOrders, showError, showSuccess])

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmOpen(false)
    setOrderToDelete(null)
    setOrderToDeleteName('')
  }, [])

  const handleEditOrder = useCallback(() => {
    if (!selectedOrder) {
      return
    }

    const isFulfilled = selectedOrder.isFulfilled
    const isPaid = selectedOrder.paidAmount && selectedOrder.paidAmount > 0

    if (isFulfilled || isPaid) {
      setBlockedDialogAction('edit')
      setBlockedDialogOpen(true)
      return
    }
    navigate(`/sales/orders/${selectedOrder.orderNumber}/edit`)
  }, [navigate, selectedOrder])

  const handleRecordPayments = useCallback(async (
    payments: { paymentMethodId: string; amount: number; reference?: string }[],
  ) => {
    if (!selectedOrder) {
      return
    }

    const totalAdding = payments.reduce((sum, payment) => sum + payment.amount, 0)
    const newPaidAmount = (selectedOrder.paidAmount || 0) + totalAdding

    setIsLoading(true)
    try {
      const optimisticOrder = { ...selectedOrder, paidAmount: newPaidAmount }
      patchSalesOrderCaches(dispatch, getState, optimisticOrder)
      dispatch(setSelectedOrder(optimisticOrder))

      const updatedOrder = await recordOrderPayments({ id: selectedOrder.id, payments }).unwrap()
      patchSalesOrderCaches(dispatch, getState, updatedOrder)
      dispatch(setSelectedOrder(updatedOrder))
      const fullOrder = await triggerGetSalesOrder(selectedOrder.id).unwrap()
      dispatch(setSelectedOrder(fullOrder))
      showSuccess(`Payment of ${formatCurrency(totalAdding)} recorded successfully.`)
    } catch (error) {
      patchSalesOrderCaches(dispatch, getState, selectedOrder)
      dispatch(setSelectedOrder(selectedOrder))
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [dispatch, getState, recordOrderPayments, selectedOrder, showSuccess, triggerGetSalesOrder])

  const handleUnpayOrder = useCallback(async () => {
    if (!selectedOrder) {
      return
    }

    setIsLoading(true)
    try {
      await unpaySalesOrder(selectedOrder.id).unwrap()
      const fullOrder = await triggerGetSalesOrder(selectedOrder.id).unwrap()
      dispatch(setSelectedOrder(fullOrder))
      showSuccess('Payment cleared successfully')
    } catch (error: any) {
      console.error('Error unpaying order:', error)
      showError(error?.response?.data?.message || 'Error clearing payment. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [dispatch, selectedOrder, showError, showSuccess, triggerGetSalesOrder, unpaySalesOrder])

  const handleRefundOrder = useCallback(async () => {
    if (!selectedOrder) {
      return
    }

    const overpayment = (selectedOrder.paidAmount || 0) - (selectedOrder.totalAmount || 0)
    if (overpayment <= 0) {
      return
    }

    const newPaidAmount = selectedOrder.totalAmount || 0

    setIsLoading(true)
    try {
      const optimisticUpdate = { ...selectedOrder, paidAmount: newPaidAmount }
      patchSalesOrderCaches(dispatch, getState, optimisticUpdate)
      dispatch(setSelectedOrder(optimisticUpdate))

      const updatedOrder = await recordOrderPayment({ id: selectedOrder.id, amount: newPaidAmount }).unwrap()
      patchSalesOrderCaches(dispatch, getState, updatedOrder)
      dispatch(setSelectedOrder(updatedOrder))
      showSuccess(
        `Refund of ${formatCurrency(overpayment)} processed. Payment adjusted to ${formatCurrency(newPaidAmount)}`,
      )
    } catch (error: any) {
      patchSalesOrderCaches(dispatch, getState, selectedOrder)
      dispatch(setSelectedOrder(selectedOrder))
      console.error('Error processing refund:', error)
      showError(error?.response?.data?.message || 'Error processing refund. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [dispatch, getState, recordOrderPayment, selectedOrder, showError, showSuccess])

  const handleFulfillOrder = useCallback(async () => {
    if (!selectedOrder) {
      return
    }

    setIsLoading(true)
    try {
      const updatedOrder = await fulfillSalesOrder(selectedOrder.id).unwrap()
      patchSalesOrderCaches(dispatch, getState, updatedOrder)
      dispatch(setSelectedOrder(updatedOrder))
      showSuccess('Order fulfilled successfully! Inventory has been deducted.')
    } catch (error: any) {
      console.error('Error fulfilling order:', error)
      showError(error?.response?.data?.message || 'Error fulfilling order. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [dispatch, fulfillSalesOrder, getState, selectedOrder, showError, showSuccess])

  const handleUnfulfillOrder = useCallback(async () => {
    if (!selectedOrder) {
      return
    }

    setIsLoading(true)
    try {
      const updatedOrder = await unfulfillSalesOrder(selectedOrder.id).unwrap()
      patchSalesOrderCaches(dispatch, getState, updatedOrder)
      dispatch(setSelectedOrder(updatedOrder))
      showSuccess('Order unfulfilled successfully - inventory restored')
    } catch (error: any) {
      console.error('Error unfulfilling order:', error)
      showError(error?.response?.data?.message || 'Error unfulfilling order. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [dispatch, getState, selectedOrder, showError, showSuccess, unfulfillSalesOrder])

  const handleUnfulfillAndEdit = useCallback(async () => {
    if (!selectedOrder) {
      return
    }

    setIsLoading(true)
    try {
      const isPaid = selectedOrder.paidAmount && selectedOrder.paidAmount > 0
      const unfulfillResponse = await fetch(`/api/sales-orders/${selectedOrder.id}/unfulfill-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!unfulfillResponse.ok) {
        const errorData = await unfulfillResponse.json()
        throw new Error(errorData?.message || 'Failed to unfulfill order')
      }

      if (isPaid) {
        const unpayResponse = await fetch(`/api/sales-orders/${selectedOrder.id}/unpay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })

        if (unpayResponse.ok) {
          const updatedOrder = await unpayResponse.json()
          patchSalesOrderCaches(dispatch, getState, updatedOrder.data)
          dispatch(setSelectedOrder(updatedOrder.data))
          showSuccess('Order unfulfilled and unpaid successfully')
          setBlockedDialogOpen(false)
          navigate(`/sales/orders/${selectedOrder.orderNumber}/edit`)
        } else {
          const errorData = await unpayResponse.json()
          throw new Error(errorData?.message || 'Failed to unpay order')
        }
      } else {
        const updatedOrder = await unfulfillResponse.json()
        patchSalesOrderCaches(dispatch, getState, updatedOrder.data)
        dispatch(setSelectedOrder(updatedOrder.data))
        showSuccess('Order unfulfilled successfully')
        setBlockedDialogOpen(false)
        navigate(`/sales/orders/${selectedOrder.orderNumber}/edit`)
      }
    } catch (error: any) {
      console.error('Error unfulfilling order:', error)
      showError(error.message || 'Error unfulfilling order. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [dispatch, getState, navigate, selectedOrder, showError, showSuccess])

  const handleUnfulfillOnly = useCallback(async () => {
    if (!selectedOrder) {
      return
    }

    setIsLoading(true)
    try {
      const response = await fetch(`/api/sales-orders/${selectedOrder.id}/unfulfill-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (response.ok) {
        const updatedOrder = await response.json()
        patchSalesOrderCaches(dispatch, getState, updatedOrder.data)
        dispatch(setSelectedOrder(updatedOrder.data))
        showSuccess('Order unfulfilled successfully - inventory restored')
        setBlockedDialogOpen(false)
      } else {
        const errorData = await response.json()
        showError(errorData?.message || 'Failed to unfulfill order')
      }
    } catch (error) {
      console.error('Error unfulfilling order:', error)
      showError('Error unfulfilling order. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [dispatch, getState, selectedOrder, showError, showSuccess])

  const handleUnpayAndEdit = useCallback(async () => {
    if (!selectedOrder) {
      return
    }

    setIsLoading(true)
    try {
      const isFulfilled = selectedOrder.isFulfilled

      if (isFulfilled) {
        const unfulfillResponse = await fetch(`/api/sales-orders/${selectedOrder.id}/unfulfill-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })

        if (!unfulfillResponse.ok) {
          const errorData = await unfulfillResponse.json()
          throw new Error(errorData?.message || 'Failed to unfulfill order')
        }

        const unpayResponse = await fetch(`/api/sales-orders/${selectedOrder.id}/unpay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })

        if (unpayResponse.ok) {
          const updatedOrder = await unpayResponse.json()
          patchSalesOrderCaches(dispatch, getState, updatedOrder.data)
          dispatch(setSelectedOrder(updatedOrder.data))
          showSuccess('Order unfulfilled and unpaid successfully')
          setBlockedDialogOpen(false)
          navigate(`/sales/orders/${selectedOrder.orderNumber}/edit`)
        } else {
          const errorData = await unpayResponse.json()
          throw new Error(errorData?.message || 'Failed to unpay order')
        }
      } else {
        const unpayResponse = await fetch(`/api/sales-orders/${selectedOrder.id}/unpay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })

        if (!unpayResponse.ok) {
          const errorData = await unpayResponse.json()
          throw new Error(errorData?.message || 'Failed to unpay order')
        }

        const updatedOrder = await unpayResponse.json()
        patchSalesOrderCaches(dispatch, getState, updatedOrder.data)
        dispatch(setSelectedOrder(updatedOrder.data))
        showSuccess('Order unpaid successfully - payment removed')
        setBlockedDialogOpen(false)
        navigate(`/sales/orders/${selectedOrder.orderNumber}/edit`)
      }
    } catch (error: any) {
      console.error('Error unpaying order:', error)
      showError(error.message || 'Error unpaying order. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [dispatch, getState, navigate, selectedOrder, showError, showSuccess])

  const handleUnfulfillAndDelete = useCallback(async () => {
    if (!selectedOrder) {
      return
    }

    setIsLoading(true)
    try {
      const isPaid = selectedOrder.paidAmount && selectedOrder.paidAmount > 0
      const unfulfillResponse = await fetch(`/api/sales-orders/${selectedOrder.id}/unfulfill-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!unfulfillResponse.ok) {
        const errorData = await unfulfillResponse.json()
        throw new Error(errorData?.message || 'Failed to unfulfill order')
      }

      if (isPaid) {
        const unpayResponse = await fetch(`/api/sales-orders/${selectedOrder.id}/unpay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })

        if (!unpayResponse.ok) {
          const errorData = await unpayResponse.json()
          throw new Error(errorData?.message || 'Failed to unpay order')
        }

        showSuccess('Order unfulfilled and unpaid successfully')
      } else {
        showSuccess('Order unfulfilled successfully')
      }

      const updatedOrder = await unfulfillResponse.json()
      patchSalesOrderCaches(dispatch, getState, updatedOrder.data)
      dispatch(setSelectedOrder(updatedOrder.data))
      setBlockedDialogOpen(false)
      setOrderToDelete(selectedOrder.id)
      setOrderToDeleteName(selectedOrder.orderNumber || selectedOrder.id)
      setDeleteConfirmOpen(true)
    } catch (error: any) {
      console.error('Error preparing order for deletion:', error)
      showError(error.message || 'Error preparing order for deletion. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [dispatch, getState, selectedOrder, showError, showSuccess])

  const handleUnpayAndDelete = useCallback(async () => {
    if (!selectedOrder) {
      return
    }

    const orderId = selectedOrder.id
    const orderNumber = selectedOrder.orderNumber || selectedOrder.id
    const isFulfilled = selectedOrder.isFulfilled

    setIsLoading(true)
    try {
      if (isFulfilled) {
        await unfulfillSalesOrder(orderId).unwrap()
        await unpaySalesOrder(orderId).unwrap()
        showSuccess('Order unfulfilled and unpaid - now deleting...')
      } else {
        await unpaySalesOrder(orderId).unwrap()
        showSuccess('Order unpaid - now deleting...')
      }

      setBlockedDialogOpen(false)

      const result = await deleteSalesOrder(orderId).unwrap()
      if (result?.data) {
        dispatch(setSelectedOrder(result.data))
      } else {
        dispatch(setSelectedOrder(null))
      }
      refetchOrders()
      showSuccess(`Order "${orderNumber}" deleted successfully`)
    } catch (error: any) {
      console.error('Error preparing order for deletion:', error)
      showError(error?.response?.data?.message || error.message || 'Error preparing order for deletion. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [
    deleteSalesOrder,
    dispatch,
    refetchOrders,
    selectedOrder,
    showError,
    showSuccess,
    unfulfillSalesOrder,
    unpaySalesOrder,
  ])

  const openPaymentDialog = useCallback(() => {
    setPaymentDialogOpen(true)
  }, [])

  return {
    ...workspace,
    focusedOrderIndex: workspace.focusedIndex,
    orderListRef: workspace.listRef,
    viewDialog,
    setViewDialog,
    blockedDialogOpen,
    setBlockedDialogOpen,
    blockedDialogAction,
    deletedOrdersDialogOpen,
    setDeletedOrdersDialogOpen,
    deleteConfirmOpen,
    orderToDelete,
    orderToDeleteName,
    printDialogOpen,
    setPrintDialogOpen,
    paymentDialogOpen,
    setPaymentDialogOpen,
    isLoading,
    journalEntryRefs,
    journalEntryRefsLoading,
    handleOrderSelect,
    handleNavigateUp,
    handleNavigateDown,
    handleNavigateToFirst,
    handleNavigateToLast,
    handlePageUpNavigation,
    handlePageDownNavigation,
    handleNavigateToInvoice,
    handleNavigateToPayment,
    navigateToJournalEntries,
    handleOrderAction,
    handleConfirmDelete,
    handleCancelDelete,
    handleEditOrder,
    handleRecordPayments,
    handleUnpayOrder,
    handleRefundOrder,
    handleFulfillOrder,
    handleUnfulfillOrder,
    handleUnfulfillAndEdit,
    handleUnfulfillOnly,
    handleUnpayAndEdit,
    handleUnfulfillAndDelete,
    handleUnpayAndDelete,
    openPaymentDialog,
  }
}
