import { useRef, useState } from 'react'

export interface VPSorting {
  sortBy: string
  sortOrder: 'asc' | 'desc'
}

export interface VPJournalEntryRef {
  referenceNumber: string
  sourceType: string
  sourceId: string
}

export function useVendorPaymentsPageState() {
  const [sorting, setSorting] = useState<VPSorting>({
    sortBy: 'paymentNumber',
    sortOrder: 'asc',
  })
  const [focusedPaymentIndex, setFocusedPaymentIndex] = useState(-1)
  const [deletedPaymentsOpen, setDeletedPaymentsOpen] = useState(false)
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [journalEntryRef, setJournalEntryRef] = useState<VPJournalEntryRef | null>(null)
  const [journalEntryRefLoading, setJournalEntryRefLoading] = useState(false)

  const paymentListRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const userHasNavigatedRef = useRef(false)

  return {
    sorting,
    setSorting,
    focusedPaymentIndex,
    setFocusedPaymentIndex,
    deletedPaymentsOpen,
    setDeletedPaymentsOpen,
    printDialogOpen,
    setPrintDialogOpen,
    journalEntryRef,
    setJournalEntryRef,
    journalEntryRefLoading,
    setJournalEntryRefLoading,
    paymentListRef,
    searchInputRef,
    userHasNavigatedRef,
  }
}
