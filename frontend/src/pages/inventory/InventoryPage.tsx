import React, { useState, useEffect, useCallback } from 'react'
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Button,
  Chip,
  CircularProgress,
  Alert,
  LinearProgress,
  IconButton,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Avatar,
  Divider,
} from '@mui/material'
import {
  Add as AddIcon,
  Inventory2 as InventoryIcon,
  Category as CategoryIcon,
  TrendingUp as TrendingUpIcon,
  Warning as WarningIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon,
  Refresh as RefreshIcon,
  Timeline as TimelineIcon,
  Assessment as AssessmentIcon,
  Inventory as StockIcon,
  LocalShipping as ShippingIcon,
  ShoppingCart as SalesIcon,
  ErrorOutline as AlertIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import { inventoryApi } from '@/services/inventoryApi'
import { formatCurrencyWhole } from '@/utils/currency'
import { useWebSocket, useRealtimeUpdates } from '@/hooks/useWebSocket'

interface LowStockAlert {
  productId: string
  sku: string
  name: string
  currentStock: number
  reorderLevel: number
  alertSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  categoryName: string
  estimatedDaysUntilOutOfStock: number
}

interface StockMovement {
  id: string
  movementType: string
  quantity: number
  movementDate: string
  product: {
    name: string
    sku: string
  }
  description: string
}

const InventoryPage: React.FC = () => {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalCategories: 0,
    inventoryValue: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    recentMovements: 0,
  })
  const [lowStockAlerts, setLowStockAlerts] = useState<LowStockAlert[]>([])
  const [recentMovements, setRecentMovements] = useState<StockMovement[]>([])
  const [categoryBreakdown, setCategoryBreakdown] = useState<Array<{ category: string; count: number; value: number }>>([])

  // WebSocket integration for real-time updates
  const { isConnected } = useWebSocket()

  // Handle real-time inventory updates
  const handleInventoryUpdate = useCallback((data: any) => {
    console.log('Real-time inventory update:', data)
    // Refresh stats when inventory changes
    fetchInventoryStats(true)
  }, [])

  const handleStockMovementUpdate = useCallback((data: any) => {
    console.log('Real-time stock movement update:', data)
    // Refresh stats and recent movements
    fetchInventoryStats(true)
  }, [])

  // Subscribe to real-time updates
  useRealtimeUpdates('inventory', handleInventoryUpdate)
  useRealtimeUpdates('stock_movement', handleStockMovementUpdate)

  const fetchInventoryStats = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      setError(null)

      // Fetch dashboard stats (critical) and recent movements (optional) separately
      const dashboardResponse = await inventoryApi.getDashboardStats()
      
      // Try to fetch stock movements, but don't fail if it doesn't work
      let movements: any[] = []
      try {
        const stockMovementsResponse = await inventoryApi.getStockMovements({ limit: 10, sortBy: 'movementDate', sortOrder: 'desc' })
        movements = Array.isArray(stockMovementsResponse?.data?.data) ? stockMovementsResponse.data.data : []
      } catch (movementsError) {
        console.warn('Failed to fetch stock movements:', movementsError)
        movements = []
      }
      
      // Safely extract data with null checks
      const dashboardData = (dashboardResponse as any)
      
      if (dashboardData) {
        setStats({
          totalProducts: dashboardData.totalProducts || 0,
          totalCategories: dashboardData.totalCategories || 0,
          inventoryValue: dashboardData.inventoryValue || 0,
          lowStockCount: dashboardData.lowStockCount || 0,
          outOfStockCount: dashboardData.outOfStockCount || 0,
          recentMovements: dashboardData.recentMovements || 0,
        })

        setCategoryBreakdown(dashboardData.categoryBreakdown || [])
      }

      setRecentMovements(movements as any)

      // Fetch low stock alerts if available (mock data for now since API might not be implemented)
      try {
        const alertsResponse = await inventoryApi.getStockLevels({ lowStock: true })
        if (alertsResponse?.data && Array.isArray(alertsResponse.data)) {
          const alerts: LowStockAlert[] = alertsResponse.data.map((item: any) => ({
            productId: item.product?.id || '',
            sku: item.product?.sku || '',
            name: item.product?.name || '',
            currentStock: item.currentStock || 0,
            reorderLevel: item.minStock || 0,
            alertSeverity: item.status === 'out_of_stock' ? 'CRITICAL' : 'HIGH' as any,
            categoryName: item.product?.category?.name || 'Uncategorized',
            estimatedDaysUntilOutOfStock: 0
          }))
          setLowStockAlerts(alerts)
        }
      } catch (alertErr) {
        // Fallback: create empty alerts since we don't have product data here anymore
        setLowStockAlerts([])
      }

    } catch (err: any) {
      console.error('Error fetching inventory stats:', err)
      const errorMessage = err?.response?.data?.message || err?.message || 'Failed to load inventory statistics'
      setError(errorMessage)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleRefresh = () => {
    fetchInventoryStats(true)
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
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
            <InventoryIcon sx={{ fontSize: 40, color: 'primary.main' }} />
            Inventory Overview
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Monitor your stock levels, track movements, and manage inventory health
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          {/* WebSocket Connection Indicator */}
          <Tooltip title={isConnected ? 'Real-time updates active' : 'Real-time updates disconnected'}>
            <Chip
              icon={<TimelineIcon />}
              label={isConnected ? 'Live' : 'Offline'}
              size="small"
              color={isConnected ? 'success' : 'default'}
              variant={isConnected ? 'filled' : 'outlined'}
              sx={{ mr: 1 }}
            />
          </Tooltip>
          <Tooltip title="Refresh data">
            <IconButton 
              onClick={handleRefresh} 
              disabled={refreshing}
              sx={{ bgcolor: 'action.hover' }}
            >
              <RefreshIcon className={refreshing ? 'rotate' : ''} />
            </IconButton>
          </Tooltip>
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

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 4 }}>
          {error}
        </Alert>
      )}

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} lg={2}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Avatar sx={{ bgcolor: 'primary.main', width: 48, height: 48 }}>
                  <InventoryIcon />
                </Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h5" sx={{ fontWeight: 600, mb: 0.5 }}>
                    {stats.totalProducts.toLocaleString()}
                  </Typography>
                  <Typography color="text.secondary" variant="body2">
                    Total Products
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} lg={2}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Avatar sx={{ bgcolor: 'secondary.main', width: 48, height: 48 }}>
                  <CategoryIcon />
                </Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h5" sx={{ fontWeight: 600, mb: 0.5 }}>
                    {stats.totalCategories}
                  </Typography>
                  <Typography color="text.secondary" variant="body2">
                    Categories
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} lg={2}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Avatar sx={{ bgcolor: 'success.main', width: 48, height: 48 }}>
                  <TrendingUpIcon />
                </Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h5" sx={{ fontWeight: 600, mb: 0.5 }}>
                    {formatCurrencyWhole(stats.inventoryValue)}
                  </Typography>
                  <Typography color="text.secondary" variant="body2">
                    Inventory Value
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} lg={2}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Avatar sx={{ bgcolor: 'warning.main', width: 48, height: 48 }}>
                  <WarningIcon />
                </Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h5" sx={{ fontWeight: 600, mb: 0.5 }}>
                    {stats.lowStockCount}
                  </Typography>
                  <Typography color="text.secondary" variant="body2">
                    Low Stock Items
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} lg={2}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Avatar sx={{ bgcolor: 'error.main', width: 48, height: 48 }}>
                  <AlertIcon />
                </Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h5" sx={{ fontWeight: 600, mb: 0.5 }}>
                    {stats.outOfStockCount}
                  </Typography>
                  <Typography color="text.secondary" variant="body2">
                    Out of Stock
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} lg={2}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Avatar sx={{ bgcolor: 'info.main', width: 48, height: 48 }}>
                  <TimelineIcon />
                </Avatar>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h5" sx={{ fontWeight: 600, mb: 0.5 }}>
                    {stats.recentMovements.toLocaleString()}
                  </Typography>
                  <Typography color="text.secondary" variant="body2">
                    Stock Movements
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Main Dashboard Content */}
      <Grid container spacing={3}>
        {/* Low Stock Alerts */}
        <Grid item xs={12} lg={8}>
          <Card sx={{ height: 400 }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <WarningIcon color="warning" />
                  Stock Alerts
                </Typography>
                <Chip 
                  label={`${lowStockAlerts.length} alerts`} 
                  color={lowStockAlerts.length > 0 ? 'warning' : 'success'}
                  size="small"
                />
              </Box>
              
              {lowStockAlerts.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography color="text.secondary">
                    No stock alerts at the moment. All products are well-stocked.
                  </Typography>
                </Box>
              ) : (
                <TableContainer sx={{ maxHeight: 300 }}>
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Product</TableCell>
                        <TableCell>Category</TableCell>
                        <TableCell align="right">Current Stock</TableCell>
                        <TableCell align="right">Reorder Level</TableCell>
                        <TableCell align="center">Status</TableCell>
                        <TableCell align="right">Days Left</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {lowStockAlerts.map((alert) => (
                        <TableRow key={alert.productId} hover>
                          <TableCell>
                            <Box>
                              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                {alert.name}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                SKU: {alert.sku}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">{alert.categoryName}</Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {alert.currentStock}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2">{alert.reorderLevel}</Typography>
                          </TableCell>
                          <TableCell align="center">
                            <Chip
                              label={alert.alertSeverity}
                              size="small"
                              color={
                                alert.alertSeverity === 'CRITICAL' ? 'error' :
                                alert.alertSeverity === 'HIGH' ? 'warning' :
                                alert.alertSeverity === 'MEDIUM' ? 'info' : 'default'
                              }
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2">
                              {alert.estimatedDaysUntilOutOfStock > 0 ? `${alert.estimatedDaysUntilOutOfStock}d` : '-'}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Category Breakdown */}
        <Grid item xs={12} lg={4}>
          <Card sx={{ height: 400 }}>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                <AssessmentIcon color="primary" />
                Top Categories
              </Typography>
              
              {categoryBreakdown.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography color="text.secondary">
                    No category data available
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ space: 2 }}>
                  {categoryBreakdown.map((item) => {
                    const maxValue = Math.max(...categoryBreakdown.map(c => c.value))
                    const percentage = maxValue > 0 ? (item.value / maxValue) * 100 : 0
                    
                    return (
                      <Box key={item.category} sx={{ mb: 3 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {item.category}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {item.count} items
                          </Typography>
                        </Box>
                        <LinearProgress 
                          variant="determinate" 
                          value={percentage} 
                          sx={{ height: 8, borderRadius: 4, mb: 1 }}
                        />
                        <Typography variant="caption" color="text.secondary">
                          {formatCurrencyWhole(item.value)}
                        </Typography>
                      </Box>
                    )
                  })}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Recent Stock Movements */}
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TimelineIcon color="info" />
                  Recent Stock Movements
                </Typography>
                <Button size="small" onClick={() => navigate('/inventory/stock-movements')}>
                  View All
                </Button>
              </Box>
              
              {recentMovements.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <Typography color="text.secondary">
                    No recent stock movements
                  </Typography>
                </Box>
              ) : (
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Date</TableCell>
                        <TableCell>Product</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell align="right">Quantity</TableCell>
                        <TableCell>Description</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {recentMovements.slice(0, 5).map((movement) => (
                        <TableRow key={movement.id} hover>
                          <TableCell>
                            <Typography variant="body2">
                              {new Date(movement.movementDate).toLocaleDateString()}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {new Date(movement.movementDate).toLocaleTimeString()}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Box>
                              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                {movement.product.name}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                SKU: {movement.product.sku}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={movement.movementType.replace('_', ' ')}
                              size="small"
                              color="primary"
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                              {movement.quantity > 0 ? (
                                <ArrowUpwardIcon fontSize="small" color="success" />
                              ) : (
                                <ArrowDownwardIcon fontSize="small" color="error" />
                              )}
                              <Typography 
                                variant="body2" 
                                sx={{ fontWeight: 500 }}
                                color={movement.quantity > 0 ? 'success.main' : 'error.main'}
                              >
                                {Math.abs(movement.quantity)}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">
                              {movement.description || 'Stock movement'}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Quick Actions */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 3 }}>
                Quick Actions
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Button
                  variant="outlined"
                  fullWidth
                  onClick={() => navigate('/inventory/products')}
                  startIcon={<InventoryIcon />}
                  sx={{ justifyContent: 'flex-start' }}
                >
                  Manage Products
                </Button>
                <Button
                  variant="outlined"
                  fullWidth
                  onClick={() => navigate('/inventory/categories')}
                  startIcon={<CategoryIcon />}
                  sx={{ justifyContent: 'flex-start' }}
                >
                  Manage Categories
                </Button>
                <Divider sx={{ my: 1 }} />
                <Button
                  variant="outlined"
                  fullWidth
                  startIcon={<StockIcon />}
                  sx={{ justifyContent: 'flex-start' }}
                >
                  Stock Adjustments
                </Button>
                <Button
                  variant="outlined"
                  fullWidth
                  startIcon={<ShippingIcon />}
                  sx={{ justifyContent: 'flex-start' }}
                >
                  Receiving
                </Button>
                <Button
                  variant="outlined"
                  fullWidth
                  startIcon={<SalesIcon />}
                  sx={{ justifyContent: 'flex-start' }}
                >
                  Sales Orders
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Performance Insights */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                <TrendingUpIcon color="success" />
                Inventory Health
              </Typography>
              
              <Grid container spacing={3}>
                <Grid item xs={6} md={3}>
                  <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'success.light', borderRadius: 2 }}>
                    <Typography variant="h4" sx={{ fontWeight: 700, color: 'success.dark' }}>
                      {stats.totalProducts > 0 ? Math.round(((stats.totalProducts - stats.outOfStockCount) / stats.totalProducts) * 100) : 0}%
                    </Typography>
                    <Typography variant="body2" color="success.dark">
                      In Stock
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'warning.light', borderRadius: 2 }}>
                    <Typography variant="h4" sx={{ fontWeight: 700, color: 'warning.dark' }}>
                      {stats.totalProducts > 0 ? Math.round((stats.lowStockCount / stats.totalProducts) * 100) : 0}%
                    </Typography>
                    <Typography variant="body2" color="warning.dark">
                      Low Stock
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'error.light', borderRadius: 2 }}>
                    <Typography variant="h4" sx={{ fontWeight: 700, color: 'error.dark' }}>
                      {stats.totalProducts > 0 ? Math.round((stats.outOfStockCount / stats.totalProducts) * 100) : 0}%
                    </Typography>
                    <Typography variant="body2" color="error.dark">
                      Out of Stock
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'info.light', borderRadius: 2 }}>
                    <Typography variant="h4" sx={{ fontWeight: 700, color: 'info.dark' }}>
                      {formatCurrencyWhole(stats.inventoryValue / Math.max(stats.totalProducts, 1))}
                    </Typography>
                    <Typography variant="body2" color="info.dark">
                      Avg. Value
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}

export default InventoryPage