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
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  DragIndicator as DragIndicatorIcon,
  RestoreFromTrash as RestoreIcon,
  Search as SearchIcon,
} from '@mui/icons-material'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { useDispatch, useSelector } from 'react-redux'
import { useNotification } from '@/hooks/useNotification'
import { useSearchAndFilter, useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { useCategoryDuplicateCheck } from '@/hooks/useCategoryDuplicateCheck'
import CategorySelector from '@/components/inventory/CategorySelector'
import DeletedCategoriesDialog from '@/components/inventory/DeletedCategoriesDialog'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import type { Category } from '@/types'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'
import {
  fetchCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  selectCategories,
  selectInventoryLoading,
  setCategoryFilters,
  selectCategoryFilters,
} from '@/store/slices/inventorySlice'


interface CategoryFormData {
  name: string
  parentId?: string | null
}

const categorySchema = yup.object({
  name: yup.string().required('Category name is required').min(2, 'Name must be at least 2 characters'),
  parentId: yup.string().optional().nullable(),
})

const CategoriesPage: React.FC = () => {
  const dispatch = useDispatch() as any
  const { showSuccess, showError } = useNotification()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const categories = useSelector(selectCategories) || []
  const loading = useSelector(selectInventoryLoading)
  const categoryFilters = useSelector(selectCategoryFilters) || { search: '' }
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [parentCategory, setParentCategory] = useState<Category | null>(null)
  const [deletedCategoriesDialogOpen, setDeletedCategoriesDialogOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null)

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

  useEffect(() => {
    dispatch(fetchCategories({
      includeProductCount: true,
      search: categoryFilters.search || undefined
    }))
  }, [dispatch, categoryFilters.search])

  const handleRefresh = () => {
    dispatch(fetchCategories({
      includeProductCount: true,
      search: categoryFilters.search || undefined
    }))
  }

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

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onSearch: focusSearchInput,
    onAdd: () => handleAddCategory(),
    onRefresh: handleRefresh,
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
    setDeleteConfirmOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (categoryToDelete) {
      try {
        // Use unwrap() to properly handle Redux Toolkit async thunk errors
        await dispatch(deleteCategory(categoryToDelete.id)).unwrap()
        showSuccess(`Category "${categoryToDelete.name}" deleted successfully.`)
      } catch (error: any) {
        // Debug logging to see what error we're getting
        console.error('Delete category error:', error)
        // This will now properly catch the rejected action's payload
        const errorMessage = error || 'Failed to delete category'
        showError(errorMessage)
      } finally {
        setDeleteConfirmOpen(false)
        setCategoryToDelete(null)
      }
    }
  }

  const handleCancelDelete = () => {
    setDeleteConfirmOpen(false)
    setCategoryToDelete(null)
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
        await dispatch(updateCategory({ id: selectedCategory.id, data }))
        showSuccess('Category updated successfully')
      } else {
        const createData = {
          ...data,
          parentId: data.parentId || null
        }
        await dispatch(createCategory(createData))
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
            fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize
          }}
        />

        {/* Category Name */}
        <Typography
          variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant}
          sx={{
            fontSize: '0.8rem',
            lineHeight: TYPOGRAPHY_STYLES.tableCell.secondary.lineHeight,
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
    <Box>
      {/* Header */}
      <Box sx={{ 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between', 
        alignItems: isMobile ? 'stretch' : 'center', 
        mb: 4,
        gap: isMobile ? 2 : 0
      }}>
        <Box sx={{ mb: isMobile ? 2 : 0 }}>
          <Typography variant={isMobile ? TYPOGRAPHY_STYLES.pageHeader.mobileVariant : TYPOGRAPHY_STYLES.pageHeader.variant} sx={{
            fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight,
            mb: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 2
          }}>
            <DragIndicatorIcon sx={{
              fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize,
              color: TYPOGRAPHY_STYLES.pageHeader.icon.color
            }} />
            Categories
          </Typography>
          <Typography variant={TYPOGRAPHY_STYLES.pageSubtitle.variant} color={TYPOGRAPHY_STYLES.pageSubtitle.color}>
            Organize your products with categories ({categories.length} {categoryFilters.search ? 'found' : 'total'})
            {categoryFilters.search && (
              <>
                <br />
                <Typography component="span" variant="body2" color="primary.main" sx={{ fontStyle: 'italic' }}>
                  Filtered by: "{categoryFilters.search}"
                </Typography>
              </>
            )}
          </Typography>
        </Box>
        <Box sx={{ 
          display: 'flex', 
          flexDirection: isMobile ? 'column' : 'row',
          gap: isMobile ? 1.5 : 1,
          alignItems: isMobile ? 'stretch' : 'center'
        }}>
          <Button
            variant="outlined"
            startIcon={!isMobile ? <RefreshIcon /> : undefined}
            onClick={handleRefresh}
            disabled={loading?.categories}
            size="medium"
            fullWidth={isMobile}
          >
            {isMobile ? "Refresh Categories" : "Refresh"}
          </Button>
          <Button
            variant="outlined"
            startIcon={!isMobile ? <RestoreIcon /> : undefined}
            onClick={() => setDeletedCategoriesDialogOpen(true)}
            size="medium"
            fullWidth={isMobile}
            sx={{
              color: 'warning.main',
              borderColor: 'warning.main',
              '&:hover': {
                borderColor: 'warning.dark',
                backgroundColor: 'warning.light'
              }
            }}
          >
            {isMobile ? "View Deleted" : "View Deleted"}
          </Button>
          <Button
            variant="contained"
            startIcon={!isMobile ? <AddIcon /> : undefined}
            size="medium"
            onClick={() => handleAddCategory()}
            fullWidth={isMobile}
          >
            {isMobile ? "Add New Category" : "Add Category"}
          </Button>
        </Box>
      </Box>

      {/* Filters and Search */}
      <Box sx={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        gap: isMobile ? 2 : 1,
        alignItems: isMobile ? 'stretch' : 'center',
        mb: 3,
        '& > *': {
          alignSelf: isMobile ? 'stretch' : 'flex-start'
        }
      }}>
        <TextField
          placeholder="Search categories by name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          size="medium"
          sx={{
            minWidth: isMobile ? 'auto' : 250,
            flex: isMobile ? 'none' : 1,
            maxWidth: isMobile ? 'none' : 400,
            '& .MuiOutlinedInput-root': {
              height: TYPOGRAPHY_STYLES.searchField.input.height,
              fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
              '& input': {
                padding: TYPOGRAPHY_STYLES.searchField.input.padding,
                fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize
              }
            },
            '& .MuiInputAdornment-root': {
              '& .MuiSvgIcon-root': {
                fontSize: TYPOGRAPHY_STYLES.searchField.icon.fontSize,
                color: TYPOGRAPHY_STYLES.searchField.icon.color
              }
            }
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {/* Categories Content */}
      <Paper>        
        {loading?.categories ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : categories.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="body1" color="text.secondary">
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
                }
              }}
            >
              <TableHead>
                <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50', py: 1 } }}>
                  <TableCell sx={{ width: isMobile ? '45%' : '40%' }}>
                    <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                      fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                      color: TYPOGRAPHY_STYLES.tableHeader.color,
                      fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                    }}>
                      Category Hierarchy
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ width: isMobile ? '15%' : '15%' }}>
                    <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                      fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                      color: TYPOGRAPHY_STYLES.tableHeader.color,
                      fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                    }}>
                      Products
                    </Typography>
                  </TableCell>
                  {!isMobile && (
                    <TableCell sx={{ width: '20%' }}>
                      <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                        fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                        color: TYPOGRAPHY_STYLES.tableHeader.color,
                        fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                      }}>
                        Created Date
                      </Typography>
                    </TableCell>
                  )}
                  <TableCell align="right" sx={{ width: isMobile ? '40%' : '25%' }}>
                    <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                      fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                      color: TYPOGRAPHY_STYLES.tableHeader.color,
                      fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
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
                          fontSize: TYPOGRAPHY_STYLES.chip.small.fontSize,
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
                        <Typography variant={TYPOGRAPHY_STYLES.tableCell.caption.variant} color="text.secondary" sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize }}>
                          {new Date(category.createdAt).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })}
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
                            '&:hover': {
                              backgroundColor: 'action.hover',
                              color: 'primary.main'
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
                            '&:hover': {
                              backgroundColor: 'error.light',
                              color: 'error.main'
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
                        <Typography variant="caption" color="text.secondary" sx={{ 
                          display: 'block', 
                          textAlign: 'right', 
                          mt: 0.25, // Reduced margin
                          fontSize: TYPOGRAPHY_STYLES.mobile.caption.fontSize
                        }}>
                          {new Date(category.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: '2-digit'
                          })}
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
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Parent: {parentCategory.name}
            </Typography>
          )}
        </DialogTitle>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogContent>
            <Grid container spacing={3} sx={{ mt: 1 }}>
              <Grid item xs={12}>
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
              <Grid item xs={12}>
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
        onCategoryRestored={() => dispatch(fetchCategories({
          includeProductCount: true,
          search: categoryFilters.search || undefined
        }))}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        open={deleteConfirmOpen}
        title="Confirm Delete"
        message={
          categoryToDelete?.productCount && categoryToDelete.productCount > 0
            ? `Category "${categoryToDelete?.name}" contains ${categoryToDelete.productCount} product${categoryToDelete.productCount === 1 ? '' : 's'}. Products will be moved to "Uncategorized". Continue?`
            : `Are you sure you want to delete the category "${categoryToDelete?.name}"?`
        }
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        severity="warning"
      />
    </Box>
  )
}

export default CategoriesPage