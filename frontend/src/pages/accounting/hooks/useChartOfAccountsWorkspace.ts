import { useCallback, useRef, useState } from 'react'

import { useNotification } from '@/hooks/useNotification'
import { useDeleteChartOfAccountMutation, useSeedDefaultChartOfAccountsMutation } from '@/store/api/accountingApi'
import type { ChartOfAccount } from '@/types'

export function useChartOfAccountsWorkspace(refetch: () => void) {
  const { showSuccess, showError } = useNotification()
  const [selected, setSelected] = useState<ChartOfAccount | null>(null)
  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ChartOfAccount | null>(null)
  const [seedConfirmOpen, setSeedConfirmOpen] = useState(false)
  const [deletedDialogOpen, setDeletedDialogOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const [deleteChartOfAccount] = useDeleteChartOfAccountMutation()
  const [seedDefaultChartOfAccounts] = useSeedDefaultChartOfAccountsMutation()

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await deleteChartOfAccount(deleteTarget.id).unwrap()
      showSuccess(`Account "${deleteTarget.name}" deleted successfully`)
      setDeleteTarget(null)
      if (selected?.id === deleteTarget.id) setSelected(null)
      refetch()
    } catch (error: any) {
      showError(error || 'Failed to delete account')
    }
  }, [deleteChartOfAccount, deleteTarget, refetch, selected?.id, showError, showSuccess])

  const handleSeed = useCallback(async () => {
    try {
      const result = await seedDefaultChartOfAccounts().unwrap()
      showSuccess(result.message || 'Default accounts seeded successfully')
      setSeedConfirmOpen(false)
      refetch()
    } catch (error: any) {
      showError(error || 'Failed to seed default accounts')
      setSeedConfirmOpen(false)
    }
  }, [refetch, seedDefaultChartOfAccounts, showError, showSuccess])

  return { selected, setSelected, formDialogOpen, setFormDialogOpen, deleteTarget, setDeleteTarget, seedConfirmOpen, setSeedConfirmOpen, deletedDialogOpen, setDeletedDialogOpen, searchInputRef, listRef, handleDelete, handleSeed }
}
