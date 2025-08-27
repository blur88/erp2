import React from 'react'
import { Box, Typography, Paper, Button, Chip, Grid, Card, CardContent } from '@mui/material'
import { Add as AddIcon, PointOfSale as SalesIcon, People as CustomersIcon, Receipt as OrdersIcon } from '@mui/icons-material'

const SalesPage: React.FC = () => {
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>Sales Management</Typography>
          <Typography variant="body1" color="text.secondary">Manage customers, orders, and sales</Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} size="large">New Sale</Button>
      </Box>
      
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={4}>
          <Card><CardContent><Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <SalesIcon color="primary" sx={{ fontSize: 40 }} />
            <Box><Typography variant="h5" sx={{ fontWeight: 600 }}>$125,430</Typography>
            <Typography color="text.secondary">Total Sales</Typography></Box>
          </Box></CardContent></Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card><CardContent><Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <CustomersIcon color="secondary" sx={{ fontSize: 40 }} />
            <Box><Typography variant="h5" sx={{ fontWeight: 600 }}>567</Typography>
            <Typography color="text.secondary">Customers</Typography></Box>
          </Box></CardContent></Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card><CardContent><Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <OrdersIcon color="success" sx={{ fontSize: 40 }} />
            <Box><Typography variant="h5" sx={{ fontWeight: 600 }}>1,234</Typography>
            <Typography color="text.secondary">Orders</Typography></Box>
          </Box></CardContent></Card>
        </Grid>
      </Grid>

      <Paper sx={{ p: 6, textAlign: 'center' }}>
        <SalesIcon sx={{ fontSize: 80, color: 'text.disabled', mb: 2 }} />
        <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>Sales Module Coming Soon</Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          Complete sales management including customer management, order processing, invoicing, and payment tracking.
        </Typography>
        <Chip label="In Development" color="primary" variant="outlined" />
      </Paper>
    </Box>
  )
}

export default SalesPage