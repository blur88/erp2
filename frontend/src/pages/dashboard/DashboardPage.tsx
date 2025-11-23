import React, { useState, useEffect } from 'react'
import {
  Box,
  Grid,
  Paper,
  Typography,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Avatar,
  useTheme,
  CircularProgress,
  LinearProgress,
  Alert,
} from '@mui/material'
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Inventory2 as InventoryIcon,
  PointOfSale as SalesIcon,
  Assignment as PurchasingIcon,
  People as CustomersIcon,
  LocalShipping as SuppliersIcon,
  Receipt as OrdersIcon,
  Warning as WarningIcon,
  Dashboard as DashboardIcon,
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
  ArcElement,
  Filler
} from 'chart.js'
import { Line, Doughnut } from 'react-chartjs-2'
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
  ArcElement,
  Filler
)

interface DashboardData {
  sales: {
    totalRevenue: number
    totalOrders: number
    uniqueCustomers: number
    revenueGrowth: number
    ordersGrowth: number
    recentOrders: any[]
    topProducts: any[]
    periodData: any[]
  }
  purchasing: {
    totalSpent: number
    totalOrders: number
    activeSuppliers: number
    spentGrowth: number
    recentOrders: any[]
    topSuppliers: any[]
    periodData: any[]
  }
  inventory: {
    totalProducts: number
    totalCategories: number
    inventoryValue: number
    outOfStockCount: number
    lowStockItems: any[]
    stockHealthMetrics: {
      inStockPercentage: number
      outOfStockPercentage: number
    }
  }
}

