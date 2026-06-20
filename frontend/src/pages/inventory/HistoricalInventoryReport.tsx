import React, { useState } from 'react'
import {
  Box,
  Typography,
  Paper,
  Grid,
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
  TablePagination,
  CircularProgress,
  Stack,
  useTheme,
  useMediaQuery,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import { default as PdfIcon } from '@mui/icons-material/PictureAsPdf'
import { default as ExcelIcon } from '@mui/icons-material/TableChart'
import { default as RefreshIcon } from '@mui/icons-material/Refresh'
import { default as GenerateIcon } from '@mui/icons-material/PlayArrow'
import { default as CloseIcon } from '@mui/icons-material/Close'
import { default as KeyboardArrowRightIcon } from '@mui/icons-material/KeyboardArrowRight'
import { default as KeyboardArrowLeftIcon } from '@mui/icons-material/KeyboardArrowLeft'
import { default as KeyboardDoubleArrowRightIcon } from '@mui/icons-material/KeyboardDoubleArrowRight'
import { default as KeyboardDoubleArrowLeftIcon } from '@mui/icons-material/KeyboardDoubleArrowLeft'
import { AppButton } from '@/components/common/AppButton'
import PageHeader from '@/components/common/PageHeader'
import { formatCurrency, formatDate, formatDateTime } from '@/utils/formatters'
import { escapeHtml } from '@/utils/security'
import { printReport } from '@/utils/printReport'
import { exportReportExcel } from '@/utils/exportReport'
import { PAGINATION, TABLE_STYLES } from '@/constants/tableStyles'
import { ApiService } from '@/services/api'
import { useGetProductsQuery, useGetCategoriesQuery } from '@/store/api/inventoryApi'
import { printColors } from '@/styles/printTokens'
import { PRINT_STYLES } from '@/styles/printStyles'

interface HistoricalInventory {
  productName: string
  categoryName: string
  movementDate: string
  movementType: string
  movementDescription: string
  quantity: number
  previousBalance: number
  newBalance: number
  unitValue: number
  totalValue: number
  referenceNumber: string
  referenceType: string
  reason: string
  notes: string
}

const HistoricalInventoryReport: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const [loading, setLoading] = useState(false)
  const [reportData, setReportData] = useState<HistoricalInventory[]>([])
  const [selectedProducts, setSelectedProducts] = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('')

  // Options
  const [targetDate, setTargetDate] = useState<string>('')

  const [productDialogOpen, setProductDialogOpen] = useState(false)
  const [productSearchFilter, setProductSearchFilter] = useState<string>('')
  const [productCategoryFilter, setProductCategoryFilter] = useState<string>('')
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([])
  const [selectedRemovedIds, setSelectedRemovedIds] = useState<string[]>([])
  const [lastClickedProductId, setLastClickedProductId] = useState<string | null>(null)
  const [lastClickedRemovedId, setLastClickedRemovedId] = useState<string | null>(null)

  // Display options
  const [selectedColumns, setSelectedColumns] = useState<string[]>([
    'productName', 'categoryName', 'unitValue', 'quantity', 'totalValue'
  ])
  const [groupBy, setGroupBy] = useState<string>('none')
  const [sortBy1, setSortBy1] = useState<string>('productName')
  const [reportTitle, setReportTitle] = useState<string>('Historical Inventory Report')

  // Pagination
  const [page, setPage] = useState<number>(0)
  const [rowsPerPage, setRowsPerPage] = useState<number>(PAGINATION.defaultPageSize)

  const { data: productsResponse } = useGetProductsQuery({ limit: 10000 })
  const products = productsResponse?.data ?? []

  const { data: categories = [] } = useGetCategoriesQuery(undefined)

  const handleGenerateReport = async () => {
    setLoading(true)
    setPage(0)

    try {
      const params = new URLSearchParams()

      if (selectedCategory) params.append('categoryId', selectedCategory)
      if (selectedProducts.length > 0) {
        selectedProducts.forEach(id => params.append('productIds', id))
      }
      if (targetDate) params.append('endDate', new Date(targetDate).toISOString())

      const result = await ApiService.get<any>(`/inventory/analytics/historical-inventory?${params.toString()}`)
      setReportData(result.data || [])
    } catch (err) {
      console.error('Failed to generate report:', err)
      setReportData([])
    } finally {
      setLoading(false)
    }
  }

  const handleClearFilters = () => {
    setSelectedProducts([])
    setSelectedCategory('')
    setTargetDate('')
    setReportData([])
    setSelectedColumns(['productName', 'categoryName', 'unitValue', 'quantity', 'totalValue'])
    setGroupBy('none')
    setSortBy1('productName')
    setReportTitle('Historical Inventory Report')
    setPage(0)
    setRowsPerPage(25)
  }

  const handleProductClick = (productId: string, event: React.MouseEvent) => {
    const filteredProducts = getFilteredProducts()

    if (event.ctrlKey || event.metaKey) {
      setSelectedProductIds(prev =>
        prev.includes(productId)
          ? prev.filter(id => id !== productId)
          : [...prev, productId]
      )
      setLastClickedProductId(productId)
    } else if (event.shiftKey && lastClickedProductId) {
      const lastIndex = filteredProducts.findIndex((p: any) => p.id === lastClickedProductId)
      const currentIndex = filteredProducts.findIndex((p: any) => p.id === productId)

      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex)
        const end = Math.max(lastIndex, currentIndex)
        const rangeIds = filteredProducts.slice(start, end + 1).map((p: any) => p.id)

        setSelectedProductIds(prev => [...new Set([...prev, ...rangeIds])])
      }
    } else {
      setSelectedProductIds(prev =>
        prev.includes(productId)
          ? prev.filter(id => id !== productId)
          : [...prev, productId]
      )
      setLastClickedProductId(productId)
    }
  }

  const handleSelectedProductClick = (productId: string, event: React.MouseEvent) => {
    const selectedProductsList = getSelectedProductsList()

    if (event.ctrlKey || event.metaKey) {
      setSelectedRemovedIds(prev =>
        prev.includes(productId)
          ? prev.filter(id => id !== productId)
          : [...prev, productId]
      )
      setLastClickedRemovedId(productId)
    } else if (event.shiftKey && lastClickedRemovedId) {
      const lastIndex = selectedProductsList.findIndex((p: any) => p.id === lastClickedRemovedId)
      const currentIndex = selectedProductsList.findIndex((p: any) => p.id === productId)

      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex)
        const end = Math.max(lastIndex, currentIndex)
        const rangeIds = selectedProductsList.slice(start, end + 1).map((p: any) => p.id)

        setSelectedRemovedIds(prev => [...new Set([...prev, ...rangeIds])])
      }
    } else {
      setSelectedRemovedIds(prev =>
        prev.includes(productId)
          ? prev.filter(id => id !== productId)
          : [...prev, productId]
      )
      setLastClickedRemovedId(productId)
    }
  }

  const handleAddSelectedProducts = () => {
    if (selectedProductIds.length > 0) {
      setSelectedProducts(prev => [...new Set([...prev, ...selectedProductIds])])
      setSelectedProductIds([])
    }
  }

  const handleRemoveSelectedProducts = () => {
    if (selectedRemovedIds.length > 0) {
      setSelectedProducts(prev => prev.filter(id => !selectedRemovedIds.includes(id)))
      setSelectedRemovedIds([])
    }
  }

  const handleAddAllProducts = () => {
    const allFilteredIds = getFilteredProducts().map((p: any) => p.id)
    setSelectedProducts(prev => [...new Set([...prev, ...allFilteredIds])])
    setSelectedProductIds([])
  }

  const handleRemoveAllProducts = () => {
    setSelectedProducts([])
    setSelectedRemovedIds([])
  }

  const getFilteredProducts = () => {
    return products.filter((product: any) => {
      const matchesName = !productSearchFilter ||
        product.name.toLowerCase().includes(productSearchFilter.toLowerCase())
      const matchesCategory = !productCategoryFilter ||
        product.categoryId === productCategoryFilter
      const notSelected = !selectedProducts.includes(product.id)
      return matchesName && matchesCategory && notSelected
    })
  }

  const getSelectedProductsList = () => {
    return products.filter((product: any) => selectedProducts.includes(product.id))
  }

  const handleProductDialogClose = () => {
    setProductDialogOpen(false)
    setProductSearchFilter('')
    setProductCategoryFilter('')
    setSelectedProductIds([])
    setSelectedRemovedIds([])
  }

  const handleProductDialogConfirm = () => {
    setProductDialogOpen(false)
    setProductSearchFilter('')
    setProductCategoryFilter('')
    setSelectedProductIds([])
    setSelectedRemovedIds([])
  }

  const handleExportExcel = async () => {
    try {
      const date = new Date().toISOString().split('T')[0]
      await exportReportExcel(
        '/inventory/analytics/historical-inventory/export',
        { productIds: selectedProducts, categoryId: selectedCategory, endDate: targetDate ? new Date(targetDate).toISOString() : undefined },
        `historical-inventory-${date}.xlsx`,
      )
    } catch (err) {
      console.error('Export failed:', err)
    }
  }

  const handleExportPDF = () => {
    if (sortedData.length === 0) return

    const columnHeaders: { [key: string]: string } = {
      productName: 'Products',
      categoryName: 'Category',
      unitValue: 'Average Cost',
      quantity: 'Quantity',
      totalValue: 'Total Cost Value'
    }

    let tableRows = ''
    let prevGroupKey: any = null

    const getPdfGroupKey = (r: any) => {
      return r[groupBy]
    }

    const getPdfGroupLabel = (r: any) => {
      if (groupBy === 'categoryName') {
        return `Category: ${escapeHtml(r.categoryName)}`
      }
      return escapeHtml(r[groupBy])
    }

    sortedData.forEach((row) => {
      const currentGroupKey = groupBy !== 'none' ? getPdfGroupKey(row) : null

      if (groupBy !== 'none' && currentGroupKey !== prevGroupKey) {
        const groupLabel = getPdfGroupLabel(row)
        tableRows += `<tr style="background-color: ${printColors.groupRow}; font-weight: bold;"><td colspan="${selectedColumns.length}">${groupLabel}</td></tr>`
        prevGroupKey = currentGroupKey
      }

      tableRows += '<tr>'
      selectedColumns.forEach(col => {
        let displayValue: any
        let align = ''

        if (col === 'productName' || col === 'categoryName') {
          displayValue = (row as any)[col] || ''
        } else if (col === 'unitValue' || col === 'totalValue') {
          displayValue = formatCurrency((row as any)[col])
          align = 'text-align: right;'
        } else if (col === 'quantity') {
          displayValue = Math.round(row.quantity).toString()
          align = 'text-align: right;'
        } else {
          displayValue = ''
        }

        tableRows += `<td style="${align}">${escapeHtml(displayValue)}</td>`
      })
      tableRows += '</tr>'
    })

    const filterText = []
    if (selectedProducts.length > 0) {
      filterText.push(`<p><strong>Products:</strong> ${selectedProducts.length} selected</p>`)
    }
    if (selectedCategory) {
      const category = categories.find(c => c.id === selectedCategory)
      if (category) {
        filterText.push(`<p><strong>Category:</strong> ${escapeHtml(category.name)}</p>`)
      }
    }
    if (targetDate) {
      filterText.push(`<p><strong>Target Date:</strong> ${escapeHtml(formatDate(targetDate))}</p>`)
    }
    const filtersText = filterText.join('')

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${escapeHtml(reportTitle)}</title>
          <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Roboto:400,500,700&display=swap" />
          <style>${PRINT_STYLES}</style>
        </head>
        <body>
          <h1>${escapeHtml(reportTitle)}</h1>
          <div class="header-info">
            <p style="margin: 5px 0;"><strong>Generated on:</strong> ${formatDateTime(new Date())}</p>
            ${filtersText}
          </div>
          <table>
            <thead>
              <tr>
                ${selectedColumns.map(col => `<th>${escapeHtml(columnHeaders[col] || col)}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </body>
      </html>
    `

    printReport(html, reportTitle)
  }

  const getSortedData = () => {
    if (reportData.length === 0) return []

    let filtered = [...reportData]

    const compareValues = (a: any, b: any, field: string) => {
      let aVal: any = a[field]
      let bVal: any = b[field]

      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.toLowerCase().localeCompare(bVal.toLowerCase())
      }

      // For numeric fields (unitValue, quantity, totalValue), sort descending (largest first)
      if (field === 'unitValue' || field === 'quantity' || field === 'totalValue') {
        return bVal - aVal  // Descending order
      }

      return aVal - bVal  // Ascending order for other fields
    }

    if (groupBy !== 'none') {
      filtered.sort((a, b) => {
        const groupResult = compareValues(a, b, groupBy)
        if (groupResult !== 0) return groupResult

        if (sortBy1 !== 'none') {
          const sortResult = compareValues(a, b, sortBy1)
          if (sortResult !== 0) return sortResult
        }
        return 0
      })
    } else {
      filtered.sort((a, b) => {
        if (sortBy1 !== 'none') {
          const result1 = compareValues(a, b, sortBy1)
          if (result1 !== 0) return result1
        }
        return 0
      })
    }

    return filtered
  }

  const calculateTotals = () => {
    if (reportData.length === 0) return null

    const totals = reportData.reduce(
      (acc, item) => ({
        quantity: acc.quantity + item.quantity,
        totalValue: acc.totalValue + item.totalValue,
      }),
      {
        quantity: 0,
        totalValue: 0,
      }
    )

    return totals
  }

  const totals = calculateTotals()
  const sortedData = getSortedData()
  const paginatedData = sortedData.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)

  const handleChangePage = (_: unknown, newPage: number) => {
    setPage(newPage)
  }

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10))
    setPage(0)
  }

  return (
    <>
      <PageHeader
        variant="report"
        title="Historical Inventory"
        subtitle={reportData.length > 0
          ? `${reportData.length} product${reportData.length !== 1 ? 's' : ''} with historical inventory data`
          : 'View product inventory summary based on stock movements up to a target date'}
        primaryAction={{ label: loading ? 'Generating...' : 'Generate Report', onClick: handleGenerateReport, disabled: loading }}
        secondaryAction={{ label: 'Clear Filters', onClick: handleClearFilters, disabled: loading }}
      />
      {/* Split Layout */}
      <Grid container spacing={3} sx={{ alignItems: 'stretch', height: 'calc(100vh - 220px)' }}>
        {/* Left Side - Filters and Display */}
        <Grid
          sx={{ display: 'flex', height: '100%' }}
          size={{
            xs: 12,
            md: 3
          }}>
          <Stack spacing={2} sx={{ flex: 1, height: '100%', overflow: 'hidden' }}>
            {/* Filters Section */}
            <Paper sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border, flexShrink: 0 }}>
                <Typography variant="tableHeader" sx={{
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Filters
                </Typography>
              </Box>

              <Box sx={{ p: 2, overflow: 'auto', flex: 1 }}>
                <Stack spacing={2}>
                  <FormControl fullWidth size="small" sx={{ '& .MuiInputLabel-root': { fontSize: '0.75rem' }, '& .MuiSelect-select': { fontSize: '0.75rem' } }}>
                    <InputLabel>Products</InputLabel>
                    <Select
                      value={selectedProducts.length > 0 ? 'select' : 'all'}
                      label="Products"
                      onChange={(e) => {
                        if (e.target.value === 'select') {
                          setProductDialogOpen(true)
                        }
                      }}
                      MenuProps={{ slotProps: { paper: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } } }}
                    >
                      <MenuItem value="all">All Products</MenuItem>
                      <MenuItem value="select">Select Products</MenuItem>
                    </Select>
                  </FormControl>

                  {selectedProducts.length > 0 && (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {selectedProducts.map(productId => {
                        const product = products.find((p: any) => p.id === productId)
                        return (
                          <Chip
                            key={productId}
                            label={product?.name || productId}
                            size="small"
                            onDelete={() => {
                              setSelectedProducts(prev => prev.filter(id => id !== productId))
                            }}
                            sx={{ fontSize: '0.7rem' }}
                          />
                        )
                      })}
                    </Box>
                  )}

                  <FormControl fullWidth size="small" sx={{ '& .MuiInputLabel-root': { fontSize: '0.75rem' }, '& .MuiSelect-select': { fontSize: '0.75rem' } }}>
                    <InputLabel>Category</InputLabel>
                    <Select
                      value={selectedCategory}
                      label="Category"
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      MenuProps={{ slotProps: { paper: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } } }}
                    >
                      <MenuItem value="">All Categories</MenuItem>
                      {categories.map((category) => (
                        <MenuItem key={category.id} value={category.id}>
                          {'\u00A0'.repeat((category.level || 0) * 4)}{category.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Stack>
              </Box>
            </Paper>

            {/* Options Section */}
            <Paper sx={{ display: 'flex', flexDirection: 'column', flex: 0.5, overflow: 'hidden' }}>
              <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border, flexShrink: 0 }}>
                <Typography variant="tableHeader" sx={{
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Options
                </Typography>
              </Box>

              <Box sx={{ p: 2, overflow: 'auto', flex: 1 }}>
                <Stack spacing={2}>
                  <TextField
                    label="Target Date"
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    slotProps={{
                      inputLabel: { shrink: true, sx: { fontSize: '0.75rem' } },
                      input: { sx: { fontSize: '0.75rem' } },
                      formHelperText: { sx: { fontSize: '0.65rem' } }
                    }}
                    size="small"
                    fullWidth
                    helperText="Show movements up to this date"
                  />
                </Stack>
              </Box>
            </Paper>

            {/* Display Section */}
            <Paper sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border, flexShrink: 0 }}>
                <Typography variant="tableHeader" sx={{
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Display
                </Typography>
              </Box>

              <Box sx={{ p: 2, overflow: 'auto', flex: 1 }}>
                <Stack spacing={2}>
                  <FormControl fullWidth size="small" sx={{ '& .MuiInputLabel-root': { fontSize: '0.75rem' }, '& .MuiSelect-select': { fontSize: '0.75rem' } }}>
                    <InputLabel>Columns</InputLabel>
                    <Select
                      multiple
                      value={selectedColumns}
                      label="Columns"
                      onChange={(e) => {
                        const value = typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value

                        if (value.includes('all')) {
                          const allColumns = ['productName', 'categoryName', 'unitValue', 'quantity', 'totalValue']
                          if (selectedColumns.length === allColumns.length) {
                            setSelectedColumns([])
                          } else {
                            setSelectedColumns(allColumns)
                          }
                        } else {
                          setSelectedColumns(value as string[])
                        }
                      }}
                      MenuProps={{ slotProps: { paper: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } } }}
                      renderValue={(selected) => `${selected.length} column${selected.length !== 1 ? 's' : ''} selected`}
                    >
                      <MenuItem value="all">All</MenuItem>
                      <MenuItem value="productName">Products</MenuItem>
                      <MenuItem value="categoryName">Category</MenuItem>
                      <MenuItem value="unitValue">Average Cost</MenuItem>
                      <MenuItem value="quantity">Quantity</MenuItem>
                      <MenuItem value="totalValue">Total Cost Value</MenuItem>
                    </Select>
                  </FormControl>

                  <FormControl fullWidth size="small" sx={{ '& .MuiInputLabel-root': { fontSize: '0.75rem' }, '& .MuiSelect-select': { fontSize: '0.75rem' } }}>
                    <InputLabel>Group By</InputLabel>
                    <Select
                      value={groupBy}
                      label="Group By"
                      onChange={(e) => setGroupBy(e.target.value)}
                      MenuProps={{ slotProps: { paper: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } } }}
                    >
                      <MenuItem value="none">None</MenuItem>
                      <MenuItem value="categoryName">Category</MenuItem>
                    </Select>
                  </FormControl>

                  <FormControl fullWidth size="small" sx={{ '& .MuiInputLabel-root': { fontSize: '0.75rem' }, '& .MuiSelect-select': { fontSize: '0.75rem' } }}>
                    <InputLabel>Sort By</InputLabel>
                    <Select
                      value={sortBy1}
                      label="Sort By"
                      onChange={(e) => setSortBy1(e.target.value)}
                      MenuProps={{ slotProps: { paper: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } } }}
                    >
                      <MenuItem value="productName">Products</MenuItem>
                      <MenuItem value="categoryName">Category</MenuItem>
                      <MenuItem value="unitValue">Average Cost</MenuItem>
                      <MenuItem value="quantity">Quantity</MenuItem>
                      <MenuItem value="totalValue">Total Cost Value</MenuItem>
                    </Select>
                  </FormControl>

                  <TextField
                    label="Report Title"
                    value={reportTitle}
                    onChange={(e) => setReportTitle(e.target.value)}
                    slotProps={{
                      inputLabel: { sx: { fontSize: '0.75rem' } },
                      input: { sx: { fontSize: '0.75rem' } }
                    }}
                    size="small"
                    fullWidth
                  />
                </Stack>
              </Box>
            </Paper>
          </Stack>
        </Grid>

        {/* Right Side - Report Preview */}
        <Grid
          sx={{ display: 'flex', height: '100%' }}
          size={{
            xs: 12,
            md: 9
          }}>
          {reportData.length === 0 ? (
            <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', p: 4 }}>
                <Box sx={{ textAlign: 'center', maxWidth: 500 }}>
                  {loading ? (
                    <CircularProgress />
                  ) : (
                    <>
                      <Typography
                        variant="h6"
                        sx={{
                          color: "text.secondary",
                          mb: 1
                        }}>
                        No Report Generated
                      </Typography>
                      <Typography variant="body2" sx={{
                        color: "text.secondary"
                      }}>
                        Configure the filters on the left and click "Generate Report" to view historical inventory movements.
                      </Typography>
                    </>
                  )}
                </Box>
              </Box>
            </Paper>
          ) : (
            <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <Typography variant="tableHeader" sx={{
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Report Preview ({reportData.length} records)
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <AppButton
                    size="filter"
                    startIcon={<ExcelIcon />}
                    onClick={handleExportExcel}
                  >
                    Excel
                  </AppButton>
                  <AppButton
                    size="filter"
                    startIcon={<PdfIcon />}
                    onClick={handleExportPDF}
                  >
                    PDF
                  </AppButton>
                </Box>
              </Box>

              {/* Data Table */}
              <Box sx={{ flex: 1, overflow: 'auto' }}>
                <TableContainer sx={{ height: '100%' }}>
                  <Table
                    size={TABLE_STYLES.size}
                    stickyHeader
                    sx={{
                      minWidth: 'max-content',
                      '& .MuiTableCell-root': {
                        borderBottom: TABLE_STYLES.cell.border,
                        py: TABLE_STYLES.cell.padding.py,
                        px: TABLE_STYLES.cell.padding.px,
                        whiteSpace: 'nowrap'
                      }
                    }}
                  >
                    <TableHead>
                      <TableRow sx={{ '& .MuiTableCell-head': {
                        fontWeight: 600,
                        backgroundColor: theme.palette.action.hover,
                        color: 'text.primary',
                        fontSize: '0.8rem',
                        textAlign: 'center',
                        position: 'sticky',
                        top: 0,
                        zIndex: 10
                      } }}>
                        {selectedColumns.includes('productName') && <TableCell align="center">Products</TableCell>}
                        {selectedColumns.includes('categoryName') && <TableCell align="center">Category</TableCell>}
                        {selectedColumns.includes('unitValue') && <TableCell align="center">Average Cost</TableCell>}
                        {selectedColumns.includes('quantity') && <TableCell align="center">Quantity</TableCell>}
                        {selectedColumns.includes('totalValue') && <TableCell align="center">Total Cost Value</TableCell>}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {paginatedData.map((row, idx) => {
                        const prevRow = idx > 0 ? paginatedData[idx - 1] : null
                        const nextRow = idx < paginatedData.length - 1 ? paginatedData[idx + 1] : null

                        const getGroupKey = (r: any) => {
                          return r[groupBy]
                        }

                        const showGroupHeader = groupBy !== 'none' && (!prevRow || getGroupKey(row) !== getGroupKey(prevRow))
                        const showGroupFooter = groupBy !== 'none' && (!nextRow || getGroupKey(row) !== getGroupKey(nextRow))

                        const getGroupLabel = (field: string, r: any) => {
                          if (field === 'categoryName') {
                            return `Category: ${r.categoryName}`
                          }
                          return r[field]
                        }

                        const calculateGroupSubtotals = () => {
                          if (groupBy === 'none') return null

                          const currentGroupKey = getGroupKey(row)
                          const groupData = paginatedData.filter(r => getGroupKey(r) === currentGroupKey)

                          return {
                            quantity: groupData.reduce((sum, r) => sum + r.quantity, 0),
                            totalValue: groupData.reduce((sum, r) => sum + r.totalValue, 0),
                          }
                        }

                        const groupSubtotals = showGroupFooter ? calculateGroupSubtotals() : null

                        return (
                          <React.Fragment key={idx}>
                            {showGroupHeader && (
                              <TableRow sx={{
                                backgroundColor: theme.palette.action.selected,
                                '& .MuiTableCell-root': {
                                  fontWeight: 700,
                                  fontSize: '0.85rem',
                                  py: 1
                                }
                              }}>
                                <TableCell colSpan={selectedColumns.length}>
                                  {getGroupLabel(groupBy, row)}
                                </TableCell>
                              </TableRow>
                            )}
                            <TableRow
                              hover
                              sx={{
                                '&:hover': { backgroundColor: 'action.hover' },
                                transition: 'background-color 0.2s ease',
                                height: TABLE_STYLES.row.height
                              }}
                            >
                              {selectedColumns.includes('productName') && (
                                <TableCell sx={{ fontSize: '0.8rem' }}>
                                  {row.productName}
                                </TableCell>
                              )}
                              {selectedColumns.includes('categoryName') && (
                                <TableCell sx={{ fontSize: '0.8rem' }}>
                                  {row.categoryName}
                                </TableCell>
                              )}
                              {selectedColumns.includes('unitValue') && (
                                <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                                  {formatCurrency(row.unitValue)}
                                </TableCell>
                              )}
                              {selectedColumns.includes('quantity') && (
                                <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                                  {Math.round(row.quantity)}
                                </TableCell>
                              )}
                              {selectedColumns.includes('totalValue') && (
                                <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                                  {formatCurrency(row.totalValue)}
                                </TableCell>
                              )}
                            </TableRow>
                            {showGroupFooter && groupSubtotals && (
                              <>
                                <TableRow sx={{
                                  backgroundColor: alpha(theme.palette.primary.main, 0.2),
                                  '& .MuiTableCell-root': {
                                    fontWeight: 700,
                                    fontSize: '0.85rem',
                                    borderTop: '2px solid',
                                    borderColor: 'primary.main'
                                  }
                                }}>
                                  {selectedColumns.includes('productName') && (
                                    <TableCell sx={{ fontWeight: 700 }}>
                                      Subtotal
                                    </TableCell>
                                  )}
                                  {selectedColumns.includes('categoryName') && <TableCell />}
                                  {selectedColumns.includes('unitValue') && <TableCell />}
                                  {selectedColumns.includes('quantity') && (
                                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                                      {Math.round(groupSubtotals.quantity)}
                                    </TableCell>
                                  )}
                                  {selectedColumns.includes('totalValue') && (
                                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                                      {formatCurrency(groupSubtotals.totalValue)}
                                    </TableCell>
                                  )}
                                </TableRow>
                                <TableRow sx={{ height: TABLE_STYLES.row.height }}>
                                  <TableCell colSpan={selectedColumns.length} sx={{ border: 'none', padding: 0 }} />
                                </TableRow>
                              </>
                            )}
                          </React.Fragment>
                        )
                      })}
                      {/* Total Row */}
                      {totals && (
                        <TableRow
                          sx={{
                            backgroundColor: alpha(theme.palette.success.main, 0.3),
                            '& .MuiTableCell-root': {
                              fontWeight: 800,
                              fontSize: '0.9rem',
                              borderTop: '3px solid',
                              borderColor: 'success.main'
                            }
                          }}
                        >
                          {selectedColumns.includes('productName') && (
                            <TableCell sx={{ fontWeight: 800 }}>
                              GRAND TOTAL
                            </TableCell>
                          )}
                          {selectedColumns.includes('categoryName') && <TableCell />}
                          {selectedColumns.includes('unitValue') && <TableCell />}
                          {selectedColumns.includes('quantity') && (
                            <TableCell align="right" sx={{ fontWeight: 800 }}>
                              {Math.round(totals.quantity)}
                            </TableCell>
                          )}
                          {selectedColumns.includes('totalValue') && (
                            <TableCell align="right" sx={{ fontWeight: 800 }}>
                              {formatCurrency(totals.totalValue)}
                            </TableCell>
                          )}
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>

              {/* Pagination */}
              {reportData.length > 0 && (
                <Box sx={{ borderTop: TABLE_STYLES.cell.border, flexShrink: 0 }}>
                  <TablePagination
                    component="div"
                    count={sortedData.length}
                    page={page}
                    onPageChange={handleChangePage}
                    rowsPerPage={rowsPerPage}
                    onRowsPerPageChange={handleChangeRowsPerPage}
                    rowsPerPageOptions={PAGINATION.options}
                  />
                </Box>
              )}
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
        slotProps={{
          paper: {
            sx: { height: '90vh', maxHeight: '90vh' }
          }
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
          <AppButton
            size="small"
            onClick={handleProductDialogClose}
            sx={{ minWidth: 'auto', p: 0.5 }}
          >
            <CloseIcon />
          </AppButton>
        </DialogTitle>
        <DialogContent sx={{ p: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Grid container spacing={1} sx={{ flex: 1, minHeight: 0 }}>
            {/* Left Side - Product List */}
            <Grid
              sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}
              size={5.25}>
              <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Product List
                  </Typography>
                </Box>
                <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
                  <Table size="small" stickyHeader sx={{
                    '& .MuiTableCell-root': {
                      fontSize: '0.75rem',
                      py: 0.5,
                      px: 1
                    }
                  }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>Product Name</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Category</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {getFilteredProducts().length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={2} align="center" sx={{ py: 4 }}>
                            <Typography variant="caption" sx={{
                              color: "text.secondary"
                            }}>
                              {products.length === 0 ? 'No products available' : 'No products found'}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ) : (
                        getFilteredProducts().map((product: any) => (
                          <TableRow
                            key={product.id}
                            hover
                            onClick={(e) => handleProductClick(product.id, e)}
                            sx={{
                              cursor: 'pointer',
                              backgroundColor: selectedProductIds.includes(product.id) ? 'primary.light' : 'inherit',
                              '&:hover': {
                                backgroundColor: selectedProductIds.includes(product.id) ? 'primary.light' : 'action.hover'
                              }
                            }}
                          >
                            <TableCell>{product.name}</TableCell>
                            <TableCell>{product.category?.name || '-'}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </Grid>

            {/* Middle - Action Buttons */}
            <Grid
              sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 1.5 }}
              size={1.5}>
              <IconButton
                color="primary"
                onClick={handleAddSelectedProducts}
                disabled={selectedProductIds.length === 0}
                title="Add selected products"
                sx={{
                  bgcolor: 'primary.main',
                  color: 'white',
                  '&:hover': { bgcolor: 'primary.dark' },
                  '&.Mui-disabled': { bgcolor: 'action.disabledBackground', color: 'action.disabled' }
                }}
              >
                <KeyboardArrowRightIcon />
              </IconButton>

              <IconButton
                color="primary"
                onClick={handleAddAllProducts}
                disabled={getFilteredProducts().length === 0}
                title="Add all filtered products"
                sx={{
                  bgcolor: 'primary.main',
                  color: 'white',
                  '&:hover': { bgcolor: 'primary.dark' },
                  '&.Mui-disabled': { bgcolor: 'action.disabledBackground', color: 'action.disabled' }
                }}
              >
                <KeyboardDoubleArrowRightIcon />
              </IconButton>

              <IconButton
                color="error"
                onClick={handleRemoveAllProducts}
                disabled={selectedProducts.length === 0}
                title="Remove all products"
                sx={{
                  border: '1px solid',
                  borderColor: 'error.main',
                  color: 'error.main',
                  '&:hover': { bgcolor: 'error.light' },
                  '&.Mui-disabled': { borderColor: 'action.disabled', color: 'action.disabled' }
                }}
              >
                <KeyboardDoubleArrowLeftIcon />
              </IconButton>

              <IconButton
                onClick={handleRemoveSelectedProducts}
                disabled={selectedRemovedIds.length === 0}
                title="Remove selected products"
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  '&:hover': { bgcolor: 'action.hover' },
                  '&.Mui-disabled': { borderColor: 'action.disabled', color: 'action.disabled' }
                }}
              >
                <KeyboardArrowLeftIcon />
              </IconButton>
            </Grid>

            {/* Right Side - Selected Products */}
            <Grid
              sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}
              size={5.25}>
              <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Selected Products ({selectedProducts.length})
                  </Typography>
                </Box>
                <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
                  <Table size="small" stickyHeader sx={{
                    '& .MuiTableCell-root': {
                      fontSize: '0.75rem',
                      py: 0.5,
                      px: 1
                    }
                  }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>Product Name</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Category</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {getSelectedProductsList().length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={2} align="center" sx={{ py: 4 }}>
                            <Typography variant="caption" sx={{
                              color: "text.secondary"
                            }}>
                              No products selected
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ) : (
                        getSelectedProductsList().map((product: any) => (
                          <TableRow
                            key={product.id}
                            hover
                            onClick={(e) => handleSelectedProductClick(product.id, e)}
                            sx={{
                              cursor: 'pointer',
                              backgroundColor: selectedRemovedIds.includes(product.id) ? 'error.light' : 'inherit',
                              '&:hover': {
                                backgroundColor: selectedRemovedIds.includes(product.id) ? 'error.light' : 'action.hover'
                              }
                            }}
                          >
                            <TableCell>{product.name}</TableCell>
                            <TableCell>{product.category?.name || '-'}</TableCell>
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
              <Grid size={6}>
                <TextField
                  size="small"
                  placeholder="Search by product name..."
                  value={productSearchFilter}
                  onChange={(e) => setProductSearchFilter(e.target.value)}
                  fullWidth
                />
              </Grid>
              <Grid size={6}>
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
                        {'\u00A0'.repeat((category.level || 0) * 4)}{category.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mr: 'auto'
            }}>
            {selectedProducts.length} product{selectedProducts.length !== 1 ? 's' : ''} selected
          </Typography>
          <AppButton variant="secondary" onClick={handleProductDialogClose}>
            Cancel
          </AppButton>
          <AppButton
            variant="primary"
            onClick={handleProductDialogConfirm}
          >
            Apply
          </AppButton>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default HistoricalInventoryReport
