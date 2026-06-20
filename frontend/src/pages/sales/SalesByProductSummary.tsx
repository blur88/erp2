import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Paper,
  Grid,
  IconButton,
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
  Divider,
  OutlinedInput,
} from '@mui/material'
import PagePagination from '@/components/common/PagePagination'
import { usePagination } from '@/hooks/usePagination'
import { alpha } from '@mui/material/styles'
import { AppButton } from '@/components/common/AppButton'
import { default as PdfIcon } from '@mui/icons-material/PictureAsPdf'
import { default as ExcelIcon } from '@mui/icons-material/TableChart'
import { default as RefreshIcon } from '@mui/icons-material/Refresh'
import { default as GenerateIcon } from '@mui/icons-material/PlayArrow'
import { default as SummaryIcon } from '@mui/icons-material/Summarize'
import { default as CloseIcon } from '@mui/icons-material/Close'
import { default as KeyboardArrowRightIcon } from '@mui/icons-material/KeyboardArrowRight'
import { default as KeyboardArrowLeftIcon } from '@mui/icons-material/KeyboardArrowLeft'
import { default as KeyboardDoubleArrowRightIcon } from '@mui/icons-material/KeyboardDoubleArrowRight'
import { default as KeyboardDoubleArrowLeftIcon } from '@mui/icons-material/KeyboardDoubleArrowLeft'
import { default as ViewColumnIcon } from '@mui/icons-material/ViewColumn'
import PageHeader from '@/components/common/PageHeader'
import { printColors } from '@/styles/printTokens'
import { formatCurrency, formatDate, formatDateTime } from '@/utils/formatters'
import { escapeHtml } from '@/utils/security'
import { printReport } from '@/utils/printReport'
import { exportReportExcel } from '@/utils/exportReport'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { ApiService } from '@/services/api'

interface ProductSummary {
  productId: string
  productName: string
  category: string
  soldQty: number
  totalSales: number
  cost: number
  salesProfit: number
  purchaseQty: number
  purchaseSubtotal: number
  totalProfit: number
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
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([])
  const [selectedRemovedIds, setSelectedRemovedIds] = useState<string[]>([])
  const [lastClickedProductId, setLastClickedProductId] = useState<string | null>(null)
  const [lastClickedRemovedId, setLastClickedRemovedId] = useState<string | null>(null)

  // Display options
  const [selectedColumns, setSelectedColumns] = useState<string[]>([
    'productName', 'category', 'soldQty', 'totalSales', 'cost', 'salesProfit', 'purchaseQty', 'purchaseSubtotal', 'totalProfit'
  ])
  const [groupBy, setGroupBy] = useState<string>('none')
  const [sortBy1, setSortBy1] = useState<string>('productName')
  const [sortBy2, setSortBy2] = useState<string>('none')
  const [sortBy3, setSortBy3] = useState<string>('none')
  const [reportTitle, setReportTitle] = useState<string>('Sales by Product Summary')

  // Pagination
  const { page, limit, reset, setLimit, paginationProps } = usePagination()

  useEffect(() => {
    // Load products with authentication
    ApiService.get<{ data: any[] }>('/inventory/products')
      .then(data => {
        if (data?.data) {
          setProducts(data.data)
        }
      })
      .catch(() => {})

    // Load categories with authentication
    ApiService.get<any>('/inventory/categories/tree')
      .then(data => {
        // Handle both response formats: { data: [...] } or direct array
        const categoryData = data?.data || data
        if (Array.isArray(categoryData)) {
          // Flatten the tree structure for dropdown
          const flattenCategories = (cats: any[], level = 0): any[] => {
            return cats.reduce((acc: any[], cat: any) => {
              acc.push({ ...cat, level })
              if (cat.children && cat.children.length > 0) {
                acc.push(...flattenCategories(cat.children, level + 1))
              }
              return acc
            }, [])
          }
          setCategories(flattenCategories(categoryData))
        }
      })
      .catch(() => {})
  }, [])

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

