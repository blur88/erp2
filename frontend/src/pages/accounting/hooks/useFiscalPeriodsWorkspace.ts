import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import type { AppDispatch } from '@/store'
import {
  useCloseFiscalPeriodMutation,
  useDeleteFiscalPeriodMutation,
  useGenerateFiscalPeriodsMutation,
  useReopenFiscalPeriodMutation,
} from '@/store/api/accountingApi'
import { setSelectedFiscalPeriod } from '@/store/slices/accountingSlice'
import type { FiscalPeriod } from '@/types'
import { getErrorMessage } from '@/utils/errorMessage'

export function useFiscalPeriodsWorkspace(
  refetch: () => void,
  periods: FiscalPeriod[],
  dispatch: AppDispatch,
  selected: FiscalPeriod | null,
) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()

  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<FiscalPeriod | null>(null)
  const [closeTarget, setCloseTarget] = useState<FiscalPeriod | null>(null)
  const [reopenTarget, setReopenTarget] = useState<FiscalPeriod | null>(null)

  const [deleteFiscalPeriod] = useDeleteFiscalPeriodMutation()
  const [closeFiscalPeriod] = useCloseFiscalPeriodMutation()
  const [reopenFiscalPeriod] = useReopenFiscalPeriodMutation()
  const [generateFiscalPeriods] = useGenerateFiscalPeriodsMutation()

  const workspace = useEntityWorkspace<FiscalPeriod>({
    entities: periods,
    selectedEntity: selected,
    selectEntity: (entity) => dispatch(setSelectedFiscalPeriod(entity)),
    refetch,
    navigate,
    routes: {
      create: '/accounting/fiscal-periods',
      edit: () => '/accounting/fiscal-periods',
    },
    onEnter: () => {
      if (selected) setFormDialogOpen(true)
    },
    onEscape: () => {
      dispatch(setSelectedFiscalPeriod(null))
      setCloseTarget(null)
      setReopenTarget(null)
    },
  })

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await deleteFiscalPeriod(deleteTarget.id).unwrap()
      showSuccess(`Period "${deleteTarget.name}" deleted successfully`)
      setDeleteTarget(null)
      if (selected?.id === deleteTarget.id) dispatch(setSelectedFiscalPeriod(null))
      refetch()
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to delete period'))
    }
  }, [deleteFiscalPeriod, deleteTarget, dispatch, refetch, selected?.id, showError, showSuccess])

  const handleClose = useCallback(async () => {
    if (!closeTarget) return
    try {
      const next = await closeFiscalPeriod(closeTarget.id).unwrap()
      showSuccess(`Period "${closeTarget.name}" closed successfully`)
      dispatch(setSelectedFiscalPeriod(next))
      setCloseTarget(null)
      refetch()
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to close period'))
      setCloseTarget(null)
    }
  }, [closeFiscalPeriod, closeTarget, dispatch, refetch, showError, showSuccess])

  const handleReopen = useCallback(async () => {
    if (!reopenTarget) return
    try {
      const next = await reopenFiscalPeriod(reopenTarget.id).unwrap()
      showSuccess(`Period "${reopenTarget.name}" reopened successfully`)
      dispatch(setSelectedFiscalPeriod(next))
      setReopenTarget(null)
      refetch()
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to reopen period'))
      setReopenTarget(null)
    }
  }, [dispatch, refetch, reopenFiscalPeriod, reopenTarget, showError, showSuccess])

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

  return {
    focusedIndex: workspace.focusedIndex,
    listRef: workspace.listRef,
    searchInputRef: workspace.searchInputRef,
    handleSelect: workspace.handleSelect,
    formDialogOpen,
    setFormDialogOpen,
    generateDialogOpen,
    setGenerateDialogOpen,
    deleteTarget,
    setDeleteTarget,
    closeTarget,
    setCloseTarget,
    reopenTarget,
    setReopenTarget,
    handleDelete,
    handleClose,
    handleReopen,
    handleGenerate,
  }
}
