import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Paper,
  Grid,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Stack,
  useTheme,
  useMediaQuery,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Checkbox,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Chip,
} from '@mui/material'
import {
  PictureAsPdf as PdfIcon,
  TableChart as ExcelIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  PlayArrow as GenerateIcon,
  Inventory2 as ProductIcon,
  Close as CloseIcon,
} from '@mui/icons-material'
import { formatCurrency } from '@/utils/formatters'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'

interface ProductSummary {
  productId: string
  productName: string
  category: string
  totalQuantitySold: number
  totalRevenue: number
  totalCost: number
  grossProfit: number
  profitMargin: number
  orderCount: number
}

const SalesByProductSummary: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const [loading, setLoading] = useState(false)
  const [reportData, setReportData] = useState<ProductSummary[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [selectedProduct, setSelectedProduct] = useState<string>('all')
  const [selectedProducts, setSelectedProducts] = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [productDialogOpen, setProductDialogOpen] = useState(false)
  const [productSearchFilter, setProductSearchFilter] = useState<string>('')
  const [productCategoryFilter, setProductCategoryFilter] = useState<string>('')

  // Note: API loading disabled - causing page to crash
  // TODO: Fix API loading in useEffect without breaking the page
  // useEffect(() => {
  //   fetch('/api/inventory/products?limit=1000')
  //     .then(res => res.ok ? res.json() : null)
  //     .then(data => { if (data?.data) setProducts(data.data) })
  //     .catch(() => {})
  //   fetch('/api/inventory/categories/tree')
  //     .then(res => res.ok ? res.json() : null)
  //     .then(data => { if (data) setCategories(data) })
  //     .catch(() => {})
  // }, [])

  const handleGenerateReport = async () => {
    setLoading(true)

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 800))

      // Mock data
      const mockData: ProductSummary[] = [
        {
          productId: '1',
          productName: 'Product A',
          category: 'Electronics',
          totalQuantitySold: 150,
          totalRevenue: 45000,
          totalCost: 30000,
          grossProfit: 15000,
          profitMargin: 33.33,
          orderCount: 45
        },
        {
          productId: '2',
          productName: 'Product B',
          category: 'Furniture',
          totalQuantitySold: 85,
          totalRevenue: 34000,
          totalCost: 22000,
          grossProfit: 12000,
          profitMargin: 35.29,
          orderCount: 28
        },
        {
          productId: '3',
          productName: 'Product C',
          category: 'Electronics',
          totalQuantitySold: 200,
          totalRevenue: 60000,
          totalCost: 40000,
          grossProfit: 20000,
          profitMargin: 33.33,
          orderCount: 60
        }
      ]

      setReportData(mockData)
    } catch (err) {
      console.error('Failed to generate report:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleClearFilters = () => {
    setSelectedProduct('all')
    setSelectedProducts([])
    setSelectedCategory('')
    setDateFrom('')
    setDateTo('')
    setReportData([])
  }

  const handleProductSelectChange = (value: string) => {
    if (value === 'select') {
      setProductDialogOpen(true)
    } else {
      setSelectedProduct(value)
      setSelectedProducts([])
    }
  }

  const handleProductToggle = (productId: string) => {
    setSelectedProducts(prev =>
      prev.includes(productId)
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    )
  }

  const handleProductDialogClose = () => {
    setProductDialogOpen(false)
    setProductSearchFilter('')
    setProductCategoryFilter('')
    if (selectedProducts.length === 0) {
      setSelectedProduct('all')
    }
  }

  const handleProductDialogConfirm = () => {
    if (selectedProducts.length > 0) {
      setSelectedProduct('select')
    } else {
      setSelectedProduct('all')
    }
    setProductDialogOpen(false)
    setProductSearchFilter('')
    setProductCategoryFilter('')
  }

  const handleAddProduct = (productId: string) => {
    if (!selectedProducts.includes(productId)) {
      setSelectedProducts(prev => [...prev, productId])
    }
  }

  const handleRemoveProduct = (productId: string) => {
    setSelectedProducts(prev => prev.filter(id => id !== productId))
  }

  const getFilteredProducts = () => {
    return products.filter(product => {
      const matchesName = !productSearchFilter ||
        product.name.toLowerCase().includes(productSearchFilter.toLowerCase())
      const matchesCategory = !productCategoryFilter ||
        product.category?.id === productCategoryFilter
      return matchesName && matchesCategory && !selectedProducts.includes(product.id)
    })
  }

  const getSelectedProductsList = () => {
    return products.filter(product => selectedProducts.includes(product.id))
  }

  const calculateTotals = () => {
    if (reportData.length === 0) return null

    return reportData.reduce(
      (acc, item) => ({
        totalQuantitySold: acc.totalQuantitySold + item.totalQuantitySold,
        totalRevenue: acc.totalRevenue + item.totalRevenue,
        totalCost: acc.totalCost + item.totalCost,
        grossProfit: acc.grossProfit + item.grossProfit,
        orderCount: acc.orderCount + item.orderCount,
      }),
      {
        totalQuantitySold: 0,
        totalRevenue: 0,
        totalCost: 0,
        grossProfit: 0,
        orderCount: 0,
      }
    )
  }

  const totals = calculateTotals()

  return (
    <Box>
      {/* Header */}
      <Box sx={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between',
        alignItems: isMobile ? 'stretch' : 'center',
        mb: 4,
        gap: isMobile ? 2 : 0
      }}>
        <Box sx={{ mb: isMobile ? 2 : 0 }}>
          <Typography variant={isMobile ? TYPOGRAPHY_STYLES.pageHeader.mobileVariant : TYPOGRAPHY_STYLES.pageHeader.variant} sx={{
            fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight,
            mb: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 2
          }}>
            <ProductIcon sx={{
              fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize,
              color: TYPOGRAPHY_STYLES.pageHeader.icon.color
            }} />
            Sales by Product Summary
          </Typography>
          <Typography variant={TYPOGRAPHY_STYLES.pageSubtitle.variant} color={TYPOGRAPHY_STYLES.pageSubtitle.color}>
            {reportData.length > 0
              ? `Product performance report (${reportData.length} products)`
              : 'Analyze product performance and sales metrics'}
          </Typography>
        </Box>
        <Box sx={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: isMobile ? 1.5 : 1,
          alignItems: isMobile ? 'stretch' : 'center'
        }}>
          <Button
            variant="outlined"
            startIcon={!isMobile ? <RefreshIcon /> : undefined}
            onClick={handleClearFilters}
            disabled={loading}
            size={isMobile ? "medium" : "medium"}
            fullWidth={isMobile}
          >
            {isMobile ? "Clear Filters" : "Clear Filters"}
          </Button>
          <Button
            variant="contained"
            startIcon={!isMobile ? <DownloadIcon /> : undefined}
            onClick={() => console.log('Export')}
            disabled={reportData.length === 0}
            size="medium"
            fullWidth={isMobile}
          >
            {isMobile ? "Export" : "Export"}
          </Button>
        </Box>
      </Box>

      {/* Split Layout */}
      <Grid container spacing={3}>
        {/* Left Side - Filters */}
        <Grid item xs={12} md={3}>
          <Paper sx={{ height: 'calc(100vh - 240px)', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
              <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Filters
              </Typography>
            </Box>

            <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
              <Stack spacing={2}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                  SO Date Range
                </Typography>
                <TextField
                  label="Date From"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  size="small"
                  fullWidth
                />

                <TextField
                  label="Date To"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  size="small"
                  fullWidth
                />

                <FormControl fullWidth size="small" sx={{ mt: 2 }}>
                  <InputLabel>Products</InputLabel>
                  <Select
                    value={selectedProduct}
                    label="Products"
                    onChange={(e) => handleProductSelectChange(e.target.value)}
                  >
                    <MenuItem value="all">All Products</MenuItem>
                    <MenuItem value="select">Select Products</MenuItem>
                  </Select>
                </FormControl>

                {selectedProduct === 'select' && selectedProducts.length > 0 && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selectedProducts.map(productId => {
                      const product = products.find(p => p.id === productId)
                      return (
                        <Chip
                          key={productId}
                          label={product?.name || productId}
                          size="small"
                          onDelete={() => handleProductToggle(productId)}
                        />
                      )
                    })}
                  </Box>
                )}

                <FormControl fullWidth size="small">
                  <InputLabel>Category</InputLabel>
                  <Select
                    value={selectedCategory}
                    label="Category"
                    onChange={(e) => setSelectedCategory(e.target.value)}
                  >
                    <MenuItem value="">All Categories</MenuItem>
                    {categories.map((category) => (
                      <MenuItem key={category.id} value={category.id}>
                        {category.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Button
                  variant="contained"
                  startIcon={<GenerateIcon />}
                  onClick={handleGenerateReport}
                  disabled={loading}
                  fullWidth
                  sx={{ mt: 2 }}
                >
                  {loading ? 'Generating...' : 'Generate Report'}
                </Button>
              </Stack>
            </Box>
          </Paper>
        </Grid>

        {/* Right Side - Report Preview */}
        <Grid item xs={12} md={9}>
          {reportData.length === 0 ? (
            <Paper sx={{ height: 'calc(100vh - 240px)', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', p: 4 }}>
                <Box sx={{ textAlign: 'center', maxWidth: 500 }}>
                  {loading ? (
                    <CircularProgress />
                  ) : (
                    <>
                      <ProductIcon sx={{ fontSize: 80, color: 'text.disabled', mb: 2 }} />
                      <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
                        No Report Generated
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Configure the filters on the left and click "Generate Report" to view sales data by product.
                      </Typography>
                    </>
                  )}
                </Box>
              </Box>
            </Paper>
          ) : (
            <Paper sx={{ height: 'calc(100vh - 240px)', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                  fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                  fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Report Preview ({reportData.length} products)
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    size="small"
                    startIcon={<ExcelIcon />}
                    onClick={() => console.log('Export Excel')}
                  >
                    Excel
                  </Button>
                  <Button
                    size="small"
                    startIcon={<PdfIcon />}
                    onClick={() => console.log('Export PDF')}
                  >
                    PDF
                  </Button>
                </Box>
              </Box>

              {/* Summary Stats */}
              {totals && (
                <Box sx={{
                  py: TABLE_STYLES.cell.padding.py,
                  px: TABLE_STYLES.cell.padding.px,
                  bgcolor: 'grey.50',
                  borderBottom: TABLE_STYLES.cell.border
                }}>
                  <Grid container spacing={2}>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                        Total Quantity
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.3 }}>
                        {totals.totalQuantitySold.toLocaleString()}
                      </Typography>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                        Total Revenue
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.3 }}>
                        {formatCurrency(totals.totalRevenue)}
                      </Typography>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                        Total Cost
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.3 }}>
                        {formatCurrency(totals.totalCost)}
                      </Typography>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                        Gross Profit
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.3, color: 'success.main' }}>
                        {formatCurrency(totals.grossProfit)}
                      </Typography>
                    </Grid>
                  </Grid>
                </Box>
              )}

              {/* Data Table */}
              <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
                <Table
                  size={TABLE_STYLES.size}
                  stickyHeader
                  sx={{
                    '& .MuiTableCell-root': {
                      borderBottom: TABLE_STYLES.cell.border,
                      py: TABLE_STYLES.cell.padding.py,
                      px: TABLE_STYLES.cell.padding.px
                    }
                  }}
                >
                  <TableHead>
                    <TableRow sx={{ '& .MuiTableCell-head': {
                      fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                      backgroundColor: 'grey.50',
                      color: TYPOGRAPHY_STYLES.tableHeader.color,
                      fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                    } }}>
                      <TableCell sx={{ width: '25%' }}>Product Name</TableCell>
                      <TableCell sx={{ width: '15%' }}>Category</TableCell>
                      <TableCell align="right" sx={{ width: '10%' }}>Qty Sold</TableCell>
                      <TableCell align="right" sx={{ width: '12.5%' }}>Revenue</TableCell>
                      <TableCell align="right" sx={{ width: '12.5%' }}>Cost</TableCell>
                      <TableCell align="right" sx={{ width: '12.5%' }}>Profit</TableCell>
                      <TableCell align="right" sx={{ width: '7.5%' }}>Margin %</TableCell>
                      <TableCell align="right" sx={{ width: '5%' }}>Orders</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {reportData.map((row) => (
                      <TableRow
                        key={row.productId}
                        hover
                        sx={{
                          '&:hover': { backgroundColor: 'action.hover' },
                          transition: 'background-color 0.2s ease',
                          height: TABLE_STYLES.row.height
                        }}
                      >
                        <TableCell sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                          {row.productName}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.8rem' }}>
                          {row.category}
                        </TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                          {row.totalQuantitySold.toLocaleString()}
                        </TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                          {formatCurrency(row.totalRevenue)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                          {formatCurrency(row.totalCost)}
                        </TableCell>
                        <TableCell align="right" sx={{
                          fontSize: '0.8rem',
                          color: row.grossProfit > 0 ? 'success.main' : 'error.main'
                        }}>
                          {formatCurrency(row.grossProfit)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                          {row.profitMargin.toFixed(2)}%
                        </TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                          {row.orderCount}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}
        </Grid>
      </Grid>

      {/* Product Selection Dialog */}
      <Dialog
        open={productDialogOpen}
        onClose={handleProductDialogClose}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: { height: '90vh', maxHeight: '90vh' }
        }}
      >
        <DialogTitle sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: '1px solid',
          borderColor: 'divider'
        }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Select Products
          </Typography>
          <Button
            size="small"
            onClick={handleProductDialogClose}
            sx={{ minWidth: 'auto', p: 0.5 }}
          >
            <CloseIcon />
          </Button>
        </DialogTitle>
        <DialogContent sx={{ p: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Grid container spacing={2} sx={{ flex: 1, minHeight: 0 }}>
            {/* Left Side - Product List */}
            <Grid item xs={6} sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Product List
                  </Typography>
                </Box>
                <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>Product Name</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Category</TableCell>
                        <TableCell sx={{ fontWeight: 600, width: 80 }}>Action</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {getFilteredProducts().length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} align="center" sx={{ py: 4 }}>
                            <Typography color="text.secondary">
                              {products.length === 0 ? 'No products available' : 'No products found'}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ) : (
                        getFilteredProducts().map((product) => (
                          <TableRow key={product.id} hover>
                            <TableCell>{product.name}</TableCell>
                            <TableCell>{product.category?.name || '-'}</TableCell>
                            <TableCell>
                              <Button
                                size="small"
                                variant="outlined"
                                onClick={() => handleAddProduct(product.id)}
                              >
                                Add
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </Grid>

            {/* Right Side - Selected Products */}
            <Grid item xs={6} sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Selected Products ({selectedProducts.length})
                  </Typography>
                </Box>
                <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>Product Name</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Category</TableCell>
                        <TableCell sx={{ fontWeight: 600, width: 80 }}>Action</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {getSelectedProductsList().length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} align="center" sx={{ py: 4 }}>
                            <Typography color="text.secondary">
                              No products selected
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ) : (
                        getSelectedProductsList().map((product) => (
                          <TableRow key={product.id} hover>
                            <TableCell>{product.name}</TableCell>
                            <TableCell>{product.category?.name || '-'}</TableCell>
                            <TableCell>
                              <Button
                                size="small"
                                variant="outlined"
                                color="error"
                                onClick={() => handleRemoveProduct(product.id)}
                              >
                                Remove
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </Grid>
          </Grid>

          {/* Filter Section at Bottom */}
          <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'divider' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
              Filter Products
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField
                  size="small"
                  placeholder="Search by product name..."
                  value={productSearchFilter}
                  onChange={(e) => setProductSearchFilter(e.target.value)}
                  fullWidth
                />
              </Grid>
              <Grid item xs={6}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Filter by Category</InputLabel>
                  <Select
                    value={productCategoryFilter}
                    label="Filter by Category"
                    onChange={(e) => setProductCategoryFilter(e.target.value)}
                  >
                    <MenuItem value="">All Categories</MenuItem>
                    {categories.map((category) => (
                      <MenuItem key={category.id} value={category.id}>
                        {category.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography variant="body2" color="text.secondary" sx={{ mr: 'auto' }}>
            {selectedProducts.length} product{selectedProducts.length !== 1 ? 's' : ''} selected
          </Typography>
          <Button onClick={handleProductDialogClose}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleProductDialogConfirm}
            disabled={selectedProducts.length === 0}
          >
            Apply
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default SalesByProductSummary
