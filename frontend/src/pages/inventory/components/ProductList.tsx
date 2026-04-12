import React, { memo } from 'react'
import {
  Box,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { Product } from '@/types'

interface ProductRowProps {
  product: Product
  index: number
  selectedProductId: string | undefined
  focusedIndex: number
  onSelect: (product: Product) => void
}

const ProductRow = memo(({ product, index, selectedProductId, focusedIndex, onSelect }: ProductRowProps) => {
  const isSelected = selectedProductId === product.id
  const isFocused = index === focusedIndex

  return (
    <TableRow
      hover
      onClick={() => onSelect(product)}
      data-product-index={index}
      sx={{
        cursor: 'pointer',
        backgroundColor: isSelected ? 'action.selected' : isFocused ? 'action.focus' : 'inherit',
        '&:hover': {
          backgroundColor: isSelected ? 'action.selected' : 'action.hover',
        },
        transition: 'background-color 0.2s ease',
        height: TABLE_STYLES.row.height,
        ...(isFocused && {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: '-2px',
        }),
      }}
    >
      <TableCell>
        <Typography variant="body2" sx={{ fontWeight: 400, fontSize: '0.8rem', lineHeight: 1.2 }}>
          {product.name}
        </Typography>
      </TableCell>
    </TableRow>
  )
})

ProductRow.displayName = 'ProductRow'

interface ProductListProps {
  products: Product[]
  loading: boolean
  selectedProductId?: string
  focusedIndex: number
  onSelect: (product: Product) => void
  productListRef: React.RefObject<HTMLDivElement | null>
}

const ProductList: React.FC<ProductListProps> = ({
  products,
  loading,
  selectedProductId,
  focusedIndex,
  onSelect,
  productListRef,
}) => {
  return (
    <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography
            variant="tableHeader"
            sx={{
              fontWeight: 600,
              fontSize: '0.8rem',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Products ({products.length})
          </Typography>
          {loading && products.length > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Searching...
              </Typography>
              <Box sx={{ width: 16, height: 16 }}>
                <Skeleton variant="circular" width={16} height={16} />
              </Box>
            </Box>
          )}
        </Box>
      </Box>
      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} ref={productListRef}>
        <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
          <Table
            size={TABLE_STYLES.size}
            sx={{
              '& .MuiTableCell-root': {
                borderBottom: TABLE_STYLES.cell.border,
                py: TABLE_STYLES.cell.padding.py * 0.75,
                px: TABLE_STYLES.cell.padding.px * 0.75,
              },
            }}
          >
            <TableBody>
              {loading && products.length === 0
                ? [...Array(10)].map((_, index) => (
                    <TableRow key={`skeleton-${index}`}>
                      <TableCell>
                        <Skeleton height={40} />
                      </TableCell>
                    </TableRow>
                  ))
                : products.length === 0
                  ? (
                      <TableRow>
                        <TableCell>
                          <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', py: 2 }}>
                            No products found
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )
                  : products.map((product, index) => (
                      <ProductRow
                        key={product.id}
                        product={product}
                        index={index}
                        selectedProductId={selectedProductId}
                        focusedIndex={focusedIndex}
                        onSelect={onSelect}
                      />
                    ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Paper>
  )
}

export default ProductList
