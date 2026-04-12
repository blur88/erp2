import { useCallback, useEffect, type MutableRefObject, type RefObject } from 'react'
import type { SetURLSearchParams } from 'react-router-dom'

import type { AppDispatch } from '@/store'
import { useLazyGetJournalEntriesQuery } from '@/store/api/accountingApi'
import { useLazyGetVendorPaymentQuery } from '@/store/api/purchasingApi'
import { setSelectedVendorPayment } from '@/store/slices/purchasingSlice'
import type { VendorPayment } from '@/types'

import type { VPJournalEntryRef } from './useVendorPaymentsPageState'

interface UseVendorPaymentsSelectionParams {
  dispatch: AppDispatch
  payments: VendorPayment[]
  selectedPayment: VendorPayment | null
  focusedPaymentIndex: number
  setFocusedPaymentIndex: (index: number) => void
  searchParams: URLSearchParams
  setSearchParams: SetURLSearchParams
  paymentListRef: RefObject<HTMLDivElement | null>
  searchInputRef: RefObject<HTMLInputElement | null>
  userHasNavigatedRef: MutableRefObject<boolean>
  setJournalEntryRef: (value: VPJournalEntryRef | null) => void
  setJournalEntryRefLoading: (value: boolean) => void
}

export function useVendorPaymentsSelection({
  dispatch,
  payments,
  selectedPayment,
  focusedPaymentIndex,
  setFocusedPaymentIndex,
  searchParams,
  setSearchParams,
  paymentListRef,
  searchInputRef,
  userHasNavigatedRef,
  setJournalEntryRef,
  setJournalEntryRefLoading,
}: UseVendorPaymentsSelectionParams) {
  const [fetchPayment] = useLazyGetVendorPaymentQuery()
  const [fetchJournalEntries] = useLazyGetJournalEntriesQuery()

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
          sourceType: 'vendor_payment',
          sourceId: selectedPayment.id,
          sortBy: 'createdAt',
          sortOrder: 'DESC',
          limit: 1,
        }).unwrap()

        if (cancelled) return

        const entry = res.data?.[0]
        if (entry) {
          setJournalEntryRef({
            referenceNumber: entry.referenceNumber,
            sourceType: 'vendor_payment',
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
  }, [fetchJournalEntries, selectedPayment?.id, setJournalEntryRef, setJournalEntryRefLoading])

  useEffect(() => {
    const vpId = searchParams.get('vpId')
    if (vpId && payments.length > 0) {
      const payment = payments.find((item) => item.id === vpId)
      if (payment) {
        dispatch(setSelectedVendorPayment(payment))
        const index = payments.findIndex((item) => item.id === payment.id)
        setFocusedPaymentIndex(index)
        setSearchParams((prev) => {
          prev.delete('vpId')
          return prev
        }, { replace: true })
      }
    }
  }, [dispatch, payments, searchParams, setFocusedPaymentIndex, setSearchParams])

  useEffect(() => {
    if (payments.length > 0 && focusedPaymentIndex === -1) {
      if (selectedPayment) {
        const index = payments.findIndex((item) => item.id === selectedPayment.id)
        setFocusedPaymentIndex(index >= 0 ? index : 0)
      } else if (searchInputRef.current !== document.activeElement) {
        const vpId = searchParams.get('vpId')
        if (!vpId) {
          setFocusedPaymentIndex(0)
          dispatch(setSelectedVendorPayment(payments[0]))
        }
      }
    }
  }, [dispatch, focusedPaymentIndex, payments, searchInputRef, searchParams, selectedPayment, setFocusedPaymentIndex])

  useEffect(() => {
    if (payments.length === 0 && selectedPayment) {
      dispatch(setSelectedVendorPayment(null))
      setFocusedPaymentIndex(-1)
    }
  }, [dispatch, payments.length, selectedPayment, setFocusedPaymentIndex])

  useEffect(() => {
    if (focusedPaymentIndex >= 0 && paymentListRef.current) {
      const row = paymentListRef.current.querySelector(`[data-payment-index="${focusedPaymentIndex}"]`)
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [focusedPaymentIndex, paymentListRef])

  const handlePaymentSelect = useCallback(async (payment: VendorPayment) => {
    const index = payments.findIndex((item) => item.id === payment.id)
    setFocusedPaymentIndex(index)
    userHasNavigatedRef.current = true

    try {
      const freshPayment = await fetchPayment(payment.id).unwrap()
      dispatch(setSelectedVendorPayment(freshPayment))
    } catch {
      dispatch(setSelectedVendorPayment(payment))
    }
  }, [dispatch, fetchPayment, payments, setFocusedPaymentIndex, userHasNavigatedRef])

  const handleNavigateUp = useCallback(() => {
    if (focusedPaymentIndex > 0) {
      const newIndex = focusedPaymentIndex - 1
      setFocusedPaymentIndex(newIndex)
      dispatch(setSelectedVendorPayment(payments[newIndex]))
      userHasNavigatedRef.current = true
    }
  }, [dispatch, focusedPaymentIndex, payments, setFocusedPaymentIndex, userHasNavigatedRef])

  const handleNavigateDown = useCallback(() => {
    if (focusedPaymentIndex < payments.length - 1) {
      const newIndex = focusedPaymentIndex + 1
      setFocusedPaymentIndex(newIndex)
      dispatch(setSelectedVendorPayment(payments[newIndex]))
      userHasNavigatedRef.current = true
    }
  }, [dispatch, focusedPaymentIndex, payments, setFocusedPaymentIndex, userHasNavigatedRef])

  const focusSearchInput = useCallback(() => {
    searchInputRef.current?.focus()
  }, [searchInputRef])

  return {
    handlePaymentSelect,
    handleNavigateUp,
    handleNavigateDown,
    focusSearchInput,
  }
}
