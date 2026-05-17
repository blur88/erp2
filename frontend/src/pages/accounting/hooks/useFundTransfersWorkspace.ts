import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import type { AppDispatch } from '@/store'
import {
  useDeleteFundTransferMutation,
  useLazyGetFundTransferQuery,
  usePostFundTransferMutation,
  useRestoreFundTransferMutation,
  useUnpostFundTransferMutation,
} from '@/store/api/accountingApi'
import { setSelectedFundTransfer } from '@/store/slices/accountingSlice'
import type { FundTransfer } from '@/types'
import { getErrorMessage } from '@/utils/errorMessage'

export function useFundTransfersWorkspace(
  refetch: () => void,
  transfers: FundTransfer[] = [],
  dispatch: AppDispatch,
  selected: FundTransfer | null,
) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const [postTarget, setPostTarget] = useState<FundTransfer | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<FundTransfer | null>(null)
  const [unpostTarget, setUnpostTarget] = useState<FundTransfer | null>(null)
  const [restoreTarget, setRestoreTarget] = useState<FundTransfer | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<FundTransfer | null>(null)
  const [deletedDialogOpen, setDeletedDialogOpen] = useState(false)

  const [fetchItem] = useLazyGetFundTransferQuery()
  const [postFundTransfer] = usePostFundTransferMutation()
  const [deleteFundTransfer] = useDeleteFundTransferMutation()
  const [unpostFundTransfer] = useUnpostFundTransferMutation()
  const [restoreFundTransfer] = useRestoreFundTransferMutation()

  const workspace = useEntityWorkspace<FundTransfer>({
    entities: transfers,
    selectedEntity: selected,
    selectEntity: (entity) => dispatch(setSelectedFundTransfer(entity)),
    refetch,
    navigate,
    highlightParam: 'highlight',
    routes: {
      create: '/accounting/fund-transfers',
      edit: () => '/accounting/fund-transfers',
    },
    notifications: { showSuccess, showError },
    onEnter: () => {
      if (selected && (selected.status === 'draft' || selected.status === 'reversed')) {
        setEditTarget(selected)
        setFormOpen(true)
      }
    },
    onEscape: () => {
      dispatch(setSelectedFundTransfer(null))
      setPostTarget(null)
      setDeleteTarget(null)
      setUnpostTarget(null)
      setRestoreTarget(null)
    },
  })

  const handleSelect = useCallback(async (item: FundTransfer) => {
    workspace.handleSelect(item)
    try {
      const fresh = await fetchItem(item.id).unwrap()
      dispatch(setSelectedFundTransfer(fresh))
    }
    catch { /* keep list-row data */ }
  }, [fetchItem, workspace, dispatch])

  const handleConfirmPost = useCallback(async () => {
    if (!postTarget) return
    setActionLoading(true)
    try {
      await postFundTransfer(postTarget.id).unwrap()
      showSuccess(`Transfer ${postTarget.referenceNumber} posted`)
      setPostTarget(null)
      refetch()
      const fresh = await fetchItem(postTarget.id).unwrap()
      dispatch(setSelectedFundTransfer(fresh))
    }
    catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to post transfer'))
    }
    finally {
      setActionLoading(false)
    }
  }, [postTarget, postFundTransfer, showSuccess, showError, refetch, dispatch, fetchItem])

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    setActionLoading(true)
    try {
      await deleteFundTransfer(deleteTarget.id).unwrap()
      showSuccess(`Transfer ${deleteTarget.referenceNumber} deleted`)
      setDeleteTarget(null)
      dispatch(setSelectedFundTransfer(null))
      refetch()
    }
    catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to delete transfer'))
    }
    finally {
      setActionLoading(false)
    }
  }, [deleteTarget, deleteFundTransfer, showSuccess, showError, refetch, dispatch])

  const handleConfirmUnpost = useCallback(async () => {
    if (!unpostTarget) return
    setActionLoading(true)
    try {
      await unpostFundTransfer(unpostTarget.id).unwrap()
      showSuccess(`Transfer ${unpostTarget.referenceNumber} unposted`)
      setUnpostTarget(null)
      refetch()
      const fresh = await fetchItem(unpostTarget.id).unwrap()
      dispatch(setSelectedFundTransfer(fresh))
    }
    catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to unpost transfer'))
    }
    finally {
      setActionLoading(false)
    }
  }, [unpostTarget, unpostFundTransfer, showSuccess, showError, refetch, dispatch, fetchItem])

  const handleConfirmRestore = useCallback(async () => {
    if (!restoreTarget) return
    setActionLoading(true)
    try {
      await restoreFundTransfer(restoreTarget.id).unwrap()
      showSuccess(`Transfer ${restoreTarget.referenceNumber} restored`)
      setRestoreTarget(null)
      refetch()
      const fresh = await fetchItem(restoreTarget.id).unwrap()
      dispatch(setSelectedFundTransfer(fresh))
    }
    catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to restore transfer'))
    }
    finally {
      setActionLoading(false)
    }
  }, [restoreTarget, restoreFundTransfer, showSuccess, showError, refetch, dispatch, workspace])

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
    deletedDialogOpen,
    setDeletedDialogOpen,
    setShouldPreserveSearchFocus: workspace.setShouldPreserveSearchFocus,
    handleSelect,
    handleConfirmPost,
    handleConfirmDelete,
    handleConfirmUnpost,
    handleConfirmRestore,
  }
}
