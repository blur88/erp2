import React, { useState, useEffect, useCallback } from 'react'
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  Chip,
  CircularProgress,
  Divider,
  Button
} from '@mui/material'
import { Add } from '@mui/icons-material'
import { Category } from '@/types'
import { inventoryApi } from '@/services/inventoryApi'

interface CategorySelectorProps {
  value?: Category | null
  onChange: (category: Category | null) => void
  label?: string
  placeholder?: string
  required?: boolean
  error?: boolean
  helperText?: string
  disabled?: boolean
  showCreateButton?: boolean
  onCreateCategory?: () => void
  allowRoot?: boolean // Allow selecting no category (root level)
  excludeCategories?: string[] // Category IDs to exclude from selection
  size?: 'small' | 'medium' // Add size prop to match TextField
}

interface CategoryOption extends Category {
  displayName: string
  indentLevel: number
}

const CategorySelector: React.FC<CategorySelectorProps> = ({
  value,
  onChange,
  label = 'Category',
  placeholder = 'Select a category',
  required = false,
  error = false,
  helperText,
  disabled = false,
  showCreateButton = false,
  onCreateCategory,
  allowRoot = false,
  excludeCategories = [],
  size = 'medium'
}) => {
  const [options, setOptions] = useState<CategoryOption[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  const loadCategories = useCallback(async () => {
    setLoading(true)
    try {
      const response = await inventoryApi.getCategoryTree(true)
      
      // The API returns { data: Category[], meta: {...} }
      const categoryTree = (response.data as any) || []
      const flatCategories = flattenCategoryTree(categoryTree)
      
      // Filter out excluded categories
      const filteredCategories = flatCategories.filter(
        cat => !excludeCategories.includes(cat.id)
      )
      
      // Add root option if allowed
      const finalOptions = allowRoot ? [
        {
          id: '',
          name: 'Main Category',
          displayName: 'Main Category',
          indentLevel: 0,
          level: -1,
          isActive: true,
          isRoot: true,
          hasChildren: false,
          sortOrder: -1,
          fullPath: '',
          createdAt: new Date(),
          updatedAt: new Date()
        } as CategoryOption,
        ...filteredCategories
      ] : filteredCategories
      
      setOptions(finalOptions)
    } catch (error) {
      console.error('Failed to load categories:', error)
    } finally {
      setLoading(false)
    }
  }, [allowRoot, excludeCategories])

  const flattenCategoryTree = (categories: Category[], level = 0): CategoryOption[] => {
    const flattened: CategoryOption[] = []
    
    categories.forEach(category => {
      // Create display name with indentation
      const indent = '  '.repeat(level)
      const displayName = `${indent}${category.name}`
      
      flattened.push({
        ...category,
        displayName,
        indentLevel: level
      })
      
      // Recursively add children
      if (category.children && category.children.length > 0) {
        flattened.push(...flattenCategoryTree(category.children, level + 1))
      }
    })
    
    return flattened
  }

  useEffect(() => {
    if (open && options.length === 0) {
      loadCategories()
    }
  }, [open, options.length, loadCategories])


  const handleSelectChange = (event: any) => {
    const selectedId = event.target.value
    if (!selectedId || selectedId === '') {
      onChange(null)
    } else {
      const selectedCategory = options.find(opt => opt.id === selectedId)
      onChange(selectedCategory || null)
    }
  }

  const handleCreateClick = () => {
    if (onCreateCategory) {
      onCreateCategory()
    }
  }

  return (
    <FormControl fullWidth error={error} disabled={disabled} size={size}>
      <InputLabel
        required={required}
        sx={{
          fontSize: '0.875rem',
          '&.MuiInputLabel-shrunk': {
            fontSize: '0.75rem'
          }
        }}
      >
        {label}
      </InputLabel>
      <Select
        value={value?.id || ''}
        onChange={handleSelectChange}
        label={label}
        size={size}
        onOpen={() => {
          setOpen(true)
          if (options.length === 0) {
            loadCategories()
          }
        }}
        onClose={() => setOpen(false)}
        sx={{
          '& .MuiInputBase-input': {
            fontSize: '0.875rem',
          },
          '& .MuiSelect-select': {
            fontSize: '0.875rem',
          }
        }}
        MenuProps={{
          PaperProps: {
            style: {
              maxHeight: 'none',
              maxWidth: 'none',
              overflow: 'visible'
            },
            sx: {
              '& .MuiList-root': {
                maxHeight: '400px',
                overflow: 'auto',
                padding: 0
              }
            }
          },
          disablePortal: false,
          sx: { zIndex: 9999 }
        }}
      >
        {/* Create category button */}
        {showCreateButton && onCreateCategory && (
          <Box sx={{ p: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Button
              fullWidth
              startIcon={<Add />}
              onClick={handleCreateClick}
              size="small"
              variant="outlined"
            >
              Create New Category
            </Button>
          </Box>
        )}

        {/* Loading state */}
        {loading && (
          <MenuItem disabled>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size="1rem" />
              <Typography variant="body2">Loading categories...</Typography>
            </Box>
          </MenuItem>
        )}

        {/* Category options */}
        {!loading && options.length > 0 ? (
          options.map((option) => (
            <MenuItem key={option.id} value={option.id}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                <Typography
                  variant="body2"
                  sx={{
                    pl: option.indentLevel * 2,
                    fontWeight: option.level === -1 ? 400 : 'inherit',
                    flex: 1
                  }}
                >
                  {option.name}
                </Typography>

                {option.level >= 0 && (
                  <Chip
                    label={`L${option.level}`}
                    size="small"
                    variant="outlined"
                    sx={{ height: 'auto', minHeight: '1.125rem', fontSize: '0.6rem' }}
                  />
                )}

                {option.productCount !== undefined && option.productCount > 0 && (
                  <Chip
                    label={option.productCount}
                    size="small"
                    color="default"
                    sx={{ height: 'auto', minHeight: '1.125rem' }}
                  />
                )}

              </Box>
            </MenuItem>
          ))
        ) : !loading && (
          <MenuItem disabled>
            <Typography variant="body2" color="text.secondary">
              No categories found
            </Typography>
          </MenuItem>
        )}
      </Select>

      {helperText && (
        <Typography variant="caption" color={error ? 'error' : 'text.secondary'} sx={{ mt: 0.5, ml: 1.5 }}>
          {helperText}
        </Typography>
      )}
    </FormControl>
  )
}

export default CategorySelector