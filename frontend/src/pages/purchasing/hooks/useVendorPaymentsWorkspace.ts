import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

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
}

export function useVendorPaymentsWorkspace({
  dispatch,
  payments,
  selectedPayment,
  refetch,
}: UseVendorPaymentsWorkspaceConfig) {
  const navigate = useNavigate()
  const [deletedPaymentsOpen, setDeletedPaymentsOpen] = useState(false)
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [journalEntryRef, setJournalEntryRef] = useState<VPJournalEntryRef | null>(null)
  const [journalEntryRefLoading, setJournalEntryRefLoading] = useState(false)
  const [fetchPayment] = useLazyGetVendorPaymentQuery()
  const [fetchJournalEntries] = useLazyGetJournalEntriesQuery()

  const workspace = useEntityWorkspace({
    entities: payments,
    selectedEntity: selectedPayment,
    selectEntity: (payment) => dispatch(setSelectedVendorPayment(payment)),
    refetch,
    navigate,
    highlightParam: 'vpId',
    routes: {
      create: '/purchasing/vendor-payments/create',
      edit: (id) => `/purchasing/vendor-payments/${id}/edit`,
    },
    notifications: { showSuccess: () => {}, showError: () => {} },
    deleteMutation: async () => {},
  })

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

  const handleSelect = async (payment: VendorPayment) => {
    workspace.handleSelect(payment)

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
  }
}
