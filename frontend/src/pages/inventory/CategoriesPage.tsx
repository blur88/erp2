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
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Badge,
  Divider,
} from '@mui/material'
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  Undo as UndoIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { inventoryApi } from '@/services/inventoryApi'
import { useNotification } from '@/hooks/useNotification'
import type { Category } from '@/types'


interface CategoryFormData {
  name: string
  code?: string
  description?: string
  isActive: boolean
}

const categorySchema = yup.object({
  name: yup.string().required('Category name is required').min(2, 'Name must be at least 2 characters'),
  code: yup.string().optional(),
  description: yup.string().optional(),
  isActive: yup.boolean(),
})

const CategoriesPage: React.FC = () => {
  const { showSuccess, showError } = useNotification()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [nameValidationError, setNameValidationError] = useState<string | null>(null)
  const [recentlyDeleted, setRecentlyDeleted] = useState<Map<string, { category: Category; timestamp: number }>>(new Map())
  const [undoMenuAnchor, setUndoMenuAnchor] = useState<null | HTMLElement>(null)

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CategoryFormData>({
    resolver: yupResolver(categorySchema) as any,
    defaultValues: {
      name: '',
      code: '',
      description: '',
      isActive: true,
    },
  })

  const fetchCategories = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await inventoryApi.getCategories({ includeProductCount: true })
      // Handle API response format: { data: Category[], meta: {...} }
      const categoriesData = response.data || []
      setCategories(Array.isArray(categoriesData) ? categoriesData : [])
    } catch (err) {
      console.error('Error fetching categories:', err)
      setError('Failed to load categories. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCategories()
  }, [])

  const handleRefresh = () => {
    fetchCategories()
  }

  const handleAddCategory = () => {
    reset()
    setEditMode(false)
    setSelectedCategory(null)
    setNameValidationError(null)
    setDialogOpen(true)
  }

  const handleEditCategory = (category: Category) => {
    reset({
      name: category.name,
      code: category.code || '',
      description: category.description || '',
      isActive: category.isActive,
    })
    setEditMode(true)
    setSelectedCategory(category)
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
        await inventoryApi.deleteCategory(category.id)
        
        // Add to recently deleted with timestamp
        const newRecentlyDeleted = new Map(recentlyDeleted)
        newRecentlyDeleted.set(category.id, {
          category,
          timestamp: Date.now()
        })
        setRecentlyDeleted(newRecentlyDeleted)
        
        // Auto-remove from recently deleted after 30 seconds
        setTimeout(() => {
          setRecentlyDeleted(prev => {
            const updated = new Map(prev)
            updated.delete(category.id)
            return updated
          })
        }, 30000)
        
        showSuccess(
          `Category "${category.name}" deleted successfully. Click the undo button to restore it.`
        )
        fetchCategories()
      } catch (error: any) {
        const errorMessage = error.response?.data?.message || 'Failed to delete category'
        showError(errorMessage)
      }
    }
  }

  const handleRestoreCategory = async (categoryId: string) => {
    const deletedInfo = recentlyDeleted.get(categoryId)
    if (!deletedInfo) return
    
    try {
      await inventoryApi.restoreCategory(categoryId)
      
      // Remove from recently deleted
      const newRecentlyDeleted = new Map(recentlyDeleted)
      newRecentlyDeleted.delete(categoryId)
      setRecentlyDeleted(newRecentlyDeleted)
      
      // Close the menu after restore
      setUndoMenuAnchor(null)
      
      showSuccess(`Category "${deletedInfo.category.name}" restored successfully`)
      fetchCategories()
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Failed to restore category'
      showError(errorMessage)
    }
  }

  const handleUndoMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setUndoMenuAnchor(event.currentTarget)
  }

  const handleUndoMenuClose = () => {
    setUndoMenuAnchor(null)
  }

  const formatTimeRemaining = (timestamp: number) => {
    const timeLeft = Math.max(0, 30 - Math.floor((Date.now() - timestamp) / 1000))
    return `${timeLeft}s remaining`
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
        await inventoryApi.updateCategory(selectedCategory.id, data)
        showSuccess('Category updated successfully')
      } else {
        await inventoryApi.createCategory(data)
        showSuccess('Category created successfully')
      }
      
      setDialogOpen(false)
      reset()
      fetchCategories()
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

  const getLevelIndicator = (level: number) => {
    return '  '.repeat(level) + (level > 0 ? '└─ ' : '')
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
            Categories
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Organize your products with categories ({categories.length} total)
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleRefresh}
            disabled={loading}
          >
            Refresh
          </Button>
          {recentlyDeleted.size > 0 && (
            <Badge badgeContent={recentlyDeleted.size} color="warning">
              <Button
                variant="outlined"
                startIcon={<UndoIcon />}
                endIcon={<ExpandMoreIcon />}
                onClick={handleUndoMenuOpen}
                color="warning"
                sx={{ 
                  borderColor: 'warning.main',
                  color: 'warning.main',
                  '&:hover': {
                    borderColor: 'warning.dark',
                    backgroundColor: 'warning.light',
                  }
                }}
              >
                Undo ({recentlyDeleted.size})
              </Button>
            </Badge>
          )}
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            size="large"
            onClick={handleAddCategory}
          >
            Add Category
          </Button>
        </Box>
      </Box>

      {/* Undo Menu */}
      <Menu
        anchorEl={undoMenuAnchor}
        open={Boolean(undoMenuAnchor)}
        onClose={handleUndoMenuClose}
        PaperProps={{
          sx: {
            minWidth: 320,
            maxWidth: 400,
            mt: 1,
          }
        }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <MenuItem disabled sx={{ opacity: '1 !important', cursor: 'default' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary' }}>
            Recently Deleted Categories
          </Typography>
        </MenuItem>
        <Divider />
        {Array.from(recentlyDeleted.entries()).map(([categoryId, { category, timestamp }]) => (
          <MenuItem 
            key={categoryId}
            onClick={() => handleRestoreCategory(categoryId)}
            sx={{
              py: 1.5,
              px: 2,
              '&:hover': {
                backgroundColor: 'warning.light',
              }
            }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              <UndoIcon color="warning" fontSize="small" />
            </ListItemIcon>
            <ListItemText
              primary={
                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                  {category.name}
                </Typography>
              }
              secondary={
                <Typography variant="caption" color="text.secondary">
                  {formatTimeRemaining(timestamp)}
                </Typography>
              }
            />
          </MenuItem>
        ))}
        {recentlyDeleted.size === 0 && (
          <MenuItem disabled>
            <ListItemText
              primary={
                <Typography variant="body2" color="text.secondary">
                  No recently deleted categories
                </Typography>
              }
            />
          </MenuItem>
        )}
      </Menu>

      {/* Categories Table */}
      <Paper>
        {error && (
          <Alert severity="error" sx={{ m: 2 }}>
            {error}
          </Alert>
        )}
        
        {loading ? (
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
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell><strong>Name</strong></TableCell>
                  <TableCell><strong>Code</strong></TableCell>
                  <TableCell><strong>Description</strong></TableCell>
                  <TableCell><strong>Status</strong></TableCell>
                  <TableCell><strong>Level</strong></TableCell>
                  <TableCell><strong>Products</strong></TableCell>
                  <TableCell><strong>Created</strong></TableCell>
                  <TableCell align="right"><strong>Actions</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {categories.map((category) => (
                  <TableRow key={category.id} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {getLevelIndicator(category.level)}
                      </Typography>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        {category.name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {category.code ? (
                        <Chip label={category.code} size="small" variant="outlined" />
                      ) : (
                        <Typography variant="body2" color="text.secondary">—</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {category.description || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={category.isActive ? 'Active' : 'Inactive'}
                        color={category.isActive ? 'success' : 'default'}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        Level {category.level}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={category.productCount ?? 0}
                        size="small"
                        color={category.productCount && category.productCount > 0 ? 'primary' : 'default'}
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {new Date(category.createdAt).toLocaleDateString()}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <IconButton 
                        size="small" 
                        title="Edit Category"
                        onClick={() => handleEditCategory(category)}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton 
                        size="small" 
                        title="Delete Category" 
                        onClick={() => handleDeleteCategory(category)}
                        color="error"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
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
        </DialogTitle>
        <form onSubmit={handleSubmit(onSubmit as any)}>
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
                      />
                    )
                  }}
                />
              </Grid>
              <Grid item xs={12}>
                <Controller
                  name="code"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Category Code (Optional)"
                      error={!!errors.code}
                      helperText={errors.code?.message}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12}>
                <Controller
                  name="description"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Description (Optional)"
                      multiline
                      rows={3}
                      error={!!errors.description}
                      helperText={errors.description?.message}
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
    </Box>
  )
}

export default CategoriesPage