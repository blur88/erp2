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
import { formatCurrency, formatNumber } from '@/utils/formatters'
import { TYPOGRAPHY_STYLES } from '@/constants/typography'

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
    loading?: boolean
}

export const SalesTrendChart: React.FC<SalesTrendChartProps> = ({ labels, data, loading = false }) => {
    const theme = useTheme()

    const chartData = {
        labels,
        datasets: [
            {
                label: 'Sales',
                data,
                borderColor: theme.palette.primary.main,
                backgroundColor: `${theme.palette.primary.main}20`,
                tension: 0.4,
                fill: true,
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
            <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, mb: 3 }}>
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

export const OrderStatusChart: React.FC<OrderStatusChartProps> = ({ ordersByStatus, loading = false }) => {
    const theme = useTheme()

    const statusColors: { [key: string]: string } = {
        fulfilled: theme.palette.success.main,
        pending: theme.palette.warning.main,
        cancelled: theme.palette.error.main,
        confirmed: theme.palette.info.main,
        draft: theme.palette.grey[400],
    }

    const chartData = {
        labels: ordersByStatus.map(item => item.status.charAt(0).toUpperCase() + item.status.slice(1)),
        datasets: [
            {
                data: ordersByStatus.map(item => item.count),
                backgroundColor: ordersByStatus.map(item => statusColors[item.status.toLowerCase()] || theme.palette.grey[500]),
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
                <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, mb: 3 }}>
                    Order Status
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
                    <Typography color="text.secondary">No order data available</Typography>
                </Box>
            </Paper>
        )
    }

    return (
        <Paper sx={{ p: 3, height: 400 }}>
            <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, mb: 3 }}>
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
            <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, mb: 3 }}>
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
                                        fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize,
                                        fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight
                                    }}
                                >
                                    {index + 1}
                                </Typography>
                                <Box>
                                    <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                                        {product.productName}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
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
                    <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} color="text.secondary" align="center">
                        No product data available
                    </Typography>
                )}
            </Box>
        </Paper>
    )
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
            <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, mb: 3 }}>
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
                                        fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize,
                                        fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight
                                    }}
                                >
                                    {index + 1}
                                </Typography>
                                <Box>
                                    <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                                        {customer.customerName || customer.name}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
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
                    <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} color="text.secondary" align="center">
                        No customer data available
                    </Typography>
                )}
            </Box>
        </Paper>
    )
}
