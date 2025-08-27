import React from 'react'
import {
  Box,
  Typography,
  Paper,
  Button,
  Chip,
} from '@mui/material'
import {
  Add as AddIcon,
  ShoppingBag as ProductIcon,
} from '@mui/icons-material'

const ProductsPage: React.FC = () => {
  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
            Products
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Manage your product catalog and inventory
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          size="large"
        >
          Add Product
        </Button>
      </Box>

      {/* Coming Soon */}
      <Paper sx={{ p: 6, textAlign: 'center' }}>
        <ProductIcon sx={{ fontSize: 80, color: 'text.disabled', mb: 2 }} />
        <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
          Products Management Coming Soon
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          Advanced product management features including detailed product information,
          pricing, images, and inventory tracking will be available soon.
        </Typography>
        <Chip label="In Development" color="primary" variant="outlined" />
      </Paper>
    </Box>
  )
}

export default ProductsPage