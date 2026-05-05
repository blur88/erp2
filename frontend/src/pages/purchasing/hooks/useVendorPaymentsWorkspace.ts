import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useJournalEntryRefs } from '@/hooks/useJournalEntryRefs'
import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import type { AppDispatch } from '@/store'
import { useLazyGetVendorPaymentQuery } from '@/store/api/purchasingApi'
import { setSelectedVendorPayment } from '@/store/slices/purchasingSlice'
import type { VendorPayment } from '@/types'

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
  const [fetchPayment] = useLazyGetVendorPaymentQuery()

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
  })

  const vpSources = useMemo(
    () => [
      ...(selectedPayment?.grnId ? [{ sourceType: 'goods_received_note' as const, sourceId: selectedPayment.grnId }] : []),
      ...(selectedPayment?.id ? [{ sourceType: 'vendor_payment' as const, sourceId: selectedPayment.id }] : []),
    ],
    [selectedPayment?.id, selectedPayment?.grnId],
  )

  const { journalEntryRefs, journalEntryRefsLoading, navigateToJournalEntries } =
    useJournalEntryRefs(vpSources)

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
    journalEntryRefs,
    journalEntryRefsLoading,
    navigateToJournalEntries,
  }
}
