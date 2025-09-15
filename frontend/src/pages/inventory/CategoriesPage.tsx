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
  FormControlLabel,
  Switch,
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
  Category as CategoryIcon,
  KeyboardDoubleArrowRight as DoubleArrowIcon,
  RestoreFromTrash as RestoreIcon,
  Search as SearchIcon,
} from '@mui/icons-material'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { useDispatch, useSelector } from 'react-redux'
import { useNotification } from '@/hooks/useNotification'
import CategorySelector from '@/components/inventory/CategorySelector'
import DeletedCategoriesDialog from '@/components/inventory/DeletedCategoriesDialog'
import type { Category } from '@/types'
import {
  fetchCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  selectCategories,
  selectInventoryLoading,
} from '@/store/slices/inventorySlice'


interface CategoryFormData {
  name: string
  isActive: boolean
  parentId?: string | null
}

const categorySchema = yup.object({
  name: yup.string().required('Category name is required').min(2, 'Name must be at least 2 characters'),
  isActive: yup.boolean(),
  parentId: yup.string().optional().nullable(),
})

const CategoriesPage: React.FC = () => {
  const dispatch = useDispatch() as any
  const { showSuccess, showError } = useNotification()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const isTablet = useMediaQuery(theme.breakpoints.down('lg'))
  const categories = useSelector(selectCategories) || []
  const loading = useSelector(selectInventoryLoading)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [nameValidationError, setNameValidationError] = useState<string | null>(null)
  const [parentCategory, setParentCategory] = useState<Category | null>(null)
  const [deletedCategoriesDialogOpen, setDeletedCategoriesDialogOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CategoryFormData>({
    resolver: yupResolver(categorySchema) as any,
    defaultValues: {
      name: '',
      isActive: true,
      parentId: null,
    },
  })


  useEffect(() => {
    dispatch(fetchCategories({ includeProductCount: true }))
  }, [dispatch])

  // Debounced search effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      dispatch(fetchCategories({
        includeProductCount: true,
        search: searchTerm || undefined
      }))
    }, 500)

    return () => clearTimeout(timeoutId)
  }, [dispatch, searchTerm])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'F':
          if ((event.ctrlKey || event.metaKey) && !event.altKey) {
            event.preventDefault()
            // Focus the search input
            const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement
            if (searchInput) {
              searchInput.focus()
              searchInput.select()
            }
          }
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleRefresh = () => {
    dispatch(fetchCategories({
      includeProductCount: true,
      search: searchTerm || undefined
    }))
  }

  const handleAddCategory = (parentId?: string) => {
    const parent = parentId ? findCategoryById(categories, parentId) : null
    reset({
      name: '',
      isActive: true,
      parentId: parentId || null,
    })
    setEditMode(false)
    setSelectedCategory(null)
    setParentCategory(parent)
    setNameValidationError(null)
    setDialogOpen(true)
  }

  const handleEditCategory = (category: Category) => {
    const parent = category.parentId ? findCategoryById(categories, category.parentId) : null
    reset({
      name: category.name,
      isActive: category.isActive,
      parentId: category.parentId,
    })
    setEditMode(true)
    setSelectedCategory(category)
    setParentCategory(parent)
    setNameValidationError(null)
    setDialogOpen(true)
  }

  const handleDeleteCategory = async (category: Category) => {
    const productCount = category.productCount ?? 0
    const confirmMessage = productCount > 0 
      ? `Category "${category.name}" contains ${productCount} product${productCount === 1 ? '' : 's'}. Products will be moved to "Uncategorized". Continue?`
      : `Are you sure you want to delete the category "${category.name}"?`
      
    if (window.confirm(confirmMessage)) {
      try {
        await dispatch(deleteCategory(category.id))
        showSuccess(`Category "${category.name}" deleted successfully.`)
      } catch (error: any) {
        const errorMessage = error.response?.data?.message || 'Failed to delete category'
        showError(errorMessage)
      }
    }
  }


  const onSubmit = async (data: CategoryFormData) => {
    try {
      setSubmitting(true)
      
      // Client-side validation to check for duplicates
      const existingCategory = categories.find(cat => 
        cat.name.toLowerCase() === data.name.toLowerCase() && 
        (!editMode || cat.id !== selectedCategory?.id)
      )
      
      if (existingCategory) {
        showError(`A category named "${data.name}" already exists. Please choose a different name.`)
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
    const isParent = category.hasChildren
    const indentSize = 1.5 // Reduced indentation for more compact display
    
    return (
      <Box 
        sx={{ 
          display: 'flex', 
          alignItems: 'center',
          ml: indentLevel * indentSize,
          minHeight: 32 // Compact row height
        }}
        aria-level={indentLevel + 1}
        role="treeitem"
        aria-expanded={isParent ? true : undefined}
        aria-label={`${category.name} ${indentLevel === 0 ? 'root category' : `level ${indentLevel} category`} ${isParent ? 'with subcategories' : ''}`}
      >        
        {/* Hierarchy indicator with DoubleArrow for child categories */}
        {indentLevel > 0 && (
          <DoubleArrowIcon 
            sx={{ 
              mr: 0.5,
              color: 'text.disabled',
              fontSize: 20
            }}
          />
        )}
        
        {/* Minimal Category Icon */}
        <Box sx={{ mr: 0.75, display: 'flex', alignItems: 'center' }}>
          <CategoryIcon 
            sx={{ 
              fontSize: indentLevel === 0 ? 18 : 16, 
              color: indentLevel === 0 ? 'primary.main' : isParent ? 'secondary.main' : 'text.secondary'
            }} 
          />
        </Box>
        
        {/* Category Name */}
        <Typography 
          variant="body2"
          sx={{ 
            fontWeight: indentLevel === 0 ? 600 : isParent ? 500 : 400,
            color: indentLevel === 0 ? 'primary.dark' : 'text.primary',
            fontSize: indentLevel === 0 ? '0.9rem' : '0.8rem',
            lineHeight: 1.2,
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


  const validateCategoryName = (name: string) => {
    if (!name || name.length < 2) {
      return null // Let yup handle basic validation
    }
    
    const existingCategory = categories.find(cat => 
      cat.name.toLowerCase() === name.toLowerCase() && 
      (!editMode || cat.id !== selectedCategory?.id)
    )
    
    if (existingCategory) {
      return `A category named "${name}" already exists`
    }
    
    return null
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
          <Typography variant={isMobile ? "h5" : "h4"} sx={{ fontWeight: 700, mb: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
            <CategoryIcon sx={{ fontSize: 40, color: 'primary.main' }} />
            Categories
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Organize your products with categories ({categories.length} {searchTerm ? 'found' : 'total'})
            {searchTerm && (
              <>
                <br />
                <Typography component="span" variant="body2" color="primary.main" sx={{ fontStyle: 'italic' }}>
                  Filtered by: "{searchTerm}"
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
              size="small" // Use compact table size
              sx={{ 
                minWidth: isMobile ? 650 : 800,
                '& .MuiTableCell-root': { 
                  borderBottom: '1px solid rgba(224, 224, 224, 0.4)',
                  py: 0.75, // Reduced padding for compact display
                  px: 1.5 // Consistent horizontal padding
                }
              }}
            >
              <TableHead>
                <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50', py: 1 } }}>
                  <TableCell sx={{ width: isMobile ? '45%' : '40%' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                      Category Hierarchy
                    </Typography>
                  </TableCell>
                  {!isMobile && (
                    <TableCell sx={{ width: '12%' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                        Status
                      </Typography>
                    </TableCell>
                  )}
                  <TableCell sx={{ width: isMobile ? '15%' : '12%' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                      Products
                    </Typography>
                  </TableCell>
                  {!isMobile && (
                    <TableCell sx={{ width: '16%' }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
                        Created Date
                      </Typography>
                    </TableCell>
                  )}
                  <TableCell align="right" sx={{ width: isMobile ? '40%' : '20%' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.primary', fontSize: '0.8rem' }}>
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
                      height: 48 // Fixed compact row height
                    }}
                  >
                    <TableCell>
                      {renderCategoryName(category)}
                      {/* Mobile-only status indicator */}
                      {isMobile && (
                        <Box sx={{ mt: 0.25 }}>
                          <Chip
                            label={category.isActive ? 'Active' : 'Inactive'}
                            color={category.isActive ? 'success' : 'default'}
                            size="small"
                            variant={category.isActive ? 'filled' : 'outlined'}
                            sx={{
                              fontSize: '0.65rem',
                              height: 18 // More compact chip
                            }}
                          />
                        </Box>
                      )}
                    </TableCell>
                    {!isMobile && (
                      <TableCell>
                        <Chip
                          label={category.isActive ? 'Active' : 'Inactive'}
                          color={category.isActive ? 'success' : 'default'}
                          size="small"
                          variant={category.isActive ? 'filled' : 'outlined'}
                          sx={{
                            minWidth: 60,
                            fontSize: '0.7rem',
                            fontWeight: 500,
                            height: 20 // More compact chip
                          }}
                        />
                      </TableCell>
                    )}
                    <TableCell>
                      <Chip
                        label={`${category.productCount ?? 0} ${(category.productCount ?? 0) === 1 ? 'item' : 'items'}`}
                        size="small"
                        color={category.productCount && category.productCount > 0 ? 'primary' : 'default'}
                        variant="outlined"
                        sx={{
                          fontSize: '0.7rem',
                          fontWeight: 500,
                          height: 20
                        }}
                      />
                    </TableCell>
                    {!isMobile && (
                      <TableCell>
                        <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
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
                          gap: 0.25, // Tight spacing for compact display
                          opacity: isMobile ? 1 : 0.7,
                          transition: 'opacity 0.2s ease'
                        }}
                      >
                        <IconButton 
                          size="small" // Always use small size for compactness
                          title={`Edit ${category.name}`}
                          aria-label={`Edit category ${category.name}`}
                          onClick={() => handleEditCategory(category)}
                          sx={{
                            '&:hover': {
                              backgroundColor: 'action.hover',
                              color: 'primary.main'
                            },
                            p: 0.5 // Reduced padding
                          }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton 
                          size="small" // Always use small size for compactness
                          title={`Delete ${category.name}`}
                          aria-label={`Delete category ${category.name}`}
                          onClick={() => handleDeleteCategory(category)}
                          sx={{
                            '&:hover': {
                              backgroundColor: 'error.light',
                              color: 'error.main'
                            },
                            p: 0.5 // Reduced padding
                          }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                      {/* Mobile-only date indicator */}
                      {isMobile && (
                        <Typography variant="caption" color="text.secondary" sx={{ 
                          display: 'block', 
                          textAlign: 'right', 
                          mt: 0.25, // Reduced margin
                          fontSize: '0.65rem'
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
                    const validationError = validateCategoryName(field.value)
                    const hasValidationError = !!errors.name || !!validationError
                    const helperText = errors.name?.message || validationError || ''
                    
                    return (
                      <TextField
                        {...field}
                        fullWidth
                        label="Category Name"
                        error={hasValidationError}
                        helperText={helperText}
                        onChange={(e) => {
                          field.onChange(e)
                          const error = validateCategoryName(e.target.value)
                          setNameValidationError(error)
                        }}
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
              <Grid item xs={12}>
                <Controller
                  name="isActive"
                  control={control}
                  render={({ field }) => (
                    <FormControlLabel
                      control={
                        <Switch
                          checked={field.value}
                          onChange={field.onChange}
                        />
                      }
                      label="Active Category"
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
          search: searchTerm || undefined
        }))}
      />
    </Box>
  )
}

export default CategoriesPage