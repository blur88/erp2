import { useCallback, useEffect, type MutableRefObject, type RefObject } from 'react'
import type { NavigateFunction, SetURLSearchParams } from 'react-router-dom'

import { journalEntriesApi } from '@/services/accountingApi'
import { clearError, setSelectedOrder } from '@/store/slices/salesSlice'
import type { AppDispatch } from '@/store'
import type { SalesOrder } from '@/types'

import type { JournalEntryRef } from './useOrdersPageState'

interface UseOrdersSelectionParams {
  dispatch: AppDispatch
  orders: SalesOrder[]
  selectedOrder: SalesOrder | null
  pendingOrderToSelect: string | null
  setPendingOrderToSelect: (value: string | null) => void
  focusedOrderIndex: number
  setFocusedOrderIndex: (index: number) => void
  triggerGetSalesOrder: (id: string) => { unwrap: () => Promise<SalesOrder> }
  loadOrders: () => void
  navigate: NavigateFunction
  locationPathname: string
  setSearchParams: SetURLSearchParams
  orderListRef: RefObject<HTMLDivElement | null>
  searchInputRef: RefObject<HTMLInputElement | null>
  processedHighlightRef: MutableRefObject<string | null>
  userHasNavigatedRef: MutableRefObject<boolean>
  hasRefreshedPersistedOrder: MutableRefObject<boolean>
  isRefreshingPersistedOrder: MutableRefObject<boolean>
  setJournalEntryRef: (value: JournalEntryRef | null) => void
  setJournalEntryRefLoading: (value: boolean) => void
  setViewDialog: (open: boolean) => void
  setBlockedDialogOpen: (open: boolean) => void
  setDeletedOrdersDialogOpen: (open: boolean) => void
  setDeleteConfirmOpen: (open: boolean) => void
}

