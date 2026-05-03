import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import { useCancelFundTransferMutation, useLazyGetFundTransferQuery } from '@/store/api/accountingApi'
import type { FundTransfer } from '@/types'

export function useFundTransfersWorkspace(refetch: () => void, transfers: FundTransfer[] = []) {
  const navigate = useNavigate()
  const { showError, showSuccess } = useNotification()
  const [selected, setSelected] = useState<FundTransfer | null>(null)
  const [cancelTarget, setCancelTarget] = useState<FundTransfer | null>(null)
  const [fetchItem] = useLazyGetFundTransferQuery()
  const [cancelFundTransfer, { isLoading: cancelling }] = useCancelFundTransferMutation()

  const workspace = useEntityWorkspace<FundTransfer>({
    entities: transfers,
    selectedEntity: selected,
    selectEntity: setSelected,
    refetch,
    navigate,
    routes: {
      create: '/accounting/fund-transfers',
      edit: () => '/accounting/fund-transfers',
    },
    notifications: { showSuccess, showError },
    deleteMutation: async () => {},
    onEscape: () => {
      setSelected(null)
      setCancelTarget(null)
    },
  })

  const { handleSelect: workspaceHandleSelect } = workspace

  const handleSelect = useCallback(async (item: FundTransfer) => {
    setSelected(item)
    workspaceHandleSelect(item)
    try {
      const fresh = await fetchItem(item.id).unwrap()
      setSelected(fresh)
    }
    catch { /* keep list-row data */ }
  }, [fetchItem, workspaceHandleSelect])

  const handleConfirmCancel = useCallback(async () => {
    if (!cancelTarget) return
    try {
      const next = await cancelFundTransfer(cancelTarget.id).unwrap()
      showSuccess(`Transfer ${cancelTarget.referenceNumber} cancelled`)
      setSelected(next)
      setCancelTarget(null)
      refetch()
    }
    catch (error: any) {
      showError(error?.data?.message ?? error?.message ?? 'Operation failed')
    }
  }, [cancelFundTransfer, cancelTarget, refetch, showError, showSuccess])

  return {
    selected,
    setSelected,
    focusedIndex: workspace.focusedIndex,
    listRef: workspace.listRef,
    searchInputRef: workspace.searchInputRef,
    cancelTarget,
    setCancelTarget,
    cancelling,
    handleSelect,
    handleConfirmCancel,
  }
}
