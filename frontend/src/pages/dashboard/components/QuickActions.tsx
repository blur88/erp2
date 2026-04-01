import React from 'react'
import {
    Box,
    Paper,
    Typography,
    Button,
    Grid,
} from '@mui/material'
import {
    Add as AddIcon,
    ShoppingCart as SalesOrderIcon,
    LocalShipping as PurchaseOrderIcon,
    Inventory as ProductIcon,
    PersonAdd as CustomerIcon,
} from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'

const QuickActions: React.FC = () => {
    const navigate = useNavigate()

    const actions = [
        {
            label: 'New Sale',
            icon: SalesOrderIcon,
            color: 'success',
            onClick: () => navigate('/sales/orders/create'),
        },
        {
            label: 'New Purchase',
            icon: PurchaseOrderIcon,
            color: 'warning',
            onClick: () => navigate('/purchasing/orders/create'),
        },
        {
            label: 'Add Product',
            icon: ProductIcon,
            color: 'primary',
            onClick: () => navigate('/inventory/products/create'),
        },
        {
            label: 'New Customer',
            icon: CustomerIcon,
            color: 'info',
            onClick: () => navigate('/sales/customers/create'),
        },
    ]

    return (
        <Paper sx={{ p: 2, mb: 4 }}>
            <Typography
                variant="tableHeader"
                sx={{ fontWeight: 600, mb: 2 }}
            >
                Quick Actions
            </Typography>
            <Grid container spacing={2}>
                {actions.map((action, index) => (
                    <Grid key={index} size={{ xs: 6, sm: 3 }}>
                        <Button
                            variant="outlined"
                            color={action.color as any}
                            startIcon={<action.icon />}
                            onClick={action.onClick}
                            fullWidth
                            sx={{
                                py: 1.5,
                                textTransform: 'none',
                                fontWeight: 500,
                                justifyContent: 'flex-start',
                                borderRadius: 2,
                            }}
                        >
                            {action.label}
                        </Button>
                    </Grid>
                ))}
            </Grid>
        </Paper>
    )
}

export default QuickActions
