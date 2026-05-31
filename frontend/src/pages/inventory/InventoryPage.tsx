import React, { useMemo } from 'react'
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  useTheme,
} from '@mui/material'
import { default as ArrowDownwardIcon } from '@mui/icons-material/ArrowDownward'
import { default as ArrowUpwardIcon } from '@mui/icons-material/ArrowUpward'
import { default as OutOfStockIcon } from '@mui/icons-material/ErrorOutlined'
import { default as InventoryIcon } from '@mui/icons-material/Inventory2'
import { default as TrendingUpIcon } from '@mui/icons-material/TrendingUp'
import { default as WarningIcon } from '@mui/icons-material/Warning'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js'
import { Doughnut, Line } from 'react-chartjs-2'
import { format } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { AppButton } from '@/components/common/AppButton'
import PageHeader from '@/components/common/PageHeader'
import GenericOverviewPage from '@/components/common/GenericOverviewPage'
import { FilterBar } from '@/components/filters/FilterBar'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useInventoryAnalytics } from './hooks/useInventoryAnalytics'
import { formatCurrency } from '@/utils/formatters'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { resolveApiParams } from '@/utils/dashboardApiParams'
import type { DashboardCompare } from '@/utils/dashboardApiParams'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
)

function deltaPercent(current: number | undefined, previous: number | undefined): string | null {
  if (current === undefined || previous === undefined || previous === 0) {
    return null
  }

  const pct = ((current - previous) / previous) * 100
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
}

