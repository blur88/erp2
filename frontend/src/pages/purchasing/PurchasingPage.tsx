import React from 'react'
import {
  Box,
  Typography,
  Paper,
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
  Alert,
  Button,
  useTheme,
} from '@mui/material'
import {
  Assignment as PurchasingIcon,
  LocalShipping as SuppliersIcon,
  Inventory2 as GRNIcon,
  Payment as PaymentsIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
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
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { formatCurrency, formatDate } from '@/utils/formatters'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { useNavigate } from 'react-router-dom'
import PageHeader from '@/components/common/PageHeader'
import { FilterBar } from '@/components/filters/FilterBar'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useGetSuppliersQuery } from '@/store/api/purchasingApi'
import { usePurchasingAnalytics } from './hooks/usePurchasingAnalytics'
import { resolveApiParams } from '@/utils/dashboardApiParams'
import type { DashboardCompare } from '@/utils/dashboardApiParams'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'

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
)

const PurchasingPage: React.FC = () => {
  const theme = useTheme()
  const navigate = useNavigate()

  type PurchasingDashboardFilters = {
    period: PeriodValue
    compareWith: DashboardCompare
    supplierId: string | null
    status: string | null
    paymentStatus: string | null
  }

  const { data: suppliersData } = useGetSuppliersQuery({})
  const supplierOptions = suppliersData?.data?.map((supplier) => ({
    value: supplier.id,
    label: supplier.companyName,
  })) ?? []

  const purchasingConfig: FilterBarConfig<PurchasingDashboardFilters> = {
    namespace: 'purchasing',
    fields: [
      {
        field: 'period',
        label: 'Period',
        type: 'period',
      },
      {
        field: 'compareWith',
        label: 'Compare',
        type: 'compare',
      },
      {
        field: 'supplierId',
        label: 'Supplier',
        type: 'select',
        paramKey: 'supplier',
        options: [{ value: '', label: 'All Suppliers' }, ...supplierOptions],
      },
      {
        field: 'status',
        label: 'Order Status',
        type: 'select',
        paramKey: 'status',
        options: [
          { value: 'received', label: 'Received' },
          { value: 'pending', label: 'Pending' },
        ],
      },
      {
        field: 'paymentStatus',
        label: 'Payment Status',
        type: 'select',
        paramKey: 'payment',
        options: [
          { value: 'paid', label: 'Paid' },
          { value: 'partial', label: 'Partially Paid' },
          { value: 'unpaid', label: 'Unpaid' },
        ],
      },
    ],
    defaults: {
      period: { key: 'this_month', from: null, to: null },
      compareWith: null,
      supplierId: null,
      status: null,
      paymentStatus: null,
    },
  }

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(purchasingConfig)
  const resolvedApiParams = resolveApiParams(appliedFilters)

  const { data, isLoading, isFetching, error } = usePurchasingAnalytics(resolvedApiParams)

  const current = data?.current
  const comparison = data?.comparison
  const topSuppliers = data?.topSuppliers ?? []
  const recentOrders = data?.recentOrders ?? []

  const stats = [
    {
      title: 'Total Spending',
      value: formatCurrency(current?.metrics.totalSpent ?? 0),
      icon: PurchasingIcon,
      color: 'warning',
      currentValue: current?.metrics.totalSpent,
      comparisonValue: comparison?.metrics.totalSpent,
    },
    {
      title: 'Purchase Orders',
      value: String(current?.metrics.totalOrders ?? 0),
      icon: GRNIcon,
      color: 'info',
      currentValue: current?.metrics.totalOrders,
      comparisonValue: comparison?.metrics.totalOrders,
    },
    {
      title: 'Active Suppliers',
      value: String(current?.metrics.activeSuppliers ?? 0),
      icon: SuppliersIcon,
      color: 'secondary',
      currentValue: current?.metrics.activeSuppliers,
      comparisonValue: comparison?.metrics.activeSuppliers,
    },
    {
      title: 'Avg Order Value',
      value: formatCurrency(current?.metrics.averageOrderValue ?? 0),
      icon: PaymentsIcon,
      color: 'success',
      currentValue: current?.metrics.averageOrderValue,
      comparisonValue: comparison?.metrics.averageOrderValue,
    },
  ]

  const purchasingTrendData = {
    labels: current?.periodData.map((item) => item.period) ?? [],
    datasets: [
      {
        label: 'Spending',
        data: current?.periodData.map((item) => item.spent) ?? [],
        borderColor: theme.palette.warning.main,
        backgroundColor: `${theme.palette.warning.main}20`,
        tension: 0.4,
      },
      ...(comparison
        ? [
            {
              label: 'Comparison',
              data: comparison.periodData.map((item) => item.spent),
              borderColor: theme.palette.grey[400],
              backgroundColor: `${theme.palette.grey[400]}20`,
              borderDash: [4, 4],
              tension: 0.4,
            },
          ]
        : []),
    ],
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' as const },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function (value: any) {
            return formatCurrency(value)
          },
        },
      },
    },
  }

  const getDeltaPercent = (current?: number, previous?: number): number | null => {
    if (current === undefined || previous === undefined || previous === 0) return null
    return ((current - previous) / previous) * 100
  }

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        variant="overview"
        title="Purchasing Overview"
        subtitle="Monitor purchasing activities and manage supplier relationships"
        primaryAction={{ label: 'Create Purchase Order', onClick: () => navigate('/purchasing/orders/create') }}
      />

      <FilterBar
        config={purchasingConfig}
        draftFilters={draftFilters}
        handlers={handlers}
        hasActiveFilters={hasActiveFilters}
        isFetching={isFetching}
      />

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={<Button size="small" onClick={() => window.location.reload()}>Retry</Button>}
        >
          Failed to load dashboard data.
        </Alert>
      )}

      <Box sx={{ opacity: isFetching ? 0.7 : 1, transition: 'opacity 0.2s' }}>
        {/* Stats Cards */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          {stats.map((stat, index) => {
            const delta = getDeltaPercent(stat.currentValue, stat.comparisonValue)
            return (
              <Grid key={index} size={{ xs: 12, sm: 6, lg: 3 }}>
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
                      {delta !== null && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {delta >= 0 ? (
                            <TrendingUpIcon sx={{ fontSize: 16, color: 'success.main' }} />
                          ) : (
                            <TrendingDownIcon sx={{ fontSize: 16, color: 'error.main' }} />
                          )}
                          <Typography
                            variant="tableCaption"
                            sx={{
                              color: delta >= 0 ? 'success.main' : 'error.main',
                              fontWeight: 600,
                              fontSize: '0.7rem',
                            }}
                          >
                            {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
                          </Typography>
                        </Box>
                      )}
                    </Box>
                    <Typography
                      variant="h4"
                      sx={{ fontWeight: 700, mb: 0.5 }}
                    >
                      {isLoading ? '—' : stat.value}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {stat.title}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            )
          })}
        </Grid>

        {/* Charts and Analytics */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid size={{ xs: 12, lg: 8 }}>
            <Paper sx={{ p: 3, height: 400 }}>
              <Typography
                variant="tableHeader"
                sx={{ fontWeight: 600, mb: 3 }}
              >
                Purchasing Trend
              </Typography>
              <Box sx={{ height: 300 }}>
                <Line data={purchasingTrendData} options={chartOptions} />
              </Box>
            </Paper>
          </Grid>

          <Grid size={{ xs: 12, lg: 4 }}>
            <Paper sx={{ p: 3 }}>
              <Typography
                variant="tableHeader"
                sx={{ fontWeight: 600, mb: 3 }}
              >
                Top Suppliers
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {topSuppliers.length > 0 ? (
                  topSuppliers.map((supplier, index) => (
                    <Box key={supplier.supplierId}>
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
                              fontSize: '0.7rem',
                              fontWeight: 600,
                            }}
                          >
                            {index + 1}
                          </Typography>
                          <Box>
                            <Typography
                              variant="body2"
                              sx={{ fontSize: '0.8rem' }}
                            >
                              {supplier.supplierName}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {supplier.orderCount} orders
                            </Typography>
                          </Box>
                        </Box>
                        <Typography variant="body2" color="warning.main">
                          {formatCurrency(supplier.totalSpent)}
                        </Typography>
                      </Box>
                    </Box>
                  ))
                ) : (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    align="center"
                  >
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
                <Typography
                  variant="tableHeader"
                  sx={{ fontWeight: 600 }}
                >
                  Recent Purchase Orders
                </Typography>
              </Box>
              <TableContainer>
                <Table size={TABLE_STYLES.size}>
                  <TableHead>
                    <TableRow
                      sx={{
                        '& .MuiTableCell-head': {
                          fontWeight: 600,
                          backgroundColor: TABLE_STYLES.header.backgroundColor,
                          py: TABLE_STYLES.header.padding.py,
                        },
                      }}
                    >
                      {['PO Number', 'Supplier', 'PO Date', 'Amount', 'Status'].map((heading) => (
                        <TableCell key={heading} align={heading === 'Amount' ? 'right' : 'left'}>
                          <Typography
                            variant="tableHeader"
                            sx={{
                              fontWeight: 600,
                              color: 'text.primary',
                              fontSize: '0.8rem',
                            }}
                          >
                            {heading}
                          </Typography>
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {recentOrders.length > 0 ? (
                      recentOrders.map((order) => (
                        <TableRow
                          key={order.orderNumber}
                          hover
                          sx={{
                            cursor: 'pointer',
                            '& .MuiTableCell-root': {
                              borderBottom: TABLE_STYLES.cell.border,
                              py: TABLE_STYLES.cell.padding.py,
                              px: TABLE_STYLES.cell.padding.px,
                            },
                            height: TABLE_STYLES.row.height,
                          }}
                          onClick={() => navigate(`/purchasing/orders?poNumber=${order.orderNumber}`)}
                        >
                          <TableCell>
                            <Typography
                              variant="body2"
                              sx={{ fontSize: '0.8rem' }}
                            >
                              {order.orderNumber}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography
                              variant="body2"
                              sx={{ fontSize: '0.8rem' }}
                            >
                              {order.supplierName}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography
                              variant="body2"
                              sx={{ fontSize: '0.8rem' }}
                            >
                              {formatDate(order.orderDate)}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography
                              variant="body2"
                              color="warning.main"
                              sx={{ fontSize: '0.8rem' }}
                            >
                              {formatCurrency(order.totalAmount)}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={order.status === 'received' ? 'Received' : 'Pending'}
                              color={order.status === 'received' ? 'success' : 'warning'}
                              size="small"
                              variant="outlined"
                              sx={{
                                fontSize: '0.7rem',
                                fontWeight: 500,
                                height: 20,
                              }}
                            />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} align="center">
                          <Typography variant="body2" color="text.secondary">
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
    </Box>
  )
}

export default PurchasingPage
