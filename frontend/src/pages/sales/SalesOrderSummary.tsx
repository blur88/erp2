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
  Inventory2 as ProductIcon,
} from '@mui/icons-material'
import { formatCurrency } from '@/utils/formatters'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'

interface SalesOrderSummary {
  orderNumber: string
  orderDate: string
  customerName: string
  itemsCount: number
  totalAmount: number
  paidAmount: number
  balanceDue: number
  isPaidInFull: boolean
  isFulfilled: boolean
  status: string
}

const SalesOrderSummary: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const [loading, setLoading] = useState(false)
  const [reportData, setReportData] = useState<SalesOrderSummary[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<string>('')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [paymentStatus, setPaymentStatus] = useState<string>('all')
  const [invoiceStatus, setInvoiceStatus] = useState<string>('all')

  // Display options
  const [selectedColumns, setSelectedColumns] = useState<string[]>([
    'orderNumber', 'customerName', 'invoiceStatus', 'paymentStatus', 'orderDate', 'totalAmount'
  ])
  const [groupBy, setGroupBy] = useState<string>('none')
  const [sortBy1, setSortBy1] = useState<string>('orderNumber')
  const [sortBy2, setSortBy2] = useState<string>('none')
  const [sortBy3, setSortBy3] = useState<string>('none')
  const [reportTitle, setReportTitle] = useState<string>('Sales Order Summary')

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

      if (dateFrom) params.append('fromDate', dateFrom)
      if (dateTo) params.append('toDate', dateTo)
      if (selectedCustomer) params.append('customerId', selectedCustomer)
      if (paymentStatus && paymentStatus !== 'all') params.append('paymentStatus', paymentStatus)
      if (invoiceStatus && invoiceStatus !== 'all') params.append('status', invoiceStatus)

      params.append('limit', '1000') // Get all for report
      params.append('sortBy', 'orderDate')
      params.append('sortOrder', 'DESC')

      // Call the backend API
      const response = await fetch(`/api/sales-orders?${params.toString()}`)

      if (!response.ok) {
        throw new Error('Failed to fetch report data')
      }

      const result = await response.json()
      const orders = result.data || []

      // Transform data to match our interface
      const transformedData: SalesOrderSummary[] = orders.map((order: any) => ({
        orderNumber: order.orderNumber,
        orderDate: order.orderDate,
        customerName: order.customerName || order.customer?.name || 'Unknown',
        itemsCount: order.itemsCount || order.items?.length || 0,
        totalAmount: Number(order.totalAmount || 0),
        paidAmount: Number(order.paidAmount || 0),
        balanceDue: Number(order.balanceDue || 0),
        isPaidInFull: order.isPaidInFull || false,
        isFulfilled: order.isFulfilled || false,
        status: order.status || 'draft'
      }))

      setReportData(transformedData)
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
    setPaymentStatus('all')
    setInvoiceStatus('all')

    // Clear report data
    setReportData([])

    // Reset display options to defaults
    setSelectedColumns(['orderNumber', 'customerName', 'invoiceStatus', 'paymentStatus', 'orderDate', 'totalAmount'])
    setGroupBy('none')
    setSortBy1('orderNumber')
    setSortBy2('none')
    setSortBy3('none')
    setReportTitle('Sales Order Summary')

    // Reset pagination
    setPage(0)
    setRowsPerPage(25)
  }

  const handleExportExcel = () => {
    if (sortedData.length === 0) return

    // Column headers mapping
    const columnHeaders: { [key: string]: string } = {
      orderNumber: 'Order Number',
      orderDate: 'Order Date',
      customerName: 'Customer',
      itemsCount: 'Items',
      totalAmount: 'Total Amount',
      paidAmount: 'Paid Amount',
      balanceDue: 'Balance Due',
      paymentStatus: 'Payment Status',
      fulfillmentStatus: 'Fulfillment Status'
    }

    // Build CSV content
    let csv = reportTitle + '\n\n'

    // Add headers
    const headers = selectedColumns.map(col => columnHeaders[col] || col)
    csv += headers.join(',') + '\n'

    // Add data rows
    sortedData.forEach(row => {
      const values = selectedColumns.map(col => {
        const value = (row as any)[col]
        if (col === 'orderDate') {
          return `"${new Date(value).toLocaleDateString()}"`
        } else if (col === 'itemsCount') {
          return value
        } else if (col === 'paymentStatus') {
          return `"${row.isPaidInFull ? 'Paid' : row.paidAmount > 0 ? 'Partial' : 'Unpaid'}"`
        } else if (col === 'fulfillmentStatus') {
          return `"${row.isFulfilled ? 'Fulfilled' : 'Unfulfilled'}"`
        } else if (typeof value === 'number') {
          return value.toFixed(2)
        }
        return `"${value || ''}"`
      })
      csv += values.join(',') + '\n'
    })

    // Add totals
    if (totals) {
      csv += '\n"TOTAL",'
      const totalValues = selectedColumns.slice(1).map(col => {
        const value = (totals as any)[col]
        if (col === 'itemsCount') {
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
      orderNumber: 'Order Number',
      orderDate: 'Order Date',
      customerName: 'Customer',
      itemsCount: 'Items',
      totalAmount: 'Total Amount',
      paidAmount: 'Paid Amount',
      balanceDue: 'Balance Due',
      paymentStatus: 'Payment Status',
      fulfillmentStatus: 'Fulfillment Status'
    }

    let tableRows = ''

    sortedData.forEach(row => {
      tableRows += '<tr>'
      selectedColumns.forEach(col => {
        const value = (row as any)[col]
        let displayValue = value
        if (col === 'orderDate') {
          displayValue = new Date(value).toLocaleDateString()
        } else if (col === 'itemsCount') {
          displayValue = value
        } else if (col === 'paymentStatus') {
          displayValue = row.isPaidInFull ? 'Paid' : row.paidAmount > 0 ? 'Partial' : 'Unpaid'
        } else if (col === 'fulfillmentStatus') {
          displayValue = row.isFulfilled ? 'Fulfilled' : 'Unfulfilled'
        } else if (typeof value === 'number') {
          displayValue = formatCurrency(value)
        }
        tableRows += `<td>${displayValue || ''}</td>`
      })
      tableRows += '</tr>'
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
          if (col === 'itemsCount') {
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

    return reportData.reduce(
      (acc, item) => ({
        itemsCount: acc.itemsCount + item.itemsCount,
        totalAmount: acc.totalAmount + item.totalAmount,
        paidAmount: acc.paidAmount + item.paidAmount,
        balanceDue: acc.balanceDue + item.balanceDue,
      }),
      {
        itemsCount: 0,
        totalAmount: 0,
        paidAmount: 0,
        balanceDue: 0,
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
            <ProductIcon sx={{
              fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize,
              color: TYPOGRAPHY_STYLES.pageHeader.icon.color
            }} />
            Sales Order Summary
          </Typography>
          <Typography variant={TYPOGRAPHY_STYLES.pageSubtitle.variant} color={TYPOGRAPHY_STYLES.pageSubtitle.color}>
            {reportData.length > 0
              ? `Sales order summary report (${reportData.length} orders)`
              : 'View summary of sales orders with payment and fulfillment status'}
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
                  Invoice Date
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
                  <InputLabel>Invoice Status</InputLabel>
                  <Select
                    value={invoiceStatus}
                    label="Invoice Status"
                    onChange={(e) => setInvoiceStatus(e.target.value)}
                    MenuProps={{ PaperProps: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } }}
                  >
                    <MenuItem value="all">All</MenuItem>
                    <MenuItem value="draft">Draft</MenuItem>
                    <MenuItem value="partial_paid">Partial Paid</MenuItem>
                    <MenuItem value="paid">Paid</MenuItem>
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
                    onChange={(e) => setSelectedColumns(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)}
                    MenuProps={{ PaperProps: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } }}
                    renderValue={(selected) => `${selected.length} selected`}
                  >
                    <MenuItem value="orderNumber">Order No</MenuItem>
                    <MenuItem value="customerName">Customer</MenuItem>
                    <MenuItem value="invoiceStatus">Invoice Status</MenuItem>
                    <MenuItem value="paymentStatus">Payment Status</MenuItem>
                    <MenuItem value="orderDate">Order Date</MenuItem>
                    <MenuItem value="totalAmount">Total</MenuItem>
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
                    <MenuItem value="customerName">Customer</MenuItem>
                    <MenuItem value="paymentStatus">Payment Status</MenuItem>
                    <MenuItem value="invoiceStatus">Invoice Status</MenuItem>
                  </Select>
                </FormControl>

                <FormControl fullWidth size="small" sx={{ '& .MuiInputLabel-root': { fontSize: '0.75rem' }, '& .MuiSelect-select': { fontSize: '0.75rem' } }}>
                  <InputLabel>First Sort Order</InputLabel>
                  <Select
                    value={sortBy1}
                    label="First Sort Order"
                    onChange={(e) => setSortBy1(e.target.value)}
                    MenuProps={{ PaperProps: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } }}
                  >
                    <MenuItem value="orderDate">Order Date</MenuItem>
                    <MenuItem value="orderNumber">Order Number</MenuItem>
                    <MenuItem value="customerName">Customer</MenuItem>
                    <MenuItem value="totalAmount">Total Amount</MenuItem>
                    <MenuItem value="paidAmount">Paid Amount</MenuItem>
                    <MenuItem value="balanceDue">Balance Due</MenuItem>
                  </Select>
                </FormControl>

                <FormControl fullWidth size="small" sx={{ '& .MuiInputLabel-root': { fontSize: '0.75rem' }, '& .MuiSelect-select': { fontSize: '0.75rem' } }}>
                  <InputLabel>Then Sort By</InputLabel>
                  <Select
                    value={sortBy2}
                    label="Then Sort By"
                    onChange={(e) => setSortBy2(e.target.value)}
                    MenuProps={{ PaperProps: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } }}
                  >
                    <MenuItem value="none">None</MenuItem>
                    <MenuItem value="orderDate">Order Date</MenuItem>
                    <MenuItem value="orderNumber">Order Number</MenuItem>
                    <MenuItem value="customerName">Customer</MenuItem>
                    <MenuItem value="totalAmount">Total Amount</MenuItem>
                    <MenuItem value="paidAmount">Paid Amount</MenuItem>
                    <MenuItem value="balanceDue">Balance Due</MenuItem>
                  </Select>
                </FormControl>

                <FormControl fullWidth size="small" sx={{ '& .MuiInputLabel-root': { fontSize: '0.75rem' }, '& .MuiSelect-select': { fontSize: '0.75rem' } }}>
                  <InputLabel>Then Sort By</InputLabel>
                  <Select
                    value={sortBy3}
                    label="Then Sort By"
                    onChange={(e) => setSortBy3(e.target.value)}
                    MenuProps={{ PaperProps: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } }}
                  >
                    <MenuItem value="none">None</MenuItem>
                    <MenuItem value="orderDate">Order Date</MenuItem>
                    <MenuItem value="orderNumber">Order Number</MenuItem>
                    <MenuItem value="customerName">Customer</MenuItem>
                    <MenuItem value="totalAmount">Total Amount</MenuItem>
                    <MenuItem value="paidAmount">Paid Amount</MenuItem>
                    <MenuItem value="balanceDue">Balance Due</MenuItem>
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
                        Configure the filters on the left and click "Generate Report" to view sales order summary.
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
                      backgroundColor: 'grey.50',
                      color: TYPOGRAPHY_STYLES.tableHeader.color,
                      fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                      textAlign: 'center'
                    } }}>
                      {selectedColumns.includes('orderNumber') && <TableCell align="center">Order No</TableCell>}
                      {selectedColumns.includes('customerName') && <TableCell align="center">Customer</TableCell>}
                      {selectedColumns.includes('invoiceStatus') && <TableCell align="center">Invoice Status</TableCell>}
                      {selectedColumns.includes('paymentStatus') && <TableCell align="center">Payment Status</TableCell>}
                      {selectedColumns.includes('orderDate') && <TableCell align="center">Order Date</TableCell>}
                      {selectedColumns.includes('totalAmount') && <TableCell align="center">Total</TableCell>}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginatedData.map((row, idx) => (
                      <TableRow
                        key={`${row.orderNumber}-${idx}`}
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
                        {selectedColumns.includes('customerName') && (
                          <TableCell sx={{ fontSize: '0.8rem' }}>
                            {row.customerName}
                          </TableCell>
                        )}
                        {selectedColumns.includes('invoiceStatus') && (
                          <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                            <Chip
                              label={row.status || 'Draft'}
                              size="small"
                              color={row.status === 'completed' ? 'success' : row.status === 'cancelled' ? 'error' : 'default'}
                              sx={{ fontSize: '0.7rem', height: '20px' }}
                            />
                          </TableCell>
                        )}
                        {selectedColumns.includes('paymentStatus') && (
                          <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                            <Chip
                              label={row.isPaidInFull ? 'Paid' : row.paidAmount > 0 ? 'Partial' : 'Unpaid'}
                              size="small"
                              color={row.isPaidInFull ? 'success' : row.paidAmount > 0 ? 'warning' : 'default'}
                              sx={{ fontSize: '0.7rem', height: '20px' }}
                            />
                          </TableCell>
                        )}
                        {selectedColumns.includes('orderDate') && (
                          <TableCell sx={{ fontSize: '0.8rem' }}>
                            {new Date(row.orderDate).toLocaleDateString()}
                          </TableCell>
                        )}
                        {selectedColumns.includes('totalAmount') && (
                          <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                            {formatCurrency(row.totalAmount)}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
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
                        {selectedColumns.includes('customerName') && <TableCell />}
                        {selectedColumns.includes('invoiceStatus') && <TableCell />}
                        {selectedColumns.includes('paymentStatus') && <TableCell />}
                        {selectedColumns.includes('orderDate') && <TableCell />}
                        {selectedColumns.includes('totalAmount') && (
                          <TableCell align="right">
                            {formatCurrency(totals.totalAmount)}
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

export default SalesOrderSummary
