import React from 'react'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'
import { Box, Paper, Typography } from '@mui/material'

import { AppButton } from '@/components/common/AppButton'
import { EntityContextHeaderBar } from '@/components/common/EntityContextHeaderBar'
import { TABLE_STYLES } from '@/constants/tableStyles'
import type { Product } from '@/types'

interface ProductContextHeaderProps {
  selectedProduct: Product | null
  onEdit: () => void
  onDelete: () => void
}

const ProductContextHeader: React.FC<ProductContextHeaderProps> = ({
  selectedProduct,
  onEdit,
  onDelete,
}) => {
  if (!selectedProduct) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
          Select a product to view details
        </Typography>
      </Paper>
    )
  }

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <EntityContextHeaderBar
        title={`Product Details - ${selectedProduct.name}`}
        actions={(
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <AppButton
              size="small"
              variant="secondary"
              startIcon={<EditIcon />}
              title={`Edit ${selectedProduct.name}`}
              onClick={onEdit}
            >
              Edit
            </AppButton>
            <AppButton
              size="small"
              variant="danger"
              startIcon={<DeleteIcon />}
              title={`Delete ${selectedProduct.name}`}
              onClick={onDelete}
            >
              Delete
            </AppButton>
          </Box>
        )}
      />
    </Paper>
  )
}

export default ProductContextHeader
