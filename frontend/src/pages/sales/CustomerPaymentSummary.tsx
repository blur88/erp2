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
  TablePagination,
  CircularProgress,
  Stack,
  useTheme,
  useMediaQuery,
  Chip,
  FormControlLabel,
  Checkbox,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import { AppButton } from '@/components/common/AppButton'
import { default as PdfIcon } from '@mui/icons-material/PictureAsPdf'
import { default as ExcelIcon } from '@mui/icons-material/TableChart'
import { default as RefreshIcon } from '@mui/icons-material/Refresh'
import { default as GenerateIcon } from '@mui/icons-material/PlayArrow'
import { default as PaymentSummaryIcon } from '@mui/icons-material/AccountBalanceWallet'
import PageHeader from '@/components/common/PageHeader'
import { printColors } from '@/styles/printTokens'
import { formatCurrency, formatDate, formatDateTime } from '@/utils/formatters'
import { escapeHtml } from '@/utils/security'
import { printReport } from '@/utils/printReport'
import { exportReportExcel } from '@/utils/exportReport'
import { PAGINATION, TABLE_STYLES } from '@/constants/tableStyles'
import api from '@/services/api'

interface CustomerPaymentSummary {
  customerId: string
  customerName: string
  customerPhone: string
  totalPayments: number
  paymentCount: number
  lastPaymentDate: string
  firstPaymentDate: string
  lastOrderDate: string
  invoicesPaid: number
  averagePaymentAmount: number
  paymentStatus: string
  totalInvoiced: number
  totalPaid: number
  orderCount: number
}

