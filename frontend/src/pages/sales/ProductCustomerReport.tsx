import React, { useState, useEffect } from 'react'
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
import PagePagination from '@/components/common/PagePagination'
import { usePagination } from '@/hooks/usePagination'
import { alpha } from '@mui/material/styles'
import { AppButton } from '@/components/common/AppButton'
import { StatusChip } from '@/components/common/StatusChip'
import { default as PdfIcon } from '@mui/icons-material/PictureAsPdf'
import { default as ExcelIcon } from '@mui/icons-material/TableChart'
import { default as RefreshIcon } from '@mui/icons-material/Refresh'
import { default as GenerateIcon } from '@mui/icons-material/PlayArrow'
import { default as CustomerProductIcon } from '@mui/icons-material/PersonSearch'
import { default as CloseIcon } from '@mui/icons-material/Close'
import { default as KeyboardArrowRightIcon } from '@mui/icons-material/KeyboardArrowRight'
import { default as KeyboardArrowLeftIcon } from '@mui/icons-material/KeyboardArrowLeft'
import { default as KeyboardDoubleArrowRightIcon } from '@mui/icons-material/KeyboardDoubleArrowRight'
import { default as KeyboardDoubleArrowLeftIcon } from '@mui/icons-material/KeyboardDoubleArrowLeft'
import PageHeader from '@/components/common/PageHeader'
import { printColors } from '@/styles/printTokens'
import { PRINT_STYLES } from '@/styles/printStyles'
import { formatCurrency, formatDate, formatDateTime } from '@/utils/formatters'
import { escapeHtml } from '@/utils/security'
import { printReport } from '@/utils/printReport'
import { exportReportExcel } from '@/utils/exportReport'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { ApiService } from '@/services/api'

interface ProductCustomerReport {
  productId: string
  productName: string
  categoryName: string
  customerId: string
  customerName: string
  orderId: string
  orderNumber: string
  orderDate: string
  quantity: number
  amount: number
  cost: number
  profit: number
  paymentStatus: string
  inventoryStatus: string
}

