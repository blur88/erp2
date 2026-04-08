import { useRef, useState } from 'react'

export function useSuppliersPageState() {
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletedSuppliersDialogOpen, setDeletedSuppliersDialogOpen] = useState(false)
  const [focusedSupplierIndex, setFocusedSupplierIndex] = useState(-1)
  const [shouldPreserveSearchFocus, setShouldPreserveSearchFocus] = useState(false)

  const supplierListRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  return {
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    deletedSuppliersDialogOpen,
    setDeletedSuppliersDialogOpen,
    focusedSupplierIndex,
    setFocusedSupplierIndex,
    shouldPreserveSearchFocus,
    setShouldPreserveSearchFocus,
    supplierListRef,
    searchInputRef,
  }
}
