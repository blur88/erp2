import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import type { EntityWorkspaceReturn } from '@/hooks/useEntityWorkspace'
import type { AppDispatch } from '@/store'
import { useLazyGetJournalEntriesQuery } from '@/store/api/accountingApi'
import { clearError, setSelectedInvoice } from '@/store/slices/salesSlice'
import type { InvoiceItem } from '@/types'

export interface InvoiceListItem {
  id: string
  invoiceNumber: string
  customerName?: string
  orderNumber?: string
  invoiceDate?: string
  shippingAmount?: number
  totalAmount?: number
  paidAmount: number
  balanceDue?: number
  status: 'draft' | 'partial_paid' | 'paid'
  isOverdue?: boolean
  notes?: string
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
  total?: number
  issueDate?: Date | string
  dueAmount?: number
  items?: InvoiceItem[]
}

export interface InvoiceJournalEntryRef {
  referenceNumber: string
  sourceType: string
  sourceId: string
}

export interface UseInvoicesWorkspaceConfig {
  dispatch: AppDispatch
  invoices: InvoiceListItem[]
  selectedInvoice: InvoiceListItem | null
  refetch: () => void
}

export function useInvoicesWorkspace({
  dispatch,
  invoices,
  selectedInvoice,
  refetch,
}: UseInvoicesWorkspaceConfig) {
  const navigate = useNavigate()
  const location = useLocation()
  const [deletedInvoicesDialogOpen, setDeletedInvoicesDialogOpen] = useState(false)
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [journalEntryRef, setJournalEntryRef] = useState<InvoiceJournalEntryRef | null>(null)
  const [journalEntryRefLoading, setJournalEntryRefLoading] = useState(false)
  const selectedInvoiceRef = useRef<InvoiceListItem | null>(null)
  const hasRestoredSelection = useRef(false)
  const workspaceRef = useRef<EntityWorkspaceReturn<InvoiceListItem> | null>(null)
  const [fetchJournalEntries] = useLazyGetJournalEntriesQuery()

  const workspace = useEntityWorkspace({
    entities: invoices,
    selectedEntity: selectedInvoice,
    selectEntity: (invoice) => dispatch(setSelectedInvoice(invoice as any)),
    refetch,
    navigate,
    routes: {
      create: '/sales/invoices/create',
      edit: (id) => `/sales/invoices/${id}/edit`,
    },
    notifications: {
      showSuccess: () => {},
      showError: () => {},
    },
    deleteMutation: async () => {},
    onEnter: () => {},
    onEscape: () => {
      workspaceRef.current?.setFocusedIndex(-1)
      dispatch(setSelectedInvoice(null))
    },
  })
  workspaceRef.current = workspace

  useEffect(() => {
    selectedInvoiceRef.current = selectedInvoice
  }, [selectedInvoice])

  useEffect(() => {
    if (!selectedInvoice?.id) {
      setJournalEntryRef(null)
      setJournalEntryRefLoading(false)
      return
    }

    let cancelled = false
    const sources = [
      { sourceType: 'invoice', sourceId: selectedInvoice.id },
      { sourceType: 'sales_order', sourceId: selectedInvoice.salesOrder?.id },
    ].filter((source): source is { sourceType: string; sourceId: string } => Boolean(source.sourceId))

    if (sources.length === 0) {
      setJournalEntryRef(null)
      setJournalEntryRefLoading(false)
      return
    }

    setJournalEntryRefLoading(true)

    ;(async () => {
      try {
        for (const source of sources) {
          const response = await fetchJournalEntries({
            sourceType: source.sourceType,
            sourceId: source.sourceId,
            limit: 1,
          }).unwrap()

          if (cancelled) {
            return
          }

          const entry = response.data?.[0]
          if (entry) {
            setJournalEntryRef({
              referenceNumber: entry.referenceNumber,
              sourceType: source.sourceType,
              sourceId: source.sourceId,
            })
            return
          }
        }

        if (!cancelled) {
          setJournalEntryRef(null)
        }
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
  }, [fetchJournalEntries, selectedInvoice?.id, selectedInvoice?.salesOrder?.id])

  useEffect(() => {
    if (location.pathname === '/sales/invoices') {
      void refetch()
    }
  }, [location.pathname, refetch])

  useEffect(() => {
    if (invoices.length > 0 && selectedInvoiceRef.current) {
      const freshInvoice = invoices.find((invoice) => invoice.id === selectedInvoiceRef.current?.id)
      if (freshInvoice && JSON.stringify(freshInvoice) !== JSON.stringify(selectedInvoiceRef.current)) {
        dispatch(setSelectedInvoice(freshInvoice as any))
      }
    }
  }, [dispatch, invoices])

  useEffect(() => {
    if (!hasRestoredSelection.current && selectedInvoice && invoices.length > 0) {
      const index = invoices.findIndex((invoice) => invoice.id === selectedInvoice.id)
      if (index >= 0) {
        workspace.setFocusedIndex(index)
        hasRestoredSelection.current = true
      }
    }
  }, [invoices, selectedInvoice, workspace])

  useEffect(() => {
    const state = location.state as { highlightInvoice?: InvoiceListItem; highlightInvoiceId?: string } | null

    if (state?.highlightInvoice) {
      dispatch(setSelectedInvoice(state.highlightInvoice as any))
      const index = invoices.findIndex((invoice) => invoice.id === state.highlightInvoice?.id)
      if (index >= 0) {
        workspace.setFocusedIndex(index)
      }
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    } else if (state?.highlightInvoiceId && invoices.length > 0) {
      const invoice = invoices.find((item) => item.id === state.highlightInvoiceId)
      if (invoice) {
        dispatch(setSelectedInvoice(invoice as any))
        const index = invoices.findIndex((item) => item.id === state.highlightInvoiceId)
        if (index >= 0) {
          workspace.setFocusedIndex(index)
        }
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      }
    }
  }, [dispatch, invoices, location.state, workspace])

  useEffect(() => {
    if (invoices.length === 0) {
      dispatch(clearError())
    }
  }, [dispatch, invoices.length])

  const handleInvoiceSelect = (invoice: InvoiceListItem) => {
    workspace.handleSelect(invoice)
  }

  const handleSalesOrderClick = (salesOrderId: string, event: MouseEvent) => {
    event.stopPropagation()
    navigate(`/sales/orders?highlight=${salesOrderId}`)
  }

  const handleNavigateToPayment = (paymentId: string, event?: MouseEvent) => {
    event?.stopPropagation()
    navigate('/sales/payments', { state: { highlightPaymentId: paymentId } })
  }

  const navigateToJournalEntry = () => {
    if (!journalEntryRef) {
      return
    }

    navigate(`/accounting/journal-entries?sourceType=${journalEntryRef.sourceType}&sourceId=${journalEntryRef.sourceId}`)
  }

  return {
    ...workspace,
    focusedInvoiceIndex: workspace.focusedIndex,
    invoiceListRef: workspace.listRef,
    deletedInvoicesDialogOpen,
    setDeletedInvoicesDialogOpen,
    printDialogOpen,
    setPrintDialogOpen,
    journalEntryRef,
    journalEntryRefLoading,
    handleInvoiceSelect,
    handleSalesOrderClick,
    handleNavigateToPayment,
    navigateToJournalEntry,
    handleViewDeletedAction: () => {
      setDeletedInvoicesDialogOpen(true)
    },
  }
}
