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
} from '@mui/material'
import {
  Add as AddIcon,
  Search as SearchIcon,
  MoreVert as MoreIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Inventory as InventoryIcon,
  Visibility as ViewIcon,
  GetApp as ExportIcon,
  RestoreFromTrash as RestoreIcon,
} from '@mui/icons-material'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { useDispatch, useSelector } from 'react-redux'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import { useNotification } from '@/hooks/useNotification'
import DeletedProductsDialog from '@/components/inventory/DeletedProductsDialog'
import type { Product, Category } from '@/types'
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
  const products = useSelector(selectProducts) || []
  const categories = useSelector(selectCategories) || []
  const loading = useSelector(selectInventoryLoading)
  
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [deletedProductsDialogOpen, setDeletedProductsDialogOpen] = useState(false)

  useEffect(() => {
    dispatch(fetchProducts({}))
    dispatch(fetchCategories())
  }, [dispatch])

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
    const matchesSearch = product.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.sku?.toLowerCase().includes(searchTerm.toLowerCase())
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
    setDialogOpen(true)
  }

  const handleEditProduct = (product: Product) => {
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
    setEditMode(true)
    setDialogOpen(true)
    handleMenuClose()
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
      // Debug: Log the form data being submitted
      console.log('Submitting product data:', data)
      
      // Validate categoryId is present and valid
      if (!data.categoryId || data.categoryId.trim() === '') {
        showError('Please select a category')
        return
      }
      
      if (editMode && selectedProduct) {
        // Update existing product
        await dispatch(updateProduct({ id: selectedProduct.id, data }))
        showSuccess('Product updated successfully')
      } else {
        // Add new product
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
      
      setDialogOpen(false)
      reset()
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
            Products
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage your product catalog and inventory
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<RestoreIcon />}
            onClick={() => setDeletedProductsDialogOpen(true)}
          >
            View Deleted
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            size="large"
            onClick={handleAddProduct}
          >
            Add Product
          </Button>
        </Box>
      </Box>

      {/* Filters and Search */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={3} alignItems="center">
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth>
              <InputLabel>Category</InputLabel>
              <Select
                value={selectedCategory}
                label="Category"
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <MenuItem value="">All Categories</MenuItem>
                {categories.map(category => (
                  <MenuItem key={category.id} value={category.id}>
                    {category.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={5} sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button
              variant="outlined"
              startIcon={<ExportIcon />}
            >
              Export
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Products Display */}
      {loading?.products ? (
        <LoadingSpinner message="Loading products..." />
      ) : (
        <>
          {filteredProducts.length === 0 ? (
            <Paper sx={{ p: 6, textAlign: 'center' }}>
              <InventoryIcon sx={{ fontSize: 80, color: 'text.disabled', mb: 2 }} />
              <Typography variant="h6" sx={{ mb: 1 }}>
                No products found
              </Typography>
              <Typography color="text.secondary">
                Try adjusting your search criteria or add a new product.
              </Typography>
            </Paper>
          ) : (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>SKU</TableCell>
                    <TableCell>Category</TableCell>
                    <TableCell align="right">Price</TableCell>
                    <TableCell align="right">Stock</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {paginatedProducts.map(product => {
                    const stockStatus = getStockStatus(product)
                    return (
                      <TableRow key={product.id} hover>
                        <TableCell>
                          <Box>
                            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                              {product.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {product.description}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                            {product.sku}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip 
                            label={product.category?.name} 
                            size="small" 
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="subtitle2" color="primary">
                            ${(product.retailPrice || 0).toFixed(2)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          {product.stockQuantity || 0} {product.unit}
                        </TableCell>
                        <TableCell>
                          <Chip 
                            label={stockStatus.label} 
                            size="small" 
                            color={stockStatus.color}
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell align="right">
                          <IconButton
                            size="small"
                            onClick={(e) => handleMenuOpen(e, product)}
                          >
                            <MoreIcon />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
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
              />
            </TableContainer>
          )}
        </>
      )}

      {/* Context Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => selectedProduct && handleEditProduct(selectedProduct)}>
          <EditIcon sx={{ mr: 1 }} fontSize="small" />
          Edit
        </MenuItem>
        <MenuItem onClick={() => handleMenuClose()}>
          <ViewIcon sx={{ mr: 1 }} fontSize="small" />
          View Details
        </MenuItem>
        <MenuItem 
          onClick={() => selectedProduct && handleDeleteProduct(selectedProduct)}
          sx={{ color: 'error.main' }}
        >
          <DeleteIcon sx={{ mr: 1 }} fontSize="small" />
          Delete
        </MenuItem>
      </Menu>

      {/* Product Form Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
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
                      <InputLabel>Category</InputLabel>
                      <Select {...field} label="Category">
                        {categories && categories.length > 0 ? (
                          categories.map(category => (
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
                        <Typography variant="caption" color="error" sx={{ mt: 0.5, mx: 2 }}>
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
                      <InputLabel>Product Type</InputLabel>
                      <Select {...field} label="Product Type">
                        <MenuItem value="goods">Goods</MenuItem>
                        <MenuItem value="service">Service</MenuItem>
                      </Select>
                      {errors.type && (
                        <Typography variant="caption" color="error" sx={{ mt: 0.5, mx: 2 }}>
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
                      <InputLabel>Unit</InputLabel>
                      <Select {...field} label="Unit">
                        <MenuItem value="pcs">Pieces</MenuItem>
                        <MenuItem value="kg">Kilograms</MenuItem>
                        <MenuItem value="lbs">Pounds</MenuItem>
                        <MenuItem value="m">Meters</MenuItem>
                        <MenuItem value="ft">Feet</MenuItem>
                        <MenuItem value="l">Liters</MenuItem>
                        <MenuItem value="gal">Gallons</MenuItem>
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
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
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