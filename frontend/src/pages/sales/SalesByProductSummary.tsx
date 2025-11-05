import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Paper,
  Grid,
  Button,
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
  TablePagination,
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
import {
  PictureAsPdf as PdfIcon,
  TableChart as ExcelIcon,
  Refresh as RefreshIcon,
  PlayArrow as GenerateIcon,
  Inventory2 as ProductIcon,
  Close as CloseIcon,
  KeyboardArrowRight as KeyboardArrowRightIcon,
  KeyboardArrowLeft as KeyboardArrowLeftIcon,
  KeyboardDoubleArrowRight as KeyboardDoubleArrowRightIcon,
  KeyboardDoubleArrowLeft as KeyboardDoubleArrowLeftIcon,
  ViewColumn as ViewColumnIcon,
} from '@mui/icons-material'
import { formatCurrency } from '@/utils/formatters'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'

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
  const [page, setPage] = useState<number>(0)
  const [rowsPerPage, setRowsPerPage] = useState<number>(25)

  useEffect(() => {
    // Load products
    fetch('/api/inventory/products?limit=100')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.data) {
          setProducts(data.data)
        }
      })
      .catch(() => {})

    // Load categories
    fetch('/api/inventory/categories/tree')
      .then(res => res.ok ? res.json() : null)
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
    setPage(0) // Reset to first page when generating new report

    try {
      // Build query parameters
      const params = new URLSearchParams()

      if (dateFrom) params.append('dateFrom', dateFrom)
      if (dateTo) params.append('dateTo', dateTo)
      if (selectedCategory) params.append('categoryId', selectedCategory)
      if (selectedProducts.length > 0) {
        selectedProducts.forEach(productId => params.append('productIds', productId))
      }

      // Call the backend API
      const response = await fetch(`/api/sales/analytics/product-summary?${params.toString()}`)

      if (!response.ok) {
        throw new Error('Failed to fetch report data')
      }

      const data = await response.json()
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
    setPage(0)
    setRowsPerPage(25)
  }

  const handleExportExcel = () => {
    if (sortedData.length === 0) return

    // Column headers mapping
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

    // Build CSV content
    let csv = reportTitle + '\n\n'

    // Add headers
    const headers = selectedColumns.map(col => columnHeaders[col] || col)
    csv += headers.join(',') + '\n'

    // Add data rows
    if (groupedData) {
      // Export grouped data
      Object.entries(groupedData).forEach(([categoryName, items]) => {
        // Category header
        csv += `\n"${categoryName}"\n`

        // Items
        items.forEach(row => {
          const values = selectedColumns.map(col => {
            const value = (row as any)[col]
            if (col === 'soldQty' || col === 'purchaseQty') {
              return value.toLocaleString()
            } else if (typeof value === 'number') {
              return value.toFixed(2)
            }
            return `"${value || ''}"`
          })
          csv += values.join(',') + '\n'
        })

        // Subtotal
        const subtotal = calculateCategorySubtotal(items)
        csv += '"Subtotal - ' + categoryName + '",'
        const subtotalValues = selectedColumns.slice(1).map(col => {
          const value = (subtotal as any)[col]
          if (col === 'soldQty' || col === 'purchaseQty') {
            return value?.toLocaleString() || ''
          } else if (typeof value === 'number') {
            return value.toFixed(2)
          }
          return ''
        })
        csv += subtotalValues.join(',') + '\n'
      })
    } else {
      // Export ungrouped data
      sortedData.forEach(row => {
        const values = selectedColumns.map(col => {
          const value = (row as any)[col]
          if (col === 'soldQty' || col === 'purchaseQty') {
            return value.toLocaleString()
          } else if (typeof value === 'number') {
            return value.toFixed(2)
          }
          return `"${value || ''}"`
        })
        csv += values.join(',') + '\n'
      })
    }

    // Add totals
    if (totals) {
      csv += '\n"TOTAL",'
      const totalValues = selectedColumns.slice(1).map(col => {
        const value = (totals as any)[col]
        if (col === 'soldQty' || col === 'purchaseQty') {
          return value?.toLocaleString() || ''
        } else if (typeof value === 'number') {
          return value.toFixed(2)
        }
        return ''
      })
      csv += totalValues.join(',') + '\n'
    }

    // Download
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `${reportTitle.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleExportPDF = () => {
    if (sortedData.length === 0) return

    // Create a printable version
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

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
        tableRows += `<tr style="background-color: #e3f2fd; font-weight: bold;"><td colspan="${selectedColumns.length}">${categoryName}</td></tr>`

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
            tableRows += `<td>${displayValue || ''}</td>`
          })
          tableRows += '</tr>'
        })

        // Subtotal
        const subtotal = calculateCategorySubtotal(items)
        tableRows += '<tr style="background-color: #f5f5f5; font-style: italic;">'
        selectedColumns.forEach((col, idx) => {
          if (idx === 0) {
            tableRows += `<td>Subtotal - ${categoryName}</td>`
          } else {
            const value = (subtotal as any)[col]
            let displayValue = ''
            if (col === 'soldQty' || col === 'purchaseQty') {
              displayValue = value?.toLocaleString() || ''
            } else if (typeof value === 'number') {
              displayValue = formatCurrency(value)
            }
            tableRows += `<td>${displayValue}</td>`
          }
        })
        tableRows += '</tr>'
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
          tableRows += `<td>${displayValue || ''}</td>`
        })
        tableRows += '</tr>'
      })
    }

    // Add totals
    if (totals) {
      tableRows += '<tr style="background-color: #e0e0e0; font-weight: bold;">'
      selectedColumns.forEach((col, idx) => {
        if (idx === 0) {
          tableRows += '<td>TOTAL</td>'
        } else {
          const value = (totals as any)[col]
          let displayValue = ''
          if (col === 'soldQty' || col === 'purchaseQty') {
            displayValue = value?.toLocaleString() || ''
          } else if (typeof value === 'number') {
            displayValue = formatCurrency(value)
          }
          tableRows += `<td>${displayValue}</td>`
        }
      })
      tableRows += '</tr>'
    }

    // Build date range text
    let dateRangeText = ''
    if (dateFrom && dateTo) {
      dateRangeText = `<p><strong>Date Range:</strong> ${new Date(dateFrom).toLocaleDateString()} - ${new Date(dateTo).toLocaleDateString()}</p>`
    } else if (dateFrom) {
      dateRangeText = `<p><strong>Date From:</strong> ${new Date(dateFrom).toLocaleDateString()}</p>`
    } else if (dateTo) {
      dateRangeText = `<p><strong>Date To:</strong> ${new Date(dateTo).toLocaleDateString()}</p>`
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${reportTitle}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { text-align: center; margin-bottom: 10px; }
            .header-info { text-align: center; margin-bottom: 20px; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #1976d2; color: white; font-weight: bold; }
            tr:nth-child(even) { background-color: #f9f9f9; }
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
                border-top: 1px solid #ddd;
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
          <h1>${reportTitle}</h1>
          <div class="header-info">
            <p style="margin: 5px 0;"><strong>Generated on:</strong> ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</p>
            ${dateRangeText}
          </div>
          <table>
            <thead>
              <tr>
                ${selectedColumns.map(col => `<th>${columnHeaders[col] || col}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          <div class="footer">
            <script>
              var pageNum = 1;
              document.write("Page " + pageNum);
            </script>
          </div>
          <script>
            // Set document title for PDF filename
            document.title = '${reportTitle.replace(/'/g, "\\'")}';

            window.onload = function() {
              // Small delay to ensure content is rendered
              setTimeout(function() {
                window.print();
              }, 250);
            }
          </script>
        </body>
      </html>
    `

    printWindow.document.write(html)
    printWindow.document.close()
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
  const paginatedData = sortedData.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)

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
  const handleChangePage = (_: unknown, newPage: number) => {
    setPage(newPage)
  }

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10))
    setPage(0)
  }

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
            startIcon={!isMobile ? <GenerateIcon /> : undefined}
            onClick={handleGenerateReport}
            disabled={loading}
            size="medium"
            fullWidth={isMobile}
          >
            {loading ? 'Generating...' : 'Generate Report'}
          </Button>
        </Box>
      </Box>

      {/* Split Layout */}
      <Grid container spacing={3} sx={{ alignItems: 'stretch' }}>
        {/* Left Side - Filters and Display */}
        <Grid item xs={12} md={3} sx={{ display: 'flex' }}>
          <Stack spacing={2} sx={{ flex: 1 }}>
            {/* Filters Section */}
            <Paper sx={{ display: 'flex', flexDirection: 'column' }}>
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

              <Box sx={{ p: 2 }}>
                <Stack spacing={2}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontSize: '0.75rem' }}>
                  SO Date Range
                </Typography>
                <TextField
                  label="Date From"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  InputLabelProps={{ shrink: true, sx: { fontSize: '0.75rem' } }}
                  inputProps={{ sx: { fontSize: '0.75rem' } }}
                  size="small"
                  fullWidth
                />

                <TextField
                  label="Date To"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  InputLabelProps={{ shrink: true, sx: { fontSize: '0.75rem' } }}
                  inputProps={{ sx: { fontSize: '0.75rem' } }}
                  size="small"
                  fullWidth
                />

                <FormControl fullWidth size="small" sx={{ mt: 2, '& .MuiInputLabel-root': { fontSize: '0.75rem' }, '& .MuiSelect-select': { fontSize: '0.75rem' } }}>
                  <InputLabel>Products</InputLabel>
                  <Select
                    value={selectedProduct}
                    label="Products"
                    onChange={(e) => handleProductSelectChange(e.target.value)}
                    MenuProps={{ PaperProps: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } }}
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
                    MenuProps={{ PaperProps: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } }}
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
            <Paper sx={{ display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
                <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                  fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                  fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Display
                </Typography>
              </Box>

              <Box sx={{ p: 2 }}>
                <Stack spacing={2}>
                <FormControl fullWidth size="small" sx={{ '& .MuiInputLabel-root': { fontSize: '0.75rem' }, '& .MuiSelect-select': { fontSize: '0.75rem' } }}>
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
                    MenuProps={{ PaperProps: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } }}
                  >
                    <MenuItem value="all">
                      <Checkbox
                        checked={selectedColumns.length === 9}
                        indeterminate={selectedColumns.length > 0 && selectedColumns.length < 9}
                      />
                      <ListItemText primary="All" />
                    </MenuItem>
                    <MenuItem value="productName">
                      <Checkbox checked={selectedColumns.includes('productName')} />
                      <ListItemText primary="Product" />
                    </MenuItem>
                    <MenuItem value="category">
                      <Checkbox checked={selectedColumns.includes('category')} />
                      <ListItemText primary="Category" />
                    </MenuItem>
                    <MenuItem value="soldQty">
                      <Checkbox checked={selectedColumns.includes('soldQty')} />
                      <ListItemText primary="Sold Qty" />
                    </MenuItem>
                    <MenuItem value="totalSales">
                      <Checkbox checked={selectedColumns.includes('totalSales')} />
                      <ListItemText primary="Total Sales" />
                    </MenuItem>
                    <MenuItem value="cost">
                      <Checkbox checked={selectedColumns.includes('cost')} />
                      <ListItemText primary="Cost" />
                    </MenuItem>
                    <MenuItem value="salesProfit">
                      <Checkbox checked={selectedColumns.includes('salesProfit')} />
                      <ListItemText primary="Sales Profit" />
                    </MenuItem>
                    <MenuItem value="purchaseQty">
                      <Checkbox checked={selectedColumns.includes('purchaseQty')} />
                      <ListItemText primary="Purchase Qty" />
                    </MenuItem>
                    <MenuItem value="purchaseSubtotal">
                      <Checkbox checked={selectedColumns.includes('purchaseSubtotal')} />
                      <ListItemText primary="Purchase Subtotal" />
                    </MenuItem>
                    <MenuItem value="totalProfit">
                      <Checkbox checked={selectedColumns.includes('totalProfit')} />
                      <ListItemText primary="Total Profit" />
                    </MenuItem>
                  </Select>
                </FormControl>

                <FormControl fullWidth size="small" sx={{ mt: 2, '& .MuiInputLabel-root': { fontSize: '0.75rem' }, '& .MuiSelect-select': { fontSize: '0.75rem' } }}>
                  <InputLabel>Group By</InputLabel>
                  <Select
                    value={groupBy}
                    label="Group By"
                    onChange={(e) => setGroupBy(e.target.value)}
                    MenuProps={{ PaperProps: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } }}
                  >
                    <MenuItem value="none">None</MenuItem>
                    <MenuItem value="category">Category</MenuItem>
                  </Select>
                </FormControl>

                <FormControl fullWidth size="small" sx={{ mt: 2, '& .MuiInputLabel-root': { fontSize: '0.75rem' }, '& .MuiSelect-select': { fontSize: '0.75rem' } }}>
                  <InputLabel>First Sort By</InputLabel>
                  <Select
                    value={sortBy1}
                    label="First Sort By"
                    onChange={(e) => setSortBy1(e.target.value)}
                    MenuProps={{ PaperProps: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } }}
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

                <FormControl fullWidth size="small" sx={{ mt: 2, '& .MuiInputLabel-root': { fontSize: '0.75rem' }, '& .MuiSelect-select': { fontSize: '0.75rem' } }}>
                  <InputLabel>Then Sort By</InputLabel>
                  <Select
                    value={sortBy2}
                    label="Then Sort By"
                    onChange={(e) => setSortBy2(e.target.value)}
                    MenuProps={{ PaperProps: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } }}
                  >
                    <MenuItem value="none">None</MenuItem>
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
                  <InputLabel>Then Sort By</InputLabel>
                  <Select
                    value={sortBy3}
                    label="Then Sort By"
                    onChange={(e) => setSortBy3(e.target.value)}
                    MenuProps={{ PaperProps: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } }}
                  >
                    <MenuItem value="none">None</MenuItem>
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
                  InputLabelProps={{ sx: { fontSize: '0.75rem' } }}
                  inputProps={{ sx: { fontSize: '0.75rem' } }}
                  size="small"
                  fullWidth
                />
                </Stack>
              </Box>
            </Paper>
          </Stack>
        </Grid>

        {/* Right Side - Report Preview */}
        <Grid item xs={12} md={9} sx={{ display: 'flex' }}>
          {reportData.length === 0 ? (
            <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
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
            <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
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
                    onClick={handleExportExcel}
                  >
                    Excel
                  </Button>
                  <Button
                    size="small"
                    startIcon={<PdfIcon />}
                    onClick={handleExportPDF}
                  >
                    PDF
                  </Button>
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
                      fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                      backgroundColor: 'grey.50',
                      color: TYPOGRAPHY_STYLES.tableHeader.color,
                      fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                      textAlign: 'center'
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
                      Object.entries(groupedData).map(([categoryName, items]) => {
                        const subtotal = calculateCategorySubtotal(items)
                        return (
                          <React.Fragment key={categoryName}>
                            {/* Category Header Row */}
                            <TableRow
                              sx={{
                                backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(33, 150, 243, 0.1)' : 'primary.lighter',
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
                                backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'grey.50',
                                '& .MuiTableCell-root': {
                                  fontWeight: 600,
                                  fontSize: '0.8rem',
                                  fontStyle: 'italic'
                                }
                              }}
                            >
                              {selectedColumns.includes('productName') && (
                                <TableCell sx={{ pl: 4 }}>
                                  Subtotal - {categoryName}
                                </TableCell>
                              )}
                              {selectedColumns.includes('category') && (
                                <TableCell />
                              )}
                              {selectedColumns.includes('soldQty') && (
                                <TableCell align="right">
                                  {subtotal.soldQty.toLocaleString()}
                                </TableCell>
                              )}
                              {selectedColumns.includes('totalSales') && (
                                <TableCell align="right">
                                  {formatCurrency(subtotal.totalSales)}
                                </TableCell>
                              )}
                              {selectedColumns.includes('cost') && (
                                <TableCell align="right">
                                  {formatCurrency(subtotal.cost)}
                                </TableCell>
                              )}
                              {selectedColumns.includes('salesProfit') && (
                                <TableCell align="right" sx={{
                                  color: subtotal.salesProfit > 0 ? 'success.main' : 'error.main'
                                }}>
                                  {formatCurrency(subtotal.salesProfit)}
                                </TableCell>
                              )}
                              {selectedColumns.includes('purchaseQty') && (
                                <TableCell align="right">
                                  {subtotal.purchaseQty.toLocaleString()}
                                </TableCell>
                              )}
                              {selectedColumns.includes('purchaseSubtotal') && (
                                <TableCell align="right">
                                  {formatCurrency(subtotal.purchaseSubtotal)}
                                </TableCell>
                              )}
                              {selectedColumns.includes('totalProfit') && (
                                <TableCell align="right" sx={{
                                  color: subtotal.totalProfit > 0 ? 'success.main' : 'error.main'
                                }}>
                                  {formatCurrency(subtotal.totalProfit)}
                                </TableCell>
                              )}
                            </TableRow>
                          </React.Fragment>
                        )
                      })
                    ) : (
                      // Render ungrouped with pagination
                      paginatedData.map((row) => (
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
                      ))
                    )}
                    {/* Total Row */}
                    {totals && (
                      <TableRow
                        sx={{
                          backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'grey.100',
                          borderTop: '2px solid',
                          borderColor: 'divider',
                          '& .MuiTableCell-root': {
                            fontWeight: 700,
                            fontSize: '0.85rem'
                          }
                        }}
                      >
                        {selectedColumns.includes('productName') && (
                          <TableCell sx={{ fontWeight: 700 }}>
                            TOTAL
                          </TableCell>
                        )}
                        {selectedColumns.includes('category') && (
                          <TableCell />
                        )}
                        {selectedColumns.includes('soldQty') && (
                          <TableCell align="right">
                            {totals.soldQty.toLocaleString()}
                          </TableCell>
                        )}
                        {selectedColumns.includes('totalSales') && (
                          <TableCell align="right">
                            {formatCurrency(totals.totalSales)}
                          </TableCell>
                        )}
                        {selectedColumns.includes('cost') && (
                          <TableCell align="right">
                            {formatCurrency(totals.cost)}
                          </TableCell>
                        )}
                        {selectedColumns.includes('salesProfit') && (
                          <TableCell align="right" sx={{
                            color: totals.salesProfit > 0 ? 'success.main' : 'error.main'
                          }}>
                            {formatCurrency(totals.salesProfit)}
                          </TableCell>
                        )}
                        {selectedColumns.includes('purchaseQty') && (
                          <TableCell align="right">
                            {totals.purchaseQty.toLocaleString()}
                          </TableCell>
                        )}
                        {selectedColumns.includes('purchaseSubtotal') && (
                          <TableCell align="right">
                            {formatCurrency(totals.purchaseSubtotal)}
                          </TableCell>
                        )}
                        {selectedColumns.includes('totalProfit') && (
                          <TableCell align="right" sx={{
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
                  <TablePagination
                    component="div"
                    count={sortedData.length}
                    page={page}
                    onPageChange={handleChangePage}
                    rowsPerPage={rowsPerPage}
                    onRowsPerPageChange={handleChangeRowsPerPage}
                    rowsPerPageOptions={[10, 25, 50, 100]}
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
          <Grid container spacing={1} sx={{ flex: 1, minHeight: 0 }}>
            {/* Left Side - Product List */}
            <Grid item xs={5.25} sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
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
                            <Typography color="text.secondary" sx={{ fontSize: '0.75rem' }}>
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
            <Grid item xs={1.5} sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 1.5 }}>
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
            <Grid item xs={5.25} sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
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
                            <Typography color="text.secondary" sx={{ fontSize: '0.75rem' }}>
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
