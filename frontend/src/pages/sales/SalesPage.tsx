import React, { useEffect, useState } from 'react'
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  Grid,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import {
  PointOfSale as SalesIcon,
  People as CustomersIcon,
  Receipt as OrdersIcon,
  Payment as PaymentsIcon,
} from '@mui/icons-material'
import { formatCurrency, formatDate, formatNumber } from '@/utils/formatters'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'
import PageHeader from '@/components/common/PageHeader'
import { DashboardFilterBar } from '@/components/dashboard/DashboardFilterBar'
import { useNavigate } from 'react-router-dom'
import api from '@/services/api'
import { SalesStatsCards, SalesTrendChart, TopProductsList, TopCustomersList } from './components'
import type { StatItem } from './components'
import { useDashboardFilters } from '@/hooks/useDashboardFilters'
import { useDashboardAnalytics } from './hooks/useDashboardAnalytics'

const SalesPage: React.FC = () => {
  const navigate = useNavigate()
  const [recentOrders, setRecentOrders] = useState<any[]>([])
  const [recentOrdersLoading, setRecentOrdersLoading] = useState(true)

  const {
    period,
    compareWith,
    customFrom,
    customTo,
    setPeriod,
    setCompare,
    setCustomRange,
    setCustomFrom,
    setCustomTo,
    reset,
    isDefault,
    resolvedApiParams,
  } = useDashboardFilters('sales')

  const { data, isLoading, isFetching, error } = useDashboardAnalytics(resolvedApiParams)

  const topCustomers = data?.topCustomers ?? []
  const current = data?.current
  const comparison = data?.comparison

  const topProducts = (data?.topProducts ?? []).map((product: any) => ({
    productId: product.productId,
    productName: product.productName,
    revenue: product.totalRevenue ?? product.revenue ?? 0,
    quantity: product.quantitySold ?? product.quantity ?? 0,
  }))

  useEffect(() => {
    let active = true

    const fetchRecentOrders = async () => {
      try {
        setRecentOrdersLoading(true)
        const response = await api.get('/sales-orders', {
          params: { limit: 5, sortBy: 'orderDate', sortOrder: 'desc' },
        })

        if (active) {
          setRecentOrders(response.data?.data || response.data || [])
        }
      } catch (fetchError) {
        if (active) {
          console.error('Error fetching recent orders:', fetchError)
          setRecentOrders([])
        }
      } finally {
        if (active) {
          setRecentOrdersLoading(false)
        }
      }
    }

    fetchRecentOrders()

    return () => {
      active = false
    }
  }, [])

  const stats: StatItem[] = [
    {
      title: 'Total Sales',
      value: formatCurrency(current?.metrics.totalRevenue ?? 0),
      icon: SalesIcon,
      color: 'primary',
      onClick: () => navigate('/sales/orders'),
      currentValue: current?.metrics.totalRevenue,
      comparisonValue: comparison?.metrics.totalRevenue,
    },
    {
      title: 'Orders',
      value: formatNumber(current?.metrics.totalOrders ?? 0),
      icon: OrdersIcon,
      color: 'info',
      onClick: () => navigate('/sales/orders'),
      currentValue: current?.metrics.totalOrders,
      comparisonValue: comparison?.metrics.totalOrders,
    },
    {
      title: 'Avg Order Value',
      value: formatCurrency(current?.metrics.averageOrderValue ?? 0),
      icon: PaymentsIcon,
      color: 'success',
      currentValue: current?.metrics.averageOrderValue,
      comparisonValue: comparison?.metrics.averageOrderValue,
    },
    {
      title: 'Top Customers',
      value: formatNumber(topCustomers.length),
      icon: CustomersIcon,
      color: 'secondary',
      onClick: () => navigate('/sales/customers'),
    },
  ]

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Sales Overview"
        subtitle="Monitor sales performance and manage customer relationships"
        primaryAction={{ label: 'Create Order', onClick: () => navigate('/sales/orders/create') }}
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
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
        onReset={reset}
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
        <SalesStatsCards stats={stats} loading={isLoading} />

        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid
            size={{
              xs: 12,
              lg: 8,
            }}
          >
            <SalesTrendChart
              labels={current?.periodData.map((point) => point.period) ?? []}
              data={current?.periodData.map((point) => point.revenue) ?? []}
              comparisonData={comparison?.periodData.map((point) => point.revenue)}
              groupBy={(resolvedApiParams.groupBy as 'day' | 'week' | 'month' | 'quarter' | 'year' | undefined) ?? 'day'}
              loading={isLoading}
            />
          </Grid>

          <Grid
            size={{
              xs: 12,
              lg: 4,
            }}
          >
            <TopProductsList products={topProducts} loading={isLoading} />
          </Grid>
        </Grid>
      </Box>

      <Grid container spacing={3}>
        <Grid
          size={{
            xs: 12,
            lg: 8,
          }}
        >
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
                      <Typography
                        variant={TYPOGRAPHY_STYLES.tableHeader.variant}
                        sx={{
                          fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                          color: TYPOGRAPHY_STYLES.tableHeader.color,
                          fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                        }}
                      >
                        Order ID
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant={TYPOGRAPHY_STYLES.tableHeader.variant}
                        sx={{
                          fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                          color: TYPOGRAPHY_STYLES.tableHeader.color,
                          fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                        }}
                      >
                        Customer
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant={TYPOGRAPHY_STYLES.tableHeader.variant}
                        sx={{
                          fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                          color: TYPOGRAPHY_STYLES.tableHeader.color,
                          fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                        }}
                      >
                        Date
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        variant={TYPOGRAPHY_STYLES.tableHeader.variant}
                        sx={{
                          fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                          color: TYPOGRAPHY_STYLES.tableHeader.color,
                          fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                        }}
                      >
                        Amount
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant={TYPOGRAPHY_STYLES.tableHeader.variant}
                        sx={{
                          fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                          color: TYPOGRAPHY_STYLES.tableHeader.color,
                          fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                        }}
                      >
                        Status
                      </Typography>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {recentOrdersLoading ? (
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
                          px: TABLE_STYLES.cell.padding.px,
                        },
                        height: TABLE_STYLES.row.height,
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
                            <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                              {order.customer?.name || 'Unknown'}
                            </Typography>
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
                            height: TYPOGRAPHY_STYLES.chip.small.height,
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
            lg: 4,
          }}
        >
          <TopCustomersList customers={topCustomers as any[]} loading={isLoading} />
        </Grid>
      </Grid>
    </Box>
  )
}

export default SalesPage
