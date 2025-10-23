import React from 'react'
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Chip,
  useTheme,
  useMediaQuery,
} from '@mui/material'
import { DragIndicator as DragIndicatorIcon } from '@mui/icons-material'
import { Product } from '@/types'
import { formatCurrency } from '@/utils/currency'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'

interface ProductDetailsTabProps {
  product: Product
}

const getStockStatus = (product: Product) => {
  const stock = product.stockQuantity || 0
  const reorderLevel = product.reorderLevel || 0

  if (stock <= 0) {
    return { label: 'Out of Stock', color: 'error' as const }
  } else if (stock <= reorderLevel) {
    return { label: 'Low Stock', color: 'warning' as const }
  } else {
    return { label: 'In Stock', color: 'success' as const }
  }
}

const ProductDetailsTab: React.FC<ProductDetailsTabProps> = ({ product }) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))

  return (
    <TableContainer>
      <Table
        size={TABLE_STYLES.size}
        sx={{
          tableLayout: 'fixed',
          '& .MuiTableCell-root': {
            border: 'none',
            py: TABLE_STYLES.cell.padding.py,
            px: TABLE_STYLES.cell.padding.px,
            ...(isMobile && {
              px: TABLE_STYLES.cell.padding.px * 0.67,
              py: TABLE_STYLES.cell.padding.py * 0.67,
              fontSize: TYPOGRAPHY_STYLES.mobile.caption.fontSize
            }),
            '&:nth-of-type(1)': { width: '35%' }, // Field name column
            '&:nth-of-type(2)': { width: '45%' }, // Value column
            '&:nth-of-type(3)': { width: '20%' }, // Extra info column (margins, status)
          }
        }}
      >
        <TableBody>
          {/* Basic Information Section */}
          <TableRow>
            <TableCell colSpan={3} sx={{
              pb: TABLE_STYLES.cell.padding.py * 0.67,
              py: TABLE_STYLES.cell.padding.py * 0.67,
              borderTop: TABLE_STYLES.cell.border
            }}>
              <Typography variant="h6" sx={{
                fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                color: 'primary.main',
                fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
              }}>
                Basic Information
              </Typography>
            </TableCell>
          </TableRow>
          <TableRow sx={{ backgroundColor: 'grey.50' }}>
            <TableCell sx={{
              fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
              color: 'text.secondary',
              width: isMobile ? '40%' : '35%',
              minWidth: isMobile ? 'auto' : '120px',
              fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <DragIndicatorIcon sx={{ color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize }} />
                Product Name
              </Box>
            </TableCell>
            <TableCell colSpan={2} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
              {product.name}
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <DragIndicatorIcon sx={{ color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize }} />
                Barcode
              </Box>
            </TableCell>
            <TableCell colSpan={2} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
              {product.barcode || 'No barcode'}
            </TableCell>
          </TableRow>
          <TableRow sx={{ backgroundColor: 'grey.50' }}>
            <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <DragIndicatorIcon sx={{ color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize }} />
                Type
              </Box>
            </TableCell>
            <TableCell colSpan={2} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
              {product.type === 'Stocked Product' ? 'Stocked Product' : 'Service'}
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <DragIndicatorIcon sx={{ color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize }} />
                Category
              </Box>
            </TableCell>
            <TableCell colSpan={2} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
              {product.category?.name || 'No Category'}
            </TableCell>
          </TableRow>
          <TableRow sx={{ backgroundColor: 'grey.50' }}>
            <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <DragIndicatorIcon sx={{ color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize }} />
                Description
              </Box>
            </TableCell>
            <TableCell colSpan={2} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
              {product.description || 'No description'}
            </TableCell>
          </TableRow>

          {/* Pricing Information Section */}
          <TableRow>
            <TableCell colSpan={3} sx={{
              pt: TABLE_STYLES.cell.padding.py * 2,
              pb: TABLE_STYLES.cell.padding.py * 0.67,
              borderTop: TABLE_STYLES.cell.border
            }}>
              <Typography variant="h6" sx={{
                fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                color: 'primary.main',
                fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
              }}>
                Pricing Information & Margins
              </Typography>
            </TableCell>
          </TableRow>
          <TableRow sx={{ backgroundColor: 'grey.50' }}>
            <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <DragIndicatorIcon sx={{ color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize }} />
                Base Cost
              </Box>
            </TableCell>
            <TableCell colSpan={2} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
              {formatCurrency(product.baseCost)}
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <DragIndicatorIcon sx={{ color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize }} />
                Retail Price
              </Box>
            </TableCell>
            <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
              <Typography sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                {formatCurrency(product.retailPrice)}
              </Typography>
            </TableCell>
            <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
              {(product.retailPrice !== undefined && product.retailPrice !== null && product.retailPrice > 0) && (
                <Chip
                  label={`${product.grossMarginRetail?.toFixed(1) || '0.0'}%`}
                  size="small"
                  variant="outlined"
                  color={(product.grossMarginRetail || 0) > 20 ? 'success' : (product.grossMarginRetail || 0) > 10 ? 'warning' : 'error'}
                  sx={{
                    fontSize: TYPOGRAPHY_STYLES.chip.extraSmall.fontSize,
                    fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                    height: TYPOGRAPHY_STYLES.chip.extraSmall.height,
                    minWidth: 42
                  }}
                />
              )}
            </TableCell>
          </TableRow>
          <TableRow sx={{ backgroundColor: 'grey.50' }}>
            <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <DragIndicatorIcon sx={{ color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize }} />
                Wholesale Price
              </Box>
            </TableCell>
            <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
              <Typography sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                {formatCurrency(product.wholesalePrice)}
              </Typography>
            </TableCell>
            <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
              {(product.wholesalePrice !== undefined && product.wholesalePrice !== null && product.wholesalePrice > 0) && (
                <Chip
                  label={`${product.grossMarginWholesale?.toFixed(1) || '0.0'}%`}
                  size="small"
                  variant="outlined"
                  color={(product.grossMarginWholesale || 0) > 15 ? 'success' : (product.grossMarginWholesale || 0) > 5 ? 'warning' : 'error'}
                  sx={{
                    fontSize: TYPOGRAPHY_STYLES.chip.extraSmall.fontSize,
                    fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                    height: TYPOGRAPHY_STYLES.chip.extraSmall.height,
                    minWidth: 42
                  }}
                />
              )}
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <DragIndicatorIcon sx={{ color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize }} />
                Special Price
              </Box>
            </TableCell>
            <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
              <Typography sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                {formatCurrency(product.specialPrice)}
              </Typography>
            </TableCell>
            <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
              {(product.specialPrice !== undefined && product.specialPrice !== null && product.specialPrice > 0) && (
                <Chip
                  label={`${product.grossMarginSpecial?.toFixed(1) || '0.0'}%`}
                  size="small"
                  variant="outlined"
                  color={(product.grossMarginSpecial || 0) > 15 ? 'success' : (product.grossMarginSpecial || 0) > 5 ? 'warning' : 'error'}
                  sx={{
                    fontSize: TYPOGRAPHY_STYLES.chip.extraSmall.fontSize,
                    fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                    height: TYPOGRAPHY_STYLES.chip.extraSmall.height,
                    minWidth: 42
                  }}
                />
              )}
            </TableCell>
          </TableRow>

          {/* Stock Information Section */}
          <TableRow>
            <TableCell colSpan={3} sx={{
              pt: TABLE_STYLES.cell.padding.py * 2,
              pb: TABLE_STYLES.cell.padding.py * 0.67,
              borderTop: TABLE_STYLES.cell.border
            }}>
              <Typography variant="h6" sx={{
                fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                color: 'primary.main',
                fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
              }}>
                Stock Information
              </Typography>
            </TableCell>
          </TableRow>
          <TableRow sx={{ backgroundColor: 'grey.50' }}>
            <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <DragIndicatorIcon sx={{ color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize }} />
                Current Stock
              </Box>
            </TableCell>
            <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
              <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                {product.stockQuantity || 0}
              </Typography>
            </TableCell>
            <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
              <Chip
                label={getStockStatus(product).label}
                color={getStockStatus(product).color}
                size="small"
                variant="outlined"
                sx={{
                  fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize,
                  fontWeight: 500,
                  height: 20
                }}
              />
            </TableCell>
          </TableRow>

          {/* Notes Section */}
          <TableRow>
            <TableCell colSpan={3} sx={{
              pt: TABLE_STYLES.cell.padding.py * 2,
              pb: TABLE_STYLES.cell.padding.py * 0.67,
              borderTop: TABLE_STYLES.cell.border
            }}>
              <Typography variant="h6" sx={{
                fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                color: 'primary.main',
                fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
              }}>
                Notes & Additional Information
              </Typography>
            </TableCell>
          </TableRow>
          <TableRow sx={{ backgroundColor: 'grey.50' }}>
            <TableCell colSpan={3} sx={{ p: TABLE_STYLES.cell.padding.px }}>
              <Box sx={{
                minHeight: 80,
                border: product.notes ? 'none' : '1px dashed rgba(0, 0, 0, 0.12)',
                borderRadius: 1,
                display: 'flex',
                alignItems: product.notes ? 'flex-start' : 'center',
                justifyContent: product.notes ? 'flex-start' : 'center',
                backgroundColor: 'grey.50',
                p: product.notes ? 1 : 0
              }}>
                {product.notes ? (
                  <Typography variant="body2" sx={{
                    fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize,
                    lineHeight: 1.4,
                    whiteSpace: 'pre-wrap'
                  }}>
                    {product.notes}
                  </Typography>
                ) : (
                  <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} color="text.secondary" sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize, fontStyle: 'italic' }}>
                    No notes available
                  </Typography>
                )}
              </Box>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </TableContainer>
  )
}

export default ProductDetailsTab
