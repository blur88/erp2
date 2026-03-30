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
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'
import { useNavigate } from 'react-router-dom'
import PageHeader from '@/components/common/PageHeader'
import { DashboardFilterBar } from '@/components/filters/DashboardFilterBar'
import { useDashboardFilters } from '@/hooks/useDashboardFilters'
import { useGetSuppliersQuery } from '@/store/api/purchasingApi'
import { usePurchasingAnalytics } from './hooks/usePurchasingAnalytics'

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

  const {
    period,
    compareWith,
    customFrom,
    customTo,
    supplierId,
    status,
    paymentStatus,
    setPeriod,
    setCompare,
    setCustomRange,

    setSupplierId,
    setStatus,
    setPaymentStatus,
    reset,
    isDefault,
    resolvedApiParams,
  } = useDashboardFilters('purchasing')

  const { data: suppliersData } = useGetSuppliersQuery({})
  const supplierOptions = suppliersData?.data?.map((supplier) => ({
    id: supplier.id,
    name: supplier.companyName,
  })) ?? []

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

      <DashboardFilterBar
        period={period}
        compareWith={compareWith}
        customFrom={customFrom}
        customTo={customTo}
        isFetching={isFetching}
        isDefault={isDefault}
        onPeriodChange={setPeriod}
        onCompareChange={setCompare}
        onCustomRangeChange={setCustomRange}
        onReset={reset}
        suppliers={supplierOptions}
        supplierId={supplierId}
        onSupplierChange={setSupplierId}
        status={status}
        onStatusChange={setStatus}
        paymentStatus={paymentStatus}
        onPaymentStatusChange={setPaymentStatus}
        paymentStatusOptions={[
          { value: 'paid', label: 'Paid' },
          { value: 'partial', label: 'Partially Paid' },
          { value: 'unpaid', label: 'Unpaid' },
        ]}
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
                            variant={TYPOGRAPHY_STYLES.tableCell.caption.variant}
                            sx={{
                              color: delta >= 0 ? 'success.main' : 'error.main',
                              fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                              fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize,
                            }}
                          >
                            {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
                          </Typography>
                        </Box>
                      )}
                    </Box>
                    <Typography
                      variant={TYPOGRAPHY_STYLES.pageHeader.variant}
                      sx={{ fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight, mb: 0.5 }}
                    >
                      {isLoading ? '—' : stat.value}
                    </Typography>
                    <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} color="text.secondary">
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
                variant={TYPOGRAPHY_STYLES.tableHeader.variant}
                sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, mb: 3 }}
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
                variant={TYPOGRAPHY_STYLES.tableHeader.variant}
                sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, mb: 3 }}
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
                              fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize,
                              fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                            }}
                          >
                            {index + 1}
                          </Typography>
                          <Box>
                            <Typography
                              variant={TYPOGRAPHY_STYLES.tableCell.primary.variant}
                              sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}
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
                    variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant}
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
                  variant={TYPOGRAPHY_STYLES.tableHeader.variant}
                  sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight }}
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
                          fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                          backgroundColor: TABLE_STYLES.header.backgroundColor,
                          py: TABLE_STYLES.header.padding.py,
                        },
                      }}
                    >
                      {['PO Number', 'Supplier', 'PO Date', 'Amount', 'Status'].map((heading) => (
                        <TableCell key={heading} align={heading === 'Amount' ? 'right' : 'left'}>
                          <Typography
                            variant={TYPOGRAPHY_STYLES.tableHeader.variant}
                            sx={{
                              fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                              color: TYPOGRAPHY_STYLES.tableHeader.color,
                              fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
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
                              variant={TYPOGRAPHY_STYLES.tableCell.primary.variant}
                              sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}
                            >
                              {order.orderNumber}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography
                              variant={TYPOGRAPHY_STYLES.tableCell.primary.variant}
                              sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}
                            >
                              {order.supplierName}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography
                              variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant}
                              sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.secondary.fontSize }}
                            >
                              {formatDate(order.orderDate)}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography
                              variant={TYPOGRAPHY_STYLES.tableCell.primary.variant}
                              color="warning.main"
                              sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}
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
                                fontSize: TYPOGRAPHY_STYLES.chip.small.fontSize,
                                fontWeight: TYPOGRAPHY_STYLES.chip.small.fontWeight,
                                height: TYPOGRAPHY_STYLES.chip.small.height,
                              }}
                            />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
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
    </Box>
  )
}

export default PurchasingPage
