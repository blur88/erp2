import React from 'react'
import {
    Box,
    Paper,
    Typography,
    Chip,
    Grid,
    useTheme,
} from '@mui/material'
import { Warning as WarningIcon } from '@mui/icons-material'
import { Doughnut } from 'react-chartjs-2'
import { TYPOGRAPHY_STYLES } from '@/constants/typography'

interface StockHealthMetrics {
    inStockPercentage: number
    outOfStockPercentage: number
}

interface LowStockItem {
    id: string
    name: string
}

interface InventoryOverviewProps {
    stockHealthMetrics: StockHealthMetrics
    lowStockItems: LowStockItem[]
    totalProducts: number
    totalCategories: number
    outOfStockCount: number
}

const InventoryOverview: React.FC<InventoryOverviewProps> = ({
    stockHealthMetrics,
    lowStockItems,
    totalProducts,
    totalCategories,
    outOfStockCount,
}) => {
    const theme = useTheme()

    const stockHealthData = {
        labels: ['In Stock', 'Out of Stock'],
        datasets: [
            {
                data: [
                    stockHealthMetrics?.inStockPercentage || 100,
                    stockHealthMetrics?.outOfStockPercentage || 0
                ],
                backgroundColor: [
                    theme.palette.success.main,
                    theme.palette.error.main
                ],
                borderWidth: 2,
                borderColor: theme.palette.background.paper
            }
        ]
    }

    const doughnutOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom' as const,
            },
            tooltip: {
                callbacks: {
                    label: function (context: any) {
                        const label = context.label || ''
                        const value = context.parsed || 0
                        return `${label}: ${value.toFixed(1)}%`
                    }
                }
            }
        }
    }

    return (
        <Grid container spacing={3}>
            {/* Stock Health */}
            <Grid size={{ xs: 12, sm: 6 }}>
                <Paper sx={{ p: 3, height: '100%' }}>
                    <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, mb: 2 }}>
                        Stock Health
                    </Typography>
                    <Box sx={{ height: 150 }}>
                        <Doughnut data={stockHealthData} options={doughnutOptions} />
                    </Box>
                    <Box sx={{ mt: 1, textAlign: 'center' }}>
                        <Typography variant="caption" color="text.secondary">
                            {totalProducts} products • {totalCategories} categories
                        </Typography>
                    </Box>
                </Paper>
            </Grid>

            {/* Low Stock Alerts */}
            <Grid size={{ xs: 12, sm: 6 }}>
                <Paper sx={{ p: 3, height: '100%' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                        <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight }}>
                            Stock Alerts
                        </Typography>
                        {outOfStockCount > 0 && (
                            <Chip
                                icon={<WarningIcon sx={{ fontSize: 14 }} />}
                                label={`${outOfStockCount} items`}
                                color="error"
                                size="small"
                            />
                        )}
                    </Box>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {lowStockItems && lowStockItems.length > 0 ? (
                            lowStockItems.map((item, index) => (
                                <Box
                                    key={item.id || index}
                                    sx={{
                                        p: 1.5,
                                        borderRadius: 1,
                                        bgcolor: 'error.light',
                                        border: '1px solid',
                                        borderColor: 'error.main',
                                    }}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                                            {item.name || 'Unknown Product'}
                                        </Typography>
                                        <Chip
                                            label="Out of Stock"
                                            color="error"
                                            size="small"
                                            sx={{
                                                fontSize: TYPOGRAPHY_STYLES.chip.small.fontSize,
                                                fontWeight: TYPOGRAPHY_STYLES.chip.small.fontWeight,
                                                height: TYPOGRAPHY_STYLES.chip.small.height
                                            }}
                                        />
                                    </Box>
                                </Box>
                            ))
                        ) : (
                            <Box sx={{ textAlign: 'center', py: 3 }}>
                                <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} color="success.main">
                                    All products are in stock
                                </Typography>
                            </Box>
                        )}
                    </Box>
                </Paper>
            </Grid>
        </Grid>
    )
}

export default InventoryOverview
