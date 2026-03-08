import { useRef, useState } from 'react'

export type BlockedOrderAction = 'edit' | 'delete'

export interface JournalEntryRef {
  id: string
  referenceNumber: string
}

export function useOrdersPageState() {
  const [viewDialog, setViewDialog] = useState(false)
  const [blockedDialogOpen, setBlockedDialogOpen] = useState(false)
  const [blockedDialogAction, setBlockedDialogAction] = useState<BlockedOrderAction>('edit')
  const [deletedOrdersDialogOpen, setDeletedOrdersDialogOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [orderToDelete, setOrderToDelete] = useState<string | null>(null)
  const [orderToDeleteName, setOrderToDeleteName] = useState('')
  const [focusedOrderIndex, setFocusedOrderIndex] = useState(-1)
  const [pendingOrderToSelect, setPendingOrderToSelect] = useState<string | null>(() => {
    return new URLSearchParams(window.location.search).get('highlight')
  })
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [shouldPreserveSearchFocus, setShouldPreserveSearchFocus] = useState(false)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [journalEntryRef, setJournalEntryRef] = useState<JournalEntryRef | null>(null)
  const [journalEntryRefLoading, setJournalEntryRefLoading] = useState(false)

  const orderListRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const processedHighlightRef = useRef<string | null>(null)
  const userHasNavigatedRef = useRef(false)
  const hasRefreshedPersistedOrder = useRef(false)
  const isRefreshingPersistedOrder = useRef(false)

  return {
    viewDialog,
    setViewDialog,
    blockedDialogOpen,
    setBlockedDialogOpen,
    blockedDialogAction,
    setBlockedDialogAction,
    deletedOrdersDialogOpen,
    setDeletedOrdersDialogOpen,
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    orderToDelete,
    setOrderToDelete,
    orderToDeleteName,
    setOrderToDeleteName,
    focusedOrderIndex,
    setFocusedOrderIndex,
    pendingOrderToSelect,
    setPendingOrderToSelect,
    printDialogOpen,
    setPrintDialogOpen,
    shouldPreserveSearchFocus,
    setShouldPreserveSearchFocus,
    paymentDialogOpen,
    setPaymentDialogOpen,
    isLoading,
    setIsLoading,
    journalEntryRef,
    setJournalEntryRef,
    journalEntryRefLoading,
    setJournalEntryRefLoading,
    orderListRef,
    searchInputRef,
    processedHighlightRef,
    userHasNavigatedRef,
    hasRefreshedPersistedOrder,
    isRefreshingPersistedOrder,
  }
}
