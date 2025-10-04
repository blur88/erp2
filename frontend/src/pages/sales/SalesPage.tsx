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
  Assessment as ReportsIcon
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
      const response = await fetch('/api/sales/analytics')
      if (response.ok) {
        const data = await response.json()
        setSalesData(data.data || data)
      }
    } catch (error) {
      console.error('Error fetching sales data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Chart data
  const salesTrendData = {
    labels: salesData?.monthlySales?.map((item: any) => item.month) || ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    datasets: [
      {
        label: 'Sales',
        data: salesData?.monthlySales?.map((item: any) => item.total) || [45000, 52000, 48000, 61000, 58000, 67000],
        borderColor: theme.palette.primary.main,
        backgroundColor: `${theme.palette.primary.main}20`,
        tension: 0.4
      }
    ]
  }

  const topProductsData = {
    labels: salesData?.topProducts?.map((item: any) => item.name) || ['Laptop', 'Monitor', 'Keyboard', 'Mouse', 'Headphones'],
    datasets: [
      {
        data: salesData?.topProducts?.map((item: any) => item.revenue) || [35, 25, 20, 12, 8],
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
      value: formatCurrency(salesData?.totalSales || 125430),
      change: salesData?.salesGrowth || '+12.5%',
      trend: 'up',
      icon: SalesIcon,
      color: 'primary'
    },
    {
      title: 'Orders',
      value: salesData?.totalOrders || '1,234',
      change: salesData?.ordersGrowth || '+8.2%',
      trend: 'up',
      icon: OrdersIcon,
      color: 'info'
    },
    {
      title: 'Customers',
      value: salesData?.totalCustomers || '567',
      change: salesData?.customersGrowth || '+5.1%',
      trend: 'up',
      icon: CustomersIcon,
      color: 'secondary'
    },
    {
      title: 'Payments',
      value: formatCurrency(salesData?.totalPayments || 98450),
      change: salesData?.paymentsGrowth || '-2.3%',
      trend: 'down',
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
            variant="outlined"
            startIcon={<ReportsIcon />}
            onClick={() => navigate('/sales/orders')}
          >
            View Orders
          </Button>
          <Button
            variant="outlined"
            startIcon={<InventoryIcon />}
            onClick={() => navigate('/inventory/products')}
          >
            Manage Inventory
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
          <Paper sx={{ p: 3, height: 400 }}>
            <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, mb: 3 }}>
              Top Products
            </Typography>
            <Box sx={{ height: 300 }}>
              <Doughnut data={topProductsData} options={doughnutOptions} />
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
                        <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize, fontFamily: 'monospace' }}>
                          {order.orderNumber}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Avatar sx={{ width: 32, height: 32 }}>
                            {order.customer?.name?.charAt(0) || 'U'}
                          </Avatar>
                          <Box>
                            <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>{order.customer?.name || 'Unknown'}</Typography>
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
                        <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} color="primary" sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
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
                        <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                          {customer.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {customer.orderCount || customer.orders || 0} orders
                        </Typography>
                      </Box>
                    </Box>
                    <Typography variant="subtitle2" color="primary">
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
