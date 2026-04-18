import React, { useEffect } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  TextField,
  Typography,
} from '@mui/material'
import { yupResolver } from '@hookform/resolvers/yup'
import { Controller, useForm, type UseFormReset } from 'react-hook-form'
import * as yup from 'yup'

import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import CategorySelector from '@/components/inventory/CategorySelector'
import DeletedCategoriesDialog from '@/components/inventory/DeletedCategoriesDialog'
import { SmartCategoryDeleteDialog } from '@/components/inventory/SmartCategoryDeleteDialog'
import { useCategoryDuplicateCheck } from '@/hooks/useCategoryDuplicateCheck'
import type { Category } from '@/types'

interface CategoryFormData {
  name: string
  parentId?: string | null
}

const categorySchema = yup.object({
  name: yup.string().required('Category name is required').min(2, 'Name must be at least 2 characters'),
  parentId: yup.string().optional().nullable(),
})

interface CategoryDialogsProps {
  dialogOpen: boolean
  editMode: boolean
  selectedCategory: Category | null
  submitting: boolean
  categories: Category[]
  onSubmit: (data: CategoryFormData) => Promise<void>
  onDialogClose: () => void
  onFormReady: (resetFn: UseFormReset<CategoryFormData>) => void
  onDuplicateStateChange: (isDuplicate: boolean, error: string | null) => void
  deletedCategoriesDialogOpen: boolean
  onCloseDeletedCategories: () => void
  onCategoryRestored: () => void
  deleteConfirmOpen: boolean
  categoryToDelete: Category | null
  onConfirmDelete: () => void
  onCancelDelete: () => void
  smartDeleteOpen: boolean
  deleteError: any
  onSmartDelete: (moveToUncategorized: boolean) => Promise<void>
  onSmartDeleteClose: () => void
}

const CategoryDialogs: React.FC<CategoryDialogsProps> = ({
  dialogOpen,
  editMode,
  selectedCategory,
  submitting,
  categories,
  onSubmit,
  onDialogClose,
  onFormReady,
  onDuplicateStateChange,
  deletedCategoriesDialogOpen,
  onCloseDeletedCategories,
  onCategoryRestored,
  deleteConfirmOpen,
  categoryToDelete,
  onConfirmDelete,
  onCancelDelete,
  smartDeleteOpen,
  deleteError,
  onSmartDelete,
  onSmartDeleteClose,
}) => {
  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<CategoryFormData>({
    resolver: yupResolver(categorySchema) as any,
    defaultValues: { name: '', parentId: null },
  })

  const watchedName = watch('name')
  const watchedParentId = watch('parentId')

  const {
    nameError: duplicateNameError,
    hasNameDuplicate: isDuplicateName,
  } = useCategoryDuplicateCheck({
    name: watchedName,
    parentId: watchedParentId || undefined,
    excludeId: editMode && selectedCategory ? selectedCategory.id : undefined,
  })

  useEffect(() => {
    onFormReady(reset)
  }, [onFormReady, reset])

  useEffect(() => {
    onDuplicateStateChange(isDuplicateName, duplicateNameError)
  }, [duplicateNameError, isDuplicateName, onDuplicateStateChange])

  const findCategoryById = (id: string): Category | null =>
    categories.find((category) => category.id === id) || null

  const parentCategory = watchedParentId ? findCategoryById(watchedParentId) : null

  return (
    <>
      <Dialog open={dialogOpen} onClose={onDialogClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editMode ? 'Edit Category' : 'Add New Category'}
          {parentCategory && (
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
              Parent: {parentCategory.name}
            </Typography>
          )}
        </DialogTitle>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogContent>
            <Grid container spacing={3} sx={{ mt: 1 }}>
              <Grid size={12}>
                <Controller
                  name="name"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Category Name"
                      error={!!errors.name || isDuplicateName}
                      helperText={errors.name?.message || duplicateNameError || ''}
                    />
                  )}
                />
              </Grid>
              <Grid size={12}>
                <Controller
                  name="parentId"
                  control={control}
                  render={({ field }) => (
                    <CategorySelector
                      value={field.value ? findCategoryById(field.value) : null}
                      onChange={(category) => field.onChange(category?.id || null)}
                      label="Parent Category"
                      placeholder="Select parent category (optional)"
                      allowRoot
                      excludeCategories={editMode && selectedCategory ? [selectedCategory.id] : []}
                    />
                  )}
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={onDialogClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={submitting}>
              {submitting ? 'Saving...' : editMode ? 'Update' : 'Create'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <DeletedCategoriesDialog
        open={deletedCategoriesDialogOpen}
        onClose={onCloseDeletedCategories}
        onCategoryRestored={onCategoryRestored}
      />

      <ConfirmationDialog
        open={deleteConfirmOpen}
        title="Confirm Delete"
        message={`Are you sure you want to delete the category "${categoryToDelete?.name}"?`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
        severity="warning"
      />

      <SmartCategoryDeleteDialog
        open={smartDeleteOpen}
        category={categoryToDelete}
        error={deleteError}
        onClose={onSmartDeleteClose}
        onConfirm={onSmartDelete}
      />
    </>
  )
}

export default CategoryDialogs
