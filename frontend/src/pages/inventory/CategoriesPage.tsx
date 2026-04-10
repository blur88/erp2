import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Paper,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  useTheme,
  useMediaQuery,
  InputAdornment,
} from '@mui/material'
import { default as EditIcon } from '@mui/icons-material/Edit'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as DragIndicatorIcon } from '@mui/icons-material/DragIndicator'
import { default as SearchIcon } from '@mui/icons-material/Search'
import PageHeader from '@/components/common/PageHeader'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { useNotification } from '@/hooks/useNotification'
import { useSearchAndFilter, useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { useCategoryDuplicateCheck } from '@/hooks/useCategoryDuplicateCheck'
import CategorySelector from '@/components/inventory/CategorySelector'
import DeletedCategoriesDialog from '@/components/inventory/DeletedCategoriesDialog'
import { SmartCategoryDeleteDialog } from '@/components/inventory/SmartCategoryDeleteDialog'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import type { Category } from '@/types'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { formatDate } from '@/utils/formatters'
import {
  setCategoryFilters,
  selectCategoryFilters,
} from '@/store/slices/inventorySlice'
import {
  useCreateCategoryMutation,
  useDeleteCategoryMutation,
  useGetCategoriesQuery,
  useUpdateCategoryMutation,
} from '@/store/api/inventoryApi'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'


interface CategoryFormData {
  name: string
  parentId?: string | null
}

const categorySchema = yup.object({
  name: yup.string().required('Category name is required').min(2, 'Name must be at least 2 characters'),
  parentId: yup.string().optional().nullable(),
})

const CategoriesPage: React.FC = () => {
  const dispatch = useAppDispatch()
  const { showSuccess, showError } = useNotification()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const categoryFilters = useAppSelector(selectCategoryFilters) || { search: '' }
  const {
    data: categories = [],
    isFetching: isCategoriesFetching,
    refetch: refetchCategories,
  } = useGetCategoriesQuery({
    includeProductCount: true,
    search: categoryFilters.search || undefined,
  })
  const [createCategory] = useCreateCategoryMutation()
  const [updateCategory] = useUpdateCategoryMutation()
  const [deleteCategory] = useDeleteCategoryMutation()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [parentCategory, setParentCategory] = useState<Category | null>(null)
  const [deletedCategoriesDialogOpen, setDeletedCategoriesDialogOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null)
  const [smartDeleteOpen, setSmartDeleteOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<any>(null)

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<CategoryFormData>({
    resolver: yupResolver(categorySchema) as any,
    defaultValues: {
      name: '',
      parentId: null,
    },
  })

  // Search and filter functionality
  const { searchTerm, setSearchTerm, focusSearchInput } = useSearchAndFilter({
    initialSearchTerm: categoryFilters.search,
    onSearchChange: (searchTerm) => {
      dispatch(setCategoryFilters({ search: searchTerm }))
    },
  })

  // Duplicate check functionality
  const {
    checkDuplicate,
    nameError: duplicateNameError,
    hasNameDuplicate: isDuplicateName
  } = useCategoryDuplicateCheck()

  // Watch form fields for real-time validation
  const watchedName = watch('name')
  const watchedParentId = watch('parentId')

  // Real-time duplicate checking for form fields
  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      if (watchedName && watchedName.trim().length >= 2) {
        await checkDuplicate({
          name: watchedName.trim(),
          parentId: watchedParentId || undefined,
          excludeId: editMode && selectedCategory ? selectedCategory.id : undefined,
        })
      }
    }, 500) // Debounce API calls

    return () => clearTimeout(timeoutId)
  }, [watchedName, watchedParentId, editMode, selectedCategory, checkDuplicate])

  const handleAddCategory = (parentId?: string) => {
    const parent = parentId ? findCategoryById(categories, parentId) : null
    reset({
      name: '',
      parentId: parentId || null,
    })
    setEditMode(false)
    setSelectedCategory(null)
    setParentCategory(parent)
    setDialogOpen(true)
  }

  // Keyboard shortcuts - only search
  useKeyboardShortcuts({
    onSearch: focusSearchInput,
  })

  const handleEditCategory = (category: Category) => {
    const parent = category.parentId ? findCategoryById(categories, category.parentId) : null
    reset({
      name: category.name,
      parentId: category.parentId,
    })
    setEditMode(true)
    setSelectedCategory(category)
    setParentCategory(parent)
    setDialogOpen(true)
  }

  const handleDeleteCategory = (category: Category) => {
    setCategoryToDelete(category)
    setDeleteError(null)
    setDeleteConfirmOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (categoryToDelete) {
      try {
        await deleteCategory(categoryToDelete.id).unwrap()
        showSuccess(`Category "${categoryToDelete.name}" deleted successfully.`)
        setDeleteConfirmOpen(false)
        setCategoryToDelete(null)
      } catch (error: any) {
        console.error('Delete category error:', error)

        // Check if this is a "category has products" error
        if (error?.productCount || (error?.includes && error.includes('contains'))) {
          // Close the basic confirmation dialog and show smart delete dialog
          setDeleteConfirmOpen(false)
          setDeleteError({
            message: error?.message || error,
            productCount: error?.productCount,
            categoryName: categoryToDelete.name,
            suggestions: error?.suggestions
          })
          setSmartDeleteOpen(true)
        } else {
          // For other errors, show error message and close dialog
          const errorMessage = error || 'Failed to delete category'
          showError(errorMessage)
          setDeleteConfirmOpen(false)
          setCategoryToDelete(null)
        }
      }
    }
  }

  const handleSmartDelete = async (moveToUncategorized: boolean) => {
    if (!categoryToDelete) return

    try {
      const params = new URLSearchParams()
      params.set('force', 'true')
      if (moveToUncategorized) {
        params.set('moveToUncategorized', 'true')
      }

      // Call delete API with force parameters
      const response = await fetch(`/api/inventory/categories/${categoryToDelete.id}?${params.toString()}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`Failed to delete category: ${response.statusText}`)
      }

      const result = await response.json()

      // Show success message
      if (result.moved && result.moved > 0) {
        showSuccess(`Category "${categoryToDelete.name}" deleted. ${result.moved} product${result.moved === 1 ? '' : 's'} moved to Uncategorized.`)
      } else {
        showSuccess(result.message || `Category "${categoryToDelete.name}" deleted successfully.`)
      }

      // Refresh the categories list
      void refetchCategories()
    } catch (error: any) {
      console.error('Smart delete error:', error)
      showError(error.message || 'Failed to delete category')
      throw error // Re-throw to let the dialog handle loading state
    }
  }

  const handleCancelDelete = () => {
    setDeleteConfirmOpen(false)
    setCategoryToDelete(null)
  }

  const handleSmartDeleteClose = () => {
    setSmartDeleteOpen(false)
    setCategoryToDelete(null)
    setDeleteError(null)
  }


  const onSubmit = async (data: CategoryFormData) => {
    try {
      setSubmitting(true)

      // Check for duplicate errors from real-time validation
      if (isDuplicateName) {
        showError(duplicateNameError || 'Category name already exists')
        return
      }

      if (editMode && selectedCategory) {
        await updateCategory({ id: selectedCategory.id, data }).unwrap()
        showSuccess('Category updated successfully')
      } else {
        const createData = {
          ...data,
          parentId: data.parentId || null
        }
        await createCategory(createData).unwrap()
        showSuccess('Category created successfully')
      }
      
      setDialogOpen(false)
      reset()
    } catch (error: any) {
      console.error('Category save error:', error)
      
      // Handle specific error types
      if (error?.response?.status === 409) {
        showError(`Duplicate entry detected: A category named "${data.name}" already exists. Please choose a different name.`)
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
  }

  const renderCategoryName = (category: Category) => {
    const indentLevel = category.level
    const indentSize = 1.5 // Reduced indentation for more compact display

    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          ml: indentLevel * indentSize,
          gap: 0.5
        }}
        aria-level={indentLevel + 1}
        role="treeitem"
        aria-label={`${category.name} ${indentLevel === 0 ? 'root category' : `level ${indentLevel} category`}`}
      >
        {/* DragIndicator Icon for all categories */}
        <DragIndicatorIcon
          sx={{
            color: 'text.secondary',
            fontSize: '0.875rem'
          }}
        />

        {/* Category Name */}
        <Typography
          variant="body2"
          sx={{
            fontSize: '0.8rem',
            lineHeight: 1.2,
            fontWeight: 400,
            color: 'text.primary',
            wordBreak: 'break-word'
          }}
        >
          {category.name}
        </Typography>
      </Box>
    )
  }

  const findCategoryById = (cats: Category[], id: string): Category | null => {
    return cats.find(cat => cat.id === id) || null
  }


  return (
    <>
      <PageHeader
        variant="structure"
        title="Categories"
        subtitle={`Organize your products with categories (${categories.length} ${categoryFilters.search ? 'found' : 'total'})`}
        primaryAction={{
          label: isMobile ? 'Add New Category' : 'Add Category',
          onClick: () => handleAddCategory(),
        }}
        secondaryAction={{
          label: 'View Deleted',
          onClick: () => setDeletedCategoriesDialogOpen(true),
        }}
      />
      {/* Search / Filter */}
      <Box sx={{ mb: 3 }}>
        <TextField
          placeholder="Search categories by name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          size="medium"
          sx={{
            minWidth: isMobile ? 'auto' : 250,
            width: isMobile ? '100%' : 'auto',
            maxWidth: isMobile ? 'none' : 400,
            '& .MuiOutlinedInput-root': {
              height: '40px',
              fontSize: '0.875rem',
              '& input': {
                padding: '8.5px 14px',
                fontSize: '0.875rem'
              }
            },
            '& .MuiInputAdornment-root': {
              '& .MuiSvgIcon-root': {
                fontSize: '1.25rem',
                color: 'action.active'
              }
            }
          }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
      </Box>
      {/* Categories Content */}
      <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
        {isCategoriesFetching ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : categories.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="body1" sx={{
              color: "text.secondary"
            }}>
              No categories found. Create your first category to get started.
            </Typography>
          </Box>
        ) : (
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table
              size={TABLE_STYLES.size}
              sx={{
                minWidth: isMobile ? 650 : 800,
                '& .MuiTableCell-root': {
                  borderBottom: TABLE_STYLES.cell.border,
                  py: TABLE_STYLES.cell.padding.py,
                  px: TABLE_STYLES.cell.padding.px
                },
                '& .MuiTableBody-root .MuiTableRow-root:last-child .MuiTableCell-root': {
                  borderBottom: 'none'
                }
              }}
            >
              <TableHead>
                <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50', py: 1 } }}>
                  <TableCell sx={{ width: isMobile ? '45%' : '40%' }}>
                    <Typography variant="tableHeader" sx={{
                      fontWeight: 600,
                      color: 'text.primary',
                      fontSize: '0.8rem'
                    }}>
                      Category Hierarchy
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ width: isMobile ? '15%' : '15%' }}>
                    <Typography variant="tableHeader" sx={{
                      fontWeight: 600,
                      color: 'text.primary',
                      fontSize: '0.8rem'
                    }}>
                      Products
                    </Typography>
                  </TableCell>
                  {!isMobile && (
                    <TableCell sx={{ width: '20%' }}>
                      <Typography variant="tableHeader" sx={{
                        fontWeight: 600,
                        color: 'text.primary',
                        fontSize: '0.8rem'
                      }}>
                        Created Date
                      </Typography>
                    </TableCell>
                  )}
                  <TableCell align="right" sx={{ width: isMobile ? '40%' : '25%' }}>
                    <Typography variant="tableHeader" sx={{
                      fontWeight: 600,
                      color: 'text.primary',
                      fontSize: '0.8rem'
                    }}>
                      Actions
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody role="tree" aria-label="Categories hierarchy">
                {categories.map((category) => (
                  <TableRow 
                    key={category.id} 
                    hover
                    tabIndex={0}
                    sx={{
                      '&:hover, &:focus-within': {
                        backgroundColor: 'action.hover',
                        '& .category-actions': {
                          opacity: 1
                        }
                      },
                      transition: 'background-color 0.2s ease',
                      cursor: 'default',
                      height: TABLE_STYLES.row.height
                    }}
                  >
                    <TableCell>
                      {renderCategoryName(category)}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={`${category.productCount ?? 0} ${(category.productCount ?? 0) === 1 ? 'item' : 'items'}`}
                        size="small"
                        color={category.productCount && category.productCount > 0 ? 'primary' : 'default'}
                        variant="outlined"
                        sx={{
                          fontSize: '0.7rem',
                          fontWeight: 500,
                          height: `${TABLE_STYLES.row.height * 0.65}px`, // Scale to 65% of row height for better proportion
                          minWidth: `${TABLE_STYLES.row.height * 1.8}px`, // Scale min width proportionally
                          '& .MuiChip-label': {
                            fontSize: `${Math.max(10, TABLE_STYLES.row.height * 0.35)}px`, // Scale font size with row height
                            lineHeight: 1
                          }
                        }}
                      />
                    </TableCell>
                    {!isMobile && (
                      <TableCell>
                        <Typography
                          variant="tableCaption"
                          sx={{
                            color: "text.secondary",
                            fontSize: '0.7rem'
                          }}>
                          {formatDate(category.createdAt)}
                        </Typography>
                      </TableCell>
                    )}
                    <TableCell align="right">
                      <Box
                        className="category-actions"
                        sx={{
                          display: 'flex',
                          justifyContent: 'flex-end',
                          alignItems: 'center',
                          height: '100%', // Fill the full cell height
                          gap: 0.25,
                          opacity: isMobile ? 1 : 0.7,
                          transition: 'opacity 0.2s ease'
                        }}
                      >
                        <IconButton
                          size="small"
                          title={`Edit ${category.name}`}
                          aria-label={`Edit category ${category.name}`}
                          onClick={() => handleEditCategory(category)}
                          sx={{
                            height: `${TABLE_STYLES.row.height * 0.75}px`, // Scale to 75% of row height
                            width: `${TABLE_STYLES.row.height * 0.75}px`, // Square aspect ratio
                            minHeight: 20, // Reduced minimum size for better scaling
                            minWidth: 20,
                            p: 0.125, // Reduced padding for better proportion
                            color: 'primary.main',
                            '&:hover': {
                              backgroundColor: 'primary.light',
                              color: 'primary.dark'
                            }
                          }}
                        >
                          <EditIcon sx={{
                            fontSize: `${TABLE_STYLES.row.height * 0.5}px` // Scale to 50% of row height for better proportion
                          }} />
                        </IconButton>
                        <IconButton
                          size="small"
                          title={`Delete ${category.name}`}
                          aria-label={`Delete category ${category.name}`}
                          onClick={() => handleDeleteCategory(category)}
                          sx={{
                            height: `${TABLE_STYLES.row.height * 0.75}px`, // Scale to 75% of row height
                            width: `${TABLE_STYLES.row.height * 0.75}px`, // Square aspect ratio
                            minHeight: 20, // Reduced minimum size for better scaling
                            minWidth: 20,
                            p: 0.125, // Reduced padding for better proportion
                            color: 'error.main',
                            '&:hover': {
                              backgroundColor: 'error.light',
                              color: 'error.dark'
                            }
                          }}
                        >
                          <DeleteIcon sx={{
                            fontSize: `${TABLE_STYLES.row.height * 0.5}px` // Scale to 50% of row height for better proportion
                          }} />
                        </IconButton>
                      </Box>
                      {/* Mobile-only date indicator */}
                      {isMobile && (
                        <Typography
                          variant="caption"
                          sx={{
                            color: "text.secondary",
                            display: 'block',
                            textAlign: 'right',

                            // Reduced margin
                            mt: 0.25,

                            fontSize: '0.65rem'
                          }}>
                          {formatDate(category.createdAt)}
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
      {/* Category Form Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {editMode ? 'Edit Category' : 'Add New Category'}
          {parentCategory && (
            <Typography
              variant="body2"
              sx={{
                color: "text.secondary",
                mt: 1
              }}>
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
                  render={({ field }) => {
                    const hasValidationError = !!errors.name || isDuplicateName
                    const helperText = errors.name?.message || duplicateNameError || ''
                    
                    return (
                      <TextField
                        {...field}
                        fullWidth
                        label="Category Name"
                        error={hasValidationError}
                        helperText={helperText}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                      />
                    )
                  }}
                />
              </Grid>
              <Grid size={12}>
                <Controller
                  name="parentId"
                  control={control}
                  render={({ field }) => (
                    <CategorySelector
                      value={field.value ? findCategoryById(categories, field.value) : null}
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
            <Button onClick={() => setDialogOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={submitting}
            >
              {submitting ? 'Saving...' : editMode ? 'Update' : 'Create'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
      {/* Deleted Categories Dialog */}
      <DeletedCategoriesDialog
        open={deletedCategoriesDialogOpen}
        onClose={() => setDeletedCategoriesDialogOpen(false)}
        onCategoryRestored={() => {
          void refetchCategories()
        }}
      />
      {/* Smart Delete Dialog */}
      <SmartCategoryDeleteDialog
        open={smartDeleteOpen}
        category={categoryToDelete}
        error={deleteError}
        onClose={handleSmartDeleteClose}
        onConfirm={handleSmartDelete}
      />
      {/* Fallback Delete Confirmation Dialog */}
      <ConfirmationDialog
        open={deleteConfirmOpen}
        title="Confirm Delete"
        message={`Are you sure you want to delete the category "${categoryToDelete?.name}"?`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        severity="warning"
      />
    </>
  );
}

export default CategoriesPage
