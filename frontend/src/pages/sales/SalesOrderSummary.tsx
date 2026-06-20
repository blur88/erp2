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
import { default as OrderIcon } from '@mui/icons-material/Receipt'
import PageHeader from '@/components/common/PageHeader'
import { printColors } from '@/styles/printTokens'
import { formatCurrency, formatDate, formatDateTime } from '@/utils/formatters'
import { escapeHtml } from '@/utils/security'
import { printReport } from '@/utils/printReport'
import { exportReportExcel } from '@/utils/exportReport'
import { TABLE_STYLES } from '@/constants/tableStyles'
import api from '@/services/api'

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
  const [inventoryStatus, setInventoryStatus] = useState<string>('all')

  // Display options
  const [selectedColumns, setSelectedColumns] = useState<string[]>([
    'orderNumber', 'customerName', 'inventoryStatus', 'paymentStatus', 'orderDate', 'totalAmount'
  ])
  const [groupBy, setGroupBy] = useState<string>('none')
  const [sortBy1, setSortBy1] = useState<string>('orderNumber')
  const [sortBy2, setSortBy2] = useState<string>('none')
  const [sortBy3, setSortBy3] = useState<string>('none')
  const [reportTitle, setReportTitle] = useState<string>('Sales Order Summary')

  // Pagination
  const { page, limit, reset, setLimit, paginationProps } = usePagination()

  useEffect(() => {
    // Load customers using authenticated API
    api.get('/customers')
      .then(res => {
        if (res.data?.data) {
          setCustomers(res.data.data)
        }
      })
      .catch(err => {
        console.error('Failed to load customers:', err)
      })
  }, [])

  const handleGenerateReport = async () => {
    setLoading(true)
    reset() // Reset to first page when generating new report

    try {
      // Build query parameters using authenticated API
      const queryParams: any = {
        sortBy: 'orderDate',
        sortOrder: 'DESC'
      }

      if (dateFrom) queryParams.fromDate = dateFrom
      if (dateTo) queryParams.toDate = dateTo
      if (selectedCustomer) queryParams.customerId = selectedCustomer
      if (paymentStatus && paymentStatus !== 'all') queryParams.paymentStatus = paymentStatus
      if (inventoryStatus && inventoryStatus !== 'all') queryParams.fulfillmentStatus = inventoryStatus

      // Call the backend API using authenticated service
      const result = await api.get('/sales-orders', { params: queryParams })
      const orders = result.data?.data || []

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
    setInventoryStatus('all')

    // Clear report data
    setReportData([])

    // Reset display options to defaults
    setSelectedColumns(['orderNumber', 'customerName', 'inventoryStatus', 'paymentStatus', 'orderDate', 'totalAmount'])
    setGroupBy('none')
    setSortBy1('orderNumber')
    setSortBy2('none')
    setSortBy3('none')
    setReportTitle('Sales Order Summary')

    // Reset pagination
    reset()
    setLimit(25)
  }

  const handleExportExcel = async () => {
    try {
      const date = new Date().toISOString().split('T')[0]
      await exportReportExcel(
        '/sales/analytics/sales-order-summary/export',
        { dateFrom, dateTo, customerId: selectedCustomer, status: inventoryStatus, paymentStatus },
        `sales-order-summary-${date}.xlsx`,
      )
    } catch (err) {
      console.error('Export failed:', err)
    }
  }

  const handleExportPDF = () => {
    if (sortedData.length === 0) return

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
    let prevGroupValue: any = null

    sortedData.forEach((row, idx) => {
      // Determine current group value
      let currentGroupValue: any = null
      if (groupBy === 'customerName') {
        currentGroupValue = row.customerName
      } else if (groupBy === 'paymentStatus') {
        currentGroupValue = row.isPaidInFull ? 'Paid' : row.paidAmount > 0 ? 'Partial' : 'Unpaid'
      } else if (groupBy === 'inventoryStatus') {
        currentGroupValue = row.isFulfilled ? 'Fulfilled' : 'Unfulfilled'
      }

      // Add group header if group changed
      if (groupBy !== 'none' && currentGroupValue !== prevGroupValue) {
        const groupLabel = groupBy === 'customerName' ? `Customer: ${escapeHtml(currentGroupValue)}` :
                          groupBy === 'inventoryStatus' ? `Inventory: ${escapeHtml(currentGroupValue)}` :
                          groupBy === 'paymentStatus' ? `Payment: ${escapeHtml(currentGroupValue)}` : escapeHtml(currentGroupValue)
        tableRows += `<tr style="background-color: ${printColors.groupRow}; font-weight: bold;"><td colspan="${selectedColumns.length}">${groupLabel}</td></tr>`
        prevGroupValue = currentGroupValue
      }

      tableRows += '<tr>'
      selectedColumns.forEach(col => {
        const value = (row as any)[col]
        let displayValue = value
        if (col === 'orderDate') {
          displayValue = formatDate(value)
        } else if (col === 'itemsCount') {
          displayValue = value
        } else if (col === 'paymentStatus') {
          displayValue = row.isPaidInFull ? 'Paid' : row.paidAmount > 0 ? 'Partial' : 'Unpaid'
        } else if (col === 'fulfillmentStatus') {
          displayValue = row.isFulfilled ? 'Fulfilled' : 'Unfulfilled'
        } else if (typeof value === 'number') {
          displayValue = formatCurrency(value)
        }
        tableRows += `<td>${escapeHtml(displayValue)}</td>`
      })
      tableRows += '</tr>'

      // Check if we need to add subtotal
      const nextRow = idx < sortedData.length - 1 ? sortedData[idx + 1] : null
      let nextGroupValue: any = null
      if (nextRow) {
        if (groupBy === 'customerName') nextGroupValue = nextRow.customerName
        else if (groupBy === 'paymentStatus') nextGroupValue = nextRow.isPaidInFull ? 'Paid' : nextRow.paidAmount > 0 ? 'Partial' : 'Unpaid'
        else if (groupBy === 'inventoryStatus') nextGroupValue = nextRow.isFulfilled ? 'Fulfilled' : 'Unfulfilled'
      }

      if (groupBy !== 'none' && (!nextRow || currentGroupValue !== nextGroupValue)) {
        // Calculate subtotal for this group
        const groupData = sortedData.filter(r => {
          let rowGroupValue: any = null
          if (groupBy === 'customerName') rowGroupValue = r.customerName
          else if (groupBy === 'paymentStatus') rowGroupValue = r.isPaidInFull ? 'Paid' : r.paidAmount > 0 ? 'Partial' : 'Unpaid'
          else if (groupBy === 'inventoryStatus') rowGroupValue = r.isFulfilled ? 'Fulfilled' : 'Unfulfilled'
          return rowGroupValue === currentGroupValue
        })

        const subtotal = {
          itemsCount: groupData.reduce((sum, r) => sum + r.itemsCount, 0),
          totalAmount: groupData.reduce((sum, r) => sum + r.totalAmount, 0),
          paidAmount: groupData.reduce((sum, r) => sum + r.paidAmount, 0),
          balanceDue: groupData.reduce((sum, r) => sum + r.balanceDue, 0),
        }

        tableRows += `<tr style="background-color: ${printColors.infoRow}; font-weight: bold; border-top: 2px solid ${printColors.tableHeaderBg};">`
        selectedColumns.forEach((col, colIdx) => {
          if (colIdx === 0) {
            tableRows += '<td style="font-weight: bold;">Subtotal</td>'
          } else if (col === 'itemsCount') {
            const value = (subtotal as any)[col]
            tableRows += `<td style="text-align: right; font-weight: bold;">${value?.toLocaleString() || ''}</td>`
          } else if (col === 'totalAmount' || col === 'paidAmount' || col === 'balanceDue') {
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
        } else if (col === 'itemsCount') {
          const value = (totals as any)[col]
          tableRows += `<td style="text-align: right; font-weight: 800;">${value?.toLocaleString() || ''}</td>`
        } else if (col === 'totalAmount' || col === 'paidAmount' || col === 'balanceDue') {
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
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { border: 1px solid ${printColors.tableBorder}; padding: 6px; text-align: left; }
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
      let aVal = a[field]
      let bVal = b[field]

      // Handle derived fields
      if (field === 'inventoryStatus') {
        aVal = a.isFulfilled ? 'Fulfilled' : 'Unfulfilled'
        bVal = b.isFulfilled ? 'Fulfilled' : 'Unfulfilled'
      } else if (field === 'paymentStatus') {
        aVal = a.isPaidInFull ? 'Paid' : a.paidAmount > 0 ? 'Partial' : 'Unpaid'
        bVal = b.isPaidInFull ? 'Paid' : b.paidAmount > 0 ? 'Partial' : 'Unpaid'
      }

      // Handle null/undefined
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1

      // Date comparison - ascending (earlier to later)
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
  const paginatedData = sortedData.slice((page - 1) * limit, (page - 1) * limit + limit)

  // Pagination handlers


  return (
    <>
      <PageHeader
        variant="report"
        title={reportTitle}
        subtitle={
          reportData.length > 0
            ? `Sales order summary report (${reportData.length} orders)`
            : 'View summary of sales orders with payment and fulfillment status'
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
                <FormControl fullWidth size="small" sx={{ '& .MuiInputLabel-root': { fontSize: '0.75rem' }, '& .MuiSelect-select': { fontSize: '0.75rem' } }}>
                  <InputLabel>Customer</InputLabel>
                  <Select
                    value={selectedCustomer}
                    label="Customer"
                    onChange={(e) => setSelectedCustomer(e.target.value)}
                    MenuProps={{ slotProps: { paper: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } } }}
                  >
                    <MenuItem value="">All Customers</MenuItem>
                    {customers.map((customer) => (
                      <MenuItem key={customer.id} value={customer.id}>
                        {customer.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Typography
                  variant="caption"
                  sx={{
                    color: "text.secondary",
                    mb: 1
                  }}>
                  Invoice Date
                </Typography>
                <TextField
                  label="Date From"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  slotProps={{
                    inputLabel: { shrink: true, sx: { fontSize: '0.75rem' } },
                    htmlInput: { sx: { fontSize: '0.75rem' } }
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
                    htmlInput: { sx: { fontSize: '0.75rem' } }
                  }}
                  size="small"
                  fullWidth
                />

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
                        const allColumns = ['orderNumber', 'customerName', 'inventoryStatus', 'paymentStatus', 'orderDate', 'totalAmount']
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
                    <MenuItem value="orderNumber">Order No</MenuItem>
                    <MenuItem value="customerName">Customer</MenuItem>
                    <MenuItem value="inventoryStatus">Inventory Status</MenuItem>
                    <MenuItem value="paymentStatus">Payment Status</MenuItem>
                    <MenuItem value="orderDate">Order Date</MenuItem>
                    <MenuItem value="totalAmount">Total</MenuItem>
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
                    <MenuItem value="customerName">Customer</MenuItem>
                    <MenuItem value="paymentStatus">Payment Status</MenuItem>
                    <MenuItem value="inventoryStatus">Inventory Status</MenuItem>
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
                    <MenuItem value="orderNumber">Order No</MenuItem>
                    <MenuItem value="customerName">Customer</MenuItem>
                    <MenuItem value="inventoryStatus">Inventory Status</MenuItem>
                    <MenuItem value="paymentStatus">Payment Status</MenuItem>
                    <MenuItem value="orderDate">Order Date</MenuItem>
                    <MenuItem value="totalAmount">Total</MenuItem>
                  </Select>
                </FormControl>

                <TextField
                  label="Report Title"
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  slotProps={{
                    inputLabel: { sx: { fontSize: '0.75rem' } },
                    htmlInput: { sx: { fontSize: '0.75rem' } }
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
                      <OrderIcon sx={{ fontSize: 80, color: 'text.disabled', mb: 2 }} />
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
                <Typography variant="tableHeader" sx={{
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Report Preview ({reportData.length} orders)
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
                      {selectedColumns.includes('orderNumber') && <TableCell align="center">Order No</TableCell>}
                      {selectedColumns.includes('customerName') && <TableCell align="center">Customer</TableCell>}
                      {selectedColumns.includes('inventoryStatus') && <TableCell align="center">Inventory Status</TableCell>}
                      {selectedColumns.includes('paymentStatus') && <TableCell align="center">Payment Status</TableCell>}
                      {selectedColumns.includes('orderDate') && <TableCell align="center">Order Date</TableCell>}
                      {selectedColumns.includes('totalAmount') && <TableCell align="center">Total</TableCell>}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginatedData.map((row, idx) => {
                      // Check if we need to display a group header
                      const prevRow = idx > 0 ? paginatedData[idx - 1] : null
                      const nextRow = idx < paginatedData.length - 1 ? paginatedData[idx + 1] : null

                      // Determine current group value based on groupBy field
                      let currentGroupValue: any
                      let prevGroupValue: any
                      let nextGroupValue: any

                      if (groupBy === 'customerName') {
                        currentGroupValue = row.customerName
                        prevGroupValue = prevRow?.customerName
                        nextGroupValue = nextRow?.customerName
                      } else if (groupBy === 'paymentStatus') {
                        currentGroupValue = row.isPaidInFull ? 'Paid' : row.paidAmount > 0 ? 'Partial' : 'Unpaid'
                        prevGroupValue = prevRow ? (prevRow.isPaidInFull ? 'Paid' : prevRow.paidAmount > 0 ? 'Partial' : 'Unpaid') : null
                        nextGroupValue = nextRow ? (nextRow.isPaidInFull ? 'Paid' : nextRow.paidAmount > 0 ? 'Partial' : 'Unpaid') : null
                      } else if (groupBy === 'inventoryStatus') {
                        currentGroupValue = row.isFulfilled ? 'Fulfilled' : 'Unfulfilled'
                        prevGroupValue = prevRow ? (prevRow.isFulfilled ? 'Fulfilled' : 'Unfulfilled') : null
                        nextGroupValue = nextRow ? (nextRow.isFulfilled ? 'Fulfilled' : 'Unfulfilled') : null
                      }

                      const showGroupHeader = groupBy !== 'none' && (!prevRow || currentGroupValue !== prevGroupValue)
                      const showGroupFooter = groupBy !== 'none' && (!nextRow || currentGroupValue !== nextGroupValue)

                      const getGroupLabel = (field: string, value: any) => {
                        if (field === 'customerName') return `Customer: ${value}`
                        if (field === 'inventoryStatus') return `Inventory: ${value}`
                        if (field === 'paymentStatus') return `Payment: ${value}`
                        return value
                      }

                      // Calculate group subtotals
                      const calculateGroupSubtotals = () => {
                        if (groupBy === 'none') return null

                        const groupData = paginatedData.filter(r => {
                          if (groupBy === 'customerName') return r.customerName === currentGroupValue
                          if (groupBy === 'paymentStatus') {
                            const status = r.isPaidInFull ? 'Paid' : r.paidAmount > 0 ? 'Partial' : 'Unpaid'
                            return status === currentGroupValue
                          }
                          if (groupBy === 'inventoryStatus') {
                            const status = r.isFulfilled ? 'Fulfilled' : 'Unfulfilled'
                            return status === currentGroupValue
                          }
                          return false
                        })

                        return {
                          itemsCount: groupData.reduce((sum, r) => sum + r.itemsCount, 0),
                          totalAmount: groupData.reduce((sum, r) => sum + r.totalAmount, 0),
                          paidAmount: groupData.reduce((sum, r) => sum + r.paidAmount, 0),
                          balanceDue: groupData.reduce((sum, r) => sum + r.balanceDue, 0),
                        }
                      }

                      const groupSubtotals = showGroupFooter ? calculateGroupSubtotals() : null

                      return (
                        <React.Fragment key={`${row.orderNumber}-${idx}`}>
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
                            {selectedColumns.includes('customerName') && (
                              <TableCell sx={{ fontSize: '0.8rem' }}>
                                {row.customerName}
                              </TableCell>
                            )}
                            {selectedColumns.includes('inventoryStatus') && (
                              <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                                <StatusChip status={row.isFulfilled ? 'fulfilled' : 'unfulfilled'} sx={{ fontSize: '0.7rem', height: '20px' }} />
                              </TableCell>
                            )}
                            {selectedColumns.includes('paymentStatus') && (
                              <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                                <StatusChip status={row.isPaidInFull ? 'paid' : row.paidAmount > 0 ? 'partial' : 'unpaid'} sx={{ fontSize: '0.7rem', height: '20px' }} />
                              </TableCell>
                            )}
                            {selectedColumns.includes('orderDate') && (
                              <TableCell sx={{ fontSize: '0.8rem' }}>
                                {formatDate(row.orderDate)}
                              </TableCell>
                            )}
                            {selectedColumns.includes('totalAmount') && (
                              <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                                {formatCurrency(row.totalAmount)}
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
                                {selectedColumns.includes('orderNumber') && (
                                  <TableCell sx={{ fontWeight: 700 }}>
                                    Subtotal
                                  </TableCell>
                                )}
                                {selectedColumns.includes('customerName') && <TableCell />}
                                {selectedColumns.includes('inventoryStatus') && <TableCell />}
                                {selectedColumns.includes('paymentStatus') && <TableCell />}
                                {selectedColumns.includes('orderDate') && <TableCell />}
                                {selectedColumns.includes('totalAmount') && (
                                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                                    {formatCurrency(groupSubtotals.totalAmount)}
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
                        {selectedColumns.includes('orderNumber') && (
                          <TableCell sx={{ fontWeight: 800 }}>
                            GRAND TOTAL
                          </TableCell>
                        )}
                        {selectedColumns.includes('customerName') && <TableCell />}
                        {selectedColumns.includes('inventoryStatus') && <TableCell />}
                        {selectedColumns.includes('paymentStatus') && <TableCell />}
                        {selectedColumns.includes('orderDate') && <TableCell />}
                        {selectedColumns.includes('totalAmount') && (
                          <TableCell align="right" sx={{ fontWeight: 800 }}>
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
                  <PagePagination total={sortedData.length} {...paginationProps} />
                </Box>
              )}
            </Paper>
          )}
        </Grid>
      </Grid>
    </>
  );
}

export default SalesOrderSummary
