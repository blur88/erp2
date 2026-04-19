import { useCallback, useRef, useState } from 'react'
import { useNotification } from '@/hooks/useNotification'
import { useDeleteAccountMappingMutation } from '@/store/api/accountingApi'
import type { AccountMapping } from '@/types/accountMapping'

export function useAccountMappingsWorkspace(refetchMappings: () => Promise<any> | any, refetchValidation: () => Promise<any> | any) {
  const { showSuccess, showError } = useNotification()
  const [selected, setSelected] = useState<AccountMapping | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [selectedMapping, setSelectedMapping] = useState<AccountMapping | null>(null)
  const [selectedMappingType, setSelectedMappingType] = useState<string | null>(null)
  const [mappingToClear, setMappingToClear] = useState<AccountMapping | null>(null)
  const [clearing, setClearing] = useState(false)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const [deleteAccountMapping] = useDeleteAccountMappingMutation()

  const handleClear = useCallback(async () => {
    if (!mappingToClear) return
    try {
      setClearing(true)
      await deleteAccountMapping(mappingToClear.id).unwrap()
      await refetchMappings()
      await refetchValidation()
      showSuccess(`Mapping "${mappingToClear.mappingType}" cleared successfully`)
      if (selected?.id === mappingToClear.id) setSelected(null)
    } catch (err: any) {
      showError(err || 'Failed to clear mapping')
    } finally {
      setClearing(false)
      setMappingToClear(null)
    }
  }, [deleteAccountMapping, mappingToClear, refetchMappings, refetchValidation, selected?.id, showError, showSuccess])

  return { selected, setSelected, dialogOpen, setDialogOpen, selectedMapping, setSelectedMapping, selectedMappingType, setSelectedMappingType, mappingToClear, setMappingToClear, clearing, searchInputRef, listRef, handleClear }
}
