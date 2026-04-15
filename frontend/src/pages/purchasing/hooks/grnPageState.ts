import { useRef, useState } from 'react'

export interface GRNPageSorting {
  sortBy: string
  sortOrder: 'asc' | 'desc'
}

export interface GRNJournalEntryRef {
  referenceNumber: string
  sourceType: string
  sourceId: string
}

export function useGRNPageState() {
  const [sorting, setSorting] = useState<GRNPageSorting>({
    sortBy: 'grnNumber',
    sortOrder: 'asc',
  })
  const [focusedGRNIndex, setFocusedGRNIndex] = useState(-1)
  const [deletedGRNsOpen, setDeletedGRNsOpen] = useState(false)
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [journalEntryRef, setJournalEntryRef] = useState<GRNJournalEntryRef | null>(null)
  const [journalEntryRefLoading, setJournalEntryRefLoading] = useState(false)

  const grnListRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const userHasNavigatedRef = useRef(false)

  return {
    sorting,
    setSorting,
    focusedGRNIndex,
    setFocusedGRNIndex,
    deletedGRNsOpen,
    setDeletedGRNsOpen,
    printDialogOpen,
    setPrintDialogOpen,
    journalEntryRef,
    setJournalEntryRef,
    journalEntryRefLoading,
    setJournalEntryRefLoading,
    grnListRef,
    searchInputRef,
    userHasNavigatedRef,
  }
}
