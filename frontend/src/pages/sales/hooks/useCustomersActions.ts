import { useCallback } from 'react'

import type { AppDispatch } from '@/store'
import { useDeleteCustomerMutation } from '@/store/api/salesApi'
import { setSelectedCustomer } from '@/store/slices/salesSlice'
import type { Customer } from '@/types'

interface UseCustomersActionsParams {
  dispatch: AppDispatch
  selectedCustomer: Customer | null
  refetchCustomers: () => void
  showSuccess: (message: string) => void
  showError: (message: string) => void
  setDeleteConfirmOpen: (open: boolean) => void
  setPageError: (error: string | null) => void
}

export function useCustomersActions({
  dispatch,
  selectedCustomer,
  refetchCustomers,
  showSuccess,
  showError,
  setDeleteConfirmOpen,
  setPageError,
}: UseCustomersActionsParams) {
  const [deleteCustomer] = useDeleteCustomerMutation()

  const handleDelete = useCallback(async () => {
    if (!selectedCustomer) return

    try {
      await deleteCustomer(selectedCustomer.id).unwrap()
      showSuccess(`Customer "${selectedCustomer.name}" deleted successfully`)
      dispatch(setSelectedCustomer(null))
      setDeleteConfirmOpen(false)
      setPageError(null)
      refetchCustomers()
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
  }, [deleteCustomer, dispatch, refetchCustomers, selectedCustomer, setDeleteConfirmOpen, setPageError, showError, showSuccess])

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmOpen(false)
  }, [setDeleteConfirmOpen])

  return {
    handleDelete,
    handleCancelDelete,
  }
}
