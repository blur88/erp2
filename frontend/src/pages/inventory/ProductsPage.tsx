import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  Grid,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Alert,
  CircularProgress,
  useTheme,
  useMediaQuery,
} from '@mui/material'
import {
  Add as AddIcon,
  Search as SearchIcon,
  MoreVert as MoreIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  GetApp as ExportIcon,
  RestoreFromTrash as RestoreIcon,
  Refresh as RefreshIcon,
  DragIndicator as DragIndicatorIcon,
  Save as SaveIcon,
  Close as CancelIcon,
  Calculate as CalculateIcon,
} from '@mui/icons-material'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { useDispatch, useSelector } from 'react-redux'
import { useNotification } from '@/hooks/useNotification'
import DeletedProductsDialog from '@/components/inventory/DeletedProductsDialog'
import CalculatorDialog from '@/components/calculator/CalculatorDialog'
import type { Product } from '@/types'
import { formatCurrency } from '@/utils/currency'
import {
  fetchProducts,
  fetchCategories,
  createProduct,
  updateProduct,
  deleteProduct,
  selectProducts,
  selectCategories,
  selectInventoryLoading,
} from '@/store/slices/inventorySlice'


interface ProductFormData {
  name: string
  description: string
  barcode?: string
  type: 'goods' | 'service'
  categoryId: string
  baseCost: number
  retailPrice?: number
  wholesalePrice?: number
  specialPrice?: number
  currentStock: number
  notes: string
  isActive: boolean
}

const productSchema = yup.object({
  name: yup.string().required('Product name is required').min(2, 'Name must be at least 2 characters'),
  description: yup.string(),
  barcode: yup.string().optional(),
  type: yup.string().required('Product type is required'),
  categoryId: yup.string().required('Category is required').min(1, 'Please select a category'),
  baseCost: yup.number().required('Base cost is required').min(0, 'Cost must be positive'),
  retailPrice: yup.number().optional().min(0, 'Price must be positive'),
  wholesalePrice: yup.number().optional().min(0, 'Price must be positive'),
  specialPrice: yup.number().optional().min(0, 'Price must be positive'),
  currentStock: yup.number().required('Current stock is required').min(0, 'Stock must be non-negative'),
  notes: yup.string(),
  isActive: yup.boolean(),
})

