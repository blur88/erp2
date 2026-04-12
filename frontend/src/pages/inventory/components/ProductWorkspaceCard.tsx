import React, { useEffect, useState } from 'react'
import { Box, Paper, Tab, Tabs } from '@mui/material'

import MovementHistoryTab from '@/components/inventory/MovementHistoryTab'
import OrderHistoryTab from '@/components/inventory/OrderHistoryTab'
import ProductDetailsTab from '@/components/inventory/ProductDetailsTab'
import { TABLE_STYLES } from '@/constants/tableStyles'
import type { Product } from '@/types'

interface ProductWorkspaceCardProps {
  selectedProduct: Product | null
}

const ProductWorkspaceCard: React.FC<ProductWorkspaceCardProps> = ({ selectedProduct }) => {
  const [tabValue, setTabValue] = useState(0)

  const productId = selectedProduct?.id ?? ''

  useEffect(() => {
    setTabValue(0)
  }, [productId])

  if (!selectedProduct) {
    return <Paper sx={{ flex: 1 }} />
  }

  return (
    <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tabValue}
          onChange={(_, value) => setTabValue(value)}
          sx={{
            minHeight: 40,
            '& .MuiTab-root': {
              minHeight: 40,
              fontSize: '0.8rem',
              textTransform: 'none',
              fontWeight: 600,
            },
          }}
        >
          <Tab label="Details" />
          <Tab label="Movement History" />
          <Tab label="Order History" />
        </Tabs>
      </Box>

      <Box
        role="tabpanel"
        sx={{
          flex: 1,
          overflow: 'auto',
          display: tabValue === 0 ? 'flex' : 'none',
          flexDirection: 'column',
        }}
      >
        {tabValue === 0 && (
          <Box sx={{ p: TABLE_STYLES.cell.padding.px, flex: 1 }}>
            <ProductDetailsTab product={selectedProduct} />
          </Box>
        )}
      </Box>

      <Box
        role="tabpanel"
        sx={{
          flex: 1,
          overflow: 'hidden',
          display: tabValue === 1 ? 'flex' : 'none',
          flexDirection: 'column',
        }}
      >
        {tabValue === 1 && <MovementHistoryTab productId={selectedProduct.id} />}
      </Box>

      <Box
        role="tabpanel"
        sx={{
          flex: 1,
          overflow: 'hidden',
          display: tabValue === 2 ? 'flex' : 'none',
          flexDirection: 'column',
        }}
      >
        {tabValue === 2 && <OrderHistoryTab productId={selectedProduct.id} />}
      </Box>
    </Paper>
  )
}

export default ProductWorkspaceCard
