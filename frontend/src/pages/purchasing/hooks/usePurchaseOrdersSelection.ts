import { useCallback, useEffect, type MutableRefObject, type RefObject } from 'react'
import type { SetURLSearchParams } from 'react-router-dom'

import { useLazyGetJournalEntriesQuery } from '@/store/api/accountingApi'
import { setSelectedPurchaseOrder, updatePurchaseOrderInPlace } from '@/store/slices/purchasingSlice'
import type { AppDispatch } from '@/store'
import type { PurchaseOrder } from '@/types'

import type { PurchaseJournalEntryRef } from './usePurchaseOrdersPageState'

interface UsePurchaseOrdersSelectionParams {
  dispatch: AppDispatch
  purchaseOrders: PurchaseOrder[]
  selectedOrder: PurchaseOrder | null
  focusedOrderIndex: number
  setFocusedOrderIndex: (index: number) => void
  searchParams: URLSearchParams
  setSearchParams: SetURLSearchParams
  fetchPurchaseOrder: (id: string) => { unwrap: () => Promise<PurchaseOrder> }
  pendingHighlightId: string | null
  setPendingHighlightId: (id: string | null) => void
  orderListRef: RefObject<HTMLDivElement | null>
  searchInputRef: RefObject<HTMLInputElement | null>
  processedHighlightRef: MutableRefObject<string | null>
  userHasNavigatedRef: MutableRefObject<boolean>
  setJournalEntryRef: (value: PurchaseJournalEntryRef | null) => void
  setJournalEntryRefLoading: (value: boolean) => void
}

export function usePurchaseOrdersSelection({
  dispatch,
  purchaseOrders,
  selectedOrder,
  focusedOrderIndex,
  setFocusedOrderIndex,
  searchParams,
  setSearchParams,
  fetchPurchaseOrder,
  pendingHighlightId,
  setPendingHighlightId,
  orderListRef,
  searchInputRef,
  processedHighlightRef,
  userHasNavigatedRef,
  setJournalEntryRef,
  setJournalEntryRefLoading,
}: UsePurchaseOrdersSelectionParams) {
  const [fetchJournalEntries] = useLazyGetJournalEntriesQuery()

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('highlight')) {
      setSearchParams((prev) => {
        prev.delete('highlight')
        return prev
      }, { replace: true })
    }
  }, [setSearchParams])

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
    const vpSources = (selectedOrder.vendorPayments || []).map((payment: any) => ({
      sourceType: 'vendor_payment',
      sourceId: payment.id,
    }))
    const sources = [...grnSources, ...vpSources]

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
          const res = await fetchJournalEntries({
            sourceType: source.sourceType,
            sourceId: source.sourceId,
            sortBy: 'createdAt',
            sortOrder: 'DESC',
            limit: 1,
          }).unwrap()

          if (cancelled) return

          const entry = res.data?.[0]
          if (entry) {
            setJournalEntryRef({
              referenceNumber: entry.referenceNumber,
              sourceType: source.sourceType,
              sourceId: source.sourceId,
            })
            return
          }
        }

        if (!cancelled) setJournalEntryRef(null)
      } catch {
        if (!cancelled) setJournalEntryRef(null)
      } finally {
        if (!cancelled) setJournalEntryRefLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [selectedOrder?.id, selectedOrder?.goodsReceivedNotes, selectedOrder?.vendorPayments, setJournalEntryRef, setJournalEntryRefLoading, fetchJournalEntries])

  useEffect(() => {
    const poId = searchParams.get('poId')
    if (poId && purchaseOrders.length > 0) {
      const po = purchaseOrders.find((order) => order.id === poId)
      if (po) {
        dispatch(setSelectedPurchaseOrder(po))
        const orderIndex = purchaseOrders.findIndex((item) => item.id === po.id)
        setFocusedOrderIndex(orderIndex)
        setSearchParams({})
      }
    }
  }, [dispatch, purchaseOrders, searchParams, setFocusedOrderIndex, setSearchParams])

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
  }, [dispatch, fetchPurchaseOrder, purchaseOrders, setFocusedOrderIndex, userHasNavigatedRef])

  useEffect(() => {
    const hasHighlightOrderId = !!pendingHighlightId || !!processedHighlightRef.current

    if (purchaseOrders.length > 0 && focusedOrderIndex === -1) {
      if (selectedOrder && !pendingHighlightId) {
        const orderIndex = purchaseOrders.findIndex((order) => order.id === selectedOrder.id)
        if (orderIndex >= 0) {
          setFocusedOrderIndex(orderIndex)
        } else {
          setFocusedOrderIndex(0)
        }
      } else if (searchInputRef.current !== document.activeElement && !hasHighlightOrderId) {
        const poId = searchParams.get('poId')
        if (!poId) {
          setFocusedOrderIndex(0)
          dispatch(setSelectedPurchaseOrder(purchaseOrders[0]))
        }
      }
    }
  }, [dispatch, focusedOrderIndex, pendingHighlightId, processedHighlightRef, purchaseOrders, searchInputRef, searchParams, selectedOrder, setFocusedOrderIndex])

  useEffect(() => {
    if (purchaseOrders.length === 0 && selectedOrder) {
      dispatch(setSelectedPurchaseOrder(null))
      setFocusedOrderIndex(-1)
    }
  }, [dispatch, purchaseOrders.length, selectedOrder, setFocusedOrderIndex])

  useEffect(() => {
    if (!pendingHighlightId || purchaseOrders.length === 0) return
    const orderIndex = purchaseOrders.findIndex((order) => order.id === pendingHighlightId)
    if (orderIndex >= 0) {
      dispatch(setSelectedPurchaseOrder(purchaseOrders[orderIndex]))
      setFocusedOrderIndex(orderIndex)
      processedHighlightRef.current = pendingHighlightId
      userHasNavigatedRef.current = false
      setPendingHighlightId(null)
    }
  }, [dispatch, pendingHighlightId, processedHighlightRef, purchaseOrders, setFocusedOrderIndex, setPendingHighlightId, userHasNavigatedRef])

  useEffect(() => {
    if (focusedOrderIndex >= 0 && orderListRef.current) {
      const focusedRow = orderListRef.current.querySelector(`[data-order-index="${focusedOrderIndex}"]`)
      if (focusedRow) {
        focusedRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [focusedOrderIndex, orderListRef])

  const handleNavigateUp = useCallback(() => {
    if (focusedOrderIndex > 0) {
      const newIndex = focusedOrderIndex - 1
      setFocusedOrderIndex(newIndex)
      dispatch(setSelectedPurchaseOrder(purchaseOrders[newIndex]))
      userHasNavigatedRef.current = true
    }
  }, [dispatch, focusedOrderIndex, purchaseOrders, setFocusedOrderIndex, userHasNavigatedRef])

  const handleNavigateDown = useCallback(() => {
    if (focusedOrderIndex < purchaseOrders.length - 1) {
      const newIndex = focusedOrderIndex + 1
      setFocusedOrderIndex(newIndex)
      dispatch(setSelectedPurchaseOrder(purchaseOrders[newIndex]))
      userHasNavigatedRef.current = true
    }
  }, [dispatch, focusedOrderIndex, purchaseOrders, setFocusedOrderIndex, userHasNavigatedRef])

  const focusSearchInput = useCallback(() => {
    searchInputRef.current?.focus()
  }, [searchInputRef])

  return {
    handleOrderSelect,
    handleNavigateUp,
    handleNavigateDown,
    focusSearchInput,
  }
}
