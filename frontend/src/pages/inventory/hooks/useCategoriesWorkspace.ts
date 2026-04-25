import { useCallback, useState } from 'react'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import {
  useCreateCategoryMutation,
  useDeleteCategoryMutation,
  useUpdateCategoryMutation,
} from '@/store/api/inventoryApi'
import type { AppDispatch } from '@/store'
import { setSelectedCategory } from '@/store/slices/inventorySlice'
import type { Category } from '@/types'

interface CategoryFormData {
  name: string
  parentId?: string | null
}

export interface UseCategoriesWorkspaceConfig {
  dispatch: AppDispatch
  categories: Category[]
  selectedCategory: Category | null
  isDuplicateName: boolean
  duplicateNameError: string | null
  refetchCategories: () => void
  resetForm: (values: { name: string; parentId: string | null }) => void
}

export function useCategoriesWorkspace({
  dispatch,
  categories,
  selectedCategory,
  isDuplicateName,
  duplicateNameError,
  refetchCategories,
  resetForm,
}: UseCategoriesWorkspaceConfig) {
  const { showSuccess, showError } = useNotification()
  const [createCategory] = useCreateCategoryMutation()
  const [updateCategory] = useUpdateCategoryMutation()
  const [deleteCategory] = useDeleteCategoryMutation()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [deletedCategoriesDialogOpen, setDeletedCategoriesDialogOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null)
  const [smartDeleteOpen, setSmartDeleteOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<any>(null)
  const [submitting, setSubmitting] = useState(false)

  const selectCategory = useCallback(
    (category: Category | null) => dispatch(setSelectedCategory(category)),
    [dispatch],
  )

  const workspace = useEntityWorkspace({
    entities: categories,
    selectedEntity: selectedCategory,
    selectEntity: selectCategory,
    refetch: refetchCategories,
    navigate: (() => undefined) as any,
    routes: {
      create: '/inventory/categories/create',
      edit: (id) => `/inventory/categories/${id}/edit`,
    },
    notifications: { showSuccess, showError },
    deleteMutation: async (id) => {
      await deleteCategory(id).unwrap()
    },
  })

  const handleAddCategory = useCallback(
    (parentId?: string) => {
      resetForm({ name: '', parentId: parentId || null })
      setEditMode(false)
      setCategoryToDelete(null)
      setDialogOpen(true)
    },
    [resetForm],
  )

  const handleEditCategory = useCallback(
    (category: Category) => {
      resetForm({ name: category.name, parentId: category.parentId || null })
      setEditMode(true)
      setDialogOpen(true)
    },
    [resetForm],
  )

  const handleDeleteCategory = useCallback((category: Category) => {
    setCategoryToDelete(category)
    setDeleteError(null)
    setDeleteConfirmOpen(true)
  }, [])

  const handleConfirmDelete = useCallback(
    async (targetCategory: Category | null) => {
      if (!targetCategory) return

      try {
        await deleteCategory(targetCategory.id).unwrap()
        showSuccess(`Category "${targetCategory.name}" deleted successfully.`)
        setDeleteConfirmOpen(false)
        setCategoryToDelete(null)
      } catch (error: any) {
        console.error('Delete category error:', error)

        if (error?.productCount || (error?.includes && error.includes('contains'))) {
          setDeleteConfirmOpen(false)
          setDeleteError({
            message: error?.message || error,
            productCount: error?.productCount,
            categoryName: targetCategory.name,
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
    [deleteCategory, showError, showSuccess],
  )

  const handleSmartDelete = useCallback(
    async (targetCategory: Category | null, moveToUncategorized: boolean) => {
      if (!targetCategory) return

      const params = new URLSearchParams()
      params.set('force', 'true')
      if (moveToUncategorized) {
        params.set('moveToUncategorized', 'true')
      }

      const response = await fetch(
        `/api/inventory/categories/${targetCategory.id}?${params.toString()}`,
        { method: 'DELETE', headers: { 'Content-Type': 'application/json' } },
      )

      if (!response.ok) {
        throw new Error(`Failed to delete category: ${response.statusText}`)
      }

      const result = await response.json()

      if (result.moved && result.moved > 0) {
        showSuccess(
          `Category "${targetCategory.name}" deleted. ${result.moved} product${
            result.moved === 1 ? '' : 's'
          } moved to Uncategorized.`,
        )
      } else {
        showSuccess(result.message || `Category "${targetCategory.name}" deleted successfully.`)
      }

      refetchCategories()
    },
    [refetchCategories, showSuccess],
  )

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmOpen(false)
    setCategoryToDelete(null)
  }, [])

  const handleSmartDeleteClose = useCallback(() => {
    setSmartDeleteOpen(false)
    setCategoryToDelete(null)
    setDeleteError(null)
  }, [])

  const onSubmit = useCallback(
    async (data: CategoryFormData) => {
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
          const message =
            error?.response?.data?.message || error?.message || 'Failed to save category'
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
      showError,
      showSuccess,
      updateCategory,
    ],
  )

  return {
    ...workspace,
    dialogOpen,
    setDialogOpen,
    editMode,
    setEditMode,
    deletedCategoriesDialogOpen,
    setDeletedCategoriesDialogOpen,
    deleteConfirmOpen,
    categoryToDelete,
    smartDeleteOpen,
    deleteError,
    submitting,
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
