import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import type { AppDispatch } from '@/store'
import { useCancelSettlementMutation } from '@/store/api/accountingApi'
import { setSelectedSettlement } from '@/store/slices/accountingSlice'
import type { Settlement } from '@/types'

export function useSettlementsWorkspace(
  entities: Settlement[],
  refetch: () => void,
  dispatch: AppDispatch,
  selected: Settlement | null,
) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<Settlement | null>(null)
  const [cancelSettlement] = useCancelSettlementMutation()

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
    onEnter: () => {},
    onEscape: () => {
      dispatch(setSelectedSettlement(null))
      setCancelTarget(null)
    },
  })

  const handleConfirmCancel = useCallback(async () => {
    if (!cancelTarget) return
    try {
      const next = await cancelSettlement(cancelTarget.id).unwrap()
      dispatch(setSelectedSettlement(next))
      setCancelTarget(null)
      showSuccess('Settlement cancelled successfully')
      refetch()
    } catch (error: any) {
      showError(error?.message || String(error) || 'Failed to cancel settlement')
    }
  }, [cancelSettlement, cancelTarget, refetch, showError, showSuccess, dispatch])

  return {
    ...workspace,
    dialogOpen,
    setDialogOpen,
    cancelTarget,
    setCancelTarget,
    handleConfirmCancel,
  }
}
