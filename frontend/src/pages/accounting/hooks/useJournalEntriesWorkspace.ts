import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import type { AppDispatch } from '@/store'
import {
  useDeleteJournalEntryMutation,
  useLazyGetJournalEntryQuery,
  usePostJournalEntryMutation,
  useReverseJournalEntryMutation,
} from '@/store/api/accountingApi'
import { setSelectedJournalEntry } from '@/store/slices/accountingSlice'
import type { JournalEntry } from '@/types'
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

interface UseJournalEntriesWorkspaceConfig {
  dispatch: AppDispatch
  entries: JournalEntry[]
  selectedEntry: JournalEntry | null
  refetch: () => void
}

export function useJournalEntriesWorkspace({
  dispatch,
  entries,
  selectedEntry,
  refetch,
}: UseJournalEntriesWorkspaceConfig) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()

  const [postTarget, setPostTarget] = useState<JournalEntry | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<JournalEntry | null>(null)
  const [reverseTarget, setReverseTarget] = useState<JournalEntry | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const [fetchEntry] = useLazyGetJournalEntryQuery()
  const [postJournalEntry] = usePostJournalEntryMutation()
  const [reverseJournalEntry] = useReverseJournalEntryMutation()
  const [deleteJournalEntry] = useDeleteJournalEntryMutation()

  const selectAndLoadEntry = useCallback(async (entry: JournalEntry) => {
    dispatch(setSelectedJournalEntry(entry))
    try {
      const fresh = await fetchEntry(entry.id).unwrap()
      dispatch(setSelectedJournalEntry(fresh))
    }
    catch {
      /* keep list-row data */
    }
  }, [dispatch, fetchEntry])

  const workspace = useEntityWorkspace({
    entities: entries,
    selectedEntity: selectedEntry,
    selectEntity: (entry) => {
      if (entry) {
        void selectAndLoadEntry(entry)
        return
      }

      dispatch(setSelectedJournalEntry(null))
    },
    refetch,
    navigate,
    routes: {
      create: '/accounting/journal-entries/new',
      edit: (id) => `/accounting/journal-entries/${id}/edit`,
    },
    notifications: { showSuccess: () => {}, showError: () => {} },
    deleteMutation: async () => {},
    onEscape: () => {
      workspace.setFocusedIndex(-1)
      dispatch(setSelectedJournalEntry(null))
      setPostTarget(null)
      setDeleteTarget(null)
      setReverseTarget(null)
    },
  })

  const handleConfirmPost = useCallback(async () => {
    if (!postTarget) return
    setActionLoading(true)
    try {
      await postJournalEntry(postTarget.id).unwrap()
      showSuccess(`Journal entry ${postTarget.referenceNumber} posted`)
      setPostTarget(null)
      dispatch(setSelectedJournalEntry(null))
      refetch()
    }
    catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to post journal entry'))
    }
    finally {
      setActionLoading(false)
    }
  }, [dispatch, postTarget, postJournalEntry, refetch, showError, showSuccess])

  const handleConfirmReverse = useCallback(async (reverseDate: string) => {
    if (!reverseTarget) return
    setActionLoading(true)
    try {
      const result = await reverseJournalEntry({ id: reverseTarget.id, reverseDate }).unwrap()
      showSuccess(`Journal entry ${reverseTarget.referenceNumber} reversed`)
      setReverseTarget(null)
      dispatch(setSelectedJournalEntry(result))
      refetch()
    }
    catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to reverse journal entry'))
    }
    finally {
      setActionLoading(false)
    }
  }, [dispatch, refetch, reverseJournalEntry, reverseTarget, showError, showSuccess])

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    setActionLoading(true)
    try {
      await deleteJournalEntry(deleteTarget.id).unwrap()
      showSuccess(`Journal entry ${deleteTarget.referenceNumber} deleted`)
      setDeleteTarget(null)
      dispatch(setSelectedJournalEntry(null))
      refetch()
    }
    catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to delete journal entry'))
    }
    finally {
      setActionLoading(false)
    }
  }, [deleteJournalEntry, deleteTarget, dispatch, refetch, showError, showSuccess])

  return {
    ...workspace,
    selectedEntry,
    postTarget,
    setPostTarget,
    deleteTarget,
    setDeleteTarget,
    reverseTarget,
    setReverseTarget,
    actionLoading,
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
