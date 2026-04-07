import { useRef, useState } from 'react'

export function useCustomersPageState() {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletedCustomersDialogOpen, setDeletedCustomersDialogOpen] = useState(false)
  const [focusedCustomerIndex, setFocusedCustomerIndex] = useState(-1)
  const [shouldPreserveSearchFocus, setShouldPreserveSearchFocus] = useState(false)

  const customerListRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  return {
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    deletedCustomersDialogOpen,
    setDeletedCustomersDialogOpen,
    focusedCustomerIndex,
    setFocusedCustomerIndex,
    shouldPreserveSearchFocus,
    setShouldPreserveSearchFocus,
    customerListRef,
    searchInputRef,
  }
}
