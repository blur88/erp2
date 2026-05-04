import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import {
  useDeleteOwnerEquityTransactionMutation,
  usePostOwnerEquityTransactionMutation,
  useReverseOwnerEquityTransactionMutation,
} from '@/store/api/accountingApi'
import type { OwnerEquityTransaction } from '@/types'

export function useOwnerEquityWorkspace(entities: OwnerEquityTransaction[], refetch: () => void) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()

  const [selected, setSelected] = useState<OwnerEquityTransaction | null>(null)
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
    selectEntity: setSelected,
    refetch,
    navigate,
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
      setSelected(null)
      setPostTarget(null)
      setDeleteTarget(null)
      setReverseTarget(null)
    },
  })

  const handlePost = useCallback(async () => {
    if (!postTarget) return
    try {
      const next = await postOwnerEquityTransaction(postTarget.id).unwrap()
      setSelected(next)
      setPostTarget(null)
      showSuccess('Transaction posted')
      refetch()
    } catch (error: any) {
      showError(error?.data?.message || String(error))
    }
  }, [postOwnerEquityTransaction, postTarget, refetch, showError, showSuccess])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await deleteOwnerEquityTransaction(deleteTarget.id).unwrap()
      showSuccess('Transaction deleted')
      if (selected?.id === deleteTarget.id) setSelected(null)
      setDeleteTarget(null)
      refetch()
    } catch (error: any) {
      showError(error?.data?.message || String(error))
    }
  }, [deleteOwnerEquityTransaction, deleteTarget, refetch, selected?.id, showError, showSuccess])

  const handleReverse = useCallback(async () => {
    if (!reverseTarget) return
    try {
      const next = await reverseOwnerEquityTransaction(reverseTarget.id).unwrap()
      setSelected(next)
      setReverseTarget(null)
      showSuccess('Transaction reversed')
      refetch()
    } catch (error: any) {
      showError(error?.data?.message || String(error))
    }
  }, [refetch, reverseOwnerEquityTransaction, reverseTarget, showError, showSuccess])

  return {
    ...workspace,
    selected,
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
