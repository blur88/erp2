import React from 'react'
import {
  Box,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
} from '@mui/material'
import { DragIndicator as DragIndicatorIcon } from '@mui/icons-material'

import type { Product } from '@/types'
import { TABLE_STYLES } from '@/constants/tableStyles'

interface ProductsTableProps {
  products: Product[]
  loading: boolean
  selectedProductId?: string
  focusedProductIndex: number
  productListRef: React.RefObject<HTMLDivElement | null>
  onFocus: () => void
  onProductSelect: (product: Product, index: number) => void
}

const ProductsTable: React.FC<ProductsTableProps> = ({
  products,
  loading,
  selectedProductId,
  focusedProductIndex,
  productListRef,
  onFocus,
  onProductSelect,
}) => {
  return (
    <Paper sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
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
            Product List ({products.length})
          </Typography>
        </Box>
      </Box>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          '&:focus': {
            outline: '2px solid',
            outlineColor: 'primary.main',
            outlineOffset: '-2px',
          },
        }}
        ref={productListRef}
        tabIndex={0}
        onFocus={onFocus}
      >
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}>
            <CircularProgress />
          </Box>
        ) : products.length === 0 ? (
          <Box sx={{ p: 4, textAlign: 'center', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              No products found. Create your first product to get started.
            </Typography>
          </Box>
        ) : (
          <TableContainer sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <Table
              size={TABLE_STYLES.size}
              stickyHeader
              sx={{
                '& .MuiTableCell-root': {
                  borderBottom: TABLE_STYLES.cell.border,
                  py: TABLE_STYLES.cell.padding.py,
                  px: TABLE_STYLES.cell.padding.px,
                },
              }}
            >
              <TableBody>
                {products.map((product, index) => {
                  const isSelected = selectedProductId === product.id
                  const isFocused = focusedProductIndex === index

                  return (
                    <TableRow
                      key={product.id}
                      data-product-index={index}
                      hover
                      tabIndex={-1}
                      onClick={() => onProductSelect(product, index)}
                      sx={{
                        cursor: 'pointer',
                        backgroundColor: isSelected ? 'action.selected' : isFocused ? 'primary.light' : 'inherit',
                        '&:hover': {
                          backgroundColor: isSelected ? 'action.selected' : isFocused ? 'primary.light' : 'action.hover',
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
                      <TableCell sx={{ py: TABLE_STYLES.cell.padding.py }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <DragIndicatorIcon sx={{ color: 'text.secondary', fontSize: '0.875rem' }} />
                          <Typography
                            variant="body2"
                            sx={{
                              fontSize: '0.8rem',
                              lineHeight: 1.2,
                              fontWeight: 400,
                            }}
                          >
                            {product.name}
                          </Typography>
                        </Box>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </Paper>
  )
}

export default ProductsTable
