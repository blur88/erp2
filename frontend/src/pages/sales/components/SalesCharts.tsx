import React from 'react'
import {
    Box,
    Paper,
    Typography,
    Skeleton,
    useTheme,
} from '@mui/material'
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
    Filler,
} from 'chart.js'
import { Line, Doughnut } from 'react-chartjs-2'
import type { Theme } from '@mui/material/styles'
import { formatCurrency, formatNumber, formatSalesPeriodLabel } from '@/utils/formatters'
import { resolveStatusColor } from '@/components/common/StatusChip'

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
    Filler
)

interface SalesTrendChartProps {
    labels: string[]
    data: number[]
    comparisonData?: number[]
    groupBy?: 'day' | 'week' | 'month' | 'quarter' | 'year'
    loading?: boolean
}

export const SalesTrendChart: React.FC<SalesTrendChartProps> = ({ labels, data, comparisonData, groupBy = 'day', loading = false }) => {
    const theme = useTheme()
    const formattedLabels = labels.map((label) => formatSalesPeriodLabel(label, groupBy))

    const chartData = {
        labels: formattedLabels,
        datasets: [
            {
                label: 'Current Period',
                data,
                borderColor: theme.palette.primary.main,
                backgroundColor: `${theme.palette.primary.main}20`,
                tension: 0.4,
                fill: true,
            },
            ...(comparisonData ? [{
                label: 'Comparison Period',
                data: comparisonData,
                borderColor: 'rgba(99, 102, 241, 0.4)',
                backgroundColor: 'transparent',
                borderDash: [6, 3],
                pointRadius: 0,
                tension: 0.4,
                fill: false,
            }] : []),
        ]
    }

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            tooltip: {
                callbacks: {
                    label: function (context: any) {
                        const label = context.dataset.label ?? ''
                        const value = context.parsed.y
                        return `${label}: ${formatCurrency(value)}`
                    }
                }
            },
            legend: {
                position: 'top' as const,
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                ticks: {
                    callback: function (value: any) {
                        return formatCurrency(value)
                    }
                }
            }
        }
    }

    if (loading) {
        return (
            <Paper sx={{ p: 3, height: 400 }}>
                <Skeleton variant="text" width="30%" height={32} sx={{ mb: 3 }} />
                <Skeleton variant="rectangular" height={300} />
            </Paper>
        )
    }

    return (
        <Paper sx={{ p: 3, height: 400 }}>
            <Typography variant="tableHeader" sx={{ fontWeight: 600, mb: 3 }}>
                Sales Trend
            </Typography>
            <Box sx={{ height: 300 }}>
                <Line data={chartData} options={chartOptions} />
            </Box>
        </Paper>
    )
}

interface OrderStatusChartProps {
    ordersByStatus: Array<{
        status: string
        count: number
        percentage: number
    }>
    loading?: boolean
}

export function statusToHex(theme: Theme, status: string): string {
  const color = resolveStatusColor(status)
  if (color === 'default') return theme.palette.grey[500]
  return theme.palette[color].main
}

