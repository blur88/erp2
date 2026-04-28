import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { useJournalEntryRefs } from '@/hooks/useJournalEntryRefs'
import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import type { EntityWorkspaceReturn } from '@/hooks/useEntityWorkspace'
import type { AppDispatch } from '@/store'
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
  const selectedInvoiceRef = useRef<InvoiceListItem | null>(null)
  const workspaceRef = useRef<EntityWorkspaceReturn<InvoiceListItem> | null>(null)

  const workspace = useEntityWorkspace({
    entities: invoices,
    selectedEntity: selectedInvoice,
    selectEntity: (invoice) => dispatch(setSelectedInvoice(invoice as any)),
    refetch,
    navigate,
    locationStateHighlightKey: 'highlightInvoice',
    locationStateHighlightKeys: ['highlightInvoiceId'],
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

  const { journalEntryRefs, journalEntryRefsLoading, navigateToJournalEntries } = useJournalEntryRefs([
    { sourceType: 'invoice', sourceId: selectedInvoice?.id },
    { sourceType: 'sales_order', sourceId: selectedInvoice?.salesOrder?.id },
  ])

  useEffect(() => {
    selectedInvoiceRef.current = selectedInvoice
  }, [selectedInvoice])

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

  return {
    ...workspace,
    focusedInvoiceIndex: workspace.focusedIndex,
    invoiceListRef: workspace.listRef,
    deletedInvoicesDialogOpen,
    setDeletedInvoicesDialogOpen,
    printDialogOpen,
    setPrintDialogOpen,
    journalEntryRefs,
    journalEntryRefsLoading,
    handleInvoiceSelect,
    handleSalesOrderClick,
    handleNavigateToPayment,
    navigateToJournalEntries,
    handleViewDeletedAction: () => {
      setDeletedInvoicesDialogOpen(true)
    },
  }
}
