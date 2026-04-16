import { useEffect, useRef, useState } from 'react'
import { useNavigate, type SetURLSearchParams } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import type { AppDispatch } from '@/store'
import { useLazyGetJournalEntriesQuery } from '@/store/api/accountingApi'
import { useLazyGetVendorPaymentQuery } from '@/store/api/purchasingApi'
import { setSelectedVendorPayment } from '@/store/slices/purchasingSlice'
import type { VendorPayment } from '@/types'

export interface VPJournalEntryRef {
  referenceNumber: string
  sourceType: string
  sourceId: string
}

export interface UseVendorPaymentsWorkspaceConfig {
  dispatch: AppDispatch
  payments: VendorPayment[]
  selectedPayment: VendorPayment | null
  refetch: () => void
  searchParams: URLSearchParams
  setSearchParams: SetURLSearchParams
}

export function useVendorPaymentsWorkspace({
  dispatch,
  payments,
  selectedPayment,
  refetch,
  searchParams,
  setSearchParams,
}: UseVendorPaymentsWorkspaceConfig) {
  const navigate = useNavigate()
  const [deletedPaymentsOpen, setDeletedPaymentsOpen] = useState(false)
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [journalEntryRef, setJournalEntryRef] = useState<VPJournalEntryRef | null>(null)
  const [journalEntryRefLoading, setJournalEntryRefLoading] = useState(false)
  const userHasNavigatedRef = useRef(false)
  const [fetchPayment] = useLazyGetVendorPaymentQuery()
  const [fetchJournalEntries] = useLazyGetJournalEntriesQuery()

  const workspace = useEntityWorkspace({
    entities: payments,
    selectedEntity: selectedPayment,
    selectEntity: (payment) => dispatch(setSelectedVendorPayment(payment)),
    refetch,
    navigate,
    routes: {
      create: '/purchasing/vendor-payments/create',
      edit: (id) => `/purchasing/vendor-payments/${id}/edit`,
    },
    notifications: { showSuccess: () => {}, showError: () => {} },
    deleteMutation: async () => {},
  })
  const { setFocusedIndex } = workspace

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
        const response = await fetchJournalEntries({
          sourceType: 'vendor_payment',
          sourceId: selectedPayment.id,
          sortBy: 'createdAt',
          sortOrder: 'DESC',
          limit: 1,
        }).unwrap()

        if (cancelled) return

        const entry = response.data?.[0]
        setJournalEntryRef(
          entry
            ? {
                referenceNumber: entry.referenceNumber,
                sourceType: 'vendor_payment',
                sourceId: selectedPayment.id,
              }
            : null,
        )
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
  }, [fetchJournalEntries, selectedPayment?.id])

  useEffect(() => {
    const paymentId = searchParams.get('vpId')
    if (!paymentId || userHasNavigatedRef.current || payments.length === 0) {
      return
    }

    const payment = payments.find((item) => item.id === paymentId)
    if (payment) {
      dispatch(setSelectedVendorPayment(payment))
      setFocusedIndex(payments.findIndex((item) => item.id === payment.id))
      setSearchParams((prev) => {
        prev.delete('vpId')
        return prev
      }, { replace: true })
      userHasNavigatedRef.current = true
    }
  }, [dispatch, payments, searchParams, setFocusedIndex, setSearchParams])

  const handleSelect = async (payment: VendorPayment) => {
    workspace.handleSelect(payment)
    userHasNavigatedRef.current = true

    try {
      const freshPayment = await fetchPayment(payment.id).unwrap()
      dispatch(setSelectedVendorPayment(freshPayment))
    } catch {
      dispatch(setSelectedVendorPayment(payment))
    }
  }

  return {
    ...workspace,
    handleSelect,
    deletedPaymentsOpen,
    setDeletedPaymentsOpen,
    printDialogOpen,
    setPrintDialogOpen,
    journalEntryRef,
    journalEntryRefLoading,
    userHasNavigatedRef,
  }
}
