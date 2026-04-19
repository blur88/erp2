import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useNotification } from '@/hooks/useNotification'
import {
  useBulkDeleteJournalEntriesMutation,
  useBulkPostJournalEntriesMutation,
  useDeleteJournalEntryMutation,
  usePostJournalEntryMutation,
  useReverseJournalEntryMutation,
} from '@/store/api/accountingApi'
import { JournalEntry, JournalEntryStatus } from '@/types'
import { getErrorMessage } from '@/utils/errorMessage'

export function useJournalEntriesWorkspace(refetch: () => void) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()

  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [postTarget, setPostTarget] = useState<JournalEntry | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<JournalEntry | null>(null)
  const [reverseTarget, setReverseTarget] = useState<JournalEntry | null>(null)
  const [bulkPostOpen, setBulkPostOpen] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const [postJournalEntry] = usePostJournalEntryMutation()
  const [reverseJournalEntry] = useReverseJournalEntryMutation()
  const [deleteJournalEntry] = useDeleteJournalEntryMutation()
  const [bulkPostJournalEntries] = useBulkPostJournalEntriesMutation()
  const [bulkDeleteJournalEntries] = useBulkDeleteJournalEntriesMutation()

  const handleSelect = useCallback(async (entry: JournalEntry) => {
    setSelectedEntry(entry)
  }, [])

  const handleToggleCheck = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleSelectAll = useCallback((entries: JournalEntry[]) => {
    const drafts = entries
      .filter((entry) => entry.status === JournalEntryStatus.DRAFT)
      .map((entry) => entry.id)
    setSelectedIds((prev) => (prev.size === drafts.length ? new Set() : new Set(drafts)))
  }, [])

  const handleConfirmPost = useCallback(async () => {
    if (!postTarget) return
    setActionLoading(true)
    try {
      await postJournalEntry(postTarget.id).unwrap()
      showSuccess(`Journal entry ${postTarget.referenceNumber} posted`)
      setPostTarget(null)
      setSelectedEntry(null)
      refetch()
    }
    catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to post journal entry'))
    }
    finally {
      setActionLoading(false)
    }
  }, [postTarget, postJournalEntry, showSuccess, showError, refetch])

  const handleConfirmReverse = useCallback(async (reverseDate: string) => {
    if (!reverseTarget) return
    setActionLoading(true)
    try {
      const result = await reverseJournalEntry({ id: reverseTarget.id, reverseDate }).unwrap()
      showSuccess(`Journal entry ${reverseTarget.referenceNumber} reversed`)
      setReverseTarget(null)
      setSelectedEntry(result)
      refetch()
    }
    catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to reverse journal entry'))
    }
    finally {
      setActionLoading(false)
    }
  }, [reverseTarget, reverseJournalEntry, showSuccess, showError, refetch])

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    setActionLoading(true)
    try {
      await deleteJournalEntry(deleteTarget.id).unwrap()
      showSuccess(`Journal entry ${deleteTarget.referenceNumber} deleted`)
      setDeleteTarget(null)
      setSelectedEntry(null)
      refetch()
    }
    catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to delete journal entry'))
    }
    finally {
      setActionLoading(false)
    }
  }, [deleteTarget, deleteJournalEntry, showSuccess, showError, refetch])

  const handleBulkPost = useCallback(async () => {
    setActionLoading(true)
    try {
      const result = await bulkPostJournalEntries(Array.from(selectedIds)).unwrap()
      showSuccess(`Posted ${result.succeeded.length} entries`)
      if (result.failed.length > 0) showError(`${result.failed.length} entries failed`)
      setSelectedIds(new Set())
      setBulkPostOpen(false)
      refetch()
    }
    catch (error: unknown) {
      showError(getErrorMessage(error, 'Bulk post failed'))
    }
    finally {
      setActionLoading(false)
    }
  }, [selectedIds, bulkPostJournalEntries, showSuccess, showError, refetch])

  const handleBulkDelete = useCallback(async () => {
    setActionLoading(true)
    try {
      const result = await bulkDeleteJournalEntries(Array.from(selectedIds)).unwrap()
      showSuccess(`Deleted ${result.succeeded.length} entries`)
      if (result.failed.length > 0) showError(`${result.failed.length} entries failed`)
      setSelectedIds(new Set())
      setBulkDeleteOpen(false)
      refetch()
    }
    catch (error: unknown) {
      showError(getErrorMessage(error, 'Bulk delete failed'))
    }
    finally {
      setActionLoading(false)
    }
  }, [selectedIds, bulkDeleteJournalEntries, showSuccess, showError, refetch])

  return {
    selectedEntry,
    selectedIds,
    postTarget,
    setPostTarget,
    deleteTarget,
    setDeleteTarget,
    reverseTarget,
    setReverseTarget,
    bulkPostOpen,
    setBulkPostOpen,
    bulkDeleteOpen,
    setBulkDeleteOpen,
    actionLoading,
    searchInputRef,
    listRef,
    handleSelect,
    handleToggleCheck,
    handleSelectAll,
    handleConfirmPost,
    handleConfirmReverse,
    handleConfirmDelete,
    handleBulkPost,
    handleBulkDelete,
    navigateToEdit: (entry: JournalEntry) => navigate(`/accounting/journal-entries/${entry.id}/edit`),
    navigateToCreate: () => navigate('/accounting/journal-entries/new'),
  }
}
