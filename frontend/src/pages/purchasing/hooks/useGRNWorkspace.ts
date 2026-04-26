import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useJournalEntryRef } from '@/hooks/useJournalEntryRef'
import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import type { AppDispatch } from '@/store'
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
  sorting: { sortBy: string; sortOrder: 'asc' | 'desc' }
  setSorting: (sorting: { sortBy: string; sortOrder: 'asc' | 'desc' }) => void
}

export function useGRNWorkspace({
  dispatch,
  grns,
  selectedGRN,
  refetch,
}: UseGRNWorkspaceConfig) {
  const navigate = useNavigate()
  const [deletedGRNsOpen, setDeletedGRNsOpen] = useState(false)
  const [printDialogOpen, setPrintDialogOpen] = useState(false)
  const [fetchGRN] = useLazyGetGoodsReceivedNoteQuery()

  const workspace = useEntityWorkspace({
    entities: grns,
    selectedEntity: selectedGRN,
    selectEntity: (grn) => dispatch(setSelectedGRN(grn)),
    refetch,
    navigate,
    highlightParam: 'grnId',
    routes: {
      create: '/purchasing/grn/create',
      edit: (id) => `/purchasing/grn/${id}/edit`,
    },
    notifications: { showSuccess: () => {}, showError: () => {} },
    deleteMutation: async () => {},
  })

  const { journalEntryRef, journalEntryRefLoading } = useJournalEntryRef([
    { sourceType: 'goods_received_note', sourceId: selectedGRN?.id },
  ])

  const handleSelect = async (grn: GoodsReceivedNote) => {
    workspace.handleSelect(grn)

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
  }
}
