import React, { useState } from 'react'
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
  IconButton,
  Menu,
  MenuItem,
  LinearProgress,
  Avatar,
  useTheme
} from '@mui/material'
import { 
  Add as AddIcon, 
  PointOfSale as SalesIcon, 
  People as CustomersIcon, 
  Receipt as OrdersIcon,
  Payment as PaymentsIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  MoreVert as MoreIcon,
  Visibility as ViewIcon,
  Edit as EditIcon,
  LocalShipping as ShipIcon
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
import { formatCurrency } from '@/utils/currency'

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

// Mock data
const mockRecentOrders = [
  {
    id: 'SO-2024-001',
    customer: 'John Doe',
    amount: 1299.99,
    shippedDate: new Date('2024-01-15'),
    date: new Date('2024-01-15'),
    items: 3
  },
  {
    id: 'SO-2024-002', 
    customer: 'Jane Smith',
    amount: 449.50,
    date: new Date('2024-01-14'),
    items: 2
  },
  {
    id: 'SO-2024-003',
    customer: 'Bob Johnson', 
    amount: 99.99,
    date: new Date('2024-01-13'),
    items: 1
  },
  {
    id: 'SO-2024-004',
    customer: 'Alice Brown',
    amount: 759.00,
    shippedDate: new Date('2024-01-11'),
    deliveredDate: new Date('2024-01-12'),
    date: new Date('2024-01-12'),
    items: 4
  }
]

const mockTopCustomers = [
  { name: 'John Doe', orders: 15, amount: 12450.00 },
  { name: 'Jane Smith', orders: 12, amount: 9870.50 },
  { name: 'Bob Johnson', orders: 8, amount: 6540.25 },
  { name: 'Alice Brown', orders: 6, amount: 4320.00 },
  { name: 'Charlie Wilson', orders: 4, amount: 2890.75 }
]

const SalesPage: React.FC = () => {
  const theme = useTheme()
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null)

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>, orderId: string) => {
    setAnchorEl(event.currentTarget)
    setSelectedOrder(orderId)
  }

  const handleMenuClose = () => {
    setAnchorEl(null)
    setSelectedOrder(null)
  }

  const getOrderStatus = (order: any) => {
    if (order.deliveredDate) return { label: 'Delivered', color: 'success' }
    if (order.shippedDate) return { label: 'Shipped', color: 'warning' }
    return { label: 'Pending', color: 'info' }
  }

  // Chart data
  const salesTrendData = {
    labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    datasets: [
      {
        label: 'Sales',
        data: [45000, 52000, 48000, 61000, 58000, 67000],
        borderColor: theme.palette.primary.main,
        backgroundColor: `${theme.palette.primary.main}20`,
        tension: 0.4
      },
      {
        label: 'Target',
        data: [50000, 55000, 60000, 65000, 70000, 75000],
        borderColor: theme.palette.secondary.main,
        backgroundColor: `${theme.palette.secondary.main}20`,
        borderDash: [5, 5],
        tension: 0.4
      }
    ]
  }

  const topProductsData = {
    labels: ['Laptop', 'Monitor', 'Keyboard', 'Mouse', 'Headphones'],
    datasets: [
      {
        data: [35, 25, 20, 12, 8],
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
            return formatCurrency(value, { showSymbol: true })
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

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
            Sales Dashboard
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Monitor sales performance and manage customer relationships
          </Typography>
        </Box>
        <Button 
          variant="contained" 
          startIcon={<AddIcon />} 
          size="large"
        >
          New Sale
        </Button>
      </Box>
      
      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} lg={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: 'primary.light',
                    color: 'primary.contrastText',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <SalesIcon />
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <TrendingUpIcon sx={{ fontSize: 16, color: 'success.main' }} />
                  <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600 }}>
                    +12.5%
                  </Typography>
                </Box>
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
                {formatCurrency(125430)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Total Sales
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} lg={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: 'info.light',
                    color: 'info.contrastText',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <OrdersIcon />
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <TrendingUpIcon sx={{ fontSize: 16, color: 'success.main' }} />
                  <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600 }}>
                    +8.2%
                  </Typography>
                </Box>
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
                1,234
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Orders
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} lg={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: 'secondary.light',
                    color: 'secondary.contrastText',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CustomersIcon />
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <TrendingUpIcon sx={{ fontSize: 16, color: 'success.main' }} />
                  <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600 }}>
                    +5.1%
                  </Typography>
                </Box>
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
                567
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Customers
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} lg={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: 'success.light',
                    color: 'success.contrastText',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <PaymentsIcon />
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <TrendingDownIcon sx={{ fontSize: 16, color: 'error.main' }} />
                  <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 600 }}>
                    -2.3%
                  </Typography>
                </Box>
              </Box>
              <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
                {formatCurrency(98450)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Payments
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Charts and Analytics */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} lg={8}>
          <Paper sx={{ p: 3, height: 400 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 3 }}>
              Sales Trend
            </Typography>
            <Box sx={{ height: 300 }}>
              <Line data={salesTrendData} options={chartOptions} />
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 3, height: 400 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 3 }}>
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
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Recent Orders
              </Typography>
            </Box>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Order ID</TableCell>
                    <TableCell>Customer</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell align="right">Amount</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {mockRecentOrders.map((order) => (
                    <TableRow key={order.id} hover>
                      <TableCell>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
                          {order.id}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Avatar sx={{ width: 32, height: 32 }}>
                            {order.customer.charAt(0)}
                          </Avatar>
                          <Box>
                            <Typography variant="subtitle2">{order.customer}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {order.items} item{order.items > 1 ? 's' : ''}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {format(order.date, 'MMM dd, yyyy')}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="subtitle2" color="primary">
                          {formatCurrency(order.amount)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={getOrderStatus(order).label}
                          color={getOrderStatus(order).color as any}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          onClick={(e) => handleMenuOpen(e, order.id)}
                        >
                          <MoreIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        <Grid item xs={12} lg={4}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 3 }}>
              Top Customers
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {mockTopCustomers.map((customer, index) => (
                <Box key={customer.name}>
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
                          fontSize: '0.75rem',
                          fontWeight: 600
                        }}
                      >
                        {index + 1}
                      </Typography>
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                          {customer.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {customer.orders} orders
                        </Typography>
                      </Box>
                    </Box>
                    <Typography variant="subtitle2" color="primary">
                      {formatCurrency(customer.amount)}
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={(customer.amount / mockTopCustomers[0].amount) * 100}
                    sx={{ height: 4, borderRadius: 2 }}
                  />
                </Box>
              ))}
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
        <MenuItem onClick={handleMenuClose}>
          <ViewIcon sx={{ mr: 1 }} fontSize="small" />
          View Details
        </MenuItem>
        <MenuItem onClick={handleMenuClose}>
          <EditIcon sx={{ mr: 1 }} fontSize="small" />
          Edit Order
        </MenuItem>
        <MenuItem onClick={handleMenuClose}>
          <ShipIcon sx={{ mr: 1 }} fontSize="small" />
          Ship Order
        </MenuItem>
      </Menu>
    </Box>
  )
}

export default SalesPage