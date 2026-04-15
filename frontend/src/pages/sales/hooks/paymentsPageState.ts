import { useRef, useState } from 'react'

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

export function usePaymentsPageState() {
  const [focusedPaymentIndex, setFocusedPaymentIndex] = useState(-1)
  const [deletedPaymentsDialogOpen, setDeletedPaymentsDialogOpen] = useState(false)
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [journalEntryRef, setJournalEntryRef] = useState<PaymentJournalEntryRef | null>(null)
  const [journalEntryRefLoading, setJournalEntryRefLoading] = useState(false)

  const searchInputRef = useRef<HTMLInputElement>(null)
  const paymentListRef = useRef<HTMLDivElement>(null)
  const hasRestoredSelection = useRef(false)
  const previousPathnameRef = useRef(window.location.pathname)
  const selectedPaymentRef = useRef<PaymentListItem | null>(null)

  return {
    focusedPaymentIndex,
    setFocusedPaymentIndex,
    deletedPaymentsDialogOpen,
    setDeletedPaymentsDialogOpen,
    printDialogOpen,
    setPrintDialogOpen,
    journalEntryRef,
    setJournalEntryRef,
    journalEntryRefLoading,
    setJournalEntryRefLoading,
    searchInputRef,
    paymentListRef,
    hasRestoredSelection,
    previousPathnameRef,
    selectedPaymentRef,
  }
}
