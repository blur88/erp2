import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import { useCancelSettlementMutation } from '@/store/api/accountingApi'
import type { Settlement } from '@/types'

export function useSettlementsWorkspace(entities: Settlement[], refetch: () => void) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<Settlement | null>(null)
  const [selected, setSelected] = useState<Settlement | null>(null)
  const [cancelSettlement] = useCancelSettlementMutation()

  const workspace = useEntityWorkspace<Settlement>({
    entities,
    selectedEntity: selected,
    selectEntity: setSelected,
    refetch,
    navigate,
    routes: {
      create: '/accounting/settlements',
      edit: () => '/accounting/settlements',
    },
    notifications: { showSuccess: () => {}, showError: () => {} },
    deleteMutation: async () => {},
    onEnter: () => {},
  })

  const handleConfirmCancel = useCallback(async () => {
    if (!cancelTarget) return
    try {
      const next = await cancelSettlement(cancelTarget.id).unwrap()
      setSelected(next)
      setCancelTarget(null)
      showSuccess('Settlement cancelled successfully')
      refetch()
    } catch (error: any) {
      showError(error?.message || String(error) || 'Failed to cancel settlement')
    }
  }, [cancelSettlement, cancelTarget, refetch, showError, showSuccess])

  return {
    ...workspace,
    selected,
    dialogOpen,
    setDialogOpen,
    cancelTarget,
    setCancelTarget,
    handleConfirmCancel,
  }
}
