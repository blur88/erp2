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
  Avatar,
  useTheme
} from '@mui/material'
import {
  PointOfSale as SalesIcon,
  People as CustomersIcon,
  Receipt as OrdersIcon,
  Payment as PaymentsIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Inventory2 as InventoryIcon,
  Assessment as ReportsIcon,
  Add as AddIcon
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
import { Line, Bar, Doughnut } from 'react-chartjs-2'
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

const SalesPage: React.FC = () => {
  const theme = useTheme()
  const navigate = useNavigate()
  const [salesData, setSalesData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSalesData()
  }, [])

  const fetchSalesData = async () => {
    try {
      setLoading(true)

      // Fetch recent orders (get more for trend calculation)
      const ordersResponse = await fetch('/api/sales-orders?limit=100&sortBy=orderDate&sortOrder=desc')
      let ordersData = []
      let allOrders = []
      if (ordersResponse.ok) {
        const ordersResult = await ordersResponse.json()
        allOrders = ordersResult.data || []
        ordersData = allOrders.slice(0, 5) // Keep only 5 for display
      }

      // Calculate top products from order items
      const productStats: { [key: string]: { name: string, revenue: number, quantity: number } } = {}

      allOrders.forEach((order: any) => {
        if (order.items && Array.isArray(order.items)) {
          order.items.forEach((item: any) => {
            const productId = item.product?.id || item.productId
            const productName = item.product?.name || item.productName || 'Unknown Product'
            const revenue = parseFloat(item.totalAmount) || (parseFloat(item.quantity) * parseFloat(item.unitPrice)) || 0
            const quantity = parseInt(item.quantity) || 0

            if (!productStats[productId]) {
              productStats[productId] = { name: productName, revenue: 0, quantity: 0 }
            }
            productStats[productId].revenue += revenue
            productStats[productId].quantity += quantity
          })
        }
      })

      // Convert to array and sort by revenue
      const topProductsData = Object.entries(productStats)
        .map(([id, stats]) => ({
          productId: id,
          productName: stats.name,
          totalRevenue: stats.revenue,
          quantitySold: stats.quantity
        }))
        .sort((a, b) => b.totalRevenue - a.totalRevenue)
        .slice(0, 5)

      // Calculate top customers from orders
      const customerStats: { [key: string]: { name: string, revenue: number, orders: number } } = {}

      allOrders.forEach((order: any) => {
        const customerId = order.customer?.id
        const customerName = order.customer?.name || 'Unknown Customer'
        const revenue = order.totalAmount || 0

        if (customerId) {
          if (!customerStats[customerId]) {
            customerStats[customerId] = { name: customerName, revenue: 0, orders: 0 }
          }
          customerStats[customerId].revenue += revenue
          customerStats[customerId].orders += 1
        }
      })

      // Convert to array and sort by revenue
      const topCustomersData = Object.entries(customerStats)
        .map(([id, stats]) => ({
          customerId: id,
          customerName: stats.name,
          totalRevenue: stats.revenue,
          totalOrders: stats.orders
        }))
        .sort((a, b) => b.totalRevenue - a.totalRevenue)
        .slice(0, 5)

      // Calculate basic metrics from all orders
      const totalRevenue = allOrders.reduce((sum: number, order: any) => sum + (order.totalAmount || 0), 0)
      const totalOrders = allOrders.length
      const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0
      const uniqueCustomers = new Set(allOrders.map((o: any) => o.customer?.id)).size

      // Generate period data for chart (group by day for last 30 days)
      const periodData: any[] = []
      const today = new Date()
      const daysToShow = 30

      for (let i = daysToShow - 1; i >= 0; i--) {
        const date = new Date(today)
        date.setDate(date.getDate() - i)
        date.setHours(0, 0, 0, 0)

        const nextDate = new Date(date)
        nextDate.setDate(nextDate.getDate() + 1)

        const dayOrders = allOrders.filter((order: any) => {
          const orderDate = new Date(order.orderDate)
          return orderDate >= date && orderDate < nextDate
        })

        const revenue = dayOrders.reduce((sum: number, order: any) => sum + (order.totalAmount || 0), 0)

        periodData.push({
          period: date.toISOString(),
          revenue,
          orders: dayOrders.length
        })
      }

      // Calculate growth percentages (compare current 30 days vs previous 30 days)
      const thirtyDaysAgo = new Date(today)
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const sixtyDaysAgo = new Date(today)
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      // Current period (last 30 days)
      const currentPeriodOrders = allOrders.filter((order: any) => {
        const orderDate = new Date(order.orderDate)
        return orderDate >= thirtyDaysAgo && orderDate <= today
      })
      const currentRevenue = currentPeriodOrders.reduce((sum: number, order: any) => sum + (order.totalAmount || 0), 0)
      const currentOrderCount = currentPeriodOrders.length

      // Previous period (31-60 days ago)
      const previousPeriodOrders = allOrders.filter((order: any) => {
        const orderDate = new Date(order.orderDate)
        return orderDate >= sixtyDaysAgo && orderDate < thirtyDaysAgo
      })
      const previousRevenue = previousPeriodOrders.reduce((sum: number, order: any) => sum + (order.totalAmount || 0), 0)
      const previousOrderCount = previousPeriodOrders.length

      // Calculate percentage changes
      const revenueGrowth = previousRevenue > 0
        ? ((currentRevenue - previousRevenue) / previousRevenue) * 100
        : currentRevenue > 0 ? 100 : 0

      const ordersGrowth = previousOrderCount > 0
        ? ((currentOrderCount - previousOrderCount) / previousOrderCount) * 100
        : currentOrderCount > 0 ? 100 : 0

      // Calculate customer growth
      const currentCustomers = new Set(currentPeriodOrders.map((o: any) => o.customer?.id)).size
      const previousCustomers = new Set(previousPeriodOrders.map((o: any) => o.customer?.id)).size
      const customerGrowth = previousCustomers > 0
        ? ((currentCustomers - previousCustomers) / previousCustomers) * 100
        : currentCustomers > 0 ? 100 : 0

      // Calculate avg order value growth
      const currentAvgOrder = currentOrderCount > 0 ? currentRevenue / currentOrderCount : 0
      const previousAvgOrder = previousOrderCount > 0 ? previousRevenue / previousOrderCount : 0
      const avgOrderGrowth = previousAvgOrder > 0
        ? ((currentAvgOrder - previousAvgOrder) / previousAvgOrder) * 100
        : currentAvgOrder > 0 ? 100 : 0

      // Combine the data
      setSalesData({
        metrics: {
          totalRevenue,
          totalOrders,
          averageOrderValue: avgOrderValue,
          uniqueCustomers,
          revenueGrowth,
          ordersGrowth,
          customerGrowth,
          avgOrderGrowth
        },
        recentOrders: ordersData,
        topCustomers: topCustomersData,
        topProducts: topProductsData,
        periodData
      })
    } catch (error) {
      console.error('Error fetching sales data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Chart data
  const salesTrendData = {
    labels: salesData?.periodData?.map((item: any) => {
      const date = new Date(item.period)
      return format(date, 'MMM dd')
    }) || ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    datasets: [
      {
        label: 'Sales',
        data: salesData?.periodData?.map((item: any) => item.revenue) || [45000, 52000, 48000, 61000, 58000, 67000],
        borderColor: theme.palette.primary.main,
        backgroundColor: `${theme.palette.primary.main}20`,
        tension: 0.4
      }
    ]
  }

  const topProductsData = {
    labels: salesData?.topProducts?.map((item: any) => item.productName) || ['Laptop', 'Monitor', 'Keyboard', 'Mouse', 'Headphones'],
    datasets: [
      {
        data: salesData?.topProducts?.map((item: any) => item.totalRevenue) || [35, 25, 20, 12, 8],
        backgroundColor: [
          theme.palette.primary.main,
          theme.palette.secondary.main,
          theme.palette.success.main,
          theme.palette.warning.main,
          theme.palette.info.main
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
      }
    }
  }

  const stats = [
    {
      title: 'Total Sales',
      value: formatCurrency(salesData?.metrics?.totalRevenue || 0),
      change: salesData?.metrics?.revenueGrowth !== undefined ? `${salesData.metrics.revenueGrowth > 0 ? '+' : ''}${salesData.metrics.revenueGrowth.toFixed(1)}%` : '+0.0%',
      trend: (salesData?.metrics?.revenueGrowth || 0) >= 0 ? 'up' : 'down',
      icon: SalesIcon,
      color: 'primary'
    },
    {
      title: 'Orders',
      value: salesData?.metrics?.totalOrders || '0',
      change: salesData?.metrics?.ordersGrowth !== undefined ? `${salesData.metrics.ordersGrowth > 0 ? '+' : ''}${salesData.metrics.ordersGrowth.toFixed(1)}%` : '+0.0%',
      trend: (salesData?.metrics?.ordersGrowth || 0) >= 0 ? 'up' : 'down',
      icon: OrdersIcon,
      color: 'info'
    },
    {
      title: 'Customers',
      value: salesData?.metrics?.uniqueCustomers || '0',
      change: salesData?.metrics?.customerGrowth !== undefined ? `${salesData.metrics.customerGrowth > 0 ? '+' : ''}${salesData.metrics.customerGrowth.toFixed(1)}%` : '+0.0%',
      trend: (salesData?.metrics?.customerGrowth || 0) >= 0 ? 'up' : 'down',
      icon: CustomersIcon,
      color: 'secondary'
    },
    {
      title: 'Avg Order Value',
      value: formatCurrency(salesData?.metrics?.averageOrderValue || 0),
      change: salesData?.metrics?.avgOrderGrowth !== undefined ? `${salesData.metrics.avgOrderGrowth > 0 ? '+' : ''}${salesData.metrics.avgOrderGrowth.toFixed(1)}%` : '+0.0%',
      trend: (salesData?.metrics?.avgOrderGrowth || 0) >= 0 ? 'up' : 'down',
      icon: PaymentsIcon,
      color: 'success'
    }
  ]

  const recentOrders = salesData?.recentOrders || []
  const topCustomers = salesData?.topCustomers || []

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
            <SalesIcon sx={{
              fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize,
              color: TYPOGRAPHY_STYLES.pageHeader.icon.color
            }} />
            Sales Overview
          </Typography>
          <Typography variant={TYPOGRAPHY_STYLES.pageSubtitle.variant} color={TYPOGRAPHY_STYLES.pageSubtitle.color}>
            Monitor sales performance and manage customer relationships
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate('/sales/orders')}
          >
            Create Order
          </Button>
        </Box>
      </Box>

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
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 3, height: 400 }}>
            <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, mb: 3 }}>
              Sales Trend
            </Typography>
            <Box sx={{ height: 300 }}>
              <Line data={salesTrendData} options={chartOptions} />
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 3 }}>
            <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, mb: 3 }}>
              Top Products
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {salesData?.topProducts && salesData.topProducts.length > 0 ? salesData.topProducts.map((product: any, index: number) => (
                <Box key={product.productId || index}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography
                        variant="h6"
                        sx={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          bgcolor: index === 0 ? 'primary.main' : index === 1 ? 'secondary.main' : 'grey.400',
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
                    <Typography variant="body2" color="primary">
                      {formatCurrency(product.totalRevenue || 0)}
                    </Typography>
                  </Box>
                </Box>
              )) : (
                <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} color="text.secondary" align="center">
                  No product data available
                </Typography>
              )}
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Recent Orders and Top Customers */}
      <Grid container spacing={3}>
        <Grid item xs={12} lg={8}>
          <Paper sx={{ overflow: 'hidden' }}>
            <Box sx={{ p: 3, borderBottom: 1, borderColor: 'divider' }}>
              <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight }}>
                Recent Orders
              </Typography>
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
                        Order ID
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                        fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                        color: TYPOGRAPHY_STYLES.tableHeader.color,
                        fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                      }}>
                        Customer
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                        fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                        color: TYPOGRAPHY_STYLES.tableHeader.color,
                        fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                      }}>
                        Date
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                        fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                        color: TYPOGRAPHY_STYLES.tableHeader.color,
                        fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                      }}>
                        Amount
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                        fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                        color: TYPOGRAPHY_STYLES.tableHeader.color,
                        fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                      }}>
                        Status
                      </Typography>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {recentOrders.length > 0 ? recentOrders.map((order: any) => (
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
                          <Avatar sx={{ width: 32, height: 32 }}>
                            {order.customer?.name?.charAt(0) || 'U'}
                          </Avatar>
                          <Box>
                            <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>{order.customer?.name || 'Unknown'}</Typography>
                            <Typography variant={TYPOGRAPHY_STYLES.tableCell.caption.variant} color="text.secondary" sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize }}>
                              {order.items?.length || 0} item{order.items?.length !== 1 ? 's' : ''}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.secondary.fontSize }}>
                          {format(new Date(order.orderDate), 'MMM dd, yyyy')}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} color="primary" sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
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
                  )) : (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
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

        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 3 }}>
            <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, mb: 3 }}>
              Top Customers
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {topCustomers.length > 0 ? topCustomers.slice(0, 5).map((customer: any, index: number) => (
                <Box key={customer.id || index}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography
                        variant="h6"
                        sx={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          bgcolor: index === 0 ? 'primary.main' : index === 1 ? 'secondary.main' : 'grey.400',
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
                          {customer.customerName || customer.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {customer.totalOrders || customer.orderCount || customer.orders || 0} orders
                        </Typography>
                      </Box>
                    </Box>
                    <Typography variant="body2" color="primary">
                      {formatCurrency(customer.totalRevenue || customer.amount || 0)}
                    </Typography>
                  </Box>
                </Box>
              )) : (
                <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} color="text.secondary" align="center">
                  No customer data available
                </Typography>
              )}
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  )
}

export default SalesPage
