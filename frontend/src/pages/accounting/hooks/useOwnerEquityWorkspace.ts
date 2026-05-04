import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import type { AppDispatch } from '@/store'
import {
  useDeleteOwnerEquityTransactionMutation,
  usePostOwnerEquityTransactionMutation,
  useReverseOwnerEquityTransactionMutation,
} from '@/store/api/accountingApi'
import { setSelectedOwnerEquityTransaction } from '@/store/slices/accountingSlice'
import type { OwnerEquityTransaction } from '@/types'

export function useOwnerEquityWorkspace(
  entities: OwnerEquityTransaction[],
  refetch: () => void,
  dispatch: AppDispatch,
  selected: OwnerEquityTransaction | null,
) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [postTarget, setPostTarget] = useState<OwnerEquityTransaction | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<OwnerEquityTransaction | null>(null)
  const [reverseTarget, setReverseTarget] = useState<OwnerEquityTransaction | null>(null)

  const [deleteOwnerEquityTransaction] = useDeleteOwnerEquityTransactionMutation()
  const [postOwnerEquityTransaction] = usePostOwnerEquityTransactionMutation()
  const [reverseOwnerEquityTransaction] = useReverseOwnerEquityTransactionMutation()

  const workspace = useEntityWorkspace<OwnerEquityTransaction>({
    entities,
    selectedEntity: selected,
    selectEntity: (entity) => dispatch(setSelectedOwnerEquityTransaction(entity)),
    refetch,
    navigate,
    highlightParam: 'highlight',
    routes: {
      create: '/accounting/owner-equity',
      edit: () => '/accounting/owner-equity',
    },
    notifications: { showSuccess: () => {}, showError: () => {} },
    deleteMutation: async () => {},
    onEnter: () => {
      if (selected) setDialogOpen(true)
    },
    onEscape: () => {
      dispatch(setSelectedOwnerEquityTransaction(null))
    },
  })

  const handlePost = useCallback(async () => {
    if (!postTarget) return
    try {
      const next = await postOwnerEquityTransaction(postTarget.id).unwrap()
      dispatch(setSelectedOwnerEquityTransaction(next))
      setPostTarget(null)
      showSuccess('Transaction posted')
      refetch()
    } catch (error: any) {
      showError(error?.data?.message || String(error))
    }
  }, [postOwnerEquityTransaction, postTarget, refetch, showError, showSuccess, dispatch])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await deleteOwnerEquityTransaction(deleteTarget.id).unwrap()
      showSuccess('Transaction deleted')
      if (selected?.id === deleteTarget.id) dispatch(setSelectedOwnerEquityTransaction(null))
      setDeleteTarget(null)
      refetch()
    } catch (error: any) {
      showError(error?.data?.message || String(error))
    }
  }, [deleteOwnerEquityTransaction, deleteTarget, refetch, selected?.id, showError, showSuccess, dispatch])

  const handleReverse = useCallback(async () => {
    if (!reverseTarget) return
    try {
      const next = await reverseOwnerEquityTransaction(reverseTarget.id).unwrap()
      dispatch(setSelectedOwnerEquityTransaction(next))
      setReverseTarget(null)
      showSuccess('Transaction reversed')
      refetch()
    } catch (error: any) {
      showError(error?.data?.message || String(error))
    }
  }, [refetch, reverseOwnerEquityTransaction, reverseTarget, showError, showSuccess, dispatch])

  return {
    ...workspace,
    dialogOpen,
    setDialogOpen,
    postTarget,
    setPostTarget,
    deleteTarget,
    setDeleteTarget,
    reverseTarget,
    setReverseTarget,
    handlePost,
    handleDelete,
    handleReverse,
  }
}