export function useOrdersSelection({
  dispatch,
  orders,
  selectedOrder,
  pendingOrderToSelect,
  setPendingOrderToSelect,
  focusedOrderIndex,
  setFocusedOrderIndex,
  triggerGetSalesOrder,
  loadOrders,
  navigate,
  locationPathname,
  setSearchParams,
  orderListRef,
  searchInputRef,
  processedHighlightRef,
  userHasNavigatedRef,
  hasRefreshedPersistedOrder,
  isRefreshingPersistedOrder,
  setJournalEntryRef,
  setJournalEntryRefLoading,
  setViewDialog,
  setBlockedDialogOpen,
  setDeletedOrdersDialogOpen,
  setDeleteConfirmOpen,
}: UseOrdersSelectionParams) {
  useEffect(() => {
    if (!selectedOrder?.isFulfilled || !selectedOrder?.id) {
      setJournalEntryRef(null)
      setJournalEntryRefLoading(false)
      return
    }

    let cancelled = false
    setJournalEntryRefLoading(true)

    journalEntriesApi
      .getAll({ sourceType: 'sales_order', sourceId: selectedOrder.id, limit: 1 })
      .then((res) => {
        if (cancelled) return
        const entry = res.data?.[0]
        setJournalEntryRef(entry ? { id: entry.id, referenceNumber: entry.referenceNumber } : null)
      })
      .catch(() => {
        if (!cancelled) setJournalEntryRef(null)
      })
      .finally(() => {
        if (!cancelled) setJournalEntryRefLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedOrder?.id, selectedOrder?.isFulfilled, setJournalEntryRef, setJournalEntryRefLoading])

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('highlight')) {
      setSearchParams((prev) => {
        prev.delete('highlight')
        return prev
      }, { replace: true })
    }
  }, [setSearchParams])

  useEffect(() => {
    if (!hasRefreshedPersistedOrder.current && selectedOrder?.id && !pendingOrderToSelect) {
      isRefreshingPersistedOrder.current = true
      hasRefreshedPersistedOrder.current = true

      triggerGetSalesOrder(selectedOrder.id)
        .unwrap()
        .then((order) => {
          dispatch(setSelectedOrder(order))

          setTimeout(() => {
            const orderIndex = orders.findIndex((item) => item.id === order.id)
            if (orderIndex >= 0) {
              setFocusedOrderIndex(orderIndex)
            }
            isRefreshingPersistedOrder.current = false
          }, 500)
        })
        .catch(() => {
          isRefreshingPersistedOrder.current = false
        })

      loadOrders()
    } else if (!hasRefreshedPersistedOrder.current) {
      hasRefreshedPersistedOrder.current = true
      loadOrders()
    }
  }, [dispatch, hasRefreshedPersistedOrder, isRefreshingPersistedOrder, loadOrders, orders, pendingOrderToSelect, selectedOrder?.id, setFocusedOrderIndex, triggerGetSalesOrder])

  useEffect(() => {
    if (hasRefreshedPersistedOrder.current) {
      loadOrders()
    }
  }, [hasRefreshedPersistedOrder, loadOrders])

  useEffect(() => {
    if (locationPathname === '/sales/orders') {
      loadOrders()
      if (selectedOrder && !pendingOrderToSelect) {
        triggerGetSalesOrder(selectedOrder.id)
          .unwrap()
          .then((order) => {
            dispatch(setSelectedOrder(order))
          })
      }
    }
  }, [locationPathname, loadOrders, selectedOrder, pendingOrderToSelect, triggerGetSalesOrder, dispatch])

  useEffect(() => {
    if (orders.length > 0 && selectedOrder && !isRefreshingPersistedOrder.current) {
      const freshOrder = orders.find((order) => order.id === selectedOrder.id)
      if (freshOrder) {
        const selectedHasInvoices = selectedOrder.invoices && selectedOrder.invoices.length > 0
        const freshHasInvoices = freshOrder.invoices && freshOrder.invoices.length > 0
        const selectedHasItems = selectedOrder.items && selectedOrder.items.length > 0
        const freshHasItems = freshOrder.items && freshOrder.items.length > 0

        if ((freshHasInvoices && !selectedHasInvoices) || (freshHasItems && !selectedHasItems)) {
          dispatch(setSelectedOrder(freshOrder))
        } else if (!selectedHasInvoices && !freshHasInvoices && !selectedHasItems && !freshHasItems) {
          const hasChanged = JSON.stringify(freshOrder) !== JSON.stringify(selectedOrder)
          if (hasChanged) {
            dispatch(setSelectedOrder(freshOrder))
          }
        }
      }
    }
  }, [dispatch, isRefreshingPersistedOrder, orders, selectedOrder])

  const handleOrderSelect = useCallback((order: SalesOrder) => {
    dispatch(setSelectedOrder(order))
    const orderIndex = orders.findIndex((item) => item.id === order.id)
    setFocusedOrderIndex(orderIndex)
    void triggerGetSalesOrder(order.id).unwrap().then((fullOrder) => {
      dispatch(setSelectedOrder(fullOrder))
    })
    userHasNavigatedRef.current = true
  }, [dispatch, orders, setFocusedOrderIndex, triggerGetSalesOrder, userHasNavigatedRef])

  useEffect(() => {
    const hasHighlightOrderId = !!pendingOrderToSelect || !!processedHighlightRef.current

    if (orders.length > 0 && focusedOrderIndex === -1 && !isRefreshingPersistedOrder.current) {
      if (selectedOrder && !pendingOrderToSelect) {
        const orderIndex = orders.findIndex((item) => item.id === selectedOrder.id)
        if (orderIndex >= 0) {
          setFocusedOrderIndex(orderIndex)
        } else {
          setFocusedOrderIndex(0)
        }
      } else if (searchInputRef.current !== document.activeElement && !hasHighlightOrderId) {
        setFocusedOrderIndex(0)
        dispatch(setSelectedOrder(orders[0]))
        void triggerGetSalesOrder(orders[0].id).unwrap().then((order) => dispatch(setSelectedOrder(order)))
      }
    } else if (orders.length === 0) {
      dispatch(setSelectedOrder(null))
      dispatch(clearError())
      setFocusedOrderIndex(-1)
    }
  }, [dispatch, focusedOrderIndex, isRefreshingPersistedOrder, orders, pendingOrderToSelect, processedHighlightRef, searchInputRef, selectedOrder, setFocusedOrderIndex, triggerGetSalesOrder])

  useEffect(() => {
    if (!processedHighlightRef.current || !selectedOrder || orders.length === 0) return
    const correctIndex = orders.findIndex((item) => item.id === selectedOrder.id)
    if (correctIndex >= 0 && correctIndex !== focusedOrderIndex) {
      setFocusedOrderIndex(correctIndex)
    }
  }, [focusedOrderIndex, orders, processedHighlightRef, selectedOrder, setFocusedOrderIndex])

  useEffect(() => {
    if (!pendingOrderToSelect || orders.length === 0) return
    const orderIndex = orders.findIndex((item) => item.id === pendingOrderToSelect)
    if (orderIndex >= 0) {
      dispatch(setSelectedOrder(orders[orderIndex]))
      setFocusedOrderIndex(orderIndex)
      processedHighlightRef.current = pendingOrderToSelect
      userHasNavigatedRef.current = false
      setPendingOrderToSelect(null)
      void triggerGetSalesOrder(orders[orderIndex].id).unwrap().then((order) => dispatch(setSelectedOrder(order)))
    }
  }, [dispatch, orders, pendingOrderToSelect, processedHighlightRef, setFocusedOrderIndex, setPendingOrderToSelect, triggerGetSalesOrder, userHasNavigatedRef])

  useEffect(() => {
    if (focusedOrderIndex >= 0 && orderListRef.current) {
      const focusedRow = orderListRef.current.querySelector(`[data-order-index="${focusedOrderIndex}"]`)
      if (focusedRow) {
        focusedRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [focusedOrderIndex, orderListRef])

  const selectAndLoadOrder = useCallback((index: number) => {
    setFocusedOrderIndex(index)
    dispatch(setSelectedOrder(orders[index]))
    void triggerGetSalesOrder(orders[index].id).unwrap().then((order) => dispatch(setSelectedOrder(order)))
    userHasNavigatedRef.current = true
  }, [dispatch, orders, setFocusedOrderIndex, triggerGetSalesOrder, userHasNavigatedRef])

  const handleNavigateUp = useCallback(() => {
    if (focusedOrderIndex > 0) {
      selectAndLoadOrder(focusedOrderIndex - 1)
    }
  }, [focusedOrderIndex, selectAndLoadOrder])

  const handleNavigateDown = useCallback(() => {
    if (focusedOrderIndex < orders.length - 1) {
      selectAndLoadOrder(focusedOrderIndex + 1)
    }
  }, [focusedOrderIndex, orders.length, selectAndLoadOrder])

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
    const rowsPerPage = 20
    const newIndex = Math.max(0, focusedOrderIndex - rowsPerPage)
    if (orders[newIndex]) {
      selectAndLoadOrder(newIndex)
    }
  }, [focusedOrderIndex, orders, selectAndLoadOrder])

  const handlePageDownNavigation = useCallback(() => {
    const rowsPerPage = 20
    const newIndex = Math.min(orders.length - 1, focusedOrderIndex + rowsPerPage)
    if (orders[newIndex]) {
      selectAndLoadOrder(newIndex)
    }
  }, [focusedOrderIndex, orders, selectAndLoadOrder])

  const handleEnterAction = useCallback(() => {
    if (focusedOrderIndex >= 0 && orders[focusedOrderIndex]) {
      navigate(`/sales/orders/${orders[focusedOrderIndex].id}/edit`)
    }
  }, [focusedOrderIndex, navigate, orders])

  const handleNavigateToInvoice = useCallback((invoice: any, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation()
    }
    navigate('/sales/invoices', { state: { highlightInvoice: invoice } })
  }, [navigate])

  const handleNavigateToPayment = useCallback((paymentId: string, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation()
    }
    navigate('/sales/payments', { state: { highlightPaymentId: paymentId } })
  }, [navigate])

  const handleEscapeAction = useCallback(() => {
    setFocusedOrderIndex(-1)
    dispatch(setSelectedOrder(null))
    setViewDialog(false)
    setBlockedDialogOpen(false)
    setDeletedOrdersDialogOpen(false)
    setDeleteConfirmOpen(false)
  }, [dispatch, setBlockedDialogOpen, setDeleteConfirmOpen, setDeletedOrdersDialogOpen, setFocusedOrderIndex, setViewDialog])

  return {
    handleOrderSelect,
    handleNavigateUp,
    handleNavigateDown,
    handleNavigateToFirst,
    handleNavigateToLast,
    handlePageUpNavigation,
    handlePageDownNavigation,
    handleEnterAction,
    handleNavigateToInvoice,
    handleNavigateToPayment,
    handleEscapeAction,
  }
}
