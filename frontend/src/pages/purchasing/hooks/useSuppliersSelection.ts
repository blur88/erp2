import { useCallback, useEffect, useRef, type RefObject } from 'react'
import type { NavigateFunction } from 'react-router-dom'

import type { AppDispatch } from '@/store'
import { setSelectedSupplier } from '@/store/slices/purchasingSlice'
import type { Supplier } from '@/types'

interface UseSuppliersSelectionParams {
  dispatch: AppDispatch
  suppliers: Supplier[]
  selectedSupplier: Supplier | null
  focusedSupplierIndex: number
  setFocusedSupplierIndex: (index: number) => void
  navigate: NavigateFunction
  supplierListRef: RefObject<HTMLDivElement | null>
  setDeleteConfirmOpen: (open: boolean) => void
  setDeletedSuppliersDialogOpen: (open: boolean) => void
}

export function useSuppliersSelection({
  dispatch,
  suppliers,
  selectedSupplier,
  focusedSupplierIndex,
  setFocusedSupplierIndex,
  navigate,
  supplierListRef,
  setDeleteConfirmOpen,
  setDeletedSuppliersDialogOpen,
}: UseSuppliersSelectionParams) {
  const hasAutoSelected = useRef(false)

  useEffect(() => {
    if (suppliers.length > 0 && !hasAutoSelected.current && focusedSupplierIndex === -1 && !selectedSupplier) {
      hasAutoSelected.current = true
      setFocusedSupplierIndex(0)
      dispatch(setSelectedSupplier(suppliers[0]))
    } else if (suppliers.length === 0) {
      dispatch(setSelectedSupplier(null))
      setFocusedSupplierIndex(-1)
    }
  }, [suppliers, dispatch, focusedSupplierIndex, selectedSupplier, setFocusedSupplierIndex])

  useEffect(() => {
    if (focusedSupplierIndex >= 0 && supplierListRef.current) {
      const focusedRow = supplierListRef.current.querySelector(`[data-supplier-index="${focusedSupplierIndex}"]`)
      if (focusedRow) {
        focusedRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [focusedSupplierIndex, supplierListRef])

  const handleSupplierSelect = useCallback((supplier: Supplier) => {
    const index = suppliers.findIndex((candidate) => candidate.id === supplier.id)
    setFocusedSupplierIndex(index)
    dispatch(setSelectedSupplier(supplier))
  }, [suppliers, dispatch, setFocusedSupplierIndex])

  const selectAtIndex = useCallback((index: number) => {
    setFocusedSupplierIndex(index)
    dispatch(setSelectedSupplier(suppliers[index]))
  }, [suppliers, dispatch, setFocusedSupplierIndex])

  const handleNavigateUp = useCallback(() => {
    if (focusedSupplierIndex > 0) {
      selectAtIndex(focusedSupplierIndex - 1)
    }
  }, [focusedSupplierIndex, selectAtIndex])

  const handleNavigateDown = useCallback(() => {
    if (focusedSupplierIndex < suppliers.length - 1) {
      selectAtIndex(focusedSupplierIndex + 1)
    }
  }, [focusedSupplierIndex, suppliers.length, selectAtIndex])

  const handleNavigateToFirst = useCallback(() => {
    if (suppliers.length > 0) {
      selectAtIndex(0)
    }
  }, [suppliers.length, selectAtIndex])

  const handleNavigateToLast = useCallback(() => {
    if (suppliers.length > 0) {
      selectAtIndex(suppliers.length - 1)
    }
  }, [suppliers.length, selectAtIndex])

  const handlePageUpNavigation = useCallback(() => {
    const newIndex = Math.max(0, focusedSupplierIndex - 20)
    if (suppliers[newIndex]) {
      selectAtIndex(newIndex)
    }
  }, [focusedSupplierIndex, suppliers, selectAtIndex])

  const handlePageDownNavigation = useCallback(() => {
    const newIndex = Math.min(suppliers.length - 1, focusedSupplierIndex + 20)
    if (suppliers[newIndex]) {
      selectAtIndex(newIndex)
    }
  }, [focusedSupplierIndex, suppliers, selectAtIndex])

  const handleEnterAction = useCallback(() => {
    if (focusedSupplierIndex >= 0 && suppliers[focusedSupplierIndex]) {
      navigate(`/purchasing/suppliers/${suppliers[focusedSupplierIndex].id}/edit`)
    }
  }, [focusedSupplierIndex, suppliers, navigate])

  const handleEscapeAction = useCallback(() => {
    setFocusedSupplierIndex(-1)
    dispatch(setSelectedSupplier(null))
    setDeleteConfirmOpen(false)
    setDeletedSuppliersDialogOpen(false)
  }, [dispatch, setDeleteConfirmOpen, setDeletedSuppliersDialogOpen, setFocusedSupplierIndex])

  return {
    handleSupplierSelect,
    handleNavigateUp,
    handleNavigateDown,
    handleNavigateToFirst,
    handleNavigateToLast,
    handlePageUpNavigation,
    handlePageDownNavigation,
    handleEnterAction,
    handleEscapeAction,
  }
}
