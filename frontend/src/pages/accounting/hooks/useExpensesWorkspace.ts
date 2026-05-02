import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import {
  useBulkDeleteExpensesMutation,
  useBulkPostExpensesMutation,
  useDeleteExpenseMutation,
  usePostExpenseMutation,
} from '@/store/api/accountingApi'
import type { ExpenseRecord } from '@/types'
import { getErrorMessage } from '@/utils/errorMessage'

export function useExpensesWorkspace(refetch: () => void, expenses: ExpenseRecord[] = []) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const [selected, setSelected] = useState<ExpenseRecord | null>(null)
  const [postTarget, setPostTarget] = useState<ExpenseRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ExpenseRecord | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkPostOpen, setBulkPostOpen] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ExpenseRecord | null>(null)

  const [postExpense] = usePostExpenseMutation()
  const [deleteExpense] = useDeleteExpenseMutation()
  const [bulkPost] = useBulkPostExpensesMutation()
  const [bulkDelete] = useBulkDeleteExpensesMutation()

  const workspace = useEntityWorkspace<ExpenseRecord>({
    entities: expenses,
    selectedEntity: selected,
    selectEntity: setSelected,
    refetch,
    navigate,
    routes: {
      create: '/accounting/expenses',
      edit: () => '/accounting/expenses',
    },
    notifications: { showSuccess, showError },
    deleteMutation: async (id) => {
      await deleteExpense(id).unwrap()
    },
    onEnter: () => {
      if (selected) setFormOpen(true)
    },
    onEscape: () => {
      setSelected(null)
      setPostTarget(null)
      setDeleteTarget(null)
    },
  })

  const handleSelect = useCallback((item: ExpenseRecord) => {
    workspace.handleSelect(item)
  }, [workspace])

  const handleToggleCheck = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleSelectAll = useCallback((expenses: ExpenseRecord[]) => {
    const drafts = expenses.filter((e) => e.status === 'draft').map((e) => e.id)
    setSelectedIds((prev) => (prev.size === drafts.length ? new Set() : new Set(drafts)))
  }, [])

  const handleConfirmPost = useCallback(async () => {
    if (!postTarget) return
    setActionLoading(true)
    try {
      await postExpense(postTarget.id).unwrap()
      showSuccess(`Expense ${postTarget.referenceNumber} posted`)
      setPostTarget(null)
      setSelected(null)
      refetch()
    }
    catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to post expense'))
    }
    finally {
      setActionLoading(false)
    }
  }, [postTarget, postExpense, showSuccess, showError, refetch])

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    setActionLoading(true)
    try {
      await deleteExpense(deleteTarget.id).unwrap()
      showSuccess(`Expense ${deleteTarget.referenceNumber} deleted`)
      setDeleteTarget(null)
      setSelected(null)
      refetch()
    }
    catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to delete expense'))
    }
    finally {
      setActionLoading(false)
    }
  }, [deleteTarget, deleteExpense, showSuccess, showError, refetch])

  const handleBulkPost = useCallback(async () => {
    setActionLoading(true)
    try {
      const result = await bulkPost(Array.from(selectedIds)).unwrap()
      showSuccess(`Posted ${result.posted} expenses`)
      if (result.failed > 0) showError(`${result.failed} failed`)
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
  }, [selectedIds, bulkPost, showSuccess, showError, refetch])

  const handleBulkDelete = useCallback(async () => {
    setActionLoading(true)
    try {
      const result = await bulkDelete(Array.from(selectedIds)).unwrap()
      showSuccess(`Deleted ${result.deleted} expenses`)
      if (result.failed > 0) showError(`${result.failed} failed`)
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
  }, [selectedIds, bulkDelete, showSuccess, showError, refetch])

  return {
    selected,
    setSelected,
    focusedIndex: workspace.focusedIndex,
    setFocusedIndex: workspace.setFocusedIndex,
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
    selectedIds,
    bulkPostOpen,
    setBulkPostOpen,
    bulkDeleteOpen,
    setBulkDeleteOpen,
    actionLoading,
    handleSelect,
    handleToggleCheck,
    handleSelectAll,
    handleConfirmPost,
    handleConfirmDelete,
    handleBulkPost,
    handleBulkDelete,
  }
}
