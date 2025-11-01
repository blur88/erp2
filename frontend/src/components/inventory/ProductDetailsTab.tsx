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
  Grid,
} from '@mui/material'
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
  return (
    <Box>
      <Grid container spacing={3}>
        {/* Left Column - Basic Information */}
        <Grid item xs={12} md={6}>
          <TableContainer>
            <Table
              size={TABLE_STYLES.size}
              sx={{
                tableLayout: 'fixed',
                '& .MuiTableCell-root': {
                  border: 'none',
                  py: TABLE_STYLES.cell.padding.py,
                  px: TABLE_STYLES.cell.padding.px,
                  '&:nth-of-type(1)': { width: '40%' }, // Field name column
                  '&:nth-of-type(2)': { width: '60%' }, // Value column
                }
              }}
            >
              <TableBody>
                {/* Basic Information Section */}
                <TableRow>
                  <TableCell colSpan={2} sx={{
                    pb: TABLE_STYLES.cell.padding.py * 0.67,
                    py: TABLE_STYLES.cell.padding.py * 0.67
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
                    fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize
                  }}>
                    Product Name
                  </TableCell>
                  <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                    {product.name}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                    Barcode
                  </TableCell>
                  <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                    {product.barcode || 'No barcode'}
                  </TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                    Type
                  </TableCell>
                  <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                    {product.type === 'Stocked Product' ? 'Stocked Product' : 'Service'}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                    Category
                  </TableCell>
                  <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                    {product.category?.name || 'No Category'}
                  </TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                    Description
                  </TableCell>
                  <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                    {product.description || 'No description'}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Grid>

        {/* Right Column - Pricing Information */}
        <Grid item xs={12} md={6}>
          <TableContainer>
            <Table
              size={TABLE_STYLES.size}
              sx={{
                tableLayout: 'fixed',
                '& .MuiTableCell-root': {
                  border: 'none',
                  py: TABLE_STYLES.cell.padding.py,
                  px: TABLE_STYLES.cell.padding.px,
                  '&:nth-of-type(1)': { width: '50%' }, // Field name column
                  '&:nth-of-type(2)': { width: '30%' }, // Price column
                  '&:nth-of-type(3)': { width: '20%' }, // Margin column
                }
              }}
            >
              <TableBody>
                {/* Pricing Information Section */}
                <TableRow>
                  <TableCell colSpan={3} sx={{
                    pb: TABLE_STYLES.cell.padding.py * 0.67,
                    py: TABLE_STYLES.cell.padding.py * 0.67
                  }}>
                    <Typography variant="h6" sx={{
                      fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                      color: 'primary.main',
                      fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                    }}>
                      Pricing & Margins
                    </Typography>
                  </TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                    Base Cost
                  </TableCell>
                  <TableCell colSpan={2} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                    {formatCurrency(product.baseCost)}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, color: 'text.secondary', fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                    Retail Price
                  </TableCell>
                  <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                    {formatCurrency(product.retailPrice)}
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
                    Wholesale Price
                  </TableCell>
                  <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                    {formatCurrency(product.wholesalePrice)}
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
                    Special Price
                  </TableCell>
                  <TableCell sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                    {formatCurrency(product.specialPrice)}
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

              </TableBody>
            </Table>
          </TableContainer>
        </Grid>
      </Grid>

      {/* Page Break - Full Width */}
      <Box sx={{
        borderTop: '2px solid',
        borderColor: 'divider',
        my: TABLE_STYLES.cell.padding.py * 2
      }} />

      <Grid container spacing={3}>
        {/* Left Column - Notes */}
        <Grid item xs={12} md={6}>
          <TableContainer>
            <Table
              size={TABLE_STYLES.size}
              sx={{
                tableLayout: 'fixed',
                '& .MuiTableCell-root': {
                  border: 'none',
                  py: TABLE_STYLES.cell.padding.py,
                  px: TABLE_STYLES.cell.padding.px,
                  '&:nth-of-type(1)': { width: '40%' },
                  '&:nth-of-type(2)': { width: '60%' },
                }
              }}
            >
              <TableBody>
                {/* Notes Section */}
                <TableRow>
                  <TableCell colSpan={2} sx={{
                    pb: TABLE_STYLES.cell.padding.py * 0.67,
                    py: TABLE_STYLES.cell.padding.py * 0.67
                  }}>
                    <Typography variant="h6" sx={{
                      fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                      color: 'primary.main',
                      fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                    }}>
                      Notes
                    </Typography>
                  </TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell colSpan={2} sx={{ p: TABLE_STYLES.cell.padding.px }}>
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
        </Grid>

        {/* Right Column - Stock Information */}
        <Grid item xs={12} md={6}>
          <TableContainer>
            <Table
              size={TABLE_STYLES.size}
              sx={{
                tableLayout: 'fixed',
                '& .MuiTableCell-root': {
                  border: 'none',
                  py: TABLE_STYLES.cell.padding.py,
                  px: TABLE_STYLES.cell.padding.px,
                  '&:nth-of-type(1)': { width: '50%' },
                  '&:nth-of-type(2)': { width: '30%' },
                  '&:nth-of-type(3)': { width: '20%' },
                }
              }}
            >
              <TableBody>
                {/* Stock Information Section */}
                <TableRow>
                  <TableCell colSpan={3} sx={{
                    pb: TABLE_STYLES.cell.padding.py * 0.67,
                    py: TABLE_STYLES.cell.padding.py * 0.67
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
                    Current Stock
                  </TableCell>
                  <TableCell colSpan={2} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                        {product.stockQuantity || 0}
                      </Typography>
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
                    </Box>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Grid>
      </Grid>
    </Box>
  )
}

export default ProductDetailsTab
