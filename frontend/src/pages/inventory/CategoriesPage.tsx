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
  Category as CategoryIcon,
} from '@mui/icons-material'

const CategoriesPage: React.FC = () => {
  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
            Categories
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Organize your products with categories
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          size="large"
        >
          Add Category
        </Button>
      </Box>

      {/* Coming Soon */}
      <Paper sx={{ p: 6, textAlign: 'center' }}>
        <CategoryIcon sx={{ fontSize: 80, color: 'text.disabled', mb: 2 }} />
        <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
          Category Management Coming Soon
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          Hierarchical category management with drag-and-drop organization
          and bulk product assignment features will be available soon.
        </Typography>
        <Chip label="In Development" color="primary" variant="outlined" />
      </Paper>
    </Box>
  )
}

export default CategoriesPage