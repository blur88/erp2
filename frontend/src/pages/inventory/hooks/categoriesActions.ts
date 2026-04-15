import { useCallback } from 'react'

import type { Category } from '@/types'

interface UseCategoriesActionsParams {
  categories: Category[]
  selectedCategory: Category | null
  editMode: boolean
  isDuplicateName: boolean
  duplicateNameError: string | null
  deleteCategory: (id: string) => { unwrap: () => Promise<void> }
  createCategory: (data: { name: string; parentId: string | null }) => { unwrap: () => Promise<unknown> }
  updateCategory: (args: {
    id: string
    data: { name: string; parentId?: string | null }
  }) => { unwrap: () => Promise<unknown> }
  showSuccess: (message: string) => void
  showError: (message: string) => void
  refetchCategories: () => void
  setDialogOpen: (open: boolean) => void
  setEditMode: (mode: boolean) => void
  setDeleteConfirmOpen: (open: boolean) => void
  setCategoryToDelete: (category: Category | null) => void
  setSmartDeleteOpen: (open: boolean) => void
  setDeleteError: (error: any) => void
  setSubmitting: (submitting: boolean) => void
  resetForm: (values: { name: string; parentId: string | null }) => void
}

export function useCategoriesActions({
  categories: _categories,
  selectedCategory,
  editMode,
  isDuplicateName,
  duplicateNameError,
  deleteCategory,
  createCategory,
  updateCategory,
  showSuccess,
  showError,
  refetchCategories,
  setDialogOpen,
  setEditMode,
  setDeleteConfirmOpen,
  setCategoryToDelete,
  setSmartDeleteOpen,
  setDeleteError,
  setSubmitting,
  resetForm,
}: UseCategoriesActionsParams) {
  const handleAddCategory = useCallback(
    (parentId?: string) => {
      resetForm({ name: '', parentId: parentId || null })
      setEditMode(false)
      setCategoryToDelete(null)
      setDialogOpen(true)
    },
    [resetForm, setCategoryToDelete, setDialogOpen, setEditMode],
  )

  const handleEditCategory = useCallback(
    (category: Category) => {
      resetForm({ name: category.name, parentId: category.parentId || null })
      setEditMode(true)
      setDialogOpen(true)
    },
    [resetForm, setDialogOpen, setEditMode],
  )

  const handleDeleteCategory = useCallback(
    (category: Category) => {
      setCategoryToDelete(category)
      setDeleteError(null)
      setDeleteConfirmOpen(true)
    },
    [setCategoryToDelete, setDeleteConfirmOpen, setDeleteError],
  )

  const handleConfirmDelete = useCallback(
    async (categoryToDelete: Category | null) => {
      if (!categoryToDelete) return

      try {
        await deleteCategory(categoryToDelete.id).unwrap()
        showSuccess(`Category "${categoryToDelete.name}" deleted successfully.`)
        setDeleteConfirmOpen(false)
        setCategoryToDelete(null)
      } catch (error: any) {
        console.error('Delete category error:', error)

        if (error?.productCount || (error?.includes && error.includes('contains'))) {
          setDeleteConfirmOpen(false)
          setDeleteError({
            message: error?.message || error,
            productCount: error?.productCount,
            categoryName: categoryToDelete.name,
            suggestions: error?.suggestions,
          })
          setSmartDeleteOpen(true)
        } else {
          showError(error || 'Failed to delete category')
          setDeleteConfirmOpen(false)
          setCategoryToDelete(null)
        }
      }
    },
    [
      deleteCategory,
      setCategoryToDelete,
      setDeleteConfirmOpen,
      setDeleteError,
      setSmartDeleteOpen,
      showError,
      showSuccess,
    ],
  )

  const handleSmartDelete = useCallback(
    async (categoryToDelete: Category | null, moveToUncategorized: boolean) => {
      if (!categoryToDelete) return

      const params = new URLSearchParams()
      params.set('force', 'true')
      if (moveToUncategorized) {
        params.set('moveToUncategorized', 'true')
      }

      const response = await fetch(
        `/api/inventory/categories/${categoryToDelete.id}?${params.toString()}`,
        { method: 'DELETE', headers: { 'Content-Type': 'application/json' } },
      )

      if (!response.ok) {
        throw new Error(`Failed to delete category: ${response.statusText}`)
      }

      const result = await response.json()

      if (result.moved && result.moved > 0) {
        showSuccess(
          `Category "${categoryToDelete.name}" deleted. ${result.moved} product${result.moved === 1 ? '' : 's'} moved to Uncategorized.`,
        )
      } else {
        showSuccess(result.message || `Category "${categoryToDelete.name}" deleted successfully.`)
      }

      void refetchCategories()
    },
    [refetchCategories, showSuccess],
  )

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmOpen(false)
    setCategoryToDelete(null)
  }, [setCategoryToDelete, setDeleteConfirmOpen])

  const handleSmartDeleteClose = useCallback(() => {
    setSmartDeleteOpen(false)
    setCategoryToDelete(null)
    setDeleteError(null)
  }, [setCategoryToDelete, setDeleteError, setSmartDeleteOpen])

  const onSubmit = useCallback(
    async (data: { name: string; parentId?: string | null }) => {
      try {
        setSubmitting(true)

        if (isDuplicateName) {
          showError(duplicateNameError || 'Category name already exists')
          return
        }

        if (editMode && selectedCategory) {
          await updateCategory({ id: selectedCategory.id, data }).unwrap()
          showSuccess('Category updated successfully')
        } else {
          await createCategory({ name: data.name, parentId: data.parentId || null }).unwrap()
          showSuccess('Category created successfully')
        }

        setDialogOpen(false)
        resetForm({ name: '', parentId: null })
      } catch (error: any) {
        console.error('Category save error:', error)

        if (error?.response?.status === 409) {
          showError(
            `Duplicate entry detected: A category named "${data.name}" already exists. Please choose a different name.`,
          )
        } else if (error?.response?.status === 400) {
          const message = error?.response?.data?.message || 'Invalid category data'
          showError(`Validation error: ${message}`)
        } else {
          const message = error?.response?.data?.message || error?.message || 'Failed to save category'
          showError(`Failed to save category: ${message}`)
        }
      } finally {
        setSubmitting(false)
      }
    },
    [
      createCategory,
      duplicateNameError,
      editMode,
      isDuplicateName,
      resetForm,
      selectedCategory,
      setDialogOpen,
      setSubmitting,
      showError,
      showSuccess,
      updateCategory,
    ],
  )

  return {
    handleAddCategory,
    handleEditCategory,
    handleDeleteCategory,
    handleConfirmDelete,
    handleSmartDelete,
    handleCancelDelete,
    handleSmartDeleteClose,
    onSubmit,
  }
}
