import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import type { AppDispatch } from '@/store'
import { useCancelFundTransferMutation, useLazyGetFundTransferQuery } from '@/store/api/accountingApi'
import { setSelectedFundTransfer } from '@/store/slices/accountingSlice'
import type { FundTransfer } from '@/types'

export function useFundTransfersWorkspace(
  refetch: () => void,
  transfers: FundTransfer[] = [],
  dispatch: AppDispatch,
  selected: FundTransfer | null,
) {
  const navigate = useNavigate()
  const { showError, showSuccess } = useNotification()
  const [cancelTarget, setCancelTarget] = useState<FundTransfer | null>(null)
  const [fetchItem] = useLazyGetFundTransferQuery()
  const [cancelFundTransfer, { isLoading: cancelling }] = useCancelFundTransferMutation()

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
    deleteMutation: async () => {},
    onEscape: () => {
      dispatch(setSelectedFundTransfer(null))
      setCancelTarget(null)
    },
  })

  const { handleSelect: workspaceHandleSelect } = workspace

  const handleSelect = useCallback(async (item: FundTransfer) => {
    workspaceHandleSelect(item)
    try {
      const fresh = await fetchItem(item.id).unwrap()
      dispatch(setSelectedFundTransfer(fresh))
    }
    catch { /* keep list-row data */ }
  }, [fetchItem, workspaceHandleSelect, dispatch])

  const handleConfirmCancel = useCallback(async () => {
    if (!cancelTarget) return
    try {
      const next = await cancelFundTransfer(cancelTarget.id).unwrap()
      showSuccess(`Transfer ${cancelTarget.referenceNumber} cancelled`)
      dispatch(setSelectedFundTransfer(next))
      setCancelTarget(null)
      refetch()
    }
    catch (error: any) {
      showError(error?.data?.message ?? error?.message ?? 'Operation failed')
    }
  }, [cancelFundTransfer, cancelTarget, refetch, showError, showSuccess, dispatch])

  return {
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
