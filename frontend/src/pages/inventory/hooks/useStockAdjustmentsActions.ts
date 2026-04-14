import { useCallback } from 'react'
import type { NavigateFunction } from 'react-router-dom'

import type { AppDispatch } from '@/store'
import { setSelectedStockAdjustment } from '@/store/slices/inventorySlice'
import type { StockAdjustment } from '@/types'

interface UseStockAdjustmentsActionsParams {
  dispatch: AppDispatch
  navigate: NavigateFunction
  selectedAdjustment: StockAdjustment | null
  deleteStockAdjustment: (id: string) => { unwrap: () => Promise<unknown> }
  completeStockAdjustment: (id: string) => { unwrap: () => Promise<unknown> }
  uncompleteStockAdjustment: (id: string) => { unwrap: () => Promise<unknown> }
  fetchStockAdjustmentById: (id: string) => { unwrap: () => Promise<StockAdjustment> }
  refetchAdjustments: () => void
  showSuccess: (message: string) => void
  showError: (message: string) => void
  setDeleteConfirmOpen: (v: boolean) => void
  setAdjustmentToDelete: (v: string | null) => void
  setAdjustmentToDeleteName: (v: string) => void
  setCompleteConfirmOpen: (v: boolean) => void
  setAdjustmentToComplete: (v: string | null) => void
  setAdjustmentToCompleteName: (v: string) => void
  setRevertConfirmOpen: (v: boolean) => void
  setAdjustmentToRevert: (v: string | null) => void
  setAdjustmentToRevertName: (v: string) => void
  setFocusedAdjustmentIndex: (v: number) => void
}

export function useStockAdjustmentsActions({
  dispatch,
  navigate,
  selectedAdjustment,
  deleteStockAdjustment,
  completeStockAdjustment,
  uncompleteStockAdjustment,
  fetchStockAdjustmentById,
  refetchAdjustments,
  showSuccess,
  showError,
  setDeleteConfirmOpen,
  setAdjustmentToDelete,
  setAdjustmentToDeleteName,
  setCompleteConfirmOpen,
  setAdjustmentToComplete,
  setAdjustmentToCompleteName,
  setRevertConfirmOpen,
  setAdjustmentToRevert,
  setAdjustmentToRevertName,
  setFocusedAdjustmentIndex,
}: UseStockAdjustmentsActionsParams) {
  const handleEdit = useCallback(() => {
    if (!selectedAdjustment) return
    if (selectedAdjustment.status !== 'draft') {
      showError('Only draft adjustments can be edited')
      return
    }
    navigate(`/inventory/stock-adjustments/${selectedAdjustment.id}/edit`)
  }, [navigate, selectedAdjustment, showError])

  const handleDelete = useCallback((id: string, adjustmentNumber: string) => {
    setAdjustmentToDelete(id)
    setAdjustmentToDeleteName(adjustmentNumber)
    setDeleteConfirmOpen(true)
  }, [setAdjustmentToDelete, setAdjustmentToDeleteName, setDeleteConfirmOpen])

  const handleConfirmDelete = useCallback(async (id: string | null) => {
    if (!id) return
    try {
      if (selectedAdjustment?.id === id) {
        dispatch(setSelectedStockAdjustment(null))
        setFocusedAdjustmentIndex(-1)
      }
      await deleteStockAdjustment(id).unwrap()
      showSuccess('Stock adjustment deleted successfully')
      refetchAdjustments()
    } catch (error: any) {
      showError(error?.data?.message || 'Failed to delete stock adjustment')
    } finally {
      setDeleteConfirmOpen(false)
      setAdjustmentToDelete(null)
      setAdjustmentToDeleteName('')
    }
  }, [
    deleteStockAdjustment,
    dispatch,
    refetchAdjustments,
    selectedAdjustment?.id,
    setAdjustmentToDelete,
    setAdjustmentToDeleteName,
    setDeleteConfirmOpen,
    setFocusedAdjustmentIndex,
    showError,
    showSuccess,
  ])

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmOpen(false)
    setAdjustmentToDelete(null)
    setAdjustmentToDeleteName('')
  }, [setAdjustmentToDelete, setAdjustmentToDeleteName, setDeleteConfirmOpen])

  const handleComplete = useCallback((id: string, adjustmentNumber: string) => {
    setAdjustmentToComplete(id)
    setAdjustmentToCompleteName(adjustmentNumber)
    setCompleteConfirmOpen(true)
  }, [setAdjustmentToComplete, setAdjustmentToCompleteName, setCompleteConfirmOpen])

  const handleConfirmComplete = useCallback(async (id: string | null) => {
    if (!id) return
    try {
      await completeStockAdjustment(id).unwrap()
      showSuccess('Stock adjustment completed successfully')
      refetchAdjustments()
      if (selectedAdjustment?.id === id) {
        const fresh = await fetchStockAdjustmentById(id).unwrap()
        dispatch(setSelectedStockAdjustment(fresh))
      }
    } catch (error: any) {
      showError(error?.data?.message || 'Failed to complete stock adjustment')
    } finally {
      setCompleteConfirmOpen(false)
      setAdjustmentToComplete(null)
      setAdjustmentToCompleteName('')
    }
  }, [
    completeStockAdjustment,
    dispatch,
    fetchStockAdjustmentById,
    refetchAdjustments,
    selectedAdjustment?.id,
    setAdjustmentToComplete,
    setAdjustmentToCompleteName,
    setCompleteConfirmOpen,
    showError,
    showSuccess,
  ])

  const handleCancelComplete = useCallback(() => {
    setCompleteConfirmOpen(false)
    setAdjustmentToComplete(null)
    setAdjustmentToCompleteName('')
  }, [setAdjustmentToComplete, setAdjustmentToCompleteName, setCompleteConfirmOpen])

  const handleRevert = useCallback((id: string, adjustmentNumber: string) => {
    setAdjustmentToRevert(id)
    setAdjustmentToRevertName(adjustmentNumber)
    setRevertConfirmOpen(true)
  }, [setAdjustmentToRevert, setAdjustmentToRevertName, setRevertConfirmOpen])

  const handleConfirmRevert = useCallback(async (id: string | null) => {
    if (!id) return
    try {
      await uncompleteStockAdjustment(id).unwrap()
      showSuccess('Stock adjustment reverted to draft successfully')
      refetchAdjustments()
      if (selectedAdjustment?.id === id) {
        const fresh = await fetchStockAdjustmentById(id).unwrap()
        dispatch(setSelectedStockAdjustment(fresh))
      }
    } catch (error: any) {
      showError(error?.data?.message || 'Failed to revert stock adjustment')
    } finally {
      setRevertConfirmOpen(false)
      setAdjustmentToRevert(null)
      setAdjustmentToRevertName('')
    }
  }, [
    dispatch,
    fetchStockAdjustmentById,
    refetchAdjustments,
    selectedAdjustment?.id,
    setAdjustmentToRevert,
    setAdjustmentToRevertName,
    setRevertConfirmOpen,
    showError,
    showSuccess,
    uncompleteStockAdjustment,
  ])

  const handleCancelRevert = useCallback(() => {
    setRevertConfirmOpen(false)
    setAdjustmentToRevert(null)
    setAdjustmentToRevertName('')
  }, [setAdjustmentToRevert, setAdjustmentToRevertName, setRevertConfirmOpen])

  return {
    handleEdit,
    handleDelete,
    handleConfirmDelete,
    handleCancelDelete,
    handleComplete,
    handleConfirmComplete,
    handleCancelComplete,
    handleRevert,
    handleConfirmRevert,
    handleCancelRevert,
  }
}
