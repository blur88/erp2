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
    notifications: { showSuccess: () => {}, showError: () => {} },
    deleteMutation: async () => {},
  })

  const vpSources = useMemo(
    () => [
      ...(selectedPayment?.purchaseOrder?.goodsReceivedNotes ?? []).map((grn: any) => ({
        sourceType: 'goods_received_note' as const,
        sourceId: grn.id as string,
      })),
      ...(selectedPayment?.purchaseOrder?.vendorPayments ?? []).map((payment: any) => ({
        sourceType: 'vendor_payment' as const,
        sourceId: payment.id as string,
      })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      (selectedPayment?.purchaseOrder?.goodsReceivedNotes ?? []).map((grn: any) => grn.id).join(','),
      (selectedPayment?.purchaseOrder?.vendorPayments ?? []).map((payment: any) => payment.id).join(','),
    ],
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
