import React from 'react'
import { Box, Typography, Paper } from '@mui/material'

const VendorPaymentsPage: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 4 }}>
        Vendor Payments
      </Typography>

      <Paper sx={{ p: 4 }}>
        <Typography variant="body1" color="text.secondary">
          Vendor payments management page
        </Typography>
      </Paper>
    </Box>
  )
}

export default VendorPaymentsPage
