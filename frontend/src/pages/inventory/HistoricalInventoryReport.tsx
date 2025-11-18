import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
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
import {
  PictureAsPdf as PdfIcon,
  TableChart as ExcelIcon,
  Refresh as RefreshIcon,
  PlayArrow as GenerateIcon,
  History as HistoryIcon,
  Close as CloseIcon,
  KeyboardArrowRight as KeyboardArrowRightIcon,
  KeyboardArrowLeft as KeyboardArrowLeftIcon,
  KeyboardDoubleArrowRight as KeyboardDoubleArrowRightIcon,
  KeyboardDoubleArrowLeft as KeyboardDoubleArrowLeftIcon,
} from '@mui/icons-material'
import { formatCurrency } from '@/utils/formatters'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'

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
  const navigate = useNavigate()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const [loading, setLoading] = useState(false)
  const [reportData, setReportData] = useState<HistoricalInventory[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [selectedProducts, setSelectedProducts] = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('')

  const [productDialogOpen, setProductDialogOpen] = useState(false)
  const [productSearchFilter, setProductSearchFilter] = useState<string>('')
  const [productCategoryFilter, setProductCategoryFilter] = useState<string>('')
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([])
  const [selectedRemovedIds, setSelectedRemovedIds] = useState<string[]>([])
  const [lastClickedProductId, setLastClickedProductId] = useState<string | null>(null)
  const [lastClickedRemovedId, setLastClickedRemovedId] = useState<string | null>(null)

  // Display options
  const [selectedColumns, setSelectedColumns] = useState<string[]>([
    'movementDate', 'productName', 'categoryName', 'movementDescription', 'quantity', 'previousBalance', 'newBalance', 'unitValue', 'totalValue'
  ])
  const [groupBy, setGroupBy] = useState<string>('none')
  const [sortBy1, setSortBy1] = useState<string>('movementDate')
  const [reportTitle, setReportTitle] = useState<string>('Historical Inventory Report')

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
        const categoryData = data?.data || data
        if (Array.isArray(categoryData)) {
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
    setPage(0)

    try {
      const params = new URLSearchParams()

      if (selectedCategory) params.append('categoryId', selectedCategory)
      if (selectedProducts.length > 0) {
        selectedProducts.forEach(id => params.append('productIds', id))
      }

      const response = await fetch(`/api/inventory/analytics/historical-inventory?${params.toString()}`)

      if (!response.ok) {
        throw new Error('Failed to fetch report data')
      }

      const result = await response.json()
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
    setReportData([])
    setSelectedColumns(['movementDate', 'productName', 'categoryName', 'movementDescription', 'quantity', 'previousBalance', 'newBalance', 'unitValue', 'totalValue'])
    setGroupBy('none')
    setSortBy1('movementDate')
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

  const handleExportExcel = () => {
    if (sortedData.length === 0) return

    const columnHeaders: { [key: string]: string } = {
      movementDate: 'Date',
      productName: 'Product',
      categoryName: 'Category',
      movementDescription: 'Movement Type',
      quantity: 'Quantity',
      previousBalance: 'Previous Balance',
      newBalance: 'New Balance',
      unitValue: 'Unit Value',
      totalValue: 'Total Value',
      referenceNumber: 'Reference',
      reason: 'Reason',
      notes: 'Notes'
    }

    let csv = reportTitle + '\n\n'
    const headers = selectedColumns.map(col => columnHeaders[col] || col)
    csv += headers.join(',') + '\n'

    let prevGroupKey: any = null

    const getExportGroupKey = (r: any) => {
      return r[groupBy]
    }

    const getExportGroupLabel = (r: any) => {
      if (groupBy === 'productName') {
        return `Product: ${r.productName}`
      } else if (groupBy === 'categoryName') {
        return `Category: ${r.categoryName}`
      } else if (groupBy === 'movementDescription') {
        return `Movement Type: ${r.movementDescription}`
      }
      return r[groupBy]
    }

    sortedData.forEach((row, idx) => {
      const currentGroupKey = groupBy !== 'none' ? getExportGroupKey(row) : null

      if (groupBy !== 'none' && currentGroupKey !== prevGroupKey) {
        const groupLabel = getExportGroupLabel(row)
        csv += `\n"${groupLabel}"\n`
        prevGroupKey = currentGroupKey
      }

      const values = selectedColumns.map(col => {
        if (col === 'movementDate') {
          return `"${new Date(row.movementDate).toLocaleDateString()}"`
        }
        const value = (row as any)[col]
        if (['productName', 'categoryName', 'movementDescription', 'referenceNumber', 'reason', 'notes'].includes(col)) {
          return `"${value || ''}"`
        } else if (typeof value === 'number') {
          return value.toFixed(2)
        }
        return `"${value || ''}"`
      })
      csv += values.join(',') + '\n'
    })

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

    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const columnHeaders: { [key: string]: string } = {
      movementDate: 'Date',
      productName: 'Product',
      categoryName: 'Category',
      movementDescription: 'Movement Type',
      quantity: 'Quantity',
      previousBalance: 'Previous Balance',
      newBalance: 'New Balance',
      unitValue: 'Unit Value',
      totalValue: 'Total Value',
      referenceNumber: 'Reference',
      reason: 'Reason',
      notes: 'Notes'
    }

    let tableRows = ''
    let prevGroupKey: any = null

    const getPdfGroupKey = (r: any) => {
      return r[groupBy]
    }

    const getPdfGroupLabel = (r: any) => {
      if (groupBy === 'productName') {
        return `Product: ${r.productName}`
      } else if (groupBy === 'categoryName') {
        return `Category: ${r.categoryName}`
      } else if (groupBy === 'movementDescription') {
        return `Movement Type: ${r.movementDescription}`
      }
      return r[groupBy]
    }

    sortedData.forEach((row) => {
      const currentGroupKey = groupBy !== 'none' ? getPdfGroupKey(row) : null

      if (groupBy !== 'none' && currentGroupKey !== prevGroupKey) {
        const groupLabel = getPdfGroupLabel(row)
        tableRows += `<tr style="background-color: #d3d3d3; font-weight: bold;"><td colspan="${selectedColumns.length}">${groupLabel}</td></tr>`
        prevGroupKey = currentGroupKey
      }

      tableRows += '<tr>'
      selectedColumns.forEach(col => {
        let displayValue: any
        let align = ''

        if (col === 'movementDate') {
          displayValue = new Date(row.movementDate).toLocaleDateString()
        } else if (col === 'quantity') {
          displayValue = row.quantity.toFixed(2)
          align = 'text-align: right;'
        } else if (col === 'previousBalance' || col === 'newBalance') {
          displayValue = (row as any)[col].toFixed(2)
          align = 'text-align: right;'
        } else if (col === 'unitValue' || col === 'totalValue') {
          displayValue = formatCurrency((row as any)[col])
          align = 'text-align: right;'
        } else {
          const value = (row as any)[col]
          displayValue = value || ''
        }

        tableRows += `<td style="${align}">${displayValue}</td>`
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
        filterText.push(`<p><strong>Category:</strong> ${category.name}</p>`)
      }
    }
    const filtersText = filterText.join('')

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
              @page { margin: 0; }
            }
          </style>
        </head>
        <body>
          <h1>${reportTitle}</h1>
          <div class="header-info">
            <p style="margin: 5px 0;"><strong>Generated on:</strong> ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</p>
            ${filtersText}
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
          <script>
            window.onload = function() {
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

  const getSortedData = () => {
    if (reportData.length === 0) return []

    let filtered = [...reportData]

    const compareValues = (a: any, b: any, field: string) => {
      let aVal: any
      let bVal: any

      if (field === 'movementDate') {
        aVal = new Date(a.movementDate).getTime()
        bVal = new Date(b.movementDate).getTime()
      } else {
        aVal = a[field]
        bVal = b[field]
      }

      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.toLowerCase().localeCompare(bVal.toLowerCase())
      }

      return aVal - bVal
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

  const sortedData = getSortedData()
  const paginatedData = sortedData.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)

  const handleChangePage = (_: unknown, newPage: number) => {
    setPage(newPage)
  }

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10))
    setPage(0)
  }

  const getMovementTypeColor = (type: string) => {
    if (type.includes('sale') || type.includes('decrease') || type.includes('damage') || type.includes('loss') || type.includes('theft') || type.includes('expiry')) {
      return 'error'
    }
    if (type.includes('purchase') || type.includes('increase') || type.includes('receipt') || type.includes('return')) {
      return 'success'
    }
    return 'default'
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
            <HistoryIcon sx={{
              fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize,
              color: TYPOGRAPHY_STYLES.pageHeader.icon.color
            }} />
            Historical Inventory
          </Typography>
          <Typography variant={TYPOGRAPHY_STYLES.pageSubtitle.variant} color={TYPOGRAPHY_STYLES.pageSubtitle.color}>
            {reportData.length > 0
              ? `${reportData.length} stock movements`
              : 'View comprehensive history of all inventory movements'}
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
        <Grid item xs={12} md={3} sx={{ display: 'flex', height: '100%' }}>
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
                      MenuProps={{ PaperProps: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } }}
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
                  <FormControl fullWidth size="small" sx={{ '& .MuiInputLabel-root': { fontSize: '0.75rem' }, '& .MuiSelect-select': { fontSize: '0.75rem' } }}>
                    <InputLabel>Columns</InputLabel>
                    <Select
                      multiple
                      value={selectedColumns}
                      label="Columns"
                      onChange={(e) => {
                        const value = typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value

                        if (value.includes('all')) {
                          const allColumns = ['movementDate', 'productName', 'categoryName', 'movementDescription', 'quantity', 'previousBalance', 'newBalance', 'unitValue', 'totalValue', 'referenceNumber', 'reason', 'notes']
                          if (selectedColumns.length === allColumns.length) {
                            setSelectedColumns([])
                          } else {
                            setSelectedColumns(allColumns)
                          }
                        } else {
                          setSelectedColumns(value as string[])
                        }
                      }}
                      MenuProps={{ PaperProps: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } }}
                      renderValue={(selected) => `${selected.length} column${selected.length !== 1 ? 's' : ''} selected`}
                    >
                      <MenuItem value="all">All</MenuItem>
                      <MenuItem value="movementDate">Date</MenuItem>
                      <MenuItem value="productName">Product</MenuItem>
                      <MenuItem value="categoryName">Category</MenuItem>
                      <MenuItem value="movementDescription">Movement Type</MenuItem>
                      <MenuItem value="quantity">Quantity</MenuItem>
                      <MenuItem value="previousBalance">Previous Balance</MenuItem>
                      <MenuItem value="newBalance">New Balance</MenuItem>
                      <MenuItem value="unitValue">Unit Value</MenuItem>
                      <MenuItem value="totalValue">Total Value</MenuItem>
                      <MenuItem value="referenceNumber">Reference</MenuItem>
                      <MenuItem value="reason">Reason</MenuItem>
                      <MenuItem value="notes">Notes</MenuItem>
                    </Select>
                  </FormControl>

                  <FormControl fullWidth size="small" sx={{ '& .MuiInputLabel-root': { fontSize: '0.75rem' }, '& .MuiSelect-select': { fontSize: '0.75rem' } }}>
                    <InputLabel>Group By</InputLabel>
                    <Select
                      value={groupBy}
                      label="Group By"
                      onChange={(e) => setGroupBy(e.target.value)}
                      MenuProps={{ PaperProps: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } }}
                    >
                      <MenuItem value="none">None</MenuItem>
                      <MenuItem value="productName">Product</MenuItem>
                      <MenuItem value="categoryName">Category</MenuItem>
                      <MenuItem value="movementDescription">Movement Type</MenuItem>
                    </Select>
                  </FormControl>

                  <FormControl fullWidth size="small" sx={{ '& .MuiInputLabel-root': { fontSize: '0.75rem' }, '& .MuiSelect-select': { fontSize: '0.75rem' } }}>
                    <InputLabel>Sort By</InputLabel>
                    <Select
                      value={sortBy1}
                      label="Sort By"
                      onChange={(e) => setSortBy1(e.target.value)}
                      MenuProps={{ PaperProps: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } }}
                    >
                      <MenuItem value="movementDate">Date</MenuItem>
                      <MenuItem value="productName">Product</MenuItem>
                      <MenuItem value="categoryName">Category</MenuItem>
                      <MenuItem value="movementDescription">Movement Type</MenuItem>
                      <MenuItem value="quantity">Quantity</MenuItem>
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
        <Grid item xs={12} md={9} sx={{ display: 'flex', height: '100%' }}>
          {reportData.length === 0 ? (
            <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', p: 4 }}>
                <Box sx={{ textAlign: 'center', maxWidth: 500 }}>
                  {loading ? (
                    <CircularProgress />
                  ) : (
                    <>
                      <HistoryIcon sx={{ fontSize: 80, color: 'text.disabled', mb: 2 }} />
                      <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
                        No Report Generated
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
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
                <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                  fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                  fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Report Preview ({reportData.length} records)
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
                        backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : '#fafafa',
                        color: TYPOGRAPHY_STYLES.tableHeader.color,
                        fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                        textAlign: 'center',
                        position: 'sticky',
                        top: 0,
                        zIndex: 10
                      } }}>
                        {selectedColumns.includes('movementDate') && <TableCell align="center">Date</TableCell>}
                        {selectedColumns.includes('productName') && <TableCell align="center">Product</TableCell>}
                        {selectedColumns.includes('categoryName') && <TableCell align="center">Category</TableCell>}
                        {selectedColumns.includes('movementDescription') && <TableCell align="center">Movement Type</TableCell>}
                        {selectedColumns.includes('quantity') && <TableCell align="center">Quantity</TableCell>}
                        {selectedColumns.includes('previousBalance') && <TableCell align="center">Previous Balance</TableCell>}
                        {selectedColumns.includes('newBalance') && <TableCell align="center">New Balance</TableCell>}
                        {selectedColumns.includes('unitValue') && <TableCell align="center">Unit Value</TableCell>}
                        {selectedColumns.includes('totalValue') && <TableCell align="center">Total Value</TableCell>}
                        {selectedColumns.includes('referenceNumber') && <TableCell align="center">Reference</TableCell>}
                        {selectedColumns.includes('reason') && <TableCell align="center">Reason</TableCell>}
                        {selectedColumns.includes('notes') && <TableCell align="center">Notes</TableCell>}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {paginatedData.map((row, idx) => {
                        const prevRow = idx > 0 ? paginatedData[idx - 1] : null

                        const getGroupKey = (r: any) => {
                          return r[groupBy]
                        }

                        const showGroupHeader = groupBy !== 'none' && (!prevRow || getGroupKey(row) !== getGroupKey(prevRow))

                        const getGroupLabel = (field: string, r: any) => {
                          if (field === 'productName') {
                            return `Product: ${r.productName}`
                          } else if (field === 'categoryName') {
                            return `Category: ${r.categoryName}`
                          } else if (field === 'movementDescription') {
                            return `Movement Type: ${r.movementDescription}`
                          }
                          return r[field]
                        }

                        return (
                          <React.Fragment key={idx}>
                            {showGroupHeader && (
                              <TableRow sx={{
                                backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'grey.200',
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
                              {selectedColumns.includes('movementDate') && (
                                <TableCell sx={{ fontSize: '0.8rem' }}>
                                  {new Date(row.movementDate).toLocaleDateString()}
                                </TableCell>
                              )}
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
                              {selectedColumns.includes('movementDescription') && (
                                <TableCell sx={{ fontSize: '0.8rem' }}>
                                  <Chip
                                    label={row.movementDescription}
                                    size="small"
                                    color={getMovementTypeColor(row.movementType) as any}
                                    sx={{ fontSize: '0.7rem' }}
                                  />
                                </TableCell>
                              )}
                              {selectedColumns.includes('quantity') && (
                                <TableCell align="right" sx={{
                                  fontSize: '0.8rem',
                                  color: row.quantity > 0 ? 'success.main' : 'error.main',
                                  fontWeight: 600
                                }}>
                                  {row.quantity > 0 ? '+' : ''}{row.quantity.toFixed(2)}
                                </TableCell>
                              )}
                              {selectedColumns.includes('previousBalance') && (
                                <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                                  {row.previousBalance.toFixed(2)}
                                </TableCell>
                              )}
                              {selectedColumns.includes('newBalance') && (
                                <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                                  {row.newBalance.toFixed(2)}
                                </TableCell>
                              )}
                              {selectedColumns.includes('unitValue') && (
                                <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                                  {formatCurrency(row.unitValue)}
                                </TableCell>
                              )}
                              {selectedColumns.includes('totalValue') && (
                                <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                                  {formatCurrency(row.totalValue)}
                                </TableCell>
                              )}
                              {selectedColumns.includes('referenceNumber') && (
                                <TableCell sx={{ fontSize: '0.8rem' }}>
                                  {row.referenceNumber || '-'}
                                </TableCell>
                              )}
                              {selectedColumns.includes('reason') && (
                                <TableCell sx={{ fontSize: '0.8rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {row.reason || '-'}
                                </TableCell>
                              )}
                              {selectedColumns.includes('notes') && (
                                <TableCell sx={{ fontSize: '0.8rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {row.notes || '-'}
                                </TableCell>
                              )}
                            </TableRow>
                          </React.Fragment>
                        )
                      })}
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
          >
            Apply
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default HistoricalInventoryReport
