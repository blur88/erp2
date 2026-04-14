import { useRef, useState } from 'react'

export interface StockAdjustmentsSorting {
  sortBy: string
  sortOrder: 'asc' | 'desc'
}

export interface StockAdjustmentsJournalEntryRef {
  referenceNumber: string
  sourceType: string
  sourceId: string
}

export function useStockAdjustmentsPageState() {
  const [sorting, setSorting] = useState<StockAdjustmentsSorting>({
    sortBy: 'adjustmentNumber',
    sortOrder: 'asc',
  })
  const [focusedAdjustmentIndex, setFocusedAdjustmentIndex] = useState(-1)
  const [showDeletedDialog, setShowDeletedDialog] = useState(false)
  const [journalEntryRef, setJournalEntryRef] = useState<StockAdjustmentsJournalEntryRef | null>(null)
  const [journalEntryRefLoading, setJournalEntryRefLoading] = useState(false)

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [adjustmentToDelete, setAdjustmentToDelete] = useState<string | null>(null)
  const [adjustmentToDeleteName, setAdjustmentToDeleteName] = useState('')

  const [completeConfirmOpen, setCompleteConfirmOpen] = useState(false)
  const [adjustmentToComplete, setAdjustmentToComplete] = useState<string | null>(null)
  const [adjustmentToCompleteName, setAdjustmentToCompleteName] = useState('')

  const [revertConfirmOpen, setRevertConfirmOpen] = useState(false)
  const [adjustmentToRevert, setAdjustmentToRevert] = useState<string | null>(null)
  const [adjustmentToRevertName, setAdjustmentToRevertName] = useState('')

  const adjustmentListRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const userHasNavigatedRef = useRef(false)

  return {
    sorting,
    setSorting,
    focusedAdjustmentIndex,
    setFocusedAdjustmentIndex,
    showDeletedDialog,
    setShowDeletedDialog,
    journalEntryRef,
    setJournalEntryRef,
    journalEntryRefLoading,
    setJournalEntryRefLoading,
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    adjustmentToDelete,
    setAdjustmentToDelete,
    adjustmentToDeleteName,
    setAdjustmentToDeleteName,
    completeConfirmOpen,
    setCompleteConfirmOpen,
    adjustmentToComplete,
    setAdjustmentToComplete,
    adjustmentToCompleteName,
    setAdjustmentToCompleteName,
    revertConfirmOpen,
    setRevertConfirmOpen,
    adjustmentToRevert,
    setAdjustmentToRevert,
    adjustmentToRevertName,
    setAdjustmentToRevertName,
    adjustmentListRef,
    searchInputRef,
    userHasNavigatedRef,
  }
}