      // Call the backend API with authentication
      const data = await ApiService.get<{ data: ProductSummary[] }>(
        `/sales/analytics/product-summary?${params.toString()}`
      )
      setReportData(data.data || [])
    } catch (err) {
      console.error('Failed to generate report:', err)
      setReportData([])
    } finally {
      setLoading(false)
    }
  }

  const handleClearFilters = () => {
    // Clear filter options
    setSelectedProduct('all')
    setSelectedProducts([])
    setSelectedCategory('')
    setDateFrom('')
    setDateTo('')

    // Clear report data
    setReportData([])

    // Reset display options to defaults
    setSelectedColumns(['productName', 'category', 'soldQty', 'totalSales', 'cost', 'salesProfit', 'purchaseQty', 'purchaseSubtotal', 'totalProfit'])
    setGroupBy('none')
    setSortBy1('productName')
    setSortBy2('none')
    setSortBy3('none')
    setReportTitle('Sales by Product Summary')

    // Reset pagination
    reset()
    setLimit(25)
  }

  const handleExportExcel = async () => {
    try {
      const date = new Date().toISOString().split('T')[0]
      await exportReportExcel(
        '/sales/analytics/product-summary/export',
        { dateFrom, dateTo, categoryId: selectedCategory, productIds: selectedProducts },
        `sales-by-product-summary-${date}.xlsx`,
      )
    } catch (err) {
      console.error('Export failed:', err)
    }
  }

  const handleExportPDF = () => {
    if (sortedData.length === 0) return

    const columnHeaders: { [key: string]: string } = {
      productName: 'Product',
      category: 'Category',
      soldQty: 'Sold Qty',
      totalSales: 'Total Sales',
      cost: 'Cost',
      salesProfit: 'Sales Profit',
      purchaseQty: 'Purchase Qty',
      purchaseSubtotal: 'Purchase Subtotal',
      totalProfit: 'Total Profit'
    }

    let tableRows = ''

    if (groupedData) {
      Object.entries(groupedData).forEach(([categoryName, items]) => {
        // Category header
        tableRows += `<tr style="background-color: ${printColors.infoRow}; font-weight: bold;"><td colspan="${selectedColumns.length}">${escapeHtml(categoryName)}</td></tr>`

        // Items
        items.forEach(row => {
          tableRows += '<tr>'
          selectedColumns.forEach(col => {
            const value = (row as any)[col]
            let displayValue = value
            if (col === 'soldQty' || col === 'purchaseQty') {
              displayValue = value.toLocaleString()
            } else if (typeof value === 'number') {
              displayValue = formatCurrency(value)
            }
            tableRows += `<td>${escapeHtml(displayValue)}</td>`
          })
          tableRows += '</tr>'
        })

        // Subtotal
        const subtotal = calculateCategorySubtotal(items)
        tableRows += `<tr style="background-color: ${printColors.infoRow}; font-weight: bold; border-top: 2px solid ${printColors.tableHeaderBg};">`
        selectedColumns.forEach((col, idx) => {
          if (idx === 0) {
            tableRows += '<td style="font-weight: bold;">Subtotal</td>'
          } else if (col === 'soldQty' || col === 'purchaseQty') {
            const value = (subtotal as any)[col]
            tableRows += `<td style="text-align: right; font-weight: bold;">${value?.toLocaleString() || ''}</td>`
          } else if (col === 'totalSales' || col === 'cost' || col === 'salesProfit' || col === 'purchaseSubtotal' || col === 'totalProfit') {
            const value = (subtotal as any)[col]
            tableRows += `<td style="text-align: right; font-weight: bold;">${typeof value === 'number' ? formatCurrency(value) : ''}</td>`
          } else {
            tableRows += '<td></td>'
          }
        })
        tableRows += '</tr>'
        // Blank row after subtotal
        tableRows += `<tr style="height: 20px;"><td colspan="${selectedColumns.length}" style="border: none;"></td></tr>`
      })
    } else {
      sortedData.forEach(row => {
        tableRows += '<tr>'
        selectedColumns.forEach(col => {
          const value = (row as any)[col]
          let displayValue = value
          if (col === 'soldQty' || col === 'purchaseQty') {
            displayValue = value.toLocaleString()
          } else if (typeof value === 'number') {
            displayValue = formatCurrency(value)
          }
          tableRows += `<td>${escapeHtml(displayValue)}</td>`
        })
        tableRows += '</tr>'
      })
    }

    // Add totals
    if (totals) {
      tableRows += `<tr style="background-color: ${printColors.successRow}; font-weight: bold; border-top: 3px solid ${printColors.border};">`
      selectedColumns.forEach((col, idx) => {
        if (idx === 0) {
          tableRows += '<td style="font-weight: 800;">GRAND TOTAL</td>'
        } else if (col === 'soldQty' || col === 'purchaseQty') {
          const value = (totals as any)[col]
          tableRows += `<td style="text-align: right; font-weight: 800;">${value?.toLocaleString() || ''}</td>`
        } else if (col === 'totalSales' || col === 'cost' || col === 'salesProfit' || col === 'purchaseSubtotal' || col === 'totalProfit') {
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
          <style>
            body { font-family: 'Roboto', sans-serif; margin: 20px; }
            h1 { text-align: center; margin-bottom: 10px; }
            .header-info { text-align: center; margin-bottom: 20px; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid ${printColors.tableBorder}; padding: 8px; text-align: left; }
            th { background-color: ${printColors.tableHeaderBg}; color: ${printColors.background}; font-weight: bold; }
            tr:nth-child(even) { background-color: ${printColors.tableRowAlt}; }
            .text-right { text-align: right; }
            @media print {
              body { margin: 0; padding: 20px 20px 40px 20px; }
              @page {
                margin: 0;
                @bottom-right {
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
    setSelectedProductIds([])
    setSelectedRemovedIds([])
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
    setSelectedProductIds([])
    setSelectedRemovedIds([])
  }

  const handleProductClick = (productId: string, event: React.MouseEvent) => {
    const filteredProducts = getFilteredProducts()

    if (event.ctrlKey || event.metaKey) {
      // Ctrl/Cmd+Click: Toggle individual selection
      setSelectedProductIds(prev =>
        prev.includes(productId)
          ? prev.filter(id => id !== productId)
          : [...prev, productId]
      )
      setLastClickedProductId(productId)
    } else if (event.shiftKey && lastClickedProductId) {
      // Shift+Click: Select range
      const lastIndex = filteredProducts.findIndex(p => p.id === lastClickedProductId)
      const currentIndex = filteredProducts.findIndex(p => p.id === productId)

      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex)
        const end = Math.max(lastIndex, currentIndex)
        const rangeIds = filteredProducts.slice(start, end + 1).map(p => p.id)

        setSelectedProductIds(prev => [...new Set([...prev, ...rangeIds])])
      }
    } else {
      // Normal click: Toggle single selection
      setSelectedProductIds(prev =>
        prev.includes(productId)
          ? prev.filter(id => id !== productId)
          : [...prev, productId]
      )
      setLastClickedProductId(productId)
    }
  }

  const handleSelectedProductClick = (productId: string, event: React.MouseEvent) => {
    const selectedProducts = getSelectedProductsList()

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
      const lastIndex = selectedProducts.findIndex(p => p.id === lastClickedRemovedId)
      const currentIndex = selectedProducts.findIndex(p => p.id === productId)

      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex)
        const end = Math.max(lastIndex, currentIndex)
        const rangeIds = selectedProducts.slice(start, end + 1).map(p => p.id)

        setSelectedRemovedIds(prev => [...new Set([...prev, ...rangeIds])])
      }
    } else {
      // Normal click: Toggle single selection
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
    const allFilteredIds = getFilteredProducts().map(p => p.id)
    setSelectedProducts(prev => [...new Set([...prev, ...allFilteredIds])])
    setSelectedProductIds([])
  }

  const handleRemoveAllProducts = () => {
    setSelectedProducts([])
    setSelectedRemovedIds([])
  }

  const getFilteredProducts = () => {
    return products.filter(product => {
      const matchesName = !productSearchFilter ||
        product.name.toLowerCase().includes(productSearchFilter.toLowerCase())
      const matchesCategory = !productCategoryFilter ||
        product.category?.id === productCategoryFilter
      const notSelected = !selectedProducts.includes(product.id)
      return matchesName && matchesCategory && notSelected
    })
  }

  const getSelectedProductsList = () => {
    return products.filter(product => selectedProducts.includes(product.id))
  }

  const calculateTotals = () => {
    if (reportData.length === 0) return null

    return reportData.reduce(
      (acc, item) => ({
        soldQty: acc.soldQty + item.soldQty,
        totalSales: acc.totalSales + item.totalSales,
        cost: acc.cost + item.cost,
        salesProfit: acc.salesProfit + item.salesProfit,
        purchaseQty: acc.purchaseQty + item.purchaseQty,
        purchaseSubtotal: acc.purchaseSubtotal + item.purchaseSubtotal,
        totalProfit: acc.totalProfit + item.totalProfit,
      }),
      {
        soldQty: 0,
        totalSales: 0,
        cost: 0,
        salesProfit: 0,
        purchaseQty: 0,
        purchaseSubtotal: 0,
        totalProfit: 0,
      }
    )
  }

  const totals = calculateTotals()

  // Sort the report data based on selected sort criteria
  const getSortedData = () => {
    if (reportData.length === 0) return []

    const sorted = [...reportData]

    const compareValues = (a: any, b: any, field: string) => {
      const aVal = a[field]
      const bVal = b[field]

      // Handle null/undefined
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1

      // String comparison (case-insensitive) - ascending for text
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.toLowerCase().localeCompare(bVal.toLowerCase())
      }

      // Numeric comparison - descending (higher to lower)
      return bVal - aVal
    }

    sorted.sort((a, b) => {
      // First sort
      if (sortBy1 !== 'none') {
        const result1 = compareValues(a, b, sortBy1)
        if (result1 !== 0) return result1
      }

      // Then sort (second level)
      if (sortBy2 !== 'none') {
        const result2 = compareValues(a, b, sortBy2)
        if (result2 !== 0) return result2
      }

      // Then sort (third level)
      if (sortBy3 !== 'none') {
        const result3 = compareValues(a, b, sortBy3)
        if (result3 !== 0) return result3
      }

      return 0
    })

    return sorted
  }

  const sortedData = getSortedData()

  // Group data by category if groupBy is set to 'category'
  const getGroupedData = () => {
    if (groupBy === 'category' && sortedData.length > 0) {
      const grouped = sortedData.reduce((acc: { [key: string]: ProductSummary[] }, item) => {
        const categoryName = item.category || 'Uncategorized'
        if (!acc[categoryName]) {
          acc[categoryName] = []
        }
        acc[categoryName].push(item)
        return acc
      }, {})
      return grouped
    }
    return null
  }

  const groupedData = getGroupedData()

  // Apply pagination to sorted data
  const paginatedData = sortedData.slice((page - 1) * limit, (page - 1) * limit + limit)

  // Calculate subtotals for each category group
  const calculateCategorySubtotal = (items: ProductSummary[]) => {
    return items.reduce(
      (acc, item) => ({
        soldQty: acc.soldQty + item.soldQty,
        totalSales: acc.totalSales + item.totalSales,
        cost: acc.cost + item.cost,
        salesProfit: acc.salesProfit + item.salesProfit,
        purchaseQty: acc.purchaseQty + item.purchaseQty,
        purchaseSubtotal: acc.purchaseSubtotal + item.purchaseSubtotal,
        totalProfit: acc.totalProfit + item.totalProfit,
      }),
      {
        soldQty: 0,
        totalSales: 0,
        cost: 0,
        salesProfit: 0,
        purchaseQty: 0,
        purchaseSubtotal: 0,
        totalProfit: 0,
      }
    )
  }

  // Pagination handlers


  return (
    <>
      <PageHeader
        variant="report"
        title={reportTitle}
        subtitle={
          reportData.length > 0
            ? `Product performance report (${reportData.length} products)`
            : 'Analyze product performance and sales metrics'
        }
        primaryAction={{ label: loading ? 'Generating...' : 'Generate Report', onClick: handleGenerateReport, disabled: loading }}
        secondaryAction={{ label: 'Clear Filters', onClick: handleClearFilters, disabled: loading }}
      />
      {/* Split Layout */}
      <Box sx={{ width: '100%', height: 'calc(100vh - 220px)' }}>
        <Grid container spacing={3} sx={{ alignItems: 'stretch', height: '100%', margin: 0, width: 'calc(100% + 24px)' }}>
          {/* Left Side - Filters and Display */}
          <Grid
            sx={{ display: 'flex', height: '100%', minWidth: 0 }}
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
                  SO Date Range
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

                <FormControl fullWidth size="small" sx={{ mt: 2, '& .MuiInputLabel-root': { fontSize: '0.75rem' }, '& .MuiSelect-select': { fontSize: '0.75rem' } }}>
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
                        {'\u00A0'.repeat((category.level || 0) * 4)}{category.name}
                      </MenuItem>
                    ))}
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
                        const allColumns = ['productName', 'category', 'soldQty', 'totalSales', 'cost', 'salesProfit', 'purchaseQty', 'purchaseSubtotal', 'totalProfit']
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
                    renderValue={(selected) => `${selected.length} column${selected.length !== 1 ? 's' : ''} selected`}
                    MenuProps={{ slotProps: { paper: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } } }}
                  >
                    <MenuItem value="all">All</MenuItem>
                    <MenuItem value="productName">Product</MenuItem>
                    <MenuItem value="category">Category</MenuItem>
                    <MenuItem value="soldQty">Sold Qty</MenuItem>
                    <MenuItem value="totalSales">Total Sales</MenuItem>
                    <MenuItem value="cost">Cost</MenuItem>
                    <MenuItem value="salesProfit">Sales Profit</MenuItem>
                    <MenuItem value="purchaseQty">Purchase Qty</MenuItem>
                    <MenuItem value="purchaseSubtotal">Purchase Subtotal</MenuItem>
                    <MenuItem value="totalProfit">Total Profit</MenuItem>
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
                    <MenuItem value="category">Category</MenuItem>
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
                    <MenuItem value="category">Category</MenuItem>
                    <MenuItem value="soldQty">Sold Qty</MenuItem>
                    <MenuItem value="totalSales">Total Sales</MenuItem>
                    <MenuItem value="cost">Cost</MenuItem>
                    <MenuItem value="salesProfit">Sales Profit</MenuItem>
                    <MenuItem value="purchaseQty">Purchase Qty</MenuItem>
                    <MenuItem value="purchaseSubtotal">Purchase Subtotal</MenuItem>
                    <MenuItem value="totalProfit">Total Profit</MenuItem>
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
          sx={{ display: 'flex', height: '100%', minWidth: 0 }}
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
                      <SummaryIcon sx={{ fontSize: 80, color: 'text.disabled', mb: 2 }} />
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
                        Configure the filters on the left and click "Generate Report" to view sales data by product.
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
                  Report Preview ({reportData.length} products)
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
              <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <TableContainer sx={{
                  flex: 1,
                  overflow: 'auto',
                  '&::-webkit-scrollbar': {
                    height: '8px',
                    width: '8px'
                  },
                  '&::-webkit-scrollbar-track': {
                    backgroundColor: theme.palette.action.hover
                  },
                  '&::-webkit-scrollbar-thumb': {
                    backgroundColor: theme.palette.grey[700],
                    borderRadius: '4px',
                    '&:hover': {
                      backgroundColor: theme.palette.grey[600]
                    }
                  }
                }}>
                <Table
                  size={TABLE_STYLES.size}
                  stickyHeader
                  sx={{
                    minWidth: 'max-content',
                    width: '100%',
                    tableLayout: 'auto',
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
                      {selectedColumns.includes('category') && <TableCell align="center">Category</TableCell>}
                      {selectedColumns.includes('soldQty') && <TableCell align="center">Sold Qty</TableCell>}
                      {selectedColumns.includes('totalSales') && <TableCell align="center">Total Sales</TableCell>}
                      {selectedColumns.includes('cost') && <TableCell align="center">Cost</TableCell>}
                      {selectedColumns.includes('salesProfit') && <TableCell align="center">Sales Profit</TableCell>}
                      {selectedColumns.includes('purchaseQty') && <TableCell align="center">Purchase Qty</TableCell>}
                      {selectedColumns.includes('purchaseSubtotal') && <TableCell align="center">Purchase Subtotal</TableCell>}
                      {selectedColumns.includes('totalProfit') && <TableCell align="center">Total Profit</TableCell>}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {groupedData ? (
                      // Render grouped by category
                      (Object.entries(groupedData).map(([categoryName, items]) => {
                        const subtotal = calculateCategorySubtotal(items)
                        return (
                          <React.Fragment key={categoryName}>
                            {/* Category Header Row */}
                            <TableRow
                              sx={{
                                backgroundColor: alpha(theme.palette.primary.main, 0.1),
                                '& .MuiTableCell-root': {
                                  fontWeight: 700,
                                  fontSize: '0.85rem',
                                  color: 'primary.main'
                                }
                              }}
                            >
                              <TableCell colSpan={selectedColumns.length} sx={{ py: 1 }}>
                                {categoryName}
                              </TableCell>
                            </TableRow>
                            {/* Category Items */}
                            {items.map((row) => (
                              <TableRow
                                key={row.productId}
                                hover
                                sx={{
                                  '&:hover': { backgroundColor: 'action.hover' },
                                  transition: 'background-color 0.2s ease',
                                  height: TABLE_STYLES.row.height
                                }}
                              >
                                {selectedColumns.includes('productName') && (
                                  <TableCell sx={{ fontSize: '0.8rem', pl: 4 }}>
                                    {row.productName}
                                  </TableCell>
                                )}
                                {selectedColumns.includes('category') && (
                                  <TableCell sx={{ fontSize: '0.8rem' }}>
                                    {row.category}
                                  </TableCell>
                                )}
                                {selectedColumns.includes('soldQty') && (
                                  <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                                    {row.soldQty.toLocaleString()}
                                  </TableCell>
                                )}
                                {selectedColumns.includes('totalSales') && (
                                  <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                                    {formatCurrency(row.totalSales)}
                                  </TableCell>
                                )}
                                {selectedColumns.includes('cost') && (
                                  <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                                    {formatCurrency(row.cost)}
                                  </TableCell>
                                )}
                                {selectedColumns.includes('salesProfit') && (
                                  <TableCell align="right" sx={{
                                    fontSize: '0.8rem',
                                    color: row.salesProfit > 0 ? 'success.main' : 'error.main'
                                  }}>
                                    {formatCurrency(row.salesProfit)}
                                  </TableCell>
                                )}
                                {selectedColumns.includes('purchaseQty') && (
                                  <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                                    {row.purchaseQty.toLocaleString()}
                                  </TableCell>
                                )}
                                {selectedColumns.includes('purchaseSubtotal') && (
                                  <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                                    {formatCurrency(row.purchaseSubtotal)}
                                  </TableCell>
                                )}
                                {selectedColumns.includes('totalProfit') && (
                                  <TableCell align="right" sx={{
                                    fontSize: '0.8rem',
                                    color: row.totalProfit > 0 ? 'success.main' : 'error.main'
                                  }}>
                                    {formatCurrency(row.totalProfit)}
                                  </TableCell>
                                )}
                              </TableRow>
                            ))}
                            {/* Category Subtotal Row */}
                            <TableRow
                              sx={{
                                backgroundColor: alpha(theme.palette.primary.main, 0.2),
                                '& .MuiTableCell-root': {
                                  fontWeight: 700,
                                  fontSize: '0.85rem',
                                  borderTop: '2px solid',
                                  borderColor: 'primary.main'
                                }
                              }}
                            >
                              {selectedColumns.includes('productName') && (
                                <TableCell sx={{ fontWeight: 700 }}>
                                  Subtotal
                                </TableCell>
                              )}
                              {selectedColumns.includes('category') && (
                                <TableCell />
                              )}
                              {selectedColumns.includes('soldQty') && (
                                <TableCell align="right" sx={{ fontWeight: 700 }}>
                                  {subtotal.soldQty.toLocaleString()}
                                </TableCell>
                              )}
                              {selectedColumns.includes('totalSales') && (
                                <TableCell align="right" sx={{ fontWeight: 700 }}>
                                  {formatCurrency(subtotal.totalSales)}
                                </TableCell>
                              )}
                              {selectedColumns.includes('cost') && (
                                <TableCell align="right" sx={{ fontWeight: 700 }}>
                                  {formatCurrency(subtotal.cost)}
                                </TableCell>
                              )}
                              {selectedColumns.includes('salesProfit') && (
                                <TableCell align="right" sx={{
                                  fontWeight: 700,
                                  color: subtotal.salesProfit > 0 ? 'success.main' : 'error.main'
                                }}>
                                  {formatCurrency(subtotal.salesProfit)}
                                </TableCell>
                              )}
                              {selectedColumns.includes('purchaseQty') && (
                                <TableCell align="right" sx={{ fontWeight: 700 }}>
                                  {subtotal.purchaseQty.toLocaleString()}
                                </TableCell>
                              )}
                              {selectedColumns.includes('purchaseSubtotal') && (
                                <TableCell align="right" sx={{ fontWeight: 700 }}>
                                  {formatCurrency(subtotal.purchaseSubtotal)}
                                </TableCell>
                              )}
                              {selectedColumns.includes('totalProfit') && (
                                <TableCell align="right" sx={{
                                  fontWeight: 700,
                                  color: subtotal.totalProfit > 0 ? 'success.main' : 'error.main'
                                }}>
                                  {formatCurrency(subtotal.totalProfit)}
                                </TableCell>
                              )}
                            </TableRow>
                            {/* Blank row after subtotal */}
                            <TableRow sx={{ height: TABLE_STYLES.row.height }}>
                              <TableCell colSpan={selectedColumns.length} sx={{ border: 'none', padding: 0 }} />
                            </TableRow>
                          </React.Fragment>
                        )
                      }))
                    ) : (
                      // Render ungrouped with pagination
                      (paginatedData.map((row) => (
                        <TableRow
                          key={row.productId}
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
                          {selectedColumns.includes('category') && (
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {row.category}
                            </TableCell>
                          )}
                          {selectedColumns.includes('soldQty') && (
                            <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                              {row.soldQty.toLocaleString()}
                            </TableCell>
                          )}
                          {selectedColumns.includes('totalSales') && (
                            <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                              {formatCurrency(row.totalSales)}
                            </TableCell>
                          )}
                          {selectedColumns.includes('cost') && (
                            <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                              {formatCurrency(row.cost)}
                            </TableCell>
                          )}
                          {selectedColumns.includes('salesProfit') && (
                            <TableCell align="right" sx={{
                              fontSize: '0.8rem',
                              color: row.salesProfit > 0 ? 'success.main' : 'error.main'
                            }}>
                              {formatCurrency(row.salesProfit)}
                            </TableCell>
                          )}
                          {selectedColumns.includes('purchaseQty') && (
                            <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                              {row.purchaseQty.toLocaleString()}
                            </TableCell>
                          )}
                          {selectedColumns.includes('purchaseSubtotal') && (
                            <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                              {formatCurrency(row.purchaseSubtotal)}
                            </TableCell>
                          )}
                          {selectedColumns.includes('totalProfit') && (
                            <TableCell align="right" sx={{
                              fontSize: '0.8rem',
                              color: row.totalProfit > 0 ? 'success.main' : 'error.main'
                            }}>
                              {formatCurrency(row.totalProfit)}
                            </TableCell>
                          )}
                        </TableRow>
                      )))
                    )}
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
                        {selectedColumns.includes('category') && (
                          <TableCell />
                        )}
                        {selectedColumns.includes('soldQty') && (
                          <TableCell align="right" sx={{ fontWeight: 800 }}>
                            {totals.soldQty.toLocaleString()}
                          </TableCell>
                        )}
                        {selectedColumns.includes('totalSales') && (
                          <TableCell align="right" sx={{ fontWeight: 800 }}>
                            {formatCurrency(totals.totalSales)}
                          </TableCell>
                        )}
                        {selectedColumns.includes('cost') && (
                          <TableCell align="right" sx={{ fontWeight: 800 }}>
                            {formatCurrency(totals.cost)}
                          </TableCell>
                        )}
                        {selectedColumns.includes('salesProfit') && (
                          <TableCell align="right" sx={{
                            fontWeight: 800,
                            color: totals.salesProfit > 0 ? 'success.main' : 'error.main'
                          }}>
                            {formatCurrency(totals.salesProfit)}
                          </TableCell>
                        )}
                        {selectedColumns.includes('purchaseQty') && (
                          <TableCell align="right" sx={{ fontWeight: 800 }}>
                            {totals.purchaseQty.toLocaleString()}
                          </TableCell>
                        )}
                        {selectedColumns.includes('purchaseSubtotal') && (
                          <TableCell align="right" sx={{ fontWeight: 800 }}>
                            {formatCurrency(totals.purchaseSubtotal)}
                          </TableCell>
                        )}
                        {selectedColumns.includes('totalProfit') && (
                          <TableCell align="right" sx={{
                            fontWeight: 800,
                            color: totals.totalProfit > 0 ? 'success.main' : 'error.main'
                          }}>
                            {formatCurrency(totals.totalProfit)}
                          </TableCell>
                        )}
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
              </Box>

              {/* Pagination - only show when not grouped */}
              {!groupedData && reportData.length > 0 && (
                <Box sx={{ borderTop: TABLE_STYLES.cell.border, flexShrink: 0 }}>
                  <PagePagination total={sortedData.length} {...paginationProps} />
                </Box>
              )}
            </Paper>
          )}
        </Grid>
      </Grid>
      </Box>
      {/* Product Selection Dialog */}
      <Dialog
        open={productDialogOpen}
        onClose={handleProductDialogClose}
        maxWidth="lg"
        fullWidth
        slotProps={{ paper: { sx: { height: '90vh', maxHeight: '90vh' } } }}
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
            disabled={selectedProducts.length === 0}
          >
            Apply
          </AppButton>
        </DialogActions>
      </Dialog>
    </>
  );
}

export default SalesByProductSummary
