import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Paper,
  Button,
  Grid,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  useTheme,
  CircularProgress,
  Alert
} from '@mui/material'
import {
  Inventory2 as InventoryIcon,
  Category as CategoryIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Warning as WarningIcon,
  ErrorOutline as OutOfStockIcon,
  Add as AddIcon,
  Timeline as TimelineIcon,
  Assessment as AssessmentIcon
} from '@mui/icons-material'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
} from 'chart.js'
import { Bar, Doughnut } from 'react-chartjs-2'
import { format } from 'date-fns'
import { formatCurrency } from '@/utils/formatters'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'
import { useNavigate } from 'react-router-dom'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
)

const InventoryPage: React.FC = () => {
  const theme = useTheme()
  const navigate = useNavigate()
  const [inventoryData, setInventoryData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchInventoryData()
  }, [])

  const fetchInventoryData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Fetch dashboard stats
      const statsResponse = await fetch('/api/inventory/products/dashboard-stats')
      let dashboardStats = null
      if (statsResponse.ok) {
        dashboardStats = await statsResponse.json()
      }

      // Fetch recent stock movements
      const movementsResponse = await fetch('/api/inventory/stock/movements?limit=5&sortBy=movementDate&sortOrder=DESC')
      let movementsData = []
      if (movementsResponse.ok) {
        const movementsResult = await movementsResponse.json()
        movementsData = movementsResult.data || []
      }

      // Fetch out of stock products
      const outOfStockResponse = await fetch('/api/inventory/products/out-of-stock')
      let outOfStockData = []
      if (outOfStockResponse.ok) {
        outOfStockData = await outOfStockResponse.json()
      }

      setInventoryData({
        stats: dashboardStats || {
          totalProducts: 0,
          totalCategories: 0,
          inventoryValue: 0,
          lowStockCount: 0,
          outOfStockCount: 0,
          recentMovements: 0,
          categoryBreakdown: [],
          stockHealthMetrics: {
            inStockPercentage: 0,
            outOfStockPercentage: 0,
            averageValue: 0
          }
        },
        recentMovements: movementsData,
        outOfStockAlerts: outOfStockData
      })
    } catch (error) {
      console.error('Error fetching inventory data:', error)
      setError('Failed to load inventory data')
    } finally {
      setLoading(false)
    }
  }

  // Chart data for category breakdown
  const categoryBreakdownData = {
    labels: inventoryData?.stats?.categoryBreakdown?.map((item: any) => item.category) || [],
    datasets: [
      {
        label: 'Inventory Value',
        data: inventoryData?.stats?.categoryBreakdown?.map((item: any) => item.value) || [],
        backgroundColor: [
          theme.palette.primary.main,
          theme.palette.secondary.main,
          theme.palette.success.main,
          theme.palette.warning.main,
          theme.palette.info.main,
          theme.palette.error.main,
        ],
        borderWidth: 2,
        borderColor: theme.palette.background.paper
      }
    ]
  }

  const stockHealthData = {
    labels: ['In Stock', 'Out of Stock'],
    datasets: [
      {
        data: [
          inventoryData?.stats?.stockHealthMetrics?.inStockPercentage || 0,
          inventoryData?.stats?.stockHealthMetrics?.outOfStockPercentage || 0
        ],
        backgroundColor: [
          theme.palette.success.main,
          theme.palette.error.main
        ],
        borderWidth: 2,
        borderColor: theme.palette.background.paper
      }
    ]
  }

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            const label = context.label || '';
            const value = context.parsed || 0;
            return `${label}: ${value}%`;
          }
        }
      }
    }
  }

  const barChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value: any) {
            return formatCurrency(value)
          }
        }
      }
    }
  }

  const stats = [
    {
      title: 'Total Products',
      value: inventoryData?.stats?.totalProducts || '0',
      change: '+0.0%',
      trend: 'up',
      icon: InventoryIcon,
      color: 'primary'
    },
    {
      title: 'Categories',
      value: inventoryData?.stats?.totalCategories || '0',
      change: '+0.0%',
      trend: 'up',
      icon: CategoryIcon,
      color: 'secondary'
    },
    {
      title: 'Inventory Value',
      value: formatCurrency(inventoryData?.stats?.inventoryValue || 0),
      change: '+0.0%',
      trend: 'up',
      icon: TrendingUpIcon,
      color: 'success'
    },
    {
      title: 'Out of Stock',
      value: inventoryData?.stats?.outOfStockCount || '0',
      change: inventoryData?.stats?.outOfStockCount > 0 ? `${inventoryData.stats.outOfStockCount} items` : 'All stocked',
      trend: inventoryData?.stats?.outOfStockCount > 0 ? 'down' : 'up',
      icon: OutOfStockIcon,
      color: 'error'
    }
  ]

  const recentMovements = inventoryData?.recentMovements || []
  const outOfStockAlerts = inventoryData?.outOfStockAlerts || []

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
          <Typography variant={TYPOGRAPHY_STYLES.pageHeader.variant} sx={{
            fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight,
            mb: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 2
          }}>
            <InventoryIcon sx={{
              fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize,
              color: TYPOGRAPHY_STYLES.pageHeader.icon.color
            }} />
            Inventory Overview
          </Typography>
          <Typography variant={TYPOGRAPHY_STYLES.pageSubtitle.variant} color={TYPOGRAPHY_STYLES.pageSubtitle.color}>
            Monitor stock levels, track movements, and manage inventory health
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            onClick={() => navigate('/inventory/categories')}
          >
            Manage Categories
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate('/inventory/products')}
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
        {stats.map((stat, index) => (
          <Grid item xs={12} sm={6} lg={3} key={index}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Box
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      bgcolor: `${stat.color}.light`,
                      color: `${stat.color}.contrastText`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <stat.icon />
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {stat.trend === 'up' ? (
                      <TrendingUpIcon sx={{ fontSize: 16, color: 'success.main' }} />
                    ) : (
                      <TrendingDownIcon sx={{ fontSize: 16, color: 'error.main' }} />
                    )}
                    <Typography
                      variant={TYPOGRAPHY_STYLES.tableCell.caption.variant}
                      sx={{
                        color: stat.trend === 'up' ? 'success.main' : 'error.main',
                        fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                        fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize
                      }}
                    >
                      {stat.change}
                    </Typography>
                  </Box>
                </Box>
                <Typography variant={TYPOGRAPHY_STYLES.pageHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight, mb: 0.5 }}>
                  {stat.value}
                </Typography>
                <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} color="text.secondary">
                  {stat.title}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Charts and Analytics */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} lg={6}>
          <Paper sx={{ p: 3, height: 400 }}>
            <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, mb: 3 }}>
              Category Value Distribution
            </Typography>
            <Box sx={{ height: 300 }}>
              {inventoryData?.stats?.categoryBreakdown && inventoryData.stats.categoryBreakdown.length > 0 ? (
                <Bar data={categoryBreakdownData} options={barChartOptions} />
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} color="text.secondary">
                    No category data available
                  </Typography>
                </Box>
              )}
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} lg={6}>
          <Paper sx={{ p: 3, height: 400 }}>
            <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, mb: 3 }}>
              Stock Health Status
            </Typography>
            <Box sx={{ height: 300 }}>
              <Doughnut data={stockHealthData} options={doughnutOptions} />
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Recent Stock Movements and Low Stock Alerts */}
      <Grid container spacing={3}>
        <Grid item xs={12} lg={8}>
          <Paper sx={{ overflow: 'hidden' }}>
            <Box sx={{ p: 3, borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight }}>
                Recent Stock Movements
              </Typography>
              <Chip
                label={`${inventoryData?.stats?.recentMovements || 0} total`}
                color="info"
                size="small"
              />
            </Box>
            <TableContainer>
              <Table size={TABLE_STYLES.size}>
                <TableHead>
                  <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, backgroundColor: TABLE_STYLES.header.backgroundColor, py: TABLE_STYLES.header.padding.py } }}>
                    <TableCell>
                      <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                        fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                        color: TYPOGRAPHY_STYLES.tableHeader.color,
                        fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                      }}>
                        Date
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                        fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                        color: TYPOGRAPHY_STYLES.tableHeader.color,
                        fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                      }}>
                        Product
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                        fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                        color: TYPOGRAPHY_STYLES.tableHeader.color,
                        fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                      }}>
                        Type
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                        fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                        color: TYPOGRAPHY_STYLES.tableHeader.color,
                        fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                      }}>
                        Quantity
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                        fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                        color: TYPOGRAPHY_STYLES.tableHeader.color,
                        fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                      }}>
                        Reference
                      </Typography>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {recentMovements.length > 0 ? recentMovements.map((movement: any) => (
                    <TableRow
                      key={movement.id}
                      hover
                      sx={{
                        '& .MuiTableCell-root': {
                          borderBottom: TABLE_STYLES.cell.border,
                          py: TABLE_STYLES.cell.padding.py,
                          px: TABLE_STYLES.cell.padding.px
                        },
                        height: TABLE_STYLES.row.height
                      }}
                    >
                      <TableCell>
                        <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.secondary.fontSize }}>
                          {movement.movementDate ? format(new Date(movement.movementDate), 'MMM dd, yyyy') : 'N/A'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                          {movement.product?.name || 'Unknown'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={movement.movementType?.replace('_', ' ') || 'N/A'}
                          color={
                            movement.movementType === 'IN' ? 'success' :
                            movement.movementType === 'OUT' ? 'error' :
                            'default'
                          }
                          size="small"
                          variant="outlined"
                          sx={{
                            fontSize: TYPOGRAPHY_STYLES.chip.small.fontSize,
                            fontWeight: TYPOGRAPHY_STYLES.chip.small.fontWeight,
                            height: TYPOGRAPHY_STYLES.chip.small.height
                          }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant={TYPOGRAPHY_STYLES.tableCell.primary.variant}
                          sx={{
                            fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                            fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
                            color: movement.quantity > 0 ? 'success.main' : 'error.main'
                          }}
                        >
                          {movement.quantity > 0 ? '+' : ''}{movement.quantity}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.secondary.fontSize }}>
                          {movement.referenceNumber || 'N/A'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} color="text.secondary">
                          No recent stock movements
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 3 }}>
            <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, mb: 3 }}>
              Out of Stock Items
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {outOfStockAlerts.length > 0 ? outOfStockAlerts.slice(0, 5).map((alert: any, index: number) => (
                <Box key={alert.id || index}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        sx={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          bgcolor: 'error.main',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <OutOfStockIcon sx={{ fontSize: 14 }} />
                      </Box>
                      <Box>
                        <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                          {alert.name || 'Unknown Product'}
                        </Typography>
                      </Box>
                    </Box>
                    <Chip
                      label="Out"
                      color="error"
                      size="small"
                      sx={{
                        fontSize: TYPOGRAPHY_STYLES.chip.small.fontSize,
                        fontWeight: TYPOGRAPHY_STYLES.chip.small.fontWeight,
                        height: TYPOGRAPHY_STYLES.chip.small.height
                      }}
                    />
                  </Box>
                </Box>
              )) : (
                <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} color="text.secondary" align="center">
                  All products in stock
                </Typography>
              )}
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  )
}

export default InventoryPage
