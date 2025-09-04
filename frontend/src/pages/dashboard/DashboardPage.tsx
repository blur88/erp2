import React from 'react'
import {
  Box,
  Grid,
  Paper,
  Typography,
  Card,
  CardContent,
  LinearProgress,
  Chip,
  IconButton,
  useTheme,
} from '@mui/material'
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Inventory as InventoryIcon,
  PointOfSale as SalesIcon,
  ShoppingCart as PurchasingIcon,
  People as CustomersIcon,
  Refresh as RefreshIcon,
  MoreVert as MoreIcon,
} from '@mui/icons-material'

import LoadingSpinner from '@/components/common/LoadingSpinner'
import { formatCurrency } from '@/utils/currency'

interface StatCardProps {
  title: string
  value: string | number
  change: number
  icon: React.ReactNode
  color: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info'
  loading?: boolean
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  change,
  icon,
  color,
  loading = false,
}) => {
  const theme = useTheme()
  const isPositive = change >= 0

  if (loading) {
    return (
      <Card sx={{ height: 140 }}>
        <CardContent sx={{ p: 3 }}>
          <LoadingSpinner size={24} />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card 
      sx={{ 
        height: 140,
        transition: 'all 0.2s ease-in-out',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: 4,
        },
      }}
    >
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box
            sx={{
              p: 1.5,
              borderRadius: 2,
              bgcolor: `${color}.light`,
              color: `${color}.contrastText`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {icon}
          </Box>
          <IconButton size="small">
            <MoreIcon />
          </IconButton>
        </Box>
        
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
          {value}
        </Typography>
        
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
            {title}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {isPositive ? (
              <TrendingUpIcon sx={{ fontSize: 16, color: 'success.main' }} />
            ) : (
              <TrendingDownIcon sx={{ fontSize: 16, color: 'error.main' }} />
            )}
            <Typography
              variant="caption"
              sx={{
                fontWeight: 600,
                color: isPositive ? 'success.main' : 'error.main',
              }}
            >
              {isPositive ? '+' : ''}{change}%
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  )
}

const QuickStatsCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <Paper sx={{ p: 3, height: '100%' }}>
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
      <Typography variant="h6" sx={{ fontWeight: 600 }}>
        {title}
      </Typography>
      <IconButton size="small">
        <RefreshIcon />
      </IconButton>
    </Box>
    {children}
  </Paper>
)

const DashboardPage: React.FC = () => {
  // Authentication removed - using placeholder user
  const user = { name: 'User' }
  const [loading, setLoading] = React.useState(true)

  // Simulate loading
  React.useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1000)
    return () => clearTimeout(timer)
  }, [])

  // Mock data - in real app, this would come from API
  const stats = [
    {
      title: 'Total Sales',
      value: formatCurrency(125430),
      change: 12.5,
      icon: <SalesIcon />,
      color: 'primary' as const,
    },
    {
      title: 'Total Orders',
      value: '1,234',
      change: 8.2,
      icon: <PurchasingIcon />,
      color: 'success' as const,
    },
    {
      title: 'Customers',
      value: '567',
      change: 5.1,
      icon: <CustomersIcon />,
      color: 'info' as const,
    },
    {
      title: 'Inventory Items',
      value: '2,845',
      change: -2.3,
      icon: <InventoryIcon />,
      color: 'warning' as const,
    },
  ]

  const recentActivity = [
    { id: 1, action: 'New order received', time: '2 minutes ago', status: 'success' },
    { id: 2, action: 'Low stock alert: Product XYZ', time: '15 minutes ago', status: 'warning' },
    { id: 3, action: 'Payment received from customer', time: '1 hour ago', status: 'success' },
    { id: 4, action: 'New customer registered', time: '2 hours ago', status: 'info' },
    { id: 5, action: 'Inventory updated', time: '3 hours ago', status: 'info' },
  ]

  const lowStockItems = [
    { id: 1, name: 'Product A', stock: 5, minStock: 10 },
    { id: 2, name: 'Product B', stock: 2, minStock: 15 },
    { id: 3, name: 'Product C', stock: 8, minStock: 20 },
  ]

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
          Welcome back, {user?.name}! 👋
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Here's what's happening with your business today.
        </Typography>
      </Box>

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {stats.map((stat, index) => (
          <Grid item xs={12} sm={6} lg={3} key={index}>
            <StatCard {...stat} loading={loading} />
          </Grid>
        ))}
      </Grid>

      {/* Main Content */}
      <Grid container spacing={3}>
        {/* Recent Activity */}
        <Grid item xs={12} lg={8}>
          <QuickStatsCard title="Recent Activity">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {recentActivity.map((activity) => (
                <Box
                  key={activity.id}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    p: 2,
                    borderRadius: 1,
                    bgcolor: 'background.default',
                  }}
                >
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {activity.action}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {activity.time}
                    </Typography>
                  </Box>
                  <Chip
                    size="small"
                    label={activity.status}
                    color={activity.status as any}
                    variant="outlined"
                  />
                </Box>
              ))}
            </Box>
          </QuickStatsCard>
        </Grid>

        {/* Low Stock Alerts */}
        <Grid item xs={12} lg={4}>
          <QuickStatsCard title="Low Stock Alerts">
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {lowStockItems.map((item) => (
                <Box
                  key={item.id}
                  sx={{
                    p: 2,
                    borderRadius: 1,
                    bgcolor: 'background.default',
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 500, mb: 1 }}>
                    {item.name}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Current: {item.stock} | Min: {item.minStock}
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={(item.stock / item.minStock) * 100}
                    color={item.stock < item.minStock ? 'error' : 'warning'}
                    sx={{ height: 6, borderRadius: 1 }}
                  />
                </Box>
              ))}
            </Box>
          </QuickStatsCard>
        </Grid>
      </Grid>
    </Box>
  )
}

export default DashboardPage