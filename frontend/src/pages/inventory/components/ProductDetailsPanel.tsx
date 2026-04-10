import React from 'react'
import { Box, IconButton, Paper, Tab, Tabs, Typography } from '@mui/material'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'

import ProductDetailsTab from '@/components/inventory/ProductDetailsTab'
import MovementHistoryTab from '@/components/inventory/MovementHistoryTab'
import OrderHistoryTab from '@/components/inventory/OrderHistoryTab'
import { TABLE_STYLES } from '@/constants/tableStyles'
import type { Product } from '@/types'

interface ProductDetailsPanelProps {
  products: Product[]
  selectedProduct: Product | null
  currentTab: number
  onTabChange: (value: number) => void
  onEditProduct: (product: Product) => void
  onDeleteProduct: (product: Product) => void
}

const ProductDetailsPanel: React.FC<ProductDetailsPanelProps> = ({
  products,
  selectedProduct,
  currentTab,
  onTabChange,
  onEditProduct,
  onDeleteProduct,
}) => {
  return (
    <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
      {products.length === 0 ? (
        <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Typography
            variant="body1"
            sx={{
              color: "text.secondary",
              textAlign: "center"
            }}>
            No products available. Create your first product to get started.
          </Typography>
        </Box>
      ) : !selectedProduct ? (
        <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Typography
            variant="body1"
            sx={{
              color: "text.secondary",
              textAlign: "center"
            }}>
            Select a product from the list to view its details
          </Typography>
        </Box>
      ) : (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: 1, borderColor: 'divider' }}>
            <Tabs
              value={currentTab}
              onChange={(_, value) => onTabChange(value)}
              sx={{
                minHeight: 40,
                flex: 1,
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
            <Box
              className="product-actions"
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.25,
                pr: TABLE_STYLES.cell.padding.px,
                opacity: 0.7,
                transition: 'opacity 0.2s ease',
              }}
            >
              <IconButton
                size="small"
                title={`Edit ${selectedProduct.name}`}
                aria-label={`Edit product ${selectedProduct.name}`}
                onClick={() => onEditProduct(selectedProduct)}
                sx={{
                  height: `${TABLE_STYLES.row.height * 0.75}px`,
                  width: `${TABLE_STYLES.row.height * 0.75}px`,
                  minHeight: 20,
                  minWidth: 20,
                  p: 0.125,
                  color: 'primary.main',
                  '&:hover': {
                    backgroundColor: 'primary.light',
                    color: 'primary.dark',
                  },
                }}
              >
                <EditIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
              </IconButton>
              <IconButton
                size="small"
                title={`Delete ${selectedProduct.name}`}
                aria-label={`Delete product ${selectedProduct.name}`}
                onClick={() => onDeleteProduct(selectedProduct)}
                sx={{
                  height: `${TABLE_STYLES.row.height * 0.75}px`,
                  width: `${TABLE_STYLES.row.height * 0.75}px`,
                  minHeight: 20,
                  minWidth: 20,
                  p: 0.125,
                  color: 'error.main',
                  '&:hover': {
                    backgroundColor: 'error.light',
                    color: 'error.dark',
                  },
                }}
              >
                <DeleteIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
              </IconButton>
            </Box>
          </Box>

          <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {currentTab === 0 && (
              <Box sx={{ flex: 1, overflow: 'auto', p: TABLE_STYLES.cell.padding.px }}>
                <ProductDetailsTab product={selectedProduct} />
              </Box>
            )}
            {currentTab === 1 && <MovementHistoryTab productId={selectedProduct.id} />}
            {currentTab === 2 && <OrderHistoryTab productId={selectedProduct.id} />}
          </Box>
        </>
      )}
    </Paper>
  );
}

export default ProductDetailsPanel
