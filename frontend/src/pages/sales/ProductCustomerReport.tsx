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
  Inventory2 as ProductIcon,
  Close as CloseIcon,
  KeyboardArrowRight as KeyboardArrowRightIcon,
  KeyboardArrowLeft as KeyboardArrowLeftIcon,
  KeyboardDoubleArrowRight as KeyboardDoubleArrowRightIcon,
  KeyboardDoubleArrowLeft as KeyboardDoubleArrowLeftIcon,
} from '@mui/icons-material'
import { formatCurrency } from '@/utils/formatters'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'

interface ProductCustomerReport {
  productId: string
  productName: string
  categoryName: string
  customerId: string
  customerName: string
  customerPhone: string
  orderId: string
  orderNumber: string
  orderDate: string
  quantity: number
  unitPrice: number
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
  const [customers, setCustomers] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [selectedProduct, setSelectedProduct] = useState<string>('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [selectedCustomer, setSelectedCustomer] = useState<string>('all')
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([])
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false)
  const [customerSearchFilter, setCustomerSearchFilter] = useState<string>('')
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([])
  const [selectedRemovedIds, setSelectedRemovedIds] = useState<string[]>([])
  const [lastClickedCustomerId, setLastClickedCustomerId] = useState<string | null>(null)
  const [lastClickedRemovedId, setLastClickedRemovedId] = useState<string | null>(null)
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [inventoryStatus, setInventoryStatus] = useState<string>('all')
  const [paymentStatus, setPaymentStatus] = useState<string>('all')

  // Display options
  const [selectedColumns, setSelectedColumns] = useState<string[]>([
    'productName', 'categoryName', 'customerName', 'customerPhone', 'orderNumber', 'orderDate', 'inventoryStatus', 'paymentStatus', 'quantity', 'amount', 'cost', 'profit'
  ])
  const [groupBy, setGroupBy] = useState<string>('none')
  const [sortBy1, setSortBy1] = useState<string>('orderDate')
  const [reportTitle, setReportTitle] = useState<string>('Product Customer Report')

  // Pagination
  const [page, setPage] = useState<number>(0)
  const [rowsPerPage, setRowsPerPage] = useState<number>(25)

