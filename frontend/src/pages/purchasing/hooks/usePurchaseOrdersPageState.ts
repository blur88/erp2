import { useRef, useState } from 'react'

export interface PurchaseOrdersPageState {
  search: string
  sortBy: string
  sortOrder: 'asc' | 'desc'
  supplierFilter: string
  dateFilter: string
  customFromDate: string
  customToDate: string
}

export interface PurchaseJournalEntryRef {
  referenceNumber: string
  sourceType: string
  sourceId: string
}

export function usePurchaseOrdersPageState() {
  const [filters, setFilters] = useState<PurchaseOrdersPageState>({
    search: '',
    sortBy: 'orderNumber',
    sortOrder: 'asc',
    supplierFilter: 'all',
    dateFilter: 'all',
    customFromDate: '',
    customToDate: '',
  })
  const [focusedOrderIndex, setFocusedOrderIndex] = useState(-1)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [orderToDelete, setOrderToDelete] = useState<any>(null)
  const [deletedOrdersDialogOpen, setDeletedOrdersDialogOpen] = useState(false)
  const [blockedDialogOpen, setBlockedDialogOpen] = useState(false)
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [blockedDialogType, setBlockedDialogType] = useState<'edit' | 'delete'>('edit')
  const [isLoading, setIsLoading] = useState(false)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [paymentDialogOrder, setPaymentDialogOrder] = useState<any>(null)
  const [journalEntryRef, setJournalEntryRef] = useState<PurchaseJournalEntryRef | null>(null)
  const [journalEntryRefLoading, setJournalEntryRefLoading] = useState(false)
  const [pendingHighlightId, setPendingHighlightId] = useState<string | null>(
    new URLSearchParams(window.location.search).get('highlight'),
  )

  const orderListRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const processedHighlightRef = useRef<string | null>(null)
  const userHasNavigatedRef = useRef(false)

  return {
    filters,
    setFilters,
    focusedOrderIndex,
    setFocusedOrderIndex,
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    orderToDelete,
    setOrderToDelete,
    deletedOrdersDialogOpen,
    setDeletedOrdersDialogOpen,
    blockedDialogOpen,
    setBlockedDialogOpen,
    printDialogOpen,
    setPrintDialogOpen,
    blockedDialogType,
    setBlockedDialogType,
    isLoading,
    setIsLoading,
    paymentDialogOpen,
    setPaymentDialogOpen,
    paymentDialogOrder,
    setPaymentDialogOrder,
    journalEntryRef,
    setJournalEntryRef,
    journalEntryRefLoading,
    setJournalEntryRefLoading,
    pendingHighlightId,
    setPendingHighlightId,
    orderListRef,
    searchInputRef,
    processedHighlightRef,
    userHasNavigatedRef,
  }
}
