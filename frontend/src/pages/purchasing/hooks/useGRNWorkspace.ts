import { useEffect, useRef, useState } from 'react'
import { useNavigate, type SetURLSearchParams } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import type { AppDispatch } from '@/store'
import { useLazyGetJournalEntriesQuery } from '@/store/api/accountingApi'
import { useLazyGetGoodsReceivedNoteQuery } from '@/store/api/purchasingApi'
import { setSelectedGRN } from '@/store/slices/purchasingSlice'
import type { GoodsReceivedNote } from '@/types'

export interface GRNJournalEntryRef {
  referenceNumber: string
  sourceType: string
  sourceId: string
}

export interface UseGRNWorkspaceConfig {
  dispatch: AppDispatch
  grns: GoodsReceivedNote[]
  selectedGRN: GoodsReceivedNote | null
  refetch: () => void
  searchParams: URLSearchParams
  setSearchParams: SetURLSearchParams
  sorting: { sortBy: string; sortOrder: 'asc' | 'desc' }
  setSorting: (sorting: { sortBy: string; sortOrder: 'asc' | 'desc' }) => void
}

export function useGRNWorkspace({
  dispatch,
  grns,
  selectedGRN,
  refetch,
  searchParams,
  setSearchParams,
}: UseGRNWorkspaceConfig) {
  const navigate = useNavigate()
  const [deletedGRNsOpen, setDeletedGRNsOpen] = useState(false)
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [journalEntryRef, setJournalEntryRef] = useState<GRNJournalEntryRef | null>(null)
  const [journalEntryRefLoading, setJournalEntryRefLoading] = useState(false)
  const userHasNavigatedRef = useRef(false)
  const [fetchJournalEntries] = useLazyGetJournalEntriesQuery()
  const [fetchGRN] = useLazyGetGoodsReceivedNoteQuery()

  const workspace = useEntityWorkspace({
    entities: grns,
    selectedEntity: selectedGRN,
    selectEntity: (grn) => dispatch(setSelectedGRN(grn)),
    refetch,
    navigate,
    routes: {
      create: '/purchasing/grn/create',
      edit: (id) => `/purchasing/grn/${id}/edit`,
    },
    notifications: { showSuccess: () => {}, showError: () => {} },
    deleteMutation: async () => {},
  })
  const { setFocusedIndex } = workspace

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
        const response = await fetchJournalEntries({
          sourceType: 'goods_received_note',
          sourceId: selectedGRN.id,
          sortBy: 'createdAt',
          sortOrder: 'DESC',
          limit: 1,
        }).unwrap()

        if (cancelled) return

        const entry = response.data?.[0]
        setJournalEntryRef(
          entry
            ? {
                referenceNumber: entry.referenceNumber,
                sourceType: 'goods_received_note',
                sourceId: selectedGRN.id,
              }
            : null,
        )
      } catch {
        if (!cancelled) {
          setJournalEntryRef(null)
        }
      } finally {
        if (!cancelled) {
          setJournalEntryRefLoading(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [fetchJournalEntries, selectedGRN?.id])

  useEffect(() => {
    const grnId = searchParams.get('grnId')
    if (!grnId || userHasNavigatedRef.current || grns.length === 0) {
      return
    }

    const grn = grns.find((item) => item.id === grnId)
    if (grn) {
      dispatch(setSelectedGRN(grn))
      setFocusedIndex(grns.findIndex((item) => item.id === grn.id))
      setSearchParams((prev) => {
        prev.delete('grnId')
        return prev
      }, { replace: true })
      userHasNavigatedRef.current = true
    }
  }, [dispatch, grns, searchParams, setFocusedIndex, setSearchParams])

  const handleSelect = async (grn: GoodsReceivedNote) => {
    workspace.handleSelect(grn)
    userHasNavigatedRef.current = true

    try {
      const freshGRN = await fetchGRN(grn.id).unwrap()
      dispatch(setSelectedGRN(freshGRN))
    } catch {
      dispatch(setSelectedGRN(grn))
    }
  }

  return {
    ...workspace,
    handleSelect,
    deletedGRNsOpen,
    setDeletedGRNsOpen,
    printDialogOpen,
    setPrintDialogOpen,
    journalEntryRef,
    journalEntryRefLoading,
    userHasNavigatedRef,
  }
}
