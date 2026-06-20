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
  FormControlLabel,
  Checkbox,
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
import { default as PaymentOrderIcon } from '@mui/icons-material/ReceiptLongOutlined'
import PageHeader from '@/components/common/PageHeader'
import { printColors } from '@/styles/printTokens'
import { formatCurrency, formatDate, formatDateTime } from '@/utils/formatters'
import { escapeHtml } from '@/utils/security'
import { printReport } from '@/utils/printReport'
import { exportReportExcel } from '@/utils/exportReport'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { ApiService } from '@/services/api'

interface CustomerPaymentByOrder {
  customerId: string
  customerName: string
  orderNumber: string
  orderDate: string
  invoiceNumber: string
  invoiceDate: string
  inventoryStatus: string
  totalAmount: number
  paidAmount: number
  balance: number
  paymentStatus: string
  lastPaymentDate: string | null
}

const CustomerPaymentByOrder: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const [loading, setLoading] = useState(false)
  const [reportData, setReportData] = useState<CustomerPaymentByOrder[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<string>('')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [paymentStatus, setPaymentStatus] = useState<string>('all')

  // Options
  const [showOnlyOwing, setShowOnlyOwing] = useState<boolean>(false)

  // Display options
  const [selectedColumns, setSelectedColumns] = useState<string[]>([
    'orderNumber', 'customerName', 'inventoryStatus', 'paymentStatus', 'orderDate', 'lastPaymentDate', 'totalAmount', 'paidAmount', 'balance'
  ])
  const [groupBy, setGroupBy] = useState<string>('none')
  const [sortBy1, setSortBy1] = useState<string>('orderNumber')
  const [reportTitle, setReportTitle] = useState<string>('Customer Payment by Order')

  // Pagination
  const { page, limit, reset, setLimit, paginationProps } = usePagination()

  useEffect(() => {
    // Load customers with authentication
    ApiService.get<{ data: any[] }>('/customers')
      .then(data => {
        if (data?.data) {
          setCustomers(data.data)
        }
      })
      .catch(() => {})
  }, [])

  // Reset to first page when filters or display options change
  useEffect(() => {
    reset()
  }, [showOnlyOwing, groupBy, sortBy1])

  const handleGenerateReport = async () => {
    setLoading(true)
    reset() // Reset to first page when generating new report

    try {
      // Build query parameters
      const params = new URLSearchParams()

      if (dateFrom) params.append('dateFrom', dateFrom)
      if (dateTo) params.append('dateTo', dateTo)
      if (selectedCustomer) params.append('customerId', selectedCustomer)
      if (paymentStatus && paymentStatus !== 'all') params.append('paymentStatus', paymentStatus)

      // Call the backend API with authentication
      const data = await ApiService.get<{ data: CustomerPaymentByOrder[] }>(
        `/sales/analytics/customer-payment-by-order?${params.toString()}`
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
    setSelectedCustomer('')
    setDateFrom('')
    setDateTo('')
    setPaymentStatus('all')

    // Clear options
    setShowOnlyOwing(false)

    // Clear report data
    setReportData([])

    // Reset display options to defaults
    setSelectedColumns(['orderNumber', 'customerName', 'inventoryStatus', 'paymentStatus', 'orderDate', 'lastPaymentDate', 'totalAmount', 'paidAmount', 'balance'])
    setGroupBy('none')
    setSortBy1('orderNumber')
    setReportTitle('Customer Payment by Order')

    // Reset pagination
    setLimit(25)
  }

  const handleExportExcel = async () => {
    try {
      const date = new Date().toISOString().split('T')[0]
      await exportReportExcel(
        '/sales/analytics/customer-payment-by-order/export',
        { dateFrom, dateTo, customerId: selectedCustomer, paymentStatus },
        `customer-payment-by-order-${date}.xlsx`,
      )
    } catch (err) {
      console.error('Export failed:', err)
    }
  }

  const handleExportPDF = () => {
    if (sortedData.length === 0) return

    const columnHeaders: { [key: string]: string } = {
      orderNumber: 'Order No',
      customerName: 'Customer',
      inventoryStatus: 'Inventory Status',
      paymentStatus: 'Payment Status',
      orderDate: 'Order Date',
      lastPaymentDate: 'Date Paid',
      totalAmount: 'Sales Total',
      paidAmount: 'Amount Paid',
      balance: 'Balance'
    }

    let tableRows = ''
    let prevGroupValue: any = null

    sortedData.forEach((row, idx) => {
      // Determine current group value
      const currentGroupValue = groupBy !== 'none' ? (row as any)[groupBy] : null

      // Add group header if group changed
      if (groupBy !== 'none' && currentGroupValue !== prevGroupValue) {
        const groupLabel = groupBy === 'customerName' ? `Customer: ${escapeHtml(currentGroupValue)}` :
                          groupBy === 'inventoryStatus' ? `Inventory: ${escapeHtml(currentGroupValue.charAt(0).toUpperCase() + currentGroupValue.slice(1))}` :
                          groupBy === 'paymentStatus' ? `Payment: ${escapeHtml(currentGroupValue.charAt(0).toUpperCase() + currentGroupValue.slice(1))}` : escapeHtml(currentGroupValue)
        tableRows += `<tr style="background-color: ${printColors.groupRow}; font-weight: bold;"><td colspan="${selectedColumns.length}">${groupLabel}</td></tr>`
        prevGroupValue = currentGroupValue
      }

      tableRows += '<tr>'
      selectedColumns.forEach(col => {
        const value = (row as any)[col]
        let displayValue = value
        if (col === 'orderDate' || col === 'lastPaymentDate') {
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
      const nextGroupValue = nextRow && groupBy !== 'none' ? (nextRow as any)[groupBy] : null

      if (groupBy !== 'none' && (!nextRow || currentGroupValue !== nextGroupValue)) {
        // Calculate subtotal for this group
        const groupData = sortedData.filter(r => (r as any)[groupBy] === currentGroupValue)

        const subtotal = {
          totalAmount: groupData.reduce((sum, r) => sum + r.totalAmount, 0),
          paidAmount: groupData.reduce((sum, r) => sum + r.paidAmount, 0),
          balance: groupData.reduce((sum, r) => sum + r.balance, 0),
        }

        tableRows += `<tr style="background-color: ${printColors.infoRow}; font-weight: bold; border-top: 2px solid ${printColors.tableHeaderBg};">`
        selectedColumns.forEach((col, colIdx) => {
          if (colIdx === 0) {
            tableRows += '<td style="font-weight: bold;">Subtotal</td>'
          } else if (col === 'totalAmount' || col === 'paidAmount' || col === 'balance') {
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

    const totals = reportData.reduce(
      (acc, item) => ({
        totalAmount: acc.totalAmount + item.totalAmount,
        paidAmount: acc.paidAmount + item.paidAmount,
        balance: acc.balance + item.balance,
      }),
      {
        totalAmount: 0,
        paidAmount: 0,
        balance: 0,
      }
    )

    return totals
  }

  const totals = calculateTotals()

  // Sort and filter the report data
  const getSortedData = () => {
    if (reportData.length === 0) return []

    let filtered = [...reportData]

    // Apply "Show Only Owing" filter - show orders with outstanding balance
    if (showOnlyOwing) {
      filtered = filtered.filter(order => order.balance > 0)
    }

    const compareValues = (a: any, b: any, field: string) => {
      const aVal = a[field]
      const bVal = b[field]

      // Handle null/undefined
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1

      // Date comparison - ascending (earlier to latest)
      if (field === 'orderDate' || field === 'invoiceDate' || field === 'lastPaymentDate') {
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
        // Group by the selected field first
        const groupResult = compareValues(a, b, groupBy)
        if (groupResult !== 0) return groupResult

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
            ? `Payment details for ${reportData.length} orders`
            : 'View customer payments organized by sales order'
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

            {/* Options Section */}
            <Paper sx={{ display: 'flex', flexDirection: 'column', flex: 0.5, overflow: 'hidden' }}>
              <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border, flexShrink: 0 }}>
                <Typography variant="tableHeader" sx={{
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Options
                </Typography>
              </Box>

              <Box sx={{ p: 2, overflow: 'auto', flex: 1 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={showOnlyOwing}
                      onChange={(e) => setShowOnlyOwing(e.target.checked)}
                      size="small"
                    />
                  }
                  label={
                    <Typography variant="caption">
                      Show Only Owing
                    </Typography>
                  }
                />
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
                        const allColumns = ['orderNumber', 'customerName', 'inventoryStatus', 'paymentStatus', 'orderDate', 'lastPaymentDate', 'totalAmount', 'paidAmount', 'balance']
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
                    <MenuItem value="lastPaymentDate">Date Paid</MenuItem>
                    <MenuItem value="totalAmount">Sales Total</MenuItem>
                    <MenuItem value="paidAmount">Amount Paid</MenuItem>
                    <MenuItem value="balance">Balance</MenuItem>
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
                    MenuProps={{ slotProps: { paper: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } } }}
                  >
                    <MenuItem value="orderNumber">Order No</MenuItem>
                    <MenuItem value="customerName">Customer</MenuItem>
                    <MenuItem value="inventoryStatus">Inventory Status</MenuItem>
                    <MenuItem value="paymentStatus">Payment Status</MenuItem>
                    <MenuItem value="orderDate">Order Date</MenuItem>
                    <MenuItem value="lastPaymentDate">Date Paid</MenuItem>
                    <MenuItem value="totalAmount">Sales Total</MenuItem>
                    <MenuItem value="paidAmount">Amount Paid</MenuItem>
                    <MenuItem value="balance">Balance</MenuItem>
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
                      <PaymentOrderIcon sx={{ fontSize: 80, color: 'text.disabled', mb: 2 }} />
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
                        Configure the filters on the left and click "Generate Report" to view customer payment details by order.
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
                      {selectedColumns.includes('lastPaymentDate') && <TableCell align="center">Date Paid</TableCell>}
                      {selectedColumns.includes('totalAmount') && <TableCell align="center">Sales Total</TableCell>}
                      {selectedColumns.includes('paidAmount') && <TableCell align="center">Amount Paid</TableCell>}
                      {selectedColumns.includes('balance') && <TableCell align="center">Balance</TableCell>}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginatedData.map((row, idx) => {
                      // Check if we need to display a group header
                      const prevRow = idx > 0 ? paginatedData[idx - 1] : null
                      const nextRow = idx < paginatedData.length - 1 ? paginatedData[idx + 1] : null

                      const showGroupHeader = groupBy !== 'none' && (!prevRow || (row as any)[groupBy] !== (prevRow as any)[groupBy])
                      const showGroupFooter = groupBy !== 'none' && (!nextRow || (row as any)[groupBy] !== (nextRow as any)[groupBy])

                      const getGroupLabel = (field: string, value: any) => {
                        if (field === 'customerName') return `Customer: ${value}`
                        if (field === 'inventoryStatus') return `Inventory: ${value.charAt(0).toUpperCase() + value.slice(1)}`
                        if (field === 'paymentStatus') return `Payment: ${value.charAt(0).toUpperCase() + value.slice(1)}`
                        return value
                      }

                      // Calculate group subtotals
                      const calculateGroupSubtotals = () => {
                        if (groupBy === 'none') return null

                        const currentGroupValue = (row as any)[groupBy]
                        const groupData = paginatedData.filter(r => (r as any)[groupBy] === currentGroupValue)

                        return {
                          totalAmount: groupData.reduce((sum, r) => sum + r.totalAmount, 0),
                          paidAmount: groupData.reduce((sum, r) => sum + r.paidAmount, 0),
                          balance: groupData.reduce((sum, r) => sum + r.balance, 0),
                        }
                      }

                      const groupSubtotals = showGroupFooter ? calculateGroupSubtotals() : null

                      return (
                        <React.Fragment key={`${row.invoiceNumber}-${idx}`}>
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
                                {getGroupLabel(groupBy, (row as any)[groupBy])}
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
                            <StatusChip status={row.inventoryStatus === 'fulfilled' ? 'fulfilled' : 'unfulfilled'} sx={{ fontSize: '0.7rem', height: '20px' }} />
                          </TableCell>
                        )}
                        {selectedColumns.includes('paymentStatus') && (
                          <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                            <StatusChip status={row.paymentStatus} sx={{ fontSize: '0.7rem', height: '20px' }} />
                          </TableCell>
                        )}
                        {selectedColumns.includes('orderDate') && (
                          <TableCell sx={{ fontSize: '0.8rem' }}>
                            {row.orderDate ? formatDate(row.orderDate) : '-'}
                          </TableCell>
                        )}
                        {selectedColumns.includes('lastPaymentDate') && (
                          <TableCell sx={{ fontSize: '0.8rem' }}>
                            {row.lastPaymentDate ? formatDate(row.lastPaymentDate) : '-'}
                          </TableCell>
                        )}
                        {selectedColumns.includes('totalAmount') && (
                          <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                            {formatCurrency(row.totalAmount)}
                          </TableCell>
                        )}
                        {selectedColumns.includes('paidAmount') && (
                          <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                            {formatCurrency(row.paidAmount)}
                          </TableCell>
                        )}
                        {selectedColumns.includes('balance') && (
                          <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 600, color: row.balance > 0 ? 'error.main' : 'success.main' }}>
                            {formatCurrency(row.balance)}
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
                                {selectedColumns.includes('lastPaymentDate') && <TableCell />}
                                {selectedColumns.includes('totalAmount') && (
                                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                                    {formatCurrency(groupSubtotals.totalAmount)}
                                  </TableCell>
                                )}
                                {selectedColumns.includes('paidAmount') && (
                                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                                  {formatCurrency(groupSubtotals.paidAmount)}
                                </TableCell>
                              )}
                              {selectedColumns.includes('balance') && (
                                <TableCell align="right" sx={{
                                  fontWeight: 700,
                                  color: groupSubtotals.balance > 0 ? 'error.main' : 'success.main'
                                }}>
                                  {formatCurrency(groupSubtotals.balance)}
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
                        {selectedColumns.includes('lastPaymentDate') && <TableCell />}
                        {selectedColumns.includes('totalAmount') && (
                          <TableCell align="right" sx={{ fontWeight: 800 }}>
                            {formatCurrency(totals.totalAmount)}
                          </TableCell>
                        )}
                        {selectedColumns.includes('paidAmount') && (
                          <TableCell align="right" sx={{ fontWeight: 800 }}>
                            {formatCurrency(totals.paidAmount)}
                          </TableCell>
                        )}
                        {selectedColumns.includes('balance') && (
                          <TableCell align="right" sx={{ fontWeight: 800 }}>
                            {formatCurrency(totals.balance)}
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

export default CustomerPaymentByOrder
