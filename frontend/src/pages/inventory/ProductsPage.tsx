import React, { useState, useEffect } from 'react'
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
} from '@mui/icons-material'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { useDispatch, useSelector } from 'react-redux'
import { useNotification } from '@/hooks/useNotification'
import DeletedProductsDialog from '@/components/inventory/DeletedProductsDialog'
import type { Product } from '@/types'
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
  sku: string
  categoryId: string
  type: 'goods' | 'service'
  baseCost: number
  retailPrice: number
  wholesalePrice: number
  specialPrice: number
  initialStockQuantity: number
  reorderLevel: number
  optimalStockLevel: number
  unit: string
  isActive: boolean
}

const productSchema = yup.object({
  name: yup.string().required('Product name is required').min(2, 'Name must be at least 2 characters'),
  description: yup.string(),
  sku: yup.string().required('SKU is required').min(3, 'SKU must be at least 3 characters'),
  categoryId: yup.string().required('Category is required').min(1, 'Please select a category'),
  type: yup.string().oneOf(['goods', 'service'], 'Product type is required').required(),
  baseCost: yup.number().required('Base cost is required').min(0, 'Cost must be positive'),
  retailPrice: yup.number().required('Retail price is required').min(0, 'Price must be positive'),
  wholesalePrice: yup.number().required('Wholesale price is required').min(0, 'Price must be positive'),
  specialPrice: yup.number().required('Special price is required').min(0, 'Price must be positive'),
  initialStockQuantity: yup.number().required('Stock is required').min(0, 'Stock must be non-negative'),
  reorderLevel: yup.number().required('Reorder level is required').min(0, 'Reorder level must be non-negative'),
  optimalStockLevel: yup.number().required('Optimal stock is required').min(0, 'Optimal stock must be non-negative'),
  unit: yup.string().required('Unit is required'),
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

  useEffect(() => {
    dispatch(fetchProducts({}))
    dispatch(fetchCategories())
  }, [dispatch])

  const handleRefresh = () => {
    dispatch(fetchProducts({}))
    dispatch(fetchCategories())
  }

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormData>({
    resolver: yupResolver(productSchema) as any,
    defaultValues: {
      name: '',
      description: '',
      sku: '',
      categoryId: '',
      type: 'goods' as 'goods' | 'service',
      baseCost: 0,
      retailPrice: 0,
      wholesalePrice: 0,
      specialPrice: 0,
      initialStockQuantity: 0,
      reorderLevel: 0,
      optimalStockLevel: 0,
      unit: 'pcs',
      isActive: true,
    },
  })

  // Filter products
  const filteredProducts = (products || []).filter(product => {
    const matchesSearch = product.name?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = selectedCategory === '' || product.category?.id === selectedCategory
    return matchesSearch && matchesCategory
  })

  // Paginated products
  const paginatedProducts = filteredProducts.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  )

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, product: Product) => {
    setAnchorEl(event.currentTarget)
    setSelectedProduct(product)
  }

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
    console.log('=== EDIT PRODUCT DEBUG ===')
    console.log('Editing product:', product)
    console.log('Product ID:', product.id)
    console.log('Current selectedProduct before:', selectedProduct)
    console.log('Current editMode before:', editMode)
    console.log('=======================')
    
    reset({
      name: product.name,
      description: product.description || '',
      sku: product.sku,
      categoryId: product.categoryId || product.category?.id || '',
      type: product.type || 'goods',
      baseCost: product.baseCost || 0,
      retailPrice: product.retailPrice || 0,
      wholesalePrice: product.wholesalePrice || 0,
      specialPrice: product.specialPrice || 0,
      initialStockQuantity: product.stockQuantity || 0,
      reorderLevel: product.reorderLevel || 0,
      optimalStockLevel: product.optimalStockLevel || 0,
      unit: product.unit,
      isActive: product.isActive,
    })
    setSelectedProduct(product)
    setEditMode(true)
    setDialogOpen(true)
    // Close menu but don't reset selectedProduct since we need it for editing
    setAnchorEl(null)
    
    // Check state after setting
    setTimeout(() => {
      console.log('=== EDIT PRODUCT DEBUG AFTER STATE CHANGE ===')
      console.log('selectedProduct after:', selectedProduct)
      console.log('editMode after:', editMode)
      console.log('dialogOpen after:', dialogOpen)
      console.log('===============================================')
    }, 100)
  }

  const handleDeleteProduct = async (product: Product) => {
    if (window.confirm(`Are you sure you want to delete ${product.name}?`)) {
      try {
        await dispatch(deleteProduct(product.id))
        showSuccess(`Product ${product.name} deleted successfully`)
        // Explicitly refresh the products list to ensure backend state is synchronized
        setTimeout(() => {
          dispatch(fetchProducts({}))
        }, 500)
      } catch (error) {
        showError('Failed to delete product. Please try again.')
      }
    }
    handleMenuClose()
  }

  const onSubmit = async (data: ProductFormData) => {
    try {
      // Debug: Log the form data being submitted and current state
      console.log('=== FORM SUBMISSION DEBUG ===')
      console.log('Form data:', data)
      console.log('Edit mode:', editMode)
      console.log('Selected product:', selectedProduct)
      console.log('Selected product ID:', selectedProduct?.id)
      console.log('selectedProductForDetails:', selectedProductForDetails)
      console.log('selectedProductForDetails ID:', selectedProductForDetails?.id)
      console.log('Condition (editMode && selectedProduct):', (editMode && selectedProduct))
      console.log('====================')
      
      // Validate categoryId is present and valid
      if (!data.categoryId || data.categoryId.trim() === '') {
        showError('Please select a category')
        return
      }
      
      if (editMode && selectedProduct) {
        // Update existing product
        console.log('UPDATING product with ID:', selectedProduct.id)
        
        // Remove initialStockQuantity from update data as it's only used for creation
        const updateData = { ...data }
        delete updateData.initialStockQuantity
        console.log('Update data after removing initialStockQuantity:', updateData)
        
        await dispatch(updateProduct({ id: selectedProduct.id, data: updateData }))
        showSuccess('Product updated successfully')
      } else {
        // Add new product
        console.log('CREATING new product - reason: editMode=', editMode, ', selectedProduct=', !!selectedProduct)
        const result = await dispatch(createProduct(data))
        
        // Check if the action was rejected
        if (createProduct.rejected.match(result)) {
          throw new Error(result.payload as string)
        }
        
        showSuccess('Product added successfully')
        // Refresh products list to ensure new product appears
        setTimeout(() => {
          dispatch(fetchProducts({}))
        }, 500)
      }
      
      handleCloseDialog()
    } catch (error: any) {
      console.error('Product save error:', error)
      const errorMessage = error?.response?.data?.message || error?.message || 'Failed to save product'
      showError(errorMessage + '. Please try again.')
    }
  }

  const getStockStatus = (product: Product) => {
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
          placeholder="Search products..."
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
            <Box sx={{ p: 2, borderBottom: '1px solid rgba(224, 224, 224, 0.4)' }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Product List ({filteredProducts.length})
              </Typography>
            </Box>
            <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 600, backgroundColor: 'grey.50' }}>
                            Product
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {paginatedProducts.map((product: any) => {
                          const stockStatus = getStockStatus(product)
                          const isSelected = selectedProductForDetails?.id === product.id
                          return (
                            <TableRow 
                              key={product.id}
                              hover
                              onClick={() => setSelectedProductForDetails(product)}
                              sx={{
                                cursor: 'pointer',
                                backgroundColor: isSelected ? 'action.selected' : 'inherit',
                                '&:hover': {
                                  backgroundColor: isSelected ? 'action.selected' : 'action.hover'
                                }
                              }}
                            >
                              <TableCell>
                                <Box>
                                  <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.875rem' }}>
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
            <Box sx={{ p: 2, borderBottom: '1px solid rgba(224, 224, 224, 0.4)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                {selectedProductForDetails ? 'Product Details' : 'Select Product'}
              </Typography>
              {selectedProductForDetails && (
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <IconButton
                    size="small"
                    color="primary"
                    onClick={() => handleEditProduct(selectedProductForDetails)}
                    title="Edit Product"
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => handleDeleteProduct(selectedProductForDetails)}
                    title="Delete Product"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              )}
            </Box>
            <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
              {!selectedProductForDetails ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                  <Typography variant="body1" color="text.secondary" textAlign="center">
                    Select a product from the list to view its details
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {/* Basic Information */}
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, color: 'primary.main' }}>
                      Basic Information
                    </Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={12}>
                        <Box>
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                            Product Name
                          </Typography>
                          <Typography variant="body1" sx={{ fontWeight: 600 }}>
                            {selectedProductForDetails.name}
                          </Typography>
                        </Box>
                      </Grid>
                      <Grid item xs={6}>
                        <Box>
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                            SKU
                          </Typography>
                          <Typography variant="body1">
                            {selectedProductForDetails.sku}
                          </Typography>
                        </Box>
                      </Grid>
                      <Grid item xs={6}>
                        <Box>
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                            Type
                          </Typography>
                          <Typography variant="body1" sx={{ textTransform: 'capitalize' }}>
                            {selectedProductForDetails.type || 'Goods'}
                          </Typography>
                        </Box>
                      </Grid>
                      <Grid item xs={12}>
                        <Box>
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                            Category
                          </Typography>
                          <Typography variant="body1">
                            {selectedProductForDetails.category?.name || 'No Category'}
                          </Typography>
                        </Box>
                      </Grid>
                      {selectedProductForDetails.description && (
                        <Grid item xs={12}>
                          <Box>
                            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                              Description
                            </Typography>
                            <Typography variant="body1">
                              {selectedProductForDetails.description}
                            </Typography>
                          </Box>
                        </Grid>
                      )}
                    </Grid>
                  </Box>

                  {/* Pricing Information */}
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, color: 'primary.main' }}>
                      Pricing Information
                    </Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={6}>
                        <Box>
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                            Base Cost
                          </Typography>
                          <Typography variant="body1">
                            ${selectedProductForDetails.baseCost?.toFixed(2) || '0.00'}
                          </Typography>
                        </Box>
                      </Grid>
                      <Grid item xs={6}>
                        <Box>
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                            Retail Price
                          </Typography>
                          <Typography variant="body1" sx={{ fontWeight: 600, color: 'success.main' }}>
                            ${selectedProductForDetails.retailPrice?.toFixed(2) || '0.00'}
                          </Typography>
                        </Box>
                      </Grid>
                      <Grid item xs={6}>
                        <Box>
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                            Wholesale Price
                          </Typography>
                          <Typography variant="body1">
                            ${selectedProductForDetails.wholesalePrice?.toFixed(2) || '0.00'}
                          </Typography>
                        </Box>
                      </Grid>
                      <Grid item xs={6}>
                        <Box>
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                            Special Price
                          </Typography>
                          <Typography variant="body1">
                            ${selectedProductForDetails.specialPrice?.toFixed(2) || '0.00'}
                          </Typography>
                        </Box>
                      </Grid>
                    </Grid>
                  </Box>

                  {/* Stock Information */}
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, color: 'primary.main' }}>
                      Stock Information
                    </Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={6}>
                        <Box>
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                            Current Stock
                          </Typography>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body1" sx={{ fontWeight: 600 }}>
                              {selectedProductForDetails.stockQuantity || 0} {selectedProductForDetails.unit}
                            </Typography>
                            <Chip
                              label={getStockStatus(selectedProductForDetails).label}
                              color={getStockStatus(selectedProductForDetails).color}
                              size="small"
                              variant="outlined"
                            />
                          </Box>
                        </Box>
                      </Grid>
                      <Grid item xs={6}>
                        <Box>
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                            Unit
                          </Typography>
                          <Typography variant="body1">
                            {selectedProductForDetails.unit}
                          </Typography>
                        </Box>
                      </Grid>
                      <Grid item xs={6}>
                        <Box>
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                            Reorder Level
                          </Typography>
                          <Typography variant="body1">
                            {selectedProductForDetails.reorderLevel || 0} {selectedProductForDetails.unit}
                          </Typography>
                        </Box>
                      </Grid>
                      <Grid item xs={6}>
                        <Box>
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                            Optimal Stock
                          </Typography>
                          <Typography variant="body1">
                            {selectedProductForDetails.optimalStockLevel || 0} {selectedProductForDetails.unit}
                          </Typography>
                        </Box>
                      </Grid>
                    </Grid>
                  </Box>

                  {/* Status Information */}
                  <Box>
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, color: 'primary.main' }}>
                      Status
                    </Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={6}>
                        <Box>
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                            Status
                          </Typography>
                          <Chip
                            label="Active"
                            color="success"
                            size="small"
                            variant="outlined"
                          />
                        </Box>
                      </Grid>
                      <Grid item xs={6}>
                        <Box>
                          <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                            Active
                          </Typography>
                          <Chip
                            label={selectedProductForDetails.isActive ? 'Yes' : 'No'}
                            color={selectedProductForDetails.isActive ? 'success' : 'error'}
                            size="small"
                            variant="outlined"
                          />
                        </Box>
                      </Grid>
                    </Grid>
                  </Box>
                </Box>
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
      >
        <DialogTitle>
          {editMode ? 'Edit Product' : 'Add New Product'}
        </DialogTitle>
        <form onSubmit={handleSubmit(onSubmit as any)}>
          <DialogContent>
            <Grid container spacing={3} sx={{ mt: 1 }}>
              <Grid item xs={12} md={6}>
                <Controller
                  name="name"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Product Name"
                      error={!!errors.name}
                      helperText={errors.name?.message}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Controller
                  name="sku"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="SKU"
                      error={!!errors.sku}
                      helperText={errors.sku?.message}
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
                      label="Description"
                      multiline
                      rows={3}
                      error={!!errors.description}
                      helperText={errors.description?.message}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Controller
                  name="categoryId"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth error={!!errors.categoryId}>
                      <InputLabel 
                        sx={{ 
                          fontSize: '1rem',
                          '&.MuiInputLabel-shrunk': {
                            fontSize: '0.75rem'
                          }
                        }}
                      >
                        Category
                      </InputLabel>
                      <Select 
                        {...field} 
                        label="Category"
                        sx={{
                          '& .MuiSelect-select': {
                            fontSize: '1rem',
                            padding: '16.5px 14px'
                          }
                        }}
                      >
                        {categories && categories.length > 0 ? (
                          categories.map((category: any) => (
                            <MenuItem key={category.id} value={category.id} sx={{ fontSize: '1rem' }}>
                              {category.name}
                            </MenuItem>
                          ))
                        ) : (
                          <MenuItem value="" disabled sx={{ fontSize: '1rem' }}>
                            No categories available
                          </MenuItem>
                        )}
                      </Select>
                      {errors.categoryId && (
                        <Typography variant="caption" color="error" sx={{ mt: 0.75, ml: 1.75, fontSize: '0.75rem' }}>
                          {errors.categoryId.message}
                        </Typography>
                      )}
                    </FormControl>
                  )}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Controller
                  name="type"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth error={!!errors.type}>
                      <InputLabel 
                        sx={{ 
                          fontSize: '1rem',
                          '&.MuiInputLabel-shrunk': {
                            fontSize: '0.75rem'
                          }
                        }}
                      >
                        Product Type
                      </InputLabel>
                      <Select 
                        {...field} 
                        label="Product Type"
                        sx={{
                          '& .MuiSelect-select': {
                            fontSize: '1rem',
                            padding: '16.5px 14px'
                          }
                        }}
                      >
                        <MenuItem value="goods" sx={{ fontSize: '1rem' }}>Goods</MenuItem>
                        <MenuItem value="service" sx={{ fontSize: '1rem' }}>Service</MenuItem>
                      </Select>
                      {errors.type && (
                        <Typography variant="caption" color="error" sx={{ mt: 0.75, ml: 1.75, fontSize: '0.75rem' }}>
                          {errors.type.message}
                        </Typography>
                      )}
                    </FormControl>
                  )}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Controller
                  name="unit"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth>
                      <InputLabel 
                        sx={{ 
                          fontSize: '1rem',
                          '&.MuiInputLabel-shrunk': {
                            fontSize: '0.75rem'
                          }
                        }}
                      >
                        Unit
                      </InputLabel>
                      <Select 
                        {...field} 
                        label="Unit"
                        sx={{
                          '& .MuiSelect-select': {
                            fontSize: '1rem',
                            padding: '16.5px 14px'
                          }
                        }}
                      >
                        <MenuItem value="pcs" sx={{ fontSize: '1rem' }}>Pieces</MenuItem>
                        <MenuItem value="kg" sx={{ fontSize: '1rem' }}>Kilograms</MenuItem>
                        <MenuItem value="lbs" sx={{ fontSize: '1rem' }}>Pounds</MenuItem>
                        <MenuItem value="m" sx={{ fontSize: '1rem' }}>Meters</MenuItem>
                        <MenuItem value="ft" sx={{ fontSize: '1rem' }}>Feet</MenuItem>
                        <MenuItem value="l" sx={{ fontSize: '1rem' }}>Liters</MenuItem>
                        <MenuItem value="gal" sx={{ fontSize: '1rem' }}>Gallons</MenuItem>
                      </Select>
                    </FormControl>
                  )}
                />
              </Grid>
              {/* Multi-level Pricing */}
              <Grid item xs={12}>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                  Pricing Information
                </Typography>
              </Grid>
              <Grid item xs={12} md={6}>
                <Controller
                  name="baseCost"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Base Cost"
                      type="number"
                      inputProps={{ step: 0.01, min: 0 }}
                      InputProps={{
                        startAdornment: <InputAdornment position="start">$</InputAdornment>
                      }}
                      error={!!errors.baseCost}
                      helperText={errors.baseCost?.message}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Controller
                  name="retailPrice"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Retail Price"
                      type="number"
                      inputProps={{ step: 0.01, min: 0 }}
                      InputProps={{
                        startAdornment: <InputAdornment position="start">$</InputAdornment>
                      }}
                      error={!!errors.retailPrice}
                      helperText={errors.retailPrice?.message}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Controller
                  name="wholesalePrice"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Wholesale Price"
                      type="number"
                      inputProps={{ step: 0.01, min: 0 }}
                      InputProps={{
                        startAdornment: <InputAdornment position="start">$</InputAdornment>
                      }}
                      error={!!errors.wholesalePrice}
                      helperText={errors.wholesalePrice?.message}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Controller
                  name="specialPrice"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Special Price"
                      type="number"
                      inputProps={{ step: 0.01, min: 0 }}
                      InputProps={{
                        startAdornment: <InputAdornment position="start">$</InputAdornment>
                      }}
                      error={!!errors.specialPrice}
                      helperText={errors.specialPrice?.message}
                    />
                  )}
                />
              </Grid>
              {/* Stock Management */}
              <Grid item xs={12}>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                  Stock Information
                </Typography>
              </Grid>
              <Grid item xs={12} md={4}>
                <Controller
                  name="initialStockQuantity"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Initial Stock"
                      type="number"
                      inputProps={{ min: 0 }}
                      error={!!errors.initialStockQuantity}
                      helperText={errors.initialStockQuantity?.message}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <Controller
                  name="reorderLevel"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Reorder Level"
                      type="number"
                      inputProps={{ min: 0 }}
                      error={!!errors.reorderLevel}
                      helperText={errors.reorderLevel?.message}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <Controller
                  name="optimalStockLevel"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Optimal Stock"
                      type="number"
                      inputProps={{ min: 0 }}
                      error={!!errors.optimalStockLevel}
                      helperText={errors.optimalStockLevel?.message}
                    />
                  )}
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseDialog}>Cancel</Button>
            <Button
              type="submit"
              variant="contained"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Saving...' : editMode ? 'Update' : 'Create'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Deleted Products Dialog */}
      <DeletedProductsDialog
        open={deletedProductsDialogOpen}
        onClose={() => setDeletedProductsDialogOpen(false)}
      />
    </Box>
  )
}

export default ProductsPage