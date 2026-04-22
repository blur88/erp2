import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useNotification } from '@/hooks/useNotification'
import {
  useDeleteJournalEntryMutation,
  useLazyGetJournalEntryQuery,
  usePostJournalEntryMutation,
  useReverseJournalEntryMutation,
} from '@/store/api/accountingApi'
import { JournalEntry } from '@/types'
import { getErrorMessage } from '@/utils/errorMessage'

export const SOURCE_ROUTES: Record<string, (id: string) => string> = {
  sales_order: (id) => `/sales/orders?highlight=${id}`,
  payment: (id) => `/sales/payments?highlight=${id}`,
  goods_received_note: (id) => `/purchasing/goods-received?grnId=${id}`,
  vendor_payment: (id) => `/purchasing/vendor-payments?vpId=${id}`,
  expense: () => '/accounting/expenses',
  owner_equity_transaction: () => '/accounting/owner-equity',
  fund_transfer: () => '/accounting/fund-transfers',
  stock_adjustment: (id) => `/inventory/stock-adjustments/${id}/edit`,
}

export function useJournalEntriesWorkspace(refetch: () => void) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()

  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null)
  const [postTarget, setPostTarget] = useState<JournalEntry | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<JournalEntry | null>(null)
  const [reverseTarget, setReverseTarget] = useState<JournalEntry | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const [fetchEntry] = useLazyGetJournalEntryQuery()
  const [postJournalEntry] = usePostJournalEntryMutation()
  const [reverseJournalEntry] = useReverseJournalEntryMutation()
  const [deleteJournalEntry] = useDeleteJournalEntryMutation()

  const handleSelect = useCallback(async (entry: JournalEntry) => {
    setSelectedEntry(entry)
    try {
      const fresh = await fetchEntry(entry.id).unwrap()
      setSelectedEntry(fresh)
    }
    catch {
      /* keep list-row data */
    }
  }, [fetchEntry])

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
  }, [postTarget, postJournalEntry, refetch, showError, showSuccess])

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
  }, [refetch, reverseJournalEntry, reverseTarget, showError, showSuccess])

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
  }, [deleteJournalEntry, deleteTarget, refetch, showError, showSuccess])

  return {
    selectedEntry,
    postTarget,
    setPostTarget,
    deleteTarget,
    setDeleteTarget,
    reverseTarget,
    setReverseTarget,
    actionLoading,
    searchInputRef,
    listRef,
    handleSelect,
    handleConfirmPost,
    handleConfirmReverse,
    handleConfirmDelete,
    navigateToEdit: (entry: JournalEntry) => navigate(`/accounting/journal-entries/${entry.id}/edit`),
    navigateToCreate: () => navigate('/accounting/journal-entries/new'),
    navigateToSource: (sourceType: string, sourceId: string) => {
      const route = SOURCE_ROUTES[sourceType]
      if (route) navigate(route(sourceId))
    },
  }
}
