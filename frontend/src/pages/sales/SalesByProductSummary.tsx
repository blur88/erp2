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
} from '@mui/material'
import {
  PictureAsPdf as PdfIcon,
  TableChart as ExcelIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  PlayArrow as GenerateIcon,
  Inventory2 as ProductIcon,
} from '@mui/icons-material'
import { formatCurrency } from '@/utils/formatters'

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
  const [loading, setLoading] = useState(false)
  const [reportData, setReportData] = useState<ProductSummary[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [selectedProduct, setSelectedProduct] = useState<string>('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')

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
    setSelectedProduct('')
    setSelectedCategory('')
    setDateFrom('')
    setDateTo('')
    setReportData([])
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
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        mb: 4,
      }}>
        <Box>
          <Typography variant="h4" sx={{
            fontWeight: 600,
            mb: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 2
          }}>
            <ProductIcon sx={{ fontSize: 40, color: 'primary.main' }} />
            Sales by Product Summary
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Analyze product performance and sales metrics
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleClearFilters}
            disabled={loading}
          >
            Clear Filters
          </Button>
          {reportData.length > 0 && (
            <Button
              variant="contained"
              startIcon={<DownloadIcon />}
              onClick={() => console.log('Export')}
            >
              Export
            </Button>
          )}
        </Box>
      </Box>

      {/* Split Layout */}
      <Grid container spacing={3}>
        {/* Left Side - Filters */}
        <Grid item xs={12} md={3}>
          <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle1" sx={{
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                fontSize: '0.875rem'
              }}>
                Filters
              </Typography>
            </Box>

            <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
              <Stack spacing={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>Product</InputLabel>
                  <Select
                    value={selectedProduct}
                    label="Product"
                    onChange={(e) => setSelectedProduct(e.target.value)}
                  >
                    <MenuItem value="">All Products</MenuItem>
                    {products.map((product) => (
                      <MenuItem key={product.id} value={product.id}>
                        {product.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

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
            <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
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
            <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="subtitle1" sx={{
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  fontSize: '0.875rem'
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
                <Box sx={{ p: 2, bgcolor: 'grey.50', borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Grid container spacing={2}>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="caption" color="text.secondary">
                        Total Quantity
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        {totals.totalQuantitySold.toLocaleString()}
                      </Typography>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="caption" color="text.secondary">
                        Total Revenue
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        {formatCurrency(totals.totalRevenue)}
                      </Typography>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="caption" color="text.secondary">
                        Total Cost
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        {formatCurrency(totals.totalCost)}
                      </Typography>
                    </Grid>
                    <Grid item xs={6} sm={3}>
                      <Typography variant="caption" color="text.secondary">
                        Gross Profit
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700, color: 'success.main' }}>
                        {formatCurrency(totals.grossProfit)}
                      </Typography>
                    </Grid>
                  </Grid>
                </Box>
              )}

              {/* Data Table */}
              <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.100' } }}>
                      <TableCell>Product Name</TableCell>
                      <TableCell>Category</TableCell>
                      <TableCell align="right">Qty Sold</TableCell>
                      <TableCell align="right">Revenue</TableCell>
                      <TableCell align="right">Cost</TableCell>
                      <TableCell align="right">Profit</TableCell>
                      <TableCell align="right">Margin %</TableCell>
                      <TableCell align="right">Orders</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {reportData.map((row) => (
                      <TableRow key={row.productId} hover>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {row.productName}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {row.category}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2">
                            {row.totalQuantitySold.toLocaleString()}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2">
                            {formatCurrency(row.totalRevenue)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2">
                            {formatCurrency(row.totalCost)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" sx={{
                            color: row.grossProfit > 0 ? 'success.main' : 'error.main'
                          }}>
                            {formatCurrency(row.grossProfit)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2">
                            {row.profitMargin.toFixed(2)}%
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2">
                            {row.orderCount}
                          </Typography>
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
    </Box>
  )
}

export default SalesByProductSummary
