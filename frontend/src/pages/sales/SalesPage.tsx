import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Paper,
  Button,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Avatar,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Skeleton,
} from '@mui/material'
import {
  PointOfSale as SalesIcon,
  People as CustomersIcon,
  Receipt as OrdersIcon,
  Payment as PaymentsIcon,
  Add as AddIcon,
} from '@mui/icons-material'
import { subDays, subMonths, startOfMonth, endOfMonth, subYears, startOfYear, endOfYear } from 'date-fns'
import { formatCurrency, formatDate, formatNumber } from '@/utils/formatters'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'
import { useNavigate } from 'react-router-dom'
import api from '@/services/api'
import { SalesStatsCards, SalesTrendChart, TopProductsList, TopCustomersList } from './components'
import type { StatItem } from './components'

type PeriodType = 'week' | 'month' | 'quarter' | 'year'

interface SalesAnalytics {
  totalRevenue: number
  totalOrders: number
  averageOrderValue: number
  conversionRate?: number
  topProducts: Array<{
    productId: string
    productName: string
    revenue: number
    quantity: number
  }>
  revenueChart: {
    labels: string[]
    data: number[]
  }
  ordersByStatus?: Array<{
    status: string
    count: number
    percentage: number
  }>
}

const SalesPage: React.FC = () => {
  const navigate = useNavigate()
  const [analytics, setAnalytics] = useState<SalesAnalytics | null>(null)
  const [topCustomers, setTopCustomers] = useState<any[]>([])
  const [recentOrders, setRecentOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<PeriodType>('month')

  // Calculate growth by comparing current period to previous period
  const [previousPeriodRevenue, setPreviousPeriodRevenue] = useState<number>(0)
  const [previousPeriodOrders, setPreviousPeriodOrders] = useState<number>(0)

  useEffect(() => {
    fetchSalesData()
  }, [period])

  const getDateRange = (p: PeriodType): { startDate: Date; endDate: Date } => {
    const now = new Date()
    switch (p) {
      case 'week':
        return { startDate: subDays(now, 7), endDate: now }
      case 'month':
        return { startDate: startOfMonth(now), endDate: endOfMonth(now) }
      case 'quarter':
        return { startDate: subMonths(now, 3), endDate: now }
      case 'year':
        return { startDate: startOfYear(now), endDate: endOfYear(now) }
      default:
        return { startDate: subDays(now, 30), endDate: now }
    }
  }

  const fetchSalesData = async () => {
    try {
      setLoading(true)

      const { startDate, endDate } = getDateRange(period)

      // Fetch analytics, top customers, and recent orders in parallel
      const dateRangeMap: Record<PeriodType, string> = {
        week: 'this_week',
        month: 'this_month',
        quarter: 'this_quarter',
        year: 'this_year',
      }

      const groupByMap: Record<PeriodType, string> = {
        week: 'day',
        month: 'day',
        quarter: 'week',
        year: 'month',
      }

      const [analyticsResult, customersResult, ordersResult] = await Promise.all([
        api.get('/sales/analytics/sales-analytics', {
          params: {
            period,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            dateRange: dateRangeMap[period],
            groupBy: groupByMap[period],
          },
        }).then(r => r.data).catch(() => null),
        api.get('/sales/analytics/top-customers', {
          params: {
            limit: 5,
            period: period === 'week' ? 'month' : period === 'quarter' ? 'quarter' : period,
          },
        }).then(r => r.data?.data ?? r.data ?? []).catch(() => []),
        api.get('/sales-orders', {
          params: { limit: 5, sortBy: 'orderDate', sortOrder: 'desc' },
        }).then(r => r.data).catch(() => ({ data: [] })),
      ])

      // Set analytics data - map backend response shape to frontend interface
      if (analyticsResult) {
        const result = analyticsResult as any
        const metrics = result.metrics || result
        const periodData: Array<{ period: string; revenue: number }> = result.periodData || []
        const backendTopProducts: any[] = result.topProducts || []

        const formatChartPeriodLabel = (periodLabel: string, groupBy: string): string => {
          if (groupBy === 'day') {
            const [year, month, day] = periodLabel.split('-').map(Number)
            if (year && month && day) {
              return formatDate(new Date(year, month - 1, day))
            }
          }
          return periodLabel
        }

        setAnalytics({
          totalRevenue: metrics.totalRevenue || 0,
          totalOrders: metrics.totalOrders || 0,
          averageOrderValue: metrics.averageOrderValue || 0,
          conversionRate: metrics.conversionRate,
          topProducts: backendTopProducts.map((p: any) => ({
            productId: p.productId,
            productName: p.productName,
            revenue: p.totalRevenue ?? p.revenue ?? 0,
            quantity: p.quantitySold ?? p.quantity ?? 0,
          })),
          revenueChart: {
            labels: periodData.map((d) => formatChartPeriodLabel(d.period, groupByMap[period])),
            data: periodData.map((d) => d.revenue),
          },
        })
      } else {
        // Fallback: fetch orders and calculate on frontend (legacy behavior)
        const fallbackOrders = await api.get('/sales-orders', {
          params: { sortBy: 'orderDate', sortOrder: 'desc' },
        })
        const orders = fallbackOrders?.data?.data || []

        // Calculate basic metrics
        const totalRevenue = orders.reduce((sum: number, order: any) => sum + (order.totalAmount || 0), 0)
        const totalOrders = orders.length
        const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0

        // Calculate top products
        const productStats: { [key: string]: { name: string, revenue: number, quantity: number } } = {}
        orders.forEach((order: any) => {
          if (order.items && Array.isArray(order.items)) {
            order.items.forEach((item: any) => {
              const productId = item.product?.id || item.productId
              const productName = item.product?.name || 'Unknown Product'
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

        const topProducts = Object.entries(productStats)
          .map(([id, stats]) => ({
            productId: id,
            productName: stats.name,
            revenue: stats.revenue,
            quantity: stats.quantity,
          }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 5)

        // Generate chart data (last 30 days)
        const chartLabels: string[] = []
        const chartData: number[] = []
        for (let i = 29; i >= 0; i--) {
          const date = subDays(new Date(), i)
          chartLabels.push(formatDate(date))
          const dayOrders = orders.filter((order: any) => {
            const orderDate = new Date(order.orderDate)
            return (
              orderDate.getFullYear() === date.getFullYear() &&
              orderDate.getMonth() === date.getMonth() &&
              orderDate.getDate() === date.getDate()
            )
          })
          chartData.push(dayOrders.reduce((sum: number, o: any) => sum + (o.totalAmount || 0), 0))
        }

        setAnalytics({
          totalRevenue,
          totalOrders,
          averageOrderValue: avgOrderValue,
          topProducts,
          revenueChart: {
            labels: chartLabels,
            data: chartData,
          },
        })

        // Calculate top customers from orders
        const customerStats: { [key: string]: { name: string, revenue: number, orders: number } } = {}
        orders.forEach((order: any) => {
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

        const fallbackCustomers = Object.entries(customerStats)
          .map(([id, stats]) => ({
            customerId: id,
            customerName: stats.name,
            totalRevenue: stats.revenue,
            totalOrders: stats.orders,
          }))
          .sort((a, b) => b.totalRevenue - a.totalRevenue)
          .slice(0, 5)

        setTopCustomers(fallbackCustomers)
      }

      // Set top customers from API response
      if (Array.isArray(customersResult) && customersResult.length > 0) {
        setTopCustomers(customersResult.map((c: any) => ({
          customerId: c.customerId ?? c.customer?.id,
          customerName: c.customerName ?? c.customer?.name,
          totalRevenue: c.totalRevenue,
          totalOrders: c.totalOrders,
        })))
      }

      // Set recent orders
      setRecentOrders(ordersResult?.data || ordersResult || [])

    } catch (error) {
      console.error('Error fetching sales data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Build stats from analytics
  const stats: StatItem[] = [
    {
      title: 'Total Sales',
      value: formatCurrency(analytics?.totalRevenue || 0),
      change: '+0.0%', // Growth calculation would require previous period data
      trend: 'up',
      icon: SalesIcon,
      color: 'primary',
      onClick: () => navigate('/sales/orders'),
    },
    {
      title: 'Orders',
      value: formatNumber(analytics?.totalOrders || 0),
      change: '+0.0%',
      trend: 'up',
      icon: OrdersIcon,
      color: 'info',
      onClick: () => navigate('/sales/orders'),
    },
    {
      title: 'Avg Order Value',
      value: formatCurrency(analytics?.averageOrderValue || 0),
      change: '+0.0%',
      trend: 'up',
      icon: PaymentsIcon,
      color: 'success',
    },
    {
      title: 'Top Customers',
      value: formatNumber(topCustomers.length),
      change: '+0.0%',
      trend: 'up',
      icon: CustomersIcon,
      color: 'secondary',
      onClick: () => navigate('/sales/customers'),
    },
  ]

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
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
          <Typography variant="body2" color="text.secondary">
            Monitor sales performance and manage customer relationships
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Period</InputLabel>
            <Select
              value={period}
              label="Period"
              onChange={(e) => setPeriod(e.target.value as PeriodType)}
            >
              <MenuItem value="week">Last 7 Days</MenuItem>
              <MenuItem value="month">This Month</MenuItem>
              <MenuItem value="quarter">Last 3 Months</MenuItem>
              <MenuItem value="year">This Year</MenuItem>
            </Select>
          </FormControl>
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
      <SalesStatsCards stats={stats} loading={loading} />

      {/* Charts and Analytics */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid
          size={{
            xs: 12,
            lg: 8
          }}>
          <SalesTrendChart
            labels={analytics?.revenueChart?.labels || []}
            data={analytics?.revenueChart?.data || []}
            loading={loading}
          />
        </Grid>

        <Grid
          size={{
            xs: 12,
            lg: 4
          }}>
          <TopProductsList
            products={analytics?.topProducts || []}
            loading={loading}
          />
        </Grid>
      </Grid>

      {/* Recent Orders and Top Customers */}
      <Grid container spacing={3}>
        <Grid
          size={{
            xs: 12,
            lg: 8
          }}>
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
                  {loading ? (
                    [1, 2, 3, 4, 5].map((i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton variant="text" width={80} /></TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Skeleton variant="circular" width={32} height={32} />
                            <Box>
                              <Skeleton variant="text" width={100} />
                              <Skeleton variant="text" width={60} />
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell><Skeleton variant="text" width={80} /></TableCell>
                        <TableCell align="right"><Skeleton variant="text" width={60} /></TableCell>
                        <TableCell><Skeleton variant="rounded" width={70} height={24} /></TableCell>
                      </TableRow>
                    ))
                  ) : recentOrders.length > 0 ? recentOrders.map((order: any) => (
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
                          {formatDate(order.orderDate)}
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

        <Grid
          size={{
            xs: 12,
            lg: 4
          }}>
          <TopCustomersList
            customers={topCustomers}
            loading={loading}
          />
        </Grid>
      </Grid>
    </Box>
  );
}

export default SalesPage
