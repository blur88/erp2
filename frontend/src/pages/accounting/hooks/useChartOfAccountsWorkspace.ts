import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import type { AppDispatch } from '@/store'
import { useDeleteChartOfAccountMutation, useSeedDefaultChartOfAccountsMutation } from '@/store/api/accountingApi'
import { setSelectedAccount } from '@/store/slices/accountingSlice'
import type { ChartOfAccount } from '@/types'

interface UseChartOfAccountsWorkspaceConfig {
  dispatch: AppDispatch
  accounts: ChartOfAccount[]
  selectedAccount: ChartOfAccount | null
  refetch: () => void
}

export function useChartOfAccountsWorkspace({
  dispatch,
  accounts,
  selectedAccount,
  refetch,
}: UseChartOfAccountsWorkspaceConfig) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ChartOfAccount | null>(null)
  const [seedConfirmOpen, setSeedConfirmOpen] = useState(false)
  const [deletedDialogOpen, setDeletedDialogOpen] = useState(false)
  const [deleteChartOfAccount] = useDeleteChartOfAccountMutation()
  const [seedDefaultChartOfAccounts] = useSeedDefaultChartOfAccountsMutation()

  const workspace = useEntityWorkspace({
    entities: accounts,
    selectedEntity: selectedAccount,
    selectEntity: (account) => dispatch(setSelectedAccount(account)),
    refetch,
    navigate,
    routes: {
      create: '',
      edit: () => '',
    },
    notifications: { showSuccess: () => {}, showError: () => {} },
    deleteMutation: async () => {},
    onEnter: () => {
      if (selectedAccount) {
        setFormDialogOpen(true)
      }
    },
    onEscape: () => {
      workspace.setFocusedIndex(-1)
      dispatch(setSelectedAccount(null))
      setFormDialogOpen(false)
      setDeleteTarget(null)
    },
  })

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await deleteChartOfAccount(deleteTarget.id).unwrap()
      showSuccess(`Account "${deleteTarget.name}" deleted successfully`)
      setDeleteTarget(null)
      if (selectedAccount?.id === deleteTarget.id) {
        dispatch(setSelectedAccount(null))
      }
      refetch()
    } catch (error: any) {
      showError(error || 'Failed to delete account')
    }
  }, [deleteChartOfAccount, deleteTarget, dispatch, refetch, selectedAccount?.id, showError, showSuccess])

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

  return {
    ...workspace,
    selected: selectedAccount,
    setSelected: (account: ChartOfAccount | null) => dispatch(setSelectedAccount(account)),
    formDialogOpen,
    setFormDialogOpen,
    deleteTarget,
    setDeleteTarget,
    seedConfirmOpen,
    setSeedConfirmOpen,
    deletedDialogOpen,
    setDeletedDialogOpen,
    handleDelete,
    handleSeed,
  }
}
