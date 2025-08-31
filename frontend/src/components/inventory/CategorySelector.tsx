import React, { useState, useEffect, useCallback } from 'react'
import {
  Autocomplete,
  TextField,
  Box,
  Typography,
  Chip,
  CircularProgress,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Button
} from '@mui/material'
import { Folder, FolderOpen, Add, Clear } from '@mui/icons-material'
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
  excludeCategories = []
}) => {
  const [options, setOptions] = useState<CategoryOption[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  const loadCategories = useCallback(async () => {
    setLoading(true)
    try {
      const response = await inventoryApi.getCategoryTree(true)
      const flatCategories = flattenCategoryTree(response.data.data)
      
      // Filter out excluded categories
      const filteredCategories = flatCategories.filter(
        cat => !excludeCategories.includes(cat.id)
      )
      
      // Add root option if allowed
      const finalOptions = allowRoot ? [
        {
          id: '',
          name: 'No Category (Root Level)',
          displayName: 'No Category (Root Level)',
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

  const getOptionLabel = (option: CategoryOption | string) => {
    if (typeof option === 'string') return option
    return option.name
  }

  const isOptionEqualToValue = (option: CategoryOption, value: CategoryOption) => {
    return option.id === value.id
  }

  const renderOption = (props: any, option: CategoryOption) => (
    <ListItem {...props} key={option.id}>
      <ListItemIcon sx={{ minWidth: 32 }}>
        {option.level === -1 ? (
          <Clear fontSize="small" color="action" />
        ) : option.hasChildren ? (
          <FolderOpen fontSize="small" color="primary" />
        ) : (
          <Folder fontSize="small" color="action" />
        )}
      </ListItemIcon>
      <ListItemText>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography
            variant="body2"
            sx={{ 
              pl: option.indentLevel * 2,
              color: !option.isActive ? 'text.disabled' : 'inherit',
              fontWeight: option.level === -1 ? 400 : 'inherit'
            }}
          >
            {option.name}
          </Typography>
          
          {option.level >= 0 && (
            <Chip 
              label={`L${option.level}`}
              size="small"
              variant="outlined"
              sx={{ height: 18, fontSize: '0.6rem' }}
            />
          )}
          
          {option.productCount !== undefined && option.productCount > 0 && (
            <Chip 
              label={option.productCount}
              size="small"
              color="default"
              sx={{ height: 18 }}
            />
          )}
          
          {!option.isActive && option.level >= 0 && (
            <Chip 
              label="Inactive"
              size="small"
              color="error"
              variant="outlined"
              sx={{ height: 18 }}
            />
          )}
        </Box>
      </ListItemText>
    </ListItem>
  )

  const handleChange = (event: any, newValue: CategoryOption | null) => {
    if (!newValue || newValue.id === '') {
      onChange(null)
    } else {
      onChange(newValue)
    }
  }

  // Convert value to CategoryOption for Autocomplete
  const autocompleteValue = value ? {
    ...value,
    displayName: value.name,
    indentLevel: value.level || 0
  } as CategoryOption : null

  return (
    <Box>
      <Autocomplete
        open={open}
        onOpen={() => setOpen(true)}
        onClose={() => setOpen(false)}
        value={autocompleteValue}
        onChange={handleChange}
        options={options}
        loading={loading}
        disabled={disabled}
        getOptionLabel={getOptionLabel}
        isOptionEqualToValue={isOptionEqualToValue}
        renderOption={renderOption}
        renderInput={(params) => (
          <TextField
            {...params}
            label={label}
            placeholder={placeholder}
            required={required}
            error={error}
            helperText={helperText}
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <>
                  {loading ? <CircularProgress color="inherit" size={20} /> : null}
                  {params.InputProps.endAdornment}
                </>
              )
            }}
          />
        )}
        PaperComponent={(props) => (
          <Paper {...props}>
            {/* Create category button */}
            {showCreateButton && onCreateCategory && (
              <>
                <Box sx={{ p: 1 }}>
                  <Button
                    fullWidth
                    startIcon={<Add />}
                    onClick={onCreateCategory}
                    size="small"
                    variant="outlined"
                  >
                    Create New Category
                  </Button>
                </Box>
                <Divider />
              </>
            )}
            
            {/* Category options */}
            <List dense sx={{ maxHeight: 300, overflow: 'auto' }}>
              {props.children}
            </List>
          </Paper>
        )}
        noOptionsText={
          <Box sx={{ textAlign: 'center', p: 2, color: 'text.secondary' }}>
            {loading ? (
              <>
                <CircularProgress size={20} />
                <Typography variant="body2" sx={{ mt: 1 }}>
                  Loading categories...
                </Typography>
              </>
            ) : (
              <Typography variant="body2">
                No categories found
              </Typography>
            )}
          </Box>
        }
      />
    </Box>
  )
}

export default CategorySelector