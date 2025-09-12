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
  ArrowDropDown as ArrowDropDownIcon,
  TableChart as TableChartIcon,
  PictureAsPdf as PictureAsPdfIcon,
  CloudUpload as CloudUploadIcon,
} from '@mui/icons-material'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { useDispatch, useSelector } from 'react-redux'
import { useNotification } from '@/hooks/useNotification'
import { useDuplicateCheck } from '@/hooks/useDuplicateCheck'
import DeletedProductsDialog from '@/components/inventory/DeletedProductsDialog'
import ProductImportDialog from '@/components/inventory/ProductImportDialog'
import SlidingCalculatorPanel from '@/components/calculator/SlidingCalculatorPanel'
import InlineCalculator from '@/components/calculator/InlineCalculator'
import type { Product } from '@/types'
import { formatCurrency } from '@/utils/currency'
import { exportProducts } from '@/utils/exportUtils'
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
  type: 'Stocked Product' | 'Service'
  categoryId: string
  baseCost: number
  retailPrice?: number
  wholesalePrice?: number
  specialPrice?: number
  currentStock?: number
  notes: string
  isActive: boolean
}

const productSchema = yup.object({
  name: yup.string().required('Product name is required').min(2, 'Name must be at least 2 characters'),
  description: yup.string(),
  barcode: yup.string().optional(),
  type: yup.string().required('Product type is required'),
  categoryId: yup.string().required('Category is required').test(
    'is-valid-uuid',
    'Please select a valid category',
    function(value) {
      // Allow empty string for initial form state, but require UUID when submitting
      if (!value || value.trim() === '') {
        return this.createError({ message: 'Please select a category' })
      }
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      if (!uuidRegex.test(value)) {
        return this.createError({ message: 'Invalid category selection - please choose from the dropdown' })
      }
      return true
    }
  ),
  baseCost: yup.number().required('Base cost is required').min(0, 'Cost must be positive'),
  retailPrice: yup.number().optional().min(0, 'Price must be positive'),
  wholesalePrice: yup.number().optional().min(0, 'Price must be positive'),
  specialPrice: yup.number().optional().min(0, 'Price must be positive'),
  currentStock: yup.number().optional().min(0, 'Stock must be non-negative'),
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
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [calculatorPanelOpen, setCalculatorPanelOpen] = useState(false)
  const [dialogCalculatorOpen, setDialogCalculatorOpen] = useState(false)
  const [inlineEditMode, setInlineEditMode] = useState(false)
  const [inlineEditData, setInlineEditData] = useState<ProductFormData | null>(null)
  const [focusedProductIndex, setFocusedProductIndex] = useState<number>(-1)
  const [exportMenuAnchor, setExportMenuAnchor] = useState<null | HTMLElement>(null)
  const [isExporting, setIsExporting] = useState(false)
  const productListRef = useRef<HTMLDivElement>(null)

  // Use the new duplicate check hook
  const { 
    checkDuplicate, 
    nameError: duplicateNameError, 
    barcodeError: duplicateBarcodeError,
    hasNameDuplicate: isDuplicateName,
    hasBarcodeDuplicate: isDuplicateBarcode
  } = useDuplicateCheck()

  // Inline edit duplicate checking
  const inlineEditDuplicateCheck = useDuplicateCheck()

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
      type: 'Stocked Product',
      categoryId: '',
      baseCost: 0,
      retailPrice: undefined,
      wholesalePrice: undefined,
      specialPrice: undefined,
      currentStock: undefined,
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
  const watchedBarcode = watch('barcode')
  const watchedType = watch('type')
  const watchedCategoryId = watch('categoryId')
  const watchedCurrentStock = watch('currentStock')

  // Calculate profit margins
  const calculateMargin = (sellingPrice: number | undefined, cost: number): number => {
    const price = Number(sellingPrice) || 0
    const baseCost = Number(cost) || 0
    
    // If no cost and no price, return 0
    if (baseCost === 0 && price === 0) return 0
    
    // If price is 0 but cost exists, it's a 100% loss
    if (price === 0 && baseCost > 0) return -100
    
    // Standard margin calculation: (price - cost) / price * 100
    return ((price - baseCost) / price) * 100
  }


  const retailMargin = calculateMargin(retailPrice, baseCost)
  const wholesaleMargin = calculateMargin(wholesalePrice, baseCost)
  const specialMargin = calculateMargin(specialPrice, baseCost)

  // Check if all mandatory fields are filled
  const isMandatoryFieldsComplete = watchedName?.trim().length >= 2 && 
    watchedType && 
    watchedCategoryId?.trim().length >= 1 && 
    (baseCost !== null && baseCost !== undefined && baseCost >= 0)

  // Real-time duplicate checking for form fields
  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      if ((watchedName && watchedName.trim().length >= 2) || (watchedBarcode && watchedBarcode.trim().length >= 1)) {
        console.log('Checking duplicates for:', { 
          name: watchedName?.trim(), 
          barcode: watchedBarcode?.trim(),
          excludeId: editMode && selectedProduct ? selectedProduct.id : undefined
        })
        
        await checkDuplicate({
          name: watchedName && watchedName.trim().length >= 2 ? watchedName.trim() : undefined,
          barcode: watchedBarcode && watchedBarcode.trim().length >= 1 ? watchedBarcode.trim() : undefined,
          excludeId: editMode && selectedProduct ? selectedProduct.id : undefined,
        })
      }
    }, 500) // Debounce API calls

    return () => clearTimeout(timeoutId)
  }, [watchedName, watchedBarcode, editMode, selectedProduct, checkDuplicate])

  // Real-time duplicate checking for inline editing
  useEffect(() => {
    if (!inlineEditMode || !inlineEditData || !selectedProductForDetails) {
      return
    }

    const timeoutId = setTimeout(async () => {
      if ((inlineEditData.name && inlineEditData.name.trim().length >= 2) || 
          (inlineEditData.barcode && inlineEditData.barcode.trim().length >= 1)) {
        
        console.log('Checking duplicates for inline edit:', { 
          name: inlineEditData.name?.trim(), 
          barcode: inlineEditData.barcode?.trim(),
          excludeId: selectedProductForDetails.id
        })

        await inlineEditDuplicateCheck.checkDuplicate({
          name: inlineEditData.name && inlineEditData.name.trim().length >= 2 ? inlineEditData.name.trim() : undefined,
          barcode: inlineEditData.barcode && inlineEditData.barcode.trim().length >= 1 ? inlineEditData.barcode.trim() : undefined,
          excludeId: selectedProductForDetails.id,
        })
      }
    }, 500) // Debounce API calls

    return () => clearTimeout(timeoutId)
  }, [inlineEditData, selectedProductForDetails, inlineEditMode, inlineEditDuplicateCheck])

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
      type: product.type || 'Stocked Product',
      categoryId: product.categoryId || product.category?.id || '',
      baseCost: product.baseCost || 0,
      retailPrice: product.retailPrice || undefined,
      wholesalePrice: product.wholesalePrice || undefined,
      specialPrice: product.specialPrice || undefined,
      currentStock: product.stockQuantity || undefined,
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

      // Check for duplicates using the API
      if (inlineEditDuplicateCheck.hasNameDuplicate) {
        showError(inlineEditDuplicateCheck.nameError)
        return
      }
      
      if (inlineEditDuplicateCheck.hasBarcodeDuplicate) {
        showError(inlineEditDuplicateCheck.barcodeError)
        return
      }
      
      const updateData = {
        ...inlineEditData,
        barcode: inlineEditData.barcode && inlineEditData.barcode.trim() ? inlineEditData.barcode.trim() : undefined // Convert empty barcode to undefined
      }
      
      const result = await dispatch(updateProduct({ 
        id: selectedProductForDetails.id, 
        data: updateData 
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
          dispatch(fetchProducts({ 
            search: searchTerm || undefined, 
            categoryId: selectedCategory || undefined
          }))
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
        const updateData = { 
          ...data,
          barcode: data.barcode && data.barcode.trim() ? data.barcode.trim() : undefined // Convert empty barcode to undefined
        }
        const result = await dispatch(updateProduct({ id: selectedProduct.id, data: updateData }))
        
        if (updateProduct.fulfilled.match(result)) {
          showSuccess('Product updated successfully')
          // Refresh the product list to ensure consistency
          dispatch(fetchProducts({ 
            search: searchTerm || undefined, 
            categoryId: selectedCategory || undefined
          }))
        } else {
          throw new Error(result.payload as string)
        }
      } else {
        // Add new product - transform form data to match backend DTO
        const createData = {
          ...data,
          barcode: data.barcode && data.barcode.trim() ? data.barcode.trim() : undefined, // Convert empty barcode to undefined
          currentStock: data.currentStock, // Backend expects currentStock, not stockQuantity
          // Remove fields that shouldn't be sent to backend
          type: data.type === 'Stocked Product' || data.type === 'Service' ? data.type : 'Stocked Product'
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
      // Handle different error types more specifically
      let errorMessage = 'Failed to save product'
      
      if (error?.response?.data?.message) {
        // Backend validation error
        errorMessage = error.response.data.message
      } else if (error?.message) {
        // Network or other error
        errorMessage = error.message
      } else if (typeof error === 'string') {
        // Redux rejection error
        errorMessage = error
      }
      
      // Show more specific error messages for common issues
      if (errorMessage.includes('categoryId must be a UUID')) {
        errorMessage = 'Please select a valid category from the dropdown'
      } else if (errorMessage.includes('Validation failed')) {
        errorMessage = 'Please check all required fields and try again'
      }
      
      showError(errorMessage)
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

  // Export handlers
  const handleExportClick = (event: React.MouseEvent<HTMLElement>) => {
    setExportMenuAnchor(event.currentTarget)
  }

  const handleExportClose = () => {
    setExportMenuAnchor(null)
  }

  const handleExport = async (format: 'csv' | 'excel' | 'pdf') => {
    try {
      setIsExporting(true)
      handleExportClose()
      
      const exportData = {
        products: filteredProducts,
        filters: {
          search: searchTerm || undefined,
          category: selectedCategory || undefined
        }
      }
      
      await exportProducts(format, exportData)
      showSuccess(`Products exported successfully as ${format.toUpperCase()}`)
    } catch (error: any) {
      console.error('Export error:', error)
      showError(error.message || `Failed to export as ${format.toUpperCase()}`)
    } finally {
      setIsExporting(false)
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
        gap: isMobile ? 2 : 0,
        transition: 'margin-right 0.3s ease-in-out',
        marginRight: calculatorPanelOpen ? { xs: '0px', md: '320px' } : '0px',
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
          gap: isMobile ? 1.5 : 1,
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
            onClick={() => setCalculatorPanelOpen(!calculatorPanelOpen)}
            size={isMobile ? "medium" : "medium"}
            fullWidth={isMobile}
            sx={{
              color: calculatorPanelOpen ? 'info.dark' : 'info.main',
              borderColor: calculatorPanelOpen ? 'info.dark' : 'info.main',
              backgroundColor: calculatorPanelOpen ? 'info.light' : 'transparent',
              '&:hover': {
                borderColor: 'info.dark',
                backgroundColor: 'info.light'
              },
              transition: 'all 0.3s ease-in-out'
            }}
          >
            {isMobile ? "Calculator" : calculatorPanelOpen ? "Close Calculator" : "Calculator"}
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
            variant="outlined"
            startIcon={!isMobile ? <CloudUploadIcon /> : undefined}
            onClick={() => setImportDialogOpen(true)}
            size={isMobile ? "medium" : "medium"}
            fullWidth={isMobile}
            sx={{
              color: 'success.main',
              borderColor: 'success.main',
              '&:hover': {
                borderColor: 'success.dark',
                backgroundColor: 'success.light'
              }
            }}
          >
            {isMobile ? "Import Products" : "Import"}
          </Button>
          <Button
            variant="contained"
            startIcon={!isMobile ? <AddIcon /> : undefined}
            size={isMobile ? "medium" : "medium"}
            onClick={handleAddProduct}
            fullWidth={isMobile}
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
        },
        transition: 'margin-right 0.3s ease-in-out',
        marginRight: calculatorPanelOpen ? { xs: '0px', md: '320px' } : '0px',
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
            MenuProps={{
              PaperProps: {
                style: {
                  maxHeight: 'none', // Remove height restriction
                  maxWidth: 'none',  // Remove width restriction
                  overflow: 'visible' // Ensure content is fully visible
                },
                sx: {
                  '& .MuiList-root': {
                    maxHeight: '400px', // Set max height on the list itself
                    overflow: 'auto',   // Enable scrolling on the list
                    padding: 0
                  }
                }
              },
              // Render dropdown in document body to avoid clipping
              disablePortal: false,
              // Allow dropdown to position freely
              anchorOrigin: {
                vertical: 'bottom',
                horizontal: 'left'
              },
              transformOrigin: {
                vertical: 'top',
                horizontal: 'left'
              },
              // Ensure z-index is high enough
              sx: {
                zIndex: 9999
              }
            }}
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
          endIcon={<ArrowDropDownIcon />}
          size="medium"
          onClick={handleExportClick}
          disabled={isExporting || filteredProducts.length === 0}
          sx={{ 
            flex: 'none',
            height: '40px',
            fontSize: '0.875rem',
            fontWeight: 500
          }}
        >
          {isExporting ? 'Exporting...' : 'Export'}
        </Button>
      </Box>

      {/* Split Layout: Active Products and Product Details */}
      <Box
        sx={{
          transition: 'margin-right 0.3s ease-in-out',
          marginRight: calculatorPanelOpen ? { xs: '0px', md: '320px' } : '0px',
        }}
      >
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
                        disabled={inlineEditDuplicateCheck.hasNameDuplicate || inlineEditDuplicateCheck.hasBarcodeDuplicate}
                        sx={{
                          '&:hover': {
                            backgroundColor: 'success.light',
                            color: 'success.main'
                          },
                          '&.Mui-disabled': {
                            backgroundColor: 'grey.300',
                            color: 'grey.500'
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
                      tableLayout: 'fixed',
                      '& .MuiTableCell-root': { 
                        border: 'none', 
                        py: 0.75, 
                        px: 1.5,
                        ...(isMobile && {
                          px: 1,
                          py: 0.5,
                          fontSize: '0.75rem'
                        }),
                        '&:nth-of-type(1)': { width: '35%' }, // Field name column
                        '&:nth-of-type(2)': { width: '45%' }, // Value column
                        '&:nth-of-type(3)': { width: '20%' }, // Extra info column (margins, status)
                      }
                    }}
                  >
                    <TableBody>
                      {/* Basic Information Section */}
                      <TableRow>
                        <TableCell colSpan={3} sx={{ 
                          pb: 0.5, 
                          py: 0.5, 
                          borderTop: '1px solid rgba(224, 224, 224, 0.4)'
                        }}>
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
                        <TableCell colSpan={2} sx={{ fontSize: '0.8rem' }}>
                          {inlineEditMode && inlineEditData ? (
                            <TextField
                              value={inlineEditData.name}
                              onChange={(e) => handleInlineEditChange('name', e.target.value)}
                              size="small"
                              fullWidth
                              error={inlineEditDuplicateCheck.hasNameDuplicate}
                              helperText={
                                inlineEditDuplicateCheck.hasNameDuplicate 
                                  ? inlineEditDuplicateCheck.nameError 
                                  : inlineEditData.name && inlineEditData.name.trim().length >= 2 && !inlineEditDuplicateCheck.hasNameDuplicate
                                    ? 'Name is available'
                                    : ''
                              }
                              sx={{
                                '& .MuiOutlinedInput-root': {
                                  fontSize: '0.8rem',
                                  height: '28px',
                                  '&.Mui-error': {
                                    '& fieldset': {
                                      borderColor: 'error.main'
                                    }
                                  }
                                },
                                '& .MuiFormHelperText-root': {
                                  fontSize: '0.7rem',
                                  margin: '2px 0 0 0',
                                  color: inlineEditDuplicateCheck.hasNameDuplicate 
                                    ? 'error.main' 
                                    : inlineEditData.name && inlineEditData.name.trim().length >= 2 && !inlineEditDuplicateCheck.hasNameDuplicate
                                      ? 'success.main'
                                      : undefined
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
                        <TableCell colSpan={2} sx={{ fontSize: '0.8rem' }}>
                          {inlineEditMode && inlineEditData ? (
                            <TextField
                              value={inlineEditData.barcode}
                              onChange={(e) => handleInlineEditChange('barcode', e.target.value)}
                              size="small"
                              fullWidth
                              error={inlineEditDuplicateCheck.hasBarcodeDuplicate}
                              helperText={
                                inlineEditDuplicateCheck.hasBarcodeDuplicate 
                                  ? inlineEditDuplicateCheck.barcodeError 
                                  : inlineEditData.barcode && inlineEditData.barcode.trim().length >= 1 && !inlineEditDuplicateCheck.hasBarcodeDuplicate
                                    ? 'Barcode is available'
                                    : ''
                              }
                              sx={{
                                '& .MuiOutlinedInput-root': {
                                  fontSize: '0.8rem',
                                  height: '28px',
                                  '&.Mui-error': {
                                    '& fieldset': {
                                      borderColor: 'error.main'
                                    }
                                  }
                                },
                                '& .MuiFormHelperText-root': {
                                  fontSize: '0.7rem',
                                  margin: '2px 0 0 0',
                                  color: inlineEditDuplicateCheck.hasBarcodeDuplicate 
                                    ? 'error.main' 
                                    : inlineEditData.barcode && inlineEditData.barcode.trim().length >= 1 && !inlineEditDuplicateCheck.hasBarcodeDuplicate
                                      ? 'success.main'
                                      : undefined
                                }
                              }}
                            />
                          ) : (
                            selectedProductForDetails.barcode || 'No barcode'
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
                        <TableCell colSpan={2} sx={{ fontSize: '0.8rem' }}>
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
                                <MenuItem value="Stocked Product" sx={{ fontSize: '0.8rem' }}>
                                  Stocked Product
                                </MenuItem>
                                <MenuItem value="Service" sx={{ fontSize: '0.8rem' }}>
                                  Service
                                </MenuItem>
                              </Select>
                            </FormControl>
                          ) : (
                            selectedProductForDetails.type === 'Stocked Product' ? 'Stocked Product' : 'Service'
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
                        <TableCell colSpan={2} sx={{ fontSize: '0.8rem' }}>
                          {inlineEditMode && inlineEditData ? (
                            <FormControl fullWidth size="small">
                              <Select 
                                value={inlineEditData.categoryId}
                                onChange={(e) => handleInlineEditChange('categoryId', e.target.value)}
                                MenuProps={{
                                  PaperProps: {
                                    style: {
                                      maxHeight: 300,
                                      overflow: 'auto'
                                    }
                                  }
                                }}
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
                          <TableCell colSpan={2} sx={{ fontSize: '0.8rem' }}>
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
                        <TableCell colSpan={3} sx={{ 
                          pt: 1.5, 
                          pb: 0.5,
                          borderTop: '1px solid rgba(224, 224, 224, 0.4)'
                        }}>
                          <Typography variant="h6" sx={{ 
                            fontWeight: 600, 
                            color: 'primary.main', 
                            fontSize: '0.75rem'
                          }}>
                            Pricing Information & Margins
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
                        <TableCell colSpan={2} sx={{ fontSize: '0.8rem' }}>
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
                            <Typography sx={{ fontSize: '0.8rem' }}>
                              {formatCurrency(selectedProductForDetails.retailPrice)}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem' }}>
                          {inlineEditMode && inlineEditData ? (
                            (inlineEditData.retailPrice !== undefined && inlineEditData.retailPrice !== null && inlineEditData.retailPrice > 0) && (
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
                            (selectedProductForDetails.retailPrice !== undefined && selectedProductForDetails.retailPrice !== null && selectedProductForDetails.retailPrice > 0) && (
                              <Chip
                                label={`${selectedProductForDetails.grossMarginRetail?.toFixed(1) || '0.0'}%`}
                                size="small"
                                variant="outlined"
                                color={(selectedProductForDetails.grossMarginRetail || 0) > 20 ? 'success' : (selectedProductForDetails.grossMarginRetail || 0) > 10 ? 'warning' : 'error'}
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
                            (inlineEditData.wholesalePrice !== undefined && inlineEditData.wholesalePrice !== null && inlineEditData.wholesalePrice > 0) && (
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
                            (selectedProductForDetails.wholesalePrice !== undefined && selectedProductForDetails.wholesalePrice !== null && selectedProductForDetails.wholesalePrice > 0) && (
                              <Chip
                                label={`${selectedProductForDetails.grossMarginWholesale?.toFixed(1) || '0.0'}%`}
                                size="small"
                                variant="outlined"
                                color={(selectedProductForDetails.grossMarginWholesale || 0) > 15 ? 'success' : (selectedProductForDetails.grossMarginWholesale || 0) > 5 ? 'warning' : 'error'}
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
                            (inlineEditData.specialPrice !== undefined && inlineEditData.specialPrice !== null && inlineEditData.specialPrice > 0) && (
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
                            (selectedProductForDetails.specialPrice !== undefined && selectedProductForDetails.specialPrice !== null && selectedProductForDetails.specialPrice > 0) && (
                              <Chip
                                label={`${selectedProductForDetails.grossMarginSpecial?.toFixed(1) || '0.0'}%`}
                                size="small"
                                variant="outlined"
                                color={(selectedProductForDetails.grossMarginSpecial || 0) > 15 ? 'success' : (selectedProductForDetails.grossMarginSpecial || 0) > 5 ? 'warning' : 'error'}
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
                        <TableCell colSpan={3} sx={{ 
                          pt: 1.5, 
                          pb: 0.5,
                          borderTop: '1px solid rgba(224, 224, 224, 0.4)'
                        }}>
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
                              onChange={(e) => handleInlineEditChange('currentStock', e.target.value === '' ? undefined : parseInt(e.target.value) || 0)}
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
                            <Typography variant="body1" sx={{ fontSize: '0.8rem' }}>
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
                        <TableCell colSpan={3} sx={{ 
                          pt: 1.5, 
                          pb: 0.5,
                          borderTop: '1px solid rgba(224, 224, 224, 0.4)'
                        }}>
                          <Typography variant="h6" sx={{ 
                            fontWeight: 600, 
                            color: 'primary.main', 
                            fontSize: '0.75rem'
                          }}>
                            Notes & Additional Information
                          </Typography>
                        </TableCell>
                      </TableRow>
                      <TableRow sx={{ backgroundColor: 'grey.50' }}>
                        <TableCell colSpan={3} sx={{ p: 1.5 }}>
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
      </Box>

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

      {/* Export Menu */}
      <Menu
        anchorEl={exportMenuAnchor}
        open={Boolean(exportMenuAnchor)}
        onClose={handleExportClose}
        PaperProps={{
          sx: { minWidth: 200 }
        }}
      >
        <MenuItem 
          onClick={() => handleExport('csv')}
          disabled={isExporting}
        >
          <TableChartIcon sx={{ mr: 1, fontSize: '1.1rem' }} />
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              Export as CSV
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Comma-separated values
            </Typography>
          </Box>
        </MenuItem>
        <MenuItem 
          onClick={() => handleExport('excel')}
          disabled={isExporting}
        >
          <TableChartIcon sx={{ mr: 1, fontSize: '1.1rem', color: 'success.main' }} />
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              Export as Excel
            </Typography>
            <Typography variant="caption" color="text.secondary">
              With summary & formatting
            </Typography>
          </Box>
        </MenuItem>
        <MenuItem 
          onClick={() => handleExport('pdf')}
          disabled={isExporting}
        >
          <PictureAsPdfIcon sx={{ mr: 1, fontSize: '1.1rem', color: 'error.main' }} />
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              Export as PDF
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Formatted report
            </Typography>
          </Box>
        </MenuItem>
        {filteredProducts.length > 0 && (
          <Box sx={{ px: 2, py: 1, borderTop: '1px solid', borderColor: 'divider' }}>
            <Typography variant="caption" color="text.secondary">
              {filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''} will be exported
              {searchTerm && (
                <>
                  <br />
                  Search: "{searchTerm}"
                </>
              )}
              {selectedCategory && (
                <>
                  <br />
                  Category filter applied
                </>
              )}
            </Typography>
          </Box>
        )}
      </Menu>

      {/* Product Form Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            maxHeight: '90vh',
            width: dialogCalculatorOpen ? '95vw' : '70vw',
            maxWidth: dialogCalculatorOpen ? '1400px' : '900px',
            transition: 'width 0.3s ease-in-out',
            '& .MuiDialogContent-root': {
              paddingTop: '8px !important'
            }
          }
        }}
      >
        <DialogTitle 
          sx={{ 
            pb: 1
          }}
        >
          <Box>
            {editMode ? 'Edit Product' : 'Add New Product'}
            {selectedProduct && editMode && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Editing: {selectedProduct.name}
              </Typography>
            )}
          </Box>
        </DialogTitle>
        <form onSubmit={handleSubmit(onSubmit as any)}>
          <DialogContent sx={{ py: 1 }}>
            <Box
              sx={{
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                gap: 2,
                minHeight: '500px',
              }}
            >
              {/* Product Form Section */}
              <Box
                sx={{
                  flex: dialogCalculatorOpen ? (isMobile ? '1' : '0 0 65%') : '1',
                  transition: 'flex 0.3s ease-in-out',
                }}
              >
                <Grid container spacing={2}>
              {/* Row 1: Basic Product Information */}
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
                      helperText={
                        errors.name?.message || 
                        (isDuplicateName ? duplicateNameError : '') ||
                        (watchedName && watchedName.trim().length >= 2 && !isDuplicateName ? 'Name is available' : '')
                      }
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          '&.Mui-error': {
                            '& fieldset': {
                              borderColor: 'error.main'
                            }
                          }
                        },
                        '& .MuiFormHelperText-root': {
                          color: isDuplicateName 
                            ? 'error.main' 
                            : errors.name 
                              ? 'error.main'
                              : watchedName && watchedName.trim().length >= 2 && !isDuplicateName
                                ? 'success.main'
                                : undefined
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
                      error={!!errors.barcode || isDuplicateBarcode}
                      helperText={
                        errors.barcode?.message || 
                        (isDuplicateBarcode ? duplicateBarcodeError : '') ||
                        (watchedBarcode && watchedBarcode.trim().length >= 1 && !isDuplicateBarcode ? 'Barcode is available' : '')
                      }
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          '&.Mui-error': {
                            '& fieldset': {
                              borderColor: 'error.main'
                            }
                          }
                        },
                        '& .MuiFormHelperText-root': {
                          color: isDuplicateBarcode 
                            ? 'error.main' 
                            : errors.barcode 
                              ? 'error.main'
                              : watchedBarcode && watchedBarcode.trim().length >= 1 && !isDuplicateBarcode
                                ? 'success.main'
                                : undefined
                        }
                      }}
                    />
                  )}
                />
              </Grid>

              {/* Row 2: Type, Category & Base Cost */}
              <Grid item xs={12} sm={4}>
                <Controller
                  name="type"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth size="small" error={!!errors.type}>
                      <InputLabel>Type</InputLabel>
                      <Select {...field} label="Type">
                        <MenuItem value="Stocked Product">Stocked Product</MenuItem>
                        <MenuItem value="Service">Service</MenuItem>
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
              <Grid item xs={12} sm={4}>
                <Controller
                  name="categoryId"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth size="small" error={!!errors.categoryId}>
                      <InputLabel>Category</InputLabel>
                      <Select 
                        {...field} 
                        label="Category"
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
              <Grid item xs={12} sm={4}>
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

              {/* Row 3: Pricing with Margins */}
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

              {/* Row 4: Stock Information */}
              <Grid item xs={12} sm={6}>
                <Controller
                  name="currentStock"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      size="small"
                      label="Current Stock Quantity"
                      type="number"
                      inputProps={{ step: 1, min: 0 }}
                      error={!!errors.currentStock}
                      helperText={errors.currentStock?.message}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                {/* Empty space for balance */}
                <Box sx={{ height: '56px' }} />
              </Grid>

              {/* Row 5: Description */}
              <Grid item xs={12} sm={12}>
                <Controller
                  name="description"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      size="small"
                      label="Product Description"
                      multiline
                      rows={4}
                      error={!!errors.description}
                      helperText={errors.description?.message}
                      placeholder="Detailed product description for customers..."
                    />
                  )}
                />
              </Grid>

              {/* Row 6: Notes */}
              <Grid item xs={12} sm={12}>
                <Controller
                  name="notes"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      size="small"
                      label="Internal Notes"
                      multiline
                      rows={4}
                      placeholder="Internal notes for staff use only..."
                      error={!!errors.notes}
                      helperText={errors.notes?.message}
                    />
                  )}
                />
              </Grid>
                </Grid>
              </Box>

              {/* Divider */}
              {dialogCalculatorOpen && !isMobile && (
                <Box
                  sx={{
                    width: '1px',
                    backgroundColor: 'divider',
                    my: 2,
                  }}
                />
              )}

              {/* Calculator Section */}
              {dialogCalculatorOpen && (
                <Box
                  sx={{
                    flex: isMobile ? '0 0 auto' : '0 0 35%',
                    opacity: 1,
                    transform: 'translateX(0)',
                    transition: 'all 0.3s ease-in-out',
                    borderTop: isMobile ? '1px solid' : 'none',
                    borderColor: 'divider',
                    pt: isMobile ? 2 : 0,
                  }}
                >
                  <InlineCalculator />
                </Box>
              )}
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={handleCloseDialog} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              onClick={() => setDialogCalculatorOpen(!dialogCalculatorOpen)}
              variant="outlined"
              disabled={isSubmitting}
              startIcon={<CalculateIcon />}
              sx={{
                color: dialogCalculatorOpen ? 'primary.main' : 'inherit',
                borderColor: dialogCalculatorOpen ? 'primary.main' : 'inherit',
                backgroundColor: dialogCalculatorOpen ? 'primary.light' : 'transparent',
                '&:hover': {
                  borderColor: 'primary.main',
                  backgroundColor: 'primary.light'
                }
              }}
            >
              Calculator
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={isSubmitting || isDuplicateName || isDuplicateBarcode || (!editMode && !isMandatoryFieldsComplete)}
              sx={{ 
                minWidth: 100,
                backgroundColor: (isDuplicateName || isDuplicateBarcode || (!editMode && !isMandatoryFieldsComplete)) ? 'grey.400' : undefined,
                '&:hover': {
                  backgroundColor: (isDuplicateName || isDuplicateBarcode || (!editMode && !isMandatoryFieldsComplete)) ? 'grey.400' : undefined
                },
                '&.Mui-disabled': {
                  backgroundColor: (isDuplicateName || isDuplicateBarcode || (!editMode && !isMandatoryFieldsComplete)) ? 'grey.400' : undefined,
                  color: 'grey.600'
                }
              }}
            >
              {isSubmitting ? 'Saving...' : editMode ? 'Update' : 'Create'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Sliding Calculator Panel */}
      <SlidingCalculatorPanel
        isOpen={calculatorPanelOpen}
        onClose={() => setCalculatorPanelOpen(false)}
      />

      {/* Deleted Products Dialog */}
      <DeletedProductsDialog
        open={deletedProductsDialogOpen}
        onClose={() => setDeletedProductsDialogOpen(false)}
      />

      {/* Product Import Dialog */}
      <ProductImportDialog
        open={importDialogOpen}
        onClose={() => setImportDialogOpen(false)}
        onImportSuccess={handleRefresh}
      />
    </Box>
  )
}

export default ProductsPage