const InventoryPage: React.FC = () => {
  const theme = useTheme()
  const navigate = useNavigate()

  type InventoryDashboardFilters = {
    period: PeriodValue
    compareWith: DashboardCompare
    supplierId: string | null
    categoryId: string | null
    stockStatus: string | null
  }

  const inventoryConfig: FilterBarConfig<InventoryDashboardFilters> = {
    namespace: 'inventory',
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
        type: 'supplier',
        paramKey: 'supplier',
      },
      {
        field: 'categoryId',
        label: 'Category',
        type: 'category',
        paramKey: 'category',
      },
      {
        field: 'stockStatus',
        label: 'Stock Status',
        type: 'stock-status',
        paramKey: 'stock_status',
      },
    ],
    defaults: {
      period: { key: null, from: null, to: null },
      compareWith: null,
      supplierId: null,
      categoryId: null,
      stockStatus: null,
    },
  }

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(inventoryConfig)
  const resolvedApiParams = resolveApiParams(appliedFilters)

  const { data, isLoading, isFetching, error } = useInventoryAnalytics(resolvedApiParams)

  const current = data?.current
  const comparison = data?.comparison
  const recentMovements = data?.recentMovements ?? []
  const lowStockAlerts = data?.lowStockAlerts ?? []

  const stockHealthData = useMemo(
    () => ({
      labels: ['In Stock', 'Out of Stock'],
      datasets: [
        {
          data: [
            Math.max((current?.metrics.totalProducts ?? 0) - (current?.metrics.outOfStockCount ?? 0), 0),
            current?.metrics.outOfStockCount ?? 0,
          ],
          backgroundColor: [theme.palette.success.main, theme.palette.error.main],
          borderWidth: 2,
          borderColor: theme.palette.background.paper,
        },
      ],
    }),
    [current?.metrics.outOfStockCount, current?.metrics.totalProducts, theme],
  )

  const movementTrendData = useMemo(
    () => ({
      labels: current?.periodData.map((point) => point.period) ?? [],
      datasets: [
        {
          label: 'Stock In',
          data: current?.periodData.map((point) => point.movementsIn) ?? [],
          borderColor: theme.palette.success.main,
          backgroundColor: `${theme.palette.success.main}20`,
          tension: 0.35,
        },
        {
          label: 'Stock Out',
          data: current?.periodData.map((point) => point.movementsOut) ?? [],
          borderColor: theme.palette.error.main,
          backgroundColor: `${theme.palette.error.main}20`,
          tension: 0.35,
        },
      ],
    }),
    [current?.periodData, theme],
  )

  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' as const },
    },
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  }

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' as const },
      tooltip: {
        callbacks: {
          label(context: any) {
            return `${context.label}: ${context.parsed}`
          },
        },
      },
    },
  }

  const stats = [
    {
      title: 'Total Products',
      value: String(current?.metrics.totalProducts ?? 0),
      icon: InventoryIcon,
      color: 'primary',
    },
    {
      title: 'Inventory Value',
      value: formatCurrency(current?.metrics.inventoryValue ?? 0),
      icon: TrendingUpIcon,
      color: 'success',
    },
    {
      title: 'Stock In',
      value: `${current?.metrics.stockMovementsIn ?? 0} units`,
      icon: ArrowUpwardIcon,
      color: 'info',
      delta: deltaPercent(current?.metrics.stockMovementsIn, comparison?.metrics.stockMovementsIn),
      deltaPositiveIsGood: true,
    },
    {
      title: 'Stock Out',
      value: `${current?.metrics.stockMovementsOut ?? 0} units`,
      icon: ArrowDownwardIcon,
      color: 'warning',
      delta: deltaPercent(current?.metrics.stockMovementsOut, comparison?.metrics.stockMovementsOut),
      deltaPositiveIsGood: false,
    },
  ]

  if (isLoading) {
    return (
      <GenericOverviewPage>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
          <CircularProgress size={60} />
        </Box>
      </GenericOverviewPage>
    )
  }

  return (
    <GenericOverviewPage>
      <PageHeader
        variant="overview"
        title="Inventory Overview"
        subtitle="Monitor stock levels, track movements, and manage inventory health"
        secondaryAction={{ label: 'Manage Categories', onClick: () => navigate('/inventory/categories') }}
        primaryAction={{ label: 'Add Product', onClick: () => navigate('/inventory/products') }}
        toolbar={
          <FilterBar
            config={inventoryConfig}
            draftFilters={draftFilters}
            handlers={handlers}
            hasActiveFilters={hasActiveFilters}
            isFetching={isFetching}
          />
        }
      />
      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={
            <AppButton size="small" variant="secondary" onClick={() => window.location.reload()}>
              Retry
            </AppButton>
          }
        >
          Failed to load inventory dashboard data.
        </Alert>
      )}
      <Box sx={{ opacity: isFetching ? 0.7 : 1, transition: 'opacity 0.2s' }}>
        <Grid container spacing={3} sx={{ mb: 4 }}>
          {stats.map((stat) => (
            <Grid key={stat.title} size={{ xs: 12, sm: 6, lg: 3 }}>
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
                    {'delta' in stat && stat.delta && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {stat.delta.startsWith('+') ? (
                          <TrendingUpIcon
                            sx={{
                              fontSize: 16,
                              color: stat.deltaPositiveIsGood ? 'success.main' : 'error.main',
                            }}
                          />
                        ) : (
                          <TrendingUpIcon
                            sx={{
                              fontSize: 16,
                              color: stat.deltaPositiveIsGood ? 'error.main' : 'success.main',
                              transform: 'rotate(180deg)',
                            }}
                          />
                        )}
                        <Typography
                          variant="tableCaption"
                          sx={{
                            color: stat.delta.startsWith('+')
                              ? stat.deltaPositiveIsGood
                                ? 'success.main'
                                : 'error.main'
                              : stat.deltaPositiveIsGood
                                ? 'error.main'
                                : 'success.main',
                            fontWeight: 600,
                            fontSize: '0.7rem',
                          }}
                        >
                          {stat.delta}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                  <Typography
                    variant="h4"
                    sx={{ fontWeight: 700, mb: 0.5 }}
                  >
                    {stat.value}
                  </Typography>
                  <Typography variant="body2" sx={{
                    color: "text.secondary"
                  }}>
                    {stat.title}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid size={{ xs: 12, lg: 6 }}>
            <Paper sx={{ p: 3, height: 400 }}>
              <Typography
                variant="tableHeader"
                sx={{ fontWeight: 600, mb: 3 }}
              >
                Stock Movement Trend
              </Typography>
              <Box sx={{ height: 300 }}>
                {current?.periodData && current.periodData.length > 0 ? (
                  <Line data={movementTrendData} options={lineChartOptions} />
                ) : (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                    <Typography variant="body2" sx={{
                      color: "text.secondary"
                    }}>
                      No movement data for this period
                    </Typography>
                  </Box>
                )}
              </Box>
            </Paper>
          </Grid>

          <Grid size={{ xs: 12, lg: 6 }}>
            <Paper sx={{ p: 3, height: 400 }}>
              <Typography
                variant="tableHeader"
                sx={{ fontWeight: 600, mb: 3 }}
              >
                Stock Health Status
              </Typography>
              <Box sx={{ height: 300 }}>
                <Doughnut data={stockHealthData} options={doughnutOptions} />
              </Box>
            </Paper>
          </Grid>
        </Grid>

        <Grid container spacing={3}>
          <Grid size={{ xs: 12, lg: 8 }}>
            <Paper sx={{ overflow: 'hidden' }}>
              <Box
                sx={{
                  p: 3,
                  borderBottom: 1,
                  borderColor: 'divider',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Typography
                  variant="tableHeader"
                  sx={{ fontWeight: 600 }}
                >
                  Recent Stock Movements
                </Typography>
                <Chip
                  label={`${current?.metrics.stockMovementsIn ?? 0} in / ${current?.metrics.stockMovementsOut ?? 0} out`}
                  color="info"
                  size="small"
                />
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
                      {['Date', 'Product', 'Type', 'Quantity', 'Reference'].map((column) => (
                        <TableCell key={column} align={column === 'Quantity' ? 'right' : 'left'}>
                          <Typography
                            variant="tableHeader"
                            sx={{
                              fontWeight: 600,
                              color: 'text.primary',
                              fontSize: '0.8rem',
                            }}
                          >
                            {column}
                          </Typography>
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {recentMovements.length > 0 ? (
                      recentMovements.map((movement) => (
                        <TableRow
                          key={`${movement.movementDate}-${movement.productName}-${movement.referenceNumber}`}
                          hover
                          sx={{
                            '& .MuiTableCell-root': {
                              borderBottom: TABLE_STYLES.cell.border,
                              py: TABLE_STYLES.cell.padding.py,
                              px: TABLE_STYLES.cell.padding.px,
                            },
                            height: TABLE_STYLES.row.height,
                          }}
                        >
                          <TableCell>
                            <Typography
                              variant="body2"
                              sx={{ fontSize: '0.8rem' }}
                            >
                              {movement.movementDate ? format(new Date(movement.movementDate), 'MMM dd, yyyy') : 'N/A'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography
                              variant="body2"
                              sx={{ fontSize: '0.8rem' }}
                            >
                              {movement.productName}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={movement.movementType.replace(/_/g, ' ')}
                              color={movement.quantity > 0 ? 'success' : movement.quantity < 0 ? 'error' : 'default'}
                              size="small"
                              variant="outlined"
                              sx={{
                                fontSize: '0.7rem',
                                fontWeight: 500,
                                height: 20,
                              }}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: 600,
                                fontSize: '0.8rem',
                                color: movement.quantity > 0 ? 'success.main' : 'error.main',
                              }}
                            >
                              {movement.quantity > 0 ? '+' : ''}
                              {movement.quantity}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography
                              variant="body2"
                              sx={{ fontSize: '0.8rem' }}
                            >
                              {movement.referenceNumber}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} align="center">
                          <Typography variant="body2" sx={{
                            color: "text.secondary"
                          }}>
                            No movements in this period
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>

          <Grid size={{ xs: 12, lg: 4 }}>
            <Paper sx={{ p: 3 }}>
              <Typography
                variant="tableHeader"
                sx={{ fontWeight: 600, mb: 3 }}
              >
                Low Stock Alerts
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {lowStockAlerts.length > 0 ? (
                  lowStockAlerts.map((alert) => (
                    <Box
                      key={alert.productId}
                      sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                        <Box
                          sx={{
                            width: 24,
                            height: 24,
                            borderRadius: '50%',
                            bgcolor: alert.status === 'out_of_stock' ? 'error.main' : 'warning.main',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {alert.status === 'out_of_stock' ? (
                            <OutOfStockIcon sx={{ fontSize: 14 }} />
                          ) : (
                            <WarningIcon sx={{ fontSize: 14 }} />
                          )}
                        </Box>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography
                            variant="body2"
                            sx={{ fontSize: '0.8rem' }}
                            noWrap
                          >
                            {alert.productName}
                          </Typography>
                          <Typography variant="caption" noWrap sx={{
                            color: "text.secondary"
                          }}>
                            {alert.categoryName} {alert.stockQuantity} units
                          </Typography>
                        </Box>
                      </Box>
                      <Chip
                        label={alert.status === 'out_of_stock' ? 'Out' : 'Low'}
                        color={alert.status === 'out_of_stock' ? 'error' : 'warning'}
                        size="small"
                        sx={{
                          fontSize: '0.7rem',
                          fontWeight: 500,
                          height: 20,
                          flexShrink: 0,
                        }}
                      />
                    </Box>
                  ))
                ) : (
                  <Typography
                    variant="body2"
                    align="center"
                    sx={{
                      color: "text.secondary"
                    }}
                  >
                    All products well stocked
                  </Typography>
                )}
              </Box>
            </Paper>
          </Grid>
        </Grid>
      </Box>
    </GenericOverviewPage>
  );
}

export default InventoryPage
