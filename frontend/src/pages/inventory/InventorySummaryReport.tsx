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
  Inventory2 as InventoryIcon,
  Close as CloseIcon,
  KeyboardArrowRight as KeyboardArrowRightIcon,
  KeyboardArrowLeft as KeyboardArrowLeftIcon,
  KeyboardDoubleArrowRight as KeyboardDoubleArrowRightIcon,
  KeyboardDoubleArrowLeft as KeyboardDoubleArrowLeftIcon,
} from '@mui/icons-material'
import { formatCurrency } from '@/utils/formatters'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'

interface InventorySummary {
  productName: string
  categoryName: string
  type: string
  baseCost: number
  retailPrice: number
  wholesalePrice: number
  specialPrice: number
  stockQuantity: number
  inventoryValue: number
  retailValue: number
  potentialProfit: number
  status: string
}

const InventorySummaryReport: React.FC = () => {
  const navigate = useNavigate()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const [loading, setLoading] = useState(false)
  const [reportData, setReportData] = useState<InventorySummary[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [selectedProducts, setSelectedProducts] = useState<string[]>([])
  const [selectedType, setSelectedType] = useState<string>('')
  const [selectedStatus, setSelectedStatus] = useState<string>('')

  // Options
  const [pricingType, setPricingType] = useState<string>('retailPrice')

  const [productDialogOpen, setProductDialogOpen] = useState(false)
  const [productSearchFilter, setProductSearchFilter] = useState<string>('')
  const [productCategoryFilter, setProductCategoryFilter] = useState<string>('')
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([])
  const [selectedRemovedIds, setSelectedRemovedIds] = useState<string[]>([])
  const [lastClickedProductId, setLastClickedProductId] = useState<string | null>(null)
  const [lastClickedRemovedId, setLastClickedRemovedId] = useState<string | null>(null)

  // Display options
  const [selectedColumns, setSelectedColumns] = useState<string[]>([
    'productName', 'categoryName', 'type', 'stockQuantity', 'inventoryValue', 'sellingValue', 'potentialProfit'
  ])
  const [groupBy, setGroupBy] = useState<string>('none')
  const [sortBy1, setSortBy1] = useState<string>('productName')
  const [reportTitle, setReportTitle] = useState<string>('Inventory Summary Report')

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
      if (selectedType) params.append('type', selectedType)
      if (selectedStatus) params.append('status', selectedStatus)
      if (selectedProducts.length > 0) {
        selectedProducts.forEach(id => params.append('productIds', id))
      }

      const response = await fetch(`/api/inventory/analytics/inventory-summary?${params.toString()}`)

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
    setSelectedCategory('')
    setSelectedType('')
    setSelectedStatus('')
    setSelectedProducts([])
    setPricingType('retailPrice')
    setReportData([])
    setSelectedColumns(['productName', 'categoryName', 'type', 'stockQuantity', 'inventoryValue', 'sellingValue', 'potentialProfit'])
    setGroupBy('none')
    setSortBy1('productName')
    setReportTitle('Inventory Summary Report')
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
      productName: 'Product',
      categoryName: 'Category',
      type: 'Type',
      stockQuantity: 'Stock Qty',
      baseCost: 'Base Cost',
      inventoryValue: 'Inventory Value',
      sellingPrice: 'Selling Price',
      sellingValue: 'Selling Value',
      potentialProfit: 'Potential Profit',
      status: 'Status'
    }

    let csv = reportTitle + '\n\n'
    const headers = selectedColumns.map(col => columnHeaders[col] || col)
    csv += headers.join(',') + '\n'

    let prevGroupKey: any = null

    const getExportGroupKey = (r: any) => {
      return r[groupBy]
    }

    const getExportGroupLabel = (r: any) => {
      if (groupBy === 'categoryName') {
        return `Category: ${r.categoryName}`
      } else if (groupBy === 'type') {
        return `Type: ${r.type}`
      } else if (groupBy === 'status') {
        return `Status: ${r.status}`
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
        if (col === 'sellingPrice') {
          const price = pricingType === 'retailPrice' ? row.retailPrice :
                       pricingType === 'wholesalePrice' ? row.wholesalePrice :
                       row.specialPrice
          return price.toFixed(2)
        } else if (col === 'sellingValue') {
          const price = pricingType === 'retailPrice' ? row.retailPrice :
                       pricingType === 'wholesalePrice' ? row.wholesalePrice :
                       row.specialPrice
          return (price * row.stockQuantity).toFixed(2)
        } else if (col === 'potentialProfit') {
          const price = pricingType === 'retailPrice' ? row.retailPrice :
                       pricingType === 'wholesalePrice' ? row.wholesalePrice :
                       row.specialPrice
          return ((price * row.stockQuantity) - row.inventoryValue).toFixed(2)
        }

        const value = (row as any)[col]
        if (['productName', 'categoryName', 'type', 'status'].includes(col)) {
          return `"${value || ''}"`
        } else if (typeof value === 'number') {
          return value.toFixed(2)
        }
        return `"${value || ''}"`
      })
      csv += values.join(',') + '\n'

      const nextRow = idx < sortedData.length - 1 ? sortedData[idx + 1] : null
      const nextGroupKey = nextRow && groupBy !== 'none' ? getExportGroupKey(nextRow) : null

      if (groupBy !== 'none' && (!nextRow || currentGroupKey !== nextGroupKey)) {
        const groupData = sortedData.filter(r => getExportGroupKey(r) === currentGroupKey)

        const subtotal = {
          stockQuantity: groupData.reduce((sum, r) => sum + r.stockQuantity, 0),
          inventoryValue: groupData.reduce((sum, r) => sum + r.inventoryValue, 0),
        }

        csv += '"Subtotal",'
        const subtotalValues = selectedColumns.slice(1).map(col => {
          const value = (subtotal as any)[col]
          if (typeof value === 'number') {
            return value.toFixed(2)
          }
          return ''
        })
        csv += subtotalValues.join(',') + '\n'
      }
    })

    if (totals) {
      csv += '\n"TOTAL",'
      const totalValues = selectedColumns.slice(1).map(col => {
        const value = (totals as any)[col]
        if (typeof value === 'number') {
          return value.toFixed(2)
        }
        return ''
      })
      csv += totalValues.join(',') + '\n'
    }

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
      productName: 'Product',
      categoryName: 'Category',
      type: 'Type',
      stockQuantity: 'Stock Qty',
      baseCost: 'Base Cost',
      inventoryValue: 'Inventory Value',
      sellingPrice: 'Selling Price',
      sellingValue: 'Selling Value',
      potentialProfit: 'Potential Profit',
      status: 'Status'
    }

    let tableRows = ''
    let prevGroupKey: any = null

    const getPdfGroupKey = (r: any) => {
      return r[groupBy]
    }

    const getPdfGroupLabel = (r: any) => {
      if (groupBy === 'categoryName') {
        return `Category: ${r.categoryName}`
      } else if (groupBy === 'type') {
        return `Type: ${r.type}`
      } else if (groupBy === 'status') {
        return `Status: ${r.status}`
      }
      return r[groupBy]
    }

    sortedData.forEach((row, idx) => {
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

        if (col === 'sellingPrice') {
          const price = pricingType === 'retailPrice' ? row.retailPrice :
                       pricingType === 'wholesalePrice' ? row.wholesalePrice :
                       row.specialPrice
          displayValue = formatCurrency(price)
          align = 'text-align: right;'
        } else if (col === 'sellingValue') {
          const price = pricingType === 'retailPrice' ? row.retailPrice :
                       pricingType === 'wholesalePrice' ? row.wholesalePrice :
                       row.specialPrice
          displayValue = formatCurrency(price * row.stockQuantity)
          align = 'text-align: right;'
        } else if (col === 'potentialProfit') {
          const price = pricingType === 'retailPrice' ? row.retailPrice :
                       pricingType === 'wholesalePrice' ? row.wholesalePrice :
                       row.specialPrice
          displayValue = formatCurrency((price * row.stockQuantity) - row.inventoryValue)
          align = 'text-align: right;'
        } else {
          const value = (row as any)[col]
          displayValue = value
          if (typeof value === 'number') {
            displayValue = formatCurrency(value)
            align = 'text-align: right;'
          } else if (col === 'type' || col === 'status') {
            displayValue = value ? value.charAt(0).toUpperCase() + value.slice(1) : ''
          }
        }

        tableRows += `<td style="${align}">${displayValue || ''}</td>`
      })
      tableRows += '</tr>'

      const nextRow = idx < sortedData.length - 1 ? sortedData[idx + 1] : null
      const nextGroupKey = nextRow && groupBy !== 'none' ? getPdfGroupKey(nextRow) : null

      if (groupBy !== 'none' && (!nextRow || currentGroupKey !== nextGroupKey)) {
        const groupData = sortedData.filter(r => getPdfGroupKey(r) === currentGroupKey)

        const subtotal = {
          stockQuantity: groupData.reduce((sum, r) => sum + r.stockQuantity, 0),
          inventoryValue: groupData.reduce((sum, r) => sum + r.inventoryValue, 0),
        }

        tableRows += '<tr style="background-color: #e8e8e8; font-weight: 600; font-style: italic; border-bottom: 2px solid #666;">'
        selectedColumns.forEach((col, colIdx) => {
          if (colIdx === 0) {
            tableRows += '<td>Subtotal</td>'
          } else {
            const value = (subtotal as any)[col]
            let displayValue = ''
            if (typeof value === 'number') {
              displayValue = formatCurrency(value)
            }
            const align = typeof value === 'number' ? 'text-align: right;' : ''
            tableRows += `<td style="${align}">${displayValue}</td>`
          }
        })
        tableRows += '</tr>'
      }
    })

    if (totals) {
      tableRows += '<tr style="background-color: #e0e0e0; font-weight: bold;">'
      selectedColumns.forEach((col, idx) => {
        if (idx === 0) {
          tableRows += '<td>TOTAL</td>'
        } else {
          const value = (totals as any)[col]
          let displayValue = ''
          if (typeof value === 'number') {
            displayValue = formatCurrency(value)
          }
          const align = typeof value === 'number' ? 'text-align: right;' : ''
          tableRows += `<td style="${align}">${displayValue}</td>`
        }
      })
      tableRows += '</tr>'
    }

    const filterText = []
    if (selectedCategory) {
      const category = categories.find(c => c.id === selectedCategory)
      if (category) {
        filterText.push(`<p><strong>Category:</strong> ${category.name}</p>`)
      }
    }
    if (selectedType) {
      filterText.push(`<p><strong>Type:</strong> ${selectedType}</p>`)
    }
    if (selectedStatus) {
      filterText.push(`<p><strong>Status:</strong> ${selectedStatus}</p>`)
    }
    if (selectedProducts.length > 0) {
      filterText.push(`<p><strong>Products:</strong> ${selectedProducts.length} selected</p>`)
    }
    const dateRangeText = filterText.join('')

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

  const calculateTotals = () => {
    if (reportData.length === 0) return null

    const totals = reportData.reduce(
      (acc, item) => ({
        stockQuantity: acc.stockQuantity + item.stockQuantity,
        inventoryValue: acc.inventoryValue + item.inventoryValue,
      }),
      {
        stockQuantity: 0,
        inventoryValue: 0,
      }
    )

    return totals
  }

  const totals = calculateTotals()

  const getSortedData = () => {
    if (reportData.length === 0) return []

    let filtered = [...reportData]

    const compareValues = (a: any, b: any, field: string) => {
      let aVal: any
      let bVal: any

      if (field === 'sellingPrice') {
        aVal = pricingType === 'retailPrice' ? a.retailPrice :
               pricingType === 'wholesalePrice' ? a.wholesalePrice :
               a.specialPrice
        bVal = pricingType === 'retailPrice' ? b.retailPrice :
               pricingType === 'wholesalePrice' ? b.wholesalePrice :
               b.specialPrice
      } else if (field === 'sellingValue') {
        const aPrice = pricingType === 'retailPrice' ? a.retailPrice :
                      pricingType === 'wholesalePrice' ? a.wholesalePrice :
                      a.specialPrice
        const bPrice = pricingType === 'retailPrice' ? b.retailPrice :
                      pricingType === 'wholesalePrice' ? b.wholesalePrice :
                      b.specialPrice
        aVal = aPrice * a.stockQuantity
        bVal = bPrice * b.stockQuantity
      } else if (field === 'potentialProfit') {
        const aPrice = pricingType === 'retailPrice' ? a.retailPrice :
                      pricingType === 'wholesalePrice' ? a.wholesalePrice :
                      a.specialPrice
        const bPrice = pricingType === 'retailPrice' ? b.retailPrice :
                      pricingType === 'wholesalePrice' ? b.wholesalePrice :
                      b.specialPrice
        aVal = (aPrice * a.stockQuantity) - a.inventoryValue
        bVal = (bPrice * b.stockQuantity) - b.inventoryValue
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
            <InventoryIcon sx={{
              fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize,
              color: TYPOGRAPHY_STYLES.pageHeader.icon.color
            }} />
            Inventory Summary
          </Typography>
          <Typography variant={TYPOGRAPHY_STYLES.pageSubtitle.variant} color={TYPOGRAPHY_STYLES.pageSubtitle.color}>
            {reportData.length > 0
              ? `${reportData.length} products`
              : 'View comprehensive inventory summary with values and profit potential'}
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

                  <FormControl fullWidth size="small" sx={{ '& .MuiInputLabel-root': { fontSize: '0.75rem' }, '& .MuiSelect-select': { fontSize: '0.75rem' } }}>
                    <InputLabel>Type</InputLabel>
                    <Select
                      value={selectedType}
                      label="Type"
                      onChange={(e) => setSelectedType(e.target.value)}
                      MenuProps={{ PaperProps: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } }}
                    >
                      <MenuItem value="">All Types</MenuItem>
                      <MenuItem value="product">Product</MenuItem>
                      <MenuItem value="service">Service</MenuItem>
                      <MenuItem value="bundle">Bundle</MenuItem>
                    </Select>
                  </FormControl>

                  <FormControl fullWidth size="small" sx={{ '& .MuiInputLabel-root': { fontSize: '0.75rem' }, '& .MuiSelect-select': { fontSize: '0.75rem' } }}>
                    <InputLabel>Status</InputLabel>
                    <Select
                      value={selectedStatus}
                      label="Status"
                      onChange={(e) => setSelectedStatus(e.target.value)}
                      MenuProps={{ PaperProps: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } }}
                    >
                      <MenuItem value="">All Status</MenuItem>
                      <MenuItem value="active">Active</MenuItem>
                      <MenuItem value="discontinued">Discontinued</MenuItem>
                    </Select>
                  </FormControl>

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
                </Stack>
              </Box>
            </Paper>

            {/* Options Section */}
            <Paper sx={{ display: 'flex', flexDirection: 'column', flex: 0.5, overflow: 'hidden' }}>
              <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border, flexShrink: 0 }}>
                <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                  fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                  fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Options
                </Typography>
              </Box>

              <Box sx={{ p: 2, overflow: 'auto', flex: 1 }}>
                <Stack spacing={2}>
                  <FormControl fullWidth size="small" sx={{ '& .MuiInputLabel-root': { fontSize: '0.75rem' }, '& .MuiSelect-select': { fontSize: '0.75rem' } }}>
                    <InputLabel>Pricing</InputLabel>
                    <Select
                      value={pricingType}
                      label="Pricing"
                      onChange={(e) => setPricingType(e.target.value)}
                      MenuProps={{ PaperProps: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } }}
                    >
                      <MenuItem value="retailPrice">Retail Price</MenuItem>
                      <MenuItem value="wholesalePrice">Wholesale Price</MenuItem>
                      <MenuItem value="specialPrice">Special Price</MenuItem>
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

                        if (value.includes('all')) {
                          const allColumns = ['productName', 'categoryName', 'type', 'stockQuantity', 'inventoryValue', 'sellingValue', 'potentialProfit']
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
                      <MenuItem value="productName">Product</MenuItem>
                      <MenuItem value="categoryName">Category</MenuItem>
                      <MenuItem value="type">Type</MenuItem>
                      <MenuItem value="stockQuantity">Stock Qty</MenuItem>
                      <MenuItem value="baseCost">Base Cost</MenuItem>
                      <MenuItem value="inventoryValue">Inventory Value</MenuItem>
                      <MenuItem value="sellingPrice">Selling Price</MenuItem>
                      <MenuItem value="sellingValue">Selling Value</MenuItem>
                      <MenuItem value="potentialProfit">Potential Profit</MenuItem>
                      <MenuItem value="status">Status</MenuItem>
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
                      <MenuItem value="categoryName">Category</MenuItem>
                      <MenuItem value="type">Type</MenuItem>
                      <MenuItem value="status">Status</MenuItem>
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
                      <MenuItem value="categoryName">Category</MenuItem>
                      <MenuItem value="type">Type</MenuItem>
                      <MenuItem value="stockQuantity">Stock Qty</MenuItem>
                      <MenuItem value="inventoryValue">Inventory Value</MenuItem>
                      <MenuItem value="sellingValue">Selling Value</MenuItem>
                      <MenuItem value="potentialProfit">Potential Profit</MenuItem>
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
                      <InventoryIcon sx={{ fontSize: 80, color: 'text.disabled', mb: 2 }} />
                      <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
                        No Report Generated
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Configure the filters on the left and click "Generate Report" to view inventory summary.
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
                        {selectedColumns.includes('productName') && <TableCell align="center">Product</TableCell>}
                        {selectedColumns.includes('categoryName') && <TableCell align="center">Category</TableCell>}
                        {selectedColumns.includes('type') && <TableCell align="center">Type</TableCell>}
                        {selectedColumns.includes('stockQuantity') && <TableCell align="center">Stock Qty</TableCell>}
                        {selectedColumns.includes('baseCost') && <TableCell align="center">Base Cost</TableCell>}
                        {selectedColumns.includes('inventoryValue') && <TableCell align="center">Inventory Value</TableCell>}
                        {selectedColumns.includes('sellingPrice') && <TableCell align="center">Selling Price</TableCell>}
                        {selectedColumns.includes('sellingValue') && <TableCell align="center">Selling Value</TableCell>}
                        {selectedColumns.includes('potentialProfit') && <TableCell align="center">Potential Profit</TableCell>}
                        {selectedColumns.includes('status') && <TableCell align="center">Status</TableCell>}
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
                          } else if (field === 'type') {
                            return `Type: ${r.type}`
                          } else if (field === 'status') {
                            return `Status: ${r.status}`
                          }
                          return r[field]
                        }

                        const calculateGroupSubtotals = () => {
                          if (groupBy === 'none') return null

                          const currentGroupKey = getGroupKey(row)
                          const groupData = paginatedData.filter(r => getGroupKey(r) === currentGroupKey)

                          return {
                            stockQuantity: groupData.reduce((sum, r) => sum + r.stockQuantity, 0),
                            inventoryValue: groupData.reduce((sum, r) => sum + r.inventoryValue, 0),
                          }
                        }

                        const groupSubtotals = showGroupFooter ? calculateGroupSubtotals() : null

                        return (
                          <React.Fragment key={`${row.productName}-${idx}`}>
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
                              {selectedColumns.includes('type') && (
                                <TableCell sx={{ fontSize: '0.8rem' }}>
                                  <Chip
                                    label={row.type.charAt(0).toUpperCase() + row.type.slice(1)}
                                    size="small"
                                    variant="outlined"
                                    sx={{ fontSize: '0.7rem' }}
                                  />
                                </TableCell>
                              )}
                              {selectedColumns.includes('stockQuantity') && (
                                <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                                  {row.stockQuantity}
                                </TableCell>
                              )}
                              {selectedColumns.includes('baseCost') && (
                                <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                                  {formatCurrency(row.baseCost)}
                                </TableCell>
                              )}
                              {selectedColumns.includes('inventoryValue') && (
                                <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                                  {formatCurrency(row.inventoryValue)}
                                </TableCell>
                              )}
                              {selectedColumns.includes('sellingPrice') && (
                                <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                                  {formatCurrency(
                                    pricingType === 'retailPrice' ? row.retailPrice :
                                    pricingType === 'wholesalePrice' ? row.wholesalePrice :
                                    row.specialPrice
                                  )}
                                </TableCell>
                              )}
                              {selectedColumns.includes('sellingValue') && (
                                <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                                  {formatCurrency(
                                    (pricingType === 'retailPrice' ? row.retailPrice :
                                    pricingType === 'wholesalePrice' ? row.wholesalePrice :
                                    row.specialPrice) * row.stockQuantity
                                  )}
                                </TableCell>
                              )}
                              {selectedColumns.includes('potentialProfit') && (
                                <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                                  {formatCurrency(
                                    ((pricingType === 'retailPrice' ? row.retailPrice :
                                     pricingType === 'wholesalePrice' ? row.wholesalePrice :
                                     row.specialPrice) * row.stockQuantity) - row.inventoryValue
                                  )}
                                </TableCell>
                              )}
                              {selectedColumns.includes('status') && (
                                <TableCell sx={{ fontSize: '0.8rem' }}>
                                  <Chip
                                    label={row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                                    color={row.status === 'active' ? 'success' : 'warning'}
                                    size="small"
                                    variant="outlined"
                                    sx={{ fontSize: '0.7rem' }}
                                  />
                                </TableCell>
                              )}
                            </TableRow>
                            {showGroupFooter && groupSubtotals && (
                              <TableRow sx={{
                                backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'grey.100',
                                borderBottom: '2px solid',
                                borderColor: 'divider',
                                '& .MuiTableCell-root': {
                                  fontWeight: 600,
                                  fontSize: '0.8rem',
                                  fontStyle: 'italic'
                                }
                              }}>
                                {selectedColumns.includes('productName') && (
                                  <TableCell sx={{ fontWeight: 600 }}>
                                    Subtotal
                                  </TableCell>
                                )}
                                {selectedColumns.includes('categoryName') && <TableCell />}
                                {selectedColumns.includes('type') && <TableCell />}
                                {selectedColumns.includes('stockQuantity') && (
                                  <TableCell align="right">
                                    {groupSubtotals.stockQuantity}
                                  </TableCell>
                                )}
                                {selectedColumns.includes('baseCost') && <TableCell />}
                                {selectedColumns.includes('inventoryValue') && (
                                  <TableCell align="right">
                                    {formatCurrency(groupSubtotals.inventoryValue)}
                                  </TableCell>
                                )}
                                {selectedColumns.includes('sellingPrice') && <TableCell />}
                                {selectedColumns.includes('sellingValue') && <TableCell />}
                                {selectedColumns.includes('potentialProfit') && <TableCell />}
                                {selectedColumns.includes('status') && <TableCell />}
                              </TableRow>
                            )}
                          </React.Fragment>
                        )
                      })}
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
                          {selectedColumns.includes('categoryName') && <TableCell />}
                          {selectedColumns.includes('type') && <TableCell />}
                          {selectedColumns.includes('stockQuantity') && (
                            <TableCell align="right">
                              {totals.stockQuantity}
                            </TableCell>
                          )}
                          {selectedColumns.includes('baseCost') && <TableCell />}
                          {selectedColumns.includes('inventoryValue') && (
                            <TableCell align="right">
                              {formatCurrency(totals.inventoryValue)}
                            </TableCell>
                          )}
                          {selectedColumns.includes('sellingPrice') && <TableCell />}
                          {selectedColumns.includes('sellingValue') && <TableCell />}
                          {selectedColumns.includes('potentialProfit') && <TableCell />}
                          {selectedColumns.includes('status') && <TableCell />}
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

export default InventorySummaryReport
