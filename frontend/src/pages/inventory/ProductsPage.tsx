import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  Grid,
  Card,
  CardContent,
  CardMedia,
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
  Checkbox,
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
} from '@mui/icons-material'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import { useNotification } from '@/hooks/useNotification'
import type { Product, Category } from '@/types'

// Mock data - in real app, this would come from API
const mockProducts: Product[] = [
  {
    id: '1',
    name: 'Laptop Dell XPS 13',
    description: 'High-performance ultrabook with Intel i7 processor',
    sku: 'DELL-XPS13-001',
    price: 1299.99,
    cost: 899.99,
    stock: 25,
    minStock: 10,
    maxStock: 100,
    unit: 'pcs',
    isActive: true,
    category: {
      id: '1',
      name: 'Electronics',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    images: ['/api/uploads/laptop-dell-xps13.jpg'],
    createdAt: new Date('2023-01-15'),
    updatedAt: new Date('2023-12-01'),
  },
  {
    id: '2',
    name: 'Office Chair Ergonomic',
    description: 'Comfortable ergonomic office chair with lumbar support',
    sku: 'CHAIR-ERG-001',
    price: 299.99,
    cost: 149.99,
    stock: 5,
    minStock: 10,
    maxStock: 50,
    unit: 'pcs',
    isActive: true,
    category: {
      id: '2',
      name: 'Furniture',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    createdAt: new Date('2023-02-10'),
    updatedAt: new Date('2023-11-15'),
  },
  {
    id: '3',
    name: 'Wireless Mouse',
    description: 'Bluetooth wireless mouse with precision tracking',
    sku: 'MOUSE-BT-001',
    price: 49.99,
    cost: 24.99,
    stock: 150,
    minStock: 20,
    maxStock: 200,
    unit: 'pcs',
    isActive: true,
    category: {
      id: '3',
      name: 'Accessories',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    createdAt: new Date('2023-03-01'),
    updatedAt: new Date('2023-12-10'),
  },
]

const mockCategories: Category[] = [
  { id: '1', name: 'Electronics', isActive: true, createdAt: new Date(), updatedAt: new Date() },
  { id: '2', name: 'Furniture', isActive: true, createdAt: new Date(), updatedAt: new Date() },
  { id: '3', name: 'Accessories', isActive: true, createdAt: new Date(), updatedAt: new Date() },
  { id: '4', name: 'Software', isActive: true, createdAt: new Date(), updatedAt: new Date() },
]

interface ProductFormData {
  name: string
  description: string
  sku: string
  categoryId: string
  price: number
  cost: number
  stock: number
  minStock: number
  maxStock: number
  unit: string
  isActive: boolean
}

const productSchema = yup.object({
  name: yup.string().required('Product name is required').min(2, 'Name must be at least 2 characters'),
  description: yup.string(),
  sku: yup.string().required('SKU is required').min(3, 'SKU must be at least 3 characters'),
  categoryId: yup.string().required('Category is required'),
  price: yup.number().required('Price is required').min(0, 'Price must be positive'),
  cost: yup.number().required('Cost is required').min(0, 'Cost must be positive'),
  stock: yup.number().required('Stock is required').min(0, 'Stock must be non-negative'),
  minStock: yup.number().required('Minimum stock is required').min(0, 'Minimum stock must be non-negative'),
  maxStock: yup.number().required('Maximum stock is required').min(0, 'Maximum stock must be non-negative'),
  unit: yup.string().required('Unit is required'),
  isActive: yup.boolean(),
})

const ProductsPage: React.FC = () => {
  const { showSuccess, showError } = useNotification()
  const [products, setProducts] = useState<Product[]>(mockProducts)
  const [categories] = useState<Category[]>(mockCategories)
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')
  const [page, setPage] = useState(0)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)

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
      price: 0,
      cost: 0,
      stock: 0,
      minStock: 0,
      maxStock: 0,
      unit: 'pcs',
      isActive: true,
    },
  })

  // Filter products
  const filteredProducts = products.filter(product => {
    const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         product.sku.toLowerCase().includes(searchTerm.toLowerCase())
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
      categoryId: product.category?.id || '',
      price: product.price,
      cost: product.cost,
      stock: product.stock,
      minStock: product.minStock,
      maxStock: product.maxStock,
      unit: product.unit,
      isActive: product.isActive,
    })
    setEditMode(true)
    setDialogOpen(true)
    handleMenuClose()
  }

  const handleDeleteProduct = (product: Product) => {
    if (window.confirm(`Are you sure you want to delete ${product.name}?`)) {
      setProducts(prev => prev.filter(p => p.id !== product.id))
      showSuccess(`Product ${product.name} deleted successfully`)
    }
    handleMenuClose()
  }

  const onSubmit = async (data: ProductFormData) => {
    try {
      setLoading(true)
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const category = categories.find(c => c.id === data.categoryId)
      
      if (editMode && selectedProduct) {
        // Update existing product
        setProducts(prev => prev.map(p => 
          p.id === selectedProduct.id 
            ? {
                ...p,
                ...data,
                category,
                updatedAt: new Date(),
              }
            : p
        ))
        showSuccess('Product updated successfully')
      } else {
        // Add new product
        const newProduct: Product = {
          id: Date.now().toString(),
          ...data,
          category,
          images: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        setProducts(prev => [newProduct, ...prev])
        showSuccess('Product added successfully')
      }
      
      setDialogOpen(false)
      reset()
    } catch (error) {
      showError('Failed to save product. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const getStockStatus = (product: Product) => {
    if (product.stock <= product.minStock) {
      return { label: 'Low Stock', color: 'error' as const }
    } else if (product.stock >= product.maxStock) {
      return { label: 'Overstock', color: 'warning' as const }
    } else {
      return { label: 'In Stock', color: 'success' as const }
    }
  }

  const ProductCard = ({ product }: { product: Product }) => {
    const stockStatus = getStockStatus(product)
    
    return (
      <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <CardMedia
          component="div"
          sx={{
            height: 140,
            bgcolor: 'grey.100',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <InventoryIcon sx={{ fontSize: 60, color: 'text.disabled' }} />
        </CardMedia>
        <CardContent sx={{ flexGrow: 1, p: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '1rem' }}>
              {product.name}
            </Typography>
            <IconButton size="small" onClick={(e) => handleMenuOpen(e, product)}>
              <MoreIcon />
            </IconButton>
          </Box>
          
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            SKU: {product.sku}
          </Typography>
          
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2, minHeight: '2.5em', overflow: 'hidden' }}>
            {product.description}
          </Typography>
          
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Typography variant="h6" color="primary">
              ${product.price.toFixed(2)}
            </Typography>
            <Chip label={product.category?.name} size="small" variant="outlined" />
          </Box>
          
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body2">
              Stock: {product.stock} {product.unit}
            </Typography>
            <Chip 
              label={stockStatus.label} 
              size="small" 
              color={stockStatus.color}
              variant="outlined"
            />
          </Box>
        </CardContent>
      </Card>
    )
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
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          size="large"
          onClick={handleAddProduct}
        >
          Add Product
        </Button>
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
              variant={viewMode === 'grid' ? 'contained' : 'outlined'}
              onClick={() => setViewMode('grid')}
            >
              Grid
            </Button>
            <Button
              variant={viewMode === 'table' ? 'contained' : 'outlined'}
              onClick={() => setViewMode('table')}
            >
              Table
            </Button>
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
      {loading ? (
        <LoadingSpinner message="Loading products..." />
      ) : (
        <>
          {viewMode === 'grid' ? (
            <>
              <Grid container spacing={3}>
                {paginatedProducts.map(product => (
                  <Grid item xs={12} sm={6} md={4} lg={3} key={product.id}>
                    <ProductCard product={product} />
                  </Grid>
                ))}
              </Grid>
              
              {filteredProducts.length === 0 && (
                <Paper sx={{ p: 6, textAlign: 'center' }}>
                  <InventoryIcon sx={{ fontSize: 80, color: 'text.disabled', mb: 2 }} />
                  <Typography variant="h6" sx={{ mb: 1 }}>
                    No products found
                  </Typography>
                  <Typography color="text.secondary">
                    Try adjusting your search criteria or add a new product.
                  </Typography>
                </Paper>
              )}
            </>
          ) : (
            <TableContainer component={Paper}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">
                      <Checkbox />
                    </TableCell>
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
                        <TableCell padding="checkbox">
                          <Checkbox />
                        </TableCell>
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
                            ${product.price.toFixed(2)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          {product.stock} {product.unit}
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
                        {categories.map(category => (
                          <MenuItem key={category.id} value={category.id}>
                            {category.name}
                          </MenuItem>
                        ))}
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
              <Grid item xs={12} md={6}>
                <Controller
                  name="price"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Sale Price"
                      type="number"
                      inputProps={{ step: 0.01, min: 0 }}
                      InputProps={{
                        startAdornment: <InputAdornment position="start">$</InputAdornment>
                      }}
                      error={!!errors.price}
                      helperText={errors.price?.message}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <Controller
                  name="cost"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Cost Price"
                      type="number"
                      inputProps={{ step: 0.01, min: 0 }}
                      InputProps={{
                        startAdornment: <InputAdornment position="start">$</InputAdornment>
                      }}
                      error={!!errors.cost}
                      helperText={errors.cost?.message}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <Controller
                  name="stock"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Current Stock"
                      type="number"
                      inputProps={{ min: 0 }}
                      error={!!errors.stock}
                      helperText={errors.stock?.message}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <Controller
                  name="minStock"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Min Stock"
                      type="number"
                      inputProps={{ min: 0 }}
                      error={!!errors.minStock}
                      helperText={errors.minStock?.message}
                    />
                  )}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <Controller
                  name="maxStock"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Max Stock"
                      type="number"
                      inputProps={{ min: 0 }}
                      error={!!errors.maxStock}
                      helperText={errors.maxStock?.message}
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
    </Box>
  )
}

export default ProductsPage