const ProductsPage: React.FC = () => {
  const dispatch = useDispatch() as any
  const { showSuccess, showError } = useNotification()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const products = useSelector(selectProducts) || []
  const categories = useSelector(selectCategories) || []
  const loading = useSelector(selectInventoryLoading)
  
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [selectedProductForDetails, setSelectedProductForDetails] = useState<Product | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [deletedProductsDialogOpen, setDeletedProductsDialogOpen] = useState(false)
  const [calculatorDialogOpen, setCalculatorDialogOpen] = useState(false)
  const [calculatorInFormOpen, setCalculatorInFormOpen] = useState(false)
  const [inlineEditMode, setInlineEditMode] = useState(false)
  const [inlineEditData, setInlineEditData] = useState<ProductFormData | null>(null)
  const [focusedProductIndex, setFocusedProductIndex] = useState<number>(-1)
  const [duplicateNameError, setDuplicateNameError] = useState<string>('')
  const [isDuplicateName, setIsDuplicateName] = useState(false)
  const productListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    dispatch(fetchCategories({ includeProductCount: true }))
  }, [dispatch])

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      dispatch(fetchProducts({ search: searchTerm || undefined, categoryId: selectedCategory || undefined }))
    }, 500)

    return () => clearTimeout(timeoutId)
  }, [dispatch, searchTerm, selectedCategory])

  // Update selectedProductForDetails when products change (to reflect updates in detail view)
  useEffect(() => {
    if (selectedProductForDetails && products.length > 0) {
      const updatedProduct = products.find(p => p.id === selectedProductForDetails.id)
      if (updatedProduct) {
        // Only update if the product data has actually changed to avoid unnecessary re-renders
        const hasChanged = JSON.stringify(updatedProduct) !== JSON.stringify(selectedProductForDetails)
        if (hasChanged) {
          setSelectedProductForDetails(updatedProduct)
        }
      } else {
        // Product might have been deleted, clear selection
        setSelectedProductForDetails(null)
      }
    }
  }, [products, selectedProductForDetails])

  // Cancel inline editing when selected product changes
  useEffect(() => {
    if (inlineEditMode) {
      setInlineEditMode(false)
      setInlineEditData(null)
    }
  }, [selectedProductForDetails?.id])

  const handleRefresh = () => {
    dispatch(fetchProducts({ search: searchTerm || undefined, categoryId: selectedCategory || undefined }))
    dispatch(fetchCategories({ includeProductCount: true }))
  }

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormData>({
    resolver: yupResolver(productSchema) as any,
    defaultValues: {
      name: '',
      description: '',
      barcode: '',
      type: 'goods',
      categoryId: '',
      baseCost: 0,
      retailPrice: undefined,
      wholesalePrice: undefined,
      specialPrice: undefined,
      currentStock: 0,
      notes: '',
      isActive: true,
    },
  })

  // Watch form values for real-time profit margin calculation and duplicate name validation
  const baseCost = watch('baseCost')
  const retailPrice = watch('retailPrice')
  const wholesalePrice = watch('wholesalePrice')
  const specialPrice = watch('specialPrice')
  const watchedName = watch('name')

  // Calculate profit margins
  const calculateMargin = (sellingPrice: number | undefined, cost: number): number => {
    if (!cost || cost <= 0 || !sellingPrice || sellingPrice <= 0) return 0
    return ((sellingPrice - cost) / sellingPrice) * 100
  }


  const retailMargin = calculateMargin(retailPrice, baseCost)
  const wholesaleMargin = calculateMargin(wholesalePrice, baseCost)
  const specialMargin = calculateMargin(specialPrice, baseCost)

  // Real-time duplicate name checking
  useEffect(() => {
    if (!watchedName || watchedName.trim().length < 2) {
      setDuplicateNameError('')
      setIsDuplicateName(false)
      return
    }

    const trimmedName = watchedName.trim().toLowerCase()
    
    // Check for duplicate names in existing products
    const duplicateProduct = products.find(product => {
      // Skip self when editing
      if (editMode && selectedProduct && product.id === selectedProduct.id) {
        return false
      }
      return product.name.toLowerCase() === trimmedName
    })

    if (duplicateProduct) {
      setDuplicateNameError(`Product with name '${duplicateProduct.name}' already exists`)
      setIsDuplicateName(true)
    } else {
      setDuplicateNameError('')
      setIsDuplicateName(false)
    }
  }, [watchedName, products, editMode, selectedProduct])

  // Products are already filtered by backend search
  const filteredProducts = products || []

  // Paginated products
  const paginatedProducts = filteredProducts.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  )

  // Keyboard navigation handlers
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (paginatedProducts.length === 0) return

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setFocusedProductIndex(prev => {
          const nextIndex = prev < paginatedProducts.length - 1 ? prev + 1 : 0
          return nextIndex
        })
        break
      case 'ArrowUp':
        event.preventDefault()
        setFocusedProductIndex(prev => {
          const nextIndex = prev > 0 ? prev - 1 : paginatedProducts.length - 1
          return nextIndex
        })
        break
      case 'Enter':
        event.preventDefault()
        if (focusedProductIndex >= 0 && focusedProductIndex < paginatedProducts.length) {
          setSelectedProductForDetails(paginatedProducts[focusedProductIndex])
        }
        break
      case 'Home':
        event.preventDefault()
        setFocusedProductIndex(0)
        break
      case 'End':
        event.preventDefault()
        setFocusedProductIndex(paginatedProducts.length - 1)
        break
      case 'PageDown':
        event.preventDefault()
        setFocusedProductIndex(prev => {
          const nextIndex = Math.min(prev + 5, paginatedProducts.length - 1)
          return nextIndex >= 0 ? nextIndex : 0
        })
        break
      case 'PageUp':
        event.preventDefault()
        setFocusedProductIndex(prev => {
          const nextIndex = Math.max(prev - 5, 0)
          return nextIndex
        })
        break
      case 'Delete':
        if (focusedProductIndex >= 0 && focusedProductIndex < paginatedProducts.length) {
          event.preventDefault()
          handleDeleteProduct(paginatedProducts[focusedProductIndex])
        }
        break
      case 'e':
      case 'E':
        if (focusedProductIndex >= 0 && focusedProductIndex < paginatedProducts.length && !event.ctrlKey && !event.altKey && !event.metaKey) {
          event.preventDefault()
          handleEditProduct(paginatedProducts[focusedProductIndex])
        }
        break
      case 'Escape':
        event.preventDefault()
        setFocusedProductIndex(-1)
        break
      case 'f':
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
      case '+':
      case 'n':
      case 'N':
        if (!event.ctrlKey && !event.altKey && !event.metaKey) {
          event.preventDefault()
          handleAddProduct()
        }
        break
      default:
        break
    }
  }, [paginatedProducts, focusedProductIndex])

  // Reset focused index when products change or page changes
  useEffect(() => {
    setFocusedProductIndex(-1)
  }, [page, rowsPerPage, searchTerm, selectedCategory])

  // Auto-focus the first product when the list becomes available
  useEffect(() => {
    if (paginatedProducts.length > 0 && focusedProductIndex === -1) {
      // Only auto-focus if we don't have a selected product
      if (!selectedProductForDetails) {
        setFocusedProductIndex(0)
      }
    }
  }, [paginatedProducts, focusedProductIndex, selectedProductForDetails])

  // Auto-scroll to keep focused item visible
  useEffect(() => {
    if (focusedProductIndex >= 0 && productListRef.current) {
      const focusedRow = productListRef.current.querySelector(`[data-product-index="${focusedProductIndex}"]`)
      if (focusedRow) {
        focusedRow.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest'
        })
      }
    }
  }, [focusedProductIndex])


  const handleMenuClose = () => {
    setAnchorEl(null)
    setSelectedProduct(null)
  }

  const handleAddProduct = () => {
    reset()
    setEditMode(false)
    setSelectedProduct(null)
    setDialogOpen(true)
  }

  const handleCloseDialog = () => {
    setDialogOpen(false)
    setEditMode(false)
    setSelectedProduct(null)
    reset()
  }

  const handleEditProduct = (product: Product) => {
    setInlineEditMode(true)
    setInlineEditData({
      name: product.name,
      description: product.description || '',
      barcode: product.barcode || '',
      type: product.type || 'goods',
      categoryId: product.categoryId || product.category?.id || '',
      baseCost: product.baseCost || 0,
      retailPrice: product.retailPrice || undefined,
      wholesalePrice: product.wholesalePrice || undefined,
      specialPrice: product.specialPrice || undefined,
      currentStock: product.stockQuantity || 0,
      notes: product.notes || '',
      isActive: product.isActive,
    })
    // Close menu
    setAnchorEl(null)
  }

  const handleInlineEditCancel = () => {
    setInlineEditMode(false)
    setInlineEditData(null)
  }

  const handleInlineEditSave = async () => {
    if (!selectedProductForDetails || !inlineEditData) return
    
    try {
      // Validate categoryId is present and valid
      if (!inlineEditData.categoryId || inlineEditData.categoryId.trim() === '') {
        showError('Please select a category')
        return
      }
      
      const result = await dispatch(updateProduct({ 
        id: selectedProductForDetails.id, 
        data: inlineEditData 
      }))
      
      if (updateProduct.fulfilled.match(result)) {
        showSuccess('Product updated successfully')
        // Refresh the product list to ensure consistency
        dispatch(fetchProducts({ search: searchTerm || undefined, categoryId: selectedCategory || undefined }))
        setInlineEditMode(false)
        setInlineEditData(null)
      } else {
        throw new Error(result.payload as string)
      }
    } catch (error: any) {
      console.error('Inline product save error:', error)
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to save product'
      showError(errorMessage + '. Please try again.')
    }
  }

  const handleInlineEditChange = (field: keyof ProductFormData, value: any) => {
    if (inlineEditData) {
      setInlineEditData({
        ...inlineEditData,
        [field]: value
      })
    }
  }

  const handleDeleteProduct = async (product: Product) => {
    if (window.confirm(`Are you sure you want to delete ${product.name}?`)) {
      try {
        const result = await dispatch(deleteProduct(product.id))
        
        if (deleteProduct.fulfilled.match(result)) {
          showSuccess(`Product ${product.name} deleted successfully`)
          
          // If the deleted product was selected for details, clear the selection
          if (selectedProductForDetails?.id === product.id) {
            setSelectedProductForDetails(null)
          }
          
          // Refresh the product list to ensure consistency
          dispatch(fetchProducts({ search: searchTerm || undefined, categoryId: selectedCategory || undefined }))
        } else {
          throw new Error(result.payload as string)
        }
      } catch (error: any) {
        const errorMessage = error?.message || 'Failed to delete product. Please try again.'
        showError(errorMessage)
      }
    }
    handleMenuClose()
  }

  const onSubmit = async (data: ProductFormData) => {
    try {      
      // Validate categoryId is present and valid
      if (!data.categoryId || data.categoryId.trim() === '') {
        showError('Please select a category')
        return
      }
      
      if (editMode && selectedProduct) {
        // Update existing product
        const updateData = { ...data }
        const result = await dispatch(updateProduct({ id: selectedProduct.id, data: updateData }))
        
        if (updateProduct.fulfilled.match(result)) {
          showSuccess('Product updated successfully')
          // Refresh the product list to ensure consistency
          dispatch(fetchProducts({ search: searchTerm || undefined, categoryId: selectedCategory || undefined }))
        } else {
          throw new Error(result.payload as string)
        }
      } else {
        // Add new product - transform form data to match backend DTO
        const createData = {
          ...data,
          currentStock: data.currentStock, // Backend expects currentStock, not stockQuantity
          // Remove fields that shouldn't be sent to backend
          type: data.type === 'goods' || data.type === 'service' ? data.type : 'goods'
        }
        
        const result = await dispatch(createProduct(createData))
        
        // Check if the action was rejected
        if (createProduct.rejected.match(result)) {
          throw new Error(result.payload as string)
        }
        
        showSuccess('Product added successfully')
        // Refresh the product list to show the new product
        dispatch(fetchProducts({ search: searchTerm || undefined, categoryId: selectedCategory || undefined }))
      }
      
      handleCloseDialog()
    } catch (error: any) {
      console.error('Product save error:', error)
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to save product'
      showError(errorMessage + '. Please try again.')
    }
  }

  const getStockStatus = (product: any) => {
    const stock = product.stockQuantity || 0
    const reorderLevel = product.reorderLevel || 0
    
    if (stock <= 0) {
      return { label: 'Out of Stock', color: 'error' as const }
    } else if (stock <= reorderLevel) {
      return { label: 'Low Stock', color: 'warning' as const }
    } else {
      return { label: 'In Stock', color: 'success' as const }
    }
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
          <Typography variant={isMobile ? "h5" : "h4"} sx={{ fontWeight: 700, mb: 1 }}>
            Products
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage your product catalog and inventory ({filteredProducts.length} total)
          </Typography>
        </Box>
        <Box sx={{ 
          display: 'flex', 
          flexDirection: isMobile ? 'column' : 'row',
          gap: isMobile ? 1.5 : 2,
          alignItems: isMobile ? 'stretch' : 'center'
        }}>
          <Button
            variant="outlined"
            startIcon={!isMobile ? <RefreshIcon /> : undefined}
            onClick={handleRefresh}
            disabled={loading?.products}
            size={isMobile ? "medium" : "medium"}
            fullWidth={isMobile}
          >
            {isMobile ? "Refresh Products" : "Refresh"}
          </Button>
          <Button
            variant="outlined"
            startIcon={!isMobile ? <CalculateIcon /> : undefined}
            onClick={() => setCalculatorDialogOpen(true)}
            size={isMobile ? "medium" : "medium"}
            fullWidth={isMobile}
            sx={{
              color: 'info.main',
              borderColor: 'info.main',
              '&:hover': {
                borderColor: 'info.dark',
                backgroundColor: 'info.light'
              }
            }}
          >
            {isMobile ? "Calculator" : "Calculator"}
          </Button>
          <Button
            variant="outlined"
            startIcon={!isMobile ? <RestoreIcon /> : undefined}
            onClick={() => setDeletedProductsDialogOpen(true)}
            size={isMobile ? "medium" : "medium"}
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
            size={isMobile ? "medium" : "large"}
            onClick={handleAddProduct}
            fullWidth={isMobile}
            sx={{
              py: isMobile ? 1.5 : 1,
              fontWeight: 600
            }}
          >
            {isMobile ? "Add New Product" : "Add Product"}
          </Button>
        </Box>
      </Box>

      {/* Filters and Search */}
      <Box sx={{ 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row',
        gap: 2,
        alignItems: isMobile ? 'stretch' : 'center',
        mb: 3,
        '& > *': {
          alignSelf: isMobile ? 'stretch' : 'flex-start'
        }
      }}>
        <TextField
          placeholder="Search by name, barcode, or brand..."
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
        <FormControl 
          size="medium" 
          sx={{ 
            minWidth: isMobile ? 'auto' : 180,
            flex: 'none'
          }}
        >
          <InputLabel 
            sx={{ 
              fontSize: '0.875rem',
              '&.MuiInputLabel-shrunk': {
                fontSize: '0.75rem'
              }
            }}
          >
            Category
          </InputLabel>
          <Select
            value={selectedCategory}
            label="Category"
            onChange={(e) => setSelectedCategory(e.target.value)}
            sx={{
              height: '40px',
              fontSize: '0.875rem',
              '& .MuiSelect-select': {
                display: 'flex',
                alignItems: 'center',
                fontSize: '0.875rem',
                padding: '8.5px 14px',
                height: '40px',
                boxSizing: 'border-box'
              },
              '& .MuiOutlinedInput-notchedOutline': {
                borderColor: 'rgba(0, 0, 0, 0.23)'
              },
              '&:hover .MuiOutlinedInput-notchedOutline': {
                borderColor: 'rgba(0, 0, 0, 0.87)'
              },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                borderColor: theme.palette.primary.main,
                borderWidth: 2
              }
            }}
          >
            <MenuItem value="" sx={{ fontSize: '0.875rem' }}>
              All Categories
            </MenuItem>
            {categories.map((category: any) => (
              <MenuItem key={category.id} value={category.id} sx={{ fontSize: '0.875rem' }}>
                {category.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button
          variant="outlined"
          startIcon={<ExportIcon />}
          size="medium"
          sx={{ 
            flex: 'none',
            height: '40px',
            fontSize: '0.875rem',
            fontWeight: 500
          }}
        >
          Export
        </Button>
      </Box>

      {/* Split Layout: Active Products and Product Details */}
      <Grid container spacing={3}>
        {/* Left Side - Active Products List */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 1.5, borderBottom: '1px solid rgba(224, 224, 224, 0.4)' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem' }}>
                  Product List ({filteredProducts.length})
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      px: 0.5, 
                      py: 0.2, 
                      backgroundColor: 'grey.100', 
                      borderRadius: 0.5, 
                      fontSize: '0.6rem',
                      fontFamily: 'monospace',
                      color: 'text.secondary'
                    }}>
                      ↑↓
                    </Box>
                    <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
                      Navigate
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      px: 0.5, 
                      py: 0.2, 
                      backgroundColor: 'grey.100', 
                      borderRadius: 0.5, 
                      fontSize: '0.6rem',
                      fontFamily: 'monospace',
                      color: 'text.secondary'
                    }}>
                      Enter
                    </Box>
                    <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
                      Select
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      px: 0.5, 
                      py: 0.2, 
                      backgroundColor: 'grey.100', 
                      borderRadius: 0.5, 
                      fontSize: '0.6rem',
                      fontFamily: 'monospace',
                      color: 'text.secondary'
                    }}>
                      E
                    </Box>
                    <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
                      Edit
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      px: 0.5, 
                      py: 0.2, 
                      backgroundColor: 'grey.100', 
                      borderRadius: 0.5, 
                      fontSize: '0.6rem',
                      fontFamily: 'monospace',
                      color: 'text.secondary'
                    }}>
                      Del
                    </Box>
                    <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
                      Delete
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </Box>
            <Box 
              sx={{ 
                flex: 1, 
                overflow: 'hidden', 
                display: 'flex', 
                flexDirection: 'column',
                '&:focus': {
                  outline: '2px solid',
                  outlineColor: 'primary.main',
                  outlineOffset: '-2px'
                }
              }}
              ref={productListRef}
              tabIndex={0}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                // Auto-focus first product when the container gets focus
                if (paginatedProducts.length > 0 && focusedProductIndex === -1) {
                  setFocusedProductIndex(0)
                }
              }}
            >
              {loading?.products ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
                  <CircularProgress />
                </Box>
              ) : filteredProducts.length === 0 ? (
                <Box sx={{ p: 4, textAlign: 'center', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography variant="body1" color="text.secondary">
                    No products found. Create your first product to get started.
                  </Typography>
                </Box>
              ) : (
                <>
                  <TableContainer sx={{ flex: 1, overflowX: 'auto' }}>
                    <Table 
                      size="small" 
                      stickyHeader
                      sx={{ 
                        '& .MuiTableCell-root': { 
                          borderBottom: '1px solid rgba(224, 224, 224, 0.4)',
                          py: 0.5,
                          px: 1
                        }
                      }}
                    >
                      <TableBody>
                        {paginatedProducts.map((product: any, index: number) => {
                          const isSelected = selectedProductForDetails?.id === product.id
                          const isFocused = focusedProductIndex === index
                          return (
                            <TableRow 
                              key={product.id}
                              data-product-index={index}
                              hover
                              tabIndex={-1}
                              onClick={() => {
                                setSelectedProductForDetails(product)
                                setFocusedProductIndex(index)
                              }}
                              sx={{
                                cursor: 'pointer',
                                backgroundColor: isSelected 
                                  ? 'action.selected' 
                                  : isFocused 
                                    ? 'primary.light'
                                    : 'inherit',
                                '&:hover': {
                                  backgroundColor: isSelected 
                                    ? 'action.selected' 
                                    : isFocused 
                                      ? 'primary.light'
                                      : 'action.hover'
                                },
                                transition: 'background-color 0.2s ease',
                                height: 36,
                                ...(isFocused && {
                                  outline: `2px solid ${theme.palette.primary.main}`,
                                  outlineOffset: '-2px'
                                })
                              }}
                            >
                              <TableCell sx={{ py: 0.5 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <DragIndicatorIcon sx={{ color: 'text.secondary', fontSize: '0.875rem' }} />
                                  <Typography variant="body2" sx={{ fontSize: '0.75rem', lineHeight: 1.1 }}>
                                    {product.name}
                                  </Typography>
                                </Box>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  <Box sx={{ borderTop: '1px solid rgba(224, 224, 224, 0.4)' }}>
                    <TablePagination
                      rowsPerPageOptions={[5, 10, 25, 50]}
                      component="div"
                      count={filteredProducts.length}
                      rowsPerPage={rowsPerPage}
                      page={page}
                      onPageChange={(_, newPage) => setPage(newPage)}
                      onRowsPerPageChange={(e) => {
                        setRowsPerPage(parseInt(e.target.value, 10))
                        setPage(0)
                      }}
                      size="small"
                    />
                  </Box>
                </>
              )}
            </Box>
          </Paper>
        </Grid>

        {/* Right Side - Product Details View */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 1.5, borderBottom: '1px solid rgba(224, 224, 224, 0.4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem' }}>
                {selectedProductForDetails ? 'Product Details' : 'Select Product'}
              </Typography>
              {selectedProductForDetails && (
                <Box 
                  className="product-actions"
                  sx={{ 
                    display: 'flex', 
                    gap: 0.25,
                    opacity: 0.7,
                    transition: 'opacity 0.2s ease'
                  }}
                >
                  {inlineEditMode ? (
                    <>
                      <IconButton
                        size="small"
                        title="Save changes"
                        aria-label="Save changes"
                        onClick={handleInlineEditSave}
                        sx={{
                          '&:hover': {
                            backgroundColor: 'success.light',
                            color: 'success.main'
                          },
                          p: 0.5
                        }}
                      >
                        <SaveIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        title="Cancel editing"
                        aria-label="Cancel editing"
                        onClick={handleInlineEditCancel}
                        sx={{
                          '&:hover': {
                            backgroundColor: 'error.light',
                            color: 'error.main'
                          },
                          p: 0.5
                        }}
                      >
                        <CancelIcon fontSize="small" />
                      </IconButton>
                    </>
                  ) : (
                    <>
                      <IconButton
                        size="small"
                        title={`Edit ${selectedProductForDetails.name}`}
                        aria-label={`Edit product ${selectedProductForDetails.name}`}
                        onClick={() => handleEditProduct(selectedProductForDetails)}
                        sx={{
                          '&:hover': {
                            backgroundColor: 'action.hover',
                            color: 'primary.main'
                          },
                          p: 0.5
                        }}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        title={`Delete ${selectedProductForDetails.name}`}
                        aria-label={`Delete product ${selectedProductForDetails.name}`}
                        onClick={() => handleDeleteProduct(selectedProductForDetails)}
                        sx={{
                          '&:hover': {
                            backgroundColor: 'error.light',
                            color: 'error.main'
                          },
                          p: 0.5
                        }}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </>
                  )}
                </Box>
              )}
            </Box>
            <Box sx={{ flex: 1, overflow: 'auto', p: 1.5 }}>
              {!selectedProductForDetails ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                  <Typography variant="body1" color="text.secondary" textAlign="center">
                    Select a product from the list to view its details
                  </Typography>
                </Box>
              ) : (
                <TableContainer>
                  <Table 
                    size="small" 
                    sx={{ 
                      '& .MuiTableCell-root': { 
                        border: 'none', 
                        py: 0.75, 
                        px: 1.5,
                        ...(isMobile && {
                          px: 1,
                          py: 0.5,
                          fontSize: '0.75rem'
                        })
                      }
                    }}
                  >
                    <TableBody>
                      {/* Basic Information Section */}
                      <TableRow>
                        <TableCell colSpan={2} sx={{ pb: 0.5, py: 0.5 }}>
                          <Typography variant="h6" sx={{ 
                            fontWeight: 600, 
                            color: 'primary.main', 
                            fontSize: '0.75rem'
                          }}>
                            Basic Information
                          </Typography>
                        </TableCell>
                      </TableRow>
                      <TableRow sx={{ backgroundColor: 'grey.50' }}>
                        <TableCell sx={{ 
                          fontWeight: 500, 
                          color: 'text.secondary', 
                          width: isMobile ? '40%' : '35%',
                          minWidth: isMobile ? 'auto' : '120px',
                          fontSize: '0.75rem'
                        }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <DragIndicatorIcon sx={{ color: 'text.secondary', fontSize: '1rem' }} />
                            Product Name
                          </Box>
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                          {inlineEditMode && inlineEditData ? (
                            <TextField
                              value={inlineEditData.name}
                              onChange={(e) => handleInlineEditChange('name', e.target.value)}
                              size="small"
                              fullWidth
                              sx={{
                                '& .MuiOutlinedInput-root': {
                                  fontSize: '0.8rem',
                                  height: '28px'
                                }
                              }}
                            />
                          ) : (
                            selectedProductForDetails.name
                          )}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 500, color: 'text.secondary', fontSize: '0.8rem' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <DragIndicatorIcon sx={{ color: 'text.secondary', fontSize: '1rem' }} />
                            Barcode
                          </Box>
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem' }}>
                          {inlineEditMode && inlineEditData ? (
                            <TextField
                              value={inlineEditData.barcode}
                              onChange={(e) => handleInlineEditChange('barcode', e.target.value)}
                              size="small"
                              fullWidth
                              sx={{
                                '& .MuiOutlinedInput-root': {
                                  fontSize: '0.8rem',
                                  height: '28px'
                                }
                              }}
                            />
                          ) : (
                            selectedProductForDetails.barcode
                          )}
                        </TableCell>
                      </TableRow>
                      <TableRow sx={{ backgroundColor: 'grey.50' }}>
                        <TableCell sx={{ fontWeight: 500, color: 'text.secondary', fontSize: '0.8rem' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <DragIndicatorIcon sx={{ color: 'text.secondary', fontSize: '1rem' }} />
                            Type
                          </Box>
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem' }}>
                          {inlineEditMode && inlineEditData ? (
                            <FormControl fullWidth size="small">
                              <Select 
                                value={inlineEditData.type}
                                onChange={(e) => handleInlineEditChange('type', e.target.value)}
                                sx={{
                                  '& .MuiSelect-select': { 
                                    fontSize: '0.8rem',
                                    height: '28px',
                                    padding: '4px 8px'
                                  }
                                }}
                              >
                                <MenuItem value="goods" sx={{ fontSize: '0.8rem' }}>
                                  Stocked Product
                                </MenuItem>
                                <MenuItem value="service" sx={{ fontSize: '0.8rem' }}>
                                  Service
                                </MenuItem>
                              </Select>
                            </FormControl>
                          ) : (
                            selectedProductForDetails.type === 'goods' ? 'Stocked Product' : 'Service'
                          )}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 500, color: 'text.secondary', fontSize: '0.8rem' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <DragIndicatorIcon sx={{ color: 'text.secondary', fontSize: '1rem' }} />
                            Category
                          </Box>
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem' }}>
                          {inlineEditMode && inlineEditData ? (
                            <FormControl fullWidth size="small">
                              <Select 
                                value={inlineEditData.categoryId}
                                onChange={(e) => handleInlineEditChange('categoryId', e.target.value)}
                                sx={{
                                  '& .MuiSelect-select': { 
                                    fontSize: '0.8rem',
                                    height: '28px',
                                    padding: '4px 8px'
                                  }
                                }}
                              >
                                {categories && categories.length > 0 ? (
                                  categories.map((category: any) => (
                                    <MenuItem key={category.id} value={category.id} sx={{ fontSize: '0.8rem' }}>
                                      {category.name}
                                    </MenuItem>
                                  ))
                                ) : (
                                  <MenuItem value="" disabled sx={{ fontSize: '0.8rem' }}>
                                    No categories available
                                  </MenuItem>
                                )}
                              </Select>
                            </FormControl>
                          ) : (
                            selectedProductForDetails.category?.name || 'No Category'
                          )}
                        </TableCell>
                      </TableRow>
                      {selectedProductForDetails.description && (
                        <TableRow sx={{ backgroundColor: 'grey.50' }}>
                          <TableCell sx={{ fontWeight: 500, color: 'text.secondary', fontSize: '0.8rem' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <DragIndicatorIcon sx={{ color: 'text.secondary', fontSize: '1rem' }} />
                              Description
                            </Box>
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.8rem' }}>
                            {inlineEditMode && inlineEditData ? (
                              <TextField
                                value={inlineEditData.description}
                                onChange={(e) => handleInlineEditChange('description', e.target.value)}
                                size="small"
                                fullWidth
                                multiline
                                rows={2}
                                sx={{
                                  '& .MuiOutlinedInput-root': {
                                    fontSize: '0.8rem'
                                  }
                                }}
                              />
                            ) : (
                              selectedProductForDetails.description
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                      
                      {/* Pricing Information Section */}
                      <TableRow>
                        <TableCell colSpan={3} sx={{ pt: 1.5, pb: 0.5 }}>
                          <Typography variant="h6" sx={{ 
                            fontWeight: 600, 
                            color: 'primary.main', 
                            fontSize: '0.75rem'
                          }}>
                            Pricing Information
                          </Typography>
                        </TableCell>
                      </TableRow>
                      <TableRow sx={{ backgroundColor: 'grey.50' }}>
                        <TableCell sx={{ fontWeight: 500, color: 'text.secondary', fontSize: '0.8rem' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <DragIndicatorIcon sx={{ color: 'text.secondary', fontSize: '1rem' }} />
                            Base Cost
                          </Box>
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem' }}>
                          {inlineEditMode && inlineEditData ? (
                            <TextField
                              value={inlineEditData.baseCost}
                              onChange={(e) => handleInlineEditChange('baseCost', parseFloat(e.target.value) || 0)}
                              size="small"
                              type="number"
                              inputProps={{ step: 0.01, min: 0 }}
                              InputProps={{
                                startAdornment: <InputAdornment position="start">RM</InputAdornment>
                              }}
                              sx={{
                                '& .MuiOutlinedInput-root': {
                                  fontSize: '0.8rem',
                                  height: '28px'
                                }
                              }}
                            />
                          ) : (
                            formatCurrency(selectedProductForDetails.baseCost)
                          )}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 500, color: 'text.secondary', fontSize: '0.8rem' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <DragIndicatorIcon sx={{ color: 'text.secondary', fontSize: '1rem' }} />
                            Retail Price
                          </Box>
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem' }}>
                          {inlineEditMode && inlineEditData ? (
                            <TextField
                              value={inlineEditData.retailPrice}
                              onChange={(e) => handleInlineEditChange('retailPrice', parseFloat(e.target.value) || 0)}
                              size="small"
                              type="number"
                              inputProps={{ step: 0.01, min: 0 }}
                              InputProps={{
                                startAdornment: <InputAdornment position="start">RM</InputAdornment>
                              }}
                              sx={{
                                '& .MuiOutlinedInput-root': {
                                  fontSize: '0.8rem',
                                  height: '28px'
                                }
                              }}
                            />
                          ) : (
                            <Typography sx={{ fontWeight: 600, color: 'success.main', fontSize: '0.8rem' }}>
                              {formatCurrency(selectedProductForDetails.retailPrice)}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem' }}>
                          {inlineEditMode && inlineEditData ? (
                            calculateMargin(inlineEditData.retailPrice, inlineEditData.baseCost) > 0 && (
                              <Chip
                                label={`${calculateMargin(inlineEditData.retailPrice, inlineEditData.baseCost).toFixed(1)}%`}
                                size="small"
                                variant="outlined"
                                color={calculateMargin(inlineEditData.retailPrice, inlineEditData.baseCost) > 20 ? 'success' : calculateMargin(inlineEditData.retailPrice, inlineEditData.baseCost) > 10 ? 'warning' : 'error'}
                                sx={{
                                  fontSize: '0.65rem',
                                  fontWeight: 500,
                                  height: 18,
                                  minWidth: 42
                                }}
                              />
                            )
                          ) : (
                            selectedProductForDetails.grossMarginRetail !== undefined && (
                              <Chip
                                label={`${selectedProductForDetails.grossMarginRetail?.toFixed(1) || '0.0'}%`}
                                size="small"
                                variant="outlined"
                                color={selectedProductForDetails.grossMarginRetail > 20 ? 'success' : selectedProductForDetails.grossMarginRetail > 10 ? 'warning' : 'error'}
                                sx={{
                                  fontSize: '0.65rem',
                                  fontWeight: 500,
                                  height: 18,
                                  minWidth: 42
                                }}
                              />
                            )
                          )}
                        </TableCell>
                      </TableRow>
                      <TableRow sx={{ backgroundColor: 'grey.50' }}>
                        <TableCell sx={{ fontWeight: 500, color: 'text.secondary', fontSize: '0.8rem' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <DragIndicatorIcon sx={{ color: 'text.secondary', fontSize: '1rem' }} />
                            Wholesale Price
                          </Box>
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem' }}>
                          {inlineEditMode && inlineEditData ? (
                            <TextField
                              value={inlineEditData.wholesalePrice}
                              onChange={(e) => handleInlineEditChange('wholesalePrice', parseFloat(e.target.value) || 0)}
                              size="small"
                              type="number"
                              inputProps={{ step: 0.01, min: 0 }}
                              InputProps={{
                                startAdornment: <InputAdornment position="start">RM</InputAdornment>
                              }}
                              sx={{
                                '& .MuiOutlinedInput-root': {
                                  fontSize: '0.8rem',
                                  height: '28px'
                                }
                              }}
                            />
                          ) : (
                            <Typography sx={{ fontSize: '0.8rem' }}>
                              {formatCurrency(selectedProductForDetails.wholesalePrice)}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem' }}>
                          {inlineEditMode && inlineEditData ? (
                            calculateMargin(inlineEditData.wholesalePrice, inlineEditData.baseCost) > 0 && (
                              <Chip
                                label={`${calculateMargin(inlineEditData.wholesalePrice, inlineEditData.baseCost).toFixed(1)}%`}
                                size="small"
                                variant="outlined"
                                color={calculateMargin(inlineEditData.wholesalePrice, inlineEditData.baseCost) > 15 ? 'success' : calculateMargin(inlineEditData.wholesalePrice, inlineEditData.baseCost) > 5 ? 'warning' : 'error'}
                                sx={{
                                  fontSize: '0.65rem',
                                  fontWeight: 500,
                                  height: 18,
                                  minWidth: 42
                                }}
                              />
                            )
                          ) : (
                            selectedProductForDetails.grossMarginWholesale !== undefined && (
                              <Chip
                                label={`${selectedProductForDetails.grossMarginWholesale?.toFixed(1) || '0.0'}%`}
                                size="small"
                                variant="outlined"
                                color={selectedProductForDetails.grossMarginWholesale > 15 ? 'success' : selectedProductForDetails.grossMarginWholesale > 5 ? 'warning' : 'error'}
                                sx={{
                                  fontSize: '0.65rem',
                                  fontWeight: 500,
                                  height: 18,
                                  minWidth: 42
                                }}
                              />
                            )
                          )}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 500, color: 'text.secondary', fontSize: '0.8rem' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <DragIndicatorIcon sx={{ color: 'text.secondary', fontSize: '1rem' }} />
                            Special Price
                          </Box>
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem' }}>
                          {inlineEditMode && inlineEditData ? (
                            <TextField
                              value={inlineEditData.specialPrice}
                              onChange={(e) => handleInlineEditChange('specialPrice', parseFloat(e.target.value) || 0)}
                              size="small"
                              type="number"
                              inputProps={{ step: 0.01, min: 0 }}
                              InputProps={{
                                startAdornment: <InputAdornment position="start">RM</InputAdornment>
                              }}
                              sx={{
                                '& .MuiOutlinedInput-root': {
                                  fontSize: '0.8rem',
                                  height: '28px'
                                }
                              }}
                            />
                          ) : (
                            <Typography sx={{ fontSize: '0.8rem' }}>
                              {formatCurrency(selectedProductForDetails.specialPrice)}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem' }}>
                          {inlineEditMode && inlineEditData ? (
                            calculateMargin(inlineEditData.specialPrice, inlineEditData.baseCost) > 0 && (
                              <Chip
                                label={`${calculateMargin(inlineEditData.specialPrice, inlineEditData.baseCost).toFixed(1)}%`}
                                size="small"
                                variant="outlined"
                                color={calculateMargin(inlineEditData.specialPrice, inlineEditData.baseCost) > 15 ? 'success' : calculateMargin(inlineEditData.specialPrice, inlineEditData.baseCost) > 5 ? 'warning' : 'error'}
                                sx={{
                                  fontSize: '0.65rem',
                                  fontWeight: 500,
                                  height: 18,
                                  minWidth: 42
                                }}
                              />
                            )
                          ) : (
                            selectedProductForDetails.grossMarginSpecial !== undefined && (
                              <Chip
                                label={`${selectedProductForDetails.grossMarginSpecial?.toFixed(1) || '0.0'}%`}
                                size="small"
                                variant="outlined"
                                color={selectedProductForDetails.grossMarginSpecial > 15 ? 'success' : selectedProductForDetails.grossMarginSpecial > 5 ? 'warning' : 'error'}
                                sx={{
                                  fontSize: '0.65rem',
                                  fontWeight: 500,
                                  height: 18,
                                  minWidth: 42
                                }}
                              />
                            )
                          )}
                        </TableCell>
                      </TableRow>
                      
                      {/* Stock Information Section */}
                      <TableRow>
                        <TableCell colSpan={3} sx={{ pt: 1.5, pb: 0.5 }}>
                          <Typography variant="h6" sx={{ 
                            fontWeight: 600, 
                            color: 'primary.main', 
                            fontSize: '0.75rem'
                          }}>
                            Stock Information
                          </Typography>
                        </TableCell>
                      </TableRow>
                      <TableRow sx={{ backgroundColor: 'grey.50' }}>
                        <TableCell sx={{ fontWeight: 500, color: 'text.secondary', fontSize: '0.8rem' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <DragIndicatorIcon sx={{ color: 'text.secondary', fontSize: '1rem' }} />
                            Current Stock
                          </Box>
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem' }}>
                          {inlineEditMode && inlineEditData ? (
                            <TextField
                              value={inlineEditData.currentStock}
                              onChange={(e) => handleInlineEditChange('currentStock', parseInt(e.target.value) || 0)}
                              size="small"
                              type="number"
                              inputProps={{ step: 1, min: 0 }}
                              sx={{
                                '& .MuiOutlinedInput-root': {
                                  fontSize: '0.8rem',
                                  height: '28px'
                                }
                              }}
                            />
                          ) : (
                            <Typography variant="body1" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                              {selectedProductForDetails.stockQuantity || 0}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem' }}>
                          {!inlineEditMode && (
                            <Chip
                              label={getStockStatus(selectedProductForDetails).label}
                              color={getStockStatus(selectedProductForDetails).color}
                              size="small"
                              variant="outlined"
                              sx={{
                                fontSize: '0.7rem',
                                fontWeight: 500,
                                height: 20
                              }}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                      
                      {/* Notes Section */}
                      <TableRow>
                        <TableCell colSpan={2} sx={{ pt: 1.5, pb: 0.5 }}>
                          <Typography variant="h6" sx={{ 
                            fontWeight: 600, 
                            color: 'primary.main', 
                            fontSize: '0.75rem'
                          }}>
                            Notes
                          </Typography>
                        </TableCell>
                      </TableRow>
                      <TableRow sx={{ backgroundColor: 'grey.50' }}>
                        <TableCell colSpan={2} sx={{ p: 1.5 }}>
                          {inlineEditMode && inlineEditData ? (
                            <TextField
                              value={inlineEditData.notes}
                              onChange={(e) => handleInlineEditChange('notes', e.target.value)}
                              multiline
                              rows={3}
                              fullWidth
                              placeholder="Add notes about this product..."
                              sx={{
                                '& .MuiOutlinedInput-root': {
                                  fontSize: '0.8rem',
                                  backgroundColor: 'background.paper'
                                }
                              }}
                            />
                          ) : (
                            <Box sx={{ 
                              minHeight: 80,
                              border: selectedProductForDetails.notes ? 'none' : '1px dashed rgba(0, 0, 0, 0.12)',
                              borderRadius: 1,
                              display: 'flex',
                              alignItems: selectedProductForDetails.notes ? 'flex-start' : 'center',
                              justifyContent: selectedProductForDetails.notes ? 'flex-start' : 'center',
                              backgroundColor: 'grey.50',
                              p: selectedProductForDetails.notes ? 1 : 0
                            }}>
                              {selectedProductForDetails.notes ? (
                                <Typography variant="body2" sx={{ 
                                  fontSize: '0.8rem', 
                                  lineHeight: 1.4,
                                  whiteSpace: 'pre-wrap'
                                }}>
                                  {selectedProductForDetails.notes}
                                </Typography>
                              ) : (
                                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem', fontStyle: 'italic' }}>
                                  No notes available
                                </Typography>
                              )}
                            </Box>
                          )}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Context Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => selectedProduct && handleEditProduct(selectedProduct)}>
          <ViewIcon sx={{ mr: 1 }} fontSize="small" />
          View Details
        </MenuItem>
      </Menu>

      {/* Product Form Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            maxHeight: '90vh',
            '& .MuiDialogContent-root': {
              paddingTop: '8px !important'
            }
          }
        }}
      >
        <DialogTitle sx={{ pb: 1 }}>
          {editMode ? 'Edit Product' : 'Add New Product'}
          {selectedProduct && editMode && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Editing: {selectedProduct.name}
            </Typography>
          )}
        </DialogTitle>
        <form onSubmit={handleSubmit(onSubmit as any)}>
          <DialogContent sx={{ py: 1 }}>
            <Grid container spacing={2}>
              {/* Basic Information Row */}
              <Grid item xs={12} sm={6}>
                <Controller
                  name="name"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      size="small"
                      label="Product Name"
                      error={!!errors.name || isDuplicateName}
                      helperText={errors.name?.message || duplicateNameError}
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          '&.Mui-error': {
                            '& fieldset': {
                              borderColor: isDuplicateName ? 'error.main' : undefined
                            }
                          }
                        }
                      }}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <Controller
                  name="barcode"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      size="small"
                      label="Barcode"
                      error={!!errors.barcode}
                      helperText={errors.barcode?.message}
                    />
                  )}
                />
              </Grid>

              {/* Type and Category Row */}
              <Grid item xs={12} sm={6}>
                <Controller
                  name="type"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth size="small" error={!!errors.type}>
                      <InputLabel>Type</InputLabel>
                      <Select {...field} label="Type">
                        <MenuItem value="goods">Stocked Product</MenuItem>
                        <MenuItem value="service">Service</MenuItem>
                      </Select>
                      {errors.type && (
                        <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.5, fontSize: '0.75rem' }}>
                          {errors.type.message}
                        </Typography>
                      )}
                    </FormControl>
                  )}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <Controller
                  name="categoryId"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth size="small" error={!!errors.categoryId}>
                      <InputLabel>Category</InputLabel>
                      <Select {...field} label="Category">
                        {categories && categories.length > 0 ? (
                          categories.map((category: any) => (
                            <MenuItem key={category.id} value={category.id}>
                              {category.name}
                            </MenuItem>
                          ))
                        ) : (
                          <MenuItem value="" disabled>
                            No categories available
                          </MenuItem>
                        )}
                      </Select>
                      {errors.categoryId && (
                        <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.5, fontSize: '0.75rem' }}>
                          {errors.categoryId.message}
                        </Typography>
                      )}
                    </FormControl>
                  )}
                />
              </Grid>

              {/* Cost and Stock Row */}
              <Grid item xs={12} sm={6}>
                <Controller
                  name="baseCost"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      size="small"
                      label="Base Cost"
                      type="number"
                      inputProps={{ step: 0.01, min: 0 }}
                      InputProps={{
                        startAdornment: <InputAdornment position="start">RM</InputAdornment>
                      }}
                      error={!!errors.baseCost}
                      helperText={errors.baseCost?.message}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <Controller
                  name="currentStock"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      size="small"
                      label="Current Stock"
                      type="number"
                      inputProps={{ step: 1, min: 0 }}
                      error={!!errors.currentStock}
                      helperText={errors.currentStock?.message}
                    />
                  )}
                />
              </Grid>

              {/* Pricing Row */}
              <Grid item xs={12} sm={4}>
                <Controller
                  name="retailPrice"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      size="small"
                      label="Retail Price"
                      type="number"
                      inputProps={{ step: 0.01, min: 0 }}
                      InputProps={{
                        startAdornment: <InputAdornment position="start">RM</InputAdornment>,
                        endAdornment: retailMargin > 0 && (
                          <InputAdornment position="end">
                            <Chip
                              label={`${retailMargin.toFixed(0)}%`}
                              size="small"
                              variant="outlined"
                              color={retailMargin > 20 ? 'success' : retailMargin > 10 ? 'warning' : 'error'}
                              sx={{ fontSize: '0.65rem', height: 18, minWidth: 35 }}
                            />
                          </InputAdornment>
                        )
                      }}
                      error={!!errors.retailPrice}
                      helperText={errors.retailPrice?.message}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <Controller
                  name="wholesalePrice"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      size="small"
                      label="Wholesale Price"
                      type="number"
                      inputProps={{ step: 0.01, min: 0 }}
                      InputProps={{
                        startAdornment: <InputAdornment position="start">RM</InputAdornment>,
                        endAdornment: wholesaleMargin > 0 && (
                          <InputAdornment position="end">
                            <Chip
                              label={`${wholesaleMargin.toFixed(0)}%`}
                              size="small"
                              variant="outlined"
                              color={wholesaleMargin > 15 ? 'success' : wholesaleMargin > 5 ? 'warning' : 'error'}
                              sx={{ fontSize: '0.65rem', height: 18, minWidth: 35 }}
                            />
                          </InputAdornment>
                        )
                      }}
                      error={!!errors.wholesalePrice}
                      helperText={errors.wholesalePrice?.message}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <Controller
                  name="specialPrice"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      size="small"
                      label="Special Price"
                      type="number"
                      inputProps={{ step: 0.01, min: 0 }}
                      InputProps={{
                        startAdornment: <InputAdornment position="start">RM</InputAdornment>,
                        endAdornment: specialMargin > 0 && (
                          <InputAdornment position="end">
                            <Chip
                              label={`${specialMargin.toFixed(0)}%`}
                              size="small"
                              variant="outlined"
                              color={specialMargin > 15 ? 'success' : specialMargin > 5 ? 'warning' : 'error'}
                              sx={{ fontSize: '0.65rem', height: 18, minWidth: 35 }}
                            />
                          </InputAdornment>
                        )
                      }}
                      error={!!errors.specialPrice}
                      helperText={errors.specialPrice?.message}
                    />
                  )}
                />
              </Grid>

              {/* Description and Notes Row */}
              <Grid item xs={12} sm={6}>
                <Controller
                  name="description"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      size="small"
                      label="Description"
                      multiline
                      rows={2}
                      error={!!errors.description}
                      helperText={errors.description?.message}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <Controller
                  name="notes"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      size="small"
                      label="Notes"
                      multiline
                      rows={2}
                      placeholder="Internal notes..."
                      error={!!errors.notes}
                      helperText={errors.notes?.message}
                    />
                  )}
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={handleCloseDialog} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              onClick={() => setCalculatorInFormOpen(true)}
              startIcon={<CalculateIcon />}
              sx={{
                color: 'primary.main',
                '&:hover': {
                  backgroundColor: 'primary.light'
                }
              }}
              disabled={isSubmitting}
            >
              Calculator
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={isSubmitting || isDuplicateName}
              sx={{ 
                minWidth: 100,
                backgroundColor: isDuplicateName ? 'grey.400' : undefined,
                '&:hover': {
                  backgroundColor: isDuplicateName ? 'grey.400' : undefined
                },
                '&.Mui-disabled': {
                  backgroundColor: isDuplicateName ? 'grey.400' : undefined,
                  color: 'grey.600'
                }
              }}
            >
              {isSubmitting ? 'Saving...' : editMode ? 'Update' : 'Create'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Calculator Dialog */}
      <CalculatorDialog
        open={calculatorDialogOpen}
        onClose={() => setCalculatorDialogOpen(false)}
      />

      {/* Calculator Dialog for Form */}
      <CalculatorDialog
        open={calculatorInFormOpen}
        onClose={() => setCalculatorInFormOpen(false)}
      />

      {/* Deleted Products Dialog */}
      <DeletedProductsDialog
        open={deletedProductsDialogOpen}
        onClose={() => setDeletedProductsDialogOpen(false)}
      />
    </Box>
  )
}

export default ProductsPage