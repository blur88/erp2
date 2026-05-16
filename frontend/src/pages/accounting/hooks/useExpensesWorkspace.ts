import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import type { AppDispatch } from '@/store'
import {
  useDeleteExpenseMutation,
  usePostExpenseMutation,
  useRestoreExpenseMutation,
  useUnpostExpenseMutation,
} from '@/store/api/accountingApi'
import { setSelectedExpense } from '@/store/slices/accountingSlice'
import type { ExpenseRecord } from '@/types'
import { getErrorMessage } from '@/utils/errorMessage'

export function useExpensesWorkspace(
  refetch: () => void,
  expenses: ExpenseRecord[] = [],
  dispatch: AppDispatch,
  selected: ExpenseRecord | null,
) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const [postTarget, setPostTarget] = useState<ExpenseRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ExpenseRecord | null>(null)
  const [unpostTarget, setUnpostTarget] = useState<ExpenseRecord | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<ExpenseRecord | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ExpenseRecord | null>(null)

  const [postExpense] = usePostExpenseMutation()
  const [deleteExpense] = useDeleteExpenseMutation()
  const [restoreExpense] = useRestoreExpenseMutation()
  const [unpostExpense] = useUnpostExpenseMutation()

  const workspace = useEntityWorkspace<ExpenseRecord>({
    entities: expenses,
    selectedEntity: selected,
    selectEntity: (entity) => dispatch(setSelectedExpense(entity)),
    refetch,
    navigate,
    highlightParam: 'highlight',
    routes: {
      create: '/accounting/expenses',
      edit: () => '/accounting/expenses',
    },
    notifications: { showSuccess, showError },
    onEnter: () => {
      if (selected) setFormOpen(true)
    },
    onEscape: () => {
      dispatch(setSelectedExpense(null))
      setPostTarget(null)
      setDeleteTarget(null)
      setUnpostTarget(null)
      setRestoreTarget(null)
    },
  })

  const handleConfirmPost = useCallback(async () => {
    if (!postTarget) return
    setActionLoading(true)
    try {
      await postExpense(postTarget.id).unwrap()
      showSuccess(`Expense ${postTarget.referenceNumber} posted`)
      setPostTarget(null)
      dispatch(setSelectedExpense(null))
      refetch()
    }
    catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to post expense'))
    }
    finally {
      setActionLoading(false)
    }
  }, [postTarget, postExpense, showSuccess, showError, refetch, dispatch])

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    setActionLoading(true)
    try {
      await deleteExpense(deleteTarget.id).unwrap()
      showSuccess(`Expense ${deleteTarget.referenceNumber} deleted`)
      setDeleteTarget(null)
      dispatch(setSelectedExpense(null))
      refetch()
    }
    catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to delete expense'))
    }
    finally {
      setActionLoading(false)
    }
  }, [deleteTarget, deleteExpense, showSuccess, showError, refetch, dispatch])

  const handleConfirmUnpost = useCallback(async () => {
    if (!unpostTarget) return
    setActionLoading(true)
    try {
      await unpostExpense(unpostTarget.id).unwrap()
      showSuccess(`Expense ${unpostTarget.referenceNumber} unposted`)
      setUnpostTarget(null)
      dispatch(setSelectedExpense(null))
      refetch()
    }
    catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to unpost expense'))
    }
    finally {
      setActionLoading(false)
    }
  }, [unpostTarget, unpostExpense, showSuccess, showError, refetch, dispatch])

  const handleConfirmRestore = useCallback(async () => {
    if (!restoreTarget) return
    setActionLoading(true)
    try {
      await restoreExpense(restoreTarget.id).unwrap()
      showSuccess(`Expense ${restoreTarget.referenceNumber} restored`)
      setRestoreTarget(null)
      dispatch(setSelectedExpense(null))
      refetch()
    }
    catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to restore expense'))
    }
    finally {
      setActionLoading(false)
    }
  }, [restoreTarget, restoreExpense, showSuccess, showError, refetch, dispatch])

  return {
    focusedIndex: workspace.focusedIndex,
    listRef: workspace.listRef,
    searchInputRef: workspace.searchInputRef,
    formOpen,
    setFormOpen,
    editTarget,
    setEditTarget,
    postTarget,
    setPostTarget,
    deleteTarget,
    setDeleteTarget,
    unpostTarget,
    setUnpostTarget,
    restoreTarget,
    setRestoreTarget,
    actionLoading,
    handleSelect: workspace.handleSelect,
    handleConfirmPost,
    handleConfirmDelete,
    handleConfirmUnpost,
    handleConfirmRestore,
  }
}
