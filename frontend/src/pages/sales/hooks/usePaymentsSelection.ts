import { useCallback, useEffect, type MutableRefObject, type RefObject } from 'react'
import type { Location, NavigateFunction } from 'react-router-dom'

import type { PaymentJournalEntryRef, PaymentListItem } from './usePaymentsPageState'

import { useLazyGetJournalEntriesQuery } from '@/store/api/accountingApi'
import type { AppDispatch } from '@/store'
import { setSelectedPayment } from '@/store/slices/salesSlice'

interface UsePaymentsSelectionParams {
  dispatch: AppDispatch
  navigate: NavigateFunction
  payments: PaymentListItem[]
  selectedPayment: PaymentListItem | null
  focusedPaymentIndex: number
  setFocusedPaymentIndex: (index: number) => void
  location: Location
  refetch: () => void
  paymentListRef: RefObject<HTMLDivElement | null>
  searchInputRef: RefObject<HTMLInputElement | null>
  hasRestoredSelection: MutableRefObject<boolean>
  selectedPaymentRef: MutableRefObject<PaymentListItem | null>
  setJournalEntryRef: (value: PaymentJournalEntryRef | null) => void
  setJournalEntryRefLoading: (value: boolean) => void
}

export function usePaymentsSelection({
  dispatch,
  navigate,
  payments,
  selectedPayment,
  focusedPaymentIndex,
  setFocusedPaymentIndex,
  location,
  refetch,
  paymentListRef,
  searchInputRef,
  hasRestoredSelection,
  selectedPaymentRef,
  setJournalEntryRef,
  setJournalEntryRefLoading,
}: UsePaymentsSelectionParams) {
  const [fetchJournalEntries] = useLazyGetJournalEntriesQuery()

  useEffect(() => {
    selectedPaymentRef.current = selectedPayment
  }, [selectedPayment, selectedPaymentRef])

  useEffect(() => {
    if (!selectedPayment?.id) {
      setJournalEntryRef(null)
      setJournalEntryRefLoading(false)
      return
    }

    let cancelled = false
    setJournalEntryRefLoading(true)

    ;(async () => {
      try {
        const res = await fetchJournalEntries({
          sourceType: 'payment',
          sourceId: selectedPayment.id,
          limit: 1,
        }).unwrap()

        if (cancelled) return

        const entry = res?.data?.[0]
        if (entry) {
          setJournalEntryRef({
            referenceNumber: entry.referenceNumber,
            sourceType: 'payment',
            sourceId: selectedPayment.id,
          })
        } else {
          setJournalEntryRef(null)
        }
      } catch {
        if (!cancelled) setJournalEntryRef(null)
      } finally {
        if (!cancelled) setJournalEntryRefLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [selectedPayment?.id, fetchJournalEntries, setJournalEntryRef, setJournalEntryRefLoading])

  useEffect(() => {
    if (location.pathname === '/sales/payments') {
      void refetch()
    }
  }, [location.pathname, refetch])

  useEffect(() => {
    if (payments.length > 0 && selectedPaymentRef.current) {
      const freshPayment = payments.find((payment) => payment.id === selectedPaymentRef.current?.id)
      if (freshPayment) {
        const hasChanged = JSON.stringify(freshPayment) !== JSON.stringify(selectedPaymentRef.current)
        if (hasChanged) {
          dispatch(setSelectedPayment(freshPayment as any))
        }
      }
    }
  }, [dispatch, payments, selectedPaymentRef])

  useEffect(() => {
    if (!hasRestoredSelection.current && selectedPayment && payments.length > 0) {
      const index = payments.findIndex((payment) => payment.id === selectedPayment.id)
      if (index >= 0) {
        setFocusedPaymentIndex(index)
        hasRestoredSelection.current = true
      }
    }
  }, [hasRestoredSelection, payments, selectedPayment, setFocusedPaymentIndex])

  useEffect(() => {
    if (payments.length > 0 && focusedPaymentIndex === -1) {
      if (selectedPayment) {
        const index = payments.findIndex((payment) => payment.id === selectedPayment.id)
        if (index >= 0) {
          setFocusedPaymentIndex(index)
        }
      } else if (searchInputRef.current !== document.activeElement) {
        setFocusedPaymentIndex(0)
        dispatch(setSelectedPayment(payments[0] as any))
      }
    } else if (payments.length === 0) {
      dispatch(setSelectedPayment(null))
      setFocusedPaymentIndex(-1)
    }
  }, [dispatch, focusedPaymentIndex, payments, searchInputRef, selectedPayment, setFocusedPaymentIndex])

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('highlight')
    if (!id || payments.length === 0) return

    const index = payments.findIndex((payment) => payment.id === id)
    if (index >= 0) {
      dispatch(setSelectedPayment(payments[index] as any))
      setFocusedPaymentIndex(index)
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [dispatch, payments, setFocusedPaymentIndex])

  useEffect(() => {
    const state = location.state as { highlightPaymentId?: string } | null
    if (state?.highlightPaymentId && payments.length > 0) {
      const index = payments.findIndex((payment) => payment.id === state.highlightPaymentId)
      if (index >= 0) {
        dispatch(setSelectedPayment(payments[index] as any))
        setFocusedPaymentIndex(index)
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      }
    }
  }, [dispatch, location.state, payments, setFocusedPaymentIndex])

  useEffect(() => {
    if (focusedPaymentIndex >= 0 && paymentListRef.current) {
      const row = paymentListRef.current.querySelector(`[data-payment-index="${focusedPaymentIndex}"]`)
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [focusedPaymentIndex, paymentListRef])

  const selectByIndex = useCallback((index: number) => {
    setFocusedPaymentIndex(index)
    dispatch(setSelectedPayment(payments[index] as any))
  }, [dispatch, payments, setFocusedPaymentIndex])

  const handlePaymentSelect = useCallback((payment: PaymentListItem) => {
    const index = payments.findIndex((item) => item.id === payment.id)
    dispatch(setSelectedPayment(payment as any))
    setFocusedPaymentIndex(index)
  }, [dispatch, payments, setFocusedPaymentIndex])

  const handleNavigateUp = useCallback(() => {
    if (focusedPaymentIndex > 0) selectByIndex(focusedPaymentIndex - 1)
  }, [focusedPaymentIndex, selectByIndex])

  const handleNavigateDown = useCallback(() => {
    if (focusedPaymentIndex < payments.length - 1) selectByIndex(focusedPaymentIndex + 1)
  }, [focusedPaymentIndex, payments.length, selectByIndex])

  const handleNavigateToFirst = useCallback(() => {
    if (payments.length > 0) selectByIndex(0)
  }, [payments.length, selectByIndex])

  const handleNavigateToLast = useCallback(() => {
    if (payments.length > 0) selectByIndex(payments.length - 1)
  }, [payments.length, selectByIndex])

  const handlePageUpNavigation = useCallback(() => {
    const newIndex = Math.max(0, focusedPaymentIndex - 20)
    if (payments[newIndex]) selectByIndex(newIndex)
  }, [focusedPaymentIndex, payments, selectByIndex])

  const handlePageDownNavigation = useCallback(() => {
    const newIndex = Math.min(payments.length - 1, focusedPaymentIndex + 20)
    if (payments[newIndex]) selectByIndex(newIndex)
  }, [focusedPaymentIndex, payments, selectByIndex])

  const handleEnterAction = useCallback(() => {
    // Payments cannot be edited; Enter is a no-op.
  }, [])

  const handleEscapeAction = useCallback(() => {
    setFocusedPaymentIndex(-1)
    dispatch(setSelectedPayment(null))
  }, [dispatch, setFocusedPaymentIndex])

  const handleOrderClick = useCallback((orderId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    navigate(`/sales/orders?highlight=${orderId}`)
  }, [navigate])

  const handleInvoiceClick = useCallback((invoiceId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    navigate('/sales/invoices', { state: { highlightInvoiceId: invoiceId } })
  }, [navigate])

  const handleNavigateToJournalEntry = useCallback((journalRef: PaymentJournalEntryRef | null) => {
    if (!journalRef) return
    navigate(`/accounting/journal-entries?sourceType=${journalRef.sourceType}&sourceId=${journalRef.sourceId}`)
  }, [navigate])

  return {
    handlePaymentSelect,
    handleNavigateUp,
    handleNavigateDown,
    handleNavigateToFirst,
    handleNavigateToLast,
    handlePageUpNavigation,
    handlePageDownNavigation,
    handleEnterAction,
    handleEscapeAction,
    handleOrderClick,
    handleInvoiceClick,
    handleNavigateToJournalEntry,
  }
}
