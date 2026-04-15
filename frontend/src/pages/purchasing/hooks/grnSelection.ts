import { useCallback, useEffect, type MutableRefObject, type RefObject } from 'react'
import type { SetURLSearchParams } from 'react-router-dom'

import { useLazyGetJournalEntriesQuery } from '@/store/api/accountingApi'
import { useLazyGetGoodsReceivedNoteQuery } from '@/store/api/purchasingApi'
import { setSelectedGRN } from '@/store/slices/purchasingSlice'
import type { AppDispatch } from '@/store'
import type { GoodsReceivedNote } from '@/types'

import type { GRNJournalEntryRef } from './grnPageState'

interface UseGRNSelectionParams {
  dispatch: AppDispatch
  grns: GoodsReceivedNote[]
  selectedGRN: GoodsReceivedNote | null
  focusedGRNIndex: number
  setFocusedGRNIndex: (index: number) => void
  searchParams: URLSearchParams
  setSearchParams: SetURLSearchParams
  grnListRef: RefObject<HTMLDivElement | null>
  searchInputRef: RefObject<HTMLInputElement | null>
  userHasNavigatedRef: MutableRefObject<boolean>
  setJournalEntryRef: (value: GRNJournalEntryRef | null) => void
  setJournalEntryRefLoading: (value: boolean) => void
}

export function useGRNSelection({
  dispatch,
  grns,
  selectedGRN,
  focusedGRNIndex,
  setFocusedGRNIndex,
  searchParams,
  setSearchParams,
  grnListRef,
  searchInputRef,
  userHasNavigatedRef,
  setJournalEntryRef,
  setJournalEntryRefLoading,
}: UseGRNSelectionParams) {
  const [fetchGRN] = useLazyGetGoodsReceivedNoteQuery()
  const [fetchJournalEntries] = useLazyGetJournalEntriesQuery()

  useEffect(() => {
    if (!selectedGRN?.id) {
      setJournalEntryRef(null)
      setJournalEntryRefLoading(false)
      return
    }

    let cancelled = false
    setJournalEntryRefLoading(true)

    ;(async () => {
      try {
        const res = await fetchJournalEntries({
          sourceType: 'goods_received_note',
          sourceId: selectedGRN.id,
          sortBy: 'createdAt',
          sortOrder: 'DESC',
          limit: 1,
        }).unwrap()

        if (cancelled) return

        const entry = res.data?.[0]
        if (entry) {
          setJournalEntryRef({
            referenceNumber: entry.referenceNumber,
            sourceType: 'goods_received_note',
            sourceId: selectedGRN.id,
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
  }, [fetchJournalEntries, selectedGRN?.id, setJournalEntryRef, setJournalEntryRefLoading])

  useEffect(() => {
    const grnId = searchParams.get('grnId')
    if (grnId && grns.length > 0) {
      const grn = grns.find((item) => item.id === grnId)
      if (grn) {
        dispatch(setSelectedGRN(grn))
        const index = grns.findIndex((item) => item.id === grn.id)
        setFocusedGRNIndex(index)
        setSearchParams((prev) => {
          prev.delete('grnId')
          return prev
        }, { replace: true })
      }
    }
  }, [dispatch, grns, searchParams, setFocusedGRNIndex, setSearchParams])

  useEffect(() => {
    if (grns.length > 0 && focusedGRNIndex === -1) {
      if (selectedGRN) {
        const index = grns.findIndex((item) => item.id === selectedGRN.id)
        setFocusedGRNIndex(index >= 0 ? index : 0)
      } else if (searchInputRef.current !== document.activeElement) {
        const grnId = searchParams.get('grnId')
        if (!grnId) {
          setFocusedGRNIndex(0)
          dispatch(setSelectedGRN(grns[0]))
        }
      }
    }
  }, [dispatch, focusedGRNIndex, grns, searchInputRef, searchParams, selectedGRN, setFocusedGRNIndex])

  useEffect(() => {
    if (grns.length === 0 && selectedGRN) {
      dispatch(setSelectedGRN(null))
      setFocusedGRNIndex(-1)
    }
  }, [dispatch, grns.length, selectedGRN, setFocusedGRNIndex])

  useEffect(() => {
    if (focusedGRNIndex >= 0 && grnListRef.current) {
      const row = grnListRef.current.querySelector(`[data-grn-index="${focusedGRNIndex}"]`)
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [focusedGRNIndex, grnListRef])

  const handleGRNSelect = useCallback(async (grn: GoodsReceivedNote) => {
    const index = grns.findIndex((item) => item.id === grn.id)
    setFocusedGRNIndex(index)
    userHasNavigatedRef.current = true

    try {
      const freshGRN = await fetchGRN(grn.id).unwrap()
      dispatch(setSelectedGRN(freshGRN))
    } catch {
      dispatch(setSelectedGRN(grn))
    }
  }, [dispatch, fetchGRN, grns, setFocusedGRNIndex, userHasNavigatedRef])

  const handleNavigateUp = useCallback(() => {
    if (focusedGRNIndex > 0) {
      const newIndex = focusedGRNIndex - 1
      setFocusedGRNIndex(newIndex)
      dispatch(setSelectedGRN(grns[newIndex]))
      userHasNavigatedRef.current = true
    }
  }, [dispatch, focusedGRNIndex, grns, setFocusedGRNIndex, userHasNavigatedRef])

  const handleNavigateDown = useCallback(() => {
    if (focusedGRNIndex < grns.length - 1) {
      const newIndex = focusedGRNIndex + 1
      setFocusedGRNIndex(newIndex)
      dispatch(setSelectedGRN(grns[newIndex]))
      userHasNavigatedRef.current = true
    }
  }, [dispatch, focusedGRNIndex, grns, setFocusedGRNIndex, userHasNavigatedRef])

  const focusSearchInput = useCallback(() => {
    searchInputRef.current?.focus()
  }, [searchInputRef])

  return {
    handleGRNSelect,
    handleNavigateUp,
    handleNavigateDown,
    focusSearchInput,
  }
}
