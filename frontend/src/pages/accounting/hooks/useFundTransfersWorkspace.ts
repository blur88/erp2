import { useCallback, useRef, useState } from 'react'

import { useNotification } from '@/hooks/useNotification'
import { useCancelFundTransferMutation } from '@/store/api/accountingApi'
import type { FundTransfer } from '@/types'

export function useFundTransfersWorkspace(refetch: () => void) {
  const { showError, showSuccess } = useNotification()
  const [selected, setSelected] = useState<FundTransfer | null>(null)
  const [cancelTarget, setCancelTarget] = useState<FundTransfer | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const [cancelFundTransfer, { isLoading: cancelling }] = useCancelFundTransferMutation()

  const handleConfirmCancel = useCallback(async () => {
    if (!cancelTarget) return
    try {
      const next = await cancelFundTransfer(cancelTarget.id).unwrap()
      showSuccess(`Transfer ${cancelTarget.referenceNumber} cancelled`)
      setSelected(next)
      setCancelTarget(null)
      refetch()
    } catch (error: any) {
      showError(error?.data?.message ?? error?.message ?? 'Operation failed')
    }
  }, [cancelFundTransfer, cancelTarget, refetch, showError, showSuccess])

  return { selected, setSelected, cancelTarget, setCancelTarget, cancelling, searchInputRef, listRef, handleConfirmCancel }
}