  useEffect(() => {
    // Load customers
    fetch('/api/customers?limit=100')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.data) {
          setCustomers(data.data)
        }
      })
      .catch(() => {})

    // Load categories
    fetch('/api/inventory/categories')
      .then(res => res.ok ? res.json() : null)
      .then(response => {
        if (response?.data) {
          setCategories(response.data)
        }
      })
      .catch(() => {})

    // Load products
    fetch('/api/inventory/products?limit=100')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.data) {
          setProducts(data.data)
        }
      })
      .catch(() => {})
  }, [])

  // Reset to first page when filters or display options change
  useEffect(() => {
    setPage(0)
  }, [groupBy, sortBy1, inventoryStatus, paymentStatus, selectedCategory, selectedCustomers, selectedProduct])

  const handleGenerateReport = async () => {
    setLoading(true)
    setPage(0) // Reset to first page when generating new report

    try {
      // Build query parameters
      const params = new URLSearchParams()

      if (dateFrom) params.append('dateFrom', dateFrom)
      if (dateTo) params.append('dateTo', dateTo)
      if (selectedProduct) params.append('productId', selectedProduct)
      if (selectedCategory) params.append('categoryId', selectedCategory)
      if (selectedCustomers.length > 0) {
        selectedCustomers.forEach(customerId => params.append('customerIds', customerId))
      }
      if (inventoryStatus && inventoryStatus !== 'all') params.append('inventoryStatus', inventoryStatus)
      if (paymentStatus && paymentStatus !== 'all') params.append('paymentStatus', paymentStatus)

      // Call the backend API
      const response = await fetch(`/api/sales/analytics/product-customer-report?${params.toString()}`)

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

  const handleCustomerSelectChange = (value: string) => {
    if (value === 'select') {
      setCustomerDialogOpen(true)
      // Initialize selected customer IDs with current selections
      setSelectedCustomerIds([])
    } else {
      setSelectedCustomer(value)
      setSelectedCustomers([])
    }
  }

  const handleCustomerToggle = (customerId: string) => {
    setSelectedCustomers(prev =>
      prev.includes(customerId)
        ? prev.filter(id => id !== customerId)
        : [...prev, customerId]
    )
  }

  const handleCustomerDialogClose = () => {
    setCustomerDialogOpen(false)
    setCustomerSearchFilter('')
    setSelectedCustomerIds([])
    setSelectedRemovedIds([])
    if (selectedCustomers.length > 0) {
      setSelectedCustomer('select')
    } else {
      setSelectedCustomer('all')
    }
  }

  const getFilteredCustomers = () => {
    return customers.filter(customer => {
      // Exclude already selected customers
      if (selectedCustomers.includes(customer.id)) return false

      // Apply search filter
      if (customerSearchFilter && !customer.name.toLowerCase().includes(customerSearchFilter.toLowerCase())) {
        return false
      }

      return true
    })
  }

  const handleCustomerClick = (customerId: string, e: React.MouseEvent) => {
    if (e.shiftKey && lastClickedCustomerId) {
      // Shift+click: select range
      const filteredCustomers = getFilteredCustomers()
      const startIndex = filteredCustomers.findIndex(c => c.id === lastClickedCustomerId)
      const endIndex = filteredCustomers.findIndex(c => c.id === customerId)
      if (startIndex !== -1 && endIndex !== -1) {
        const rangeStart = Math.min(startIndex, endIndex)
        const rangeEnd = Math.max(startIndex, endIndex)
        const rangeIds = filteredCustomers.slice(rangeStart, rangeEnd + 1).map(c => c.id)
        setSelectedCustomerIds(prev => Array.from(new Set([...prev, ...rangeIds])))
      }
    } else if (e.ctrlKey || e.metaKey) {
      // Ctrl+click: toggle selection
      setSelectedCustomerIds(prev =>
        prev.includes(customerId) ? prev.filter(id => id !== customerId) : [...prev, customerId]
      )
    } else {
      // Normal click: select single
      setSelectedCustomerIds([customerId])
    }
    setLastClickedCustomerId(customerId)
  }

  const getSelectedCustomersList = () => {
    return customers.filter(customer => selectedCustomers.includes(customer.id))
  }

  const handleSelectedCustomerClick = (customerId: string, event: React.MouseEvent) => {
    const selectedCustomersList = getSelectedCustomersList()

    if (event.ctrlKey || event.metaKey) {
      // Ctrl/Cmd+Click: Toggle individual selection
      setSelectedRemovedIds(prev =>
        prev.includes(customerId)
          ? prev.filter(id => id !== customerId)
          : [...prev, customerId]
      )
      setLastClickedRemovedId(customerId)
    } else if (event.shiftKey && lastClickedRemovedId) {
      // Shift+Click: Select range
      const lastIndex = selectedCustomersList.findIndex(c => c.id === lastClickedRemovedId)
      const currentIndex = selectedCustomersList.findIndex(c => c.id === customerId)

      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex)
        const end = Math.max(lastIndex, currentIndex)
        const rangeIds = selectedCustomersList.slice(start, end + 1).map(c => c.id)

        setSelectedRemovedIds(prev => Array.from(new Set([...prev, ...rangeIds])))
      }
    } else {
      // Single click: Select only this item
      setSelectedRemovedIds([customerId])
      setLastClickedRemovedId(customerId)
    }
  }

  const handleAddSelectedCustomers = () => {
    setSelectedCustomers(prev => Array.from(new Set([...prev, ...selectedCustomerIds])))
    setSelectedCustomerIds([])
  }

  const handleAddAllCustomers = () => {
    const filteredCustomers = getFilteredCustomers()
    setSelectedCustomers(prev => Array.from(new Set([...prev, ...filteredCustomers.map(c => c.id)])))
    setSelectedCustomerIds([])
  }

  const handleRemoveSelectedCustomers = () => {
    setSelectedCustomers(prev => prev.filter(id => !selectedRemovedIds.includes(id)))
    setSelectedRemovedIds([])
  }

  const handleRemoveAllCustomers = () => {
    setSelectedCustomers([])
    setSelectedRemovedIds([])
  }

  const handleClearFilters = () => {
    // Clear filter options
    setSelectedProduct('')
    setSelectedCategory('')
    setSelectedCustomer('all')
    setSelectedCustomers([])
    setDateFrom('')
    setDateTo('')
    setInventoryStatus('all')
    setPaymentStatus('all')

    // Clear report data
    setReportData([])

    // Reset display options to defaults
    setSelectedColumns(['productName', 'categoryName', 'customerName', 'customerPhone', 'orderNumber', 'orderDate', 'inventoryStatus', 'paymentStatus', 'quantity', 'amount', 'cost', 'profit'])
    setGroupBy('none')
    setSortBy1('orderDate')
    setReportTitle('Product Customer Report')

    // Reset pagination
    setPage(0)
    setRowsPerPage(25)
  }

  const handleExportExcel = () => {
    if (sortedData.length === 0) return

    // Column headers mapping
    const columnHeaders: { [key: string]: string } = {
      productName: 'Product',
      categoryName: 'Category',
      customerName: 'Customer',
      customerPhone: 'Phone',
      customerEmail: 'Email',
      orderNumber: 'Order No',
      orderDate: 'Order Date',
      inventoryStatus: 'Inventory Status',
      paymentStatus: 'Payment Status',
      quantity: 'Quantity',
      unitPrice: 'Unit Price',
      amount: 'Amount',
      cost: 'Cost',
      profit: 'Profit'
    }

    // Build CSV content
    let csv = reportTitle + '\n\n'

    // Add headers
    const headers = selectedColumns.map(col => columnHeaders[col] || col)
    csv += headers.join(',') + '\n'

    // Add data rows with grouping support
    let prevGroupKey: any = null

    // Helper to get group key for export
    const getExportGroupKey = (r: any) => {
      if (groupBy === 'productCustomer') {
        return `${r.productName}|${r.customerName}`
      } else if (groupBy === 'productCategory') {
        return `${r.productName}|${r.categoryName}`
      }
      return r[groupBy]
    }

    // Helper to get group label for export
    const getExportGroupLabel = (r: any) => {
      if (groupBy === 'productCustomer') {
        return `Product: ${r.productName} | Customer: ${r.customerName}`
      } else if (groupBy === 'productCategory') {
        return `Product: ${r.productName} | Category: ${r.categoryName}`
      }
      return r[groupBy]
    }

    sortedData.forEach((row, idx) => {
      // Determine current group value
      const currentGroupKey = groupBy !== 'none' ? getExportGroupKey(row) : null

      // Add group header if group changed
      if (groupBy !== 'none' && currentGroupKey !== prevGroupKey) {
        const groupLabel = getExportGroupLabel(row)
        csv += `\n"${groupLabel}"\n`
        prevGroupKey = currentGroupKey
      }

      const values = selectedColumns.map(col => {
        const value = (row as any)[col]
        if (col === 'orderDate') {
          return value ? `"${new Date(value).toLocaleDateString()}"` : '""'
        } else if (col === 'customerName' || col === 'customerPhone' || col === 'orderNumber' || col === 'paymentStatus' || col === 'inventoryStatus' || col === 'productName' || col === 'categoryName') {
          return `"${value || ''}"`
        } else if (typeof value === 'number') {
          return value.toFixed(2)
        }
        return `"${value || ''}"`
      })
      csv += values.join(',') + '\n'

      // Check if we need to add subtotal
      const nextRow = idx < sortedData.length - 1 ? sortedData[idx + 1] : null
      const nextGroupKey = nextRow && groupBy !== 'none' ? getExportGroupKey(nextRow) : null

      if (groupBy !== 'none' && (!nextRow || currentGroupKey !== nextGroupKey)) {
        // Calculate subtotal for this group
        const groupData = sortedData.filter(r => getExportGroupKey(r) === currentGroupKey)

        const subtotal = {
          quantity: groupData.reduce((sum, r) => sum + r.quantity, 0),
          unitPrice: 0,
          amount: groupData.reduce((sum, r) => sum + r.amount, 0),
          cost: groupData.reduce((sum, r) => sum + r.cost, 0),
          profit: groupData.reduce((sum, r) => sum + r.profit, 0),
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

    // Add totals
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
      categoryName: 'Category',
      customerName: 'Customer',
      customerPhone: 'Phone',
      orderNumber: 'Order No',
      orderDate: 'Order Date',
      inventoryStatus: 'Inventory Status',
      paymentStatus: 'Payment Status',
      quantity: 'Quantity',
      unitPrice: 'Unit Price',
      amount: 'Amount',
      cost: 'Cost',
      profit: 'Profit'
    }

    let tableRows = ''
    let prevGroupKey: any = null

    // Helper to get group key for PDF export
    const getPdfGroupKey = (r: any) => {
      if (groupBy === 'productCustomer') {
        return `${r.productName}|${r.customerName}`
      } else if (groupBy === 'productCategory') {
        return `${r.productName}|${r.categoryName}`
      }
      return r[groupBy]
    }

    // Helper to get group label for PDF export
    const getPdfGroupLabel = (r: any) => {
      if (groupBy === 'productCustomer') {
        return `Product: ${r.productName} | Customer: ${r.customerName}`
      } else if (groupBy === 'productCategory') {
        return `Product: ${r.productName} | Category: ${r.categoryName}`
      }
      return r[groupBy]
    }

    sortedData.forEach((row, idx) => {
      // Determine current group value
      const currentGroupKey = groupBy !== 'none' ? getPdfGroupKey(row) : null

      // Add group header if group changed
      if (groupBy !== 'none' && currentGroupKey !== prevGroupKey) {
        const groupLabel = getPdfGroupLabel(row)
        tableRows += `<tr style="background-color: #d3d3d3; font-weight: bold;"><td colspan="${selectedColumns.length}">${groupLabel}</td></tr>`
        prevGroupKey = currentGroupKey
      }

      tableRows += '<tr>'
      selectedColumns.forEach(col => {
        const value = (row as any)[col]
        let displayValue = value
        if (col === 'orderDate') {
          displayValue = value ? new Date(value).toLocaleDateString() : '-'
        } else if (typeof value === 'number') {
          displayValue = formatCurrency(value)
        } else if (col === 'paymentStatus' || col === 'inventoryStatus') {
          displayValue = value ? value.charAt(0).toUpperCase() + value.slice(1) : ''
        }
        const align = (typeof value === 'number') ? 'text-align: right;' : ''
        tableRows += `<td style="${align}">${displayValue || ''}</td>`
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
          unitPrice: 0,
          amount: groupData.reduce((sum, r) => sum + r.amount, 0),
          cost: groupData.reduce((sum, r) => sum + r.cost, 0),
          profit: groupData.reduce((sum, r) => sum + r.profit, 0),
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

    // Add totals
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

  const calculateTotals = () => {
    if (reportData.length === 0) return null

    const totals = reportData.reduce(
      (acc, item) => ({
        quantity: acc.quantity + item.quantity,
        unitPrice: 0,
        amount: acc.amount + item.amount,
        cost: acc.cost + item.cost,
        profit: acc.profit + item.profit,
      }),
      {
        quantity: 0,
        unitPrice: 0,
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

      // Date comparison - descending (newer to older)
      if (field === 'orderDate') {
        return new Date(bVal).getTime() - new Date(aVal).getTime()
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
        if (groupBy === 'productCustomer') {
          // First sort by product
          const productResult = compareValues(a, b, 'productName')
          if (productResult !== 0) return productResult
          // Then by customer name
          const customerResult = compareValues(a, b, 'customerName')
          if (customerResult !== 0) return customerResult
        } else if (groupBy === 'productCategory') {
          // First sort by product
          const productResult = compareValues(a, b, 'productName')
          if (productResult !== 0) return productResult
          // Then by category name
          const categoryResult = compareValues(a, b, 'categoryName')
          if (categoryResult !== 0) return categoryResult
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
  const paginatedData = sortedData.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)

  // Pagination handlers
  const handleChangePage = (_: unknown, newPage: number) => {
    setPage(newPage)
  }

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10))
    setPage(0)
  }

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'success'
      case 'partial':
        return 'warning'
      case 'overpaid':
        return 'info'
      default:
        return 'error'
    }
  }

  const getInventoryStatusColor = (status: string) => {
    return status === 'fulfilled' ? 'success' : 'warning'
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
            Product Customer Report
          </Typography>
          <Typography variant={TYPOGRAPHY_STYLES.pageSubtitle.variant} color={TYPOGRAPHY_STYLES.pageSubtitle.color}>
            {reportData.length > 0
              ? `Product sales to ${reportData.length} customers`
              : 'View which customers purchased which products'}
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
                  <InputLabel>Product</InputLabel>
                  <Select
                    value={selectedProduct}
                    label="Product"
                    onChange={(e) => setSelectedProduct(e.target.value)}
                    MenuProps={{ PaperProps: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } }}
                  >
                    <MenuItem value="">All Products</MenuItem>
                    {products.map((product) => (
                      <MenuItem key={product.id} value={product.id}>
                        {product.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontSize: '0.75rem' }}>
                  Order Date
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

                <FormControl fullWidth size="small" sx={{ '& .MuiInputLabel-root': { fontSize: '0.75rem' }, '& .MuiSelect-select': { fontSize: '0.75rem' } }}>
                  <InputLabel>Inventory Status</InputLabel>
                  <Select
                    value={inventoryStatus}
                    label="Inventory Status"
                    onChange={(e) => setInventoryStatus(e.target.value)}
                    MenuProps={{ PaperProps: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } }}
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
                    MenuProps={{ PaperProps: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } }}
                  >
                    <MenuItem value="all">All</MenuItem>
                    <MenuItem value="unpaid">Unpaid</MenuItem>
                    <MenuItem value="partial">Partial</MenuItem>
                    <MenuItem value="paid">Paid</MenuItem>
                    <MenuItem value="overpaid">Overpaid</MenuItem>
                  </Select>
                </FormControl>

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
                        {category.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl fullWidth size="small" sx={{ '& .MuiInputLabel-root': { fontSize: '0.75rem' }, '& .MuiSelect-select': { fontSize: '0.75rem' } }}>
                  <InputLabel>Customers</InputLabel>
                  <Select
                    value={selectedCustomer}
                    label="Customers"
                    onChange={(e) => handleCustomerSelectChange(e.target.value)}
                    MenuProps={{ PaperProps: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } }}
                  >
                    <MenuItem value="all">All Customers</MenuItem>
                    <MenuItem value="select">Select Customers</MenuItem>
                  </Select>
                </FormControl>

                {selectedCustomer === 'select' && selectedCustomers.length > 0 && (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selectedCustomers.map(customerId => {
                      const customer = customers.find(c => c.id === customerId)
                      return (
                        <Chip
                          key={customerId}
                          label={customer?.name || customerId}
                          size="small"
                          onDelete={() => handleCustomerToggle(customerId)}
                          sx={{ fontSize: '0.7rem' }}
                        />
                      )
                    })}
                  </Box>
                )}
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
                        const allColumns = ['productName', 'categoryName', 'customerName', 'customerPhone', 'orderNumber', 'orderDate', 'inventoryStatus', 'paymentStatus', 'quantity', 'amount', 'cost', 'profit']
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
                    MenuProps={{ PaperProps: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } }}
                    renderValue={(selected) => `${selected.length} column${selected.length !== 1 ? 's' : ''} selected`}
                  >
                    <MenuItem value="all">All</MenuItem>
                    <MenuItem value="productName">Product</MenuItem>
                    <MenuItem value="categoryName">Category</MenuItem>
                    <MenuItem value="customerName">Customer</MenuItem>
                    <MenuItem value="customerPhone">Phone</MenuItem>
                    <MenuItem value="orderNumber">Order No</MenuItem>
                    <MenuItem value="orderDate">Order Date</MenuItem>
                    <MenuItem value="inventoryStatus">Inventory Status</MenuItem>
                    <MenuItem value="paymentStatus">Payment Status</MenuItem>
                    <MenuItem value="quantity">Quantity</MenuItem>
                    <MenuItem value="unitPrice">Unit Price</MenuItem>
                    <MenuItem value="amount">Amount</MenuItem>
                    <MenuItem value="cost">Cost</MenuItem>
                    <MenuItem value="profit">Profit</MenuItem>
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
                    <MenuItem value="productCustomer">Product, Customer</MenuItem>
                    <MenuItem value="productCategory">Product, Category</MenuItem>
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
                    <MenuItem value="customerName">Customer</MenuItem>
                    <MenuItem value="orderNumber">Order No</MenuItem>
                    <MenuItem value="orderDate">Order Date</MenuItem>
                    <MenuItem value="inventoryStatus">Inventory Status</MenuItem>
                    <MenuItem value="paymentStatus">Payment Status</MenuItem>
                    <MenuItem value="quantity">Quantity</MenuItem>
                    <MenuItem value="unitPrice">Unit Price</MenuItem>
                    <MenuItem value="amount">Amount</MenuItem>
                    <MenuItem value="cost">Cost</MenuItem>
                    <MenuItem value="profit">Profit</MenuItem>
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
                      <ProductIcon sx={{ fontSize: 80, color: 'text.disabled', mb: 2 }} />
                      <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
                        No Report Generated
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
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
                      {selectedColumns.includes('customerName') && <TableCell align="center">Customer</TableCell>}
                      {selectedColumns.includes('customerPhone') && <TableCell align="center">Phone</TableCell>}
                      {selectedColumns.includes('orderNumber') && <TableCell align="center">Order No</TableCell>}
                      {selectedColumns.includes('orderDate') && <TableCell align="center">Order Date</TableCell>}
                      {selectedColumns.includes('inventoryStatus') && <TableCell align="center">Inventory Status</TableCell>}
                      {selectedColumns.includes('paymentStatus') && <TableCell align="center">Payment Status</TableCell>}
                      {selectedColumns.includes('quantity') && <TableCell align="center">Quantity</TableCell>}
                      {selectedColumns.includes('unitPrice') && <TableCell align="center">Unit Price</TableCell>}
                      {selectedColumns.includes('amount') && <TableCell align="center">Amount</TableCell>}
                      {selectedColumns.includes('cost') && <TableCell align="center">Cost</TableCell>}
                      {selectedColumns.includes('profit') && <TableCell align="center">Profit</TableCell>}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginatedData.map((row, idx) => {
                      // Check if we need to display a group header
                      const prevRow = idx > 0 ? paginatedData[idx - 1] : null
                      const nextRow = idx < paginatedData.length - 1 ? paginatedData[idx + 1] : null

                      // Helper to get group key for a row
                      const getGroupKey = (r: any) => {
                        if (groupBy === 'productCustomer') {
                          return `${r.productName}|${r.customerName}`
                        } else if (groupBy === 'productCategory') {
                          return `${r.productName}|${r.categoryName}`
                        }
                        return r[groupBy]
                      }

                      const showGroupHeader = groupBy !== 'none' && (!prevRow || getGroupKey(row) !== getGroupKey(prevRow))
                      const showGroupFooter = groupBy !== 'none' && (!nextRow || getGroupKey(row) !== getGroupKey(nextRow))

                      const getGroupLabel = (field: string, r: any) => {
                        if (field === 'productCustomer') {
                          return `Product: ${r.productName} | Customer: ${r.customerName}`
                        } else if (field === 'productCategory') {
                          return `Product: ${r.productName} | Category: ${r.categoryName}`
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
                          unitPrice: 0,
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
                        {selectedColumns.includes('customerName') && (
                          <TableCell sx={{ fontSize: '0.8rem' }}>
                            {row.customerName}
                          </TableCell>
                        )}
                        {selectedColumns.includes('customerPhone') && (
                          <TableCell sx={{ fontSize: '0.8rem' }}>
                            {row.customerPhone || '-'}
                          </TableCell>
                        )}
                        {selectedColumns.includes('orderNumber') && (
                          <TableCell sx={{ fontSize: '0.8rem' }}>
                            {row.orderNumber}
                          </TableCell>
                        )}
                        {selectedColumns.includes('orderDate') && (
                          <TableCell sx={{ fontSize: '0.8rem' }}>
                            {row.orderDate ? new Date(row.orderDate).toLocaleDateString() : '-'}
                          </TableCell>
                        )}
                        {selectedColumns.includes('inventoryStatus') && (
                          <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                            <Chip
                              label={row.inventoryStatus.charAt(0).toUpperCase() + row.inventoryStatus.slice(1)}
                              color={getInventoryStatusColor(row.inventoryStatus) as any}
                              size="small"
                            />
                          </TableCell>
                        )}
                        {selectedColumns.includes('paymentStatus') && (
                          <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                            <Chip
                              label={row.paymentStatus.charAt(0).toUpperCase() + row.paymentStatus.slice(1)}
                              color={getPaymentStatusColor(row.paymentStatus) as any}
                              size="small"
                            />
                          </TableCell>
                        )}
                        {selectedColumns.includes('quantity') && (
                          <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                            {row.quantity}
                          </TableCell>
                        )}
                        {selectedColumns.includes('unitPrice') && (
                          <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                            {formatCurrency(row.unitPrice)}
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
                              {selectedColumns.includes('customerName') && <TableCell />}
                              {selectedColumns.includes('customerPhone') && <TableCell />}
                              {selectedColumns.includes('orderNumber') && <TableCell />}
                              {selectedColumns.includes('orderDate') && <TableCell />}
                              {selectedColumns.includes('inventoryStatus') && <TableCell />}
                              {selectedColumns.includes('paymentStatus') && <TableCell />}
                              {selectedColumns.includes('quantity') && (
                                <TableCell align="right">
                                  {groupSubtotals.quantity}
                                </TableCell>
                              )}
                              {selectedColumns.includes('unitPrice') && <TableCell />}
                              {selectedColumns.includes('amount') && (
                                <TableCell align="right">
                                  {formatCurrency(groupSubtotals.amount)}
                                </TableCell>
                              )}
                              {selectedColumns.includes('cost') && (
                                <TableCell align="right">
                                  {formatCurrency(groupSubtotals.cost)}
                                </TableCell>
                              )}
                              {selectedColumns.includes('profit') && (
                                <TableCell align="right">
                                  {formatCurrency(groupSubtotals.profit)}
                                </TableCell>
                              )}
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
                        {selectedColumns.includes('customerName') && <TableCell />}
                        {selectedColumns.includes('customerPhone') && <TableCell />}
                        {selectedColumns.includes('orderNumber') && <TableCell />}
                        {selectedColumns.includes('orderDate') && <TableCell />}
                        {selectedColumns.includes('inventoryStatus') && <TableCell />}
                        {selectedColumns.includes('paymentStatus') && <TableCell />}
                        {selectedColumns.includes('quantity') && (
                          <TableCell align="right">
                            {totals.quantity}
                          </TableCell>
                        )}
                        {selectedColumns.includes('unitPrice') && <TableCell />}
                        {selectedColumns.includes('amount') && (
                          <TableCell align="right">
                            {formatCurrency(totals.amount)}
                          </TableCell>
                        )}
                        {selectedColumns.includes('cost') && (
                          <TableCell align="right">
                            {formatCurrency(totals.cost)}
                          </TableCell>
                        )}
                        {selectedColumns.includes('profit') && (
                          <TableCell align="right">
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

      {/* Customer Selection Dialog */}
      <Dialog
        open={customerDialogOpen}
        onClose={handleCustomerDialogClose}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: { height: '80vh', maxHeight: '80vh' }
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
            Select Customers
          </Typography>
          <Button
            size="small"
            onClick={handleCustomerDialogClose}
            sx={{ minWidth: 'auto', p: 0.5 }}
          >
            <CloseIcon />
          </Button>
        </DialogTitle>
        <DialogContent sx={{ p: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Grid container spacing={1} sx={{ flex: 1, minHeight: 0 }}>
            {/* Left Side - Customer List */}
            <Grid item xs={5.25} sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Customer List
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
                        <TableCell sx={{ fontWeight: 600 }}>Customer Name</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Phone</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {getFilteredCustomers().length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={2} align="center" sx={{ py: 4 }}>
                            <Typography color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                              {customers.length === 0 ? 'No customers available' : 'No customers found'}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ) : (
                        getFilteredCustomers().map((customer) => (
                          <TableRow
                            key={customer.id}
                            hover
                            onClick={(e) => handleCustomerClick(customer.id, e)}
                            sx={{
                              cursor: 'pointer',
                              backgroundColor: selectedCustomerIds.includes(customer.id) ? 'primary.light' : 'inherit',
                              '&:hover': {
                                backgroundColor: selectedCustomerIds.includes(customer.id) ? 'primary.light' : 'action.hover'
                              }
                            }}
                          >
                            <TableCell>{customer.name}</TableCell>
                            <TableCell>{customer.phone || '-'}</TableCell>
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
                onClick={handleAddSelectedCustomers}
                disabled={selectedCustomerIds.length === 0}
                title="Add selected customers"
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
                onClick={handleAddAllCustomers}
                disabled={getFilteredCustomers().length === 0}
                title="Add all filtered customers"
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
                onClick={handleRemoveAllCustomers}
                disabled={selectedCustomers.length === 0}
                title="Remove all customers"
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
                onClick={handleRemoveSelectedCustomers}
                disabled={selectedRemovedIds.length === 0}
                title="Remove selected customers"
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

            {/* Right Side - Selected Customers */}
            <Grid item xs={5.25} sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <Paper sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Selected Customers ({selectedCustomers.length})
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
                        <TableCell sx={{ fontWeight: 600 }}>Customer Name</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Phone</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {getSelectedCustomersList().length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={2} align="center" sx={{ py: 4 }}>
                            <Typography color="text.secondary" sx={{ fontSize: '0.75rem' }}>
                              No customers selected
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ) : (
                        getSelectedCustomersList().map((customer) => (
                          <TableRow
                            key={customer.id}
                            hover
                            onClick={(e) => handleSelectedCustomerClick(customer.id, e)}
                            sx={{
                              cursor: 'pointer',
                              backgroundColor: selectedRemovedIds.includes(customer.id) ? 'error.light' : 'inherit',
                              '&:hover': {
                                backgroundColor: selectedRemovedIds.includes(customer.id) ? 'error.light' : 'action.hover'
                              }
                            }}
                          >
                            <TableCell>{customer.name}</TableCell>
                            <TableCell>{customer.phone || '-'}</TableCell>
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
              Filter Customers
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  size="small"
                  placeholder="Search by customer name..."
                  value={customerSearchFilter}
                  onChange={(e) => setCustomerSearchFilter(e.target.value)}
                  fullWidth
                />
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Typography variant="body2" color="text.secondary" sx={{ mr: 'auto' }}>
            {selectedCustomers.length} customer{selectedCustomers.length !== 1 ? 's' : ''} selected
          </Typography>
          <Button onClick={handleCustomerDialogClose}>
            Cancel
          </Button>
          <Button onClick={handleCustomerDialogClose} variant="contained">
            Done
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default ProductCustomerReport
