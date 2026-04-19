import { useCallback, useRef, useState } from 'react'

import { useNotification } from '@/hooks/useNotification'
import {
  useDeleteOwnerEquityTransactionMutation,
  usePostOwnerEquityTransactionMutation,
  useReverseOwnerEquityTransactionMutation,
} from '@/store/api/accountingApi'
import type { OwnerEquityTransaction } from '@/types'

export function useOwnerEquityWorkspace(refetch: () => void) {
  const { showError, showSuccess } = useNotification()
  const [selected, setSelected] = useState<OwnerEquityTransaction | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [postTarget, setPostTarget] = useState<OwnerEquityTransaction | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<OwnerEquityTransaction | null>(null)
  const [reverseTarget, setReverseTarget] = useState<OwnerEquityTransaction | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const [deleteOwnerEquityTransaction] = useDeleteOwnerEquityTransactionMutation()
  const [postOwnerEquityTransaction] = usePostOwnerEquityTransactionMutation()
  const [reverseOwnerEquityTransaction] = useReverseOwnerEquityTransactionMutation()

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await deleteOwnerEquityTransaction(deleteTarget.id).unwrap()
      showSuccess('Transaction deleted')
      if (selected?.id === deleteTarget.id) setSelected(null)
      setDeleteTarget(null)
      refetch()
    } catch (error: any) {
      showError(String(error))
    }
  }, [deleteOwnerEquityTransaction, deleteTarget, refetch, selected?.id, showError, showSuccess])

  const handlePost = useCallback(async () => {
    if (!postTarget) return
    try {
      const next = await postOwnerEquityTransaction(postTarget.id).unwrap()
      showSuccess('Transaction posted')
      setSelected(next)
      setPostTarget(null)
      refetch()
    } catch (error: any) {
      showError(String(error))
    }
  }, [postOwnerEquityTransaction, postTarget, refetch, showError, showSuccess])

  const handleReverse = useCallback(async () => {
    if (!reverseTarget) return
    try {
      const next = await reverseOwnerEquityTransaction(reverseTarget.id).unwrap()
      showSuccess('Transaction reversed')
      setSelected(next)
      setReverseTarget(null)
      refetch()
    } catch (error: any) {
      showError(String(error))
    }
  }, [refetch, reverseOwnerEquityTransaction, reverseTarget, showError, showSuccess])

  return {
    selected, setSelected, dialogOpen, setDialogOpen, postTarget, setPostTarget, deleteTarget, setDeleteTarget, reverseTarget, setReverseTarget, searchInputRef, listRef, handleDelete, handlePost, handleReverse,
  }
}
