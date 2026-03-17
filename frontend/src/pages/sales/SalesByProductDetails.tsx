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
  ListAlt as DetailIcon,
  Close as CloseIcon,
  KeyboardArrowRight as KeyboardArrowRightIcon,
  KeyboardArrowLeft as KeyboardArrowLeftIcon,
  KeyboardDoubleArrowRight as KeyboardDoubleArrowRightIcon,
  KeyboardDoubleArrowLeft as KeyboardDoubleArrowLeftIcon,
  ViewColumn as ViewColumnIcon,
} from '@mui/icons-material'
import { formatCurrency, formatDate, formatDateTime } from '@/utils/formatters'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'
import api from '@/services/api'

interface ProductDetail {
  transactionType: 'Sale' | 'Purchase'
  transactionDate: string
  documentNumber: string
  customerSupplier: string
  productId: string
  productName: string
  category: string
  quantity: number
  unitPrice: number
  priceLevel: string
  totalAmount: number
  cost: number
  profit: number
}

const SalesByProductDetails: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const [loading, setLoading] = useState(false)
  const [reportData, setReportData] = useState<ProductDetail[]>([])
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
    'productName', 'category', 'transactionDate', 'documentNumber', 'customerSupplier', 'priceLevel', 'quantity', 'totalAmount', 'cost', 'profit'
  ])
  const [groupBy, setGroupBy] = useState<string>('none')
  const [sortBy1, setSortBy1] = useState<string>('productName')
  const [sortBy2, setSortBy2] = useState<string>('none')
  const [sortBy3, setSortBy3] = useState<string>('none')
  const [reportTitle, setReportTitle] = useState<string>('Sales by Product Details')

  // Pagination
  const [page, setPage] = useState<number>(0)
  const [rowsPerPage, setRowsPerPage] = useState<number>(25)

  useEffect(() => {
    // Load products
    api.get('/inventory/products')
      .then(response => {
        if (response?.data?.data) {
          setProducts(response.data.data)
        }
      })
      .catch(() => {})

    // Load categories
    api.get('/inventory/categories/tree')
      .then(response => {
        // Handle both response formats: { data: [...] } or direct array
        const categoryData = response?.data?.data || response?.data
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

      // Call the backend API using authenticated API client
      const response = await api.get(`/sales/analytics/product-details?${params.toString()}`)

      setReportData(response.data?.data || [])
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
    setSelectedColumns(['productName', 'category', 'transactionDate', 'documentNumber', 'customerSupplier', 'priceLevel', 'quantity', 'totalAmount', 'cost', 'profit'])
    setGroupBy('none')
    setSortBy1('productName')
    setSortBy2('none')
    setSortBy3('none')
    setReportTitle('Sales by Product Details')

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
      transactionDate: 'Order Date',
      documentNumber: 'Order No',
      customerSupplier: 'Customer',
      priceLevel: 'Pricing',
      quantity: 'Qty Sold',
      totalAmount: 'Sales Amount',
      cost: 'Sales Cost',
      profit: 'Sales Profit'
    }

    // Build CSV content
    let csv = reportTitle + '\n\n'

    // Add headers
    const headers = selectedColumns.map(col => columnHeaders[col] || col)
    csv += headers.join(',') + '\n'

    // Add data rows
    if (groupedData) {
      // Export grouped data
      Object.entries(groupedData).forEach(([groupName, items]) => {
        // Group header
        csv += `\n"${groupName}"\n`

        // Items
        items.forEach(row => {
          const values = selectedColumns.map(col => {
            const value = (row as any)[col]
            if (col === 'transactionDate') {
              return `"${formatDate(value)}"`
            } else if (col === 'quantity') {
              return value.toLocaleString()
            } else if (typeof value === 'number') {
              return value.toFixed(2)
            }
            return `"${value || ''}"`
          })
          csv += values.join(',') + '\n'
        })

        // Subtotal
        const subtotal = calculateGroupSubtotal(items)
        const subtotalValues = selectedColumns.map((col, colIdx) => {
          if (colIdx === 0) {
            return '"Subtotal"'
          }
          const value = (subtotal as any)[col]
          if (col === 'quantity') {
            return value?.toLocaleString() || ''
          } else if (typeof value === 'number') {
            return value.toFixed(2)
          }
          return ''
        })
        csv += subtotalValues.join(',') + '\n'
        // Blank row after subtotal
        csv += '\n'
      })
    } else {
      // Export ungrouped data
      sortedData.forEach(row => {
        const values = selectedColumns.map(col => {
          const value = (row as any)[col]
          if (col === 'transactionDate') {
            return `"${formatDate(value)}"`
          } else if (col === 'quantity') {
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
      csv += '\n'
      const totalValues = selectedColumns.map((col, colIdx) => {
        if (colIdx === 0) {
          return '"GRAND TOTAL"'
        }
        const value = (totals as any)[col]
        if (col === 'quantity') {
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
      transactionDate: 'Order Date',
      documentNumber: 'Order No',
      customerSupplier: 'Customer',
      priceLevel: 'Pricing',
      quantity: 'Qty Sold',
      totalAmount: 'Sales Amount',
      cost: 'Sales Cost',
      profit: 'Sales Profit'
    }

    let tableRows = ''

    if (groupedData) {
      Object.entries(groupedData).forEach(([groupName, items]) => {
        // Group header
        tableRows += `<tr style="background-color: #e3f2fd; font-weight: bold;"><td colspan="${selectedColumns.length}">${groupName}</td></tr>`

        // Items
        items.forEach(row => {
          tableRows += '<tr>'
          selectedColumns.forEach(col => {
            const value = (row as any)[col]
            let displayValue = value
            if (col === 'transactionDate') {
              displayValue = formatDate(value)
            } else if (col === 'quantity') {
              displayValue = value.toLocaleString()
            } else if (typeof value === 'number') {
              displayValue = formatCurrency(value)
            }
            tableRows += `<td>${displayValue || ''}</td>`
          })
          tableRows += '</tr>'
        })

        // Subtotal
        const subtotal = calculateGroupSubtotal(items)
        tableRows += '<tr style="background-color: rgba(33, 150, 243, 0.1); font-weight: bold; border-top: 2px solid #1976d2;">'
        selectedColumns.forEach((col, idx) => {
          if (idx === 0) {
            tableRows += '<td style="font-weight: bold;">Subtotal</td>'
          } else if (col === 'quantity') {
            const value = (subtotal as any)[col]
            tableRows += `<td style="text-align: right; font-weight: bold;">${value?.toLocaleString() || ''}</td>`
          } else if (col === 'totalAmount' || col === 'cost' || col === 'profit') {
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
          if (col === 'transactionDate') {
            displayValue = formatDate(value)
          } else if (col === 'quantity') {
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
      tableRows += '<tr style="background-color: rgba(76, 175, 80, 0.2); font-weight: bold; border-top: 3px solid #4caf50;">'
      selectedColumns.forEach((col, idx) => {
        if (idx === 0) {
          tableRows += '<td style="font-weight: 800;">GRAND TOTAL</td>'
        } else if (col === 'quantity') {
          const value = (totals as any)[col]
          tableRows += `<td style="text-align: right; font-weight: 800;">${value?.toLocaleString() || ''}</td>`
        } else if (col === 'totalAmount' || col === 'cost' || col === 'profit') {
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
      dateRangeText = `<p><strong>Date Range:</strong> ${formatDate(dateFrom)} - ${formatDate(dateTo)}</p>`
    } else if (dateFrom) {
      dateRangeText = `<p><strong>Date From:</strong> ${formatDate(dateFrom)}</p>`
    } else if (dateTo) {
      dateRangeText = `<p><strong>Date To:</strong> ${formatDate(dateTo)}</p>`
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
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
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
            <p style="margin: 5px 0;"><strong>Generated on:</strong> ${formatDateTime(new Date())}</p>
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
        quantity: acc.quantity + item.quantity,
        totalAmount: acc.totalAmount + item.totalAmount,
        cost: acc.cost + item.cost,
        profit: acc.profit + item.profit,
      }),
      {
        quantity: 0,
        totalAmount: 0,
        cost: 0,
        profit: 0,
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

      // Date comparison - descending (newer to older)
      if (field === 'transactionDate') {
        return new Date(bVal).getTime() - new Date(aVal).getTime()
      }

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

  // Group data by selected grouping
  const getGroupedData = () => {
    if (groupBy !== 'none' && sortedData.length > 0) {
      if (groupBy === 'category-product') {
        // Hierarchical grouping: Category -> Product
        const categoryGroups: { [key: string]: { [key: string]: ProductDetail[] } } = {}

        sortedData.forEach(item => {
          const categoryKey = item.category || 'Uncategorized'
          const productKey = item.productName

          if (!categoryGroups[categoryKey]) {
            categoryGroups[categoryKey] = {}
          }
          if (!categoryGroups[categoryKey][productKey]) {
            categoryGroups[categoryKey][productKey] = []
          }
          categoryGroups[categoryKey][productKey].push(item)
        })

        // Flatten into single-level groups with hierarchical keys
        const flattened: { [key: string]: ProductDetail[] } = {}
        Object.entries(categoryGroups).forEach(([category, products]) => {
          Object.entries(products).forEach(([product, items]) => {
            flattened[`${category} > ${product}`] = items
          })
        })

        return flattened
      } else {
        // Single-level grouping
        const grouped = sortedData.reduce((acc: { [key: string]: ProductDetail[] }, item) => {
          let groupKey = ''

          switch (groupBy) {
            case 'category':
              groupKey = item.category || 'Uncategorized'
              break
            default:
              groupKey = 'Ungrouped'
          }

          if (!acc[groupKey]) {
            acc[groupKey] = []
          }
          acc[groupKey].push(item)
          return acc
        }, {})
        return grouped
      }
    }
    return null
  }

  const groupedData = getGroupedData()

  // Apply pagination to sorted data
  const paginatedData = sortedData.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)

  // Calculate subtotals for each group
  const calculateGroupSubtotal = (items: ProductDetail[]) => {
    return items.reduce(
      (acc, item) => ({
        quantity: acc.quantity + item.quantity,
        totalAmount: acc.totalAmount + item.totalAmount,
        cost: acc.cost + item.cost,
        profit: acc.profit + item.profit,
      }),
      {
        quantity: 0,
        totalAmount: 0,
        cost: 0,
        profit: 0,
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
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between',
        alignItems: isMobile ? 'stretch' : 'center',
        mb: 3,
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
            <DetailIcon sx={{
              fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize,
              color: TYPOGRAPHY_STYLES.pageHeader.icon.color
            }} />
            Sales by Product Details
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {reportData.length > 0
              ? `Detailed transaction report (${reportData.length} transactions)`
              : 'View transaction-level product details'}
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
                <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                  fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                  fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Filters
                </Typography>
              </Box>

              <Box sx={{ p: 2, overflow: 'auto', flex: 1 }}>
                <Stack spacing={2}>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontSize: '0.75rem' }}>
                  Invoice Date Range
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
            <Paper sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border, flexShrink: 0 }}>
                <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                  fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                  fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
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
                        const allColumns = ['productName', 'category', 'transactionDate', 'documentNumber', 'customerSupplier', 'priceLevel', 'quantity', 'totalAmount', 'cost', 'profit']
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
                    <MenuItem value="all">All</MenuItem>
                    <MenuItem value="productName">Product</MenuItem>
                    <MenuItem value="category">Category</MenuItem>
                    <MenuItem value="transactionDate">Order Date</MenuItem>
                    <MenuItem value="documentNumber">Order No</MenuItem>
                    <MenuItem value="customerSupplier">Customer</MenuItem>
                    <MenuItem value="priceLevel">Pricing</MenuItem>
                    <MenuItem value="quantity">Qty Sold</MenuItem>
                    <MenuItem value="totalAmount">Sales Amount</MenuItem>
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
                    MenuProps={{ PaperProps: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } }}
                  >
                    <MenuItem value="none">None</MenuItem>
                    <MenuItem value="category-product">Category, Product</MenuItem>
                    <MenuItem value="category">Category</MenuItem>
                  </Select>
                </FormControl>

                <FormControl fullWidth size="small" sx={{ mt: 2, '& .MuiInputLabel-root': { fontSize: '0.75rem' }, '& .MuiSelect-select': { fontSize: '0.75rem' } }}>
                  <InputLabel>Sort By</InputLabel>
                  <Select
                    value={sortBy1}
                    label="Sort By"
                    onChange={(e) => setSortBy1(e.target.value)}
                    MenuProps={{ PaperProps: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } }}
                  >
                    <MenuItem value="productName">Product</MenuItem>
                    <MenuItem value="category">Category</MenuItem>
                    <MenuItem value="transactionDate">Order Date</MenuItem>
                    <MenuItem value="documentNumber">Order No</MenuItem>
                    <MenuItem value="customerSupplier">Customer</MenuItem>
                    <MenuItem value="priceLevel">Pricing</MenuItem>
                    <MenuItem value="quantity">Qty Sold</MenuItem>
                    <MenuItem value="totalAmount">Sales Amount</MenuItem>
                    <MenuItem value="cost">Sales Cost</MenuItem>
                    <MenuItem value="profit">Sales Profit</MenuItem>
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
                      <DetailIcon sx={{ fontSize: 80, color: 'text.disabled', mb: 2 }} />
                      <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
                        No Report Generated
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Configure the filters on the left and click "Generate Report" to view transaction details by product.
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
                  Report Preview ({reportData.length} transactions)
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
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      color: TYPOGRAPHY_STYLES.tableHeader.color,
                      fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                      textAlign: 'center',
                      position: 'sticky',
                      top: 0,
                      zIndex: 10
                    } }}>
                      {selectedColumns.includes('productName') && <TableCell align="center">Product</TableCell>}
                      {selectedColumns.includes('category') && <TableCell align="center">Category</TableCell>}
                      {selectedColumns.includes('transactionDate') && <TableCell align="center">Order Date</TableCell>}
                      {selectedColumns.includes('documentNumber') && <TableCell align="center">Order No</TableCell>}
                      {selectedColumns.includes('customerSupplier') && <TableCell align="center">Customer</TableCell>}
                      {selectedColumns.includes('priceLevel') && <TableCell align="center">Pricing</TableCell>}
                      {selectedColumns.includes('quantity') && <TableCell align="center">Qty Sold</TableCell>}
                      {selectedColumns.includes('totalAmount') && <TableCell align="center">Sales Amount</TableCell>}
                      {selectedColumns.includes('cost') && <TableCell align="center">Sales Cost</TableCell>}
                      {selectedColumns.includes('profit') && <TableCell align="center">Sales Profit</TableCell>}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {groupedData ? (
                      // Render grouped
                      (Object.entries(groupedData).map(([groupName, items]) => {
                        const subtotal = calculateGroupSubtotal(items)
                        return (
                          <React.Fragment key={groupName}>
                            {/* Group Header Row */}
                            <TableRow
                              sx={{
                                backgroundColor: 'rgba(33, 150, 243, 0.1)',
                                '& .MuiTableCell-root': {
                                  fontWeight: 700,
                                  fontSize: '0.85rem',
                                  color: 'primary.main'
                                }
                              }}
                            >
                              <TableCell colSpan={selectedColumns.length} sx={{ py: 1 }}>
                                {groupName}
                              </TableCell>
                            </TableRow>
                            {/* Group Items */}
                            {items.map((row, idx) => (
                              <TableRow
                                key={`${row.productId}-${row.documentNumber}-${idx}`}
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
                                {selectedColumns.includes('transactionDate') && (
                                  <TableCell sx={{ fontSize: '0.8rem' }}>
                                    {formatDate(row.transactionDate)}
                                  </TableCell>
                                )}
                                {selectedColumns.includes('documentNumber') && (
                                  <TableCell sx={{ fontSize: '0.8rem' }}>
                                    {row.documentNumber}
                                  </TableCell>
                                )}
                                {selectedColumns.includes('customerSupplier') && (
                                  <TableCell sx={{ fontSize: '0.8rem' }}>
                                    {row.customerSupplier}
                                  </TableCell>
                                )}
                                {selectedColumns.includes('priceLevel') && (
                                  <TableCell sx={{ fontSize: '0.8rem' }}>
                                    {row.priceLevel}
                                  </TableCell>
                                )}
                                {selectedColumns.includes('quantity') && (
                                  <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                                    {row.quantity.toLocaleString()}
                                  </TableCell>
                                )}
                                {selectedColumns.includes('totalAmount') && (
                                  <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                                    {formatCurrency(row.totalAmount)}
                                  </TableCell>
                                )}
                                {selectedColumns.includes('cost') && (
                                  <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                                    {formatCurrency(row.cost)}
                                  </TableCell>
                                )}
                                {selectedColumns.includes('profit') && (
                                  <TableCell align="right" sx={{
                                    fontSize: '0.8rem',
                                    color: row.profit > 0 ? 'success.main' : row.profit < 0 ? 'error.main' : 'inherit'
                                  }}>
                                    {formatCurrency(row.profit)}
                                  </TableCell>
                                )}
                              </TableRow>
                            ))}
                            {/* Group Subtotal Row */}
                            <TableRow
                              sx={{
                                backgroundColor: 'rgba(33, 150, 243, 0.2)',
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
                              {selectedColumns.includes('category') && <TableCell />}
                              {selectedColumns.includes('transactionDate') && <TableCell />}
                              {selectedColumns.includes('documentNumber') && <TableCell />}
                              {selectedColumns.includes('customerSupplier') && <TableCell />}
                              {selectedColumns.includes('priceLevel') && <TableCell />}
                              {selectedColumns.includes('quantity') && (
                                <TableCell align="right" sx={{ fontWeight: 700 }}>
                                  {subtotal.quantity.toLocaleString()}
                                </TableCell>
                              )}
                              {selectedColumns.includes('totalAmount') && (
                                <TableCell align="right" sx={{ fontWeight: 700 }}>
                                  {formatCurrency(subtotal.totalAmount)}
                                </TableCell>
                              )}
                              {selectedColumns.includes('cost') && (
                                <TableCell align="right" sx={{ fontWeight: 700 }}>
                                  {formatCurrency(subtotal.cost)}
                                </TableCell>
                              )}
                              {selectedColumns.includes('profit') && (
                                <TableCell align="right" sx={{
                                  fontWeight: 700,
                                  color: subtotal.profit > 0 ? 'success.main' : subtotal.profit < 0 ? 'error.main' : 'inherit'
                                }}>
                                  {formatCurrency(subtotal.profit)}
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
                      (paginatedData.map((row, idx) => (
                        <TableRow
                          key={`${row.productId}-${row.documentNumber}-${idx}`}
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
                          {selectedColumns.includes('transactionDate') && (
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {formatDate(row.transactionDate)}
                            </TableCell>
                          )}
                          {selectedColumns.includes('documentNumber') && (
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {row.documentNumber}
                            </TableCell>
                          )}
                          {selectedColumns.includes('customerSupplier') && (
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {row.customerSupplier}
                            </TableCell>
                          )}
                          {selectedColumns.includes('priceLevel') && (
                            <TableCell sx={{ fontSize: '0.8rem' }}>
                              {row.priceLevel}
                            </TableCell>
                          )}
                          {selectedColumns.includes('quantity') && (
                            <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                              {row.quantity.toLocaleString()}
                            </TableCell>
                          )}
                          {selectedColumns.includes('totalAmount') && (
                            <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                              {formatCurrency(row.totalAmount)}
                            </TableCell>
                          )}
                          {selectedColumns.includes('cost') && (
                            <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                              {formatCurrency(row.cost)}
                            </TableCell>
                          )}
                          {selectedColumns.includes('profit') && (
                            <TableCell align="right" sx={{
                              fontSize: '0.8rem',
                              color: row.profit > 0 ? 'success.main' : row.profit < 0 ? 'error.main' : 'inherit'
                            }}>
                              {formatCurrency(row.profit)}
                            </TableCell>
                          )}
                        </TableRow>
                      )))
                    )}
                    {/* Total Row */}
                    {totals && (
                      <TableRow
                        sx={{
                          backgroundColor: 'rgba(76, 175, 80, 0.3)',
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
                        {selectedColumns.includes('category') && <TableCell />}
                        {selectedColumns.includes('transactionDate') && <TableCell />}
                        {selectedColumns.includes('documentNumber') && <TableCell />}
                        {selectedColumns.includes('customerSupplier') && <TableCell />}
                        {selectedColumns.includes('priceLevel') && <TableCell />}
                        {selectedColumns.includes('quantity') && (
                          <TableCell align="right" sx={{ fontWeight: 800 }}>
                            {totals.quantity.toLocaleString()}
                          </TableCell>
                        )}
                        {selectedColumns.includes('totalAmount') && (
                          <TableCell align="right" sx={{ fontWeight: 800 }}>
                            {formatCurrency(totals.totalAmount)}
                          </TableCell>
                        )}
                        {selectedColumns.includes('cost') && (
                          <TableCell align="right" sx={{ fontWeight: 800 }}>
                            {formatCurrency(totals.cost)}
                          </TableCell>
                        )}
                        {selectedColumns.includes('profit') && (
                          <TableCell align="right" sx={{
                            fontWeight: 800,
                            color: totals.profit > 0 ? 'success.main' : totals.profit < 0 ? 'error.main' : 'inherit'
                          }}>
                            {formatCurrency(totals.profit)}
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
      {/* Product Selection Dialog - Same as Summary page */}
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
  );
}

export default SalesByProductDetails
