import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import type { AppDispatch } from '@/store'
import {
  useDeleteSettlementMutation,
  useLazyGetSettlementQuery,
  usePostSettlementMutation,
  useRestoreSettlementMutation,
  useReverseSettlementMutation,
} from '@/store/api/accountingApi'
import { setSelectedSettlement } from '@/store/slices/accountingSlice'
import type { Settlement } from '@/types'
import { getErrorMessage } from '@/utils/errorMessage'

export function useSettlementsWorkspace(
  entities: Settlement[],
  refetch: () => void,
  dispatch: AppDispatch,
  selected: Settlement | null,
) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()

  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Settlement | null>(null)
  const [postTarget, setPostTarget] = useState<Settlement | null>(null)
  const [reverseTarget, setReverseTarget] = useState<Settlement | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Settlement | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<Settlement | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deletedDialogOpen, setDeletedDialogOpen] = useState(false)

  const [fetchItem] = useLazyGetSettlementQuery()
  const [postSettlement] = usePostSettlementMutation()
  const [reverseSettlement] = useReverseSettlementMutation()
  const [deleteSettlement] = useDeleteSettlementMutation()
  const [restoreSettlement] = useRestoreSettlementMutation()

  const workspace = useEntityWorkspace<Settlement>({
    entities,
    selectedEntity: selected,
    selectEntity: (entity) => dispatch(setSelectedSettlement(entity)),
    refetch,
    navigate,
    highlightParam: 'highlight',
    routes: {
      create: '/accounting/settlements',
      edit: () => '/accounting/settlements',
    },
    onEnter: () => {
      if (selected && (selected.status === 'draft' || selected.status === 'reversed')) {
        setEditTarget(selected)
        setFormOpen(true)
      }
    },
    onEscape: () => {
      dispatch(setSelectedSettlement(null))
      setPostTarget(null)
      setReverseTarget(null)
      setDeleteTarget(null)
      setRestoreTarget(null)
    },
  })

  const handleSelect = useCallback(async (item: Settlement) => {
    workspace.handleSelect(item)
    try {
      const fresh = await fetchItem(item.id).unwrap()
      dispatch(setSelectedSettlement(fresh))
    }
    catch { /* keep list-row data */ }
  }, [fetchItem, workspace, dispatch])

  const handleConfirmPost = useCallback(async () => {
    if (!postTarget) return
    setActionLoading(true)
    try {
      await postSettlement(postTarget.id).unwrap()
      showSuccess(`Settlement ${postTarget.settlementNumber} posted`)
      setPostTarget(null)
      refetch()
      const fresh = await fetchItem(postTarget.id).unwrap()
      dispatch(setSelectedSettlement(fresh))
    }
    catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to post settlement'))
    }
    finally {
      setActionLoading(false)
    }
  }, [postTarget, postSettlement, showSuccess, showError, refetch, dispatch, fetchItem])

  const handleConfirmReverse = useCallback(async () => {
    if (!reverseTarget) return
    setActionLoading(true)
    try {
      await reverseSettlement(reverseTarget.id).unwrap()
      showSuccess(`Settlement ${reverseTarget.settlementNumber} reversed`)
      setReverseTarget(null)
      refetch()
      const fresh = await fetchItem(reverseTarget.id).unwrap()
      dispatch(setSelectedSettlement(fresh))
    }
    catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to reverse settlement'))
    }
    finally {
      setActionLoading(false)
    }
  }, [reverseTarget, reverseSettlement, showSuccess, showError, refetch, dispatch, fetchItem])

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    setActionLoading(true)
    try {
      await deleteSettlement(deleteTarget.id).unwrap()
      showSuccess(`Settlement ${deleteTarget.settlementNumber} deleted`)
      setDeleteTarget(null)
      dispatch(setSelectedSettlement(null))
      refetch()
    }
    catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to delete settlement'))
    }
    finally {
      setActionLoading(false)
    }
  }, [deleteTarget, deleteSettlement, showSuccess, showError, refetch, dispatch])

  const handleConfirmRestore = useCallback(async () => {
    if (!restoreTarget) return
    setActionLoading(true)
    try {
      await restoreSettlement(restoreTarget.id).unwrap()
      showSuccess(`Settlement ${restoreTarget.settlementNumber} restored`)
      setRestoreTarget(null)
      refetch()
      const fresh = await fetchItem(restoreTarget.id).unwrap()
      dispatch(setSelectedSettlement(fresh))
    }
    catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to restore settlement'))
    }
    finally {
      setActionLoading(false)
    }
  }, [restoreTarget, restoreSettlement, showSuccess, showError, refetch, dispatch, fetchItem])

  return {
    focusedIndex: workspace.focusedIndex,
    listRef: workspace.listRef,
    searchInputRef: workspace.searchInputRef,
    setShouldPreserveSearchFocus: workspace.setShouldPreserveSearchFocus,
    fetchItem,
    handleSelect,
    dialogOpen,
    setDialogOpen,
    deletedDialogOpen,
    setDeletedDialogOpen,
    formOpen,
    setFormOpen,
    editTarget,
    setEditTarget,
    postTarget,
    setPostTarget,
    reverseTarget,
    setReverseTarget,
    deleteTarget,
    setDeleteTarget,
    restoreTarget,
    setRestoreTarget,
    actionLoading,
    handleConfirmPost,
    handleConfirmReverse,
    handleConfirmDelete,
    handleConfirmRestore,
  }
}