const DashboardPage: React.FC = () => {
  const theme = useTheme()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Fetch all data in parallel
      const [
        salesOrdersRes,
        purchaseOrdersRes,
        suppliersRes,
        inventoryStatsRes,
        outOfStockRes
      ] = await Promise.all([
        fetch('/api/sales-orders?limit=100&sortBy=orderDate&sortOrder=desc'),
        fetch('/api/purchasing/orders?limit=100&sortBy=orderDate&sortOrder=DESC'),
        fetch('/api/purchasing/suppliers?limit=100'),
        fetch('/api/inventory/products/dashboard-stats'),
        fetch('/api/inventory/products/out-of-stock')
      ])

      // Process Sales Data
      let salesOrders: any[] = []
      if (salesOrdersRes.ok) {
        const result = await salesOrdersRes.json()
        salesOrders = result.data || []
      }

      // Process Purchasing Data
      let purchaseOrders: any[] = []
      if (purchaseOrdersRes.ok) {
        const result = await purchaseOrdersRes.json()
        purchaseOrders = result.orders || result.data || []
      }

      // Process Suppliers Data
      let suppliers: any[] = []
      if (suppliersRes.ok) {
        const result = await suppliersRes.json()
        suppliers = result.suppliers || result.data || []
      }

      // Process Inventory Stats
      let inventoryStats: any = null
      if (inventoryStatsRes.ok) {
        inventoryStats = await inventoryStatsRes.json()
      }

      // Process Out of Stock
      let outOfStock: any[] = []
      if (outOfStockRes.ok) {
        outOfStock = await outOfStockRes.json()
      }

      // Calculate Sales Metrics
      const today = new Date()
      const thirtyDaysAgo = new Date(today)
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const sixtyDaysAgo = new Date(today)
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      // Sales: Current period
      const currentSalesOrders = salesOrders.filter((order: any) => {
        const orderDate = new Date(order.orderDate)
        return orderDate >= thirtyDaysAgo && orderDate <= today
      })
      const currentSalesRevenue = currentSalesOrders.reduce((sum: number, order: any) => sum + (order.totalAmount || 0), 0)

      // Sales: Previous period
      const previousSalesOrders = salesOrders.filter((order: any) => {
        const orderDate = new Date(order.orderDate)
        return orderDate >= sixtyDaysAgo && orderDate < thirtyDaysAgo
      })
      const previousSalesRevenue = previousSalesOrders.reduce((sum: number, order: any) => sum + (order.totalAmount || 0), 0)

      const salesRevenueGrowth = previousSalesRevenue > 0
        ? ((currentSalesRevenue - previousSalesRevenue) / previousSalesRevenue) * 100
        : currentSalesRevenue > 0 ? 100 : 0

      const salesOrdersGrowth = previousSalesOrders.length > 0
        ? ((currentSalesOrders.length - previousSalesOrders.length) / previousSalesOrders.length) * 100
        : currentSalesOrders.length > 0 ? 100 : 0

      // Calculate top products from sales
      const productStats: { [key: string]: { name: string, revenue: number, quantity: number } } = {}
      salesOrders.forEach((order: any) => {
        if (order.items && Array.isArray(order.items)) {
          order.items.forEach((item: any) => {
            const productId = item.product?.id || item.productId
            const productName = item.product?.name || 'Unknown Product'
            const revenue = parseFloat(item.totalAmount) || (parseFloat(item.quantity) * parseFloat(item.unitPrice)) || 0
            const quantity = parseInt(item.quantity) || 0

            if (productId && !productStats[productId]) {
              productStats[productId] = { name: productName, revenue: 0, quantity: 0 }
            }
            if (productId) {
              productStats[productId].revenue += revenue
              productStats[productId].quantity += quantity
            }
          })
        }
      })

      const topProducts = Object.entries(productStats)
        .map(([id, stats]) => ({
          productId: id,
          productName: stats.name,
          totalRevenue: stats.revenue,
          quantitySold: stats.quantity
        }))
        .sort((a, b) => b.totalRevenue - a.totalRevenue)
        .slice(0, 5)

      // Generate sales period data for chart
      const salesPeriodData: any[] = []
      for (let i = 29; i >= 0; i--) {
        const date = new Date(today)
        date.setDate(date.getDate() - i)
        date.setHours(0, 0, 0, 0)
        const nextDate = new Date(date)
        nextDate.setDate(nextDate.getDate() + 1)

        const dayOrders = salesOrders.filter((order: any) => {
          const orderDate = new Date(order.orderDate)
          return orderDate >= date && orderDate < nextDate
        })
        const revenue = dayOrders.reduce((sum: number, order: any) => sum + (order.totalAmount || 0), 0)

        salesPeriodData.push({
          period: date.toISOString(),
          revenue,
          orders: dayOrders.length
        })
      }

      // Purchasing metrics
      const currentPurchaseOrders = purchaseOrders.filter((order: any) => {
        const orderDate = new Date(order.orderDate)
        return orderDate >= thirtyDaysAgo && orderDate <= today
      })
      const currentPurchaseSpent = currentPurchaseOrders.reduce((sum: number, order: any) => sum + (parseFloat(order.totalAmount) || 0), 0)

      const previousPurchaseOrders = purchaseOrders.filter((order: any) => {
        const orderDate = new Date(order.orderDate)
        return orderDate >= sixtyDaysAgo && orderDate < thirtyDaysAgo
      })
      const previousPurchaseSpent = previousPurchaseOrders.reduce((sum: number, order: any) => sum + (parseFloat(order.totalAmount) || 0), 0)

      const purchaseSpentGrowth = previousPurchaseSpent > 0
        ? ((currentPurchaseSpent - previousPurchaseSpent) / previousPurchaseSpent) * 100
        : currentPurchaseSpent > 0 ? 100 : 0

      // Calculate top suppliers
      const supplierStats: { [key: string]: { name: string, totalSpent: number, orderCount: number } } = {}
      purchaseOrders.forEach((order: any) => {
        const supplierId = order.supplier?.id
        const supplierName = order.supplier?.companyName || 'Unknown Supplier'
        const amount = parseFloat(order.totalAmount) || 0

        if (supplierId) {
          if (!supplierStats[supplierId]) {
            supplierStats[supplierId] = { name: supplierName, totalSpent: 0, orderCount: 0 }
          }
          supplierStats[supplierId].totalSpent += amount
          supplierStats[supplierId].orderCount += 1
        }
      })

      const topSuppliers = Object.entries(supplierStats)
        .map(([id, stats]) => ({
          supplierId: id,
          supplierName: stats.name,
          totalSpent: stats.totalSpent,
          orderCount: stats.orderCount
        }))
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, 5)

      // Generate purchasing period data for chart
      const purchasePeriodData: any[] = []
      for (let i = 29; i >= 0; i--) {
        const date = new Date(today)
        date.setDate(date.getDate() - i)
        date.setHours(0, 0, 0, 0)
        const nextDate = new Date(date)
        nextDate.setDate(nextDate.getDate() + 1)

        const dayOrders = purchaseOrders.filter((order: any) => {
          const orderDate = new Date(order.orderDate)
          return orderDate >= date && orderDate < nextDate
        })
        const spent = dayOrders.reduce((sum: number, order: any) => sum + (parseFloat(order.totalAmount) || 0), 0)

        purchasePeriodData.push({
          period: date.toISOString(),
          spent,
          orders: dayOrders.length
        })
      }

      // Active suppliers count
      const activeSuppliers = suppliers.filter((s: any) => !s.deletedAt).length

      // Unique customers
      const uniqueCustomers = new Set(salesOrders.map((o: any) => o.customer?.id).filter(Boolean)).size

      setDashboardData({
        sales: {
          totalRevenue: salesOrders.reduce((sum: number, o: any) => sum + (o.totalAmount || 0), 0),
          totalOrders: salesOrders.length,
          uniqueCustomers,
          revenueGrowth: salesRevenueGrowth,
          ordersGrowth: salesOrdersGrowth,
          recentOrders: salesOrders.slice(0, 5),
          topProducts,
          periodData: salesPeriodData
        },
        purchasing: {
          totalSpent: purchaseOrders.reduce((sum: number, o: any) => sum + (parseFloat(o.totalAmount) || 0), 0),
          totalOrders: purchaseOrders.length,
          activeSuppliers,
          spentGrowth: purchaseSpentGrowth,
          recentOrders: purchaseOrders.slice(0, 5),
          topSuppliers,
          periodData: purchasePeriodData
        },
        inventory: {
          totalProducts: inventoryStats?.totalProducts || 0,
          totalCategories: inventoryStats?.totalCategories || 0,
          inventoryValue: inventoryStats?.inventoryValue || 0,
          outOfStockCount: inventoryStats?.outOfStockCount || outOfStock.length,
          lowStockItems: outOfStock.slice(0, 5),
          stockHealthMetrics: inventoryStats?.stockHealthMetrics || {
            inStockPercentage: 100,
            outOfStockPercentage: 0
          }
        }
      })
    } catch (err) {
      console.error('Error fetching dashboard data:', err)
      setError('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  // Chart configurations
  const salesVsPurchasingData = {
    labels: dashboardData?.sales.periodData?.map((item: any) => {
      const date = new Date(item.period)
      return format(date, 'MMM dd')
    }) || [],
    datasets: [
      {
        label: 'Sales',
        data: dashboardData?.sales.periodData?.map((item: any) => item.revenue) || [],
        borderColor: theme.palette.success.main,
        backgroundColor: `${theme.palette.success.main}20`,
        tension: 0.4,
        fill: true
      },
      {
        label: 'Purchases',
        data: dashboardData?.purchasing.periodData?.map((item: any) => item.spent) || [],
        borderColor: theme.palette.warning.main,
        backgroundColor: `${theme.palette.warning.main}20`,
        tension: 0.4,
        fill: true
      }
    ]
  }

  const stockHealthData = {
    labels: ['In Stock', 'Out of Stock'],
    datasets: [
      {
        data: [
          dashboardData?.inventory.stockHealthMetrics.inStockPercentage || 100,
          dashboardData?.inventory.stockHealthMetrics.outOfStockPercentage || 0
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

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
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
            const label = context.label || ''
            const value = context.parsed || 0
            return `${label}: ${value.toFixed(1)}%`
          }
        }
      }
    }
  }

  // Stats for cards
  const stats = [
    {
      title: 'Total Sales',
      value: formatCurrency(dashboardData?.sales.totalRevenue || 0),
      change: dashboardData?.sales.revenueGrowth !== undefined
        ? `${dashboardData.sales.revenueGrowth > 0 ? '+' : ''}${dashboardData.sales.revenueGrowth.toFixed(1)}%`
        : '+0.0%',
      trend: (dashboardData?.sales.revenueGrowth || 0) >= 0 ? 'up' : 'down',
      icon: SalesIcon,
      color: 'success',
      onClick: () => navigate('/sales')
    },
    {
      title: 'Total Purchases',
      value: formatCurrency(dashboardData?.purchasing.totalSpent || 0),
      change: dashboardData?.purchasing.spentGrowth !== undefined
        ? `${dashboardData.purchasing.spentGrowth > 0 ? '+' : ''}${dashboardData.purchasing.spentGrowth.toFixed(1)}%`
        : '+0.0%',
      trend: (dashboardData?.purchasing.spentGrowth || 0) >= 0 ? 'up' : 'down',
      icon: PurchasingIcon,
      color: 'warning',
      onClick: () => navigate('/purchasing')
    },
    {
      title: 'Inventory Value',
      value: formatCurrency(dashboardData?.inventory.inventoryValue || 0),
      change: `${dashboardData?.inventory.totalProducts || 0} products`,
      trend: 'up',
      icon: InventoryIcon,
      color: 'primary',
      onClick: () => navigate('/inventory')
    },
    {
      title: 'Customers',
      value: dashboardData?.sales.uniqueCustomers || '0',
      change: `${dashboardData?.purchasing.activeSuppliers || 0} suppliers`,
      trend: 'up',
      icon: CustomersIcon,
      color: 'info',
      onClick: () => navigate('/sales/customers')
    }
  ]

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
            <DashboardIcon sx={{
              fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize,
              color: TYPOGRAPHY_STYLES.pageHeader.icon.color
            }} />
            Dashboard
          </Typography>
          <Typography variant={TYPOGRAPHY_STYLES.pageSubtitle.variant} color={TYPOGRAPHY_STYLES.pageSubtitle.color}>
            Monitor your business performance across sales, purchasing, and inventory
          </Typography>
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
            <Card
              sx={{
                cursor: 'pointer',
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                  transform: 'translateY(-4px)',
                  boxShadow: 6,
                }
              }}
              onClick={stat.onClick}
            >
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

      {/* Charts Row */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Sales vs Purchases Trend */}
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 3, height: 400 }}>
            <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, mb: 3 }}>
              Sales vs Purchases (Last 30 Days)
            </Typography>
            <Box sx={{ height: 300 }}>
              <Line data={salesVsPurchasingData} options={chartOptions} />
            </Box>
          </Paper>
        </Grid>

        {/* Stock Health */}
        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 3, height: 400 }}>
            <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, mb: 3 }}>
              Stock Health
            </Typography>
            <Box sx={{ height: 250 }}>
              <Doughnut data={stockHealthData} options={doughnutOptions} />
            </Box>
            <Box sx={{ mt: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                {dashboardData?.inventory.totalProducts || 0} products • {dashboardData?.inventory.totalCategories || 0} categories
              </Typography>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Tables Row */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {/* Recent Sales Orders */}
        <Grid item xs={12} lg={6}>
          <Paper sx={{ overflow: 'hidden' }}>
            <Box sx={{ p: 3, borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight }}>
                Recent Sales Orders
              </Typography>
              <Chip
                label={`${dashboardData?.sales.totalOrders || 0} total`}
                color="success"
                size="small"
              />
            </Box>
            <TableContainer>
              <Table size={TABLE_STYLES.size}>
                <TableHead>
                  <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, backgroundColor: TABLE_STYLES.header.backgroundColor, py: TABLE_STYLES.header.padding.py } }}>
                    <TableCell>
                      <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize }}>
                        Order
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize }}>
                        Customer
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize }}>
                        Amount
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize }}>
                        Status
                      </Typography>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {dashboardData?.sales.recentOrders && dashboardData.sales.recentOrders.length > 0 ? (
                    dashboardData.sales.recentOrders.map((order: any) => (
                      <TableRow
                        key={order.id}
                        hover
                        sx={{
                          cursor: 'pointer',
                          '& .MuiTableCell-root': {
                            borderBottom: TABLE_STYLES.cell.border,
                            py: TABLE_STYLES.cell.padding.py,
                            px: TABLE_STYLES.cell.padding.px
                          },
                          height: TABLE_STYLES.row.height
                        }}
                        onClick={() => navigate('/sales/orders', { state: { highlightOrderId: order.id } })}
                      >
                        <TableCell>
                          <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                            {order.orderNumber}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Avatar sx={{ width: 24, height: 24, fontSize: '0.75rem' }}>
                              {order.customer?.name?.charAt(0) || 'U'}
                            </Avatar>
                            <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                              {order.customer?.name || 'Unknown'}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} color="success.main" sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                            {formatCurrency(order.totalAmount)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={order.isFulfilled ? 'Fulfilled' : 'Pending'}
                            color={order.isFulfilled ? 'success' : 'warning'}
                            size="small"
                            variant="outlined"
                            sx={{
                              fontSize: TYPOGRAPHY_STYLES.chip.small.fontSize,
                              fontWeight: TYPOGRAPHY_STYLES.chip.small.fontWeight,
                              height: TYPOGRAPHY_STYLES.chip.small.height
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} align="center">
                        <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} color="text.secondary">
                          No recent orders
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        {/* Recent Purchase Orders */}
        <Grid item xs={12} lg={6}>
          <Paper sx={{ overflow: 'hidden' }}>
            <Box sx={{ p: 3, borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight }}>
                Recent Purchase Orders
              </Typography>
              <Chip
                label={`${dashboardData?.purchasing.totalOrders || 0} total`}
                color="warning"
                size="small"
              />
            </Box>
            <TableContainer>
              <Table size={TABLE_STYLES.size}>
                <TableHead>
                  <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, backgroundColor: TABLE_STYLES.header.backgroundColor, py: TABLE_STYLES.header.padding.py } }}>
                    <TableCell>
                      <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize }}>
                        PO Number
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize }}>
                        Supplier
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize }}>
                        Amount
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize }}>
                        Status
                      </Typography>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {dashboardData?.purchasing.recentOrders && dashboardData.purchasing.recentOrders.length > 0 ? (
                    dashboardData.purchasing.recentOrders.map((order: any) => (
                      <TableRow
                        key={order.id}
                        hover
                        sx={{
                          cursor: 'pointer',
                          '& .MuiTableCell-root': {
                            borderBottom: TABLE_STYLES.cell.border,
                            py: TABLE_STYLES.cell.padding.py,
                            px: TABLE_STYLES.cell.padding.px
                          },
                          height: TABLE_STYLES.row.height
                        }}
                        onClick={() => navigate(`/purchasing/orders?poId=${order.id}`)}
                      >
                        <TableCell>
                          <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                            {order.orderNumber}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                            {order.supplier?.companyName || 'Unknown'}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} color="warning.main" sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                            {formatCurrency(order.totalAmount)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={order.isFullyReceived ? 'Received' : 'Pending'}
                            color={order.isFullyReceived ? 'success' : 'warning'}
                            size="small"
                            variant="outlined"
                            sx={{
                              fontSize: TYPOGRAPHY_STYLES.chip.small.fontSize,
                              fontWeight: TYPOGRAPHY_STYLES.chip.small.fontWeight,
                              height: TYPOGRAPHY_STYLES.chip.small.height
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} align="center">
                        <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} color="text.secondary">
                          No recent purchase orders
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>

      {/* Bottom Row - Top Products, Top Suppliers, Low Stock */}
      <Grid container spacing={3}>
        {/* Top Products */}
        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, mb: 3 }}>
              Top Selling Products
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {dashboardData?.sales.topProducts && dashboardData.sales.topProducts.length > 0 ? (
                dashboardData.sales.topProducts.map((product: any, index: number) => (
                  <Box key={product.productId || index}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography
                          variant="h6"
                          sx={{
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            bgcolor: index === 0 ? 'success.main' : index === 1 ? 'primary.main' : 'grey.400',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize,
                            fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight
                          }}
                        >
                          {index + 1}
                        </Typography>
                        <Box>
                          <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                            {product.productName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {product.quantitySold || 0} sold
                          </Typography>
                        </Box>
                      </Box>
                      <Typography variant="body2" color="success.main">
                        {formatCurrency(product.totalRevenue || 0)}
                      </Typography>
                    </Box>
                  </Box>
                ))
              ) : (
                <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} color="text.secondary" align="center">
                  No sales data available
                </Typography>
              )}
            </Box>
          </Paper>
        </Grid>

        {/* Top Suppliers */}
        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, mb: 3 }}>
              Top Suppliers
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {dashboardData?.purchasing.topSuppliers && dashboardData.purchasing.topSuppliers.length > 0 ? (
                dashboardData.purchasing.topSuppliers.map((supplier: any, index: number) => (
                  <Box key={supplier.supplierId || index}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography
                          variant="h6"
                          sx={{
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            bgcolor: index === 0 ? 'warning.main' : index === 1 ? 'secondary.main' : 'grey.400',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize,
                            fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight
                          }}
                        >
                          {index + 1}
                        </Typography>
                        <Box>
                          <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                            {supplier.supplierName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {supplier.orderCount || 0} orders
                          </Typography>
                        </Box>
                      </Box>
                      <Typography variant="body2" color="warning.main">
                        {formatCurrency(supplier.totalSpent || 0)}
                      </Typography>
                    </Box>
                  </Box>
                ))
              ) : (
                <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} color="text.secondary" align="center">
                  No supplier data available
                </Typography>
              )}
            </Box>
          </Paper>
        </Grid>

        {/* Low Stock Alerts */}
        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight }}>
                Stock Alerts
              </Typography>
              {(dashboardData?.inventory.outOfStockCount || 0) > 0 && (
                <Chip
                  icon={<WarningIcon sx={{ fontSize: 14 }} />}
                  label={`${dashboardData?.inventory.outOfStockCount} items`}
                  color="error"
                  size="small"
                />
              )}
            </Box>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {dashboardData?.inventory.lowStockItems && dashboardData.inventory.lowStockItems.length > 0 ? (
                dashboardData.inventory.lowStockItems.map((item: any, index: number) => (
                  <Box
                    key={item.id || index}
                    sx={{
                      p: 1.5,
                      borderRadius: 1,
                      bgcolor: 'error.light',
                      border: '1px solid',
                      borderColor: 'error.main',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                        {item.name || 'Unknown Product'}
                      </Typography>
                      <Chip
                        label="Out of Stock"
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
                ))
              ) : (
                <Box sx={{ textAlign: 'center', py: 3 }}>
                  <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} color="success.main">
                    All products are in stock
                  </Typography>
                </Box>
              )}
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  )
}

export default DashboardPage
