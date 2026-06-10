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
import { Product, PriceListItem } from '@/types'
import { formatCurrency } from '@/utils/currency'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { useGetProductPriceListItemsQuery } from '@/store/api/priceListApi'
import { useGetRegionalSettingsQuery } from '@/store/api/settingsApi'
import { StatusChip } from '@/components/common/StatusChip'
import { getStockStatus } from '@/utils/stockUtils'

interface ProductDetailsTabProps {
  product: Product
}

const ProductDetailsTab: React.FC<ProductDetailsTabProps> = ({ product }) => {
  const { data: priceListItems = [], isLoading: loading } = useGetProductPriceListItemsQuery(product.id)
  const { data: regionalSettings } = useGetRegionalSettingsQuery()
  const lowStockThreshold = regionalSettings?.lowStockThreshold ?? 10

  // Calculate margin for a price
  const calculateMargin = (price: number, baseCost: number): number => {
    if (!price || !baseCost || baseCost === 0) return 0
    return ((price - baseCost) / price) * 100
  }

  // Get margin color based on value
  const getMarginColor = (margin: number): 'success' | 'warning' | 'error' => {
    if (margin > 20) return 'success'
    if (margin > 10) return 'warning'
    return 'error'
  }

  return (
    <Box>
      <Grid container spacing={3}>
        {/* Left Column - Basic Information */}
        <Grid
          size={{
            xs: 12,
            md: 6
          }}>
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
                      fontWeight: 600,
                      color: 'primary.main',
                      fontSize: '0.8rem'
                    }}>
                      Basic Information
                    </Typography>
                  </TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={{
                    fontWeight: 600,
                    color: 'text.secondary',
                    fontSize: '0.8rem'
                  }}>
                    Product Name
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.8rem' }}>
                    {product.name}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                    Barcode
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.8rem' }}>
                    {product.barcode || 'No barcode'}
                  </TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                    Type
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.8rem' }}>
                    {product.type === 'Stocked Product' ? 'Stocked Product' : 'Service'}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                    Category
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.8rem' }}>
                    {product.category?.name || 'No Category'}
                  </TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                    Description
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.8rem' }}>
                    {product.description || 'No description'}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Grid>

        {/* Right Column - Pricing Information */}
        <Grid
          size={{
            xs: 12,
            md: 6
          }}>
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
                      fontWeight: 600,
                      color: 'primary.main',
                      fontSize: '0.8rem'
                    }}>
                      Pricing & Margins
                    </Typography>
                  </TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                    Base Cost
                  </TableCell>
                  <TableCell colSpan={2} sx={{ fontSize: '0.8rem' }}>
                    {formatCurrency(product.baseCost)}
                  </TableCell>
                </TableRow>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={3} sx={{ textAlign: 'center', fontSize: '0.8rem' }}>
                      Loading price lists...
                    </TableCell>
                  </TableRow>
                ) : priceListItems.length > 0 ? (
                  priceListItems.map((item, index) => {
                    const marginValue = item.marginPercent || calculateMargin(item.price, product.baseCost || 0)
                    const margin = typeof marginValue === 'string' ? parseFloat(marginValue) : Number(marginValue) || 0
                    const isEvenRow = index % 2 === 0

                    return (
                      <TableRow key={item.id} sx={{ backgroundColor: isEvenRow ? 'transparent' : 'grey.50' }}>
                        <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                          {item.priceList?.name || 'Unknown'} Price
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem' }}>
                          {formatCurrency(item.price)}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem' }}>
                          {item.price > 0 && (
                            <Chip
                              label={`${margin.toFixed(1)}%`}
                              size="small"
                              variant="outlined"
                              color={getMarginColor(margin)}
                              sx={{
                                fontSize: '0.65rem',
                                fontWeight: 600,
                                height: 18,
                                minWidth: 42
                              }}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={3} sx={{ textAlign: 'center', fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>
                      No price lists configured for this product
                    </TableCell>
                  </TableRow>
                )}

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
        <Grid
          size={{
            xs: 12,
            md: 6
          }}>
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
                      fontWeight: 600,
                      color: 'primary.main',
                      fontSize: '0.8rem'
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
                          fontSize: '0.8rem',
                          lineHeight: 1.4,
                          whiteSpace: 'pre-wrap'
                        }}>
                          {product.notes}
                        </Typography>
                      ) : (
                        <Typography
                          variant="body2"
                          sx={{
                            color: "text.secondary",
                            fontSize: '0.7rem',
                            fontStyle: 'italic'
                          }}>
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
        <Grid
          size={{
            xs: 12,
            md: 6
          }}>
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
                      fontWeight: 600,
                      color: 'primary.main',
                      fontSize: '0.8rem'
                    }}>
                      Stock Information
                    </Typography>
                  </TableCell>
                </TableRow>
                <TableRow sx={{ backgroundColor: 'grey.50' }}>
                  <TableCell sx={{ fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }}>
                    Current Stock
                  </TableCell>
                  <TableCell colSpan={2} sx={{ fontSize: '0.8rem' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                        {product.stockQuantity || 0}
                      </Typography>
                      <StatusChip status={getStockStatus(product.stockQuantity || 0, lowStockThreshold)}
                        sx={{
                          fontSize: '0.7rem',
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
  );
}

export default ProductDetailsTab
