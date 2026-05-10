import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useJournalEntryRef } from '@/hooks/useJournalEntryRef'
import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import type { AppDispatch } from '@/store'
import {
  useCompleteStockAdjustmentMutation,
  useDeleteStockAdjustmentMutation,
  useLazyGetStockAdjustmentQuery,
  useUncompleteStockAdjustmentMutation,
} from '@/store/api/inventoryApi'
import { setSelectedStockAdjustment } from '@/store/slices/inventorySlice'
import type { StockAdjustment } from '@/types'

export interface StockAdjustmentsJournalEntryRef {
  referenceNumber: string
  sourceType: string
  sourceId: string
}

export interface UseStockAdjustmentsWorkspaceConfig {
  dispatch: AppDispatch
  adjustments: StockAdjustment[]
  selectedAdjustment: StockAdjustment | null
  refetchAdjustments: () => void
}

export function useStockAdjustmentsWorkspace({
  dispatch,
  adjustments,
  selectedAdjustment,
  refetchAdjustments,
}: UseStockAdjustmentsWorkspaceConfig) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const [showDeletedDialog, setShowDeletedDialog] = useState(false)

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [adjustmentToDelete, setAdjustmentToDelete] = useState<string | null>(null)
  const [adjustmentToDeleteName, setAdjustmentToDeleteName] = useState('')

  const [completeConfirmOpen, setCompleteConfirmOpen] = useState(false)
  const [adjustmentToComplete, setAdjustmentToComplete] = useState<string | null>(null)
  const [adjustmentToCompleteName, setAdjustmentToCompleteName] = useState('')

  const [revertConfirmOpen, setRevertConfirmOpen] = useState(false)
  const [adjustmentToRevert, setAdjustmentToRevert] = useState<string | null>(null)
  const [adjustmentToRevertName, setAdjustmentToRevertName] = useState('')

  const userHasNavigatedRef = useRef(false)

  const [fetchAdjustment] = useLazyGetStockAdjustmentQuery()
  const [deleteStockAdjustment] = useDeleteStockAdjustmentMutation()
  const [completeStockAdjustment] = useCompleteStockAdjustmentMutation()
  const [uncompleteStockAdjustment] = useUncompleteStockAdjustmentMutation()

  const workspace = useEntityWorkspace({
    entities: adjustments,
    selectedEntity: selectedAdjustment,
    selectEntity: (adjustment) => dispatch(setSelectedStockAdjustment(adjustment)),
    refetch: refetchAdjustments,
    navigate,
    routes: {
      create: '/inventory/stock-adjustments/create',
      edit: (id) => {
        const adjustment = adjustments.find((item) => item.id === id)
        if (!adjustment?.adjustmentNumber) throw new Error(`Stock adjustment ${id} not found in list`)
        return `/inventory/stock-adjustments/${adjustment.adjustmentNumber}/edit`
      },
    },
    highlightParam: 'highlight',
    notifications: { showSuccess, showError },
    deleteMutation: async (id) => {
      await deleteStockAdjustment(id).unwrap()
    },
  })
  const { setFocusedIndex } = workspace

  const { journalEntryRef, journalEntryRefLoading } = useJournalEntryRef([
    { sourceType: 'stock_adjustment', sourceId: selectedAdjustment?.id },
  ])

  const handleSelect = useCallback(
    async (adjustment: StockAdjustment) => {
      workspace.handleSelect(adjustment)
      userHasNavigatedRef.current = true

      try {
        const fresh = await fetchAdjustment(adjustment.id).unwrap()
        dispatch(setSelectedStockAdjustment(fresh))
      } catch {
        dispatch(setSelectedStockAdjustment(adjustment))
      }
    },
    [dispatch, fetchAdjustment, workspace],
  )

  const handleEdit = useCallback(() => {
    if (!selectedAdjustment) return
    if (selectedAdjustment.status !== 'draft') {
      showError('Only draft adjustments can be edited')
      return
    }

    navigate(`/inventory/stock-adjustments/${selectedAdjustment.adjustmentNumber}/edit`)
  }, [navigate, selectedAdjustment, showError])

  const handleDelete = useCallback((id: string, adjustmentNumber: string) => {
    setAdjustmentToDelete(id)
    setAdjustmentToDeleteName(adjustmentNumber)
    setDeleteConfirmOpen(true)
  }, [])

  const handleConfirmDelete = useCallback(
    async (id: string | null) => {
      if (!id) return

      try {
        if (selectedAdjustment?.id === id) {
          dispatch(setSelectedStockAdjustment(null))
          setFocusedIndex(-1)
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
    },
    [
      deleteStockAdjustment,
      dispatch,
      refetchAdjustments,
      selectedAdjustment?.id,
      setFocusedIndex,
      showError,
      showSuccess,
    ],
  )

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmOpen(false)
    setAdjustmentToDelete(null)
    setAdjustmentToDeleteName('')
  }, [])

  const handleComplete = useCallback((id: string, adjustmentNumber: string) => {
    setAdjustmentToComplete(id)
    setAdjustmentToCompleteName(adjustmentNumber)
    setCompleteConfirmOpen(true)
  }, [])

  const handleConfirmComplete = useCallback(
    async (id: string | null) => {
      if (!id) return

      try {
        await completeStockAdjustment(id).unwrap()
        showSuccess('Stock adjustment completed successfully')
        refetchAdjustments()
        if (selectedAdjustment?.id === id) {
          const fresh = await fetchAdjustment(id).unwrap()
          dispatch(setSelectedStockAdjustment(fresh))
        }
      } catch (error: any) {
        showError(error?.data?.message || 'Failed to complete stock adjustment')
      } finally {
        setCompleteConfirmOpen(false)
        setAdjustmentToComplete(null)
        setAdjustmentToCompleteName('')
      }
    },
    [
      completeStockAdjustment,
      dispatch,
      fetchAdjustment,
      refetchAdjustments,
      selectedAdjustment?.id,
      showError,
      showSuccess,
    ],
  )

  const handleCancelComplete = useCallback(() => {
    setCompleteConfirmOpen(false)
    setAdjustmentToComplete(null)
    setAdjustmentToCompleteName('')
  }, [])

  const handleRevert = useCallback((id: string, adjustmentNumber: string) => {
    setAdjustmentToRevert(id)
    setAdjustmentToRevertName(adjustmentNumber)
    setRevertConfirmOpen(true)
  }, [])

  const handleConfirmRevert = useCallback(
    async (id: string | null) => {
      if (!id) return

      try {
        await uncompleteStockAdjustment(id).unwrap()
        showSuccess('Stock adjustment reverted to draft successfully')
        refetchAdjustments()
        if (selectedAdjustment?.id === id) {
          const fresh = await fetchAdjustment(id).unwrap()
          dispatch(setSelectedStockAdjustment(fresh))
        }
      } catch (error: any) {
        showError(error?.data?.message || 'Failed to revert stock adjustment')
      } finally {
        setRevertConfirmOpen(false)
        setAdjustmentToRevert(null)
        setAdjustmentToRevertName('')
      }
    },
    [
      dispatch,
      fetchAdjustment,
      refetchAdjustments,
      selectedAdjustment?.id,
      showError,
      showSuccess,
      uncompleteStockAdjustment,
    ],
  )

  const handleCancelRevert = useCallback(() => {
    setRevertConfirmOpen(false)
    setAdjustmentToRevert(null)
    setAdjustmentToRevertName('')
  }, [])

  return {
    ...workspace,
    handleSelect,
    showDeletedDialog,
    setShowDeletedDialog,
    journalEntryRef,
    journalEntryRefLoading,
    deleteConfirmOpen,
    adjustmentToDelete,
    adjustmentToDeleteName,
    completeConfirmOpen,
    adjustmentToComplete,
    adjustmentToCompleteName,
    revertConfirmOpen,
    adjustmentToRevert,
    adjustmentToRevertName,
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
