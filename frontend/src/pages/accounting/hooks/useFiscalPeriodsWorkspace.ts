import { useCallback, useRef, useState } from 'react'

import { useNotification } from '@/hooks/useNotification'
import { useCloseFiscalPeriodMutation, useDeleteFiscalPeriodMutation, useGenerateFiscalPeriodsMutation, useReopenFiscalPeriodMutation } from '@/store/api/accountingApi'
import { FiscalPeriod } from '@/types'
import { getErrorMessage } from '@/utils/errorMessage'

export function useFiscalPeriodsWorkspace(refetch: () => void) {
  const { showSuccess, showError } = useNotification()
  const [selected, setSelected] = useState<FiscalPeriod | null>(null)
  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<FiscalPeriod | null>(null)
  const [closeTarget, setCloseTarget] = useState<FiscalPeriod | null>(null)
  const [reopenTarget, setReopenTarget] = useState<FiscalPeriod | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const [deleteFiscalPeriod] = useDeleteFiscalPeriodMutation()
  const [closeFiscalPeriod] = useCloseFiscalPeriodMutation()
  const [reopenFiscalPeriod] = useReopenFiscalPeriodMutation()
  const [generateFiscalPeriods] = useGenerateFiscalPeriodsMutation()

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await deleteFiscalPeriod(deleteTarget.id).unwrap()
      showSuccess(`Period "${deleteTarget.name}" deleted successfully`)
      setDeleteTarget(null)
      if (selected?.id === deleteTarget.id) setSelected(null)
      refetch()
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to delete period'))
    }
  }, [deleteFiscalPeriod, deleteTarget, refetch, selected?.id, showError, showSuccess])

  const handleClose = useCallback(async () => {
    if (!closeTarget) return
    try {
      const next = await closeFiscalPeriod(closeTarget.id).unwrap()
      showSuccess(`Period "${closeTarget.name}" closed successfully`)
      setSelected(next)
      setCloseTarget(null)
      refetch()
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to close period'))
      setCloseTarget(null)
    }
  }, [closeFiscalPeriod, closeTarget, refetch, showError, showSuccess])

  const handleReopen = useCallback(async () => {
    if (!reopenTarget) return
    try {
      const next = await reopenFiscalPeriod(reopenTarget.id).unwrap()
      showSuccess(`Period "${reopenTarget.name}" reopened successfully`)
      setSelected(next)
      setReopenTarget(null)
      refetch()
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to reopen period'))
      setReopenTarget(null)
    }
  }, [refetch, reopenFiscalPeriod, reopenTarget, showError, showSuccess])

  const handleGenerate = useCallback(async (year: number, startMonth: number) => {
    try {
      await generateFiscalPeriods({ year, startMonth }).unwrap()
      showSuccess(`Successfully generated 12 periods for year ${year}`)
      setGenerateDialogOpen(false)
      refetch()
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to generate periods'))
    }
  }, [generateFiscalPeriods, refetch, showError, showSuccess])

  return { selected, setSelected, formDialogOpen, setFormDialogOpen, generateDialogOpen, setGenerateDialogOpen, deleteTarget, setDeleteTarget, closeTarget, setCloseTarget, reopenTarget, setReopenTarget, searchInputRef, listRef, handleDelete, handleClose, handleReopen, handleGenerate }
}
