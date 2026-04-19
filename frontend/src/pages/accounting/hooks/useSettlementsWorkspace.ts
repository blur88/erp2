import { useCallback, useRef, useState } from 'react'

import { useNotification } from '@/hooks/useNotification'
import { useCancelSettlementMutation } from '@/store/api/accountingApi'
import type { Settlement } from '@/types'

export function useSettlementsWorkspace(refetch: () => void) {
  const { showSuccess, showError } = useNotification()
  const [selected, setSelected] = useState<Settlement | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<Settlement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const [cancelSettlement] = useCancelSettlementMutation()

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

  return { selected, setSelected, dialogOpen, setDialogOpen, cancelTarget, setCancelTarget, searchInputRef, listRef, handleConfirmCancel }
}
