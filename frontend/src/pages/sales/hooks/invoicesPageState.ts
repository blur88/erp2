import { useRef, useState } from 'react'

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

export function useInvoicesPageState() {
  const [createDialog, setCreateDialog] = useState(false)
  const [editDialog, setEditDialog] = useState(false)
  const [focusedInvoiceIndex, setFocusedInvoiceIndex] = useState(-1)
  const [shouldPreserveSearchFocus, setShouldPreserveSearchFocus] = useState(false)
  const [deletedInvoicesDialogOpen, setDeletedInvoicesDialogOpen] = useState(false)
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [journalEntryRef, setJournalEntryRef] = useState<InvoiceJournalEntryRef | null>(null)
  const [journalEntryRefLoading, setJournalEntryRefLoading] = useState(false)

  const searchInputRef = useRef<HTMLInputElement>(null)
  const invoiceListRef = useRef<HTMLDivElement>(null)
  const hasRestoredSelection = useRef(false)
  const previousPathnameRef = useRef(window.location.pathname)
  const selectedInvoiceRef = useRef<InvoiceListItem | null>(null)

  return {
    createDialog,
    setCreateDialog,
    editDialog,
    setEditDialog,
    focusedInvoiceIndex,
    setFocusedInvoiceIndex,
    shouldPreserveSearchFocus,
    setShouldPreserveSearchFocus,
    deletedInvoicesDialogOpen,
    setDeletedInvoicesDialogOpen,
    printDialogOpen,
    setPrintDialogOpen,
    journalEntryRef,
    setJournalEntryRef,
    journalEntryRefLoading,
    setJournalEntryRefLoading,
    searchInputRef,
    invoiceListRef,
    hasRestoredSelection,
    previousPathnameRef,
    selectedInvoiceRef,
  }
}
