import { useCallback } from 'react'

import type { AppDispatch } from '@/store'
import { useDeleteSupplierMutation } from '@/store/api/purchasingApi'
import { setSelectedSupplier } from '@/store/slices/purchasingSlice'
import type { Supplier } from '@/types'

interface UseSuppliersActionsParams {
  dispatch: AppDispatch
  selectedSupplier: Supplier | null
  refetchSuppliers: () => void
  showSuccess: (message: string) => void
  showError: (message: string) => void
  setDeleteConfirmOpen: (open: boolean) => void
  setPageError: (error: string | null) => void
}

export function useSuppliersActions({
  dispatch,
  selectedSupplier,
  refetchSuppliers,
  showSuccess,
  showError,
  setDeleteConfirmOpen,
  setPageError,
}: UseSuppliersActionsParams) {
  const [deleteSupplier] = useDeleteSupplierMutation()

  const handleDelete = useCallback(async () => {
    if (!selectedSupplier) return

    try {
      await deleteSupplier(selectedSupplier.id).unwrap()
      showSuccess(`Supplier "${selectedSupplier.companyName}" deleted successfully`)
      dispatch(setSelectedSupplier(null))
      setDeleteConfirmOpen(false)
      setPageError(null)
      refetchSuppliers()
    } catch (error: any) {
      const actualError = error?.payload || error
      const backendError = actualError?.response?.data
      let errorMessage = 'An unexpected error occurred. Please try again.'

      if (backendError?.message) {
        errorMessage = backendError.message
        if (backendError.suggestions?.length > 0) {
          errorMessage += `\n\nSuggestion: ${backendError.suggestions[0]}`
        }
      } else if (actualError?.message && actualError.message !== 'Request failed with status code 400') {
        errorMessage = actualError.message
      }

      setPageError(errorMessage)
      showError(errorMessage)
    }
  }, [deleteSupplier, dispatch, refetchSuppliers, selectedSupplier, setDeleteConfirmOpen, setPageError, showError, showSuccess])

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmOpen(false)
  }, [setDeleteConfirmOpen])

  return {
    handleDelete,
    handleCancelDelete,
  }
}
