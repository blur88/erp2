import React from 'react'
import {
    Box,
    Paper,
    Typography,
    Grid,
} from '@mui/material'
import { formatCurrency } from '@/utils/formatters'

interface TopProduct {
    productId: string
    productName: string
    totalRevenue: number
    quantitySold: number
}

interface TopSupplier {
    supplierId: string
    supplierName: string
    totalSpent: number
    orderCount: number
}

interface TopPerformersProps {
    topProducts: TopProduct[]
    topSuppliers: TopSupplier[]
}

const TopPerformers: React.FC<TopPerformersProps> = ({ topProducts, topSuppliers }) => {
    return (
        <Grid container spacing={3}>
            {/* Top Products */}
            <Grid size={{ xs: 12, sm: 6 }}>
                <Paper sx={{ p: 3, height: '100%' }}>
                    <Typography variant="tableHeader" sx={{ fontWeight: 600, mb: 3 }}>
                        Top Selling Products
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {topProducts && topProducts.length > 0 ? (
                            topProducts.map((product, index) => (
                                <Box key={product.productId || index}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Typography
                                                variant="h6"
                                                sx={{
                                                    width: 24,
                                                    height: 24,
                                                    borderRadius: '50%',
                                                    bgcolor: index === 0 ? 'success.main' : index === 1 ? 'primary.main' : 'grey.400',
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
                                                    {product.quantitySold || 0} sold
                                                </Typography>
                                            </Box>
                                        </Box>
                                        <Typography variant="body2" sx={{
                                            color: "success.main"
                                        }}>
                                            {formatCurrency(product.totalRevenue || 0)}
                                        </Typography>
                                    </Box>
                                </Box>
                            ))
                        ) : (
                            <Typography variant="body2" align="center" sx={{
                                color: "text.secondary"
                            }}>
                                No sales data available
                            </Typography>
                        )}
                    </Box>
                </Paper>
            </Grid>
            {/* Top Suppliers */}
            <Grid size={{ xs: 12, sm: 6 }}>
                <Paper sx={{ p: 3, height: '100%' }}>
                    <Typography variant="tableHeader" sx={{ fontWeight: 600, mb: 3 }}>
                        Top Suppliers
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {topSuppliers && topSuppliers.length > 0 ? (
                            topSuppliers.map((supplier, index) => (
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
                                                    fontSize: '0.7rem',
                                                    fontWeight: 600
                                                }}
                                            >
                                                {index + 1}
                                            </Typography>
                                            <Box>
                                                <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                                                    {supplier.supplierName}
                                                </Typography>
                                                <Typography variant="caption" sx={{
                                                    color: "text.secondary"
                                                }}>
                                                    {supplier.orderCount || 0} orders
                                                </Typography>
                                            </Box>
                                        </Box>
                                        <Typography variant="body2" sx={{
                                            color: "warning.main"
                                        }}>
                                            {formatCurrency(supplier.totalSpent || 0)}
                                        </Typography>
                                    </Box>
                                </Box>
                            ))
                        ) : (
                            <Typography variant="body2" align="center" sx={{
                                color: "text.secondary"
                            }}>
                                No supplier data available
                            </Typography>
                        )}
                    </Box>
                </Paper>
            </Grid>
        </Grid>
    );
}

export default TopPerformers