const ProductCustomerReport: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const [loading, setLoading] = useState(false)
  const [reportData, setReportData] = useState<ProductCustomerReport[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [selectedProduct, setSelectedProduct] = useState<string>('all')
  const [selectedProducts, setSelectedProducts] = useState<string[]>([])
  const [productDialogOpen, setProductDialogOpen] = useState(false)
  const [productSearchFilter, setProductSearchFilter] = useState<string>('')
  const [productCategoryFilter, setProductCategoryFilter] = useState<string>('')
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([])
  const [selectedRemovedIds, setSelectedRemovedIds] = useState<string[]>([])
  const [lastClickedProductId, setLastClickedProductId] = useState<string | null>(null)
  const [lastClickedRemovedId, setLastClickedRemovedId] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [inventoryStatus, setInventoryStatus] = useState<string>('all')
  const [paymentStatus, setPaymentStatus] = useState<string>('all')

  // Display options
  const [selectedColumns, setSelectedColumns] = useState<string[]>([
    'productName', 'categoryName', 'orderNumber', 'customerName', 'orderDate', 'inventoryStatus', 'paymentStatus', 'quantity', 'amount', 'cost', 'profit'
  ])
  const [groupBy, setGroupBy] = useState<string>('none')
  const [sortBy1, setSortBy1] = useState<string>('productName')
  const [reportTitle, setReportTitle] = useState<string>('Product Customer Report')

  // Pagination
  const { page, limit, reset, setLimit, paginationProps } = usePagination()

  useEffect(() => {
    // Load categories with authentication
    ApiService.get<{ data: any[] }>('/inventory/categories')
      .then(response => {
        if (response?.data) {
          setCategories(response.data)
        }
      })
      .catch(() => {})

    // Load products with authentication
    ApiService.get<{ data: any[] }>('/inventory/products')
      .then(data => {
        if (data?.data) {
          setProducts(data.data)
        }
      })
      .catch(() => {})
  }, [])

  // Reset to first page when filters or display options change
  useEffect(() => {
    reset()
  }, [groupBy, sortBy1, inventoryStatus, paymentStatus, selectedCategory, selectedProducts])

  const handleGenerateReport = async () => {
    setLoading(true)
    reset() // Reset to first page when generating new report

    try {
      // Build query parameters
      const params = new URLSearchParams()

      if (dateFrom) params.append('dateFrom', dateFrom)
      if (dateTo) params.append('dateTo', dateTo)
      if (selectedCategory) params.append('categoryId', selectedCategory)
      if (selectedProducts.length > 0) {
        selectedProducts.forEach(productId => params.append('productIds', productId))
      }
      if (inventoryStatus && inventoryStatus !== 'all') params.append('inventoryStatus', inventoryStatus)
      if (paymentStatus && paymentStatus !== 'all') params.append('paymentStatus', paymentStatus)

      // Call the backend API with authentication
      const data = await ApiService.get<{ data: ProductCustomerReport[] }>(
        `/sales/analytics/product-customer-report?${params.toString()}`
      )
      setReportData(data.data || [])
    } catch (err) {
      console.error('Failed to generate report:', err)
      setReportData([])
    } finally {
      setLoading(false)
    }
  }

  const handleProductSelectChange = (value: string) => {
    if (value === 'select') {
      setProductDialogOpen(true)
      // Initialize selected product IDs with current selections
      setSelectedProductIds([])
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
    setSelectedProductIds([])
    setSelectedRemovedIds([])
    if (selectedProducts.length > 0) {
      setSelectedProduct('select')
    } else {
      setSelectedProduct('all')
    }
  }

  const getFilteredProducts = () => {
    return products.filter(product => {
      // Exclude already selected products
      if (selectedProducts.includes(product.id)) return false

      // Apply search filter
      if (productSearchFilter && !product.name.toLowerCase().includes(productSearchFilter.toLowerCase())) {
        return false
      }

      // Apply category filter
      if (productCategoryFilter && product.category?.id !== productCategoryFilter) {
        return false
      }

      return true
    })
  }

  const handleProductClick = (productId: string, e: React.MouseEvent) => {
    if (e.shiftKey && lastClickedProductId) {
      // Shift+click: select range
      const filteredProducts = getFilteredProducts()
      const startIndex = filteredProducts.findIndex(p => p.id === lastClickedProductId)
      const endIndex = filteredProducts.findIndex(p => p.id === productId)
      if (startIndex !== -1 && endIndex !== -1) {
        const rangeStart = Math.min(startIndex, endIndex)
        const rangeEnd = Math.max(startIndex, endIndex)
        const rangeIds = filteredProducts.slice(rangeStart, rangeEnd + 1).map(p => p.id)
        setSelectedProductIds(prev => Array.from(new Set([...prev, ...rangeIds])))
      }
    } else if (e.ctrlKey || e.metaKey) {
      // Ctrl+click: toggle selection
      setSelectedProductIds(prev =>
        prev.includes(productId) ? prev.filter(id => id !== productId) : [...prev, productId]
      )
    } else {
      // Normal click: select single
      setSelectedProductIds([productId])
    }
    setLastClickedProductId(productId)
  }

  const getSelectedProductsList = () => {
    return products.filter(product => selectedProducts.includes(product.id))
  }

  const handleSelectedProductClick = (productId: string, event: React.MouseEvent) => {
    const selectedProductsList = getSelectedProductsList()

    if (event.ctrlKey || event.metaKey) {
      // Ctrl/Cmd+Click: Toggle individual selection
      setSelectedRemovedIds(prev =>
        prev.includes(productId)
          ? prev.filter(id => id !== productId)
          : [...prev, productId]
      )
      setLastClickedRemovedId(productId)
    } else if (event.shiftKey && lastClickedRemovedId) {
      // Shift+Click: Select range
      const lastIndex = selectedProductsList.findIndex(p => p.id === lastClickedRemovedId)
      const currentIndex = selectedProductsList.findIndex(p => p.id === productId)

      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex)
        const end = Math.max(lastIndex, currentIndex)
        const rangeIds = selectedProductsList.slice(start, end + 1).map(p => p.id)

        setSelectedRemovedIds(prev => Array.from(new Set([...prev, ...rangeIds])))
      }
    } else {
      // Single click: Select only this item
      setSelectedRemovedIds([productId])
      setLastClickedRemovedId(productId)
    }
  }

  const handleAddSelectedProducts = () => {
    setSelectedProducts(prev => Array.from(new Set([...prev, ...selectedProductIds])))
    setSelectedProductIds([])
  }

  const handleAddAllProducts = () => {
    const filteredProducts = getFilteredProducts()
    setSelectedProducts(prev => Array.from(new Set([...prev, ...filteredProducts.map(p => p.id)])))
    setSelectedProductIds([])
  }

  const handleRemoveSelectedProducts = () => {
    setSelectedProducts(prev => prev.filter(id => !selectedRemovedIds.includes(id)))
    setSelectedRemovedIds([])
  }

  const handleRemoveAllProducts = () => {
    setSelectedProducts([])
    setSelectedRemovedIds([])
  }

  const handleClearFilters = () => {
    // Clear filter options
    setSelectedProduct('all')
    setSelectedProducts([])
    setSelectedCategory('')
    setDateFrom('')
    setDateTo('')
    setInventoryStatus('all')
    setPaymentStatus('all')

    // Clear report data
    setReportData([])

    // Reset display options to defaults
    setSelectedColumns(['productName', 'categoryName', 'orderNumber', 'customerName', 'orderDate', 'inventoryStatus', 'paymentStatus', 'quantity', 'amount', 'cost', 'profit'])
    setGroupBy('none')
    setSortBy1('productName')
    setReportTitle('Product Customer Report')

    // Reset pagination
    reset()
    setLimit(25)
  }

  const handleExportExcel = async () => {
    try {
      const date = new Date().toISOString().split('T')[0]
      await exportReportExcel(
        '/sales/analytics/product-customer-report/export',
        { dateFrom, dateTo, categoryId: selectedCategory, productIds: selectedProducts, inventoryStatus, paymentStatus },
        `product-customer-report-${date}.xlsx`,
      )
    } catch (err) {
      console.error('Export failed:', err)
    }
  }

  const handleExportPDF = () => {
    if (sortedData.length === 0) return

    const columnHeaders: { [key: string]: string } = {
      productName: 'Product',
      categoryName: 'Category',
      orderNumber: 'Order No',
      customerName: 'Customer',
      orderDate: 'Order Date',
      inventoryStatus: 'Inventory Status',
      paymentStatus: 'Payment Status',
      quantity: 'Quantity Sold',
      amount: 'Sales Amount',
      cost: 'Sales Cost',
      profit: 'Sales Profit'
    }

    let tableRows = ''
    let prevGroupKey: any = null

    // Helper to get group key for PDF export
    const getPdfGroupKey = (r: any) => {
      if (groupBy === 'categoryProduct') {
        return `${r.categoryName}|${r.productName}`
      }
      return r[groupBy]
    }

    // Helper to get group label for PDF export
    const getPdfGroupLabel = (r: any) => {
      if (groupBy === 'categoryProduct') {
        return `Category: ${escapeHtml(r.categoryName)} | Product: ${escapeHtml(r.productName)}`
      } else if (groupBy === 'categoryName') {
        return `Category: ${escapeHtml(r.categoryName)}`
      }
      return escapeHtml(r[groupBy])
    }

    sortedData.forEach((row, idx) => {
      // Determine current group value
      const currentGroupKey = groupBy !== 'none' ? getPdfGroupKey(row) : null

      // Add group header if group changed
      if (groupBy !== 'none' && currentGroupKey !== prevGroupKey) {
        const groupLabel = getPdfGroupLabel(row)
        tableRows += `<tr style="background-color: ${printColors.groupRow}; font-weight: bold;"><td colspan="${selectedColumns.length}">${groupLabel}</td></tr>`
        prevGroupKey = currentGroupKey
      }

      tableRows += '<tr>'
      selectedColumns.forEach(col => {
        const value = (row as any)[col]
        let displayValue = value
        if (col === 'orderDate') {
          displayValue = value ? formatDate(value) : '-'
        } else if (typeof value === 'number') {
          displayValue = formatCurrency(value)
        } else if (col === 'paymentStatus' || col === 'inventoryStatus') {
          displayValue = value ? value.charAt(0).toUpperCase() + value.slice(1) : ''
        }
        const align = (typeof value === 'number') ? 'text-align: right;' : ''
        tableRows += `<td style="${align}">${escapeHtml(displayValue)}</td>`
      })
      tableRows += '</tr>'

      // Check if we need to add subtotal
      const nextRow = idx < sortedData.length - 1 ? sortedData[idx + 1] : null
      const nextGroupKey = nextRow && groupBy !== 'none' ? getPdfGroupKey(nextRow) : null

      if (groupBy !== 'none' && (!nextRow || currentGroupKey !== nextGroupKey)) {
        // Calculate subtotal for this group
        const groupData = sortedData.filter(r => getPdfGroupKey(r) === currentGroupKey)

        const subtotal = {
          quantity: groupData.reduce((sum, r) => sum + r.quantity, 0),
          amount: groupData.reduce((sum, r) => sum + r.amount, 0),
          cost: groupData.reduce((sum, r) => sum + r.cost, 0),
          profit: groupData.reduce((sum, r) => sum + r.profit, 0),
        }

        tableRows += `<tr style="background-color: ${printColors.infoRow}; font-weight: bold; border-top: 2px solid ${printColors.tableHeaderBg};">`
        selectedColumns.forEach((col, colIdx) => {
          if (colIdx === 0) {
            tableRows += '<td style="font-weight: bold;">Subtotal</td>'
          } else if (col === 'quantity' || col === 'amount' || col === 'cost' || col === 'profit') {
            const value = (subtotal as any)[col]
            tableRows += `<td style="text-align: right; font-weight: bold;">${typeof value === 'number' ? formatCurrency(value) : ''}</td>`
          } else {
            tableRows += '<td></td>'
          }
        })
        tableRows += '</tr>'
        // Blank row after subtotal
        tableRows += `<tr style="height: 20px;"><td colspan="${selectedColumns.length}" style="border: none;"></td></tr>`
      }
    })

    // Add totals
    if (totals) {
      tableRows += `<tr style="background-color: ${printColors.successRow}; font-weight: bold; border-top: 3px solid ${printColors.border};">`
      selectedColumns.forEach((col, idx) => {
        if (idx === 0) {
          tableRows += '<td style="font-weight: 800;">GRAND TOTAL</td>'
        } else if (col === 'quantity' || col === 'totalAmount' || col === 'cost' || col === 'profit') {
          const value = (totals as any)[col]
          tableRows += `<td style="text-align: right; font-weight: 800;">${typeof value === 'number' ? formatCurrency(value) : ''}</td>`
        } else {
          tableRows += '<td></td>'
        }
      })
      tableRows += '</tr>'
    }

    // Build date range text
    let dateRangeText = ''
    if (dateFrom && dateTo) {
      dateRangeText = `<p><strong>Date Range:</strong> ${escapeHtml(formatDate(dateFrom))} - ${escapeHtml(formatDate(dateTo))}</p>`
    } else if (dateFrom) {
      dateRangeText = `<p><strong>Date From:</strong> ${escapeHtml(formatDate(dateFrom))}</p>`
    } else if (dateTo) {
      dateRangeText = `<p><strong>Date To:</strong> ${escapeHtml(formatDate(dateTo))}</p>`
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${escapeHtml(reportTitle)}</title>
          <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Roboto:400,500,700&display=swap" />
          <style>${PRINT_STYLES}
            @media print {
              @page {
                  content: "Page " counter(page) " of " counter(pages);
                }
              }
              .footer {
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                text-align: center;
                font-size: 10px;
                padding: 10px;
                border-top: 1px solid ${printColors.tableBorder};
              }
            }
            .footer {
              display: none;
            }
            @media print {
              .footer {
                display: block;
              }
            }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(reportTitle)}</h1>
          <div class="header-info">
            <p style="margin: 5px 0;"><strong>Generated on:</strong> ${formatDateTime(new Date())}</p>
            ${dateRangeText}
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
          <div class="footer"></div>
        </body>
      </html>
    `

    printReport(html, reportTitle)
  }

  const calculateTotals = () => {
    if (reportData.length === 0) return null

    const totals = reportData.reduce(
      (acc, item) => ({
        quantity: acc.quantity + item.quantity,
        amount: acc.amount + item.amount,
        cost: acc.cost + item.cost,
        profit: acc.profit + item.profit,
      }),
      {
        quantity: 0,
        amount: 0,
        cost: 0,
        profit: 0,
      }
    )

    return totals
  }

  const totals = calculateTotals()

  // Sort and filter the report data
  const getSortedData = () => {
    if (reportData.length === 0) return []

    let filtered = [...reportData]

    const compareValues = (a: any, b: any, field: string) => {
      const aVal = a[field]
      const bVal = b[field]

      // Handle null/undefined
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1

      // Date comparison - ascending (older to newer)
      if (field === 'orderDate') {
        return new Date(aVal).getTime() - new Date(bVal).getTime()
      }

      // String comparison (case-insensitive) - ascending for text
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.toLowerCase().localeCompare(bVal.toLowerCase())
      }

      // Numeric comparison - descending (higher to lower)
      return bVal - aVal
    }

    // Apply grouping first, then sorting
    if (groupBy !== 'none') {
      filtered.sort((a, b) => {
        // Group by the selected field(s) first
        if (groupBy === 'categoryProduct') {
          // First sort by category
          const categoryResult = compareValues(a, b, 'categoryName')
          if (categoryResult !== 0) return categoryResult
          // Then by product name
          const productResult = compareValues(a, b, 'productName')
          if (productResult !== 0) return productResult
        } else {
          const groupResult = compareValues(a, b, groupBy)
          if (groupResult !== 0) return groupResult
        }

        // Then sort within groups
        if (sortBy1 !== 'none') {
          const sortResult = compareValues(a, b, sortBy1)
          if (sortResult !== 0) return sortResult
        }
        return 0
      })
    } else {
      // No grouping, just sort
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

  const sortedData = getSortedData()

  // Apply pagination to sorted data
  const paginatedData = sortedData.slice((page - 1) * limit, (page - 1) * limit + limit)

  // Pagination handlers


  return (
    <>
      <PageHeader
        variant="report"
        title={reportTitle}
        subtitle={
          reportData.length > 0
            ? `Product sales to ${reportData.length} customers`
            : 'View which customers purchased which products'
        }
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
                <Typography
                  variant="caption"
                  sx={{
                    color: "text.secondary",
                    mb: 1
                  }}>
                  Order Date
                </Typography>
                <TextField
                  label="Date From"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  slotProps={{
  inputLabel: { shrink: true, sx: { fontSize: '0.75rem' } },
  htmlInput: { sx: { fontSize: '0.75rem' } },
}}
                  size="small"
                  fullWidth
                />

                <TextField
                  label="Date To"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  slotProps={{
  inputLabel: { shrink: true, sx: { fontSize: '0.75rem' } },
  htmlInput: { sx: { fontSize: '0.75rem' } },
}}
                  size="small"
                  fullWidth
                />

                <FormControl fullWidth size="small" sx={{ '& .MuiInputLabel-root': { fontSize: '0.75rem' }, '& .MuiSelect-select': { fontSize: '0.75rem' } }}>
                  <InputLabel>Products</InputLabel>
                  <Select
                    value={selectedProduct}
                    label="Products"
                    onChange={(e) => handleProductSelectChange(e.target.value)}
                    MenuProps={{ slotProps: { paper: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } } }}
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
                        {category.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl fullWidth size="small" sx={{ '& .MuiInputLabel-root': { fontSize: '0.75rem' }, '& .MuiSelect-select': { fontSize: '0.75rem' } }}>
                  <InputLabel>Inventory Status</InputLabel>
                  <Select
                    value={inventoryStatus}
                    label="Inventory Status"
                    onChange={(e) => setInventoryStatus(e.target.value)}
                    MenuProps={{ slotProps: { paper: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } } }}
                  >
                    <MenuItem value="all">All</MenuItem>
                    <MenuItem value="fulfilled">Fulfilled</MenuItem>
                    <MenuItem value="unfulfilled">Unfulfilled</MenuItem>
                  </Select>
                </FormControl>

                <FormControl fullWidth size="small" sx={{ '& .MuiInputLabel-root': { fontSize: '0.75rem' }, '& .MuiSelect-select': { fontSize: '0.75rem' } }}>
                  <InputLabel>Payment Status</InputLabel>
                  <Select
                    value={paymentStatus}
                    label="Payment Status"
                    onChange={(e) => setPaymentStatus(e.target.value)}
                    MenuProps={{ slotProps: { paper: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } } }}
                  >
                    <MenuItem value="all">All</MenuItem>
                    <MenuItem value="unpaid">Unpaid</MenuItem>
                    <MenuItem value="partial">Partial</MenuItem>
                    <MenuItem value="paid">Paid</MenuItem>
                    <MenuItem value="overpaid">Overpaid</MenuItem>
                  </Select>
                </FormControl>
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
                <FormControl fullWidth size="small" sx={{ mt: 2, '& .MuiInputLabel-root': { fontSize: '0.75rem' }, '& .MuiSelect-select': { fontSize: '0.75rem' } }}>
                  <InputLabel>Columns</InputLabel>
                  <Select
                    multiple
                    value={selectedColumns}
                    label="Columns"
                    onChange={(e) => {
                      const value = typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value

                      // Check if 'all' was clicked
                      if (value.includes('all')) {
                        const allColumns = ['productName', 'categoryName', 'orderNumber', 'customerName', 'orderDate', 'inventoryStatus', 'paymentStatus', 'quantity', 'amount', 'cost', 'profit']
                        // If all were selected, deselect all; otherwise select all
                        if (selectedColumns.length === allColumns.length) {
                          setSelectedColumns([])
                        } else {
                          setSelectedColumns(allColumns)
                        }
                      } else {
                        // Normal column selection
                        setSelectedColumns(value as string[])
                      }
                    }}
                    MenuProps={{ slotProps: { paper: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } } }}
                    renderValue={(selected) => `${selected.length} column${selected.length !== 1 ? 's' : ''} selected`}
                  >
                    <MenuItem value="all">All</MenuItem>
                    <MenuItem value="productName">Product</MenuItem>
                    <MenuItem value="categoryName">Category</MenuItem>
                    <MenuItem value="orderNumber">Order No</MenuItem>
                    <MenuItem value="customerName">Customer</MenuItem>
                    <MenuItem value="orderDate">Order Date</MenuItem>
                    <MenuItem value="inventoryStatus">Inventory Status</MenuItem>
                    <MenuItem value="paymentStatus">Payment Status</MenuItem>
                    <MenuItem value="quantity">Quantity Sold</MenuItem>
                    <MenuItem value="amount">Sales Amount</MenuItem>
                    <MenuItem value="cost">Sales Cost</MenuItem>
                    <MenuItem value="profit">Sales Profit</MenuItem>
                  </Select>
                </FormControl>

                <FormControl fullWidth size="small" sx={{ mt: 2, '& .MuiInputLabel-root': { fontSize: '0.75rem' }, '& .MuiSelect-select': { fontSize: '0.75rem' } }}>
                  <InputLabel>Group By</InputLabel>
                  <Select
                    value={groupBy}
                    label="Group By"
                    onChange={(e) => setGroupBy(e.target.value)}
                    MenuProps={{ slotProps: { paper: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } } }}
                  >
                    <MenuItem value="none">None</MenuItem>
                    <MenuItem value="categoryName">Category</MenuItem>
                    <MenuItem value="categoryProduct">Category, Product</MenuItem>
                  </Select>
                </FormControl>

                <FormControl fullWidth size="small" sx={{ mt: 2, '& .MuiInputLabel-root': { fontSize: '0.75rem' }, '& .MuiSelect-select': { fontSize: '0.75rem' } }}>
                  <InputLabel>Sort By</InputLabel>
                  <Select
                    value={sortBy1}
                    label="Sort By"
                    onChange={(e) => setSortBy1(e.target.value)}
                    MenuProps={{ slotProps: { paper: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } } }}
                  >
                    <MenuItem value="productName">Product</MenuItem>
                    <MenuItem value="categoryName">Category</MenuItem>
                    <MenuItem value="orderNumber">Order No</MenuItem>
                    <MenuItem value="customerName">Customer</MenuItem>
                    <MenuItem value="orderDate">Order Date</MenuItem>
                    <MenuItem value="inventoryStatus">Inventory Status</MenuItem>
                    <MenuItem value="paymentStatus">Payment Status</MenuItem>
                    <MenuItem value="quantity">Quantity Sold</MenuItem>
                    <MenuItem value="amount">Sales Amount</MenuItem>
                    <MenuItem value="cost">Sales Cost</MenuItem>
                    <MenuItem value="profit">Sales Profit</MenuItem>
                  </Select>
                </FormControl>

                <TextField
                  label="Report Title"
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  slotProps={{
  inputLabel: { sx: { fontSize: '0.75rem' } },
  htmlInput: { sx: { fontSize: '0.75rem' } },
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
                      <CustomerProductIcon sx={{ fontSize: 80, color: 'text.disabled', mb: 2 }} />
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
                        Configure the filters on the left and click "Generate Report" to view product-customer relationships.
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
                      {selectedColumns.includes('productName') && <TableCell align="center">Product</TableCell>}
                      {selectedColumns.includes('categoryName') && <TableCell align="center">Category</TableCell>}
                      {selectedColumns.includes('orderNumber') && <TableCell align="center">Order No</TableCell>}
                      {selectedColumns.includes('customerName') && <TableCell align="center">Customer</TableCell>}
                      {selectedColumns.includes('orderDate') && <TableCell align="center">Order Date</TableCell>}
                      {selectedColumns.includes('inventoryStatus') && <TableCell align="center">Inventory Status</TableCell>}
                      {selectedColumns.includes('paymentStatus') && <TableCell align="center">Payment Status</TableCell>}
                      {selectedColumns.includes('quantity') && <TableCell align="center">Quantity Sold</TableCell>}
                      {selectedColumns.includes('amount') && <TableCell align="center">Sales Amount</TableCell>}
                      {selectedColumns.includes('cost') && <TableCell align="center">Sales Cost</TableCell>}
                      {selectedColumns.includes('profit') && <TableCell align="center">Sales Profit</TableCell>}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginatedData.map((row, idx) => {
                      // Check if we need to display a group header
                      const prevRow = idx > 0 ? paginatedData[idx - 1] : null
                      const nextRow = idx < paginatedData.length - 1 ? paginatedData[idx + 1] : null

                      // Helper to get group key for a row
                      const getGroupKey = (r: any) => {
                        if (groupBy === 'categoryProduct') {
                          return `${r.categoryName}|${r.productName}`
                        }
                        return r[groupBy]
                      }

                      const showGroupHeader = groupBy !== 'none' && (!prevRow || getGroupKey(row) !== getGroupKey(prevRow))
                      const showGroupFooter = groupBy !== 'none' && (!nextRow || getGroupKey(row) !== getGroupKey(nextRow))

                      const getGroupLabel = (field: string, r: any) => {
                        if (field === 'categoryProduct') {
                          return `Category: ${r.categoryName} | Product: ${r.productName}`
                        } else if (field === 'categoryName') {
                          return `Category: ${r.categoryName}`
                        }
                        return r[field]
                      }

                      // Calculate group subtotals
                      const calculateGroupSubtotals = () => {
                        if (groupBy === 'none') return null

                        const currentGroupKey = getGroupKey(row)
                        const groupData = paginatedData.filter(r => getGroupKey(r) === currentGroupKey)

                        return {
                          quantity: groupData.reduce((sum, r) => sum + r.quantity, 0),
                          amount: groupData.reduce((sum, r) => sum + r.amount, 0),
                          cost: groupData.reduce((sum, r) => sum + r.cost, 0),
                          profit: groupData.reduce((sum, r) => sum + r.profit, 0),
                        }
                      }

                      const groupSubtotals = showGroupFooter ? calculateGroupSubtotals() : null

                      return (
                        <React.Fragment key={`${row.orderId}-${idx}`}>
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
                        {selectedColumns.includes('orderNumber') && (
                          <TableCell sx={{ fontSize: '0.8rem' }}>
                            {row.orderNumber}
                          </TableCell>
                        )}
                        {selectedColumns.includes('customerName') && (
                          <TableCell sx={{ fontSize: '0.8rem' }}>
                            {row.customerName}
                          </TableCell>
                        )}
                        {selectedColumns.includes('orderDate') && (
                          <TableCell sx={{ fontSize: '0.8rem' }}>
                            {row.orderDate ? formatDate(row.orderDate) : '-'}
                          </TableCell>
                        )}
                        {selectedColumns.includes('inventoryStatus') && (
                          <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                            <StatusChip status={row.inventoryStatus === 'fulfilled' ? 'fulfilled' : 'unfulfilled'} sx={{ fontSize: '0.7rem', height: '20px' }} />
                          </TableCell>
                        )}
                        {selectedColumns.includes('paymentStatus') && (
                          <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                            <StatusChip status={row.paymentStatus} sx={{ fontSize: '0.7rem', height: '20px' }} />
                          </TableCell>
                        )}
                        {selectedColumns.includes('quantity') && (
                          <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                            {row.quantity}
                          </TableCell>
                        )}
                        {selectedColumns.includes('amount') && (
                          <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                            {formatCurrency(row.amount)}
                          </TableCell>
                        )}
                        {selectedColumns.includes('cost') && (
                          <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                            {formatCurrency(row.cost)}
                          </TableCell>
                        )}
                        {selectedColumns.includes('profit') && (
                          <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                            {formatCurrency(row.profit)}
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
                                {selectedColumns.includes('orderNumber') && <TableCell />}
                                {selectedColumns.includes('customerName') && <TableCell />}
                                {selectedColumns.includes('orderDate') && <TableCell />}
                                {selectedColumns.includes('inventoryStatus') && <TableCell />}
                                {selectedColumns.includes('paymentStatus') && <TableCell />}
                                {selectedColumns.includes('quantity') && (
                                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                                    {groupSubtotals.quantity}
                                  </TableCell>
                                )}
                                {selectedColumns.includes('amount') && (
                                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                                    {formatCurrency(groupSubtotals.amount)}
                                  </TableCell>
                                )}
                                {selectedColumns.includes('cost') && (
                                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                                    {formatCurrency(groupSubtotals.cost)}
                                  </TableCell>
                                )}
                                {selectedColumns.includes('profit') && (
                                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                                    {formatCurrency(groupSubtotals.profit)}
                                  </TableCell>
                                )}
                              </TableRow>
                              {/* Blank row after subtotal */}
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
                        {selectedColumns.includes('orderNumber') && <TableCell />}
                        {selectedColumns.includes('customerName') && <TableCell />}
                        {selectedColumns.includes('orderDate') && <TableCell />}
                        {selectedColumns.includes('inventoryStatus') && <TableCell />}
                        {selectedColumns.includes('paymentStatus') && <TableCell />}
                        {selectedColumns.includes('quantity') && (
                          <TableCell align="right" sx={{ fontWeight: 800 }}>
                            {totals.quantity}
                          </TableCell>
                        )}
                        {selectedColumns.includes('amount') && (
                          <TableCell align="right" sx={{ fontWeight: 800 }}>
                            {formatCurrency(totals.amount)}
                          </TableCell>
                        )}
                        {selectedColumns.includes('cost') && (
                          <TableCell align="right" sx={{ fontWeight: 800 }}>
                            {formatCurrency(totals.cost)}
                          </TableCell>
                        )}
                        {selectedColumns.includes('profit') && (
                          <TableCell align="right" sx={{ fontWeight: 800 }}>
                            {formatCurrency(totals.profit)}
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
                  <PagePagination total={sortedData.length} {...paginationProps} />
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
        slotProps={{ paper: { sx: { height: '80vh', maxHeight: '80vh' } } }}
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
                        getFilteredProducts().map((product) => (
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
                        getSelectedProductsList().map((product) => (
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
          <AppButton variant="primary" onClick={handleProductDialogClose}>
            Done
          </AppButton>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default ProductCustomerReport
