import React from 'react'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'
import { Box, Paper, Typography } from '@mui/material'

import { AppButton } from '@/components/common/AppButton'
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
      <Box
        sx={{
          p: TABLE_STYLES.cell.padding.px,
          borderBottom: TABLE_STYLES.cell.border,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Typography
          variant="tableHeader"
          sx={{
            fontWeight: 600,
            fontSize: '0.8rem',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Product - {selectedProduct.name}
        </Typography>
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
      </Box>
    </Paper>
  )
}

export default ProductContextHeader
