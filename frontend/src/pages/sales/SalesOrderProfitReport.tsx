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
} from '@mui/material'
import {
  PictureAsPdf as PdfIcon,
  TableChart as ExcelIcon,
  Refresh as RefreshIcon,
  PlayArrow as GenerateIcon,
  TrendingUp as ProfitIcon,
} from '@mui/icons-material'
import { formatCurrency } from '@/utils/formatters'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'

interface SalesOrderProfit {
  orderNumber: string
  orderDate: string
  customerName: string
  inventoryStatus: string
  paymentStatus: string
  totalCost: number
  totalRevenue: number
  grossProfit: number
}

const SalesOrderProfitReport: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const [loading, setLoading] = useState(false)
  const [reportData, setReportData] = useState<SalesOrderProfit[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<string>('')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [inventoryStatus, setInventoryStatus] = useState<string>('all')
  const [paymentStatus, setPaymentStatus] = useState<string>('all')

  // Display options
  const [selectedColumns, setSelectedColumns] = useState<string[]>([
    'orderNumber', 'inventoryStatus', 'paymentStatus', 'customerName', 'orderDate', 'totalCost', 'totalRevenue', 'grossProfit'
  ])
  const [groupBy, setGroupBy] = useState<string>('none')
  const [sortBy1, setSortBy1] = useState<string>('orderNumber')
  const [sortBy2, setSortBy2] = useState<string>('none')
  const [sortBy3, setSortBy3] = useState<string>('none')
  const [reportTitle, setReportTitle] = useState<string>('Sales Order Profit Report')

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
  }, [])

  const handleGenerateReport = async () => {
    setLoading(true)
    setPage(0) // Reset to first page when generating new report

    try {
      // Build query parameters
      const params = new URLSearchParams()

      if (dateFrom) params.append('dateFrom', dateFrom)
      if (dateTo) params.append('dateTo', dateTo)
      if (selectedCustomer) params.append('customerId', selectedCustomer)
      if (inventoryStatus && inventoryStatus !== 'all') params.append('status', inventoryStatus)
      if (paymentStatus && paymentStatus !== 'all') params.append('paymentStatus', paymentStatus)

      // Call the backend API
      const response = await fetch(`/api/sales/analytics/sales-order-profit?${params.toString()}`)

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
    // Clear filter options
    setSelectedCustomer('')
    setDateFrom('')
    setDateTo('')
    setInventoryStatus('all')
    setPaymentStatus('all')

    // Clear report data
    setReportData([])

    // Reset display options to defaults
    setSelectedColumns(['orderNumber', 'inventoryStatus', 'paymentStatus', 'customerName', 'orderDate', 'totalCost', 'totalRevenue', 'grossProfit'])
    setGroupBy('none')
    setSortBy1('orderNumber')
    setSortBy2('none')
    setSortBy3('none')
    setReportTitle('Sales Order Profit Report')

    // Reset pagination
    setPage(0)
    setRowsPerPage(25)
  }

  const handleExportExcel = () => {
    if (sortedData.length === 0) return

    // Column headers mapping
    const columnHeaders: { [key: string]: string } = {
      orderNumber: 'Order No',
      inventoryStatus: 'Inventory Status',
      paymentStatus: 'Payment Status',
      customerName: 'Customer',
      orderDate: 'Order Date',
      totalCost: 'Cost',
      totalRevenue: 'Sales Amount',
      grossProfit: 'Gross Profit'
    }

    // Build CSV content
    let csv = reportTitle + '\n\n'

    // Add headers
    const headers = selectedColumns.map(col => columnHeaders[col] || col)
    csv += headers.join(',') + '\n'

    // Add data rows with grouping support
    let prevGroupValue: any = null

    sortedData.forEach((row, idx) => {
      // Determine current group value
      let currentGroupValue: any = null
      if (groupBy === 'customerName') {
        currentGroupValue = row.customerName
      } else if (groupBy === 'paymentStatus') {
        currentGroupValue = row.paymentStatus
      } else if (groupBy === 'inventoryStatus') {
        currentGroupValue = row.inventoryStatus
      }

      // Add group header if group changed
      if (groupBy !== 'none' && currentGroupValue !== prevGroupValue) {
        const groupLabel = groupBy === 'customerName' ? `Customer: ${currentGroupValue}` :
                          groupBy === 'inventoryStatus' ? `Inventory: ${currentGroupValue.charAt(0).toUpperCase() + currentGroupValue.slice(1)}` :
                          groupBy === 'paymentStatus' ? `Payment: ${currentGroupValue.charAt(0).toUpperCase() + currentGroupValue.slice(1)}` : currentGroupValue
        csv += `\n"${groupLabel}"\n`
        prevGroupValue = currentGroupValue
      }

      const values = selectedColumns.map(col => {
        const value = (row as any)[col]
        if (col === 'orderDate') {
          return `"${new Date(value).toLocaleDateString()}"`
        } else if (col === 'inventoryStatus' || col === 'paymentStatus') {
          return `"${value}"`
        } else if (col === 'customerName') {
          return `"${value}"`
        } else if (typeof value === 'number') {
          return value.toFixed(2)
        }
        return `"${value || ''}"`
      })
      csv += values.join(',') + '\n'

      // Check if we need to add subtotal
      const nextRow = idx < sortedData.length - 1 ? sortedData[idx + 1] : null
      let nextGroupValue: any = null
      if (nextRow) {
        if (groupBy === 'customerName') nextGroupValue = nextRow.customerName
        else if (groupBy === 'paymentStatus') nextGroupValue = nextRow.paymentStatus
        else if (groupBy === 'inventoryStatus') nextGroupValue = nextRow.inventoryStatus
      }

      if (groupBy !== 'none' && (!nextRow || currentGroupValue !== nextGroupValue)) {
        // Calculate subtotal for this group
        const groupData = sortedData.filter(r => {
          if (groupBy === 'customerName') return r.customerName === currentGroupValue
          if (groupBy === 'paymentStatus') return r.paymentStatus === currentGroupValue
          if (groupBy === 'inventoryStatus') return r.inventoryStatus === currentGroupValue
          return false
        })

        const subtotal = {
          totalCost: groupData.reduce((sum, r) => sum + r.totalCost, 0),
          totalRevenue: groupData.reduce((sum, r) => sum + r.totalRevenue, 0),
          grossProfit: groupData.reduce((sum, r) => sum + r.grossProfit, 0),
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
      orderNumber: 'Order No',
      inventoryStatus: 'Inventory Status',
      paymentStatus: 'Payment Status',
      customerName: 'Customer',
      orderDate: 'Order Date',
      totalCost: 'Cost',
      totalRevenue: 'Sales Amount',
      grossProfit: 'Gross Profit'
    }

    let tableRows = ''
    let prevGroupValue: any = null

    sortedData.forEach((row, idx) => {
      // Determine current group value
      let currentGroupValue: any = null
      if (groupBy === 'customerName') {
        currentGroupValue = row.customerName
      } else if (groupBy === 'paymentStatus') {
        currentGroupValue = row.paymentStatus
      } else if (groupBy === 'inventoryStatus') {
        currentGroupValue = row.inventoryStatus
      }

      // Add group header if group changed
      if (groupBy !== 'none' && currentGroupValue !== prevGroupValue) {
        const groupLabel = groupBy === 'customerName' ? `Customer: ${currentGroupValue}` :
                          groupBy === 'inventoryStatus' ? `Inventory: ${currentGroupValue.charAt(0).toUpperCase() + currentGroupValue.slice(1)}` :
                          groupBy === 'paymentStatus' ? `Payment: ${currentGroupValue.charAt(0).toUpperCase() + currentGroupValue.slice(1)}` : currentGroupValue
        tableRows += `<tr style="background-color: #d3d3d3; font-weight: bold;"><td colspan="${selectedColumns.length}">${groupLabel}</td></tr>`
        prevGroupValue = currentGroupValue
      }

      tableRows += '<tr>'
      selectedColumns.forEach(col => {
        const value = (row as any)[col]
        let displayValue = value
        if (col === 'orderDate') {
          displayValue = new Date(value).toLocaleDateString()
        } else if (col === 'inventoryStatus' || col === 'paymentStatus') {
          displayValue = value
        } else if (typeof value === 'number') {
          displayValue = formatCurrency(value)
        }
        tableRows += `<td>${displayValue || ''}</td>`
      })
      tableRows += '</tr>'

      // Check if we need to add subtotal
      const nextRow = idx < sortedData.length - 1 ? sortedData[idx + 1] : null
      let nextGroupValue: any = null
      if (nextRow) {
        if (groupBy === 'customerName') nextGroupValue = nextRow.customerName
        else if (groupBy === 'paymentStatus') nextGroupValue = nextRow.paymentStatus
        else if (groupBy === 'inventoryStatus') nextGroupValue = nextRow.inventoryStatus
      }

      if (groupBy !== 'none' && (!nextRow || currentGroupValue !== nextGroupValue)) {
        // Calculate subtotal for this group
        const groupData = sortedData.filter(r => {
          if (groupBy === 'customerName') return r.customerName === currentGroupValue
          if (groupBy === 'paymentStatus') return r.paymentStatus === currentGroupValue
          if (groupBy === 'inventoryStatus') return r.inventoryStatus === currentGroupValue
          return false
        })

        const subtotal = {
          totalCost: groupData.reduce((sum, r) => sum + r.totalCost, 0),
          totalRevenue: groupData.reduce((sum, r) => sum + r.totalRevenue, 0),
          grossProfit: groupData.reduce((sum, r) => sum + r.grossProfit, 0),
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
            tableRows += `<td>${displayValue}</td>`
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
        totalCost: acc.totalCost + item.totalCost,
        totalRevenue: acc.totalRevenue + item.totalRevenue,
        grossProfit: acc.grossProfit + item.grossProfit,
      }),
      {
        totalCost: 0,
        totalRevenue: 0,
        grossProfit: 0,
      }
    )

    return totals
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

      // Order number comparison - ascending (low to high) by numeric value
      if (field === 'orderNumber') {
        const numA = parseInt(aVal.replace(/\D/g, ''), 10) || 0
        const numB = parseInt(bVal.replace(/\D/g, ''), 10) || 0
        return numA - numB
      }

      // Date comparison - ascending (earlier to latest)
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
            <ProfitIcon sx={{
              fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize,
              color: TYPOGRAPHY_STYLES.pageHeader.icon.color
            }} />
            Sales Order Profit Report
          </Typography>
          <Typography variant={TYPOGRAPHY_STYLES.pageSubtitle.variant} color={TYPOGRAPHY_STYLES.pageSubtitle.color}>
            {reportData.length > 0
              ? `Profit analysis report (${reportData.length} orders)`
              : 'Analyze profit margins and performance for sales orders'}
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
                  <InputLabel>Customer</InputLabel>
                  <Select
                    value={selectedCustomer}
                    label="Customer"
                    onChange={(e) => setSelectedCustomer(e.target.value)}
                    MenuProps={{ PaperProps: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } }}
                  >
                    <MenuItem value="">All Customers</MenuItem>
                    {customers.map((customer) => (
                      <MenuItem key={customer.id} value={customer.id}>
                        {customer.name}
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
                        const allColumns = ['orderNumber', 'inventoryStatus', 'paymentStatus', 'customerName', 'orderDate', 'totalCost', 'totalRevenue', 'grossProfit']
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
                    <MenuItem value="orderNumber">Order No</MenuItem>
                    <MenuItem value="inventoryStatus">Inventory Status</MenuItem>
                    <MenuItem value="paymentStatus">Payment Status</MenuItem>
                    <MenuItem value="customerName">Customer</MenuItem>
                    <MenuItem value="orderDate">Order Date</MenuItem>
                    <MenuItem value="totalCost">Cost</MenuItem>
                    <MenuItem value="totalRevenue">Sales Amount</MenuItem>
                    <MenuItem value="grossProfit">Gross Profit</MenuItem>
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
                    <MenuItem value="customerName">Customer</MenuItem>
                    <MenuItem value="inventoryStatus">Inventory Status</MenuItem>
                    <MenuItem value="paymentStatus">Payment Status</MenuItem>
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
                    <MenuItem value="orderDate">Order Date</MenuItem>
                    <MenuItem value="orderNumber">Order Number</MenuItem>
                    <MenuItem value="customerName">Customer</MenuItem>
                    <MenuItem value="inventoryStatus">Inventory Status</MenuItem>
                    <MenuItem value="paymentStatus">Payment Status</MenuItem>
                    <MenuItem value="totalRevenue">Sales Amount</MenuItem>
                    <MenuItem value="totalCost">Cost</MenuItem>
                    <MenuItem value="grossProfit">Gross Profit</MenuItem>
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
                      <ProfitIcon sx={{ fontSize: 80, color: 'text.disabled', mb: 2 }} />
                      <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
                        No Report Generated
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Configure the filters on the left and click "Generate Report" to view sales order profit analysis.
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
                  Report Preview ({reportData.length} orders)
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
                      {selectedColumns.includes('orderNumber') && <TableCell align="center">Order No</TableCell>}
                      {selectedColumns.includes('inventoryStatus') && <TableCell align="center">Inventory Status</TableCell>}
                      {selectedColumns.includes('paymentStatus') && <TableCell align="center">Payment Status</TableCell>}
                      {selectedColumns.includes('customerName') && <TableCell align="center">Customer</TableCell>}
                      {selectedColumns.includes('orderDate') && <TableCell align="center">Order Date</TableCell>}
                      {selectedColumns.includes('totalCost') && <TableCell align="center">Cost</TableCell>}
                      {selectedColumns.includes('totalRevenue') && <TableCell align="center">Sales Amount</TableCell>}
                      {selectedColumns.includes('grossProfit') && <TableCell align="center">Gross Profit</TableCell>}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginatedData.map((row, idx) => {
                      // Check if we need to display a group header
                      const prevRow = idx > 0 ? paginatedData[idx - 1] : null
                      const nextRow = idx < paginatedData.length - 1 ? paginatedData[idx + 1] : null

                      // Determine current group value based on groupBy field
                      let currentGroupValue: any = null
                      let prevGroupValue: any = null
                      let nextGroupValue: any = null

                      if (groupBy === 'customerName') {
                        currentGroupValue = row.customerName
                        prevGroupValue = prevRow?.customerName
                        nextGroupValue = nextRow?.customerName
                      } else if (groupBy === 'paymentStatus') {
                        currentGroupValue = row.paymentStatus
                        prevGroupValue = prevRow?.paymentStatus
                        nextGroupValue = nextRow?.paymentStatus
                      } else if (groupBy === 'inventoryStatus') {
                        currentGroupValue = row.inventoryStatus
                        prevGroupValue = prevRow?.inventoryStatus
                        nextGroupValue = nextRow?.inventoryStatus
                      }

                      const showGroupHeader = groupBy !== 'none' && (!prevRow || currentGroupValue !== prevGroupValue)
                      const showGroupFooter = groupBy !== 'none' && (!nextRow || currentGroupValue !== nextGroupValue)

                      const getGroupLabel = (field: string, value: any) => {
                        if (field === 'customerName') return `Customer: ${value}`
                        if (field === 'inventoryStatus') return `Inventory: ${value.charAt(0).toUpperCase() + value.slice(1)}`
                        if (field === 'paymentStatus') return `Payment: ${value.charAt(0).toUpperCase() + value.slice(1)}`
                        return value
                      }

                      // Calculate group subtotals
                      const calculateGroupSubtotals = () => {
                        if (groupBy === 'none') return null

                        const groupData = paginatedData.filter(r => {
                          if (groupBy === 'customerName') return r.customerName === currentGroupValue
                          if (groupBy === 'paymentStatus') return r.paymentStatus === currentGroupValue
                          if (groupBy === 'inventoryStatus') return r.inventoryStatus === currentGroupValue
                          return false
                        })

                        return {
                          totalCost: groupData.reduce((sum, r) => sum + r.totalCost, 0),
                          totalRevenue: groupData.reduce((sum, r) => sum + r.totalRevenue, 0),
                          grossProfit: groupData.reduce((sum, r) => sum + r.grossProfit, 0),
                        }
                      }

                      const groupSubtotals = showGroupFooter ? calculateGroupSubtotals() : null

                      return (
                        <React.Fragment key={`${row.orderNumber}-${idx}`}>
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
                                {getGroupLabel(groupBy, currentGroupValue)}
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
                            {selectedColumns.includes('orderNumber') && (
                              <TableCell sx={{ fontSize: '0.8rem' }}>
                                {row.orderNumber}
                              </TableCell>
                            )}
                            {selectedColumns.includes('inventoryStatus') && (
                              <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                                <Chip
                                  label={row.inventoryStatus.charAt(0).toUpperCase() + row.inventoryStatus.slice(1)}
                                  size="small"
                                  color={row.inventoryStatus === 'fulfilled' ? 'success' : 'warning'}
                                  sx={{ fontSize: '0.7rem', height: '20px' }}
                                />
                              </TableCell>
                            )}
                            {selectedColumns.includes('paymentStatus') && (
                              <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                                <Chip
                                  label={row.paymentStatus.charAt(0).toUpperCase() + row.paymentStatus.slice(1)}
                                  size="small"
                                  color={
                                    row.paymentStatus === 'paid' ? 'success' :
                                    row.paymentStatus === 'partial' ? 'warning' :
                                    row.paymentStatus === 'overpaid' ? 'info' :
                                    'error'
                                  }
                                  sx={{ fontSize: '0.7rem', height: '20px' }}
                                />
                              </TableCell>
                            )}
                            {selectedColumns.includes('customerName') && (
                              <TableCell sx={{ fontSize: '0.8rem' }}>
                                {row.customerName}
                              </TableCell>
                            )}
                            {selectedColumns.includes('orderDate') && (
                              <TableCell sx={{ fontSize: '0.8rem' }}>
                                {new Date(row.orderDate).toLocaleDateString()}
                              </TableCell>
                            )}
                            {selectedColumns.includes('totalCost') && (
                              <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                                {formatCurrency(row.totalCost)}
                              </TableCell>
                            )}
                            {selectedColumns.includes('totalRevenue') && (
                              <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                                {formatCurrency(row.totalRevenue)}
                              </TableCell>
                            )}
                            {selectedColumns.includes('grossProfit') && (
                              <TableCell align="right" sx={{
                                fontSize: '0.8rem',
                                color: row.grossProfit > 0 ? 'success.main' : 'error.main'
                              }}>
                                {formatCurrency(row.grossProfit)}
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
                              {selectedColumns.includes('orderNumber') && (
                                <TableCell sx={{ fontWeight: 600 }}>
                                  Subtotal
                                </TableCell>
                              )}
                              {selectedColumns.includes('inventoryStatus') && <TableCell />}
                              {selectedColumns.includes('paymentStatus') && <TableCell />}
                              {selectedColumns.includes('customerName') && <TableCell />}
                              {selectedColumns.includes('orderDate') && <TableCell />}
                              {selectedColumns.includes('totalCost') && (
                                <TableCell align="right">
                                  {formatCurrency(groupSubtotals.totalCost)}
                                </TableCell>
                              )}
                              {selectedColumns.includes('totalRevenue') && (
                                <TableCell align="right">
                                  {formatCurrency(groupSubtotals.totalRevenue)}
                                </TableCell>
                              )}
                              {selectedColumns.includes('grossProfit') && (
                                <TableCell align="right" sx={{
                                  color: groupSubtotals.grossProfit > 0 ? 'success.main' : 'error.main'
                                }}>
                                  {formatCurrency(groupSubtotals.grossProfit)}
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
                        {selectedColumns.includes('orderNumber') && (
                          <TableCell sx={{ fontWeight: 700 }}>
                            TOTAL
                          </TableCell>
                        )}
                        {selectedColumns.includes('inventoryStatus') && <TableCell />}
                        {selectedColumns.includes('paymentStatus') && <TableCell />}
                        {selectedColumns.includes('customerName') && <TableCell />}
                        {selectedColumns.includes('orderDate') && <TableCell />}
                        {selectedColumns.includes('totalCost') && (
                          <TableCell align="right">
                            {formatCurrency(totals.totalCost)}
                          </TableCell>
                        )}
                        {selectedColumns.includes('totalRevenue') && (
                          <TableCell align="right">
                            {formatCurrency(totals.totalRevenue)}
                          </TableCell>
                        )}
                        {selectedColumns.includes('grossProfit') && (
                          <TableCell align="right" sx={{
                            color: totals.grossProfit > 0 ? 'success.main' : 'error.main'
                          }}>
                            {formatCurrency(totals.grossProfit)}
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
    </Box>
  )
}

export default SalesOrderProfitReport
