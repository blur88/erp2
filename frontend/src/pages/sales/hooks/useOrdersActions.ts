import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

import { salesApi } from '@/services/salesApi'
import { patchSalesOrderCaches } from '@/store/api/salesOrderCache'
import { setSelectedOrder } from '@/store/slices/salesSlice'
import type { AppDispatch, RootState } from '@/store'
import type { SalesOrder } from '@/types'
import { formatCurrency } from '@/utils/formatters'

import type { BlockedOrderAction } from './useOrdersPageState'

interface UseOrdersActionsParams {
  dispatch: AppDispatch
  getState: () => RootState
  navigate: ReturnType<typeof useNavigate>
  orders: SalesOrder[]
  selectedOrder: SalesOrder | null
  triggerGetSalesOrder: (id: string) => { unwrap: () => Promise<SalesOrder> }
  deleteSalesOrder: (id: string) => { unwrap: () => Promise<any> }
  refetchOrders: () => void
  showSuccess: (message: string) => void
  showError: (message: string) => void
  setBlockedDialogAction: (action: BlockedOrderAction) => void
  setBlockedDialogOpen: (open: boolean) => void
  setDeleteConfirmOpen: (open: boolean) => void
  setOrderToDelete: (id: string | null) => void
  setOrderToDeleteName: (name: string) => void
  setIsLoading: (loading: boolean) => void
  setPaymentDialogOpen: (open: boolean) => void
}

