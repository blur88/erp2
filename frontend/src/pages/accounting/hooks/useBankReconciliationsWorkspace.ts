import { useCallback, useRef, useState } from 'react'

import { useNotification } from '@/hooks/useNotification'
import {
  useCompleteBankReconciliationMutation,
  useDeleteBankReconciliationMutation,
  useLazyGetBankReconciliationQuery,
  useMarkBankReconciliationClearedMutation,
  useReopenBankReconciliationMutation,
  useUnmarkBankReconciliationClearedMutation,
} from '@/store/api/accountingApi'
import { BankReconciliation, ReconciledTransaction } from '@/types'
import { getErrorMessage } from '@/utils/errorMessage'

export function useBankReconciliationsWorkspace(refetch: () => void) {
  const { showSuccess, showError } = useNotification()
  const [selected, setSelected] = useState<BankReconciliation | null>(null)
  const [completeTarget, setCompleteTarget] = useState<BankReconciliation | null>(null)
  const [reopenTarget, setReopenTarget] = useState<BankReconciliation | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<BankReconciliation | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const [fetchItem] = useLazyGetBankReconciliationQuery()
  const [markCleared] = useMarkBankReconciliationClearedMutation()
  const [unmarkCleared] = useUnmarkBankReconciliationClearedMutation()
  const [completeReconciliation] = useCompleteBankReconciliationMutation()
  const [reopenReconciliation] = useReopenBankReconciliationMutation()
  const [deleteReconciliation] = useDeleteBankReconciliationMutation()

  const handleSelect = useCallback(async (item: BankReconciliation) => {
    setSelected(item)
    try {
      const fresh = await fetchItem(item.id).unwrap()
      setSelected(fresh)
    }
    catch { /* keep list-row data */ }
  }, [fetchItem])

  const handleToggleCleared = useCallback(async (txn: ReconciledTransaction) => {
    if (!selected) return
    try {
      const fresh = txn.cleared
        ? await unmarkCleared({ id: selected.id, journalEntryLineIds: [txn.journalEntryLineId] }).unwrap()
        : await markCleared({ id: selected.id, journalEntryLineIds: [txn.journalEntryLineId] }).unwrap()
      setSelected(fresh)
      refetch()
    }
    catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to update transaction'))
    }
  }, [selected, markCleared, unmarkCleared, refetch, showError])

  const handleConfirmComplete = useCallback(async () => {
    if (!completeTarget) return
    setActionLoading(true)
    try {
      const fresh = await completeReconciliation(completeTarget.id).unwrap()
      showSuccess('Reconciliation completed')
      setCompleteTarget(null)
      setSelected(fresh)
      refetch()
    }
    catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to complete reconciliation'))
    }
    finally {
      setActionLoading(false)
    }
  }, [completeTarget, completeReconciliation, showSuccess, showError, refetch])

  const handleConfirmReopen = useCallback(async () => {
    if (!reopenTarget) return
    setActionLoading(true)
    try {
      const fresh = await reopenReconciliation(reopenTarget.id).unwrap()
      showSuccess('Reconciliation reopened')
      setReopenTarget(null)
      setSelected(fresh)
      refetch()
    }
    catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to reopen reconciliation'))
    }
    finally {
      setActionLoading(false)
    }
  }, [reopenTarget, reopenReconciliation, showSuccess, showError, refetch])

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    setActionLoading(true)
    try {
      await deleteReconciliation(deleteTarget.id).unwrap()
      showSuccess('Reconciliation deleted')
      setDeleteTarget(null)
      setSelected(null)
      refetch()
    }
    catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to delete reconciliation'))
    }
    finally {
      setActionLoading(false)
    }
  }, [deleteTarget, deleteReconciliation, showSuccess, showError, refetch])

  return {
    selected,
    setSelected,
    completeTarget,
    setCompleteTarget,
    reopenTarget,
    setReopenTarget,
    deleteTarget,
    setDeleteTarget,
    actionLoading,
    searchInputRef,
    listRef,
    handleSelect,
    handleToggleCleared,
    handleConfirmComplete,
    handleConfirmReopen,
    handleConfirmDelete,
  }
}