const OrderStatusChart: React.FC<OrderStatusChartProps> = ({ ordersByStatus, loading = false }) => {
    const theme = useTheme()

    const chartData = {
        labels: ordersByStatus.map(item => item.status.charAt(0).toUpperCase() + item.status.slice(1)),
        datasets: [
            {
                data: ordersByStatus.map(item => item.count),
                backgroundColor: ordersByStatus.map(item => statusToHex(theme, item.status)),
                borderWidth: 2,
                borderColor: theme.palette.background.paper,
            }
        ]
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

    if (loading) {
        return (
            <Paper sx={{ p: 3, height: 400 }}>
                <Skeleton variant="text" width="40%" height={32} sx={{ mb: 3 }} />
                <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                    <Skeleton variant="circular" width={200} height={200} />
                </Box>
            </Paper>
        )
    }

    if (!ordersByStatus || ordersByStatus.length === 0) {
        return (
            <Paper sx={{ p: 3, height: 400 }}>
                <Typography variant="tableHeader" sx={{ fontWeight: 600, mb: 3 }}>
                    Order Status
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
                    <Typography sx={{
                        color: "text.secondary"
                    }}>No order data available</Typography>
                </Box>
            </Paper>
        );
    }

    return (
        <Paper sx={{ p: 3, height: 400 }}>
            <Typography variant="tableHeader" sx={{ fontWeight: 600, mb: 3 }}>
                Order Status
            </Typography>
            <Box sx={{ height: 300 }}>
                <Doughnut data={chartData} options={doughnutOptions} />
            </Box>
        </Paper>
    )
}

interface TopProductsListProps {
    products: Array<{
        productId?: string
        productName: string
        revenue: number
        quantity: number
    }>
    loading?: boolean
}

export const TopProductsList: React.FC<TopProductsListProps> = ({ products, loading = false }) => {
    if (loading) {
        return (
            <Paper sx={{ p: 3, height: 400 }}>
                <Skeleton variant="text" width="40%" height={32} sx={{ mb: 3 }} />
                {[1, 2, 3, 4, 5].map((i) => (
                    <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                        <Skeleton variant="circular" width={24} height={24} />
                        <Box sx={{ flex: 1 }}>
                            <Skeleton variant="text" width="80%" />
                            <Skeleton variant="text" width="40%" />
                        </Box>
                        <Skeleton variant="text" width={60} />
                    </Box>
                ))}
            </Paper>
        )
    }

    return (
        <Paper sx={{ p: 3, height: 400 }}>
            <Typography variant="tableHeader" sx={{ fontWeight: 600, mb: 3 }}>
                Top Products
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {products && products.length > 0 ? products.slice(0, 5).map((product, index) => (
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
                                        fontSize: '0.7rem',
                                        fontWeight: 600
                                    }}
                                >
                                    {index + 1}
                                </Typography>
                                <Box>
                                    <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                                        {product.productName}
                                    </Typography>
                                    <Typography variant="caption" sx={{
                                        color: "text.secondary"
                                    }}>
                                        {formatNumber(product.quantity || 0)} sold
                                    </Typography>
                                </Box>
                            </Box>
                            <Typography variant="body2" color="primary">
                                {formatCurrency(product.revenue || 0)}
                            </Typography>
                        </Box>
                    </Box>
                )) : (
                    <Typography variant="body2" align="center" sx={{
                        color: "text.secondary"
                    }}>
                        No product data available
                    </Typography>
                )}
            </Box>
        </Paper>
    );
}

interface TopCustomersListProps {
    customers: Array<{
        customerId?: string
        customerName?: string
        name?: string
        totalRevenue?: number
        amount?: number
        totalOrders?: number
        orderCount?: number
        orders?: number
    }>
    loading?: boolean
}

export const TopCustomersList: React.FC<TopCustomersListProps> = ({ customers, loading = false }) => {
    if (loading) {
        return (
            <Paper sx={{ p: 3 }}>
                <Skeleton variant="text" width="40%" height={32} sx={{ mb: 3 }} />
                {[1, 2, 3, 4, 5].map((i) => (
                    <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                        <Skeleton variant="circular" width={24} height={24} />
                        <Box sx={{ flex: 1 }}>
                            <Skeleton variant="text" width="80%" />
                            <Skeleton variant="text" width="40%" />
                        </Box>
                        <Skeleton variant="text" width={60} />
                    </Box>
                ))}
            </Paper>
        )
    }

    return (
        <Paper sx={{ p: 3 }}>
            <Typography variant="tableHeader" sx={{ fontWeight: 600, mb: 3 }}>
                Top Customers
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {customers && customers.length > 0 ? customers.slice(0, 5).map((customer, index) => (
                    <Box key={customer.customerId || index}>
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
                                        fontSize: '0.7rem',
                                        fontWeight: 600
                                    }}
                                >
                                    {index + 1}
                                </Typography>
                                <Box>
                                    <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                                        {customer.customerName || customer.name}
                                    </Typography>
                                    <Typography variant="caption" sx={{
                                        color: "text.secondary"
                                    }}>
                                        {formatNumber(customer.totalOrders || customer.orderCount || customer.orders || 0)} orders
                                    </Typography>
                                </Box>
                            </Box>
                            <Typography variant="body2" color="primary">
                                {formatCurrency(customer.totalRevenue || customer.amount || 0)}
                            </Typography>
                        </Box>
                    </Box>
                )) : (
                    <Typography variant="body2" align="center" sx={{
                        color: "text.secondary"
                    }}>
                        No customer data available
                    </Typography>
                )}
            </Box>
        </Paper>
    );
}
