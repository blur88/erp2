import React from 'react'
import { Box, Typography, Paper, Chip } from '@mui/material'

const OrdersPage: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 4 }}>Orders</Typography>
      <Paper sx={{ p: 6, textAlign: 'center' }}>
        <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>Orders Coming Soon</Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>This module is under development.</Typography>
        <Chip label="In Development" color="primary" variant="outlined" />
      </Paper>
    </Box>
  )
}

export default OrdersPage
