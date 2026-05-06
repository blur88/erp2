import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import type { AppDispatch } from '@/store'
import { useDeleteAccountMappingMutation } from '@/store/api/accountingApi'
import { setSelectedAccountMapping } from '@/store/slices/accountingSlice'
import type { AccountMapping } from '@/types/accountMapping'
import type { MappingRow } from '../components/AccountMappingsTable'

export function useAccountMappingsWorkspace(
  refetchMappings: () => Promise<any> | any,
  refetchValidation: () => Promise<any> | any,
  rows: MappingRow[],
  selected: AccountMapping | null,
  dispatch: AppDispatch,
) {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedMapping, setSelectedMapping] = useState<AccountMapping | null>(null)
  const [selectedMappingType, setSelectedMappingType] = useState<string | null>(null)
  const [mappingToClear, setMappingToClear] = useState<AccountMapping | null>(null)
  const [clearing, setClearing] = useState(false)
  const workspaceRef = useRef<ReturnType<typeof useEntityWorkspace<MappingRow>> | null>(null)

  const [deleteAccountMapping] = useDeleteAccountMappingMutation()

  const openDialogForRow = useCallback((row: MappingRow) => {
    setSelectedMapping(row.mapping ?? null)
    setSelectedMappingType(row.mapping ? null : row.mappingType)
    setDialogOpen(true)
  }, [])

  const workspace = useEntityWorkspace<MappingRow>({
    entities: rows,
    selectedEntity: rows.find((row) => row.mapping?.id === selected?.id) ?? null,
    selectEntity: (row) => dispatch(setSelectedAccountMapping(row?.mapping ?? null)),
    refetch: () => { void refetchMappings() },
    navigate,
    routes: {
      create: '/accounting/account-mappings',
      edit: () => '/accounting/account-mappings',
    },
    onEnter: () => {
      const focusedIndex = workspaceRef.current?.focusedIndex ?? -1
      const focusedRow = focusedIndex >= 0 ? rows[focusedIndex] : null
      if (focusedRow) openDialogForRow(focusedRow)
    },
    onEscape: () => {
      workspaceRef.current?.setFocusedIndex(-1)
      dispatch(setSelectedAccountMapping(null))
      setMappingToClear(null)
    },
  })
  workspaceRef.current = workspace

  const handleClear = useCallback(async () => {
    if (!mappingToClear) return
    try {
      setClearing(true)
      await deleteAccountMapping(mappingToClear.id).unwrap()
      await refetchMappings()
      await refetchValidation()
      showSuccess(`Mapping "${mappingToClear.mappingType}" cleared successfully`)
      if (selected?.id === mappingToClear.id) dispatch(setSelectedAccountMapping(null))
    } catch (err: any) {
      showError(err?.data?.message || err?.message || 'Failed to clear mapping')
    } finally {
      setClearing(false)
      setMappingToClear(null)
    }
  }, [deleteAccountMapping, dispatch, mappingToClear, refetchMappings, refetchValidation, selected?.id, showError, showSuccess])

  return {
    focusedIndex: workspace.focusedIndex,
    listRef: workspace.listRef,
    searchInputRef: workspace.searchInputRef,
    handleSelect: workspace.handleSelect,
    dialogOpen,
    setDialogOpen,
    selectedMapping,
    setSelectedMapping,
    selectedMappingType,
    setSelectedMappingType,
    mappingToClear,
    setMappingToClear,
    clearing,
    openDialogForRow,
    handleClear,
  }
}
