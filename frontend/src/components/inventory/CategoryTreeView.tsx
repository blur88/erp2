import React, { useState, useCallback } from 'react'
import {
  Box,
  Typography,
  IconButton,
  Chip,
  Menu,
  MenuItem,
  Paper,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Collapse
} from '@mui/material'
import {
  ExpandMore,
  ArrowForwardIos,
  Add,
  Edit,
  Delete,
  DragIndicator,
  MoreVert,
  Folder,
  FolderOpen
} from '@mui/icons-material'
import { Category } from '@/types'
import { inventoryApi } from '@/services/inventoryApi'

interface CategoryTreeViewProps {
  categories: Category[]
  selectedCategory?: string | null
  onSelectCategory?: (category: Category | null) => void
  onCreateCategory?: (parentId?: string) => void
  onEditCategory?: (category: Category) => void
  onDeleteCategory?: (category: Category) => void
  onMoveCategory?: (categoryId: string, newParentId: string | null) => void
  showProductCount?: boolean
  showActions?: boolean
  loading?: boolean
  error?: string
}

interface CategoryMenuState {
  anchorEl: HTMLElement | null
  category: Category | null
}

const CategoryTreeView: React.FC<CategoryTreeViewProps> = ({
  categories,
  selectedCategory,
  onSelectCategory,
  onCreateCategory,
  onEditCategory,
  onDeleteCategory,
  onMoveCategory,
  showProductCount = true,
  showActions = true,
  loading = false,
  error = null
}) => {
  const [expanded, setExpanded] = useState<string[]>([])
  const [menuState, setMenuState] = useState<CategoryMenuState>({
    anchorEl: null,
    category: null
  })

  const handleToggle = useCallback((categoryId: string) => {
    setExpanded(prev => 
      prev.includes(categoryId) 
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    )
  }, [])

  const handleSelect = useCallback((category: Category) => {
    onSelectCategory?.(category)
  }, [onSelectCategory])

  const handleMenuOpen = useCallback((event: React.MouseEvent<HTMLElement>, category: Category) => {
    event.preventDefault()
    event.stopPropagation()
    setMenuState({
      anchorEl: event.currentTarget,
      category
    })
  }, [])

  const handleMenuClose = useCallback(() => {
    setMenuState({ anchorEl: null, category: null })
  }, [])

  const handleMenuAction = useCallback((action: string) => {
    const { category } = menuState
    if (!category) return

    switch (action) {
      case 'add':
        onCreateCategory?.(category.id)
        break
      case 'edit':
        onEditCategory?.(category)
        break
      case 'delete':
        onDeleteCategory?.(category)
        break
    }
    handleMenuClose()
  }, [menuState, onCreateCategory, onEditCategory, onDeleteCategory, handleMenuClose])

  const findCategoryById = (cats: Category[], id: string): Category | null => {
    for (const cat of cats) {
      if (cat.id === id) return cat
      if (cat.children) {
        const found = findCategoryById(cat.children, id)
        if (found) return found
      }
    }
    return null
  }

  const renderTreeItem = (category: Category, level: number = 0): React.ReactElement => {
    const hasChildren = category.children && category.children.length > 0
    const isExpanded = expanded.includes(category.id)
    const isSelected = selectedCategory === category.id

    return (
      <Box key={category.id}>
        <ListItem
          button
          onClick={() => handleSelect(category)}
          sx={{
            pl: level * 2 + 1,
            py: 0.5,
            borderRadius: 1,
            mb: 0.5,
            backgroundColor: isSelected ? 'primary.light' : 'transparent',
            '&:hover': {
              backgroundColor: isSelected ? 'primary.light' : 'action.hover',
            }
          }}
        >
          {/* Expand/Collapse button */}
          {hasChildren ? (
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation()
                handleToggle(category.id)
              }}
              sx={{ mr: 0.5, p: 0.25 }}
            >
              {isExpanded ? <ExpandMore fontSize="small" /> : <ArrowForwardIos fontSize="small" />}
            </IconButton>
          ) : (
            <Box sx={{ width: 24, mr: 0.5 }} />
          )}

          {/* Folder icon */}
          <ListItemIcon sx={{ minWidth: 32 }}>
            {hasChildren ? (
              isExpanded ? <FolderOpen color="primary" fontSize="small" /> : <Folder color="primary" fontSize="small" />
            ) : (
              <Folder sx={{ color: 'text.disabled' }} fontSize="small" />
            )}
          </ListItemIcon>

          {/* Category name and info */}
          <ListItemText
            primary={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography 
                  variant="body2" 
                  sx={{ 
                    fontWeight: isSelected ? 600 : 400,
                    color: !category.isActive ? 'text.disabled' : 'inherit'
                  }}
                >
                  {category.name}
                </Typography>

                {/* Level indicator */}
                {category.level > 0 && (
                  <Chip 
                    label={`L${category.level}`}
                    size="small"
                    variant="outlined"
                    sx={{ 
                      minWidth: 32, 
                      height: 18,
                      fontSize: '0.6rem'
                    }}
                  />
                )}

                {/* Product count */}
                {showProductCount && category.productCount !== undefined && (
                  <Chip 
                    label={category.productCount}
                    size="small"
                    color="default"
                    sx={{ minWidth: 32, height: 18 }}
                  />
                )}

                {/* Status indicator */}
                {!category.isActive && (
                  <Chip 
                    label="Inactive"
                    size="small"
                    color="error"
                    variant="outlined"
                    sx={{ height: 18 }}
                  />
                )}
              </Box>
            }
          />

          {/* Actions menu */}
          {showActions && (
            <IconButton
              size="small"
              onClick={(e) => handleMenuOpen(e, category)}
              sx={{ ml: 0.5 }}
            >
              <MoreVert fontSize="small" />
            </IconButton>
          )}
        </ListItem>

        {/* Children */}
        {hasChildren && (
          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
            {category.children!.map(child => renderTreeItem(child, level + 1))}
          </Collapse>
        )}
      </Box>
    )
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress size={40} />
      </Box>
    )
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        {error}
      </Alert>
    )
  }

  if (categories.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', p: 3, color: 'text.secondary' }}>
        <Folder sx={{ fontSize: 48, mb: 2, opacity: 0.5 }} />
        <Typography variant="body2">
          No categories found. Create your first category to get started.
        </Typography>
        {showActions && onCreateCategory && (
          <IconButton 
            color="primary" 
            onClick={() => onCreateCategory()}
            sx={{ mt: 1 }}
          >
            <Add />
          </IconButton>
        )}
      </Box>
    )
  }

  return (
    <Paper 
      variant="outlined" 
      sx={{ 
        maxHeight: 600, 
        overflow: 'auto'
      }}
    >
      <List dense sx={{ p: 1 }}>
        {categories.map(category => renderTreeItem(category, 0))}
      </List>

      {/* Context Menu */}
      <Menu
        anchorEl={menuState.anchorEl}
        open={Boolean(menuState.anchorEl)}
        onClose={handleMenuClose}
        PaperProps={{
          sx: { minWidth: 160 }
        }}
      >
        <MenuItem onClick={() => handleMenuAction('add')}>
          <Add fontSize="small" sx={{ mr: 1 }} />
          Add Subcategory
        </MenuItem>
        <MenuItem onClick={() => handleMenuAction('edit')}>
          <Edit fontSize="small" sx={{ mr: 1 }} />
          Edit Category
        </MenuItem>
        <MenuItem 
          onClick={() => handleMenuAction('delete')}
          sx={{ color: 'error.main' }}
        >
          <Delete fontSize="small" sx={{ mr: 1 }} />
          Delete Category
        </MenuItem>
      </Menu>
    </Paper>
  )
}

export default CategoryTreeView