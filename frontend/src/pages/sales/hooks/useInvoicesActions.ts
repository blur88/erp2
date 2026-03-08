import { useCallback } from 'react'

import type { InvoiceListItem } from './useInvoicesPageState'

interface UseInvoicesActionsParams {
  selectedInvoice: InvoiceListItem | null
  showError: (message: string) => void
  setCreateDialog: (open: boolean) => void
  setEditDialog: (open: boolean) => void
  setDeletedInvoicesDialogOpen: (open: boolean) => void
}

export function useInvoicesActions({
  selectedInvoice,
  showError,
  setCreateDialog,
  setEditDialog,
  setDeletedInvoicesDialogOpen,
}: UseInvoicesActionsParams) {
  const handleEditAction = useCallback(() => {
    if (selectedInvoice) {
      setEditDialog(true)
    }
  }, [selectedInvoice, setEditDialog])

  const handleDeleteAction = useCallback(() => {
    if (selectedInvoice) {
      showError('Delete functionality will be implemented later')
    }
  }, [selectedInvoice, showError])

  const handleViewDeletedAction = useCallback(() => {
    setDeletedInvoicesDialogOpen(true)
  }, [setDeletedInvoicesDialogOpen])

  const handleAddInvoice = useCallback(() => {
    setCreateDialog(true)
  }, [setCreateDialog])

  return {
    handleEditAction,
    handleDeleteAction,
    handleViewDeletedAction,
    handleAddInvoice,
  }
}
