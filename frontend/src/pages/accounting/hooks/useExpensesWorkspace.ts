import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import type { AppDispatch } from '@/store'
import {
  useDeleteExpenseMutation,
  usePostExpenseMutation,
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
  const [actionLoading, setActionLoading] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ExpenseRecord | null>(null)

  const [postExpense] = usePostExpenseMutation()
  const [deleteExpense] = useDeleteExpenseMutation()

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
    actionLoading,
    handleSelect: workspace.handleSelect,
    handleConfirmPost,
    handleConfirmDelete,
  }
}
