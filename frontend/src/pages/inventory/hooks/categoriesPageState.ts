import { useRef, useState } from 'react'

import type { Category } from '@/types'

export function useCategoriesPageState() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [deletedCategoriesDialogOpen, setDeletedCategoriesDialogOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null)
  const [smartDeleteOpen, setSmartDeleteOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<any>(null)
  const [submitting, setSubmitting] = useState(false)
  const [focusedCategoryIndex, setFocusedCategoryIndex] = useState<number>(-1)
  const categoryListRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  return {
    dialogOpen,
    setDialogOpen,
    editMode,
    setEditMode,
    deletedCategoriesDialogOpen,
    setDeletedCategoriesDialogOpen,
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    categoryToDelete,
    setCategoryToDelete,
    smartDeleteOpen,
    setSmartDeleteOpen,
    deleteError,
    setDeleteError,
    submitting,
    setSubmitting,
    focusedCategoryIndex,
    setFocusedCategoryIndex,
    categoryListRef,
    searchInputRef,
  }
}
