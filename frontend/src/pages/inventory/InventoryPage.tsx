import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  Button,
  Chip,
  CircularProgress,
  Alert,
} from '@mui/material'
import {
  Add as AddIcon,
  Inventory as InventoryIcon,
  Category as CategoryIcon,
  TrendingUp as TrendingUpIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import { inventoryApi } from '@/services/inventoryApi'

const InventoryPage: React.FC = () => {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalCategories: 0,
    inventoryValue: 0,
  })

  const fetchInventoryStats = async () => {
    try {
      setLoading(true)
      setError(null)

      // Fetch products and categories in parallel with timeout and retry
      const [productsResponse, categoriesResponse] = await Promise.all([
        inventoryApi.getProducts({ limit: 1 }), // Just get count
        inventoryApi.getCategories(),
      ])

      // Get full product list to calculate inventory value
      const allProductsResponse = await inventoryApi.getProducts({ limit: 1000 })
      
      // Safely extract data with null checks
      const products = Array.isArray(allProductsResponse?.data) ? allProductsResponse.data : []
      const categories = Array.isArray(categoriesResponse?.data) ? categoriesResponse.data : []
      
      const inventoryValue = products.reduce((total: number, product: any) => {
        const price = product?.retailPrice || 0
        const stock = product?.stockQuantity || 0
        return total + (price * stock)
      }, 0)

      setStats({
        totalProducts: productsResponse?.meta?.total || products.length || 0,
        totalCategories: categories.length || 0,
        inventoryValue: Number(inventoryValue.toFixed(2)),
      })
    } catch (err: any) {
      console.error('Error fetching inventory stats:', err)
      const errorMessage = err?.response?.data?.message || err?.message || 'Failed to load inventory statistics'
      setError(`${errorMessage}. Please try again.`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchInventoryStats()
  }, [])

  const handleAddProduct = () => {
    navigate('/inventory/products')
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <CircularProgress size={60} />
      </Box>
    )
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
            Inventory Management
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage your products, categories, and stock levels
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

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 4 }}>
          {error}
        </Alert>
      )}

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <InventoryIcon color="primary" sx={{ fontSize: 40 }} />
                <Box>
                  <Typography variant="h5" sx={{ fontWeight: 600 }}>
                    {stats.totalProducts.toLocaleString()}
                  </Typography>
                  <Typography color="text.secondary">Total Products</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <CategoryIcon color="secondary" sx={{ fontSize: 40 }} />
                <Box>
                  <Typography variant="h5" sx={{ fontWeight: 600 }}>
                    {stats.totalCategories}
                  </Typography>
                  <Typography color="text.secondary">Categories</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <TrendingUpIcon color="success" sx={{ fontSize: 40 }} />
                <Box>
                  <Typography variant="h5" sx={{ fontWeight: 600 }}>
                    ${stats.inventoryValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </Typography>
                  <Typography color="text.secondary">Inventory Value</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Quick Actions */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                <InventoryIcon color="primary" sx={{ fontSize: 32 }} />
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    Product Management
                  </Typography>
                  <Typography color="text.secondary">
                    Manage your product catalog
                  </Typography>
                </Box>
              </Box>
              <Button
                variant="outlined"
                fullWidth
                onClick={() => navigate('/inventory/products')}
                startIcon={<InventoryIcon />}
              >
                View Products
              </Button>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                <CategoryIcon color="secondary" sx={{ fontSize: 32 }} />
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    Category Management
                  </Typography>
                  <Typography color="text.secondary">
                    Organize products by categories
                  </Typography>
                </Box>
              </Box>
              <Button
                variant="outlined"
                fullWidth
                onClick={() => navigate('/inventory/categories')}
                startIcon={<CategoryIcon />}
              >
                View Categories
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}

export default InventoryPage