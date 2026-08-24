import React, { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Box,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  TextField,
  Typography,
  Alert,
} from '@mui/material'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'

import { AppButton } from '@/components/common/AppButton'
import PageHeader from '@/components/common/PageHeader'
import CategorySelector from '@/components/inventory/CategorySelector'
import {
  useGetCategoriesQuery,
  useGetCategoryBySlugQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
} from '@/store/api/inventoryApi'
import { useCategoryDuplicateCheck } from '@/hooks/useCategoryDuplicateCheck'
import { useNotification } from '@/hooks/useNotification'
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'
import { currentListPath } from '@/utils/listQuery'
import type { Category } from '@/types'

const schema = yup.object({
  name: yup.string().required('Name is required').min(2, 'Name must be at least 2 characters'),
  description: yup.string(),
  parentId: yup.string().nullable(),
})

interface FormData {
  name: string
  description: string
  parentId: string | null
}

const CategoryFormPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  // Same-module list returns rebuild the list URL from the carried ticket.
  // The ?parentId= preselection read below is untouched and rides alongside.
  const listPath = currentListPath('/inventory/categories')
  const isEditMode = !!slug

  const preselectedParentId = searchParams.get('parentId')

  const { data: category, isFetching: isFetchingCategory } = useGetCategoryBySlugQuery(slug!, { skip: !slug })
  const { data: allCategories } = useGetCategoriesQuery(undefined, { skip: isEditMode || !preselectedParentId })
  const [createCategory, { isLoading: isCreating }] = useCreateCategoryMutation()
  const [updateCategory, { isLoading: isUpdating }] = useUpdateCategoryMutation()
  const { showSuccess, showError } = useNotification()
  const isSaving = isCreating || isUpdating

  const [selectedParent, setSelectedParent] = useState<Category | null>(null)
  const editId = category?.id

  const {
    control,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<FormData>({
    resolver: yupResolver(schema) as any,
    defaultValues: {
      name: '',
      description: '',
      parentId: null,
    },
  })
  const { UnsavedChangesDialog } = useUnsavedChangesGuard(isDirty, isSubmitting)

  const watchedName = watch('name')
  const watchedParentId = watch('parentId')

  const { nameError, hasNameDuplicate } = useCategoryDuplicateCheck({
    name: watchedName,
    parentId: watchedParentId ?? undefined,
    excludeId: editId,
  })

  useEffect(() => {
    if (category) {
      reset({
        name: category.name || '',
        description: category.description || '',
        parentId: category.parentId || null,
      })
      if (category.parent) {
        setSelectedParent(category.parent as Category)
      }
    }
  }, [category, reset])

  useEffect(() => {
    if (!isEditMode && preselectedParentId) {
      setValue('parentId', preselectedParentId)
      const resolved = allCategories?.find((c) => c.id === preselectedParentId)
      setSelectedParent(
        resolved ?? ({ id: preselectedParentId, name: '' } as Category),
      )
    }
  }, [isEditMode, preselectedParentId, setValue, allCategories])

  const onSubmit = async (data: FormData) => {
    if (hasNameDuplicate) {
      showError(nameError)
      return
    }

    try {
      const payload = {
        name: data.name,
        description: data.description || undefined,
        parentId: data.parentId || undefined,
      }

      if (isEditMode && editId) {
        await updateCategory({ id: editId, data: payload }).unwrap()
        showSuccess('Category updated successfully')
      } else {
        await createCategory(payload).unwrap()
        showSuccess('Category created successfully')
      }

      navigate(listPath)
    } catch (err: any) {
      showError(err?.data?.message || err?.message || `Failed to ${isEditMode ? 'update' : 'create'} category`)
    }
  }

  const handleCancel = () => {
    navigate(listPath)
  }

  if (isFetchingCategory) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 10 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (isEditMode && !isFetchingCategory && !category) {
    return <Alert severity="error">Category not found.</Alert>
  }

  return (
    <>
      <PageHeader
        title={isEditMode ? 'Edit Category' : 'Create Category'}
        subtitle={isEditMode ? `Editing ${category?.name ?? ''}` : 'Add a new category to organize products'}
        variant="workflow"
        backAction={handleCancel}
      />

      <form noValidate onSubmit={handleSubmit(onSubmit)}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex', flexDirection: 'column' }}>
            <Card sx={{ flex: 1 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>Category Information</Typography>
                <Grid container spacing={2}>
                  <Grid size={12}>
                    <Controller
                      name="name"
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          label="Name"
                          required
                          fullWidth
                          size="small"
                          disabled={isSaving}
                          error={!!errors.name || hasNameDuplicate}
                          helperText={
                            errors.name?.message ||
                            (hasNameDuplicate ? nameError : '')
                          }
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
                          value={selectedParent}
                          onChange={(cat) => {
                            setSelectedParent(cat)
                            field.onChange(cat?.id || null)
                          }}
                          label="Parent Category"
                          size="small"
                          disabled={isSaving}
                          excludeCategories={
                            isEditMode && editId ? [editId] : undefined
                          }
                        />
                      )}
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex', flexDirection: 'column' }}>
            <Card sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
              <CardContent sx={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
                <Typography variant="h6" gutterBottom>Description</Typography>
                <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', mt: 1 }}>
                  <Controller
                    name="description"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        value={field.value || ''}
                        label="Description"
                        multiline
                        minRows={4}
                        fullWidth
                        size="small"
                        disabled={isSaving}
                        sx={{
                          flexGrow: 1,
                          '& .MuiInputBase-root': { height: '100%', alignItems: 'flex-start' },
                          '& .MuiInputBase-input': {
                            fontSize: '0.875rem',
                            height: '100% !important',
                            overflow: 'auto !important',
                          },
                          '& .MuiInputLabel-root': { fontSize: '0.875rem' },
                        }}
                      />
                    )}
                  />
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={12}>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
              <AppButton
                variant="secondary"
                onClick={handleCancel}
                disabled={isSaving}
              >
                Cancel
              </AppButton>
              <AppButton
                variant="primary"
                type="submit"
                disabled={isSaving || hasNameDuplicate}
              >
                {isSaving
                  ? (isEditMode ? 'Updating...' : 'Creating...')
                  : (isEditMode ? 'Update Category' : 'Create Category')}
              </AppButton>
            </Box>
          </Grid>
        </Grid>
      </form>

      {UnsavedChangesDialog}
    </>
  )
}

export default CategoryFormPage
