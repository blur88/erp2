import { useCallback, useEffect, type MutableRefObject, type RefObject } from 'react'
import type { SetURLSearchParams } from 'react-router-dom'

import { useLazyGetJournalEntriesQuery } from '@/store/api/accountingApi'
import { useLazyGetStockAdjustmentQuery } from '@/store/api/inventoryApi'
import type { AppDispatch } from '@/store'
import { setSelectedStockAdjustment } from '@/store/slices/inventorySlice'
import type { StockAdjustment } from '@/types'

import type { StockAdjustmentsJournalEntryRef } from './stockAdjustmentsPageState'

interface UseStockAdjustmentsSelectionParams {
  dispatch: AppDispatch
  adjustments: StockAdjustment[]
  selectedAdjustment: StockAdjustment | null
  focusedAdjustmentIndex: number
  setFocusedAdjustmentIndex: (index: number) => void
  searchParams: URLSearchParams
  setSearchParams: SetURLSearchParams
  adjustmentListRef: RefObject<HTMLDivElement | null>
  searchInputRef: RefObject<HTMLInputElement | null>
  userHasNavigatedRef: MutableRefObject<boolean>
  setJournalEntryRef: (value: StockAdjustmentsJournalEntryRef | null) => void
  setJournalEntryRefLoading: (value: boolean) => void
}

export function useStockAdjustmentsSelection({
  dispatch,
  adjustments,
  selectedAdjustment,
  focusedAdjustmentIndex,
  setFocusedAdjustmentIndex,
  searchParams,
  setSearchParams,
  adjustmentListRef,
  searchInputRef,
  userHasNavigatedRef,
  setJournalEntryRef,
  setJournalEntryRefLoading,
}: UseStockAdjustmentsSelectionParams) {
  const [fetchAdjustment] = useLazyGetStockAdjustmentQuery()
  const [fetchJournalEntries] = useLazyGetJournalEntriesQuery()

  useEffect(() => {
    if (!selectedAdjustment?.id) {
      setJournalEntryRef(null)
      setJournalEntryRefLoading(false)
      return
    }

    let cancelled = false
    setJournalEntryRefLoading(true)

    ;(async () => {
      try {
        const res = await fetchJournalEntries({
          sourceType: 'stock_adjustment',
          sourceId: selectedAdjustment.id,
          sortBy: 'createdAt',
          sortOrder: 'DESC',
          limit: 1,
        }).unwrap()

        if (cancelled) return

        const entry = res.data?.[0]
        if (entry) {
          setJournalEntryRef({
            referenceNumber: entry.referenceNumber,
            sourceType: 'stock_adjustment',
            sourceId: selectedAdjustment.id,
          })
        } else {
          setJournalEntryRef(null)
        }
      } catch {
        if (!cancelled) setJournalEntryRef(null)
      } finally {
        if (!cancelled) setJournalEntryRefLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [fetchJournalEntries, selectedAdjustment?.id, setJournalEntryRef, setJournalEntryRefLoading])

  useEffect(() => {
    const saId = searchParams.get('saId')
    if (saId && adjustments.length > 0) {
      const adjustment = adjustments.find((item) => item.id === saId)
      if (adjustment) {
        dispatch(setSelectedStockAdjustment(adjustment))
        const index = adjustments.findIndex((item) => item.id === saId)
        setFocusedAdjustmentIndex(index)
        setSearchParams((prev) => {
          prev.delete('saId')
          return prev
        }, { replace: true })
        void fetchAdjustment(saId)
          .unwrap()
          .then((fresh) => {
            dispatch(setSelectedStockAdjustment(fresh))
          })
          .catch(() => {
            // Keep the lightweight list item selected when detail fetch fails.
          })
      }
    }
  }, [adjustments, dispatch, fetchAdjustment, searchParams, setFocusedAdjustmentIndex, setSearchParams])

  useEffect(() => {
    if (adjustments.length > 0 && focusedAdjustmentIndex === -1) {
      if (selectedAdjustment) {
        const index = adjustments.findIndex((item) => item.id === selectedAdjustment.id)
        setFocusedAdjustmentIndex(index >= 0 ? index : 0)
      } else if (searchInputRef.current !== document.activeElement) {
        const saId = searchParams.get('saId')
        if (!saId) {
          setFocusedAdjustmentIndex(0)
          dispatch(setSelectedStockAdjustment(adjustments[0]))
          void fetchAdjustment(adjustments[0].id)
            .unwrap()
            .then((fresh) => {
              dispatch(setSelectedStockAdjustment(fresh))
            })
            .catch(() => {})
        }
      }
    }
  }, [
    adjustments,
    dispatch,
    fetchAdjustment,
    focusedAdjustmentIndex,
    searchInputRef,
    searchParams,
    selectedAdjustment,
    setFocusedAdjustmentIndex,
  ])

  useEffect(() => {
    if (adjustments.length === 0 && selectedAdjustment) {
      dispatch(setSelectedStockAdjustment(null))
      setFocusedAdjustmentIndex(-1)
    }
  }, [adjustments.length, dispatch, selectedAdjustment, setFocusedAdjustmentIndex])

  useEffect(() => {
    if (focusedAdjustmentIndex >= 0 && adjustmentListRef.current) {
      const row = adjustmentListRef.current.querySelector(`[data-adjustment-index="${focusedAdjustmentIndex}"]`)
      if (row instanceof HTMLElement && typeof row.scrollIntoView === 'function') {
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [focusedAdjustmentIndex, adjustmentListRef])

  const handleAdjustmentSelect = useCallback(async (adjustment: StockAdjustment) => {
    const index = adjustments.findIndex((item) => item.id === adjustment.id)
    setFocusedAdjustmentIndex(index)
    userHasNavigatedRef.current = true

    try {
      const fresh = await fetchAdjustment(adjustment.id).unwrap()
      dispatch(setSelectedStockAdjustment(fresh))
    } catch {
      dispatch(setSelectedStockAdjustment(adjustment))
    }
  }, [adjustments, dispatch, fetchAdjustment, setFocusedAdjustmentIndex, userHasNavigatedRef])

  const handleNavigateUp = useCallback(() => {
    if (focusedAdjustmentIndex > 0) {
      const newIndex = focusedAdjustmentIndex - 1
      setFocusedAdjustmentIndex(newIndex)
      dispatch(setSelectedStockAdjustment(adjustments[newIndex]))
      userHasNavigatedRef.current = true
    }
  }, [adjustments, dispatch, focusedAdjustmentIndex, setFocusedAdjustmentIndex, userHasNavigatedRef])

  const handleNavigateDown = useCallback(() => {
    if (focusedAdjustmentIndex < adjustments.length - 1) {
      const newIndex = focusedAdjustmentIndex + 1
      setFocusedAdjustmentIndex(newIndex)
      dispatch(setSelectedStockAdjustment(adjustments[newIndex]))
      userHasNavigatedRef.current = true
    }
  }, [adjustments, dispatch, focusedAdjustmentIndex, setFocusedAdjustmentIndex, userHasNavigatedRef])

  const focusSearchInput = useCallback(() => {
    searchInputRef.current?.focus()
  }, [searchInputRef])

  return {
    handleAdjustmentSelect,
    handleNavigateUp,
    handleNavigateDown,
    focusSearchInput,
  }
}