const CustomerPaymentSummary: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const [loading, setLoading] = useState(false)
  const [reportData, setReportData] = useState<CustomerPaymentSummary[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<string>('')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [paymentStatus, setPaymentStatus] = useState<string>('all')

  // Options
  const [showOnlyOwing, setShowOnlyOwing] = useState<boolean>(false)

  // Display options
  const [selectedColumns, setSelectedColumns] = useState<string[]>([
    'customerName', 'lastOrderDate', 'lastPaymentDate', 'totalInvoiced', 'totalPaid', 'balance'
  ])
  const [sortBy1, setSortBy1] = useState<string>('customerName')
  const [reportTitle, setReportTitle] = useState<string>('Customer Payment Summary')

  // Pagination
  const [page, setPage] = useState<number>(0)
  const [rowsPerPage, setRowsPerPage] = useState<number>(PAGINATION.defaultPageSize)

  useEffect(() => {
    // Load customers
    api.get('/customers')
      .then(res => {
        if (res.data?.data) {
          setCustomers(res.data.data)
        }
      })
      .catch(() => {})
  }, [])

  // Reset to first page when Show Only Owing changes
  useEffect(() => {
    setPage(0)
  }, [showOnlyOwing])

  const handleGenerateReport = async () => {
    setLoading(true)
    setPage(0) // Reset to first page when generating new report

    try {
      // Build query parameters
      const params = new URLSearchParams()

      if (dateFrom) params.append('dateFrom', dateFrom)
      if (dateTo) params.append('dateTo', dateTo)
      if (selectedCustomer) params.append('customerId', selectedCustomer)
      if (paymentStatus && paymentStatus !== 'all') params.append('paymentStatus', paymentStatus)

      // Call the backend API
      const response = await api.get(`/sales/analytics/customer-payment-summary?${params.toString()}`)

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
    setSelectedCustomer('')
    setDateFrom('')
    setDateTo('')
    setPaymentStatus('all')

    // Clear options
    setShowOnlyOwing(false)

    // Clear report data
    setReportData([])

    // Reset display options to defaults
    setSelectedColumns(['customerName', 'lastOrderDate', 'lastPaymentDate', 'totalInvoiced', 'totalPaid', 'balance'])
    setSortBy1('customerName')
    setReportTitle('Customer Payment Summary')

    // Reset pagination
    setPage(0)
    setRowsPerPage(25)
  }

  const handleExportExcel = async () => {
    try {
      const date = new Date().toISOString().split('T')[0]
      await exportReportExcel(
        '/sales/analytics/customer-payment-summary/export',
        { dateFrom, dateTo, customerId: selectedCustomer, paymentStatus },
        `customer-payment-summary-${date}.xlsx`,
      )
    } catch (err) {
      console.error('Export failed:', err)
    }
  }

  const handleExportPDF = () => {
    if (sortedData.length === 0) return

    const columnHeaders: { [key: string]: string } = {
      customerName: 'Customer',
      lastOrderDate: 'Last Order',
      lastPaymentDate: 'Last Payment',
      totalInvoiced: 'Sales Total',
      totalPaid: 'Paid Total',
      balance: 'Balance'
    }

    let tableRows = ''

    sortedData.forEach(row => {
      tableRows += '<tr>'
      selectedColumns.forEach(col => {
        if (col === 'balance') {
          const balance = row.totalInvoiced - row.totalPaid
          tableRows += `<td style="text-align: right;">${formatCurrency(balance)}</td>`
        } else {
          const value = (row as any)[col]
          let displayValue = value
          if (col === 'lastPaymentDate' || col === 'lastOrderDate') {
            displayValue = value ? formatDate(value) : '-'
          } else if (typeof value === 'number') {
            displayValue = formatCurrency(value)
          }
          const align = (typeof value === 'number' || col === 'balance') ? 'text-align: right;' : ''
          tableRows += `<td style="${align}">${escapeHtml(displayValue)}</td>`
        }
      })
      tableRows += '</tr>'
    })

    // Add totals
    if (totals) {
      tableRows += `<tr style="background-color: ${printColors.successRow}; font-weight: bold; border-top: 3px solid ${printColors.border};">`
      selectedColumns.forEach((col, idx) => {
        if (idx === 0) {
          tableRows += '<td style="font-weight: 800;">GRAND TOTAL</td>'
        } else if (col === 'balance') {
          const balance = totals.totalInvoiced - totals.totalPaid
          tableRows += `<td style="text-align: right; font-weight: 800;">${formatCurrency(balance)}</td>`
        } else if (col === 'totalInvoiced' || col === 'totalPaid') {
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
        totalInvoiced: acc.totalInvoiced + item.totalInvoiced,
        totalPaid: acc.totalPaid + item.totalPaid,
        totalPayments: acc.totalPayments + item.totalPayments,
        paymentCount: acc.paymentCount + item.paymentCount,
        invoicesPaid: acc.invoicesPaid + item.invoicesPaid,
        averagePaymentAmount: 0, // Will calculate after
      }),
      {
        totalInvoiced: 0,
        totalPaid: 0,
        totalPayments: 0,
        paymentCount: 0,
        invoicesPaid: 0,
        averagePaymentAmount: 0,
      }
    )

    // Calculate average of averages
    totals.averagePaymentAmount = totals.paymentCount > 0
      ? totals.totalPayments / totals.paymentCount
      : 0

    return totals
  }

  const totals = calculateTotals()

  // Sort and filter the report data
  const getSortedData = () => {
    if (reportData.length === 0) return []

    let filtered = [...reportData]

    // Apply "Show Only Owing" filter - show customers who owe money (not fully paid)
    if (showOnlyOwing) {
      filtered = filtered.filter(customer =>
        customer.paymentStatus !== 'paid'
      )
    }

    const compareValues = (a: any, b: any, field: string) => {
      // Special handling for balance (calculated field)
      if (field === 'balance') {
        const aBalance = a.totalInvoiced - a.totalPaid
        const bBalance = b.totalInvoiced - b.totalPaid
        return bBalance - aBalance // Descending (higher balance first)
      }

      const aVal = a[field]
      const bVal = b[field]

      // Handle null/undefined
      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1

      // Date comparison - descending (newer to older)
      if (field === 'lastPaymentDate' || field === 'lastOrderDate') {
        return new Date(bVal).getTime() - new Date(aVal).getTime()
      }

      // String comparison (case-insensitive) - ascending for text
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.toLowerCase().localeCompare(bVal.toLowerCase())
      }

      // Numeric comparison - descending (higher to lower)
      return bVal - aVal
    }

    filtered.sort((a, b) => {
      if (sortBy1 !== 'none') {
        const result1 = compareValues(a, b, sortBy1)
        if (result1 !== 0) return result1
      }
      return 0
    })

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

  return (
    <>
      <PageHeader
        variant="report"
        title={reportTitle}
        subtitle={
          reportData.length > 0
            ? `Payment summary for ${reportData.length} customers`
            : 'Analyze customer payment history and patterns'
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
                  Payment Date
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
                        const allColumns = ['customerName', 'lastOrderDate', 'lastPaymentDate', 'totalInvoiced', 'totalPaid', 'balance']
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
                    <MenuItem value="customerName">Customer</MenuItem>
                    <MenuItem value="lastOrderDate">Last Order</MenuItem>
                    <MenuItem value="lastPaymentDate">Last Payment</MenuItem>
                    <MenuItem value="totalInvoiced">Sales Total</MenuItem>
                    <MenuItem value="totalPaid">Paid Total</MenuItem>
                    <MenuItem value="balance">Balance</MenuItem>
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
                    <MenuItem value="customerName">Customer</MenuItem>
                    <MenuItem value="lastOrderDate">Last Order</MenuItem>
                    <MenuItem value="lastPaymentDate">Last Payment</MenuItem>
                    <MenuItem value="totalInvoiced">Sales Total</MenuItem>
                    <MenuItem value="totalPaid">Paid Total</MenuItem>
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
                      <PaymentSummaryIcon sx={{ fontSize: 80, color: 'text.disabled', mb: 2 }} />
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
                        Configure the filters on the left and click "Generate Report" to view customer payment summary.
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
                  Report Preview ({reportData.length} customers)
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
                      {selectedColumns.includes('customerName') && <TableCell align="center">Customer</TableCell>}
                      {selectedColumns.includes('lastOrderDate') && <TableCell align="center">Last Order</TableCell>}
                      {selectedColumns.includes('lastPaymentDate') && <TableCell align="center">Last Payment</TableCell>}
                      {selectedColumns.includes('totalInvoiced') && <TableCell align="center">Sales Total</TableCell>}
                      {selectedColumns.includes('totalPaid') && <TableCell align="center">Paid Total</TableCell>}
                      {selectedColumns.includes('balance') && <TableCell align="center">Balance</TableCell>}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginatedData.map((row, idx) => (
                      <TableRow
                        key={`${row.customerId}-${idx}`}
                        hover
                        sx={{
                          '&:hover': { backgroundColor: 'action.hover' },
                          transition: 'background-color 0.2s ease',
                          height: TABLE_STYLES.row.height
                        }}
                      >
                        {selectedColumns.includes('customerName') && (
                          <TableCell sx={{ fontSize: '0.8rem' }}>
                            {row.customerName}
                          </TableCell>
                        )}
                        {selectedColumns.includes('lastOrderDate') && (
                          <TableCell sx={{ fontSize: '0.8rem' }}>
                            {row.lastOrderDate ? formatDate(row.lastOrderDate) : '-'}
                          </TableCell>
                        )}
                        {selectedColumns.includes('lastPaymentDate') && (
                          <TableCell sx={{ fontSize: '0.8rem' }}>
                            {row.lastPaymentDate ? formatDate(row.lastPaymentDate) : '-'}
                          </TableCell>
                        )}
                        {selectedColumns.includes('totalInvoiced') && (
                          <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                            {formatCurrency(row.totalInvoiced)}
                          </TableCell>
                        )}
                        {selectedColumns.includes('totalPaid') && (
                          <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                            {formatCurrency(row.totalPaid)}
                          </TableCell>
                        )}
                        {selectedColumns.includes('balance') && (
                          <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 600, color: (row.totalInvoiced - row.totalPaid) > 0 ? 'error.main' : 'success.main' }}>
                            {formatCurrency(row.totalInvoiced - row.totalPaid)}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
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
                        {selectedColumns.includes('customerName') && (
                          <TableCell sx={{ fontWeight: 800 }}>
                            GRAND TOTAL
                          </TableCell>
                        )}
                        {selectedColumns.includes('lastOrderDate') && <TableCell />}
                        {selectedColumns.includes('lastPaymentDate') && <TableCell />}
                        {selectedColumns.includes('totalInvoiced') && (
                          <TableCell align="right" sx={{ fontWeight: 800 }}>
                            {formatCurrency(totals.totalInvoiced)}
                          </TableCell>
                        )}
                        {selectedColumns.includes('totalPaid') && (
                          <TableCell align="right" sx={{ fontWeight: 800 }}>
                            {formatCurrency(totals.totalPaid)}
                          </TableCell>
                        )}
                        {selectedColumns.includes('balance') && (
                          <TableCell align="right" sx={{ fontWeight: 800 }}>
                            {formatCurrency(totals.totalInvoiced - totals.totalPaid)}
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
                    rowsPerPageOptions={PAGINATION.options}
                  />
                </Box>
              )}
            </Paper>
          )}
        </Grid>
      </Grid>
    </>
  );
}

export default CustomerPaymentSummary