export function useOrdersActions({
  dispatch,
  getState,
  navigate,
  orders,
  selectedOrder,
  triggerGetSalesOrder,
  deleteSalesOrder,
  refetchOrders,
  showSuccess,
  showError,
  setBlockedDialogAction,
  setBlockedDialogOpen,
  setDeleteConfirmOpen,
  setOrderToDelete,
  setOrderToDeleteName,
  setIsLoading,
  setPaymentDialogOpen,
}: UseOrdersActionsParams) {
  const handleOrderAction = useCallback(async (action: string, orderId: string, data?: any) => {
    try {
      switch (action) {
        case 'confirm':
          await salesApi.confirmOrder(orderId)
          break
        case 'ship':
          await salesApi.shipOrder(orderId, data || {})
          break
        case 'deliver':
          await salesApi.deliverOrder(orderId)
          break
        case 'complete':
          await salesApi.completeOrder(orderId)
          break
        case 'cancel':
          await salesApi.cancelOrder(orderId, data?.reason)
          break
        case 'duplicate':
          await salesApi.duplicateOrder(orderId)
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
  }, [dispatch, orders, refetchOrders, setBlockedDialogAction, setBlockedDialogOpen, setDeleteConfirmOpen, setOrderToDelete, setOrderToDeleteName])

  const handleConfirmDelete = useCallback(async (orderToDelete: string | null, orderToDeleteName: string) => {
    if (!orderToDelete) return

    try {
      const result = await deleteSalesOrder(orderToDelete).unwrap()
      if (result?.data) {
        dispatch(setSelectedOrder(result.data))
      } else {
        dispatch(setSelectedOrder(null))
      }
      refetchOrders()
      showSuccess(`Order "${orderToDeleteName}" has been deleted successfully`)

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
  }, [deleteSalesOrder, dispatch, refetchOrders, setDeleteConfirmOpen, setOrderToDelete, setOrderToDeleteName, showError, showSuccess])

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmOpen(false)
    setOrderToDelete(null)
    setOrderToDeleteName('')
  }, [setDeleteConfirmOpen, setOrderToDelete, setOrderToDeleteName])

  const handleEditOrder = useCallback(() => {
    if (!selectedOrder) return

    const isFulfilled = selectedOrder.isFulfilled
    const isPaid = selectedOrder.paidAmount && selectedOrder.paidAmount > 0

    if (isFulfilled || isPaid) {
      setBlockedDialogAction('edit')
      setBlockedDialogOpen(true)
      return
    }
    navigate(`/sales/orders/${selectedOrder.id}/edit`)
  }, [navigate, selectedOrder, setBlockedDialogAction, setBlockedDialogOpen])

  const handleRecordPayments = useCallback(async (payments: { paymentMethodId: string; amount: number; reference?: string }[]) => {
    if (!selectedOrder) return

    const totalAdding = payments.reduce((sum, payment) => sum + payment.amount, 0)
    const newPaidAmount = (selectedOrder.paidAmount || 0) + totalAdding

    setIsLoading(true)
    try {
      const optimisticOrder = { ...selectedOrder, paidAmount: newPaidAmount }
      patchSalesOrderCaches(dispatch, getState, optimisticOrder)
      dispatch(setSelectedOrder(optimisticOrder))

      const response = await salesApi.recordOrderPayments(selectedOrder.id, payments)
      patchSalesOrderCaches(dispatch, getState, response.data)
      dispatch(setSelectedOrder(response.data))
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
  }, [dispatch, getState, selectedOrder, setIsLoading, showSuccess, triggerGetSalesOrder])

  const handleUnpayOrder = useCallback(async () => {
    if (!selectedOrder) return

    setIsLoading(true)
    try {
      await salesApi.unpayOrder(selectedOrder.id)
      const fullOrder = await triggerGetSalesOrder(selectedOrder.id).unwrap()
      dispatch(setSelectedOrder(fullOrder))
      showSuccess('Payment cleared successfully')
    } catch (error: any) {
      console.error('Error unpaying order:', error)
      const errorMessage = error?.response?.data?.message || 'Error clearing payment. Please try again.'
      showError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [dispatch, selectedOrder, setIsLoading, showError, showSuccess, triggerGetSalesOrder])

  const handleRefundOrder = useCallback(async () => {
    if (!selectedOrder) return

    const overpayment = (selectedOrder.paidAmount || 0) - (selectedOrder.totalAmount || 0)
    if (overpayment <= 0) return

    const newPaidAmount = selectedOrder.totalAmount || 0

    setIsLoading(true)
    try {
      const optimisticUpdate = { ...selectedOrder, paidAmount: newPaidAmount }
      patchSalesOrderCaches(dispatch, getState, optimisticUpdate)
      dispatch(setSelectedOrder(optimisticUpdate))

      const response = await salesApi.recordOrderPayment(selectedOrder.id, newPaidAmount)
      patchSalesOrderCaches(dispatch, getState, response.data)
      dispatch(setSelectedOrder(response.data))
      showSuccess(`Refund of ${formatCurrency(overpayment)} processed. Payment adjusted to ${formatCurrency(newPaidAmount)}`)
    } catch (error: any) {
      patchSalesOrderCaches(dispatch, getState, selectedOrder)
      dispatch(setSelectedOrder(selectedOrder))
      console.error('Error processing refund:', error)
      const errorMessage = error?.response?.data?.message || 'Error processing refund. Please try again.'
      showError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [dispatch, getState, selectedOrder, setIsLoading, showError, showSuccess])

  const handleFulfillOrder = useCallback(async () => {
    if (!selectedOrder) return

    setIsLoading(true)
    try {
      const response = await salesApi.fulfillOrder(selectedOrder.id)
      patchSalesOrderCaches(dispatch, getState, response.data)
      dispatch(setSelectedOrder(response.data))
      showSuccess('Order fulfilled successfully! Inventory has been deducted.')
    } catch (error: any) {
      console.error('Error fulfilling order:', error)
      const errorMessage = error?.response?.data?.message || 'Error fulfilling order. Please try again.'
      showError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [dispatch, getState, selectedOrder, setIsLoading, showError, showSuccess])

  const handleUnfulfillOrder = useCallback(async () => {
    if (!selectedOrder) return

    setIsLoading(true)
    try {
      const response = await salesApi.unfulfillOrder(selectedOrder.id)
      patchSalesOrderCaches(dispatch, getState, response.data)
      dispatch(setSelectedOrder(response.data))
      showSuccess('Order unfulfilled successfully - inventory restored')
    } catch (error: any) {
      console.error('Error unfulfilling order:', error)
      const errorMessage = error?.response?.data?.message || 'Error unfulfilling order. Please try again.'
      showError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }, [dispatch, getState, selectedOrder, setIsLoading, showError, showSuccess])

  const handleUnfulfillAndEdit = useCallback(async () => {
    if (!selectedOrder) return

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
          navigate(`/sales/orders/${selectedOrder.id}/edit`)
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
        navigate(`/sales/orders/${selectedOrder.id}/edit`)
      }
    } catch (error: any) {
      console.error('Error unfulfilling order:', error)
      showError(error.message || 'Error unfulfilling order. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [dispatch, getState, navigate, selectedOrder, setBlockedDialogOpen, setIsLoading, showError, showSuccess])

  const handleUnfulfillOnly = useCallback(async () => {
    if (!selectedOrder) return

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
        const errorMessage = errorData?.message || 'Failed to unfulfill order'
        showError(errorMessage)
      }
    } catch (error) {
      console.error('Error unfulfilling order:', error)
      showError('Error unfulfilling order. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [dispatch, getState, selectedOrder, setBlockedDialogOpen, setIsLoading, showError, showSuccess])

  const handleUnpayAndEdit = useCallback(async () => {
    if (!selectedOrder) return

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
          navigate(`/sales/orders/${selectedOrder.id}/edit`)
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
        navigate(`/sales/orders/${selectedOrder.id}/edit`)
      }
    } catch (error: any) {
      console.error('Error unpaying order:', error)
      showError(error.message || 'Error unpaying order. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }, [dispatch, getState, navigate, selectedOrder, setBlockedDialogOpen, setIsLoading, showError, showSuccess])

  const handleUnfulfillAndDelete = useCallback(async () => {
    if (!selectedOrder) return

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
  }, [dispatch, getState, selectedOrder, setBlockedDialogOpen, setDeleteConfirmOpen, setIsLoading, setOrderToDelete, setOrderToDeleteName, showError, showSuccess])

  const handleUnpayAndDelete = useCallback(async () => {
    if (!selectedOrder) return

    const orderId = selectedOrder.id
    const orderNumber = selectedOrder.orderNumber || selectedOrder.id
    const isFulfilled = selectedOrder.isFulfilled

    setIsLoading(true)
    try {
      if (isFulfilled) {
        await salesApi.unfulfillOrder(orderId)
        await salesApi.unpayOrder(orderId)
        showSuccess('Order unfulfilled and unpaid - now deleting...')
      } else {
        await salesApi.unpayOrder(orderId)
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
  }, [deleteSalesOrder, dispatch, refetchOrders, selectedOrder, setBlockedDialogOpen, setIsLoading, showError, showSuccess])

  const openPaymentDialog = useCallback(() => {
    setPaymentDialogOpen(true)
  }, [setPaymentDialogOpen])

  return {
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
