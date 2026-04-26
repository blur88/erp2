import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import { useDeleteChartOfAccountMutation, useSeedDefaultChartOfAccountsMutation } from '@/store/api/accountingApi'
import { setSelectedAccount } from '@/store/slices/accountingSlice'
import type { AppDispatch } from '@/store'
import type { ChartOfAccount } from '@/types'

export function useChartOfAccountsWorkspace(
  accounts: ChartOfAccount[],
  selectedAccount: ChartOfAccount | null,
  dispatch: AppDispatch,
  refetch: () => void,
) {
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
    highlightParam: 'highlight',
    routes: {
      create: '/accounting/chart-of-accounts',
      edit: () => '/accounting/chart-of-accounts',
    },
    notifications: { showSuccess, showError },
    deleteMutation: async (id) => {
      const target = accounts.find((a) => a.id === id)
      await deleteChartOfAccount(id).unwrap()
      showSuccess(`Account "${target?.name ?? id}" deleted successfully`)
      setDeleteTarget(null)
    },
    onEnter: () => setFormDialogOpen(true),
    onEscape: () => {
      dispatch(setSelectedAccount(null))
      setFormDialogOpen(false)
      setDeleteTarget(null)
      setSeedConfirmOpen(false)
    },
  })

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
    handleSeed,
  }
}

