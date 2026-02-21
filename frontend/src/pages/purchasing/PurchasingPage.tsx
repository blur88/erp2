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
  useTheme
} from '@mui/material'
import {
  Assignment as PurchasingIcon,
  LocalShipping as SuppliersIcon,
  Inventory2 as GRNIcon,
  Payment as PaymentsIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
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
import { Line } from 'react-chartjs-2'
import { formatCurrency, formatDate } from '@/utils/formatters'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'
import { useNavigate } from 'react-router-dom'
import { purchasingApi } from '@/services/purchasingApi'

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

const PurchasingPage: React.FC = () => {
  const theme = useTheme()
  const navigate = useNavigate()
  const [purchasingData, setPurchasingData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPurchasingData()
  }, [])

  const fetchPurchasingData = async () => {
    try {
      setLoading(true)

      // Fetch purchase orders
      const ordersResponse = await purchasingApi.getPurchaseOrders({
        limit: 100,
        sortBy: 'orderDate',
        sortOrder: 'DESC' as any
      })
      let ordersData = []
      let allOrders = []
      if (ordersResponse?.orders) {
        // Backend returns { orders: [...], total, page, limit, totalPages }
        allOrders = ordersResponse.orders || []
        ordersData = allOrders.slice(0, 5)
      }

      // Fetch suppliers
      const suppliersResponse = await purchasingApi.getSuppliers({ limit: 100 }) as any
      let suppliersData = []
      if (suppliersResponse?.suppliers) {
        // Backend returns { suppliers: [...], total, page, limit, totalPages }
        suppliersData = suppliersResponse.suppliers || []
      }

      // Calculate top suppliers from orders
      const supplierStats: { [key: string]: { name: string, totalSpent: number, orderCount: number } } = {}

      allOrders.forEach((order: any) => {
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

      // Convert to array and sort by total spent
      const topSuppliersData = Object.entries(supplierStats)
        .map(([id, stats]) => ({
          supplierId: id,
          supplierName: stats.name,
          totalSpent: stats.totalSpent,
          orderCount: stats.orderCount
        }))
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, 5)

      // Calculate metrics from all orders
      const totalSpent = allOrders.reduce((sum: number, order: any) => sum + (parseFloat(order.totalAmount) || 0), 0)
      const totalOrders = allOrders.length
      const avgOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0
      // Count active suppliers (backend already filters out soft-deleted records)
      // Note: isActive field is not included in SupplierResponseDto, but all returned suppliers are active
      const activeSuppliers = suppliersData.filter((s: any) => !s.deletedAt).length

      // Generate period data for chart (last 30 days)
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

        const spent = dayOrders.reduce((sum: number, order: any) => sum + (parseFloat(order.totalAmount) || 0), 0)

        periodData.push({
          period: date.toISOString(),
          spent,
          orders: dayOrders.length
        })
      }

      // Calculate growth percentages (current 30 days vs previous 30 days)
      const thirtyDaysAgo = new Date(today)
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const sixtyDaysAgo = new Date(today)
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      // Current period
      const currentPeriodOrders = allOrders.filter((order: any) => {
        const orderDate = new Date(order.orderDate)
        return orderDate >= thirtyDaysAgo && orderDate <= today
      })
      const currentSpent = currentPeriodOrders.reduce((sum: number, order: any) => sum + (parseFloat(order.totalAmount) || 0), 0)
      const currentOrderCount = currentPeriodOrders.length

      // Previous period
      const previousPeriodOrders = allOrders.filter((order: any) => {
        const orderDate = new Date(order.orderDate)
        return orderDate >= sixtyDaysAgo && orderDate < thirtyDaysAgo
      })
      const previousSpent = previousPeriodOrders.reduce((sum: number, order: any) => sum + (parseFloat(order.totalAmount) || 0), 0)
      const previousOrderCount = previousPeriodOrders.length

      // Calculate percentage changes
      const spentGrowth = previousSpent > 0
        ? ((currentSpent - previousSpent) / previousSpent) * 100
        : currentSpent > 0 ? 100 : 0

      const ordersGrowth = previousOrderCount > 0
        ? ((currentOrderCount - previousOrderCount) / previousOrderCount) * 100
        : currentOrderCount > 0 ? 100 : 0

      // Calculate supplier growth
      const suppliersGrowth = 0 // Mock data for now

      // Calculate avg order value growth
      const currentAvgOrder = currentOrderCount > 0 ? currentSpent / currentOrderCount : 0
      const previousAvgOrder = previousOrderCount > 0 ? previousSpent / previousOrderCount : 0
      const avgOrderGrowth = previousAvgOrder > 0
        ? ((currentAvgOrder - previousAvgOrder) / previousAvgOrder) * 100
        : currentAvgOrder > 0 ? 100 : 0

      setPurchasingData({
        metrics: {
          totalSpent,
          totalOrders,
          averageOrderValue: avgOrderValue,
          activeSuppliers,
          spentGrowth,
          ordersGrowth,
          suppliersGrowth,
          avgOrderGrowth
        },
        recentOrders: ordersData,
        topSuppliers: topSuppliersData,
        periodData
      })
    } catch (error) {
      console.error('Error fetching purchasing data:', error)
    } finally {
      setLoading(false)
    }
  }

  // Chart data
  const purchasingTrendData = {
    labels: purchasingData?.periodData?.map((item: any) => {
      return formatDate(item.period)
    }) || [],
    datasets: [
      {
        label: 'Spending',
        data: purchasingData?.periodData?.map((item: any) => item.spent) || [],
        borderColor: theme.palette.warning.main,
        backgroundColor: `${theme.palette.warning.main}20`,
        tension: 0.4
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

  const stats = [
    {
      title: 'Total Spending',
      value: formatCurrency(purchasingData?.metrics?.totalSpent || 0),
      change: purchasingData?.metrics?.spentGrowth !== undefined ? `${purchasingData.metrics.spentGrowth > 0 ? '+' : ''}${purchasingData.metrics.spentGrowth.toFixed(1)}%` : '+0.0%',
      trend: (purchasingData?.metrics?.spentGrowth || 0) >= 0 ? 'up' : 'down',
      icon: PurchasingIcon,
      color: 'warning'
    },
    {
      title: 'Purchase Orders',
      value: purchasingData?.metrics?.totalOrders || '0',
      change: purchasingData?.metrics?.ordersGrowth !== undefined ? `${purchasingData.metrics.ordersGrowth > 0 ? '+' : ''}${purchasingData.metrics.ordersGrowth.toFixed(1)}%` : '+0.0%',
      trend: (purchasingData?.metrics?.ordersGrowth || 0) >= 0 ? 'up' : 'down',
      icon: GRNIcon,
      color: 'info'
    },
    {
      title: 'Active Suppliers',
      value: purchasingData?.metrics?.activeSuppliers || '0',
      change: purchasingData?.metrics?.suppliersGrowth !== undefined ? `${purchasingData.metrics.suppliersGrowth > 0 ? '+' : ''}${purchasingData.metrics.suppliersGrowth.toFixed(1)}%` : '+0.0%',
      trend: (purchasingData?.metrics?.suppliersGrowth || 0) >= 0 ? 'up' : 'down',
      icon: SuppliersIcon,
      color: 'secondary'
    },
    {
      title: 'Avg Order Value',
      value: formatCurrency(purchasingData?.metrics?.averageOrderValue || 0),
      change: purchasingData?.metrics?.avgOrderGrowth !== undefined ? `${purchasingData.metrics.avgOrderGrowth > 0 ? '+' : ''}${purchasingData.metrics.avgOrderGrowth.toFixed(1)}%` : '+0.0%',
      trend: (purchasingData?.metrics?.avgOrderGrowth || 0) >= 0 ? 'up' : 'down',
      icon: PaymentsIcon,
      color: 'success'
    }
  ]

  const recentOrders = purchasingData?.recentOrders || []
  const topSuppliers = purchasingData?.topSuppliers || []

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant={TYPOGRAPHY_STYLES.pageHeader.variant} sx={{
            fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight,
            mb: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 2
          }}>
            <PurchasingIcon sx={{
              fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize,
              color: TYPOGRAPHY_STYLES.pageHeader.icon.color
            }} />
            Purchasing Overview
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Monitor purchasing activities and manage supplier relationships
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate('/purchasing/orders/create')}
          >
            Create Purchase Order
          </Button>
        </Box>
      </Box>
      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {stats.map((stat, index) => (
          <Grid
            key={index}
            size={{
              xs: 12,
              sm: 6,
              lg: 3
            }}>
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
        <Grid
          size={{
            xs: 12,
            lg: 8
          }}>
          <Paper sx={{ p: 3, height: 400 }}>
            <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, mb: 3 }}>
              Purchasing Trend
            </Typography>
            <Box sx={{ height: 300 }}>
              <Line data={purchasingTrendData} options={chartOptions} />
            </Box>
          </Paper>
        </Grid>

        <Grid
          size={{
            xs: 12,
            lg: 4
          }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, mb: 3 }}>
              Top Suppliers
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {topSuppliers.length > 0 ? topSuppliers.map((supplier: any, index: number) => (
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
                    <Typography variant="body2" color="warning">
                      {formatCurrency(supplier.totalSpent || 0)}
                    </Typography>
                  </Box>
                </Box>
              )) : (
                <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} color="text.secondary" align="center">
                  No supplier data available
                </Typography>
              )}
            </Box>
          </Paper>
        </Grid>
      </Grid>
      {/* Recent Orders */}
      <Grid container spacing={3}>
        <Grid size={12}>
          <Paper sx={{ overflow: 'hidden' }}>
            <Box sx={{ p: 3, borderBottom: 1, borderColor: 'divider' }}>
              <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight }}>
                Recent Purchase Orders
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
                        PO Number
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                        fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                        color: TYPOGRAPHY_STYLES.tableHeader.color,
                        fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                      }}>
                        Supplier
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                        fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                        color: TYPOGRAPHY_STYLES.tableHeader.color,
                        fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                      }}>
                        PO Date
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
                      onClick={() => navigate(`/purchasing/orders?poId=${order.id}`)}
                    >
                      <TableCell>
                        <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                          {order.orderNumber}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box>
                          <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                            {order.supplier?.companyName || 'Unknown'}
                          </Typography>
                          <Typography variant={TYPOGRAPHY_STYLES.tableCell.caption.variant} color="text.secondary" sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize }}>
                            {order.items?.length || 0} item{order.items?.length !== 1 ? 's' : ''}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.secondary.fontSize }}>
                          {order.orderDate ? formatDate(order.orderDate) : 'N/A'}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} color="warning" sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
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
                  )) : (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
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
    </Box>
  );
}

export default PurchasingPage
