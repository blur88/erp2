import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import type { AppDispatch } from '@/store'
import { useLazyGetJournalEntriesQuery } from '@/store/api/accountingApi'
import { setSelectedPayment } from '@/store/slices/salesSlice'

export interface PaymentJournalEntryRef {
  referenceNumber: string
  sourceType: string
  sourceId: string
}

export interface PaymentListItem {
  id: string
  paymentNumber: string
  customerName?: string
  amount: number
  paymentDate: string | Date
  paymentMethodId?: string
  paymentMethod?: string
  paymentMethodEntity?: {
    id: string
    code: string
    name: string
  }
  status: 'pending' | 'completed' | 'failed' | 'cancelled' | 'refunded'
  notes?: string
  reference?: string
  relatedOrderId?: string
  relatedInvoiceId?: string
  relatedOrderNumber?: string
  relatedInvoiceNumber?: string
  customer?: {
    id: string
    name: string
    email?: string
    phone?: string
  }
  salesOrder?: {
    id: string
    orderNumber: string
  }
  invoice?: {
    id: string
    invoiceNumber: string
    items?: Array<{
      id?: string
      product?: { name: string }
      quantity: number
      unitPrice: number
      discountType?: string
      discountPercent?: number
      discount?: number
      totalAmount?: number
      total?: number
    }>
  }
}

export interface UsePaymentsWorkspaceConfig {
  dispatch: AppDispatch
  payments: PaymentListItem[]
  selectedPayment: PaymentListItem | null
  refetch: () => void
}

export function usePaymentsWorkspace({
  dispatch,
  payments,
  selectedPayment,
  refetch,
}: UsePaymentsWorkspaceConfig) {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [deletedPaymentsDialogOpen, setDeletedPaymentsDialogOpen] = useState(false)
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [journalEntryRef, setJournalEntryRef] = useState<PaymentJournalEntryRef | null>(null)
  const [journalEntryRefLoading, setJournalEntryRefLoading] = useState(false)
  const selectedPaymentRef = useRef<PaymentListItem | null>(null)
  const hasRestoredSelection = useRef(false)
  const [fetchJournalEntries] = useLazyGetJournalEntriesQuery()

  const selectPayment = useCallback(
    (payment: PaymentListItem | null) => dispatch(setSelectedPayment(payment as any)),
    [dispatch],
  )

  const workspace = useEntityWorkspace({
    entities: payments,
    selectedEntity: selectedPayment,
    selectEntity: selectPayment,
    refetch,
    navigate,
    routes: {
      create: '/sales/payments/create',
      edit: (id) => `/sales/payments/${id}/edit`,
    },
    notifications: { showSuccess: () => {}, showError: () => {} },
    deleteMutation: async () => {},
    onEnter: () => {},
  })
  const { focusedIndex, setFocusedIndex } = workspace

  useEffect(() => {
    selectedPaymentRef.current = selectedPayment
  }, [selectedPayment])

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
          sourceType: 'payment',
          sourceId: selectedPayment.id,
          limit: 1,
        }).unwrap()

        if (cancelled) {
          return
        }

        const entry = response?.data?.[0]
        setJournalEntryRef(
          entry
            ? {
                referenceNumber: entry.referenceNumber,
                sourceType: 'payment',
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
    if (location.pathname === '/sales/payments') {
      void refetch()
    }
  }, [location.pathname, refetch])

  useEffect(() => {
    if (payments.length === 0 || !selectedPaymentRef.current) {
      return
    }

    const freshPayment = payments.find((payment) => payment.id === selectedPaymentRef.current?.id)
    if (!freshPayment) {
      return
    }

    if (JSON.stringify(freshPayment) !== JSON.stringify(selectedPaymentRef.current)) {
      dispatch(setSelectedPayment(freshPayment as any))
    }
  }, [dispatch, payments])

  useEffect(() => {
    if (hasRestoredSelection.current || !selectedPayment || payments.length === 0) {
      return
    }

    const index = payments.findIndex((payment) => payment.id === selectedPayment.id)
    if (index >= 0) {
      setFocusedIndex(index)
      hasRestoredSelection.current = true
    }
  }, [payments, selectedPayment, setFocusedIndex])

  useEffect(() => {
    const highlightId = searchParams.get('highlight')
    if (!highlightId || payments.length === 0) {
      return
    }

    const index = payments.findIndex((payment) => payment.id === highlightId)
    if (index >= 0) {
      dispatch(setSelectedPayment(payments[index] as any))
      setFocusedIndex(index)
      setSearchParams((prev) => {
        prev.delete('highlight')
        return prev
      }, { replace: true })
    }
  }, [dispatch, payments, searchParams, setFocusedIndex, setSearchParams])

  useEffect(() => {
    const state = location.state as { highlightPaymentId?: string } | null
    if (!state?.highlightPaymentId || payments.length === 0) {
      return
    }

    const index = payments.findIndex((payment) => payment.id === state.highlightPaymentId)
    if (index >= 0) {
      dispatch(setSelectedPayment(payments[index] as any))
      setFocusedIndex(index)
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }, [dispatch, location.state, payments, setFocusedIndex])

  const handleSelect = useCallback((payment: PaymentListItem) => {
    workspace.handleSelect(payment)
  }, [workspace])

  const handleOrderClick = useCallback((orderId: string, event: MouseEvent) => {
    event.stopPropagation()
    navigate(`/sales/orders?highlight=${orderId}`)
  }, [navigate])

  const handleInvoiceClick = useCallback((invoiceId: string, event: MouseEvent) => {
    event.stopPropagation()
    navigate('/sales/invoices', { state: { highlightInvoiceId: invoiceId } })
  }, [navigate])

  const handleNavigateToJournalEntry = useCallback((journalRef: PaymentJournalEntryRef | null) => {
    if (!journalRef) {
      return
    }

    navigate(`/accounting/journal-entries?sourceType=${journalRef.sourceType}&sourceId=${journalRef.sourceId}`)
  }, [navigate])

  return {
    ...workspace,
    focusedPaymentIndex: focusedIndex,
    paymentListRef: workspace.listRef,
    deletedPaymentsDialogOpen,
    setDeletedPaymentsDialogOpen,
    printDialogOpen,
    setPrintDialogOpen,
    journalEntryRef,
    journalEntryRefLoading,
    handleSelect,
    handlePaymentSelect: handleSelect,
    handleOrderClick,
    handleInvoiceClick,
    handleNavigateToJournalEntry,
  }
}
