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
  AccountBalance as PaymentIcon,
} from '@mui/icons-material'
import { formatCurrency } from '@/utils/formatters'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'

interface CustomerPaymentSummary {
  customerId: string
  customerName: string
  customerPhone: string
  totalPayments: number
  paymentCount: number
  lastPaymentDate: string
  firstPaymentDate: string
  invoicesPaid: number
  averagePaymentAmount: number
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

  // Display options
  const [selectedColumns, setSelectedColumns] = useState<string[]>([
    'customerName', 'customerPhone', 'totalPayments', 'paymentCount', 'invoicesPaid', 'averagePaymentAmount', 'lastPaymentDate'
  ])
  const [sortBy1, setSortBy1] = useState<string>('totalPayments')
  const [reportTitle, setReportTitle] = useState<string>('Customer Payment Summary')

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
      if (paymentStatus && paymentStatus !== 'all') params.append('paymentStatus', paymentStatus)

      // Call the backend API
      const response = await fetch(`/api/sales/analytics/customer-payment-summary?${params.toString()}`)

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
    setPaymentStatus('all')

    // Clear report data
    setReportData([])

    // Reset display options to defaults
    setSelectedColumns(['customerName', 'customerPhone', 'totalPayments', 'paymentCount', 'invoicesPaid', 'averagePaymentAmount', 'lastPaymentDate'])
    setSortBy1('totalPayments')
    setReportTitle('Customer Payment Summary')

    // Reset pagination
    setPage(0)
    setRowsPerPage(25)
  }

  const handleExportExcel = () => {
    if (sortedData.length === 0) return

    // Column headers mapping
    const columnHeaders: { [key: string]: string } = {
      customerName: 'Customer Name',
      customerPhone: 'Phone',
      totalPayments: 'Total Payments',
      paymentCount: 'Payment Count',
      invoicesPaid: 'Invoices Paid',
      averagePaymentAmount: 'Avg Payment',
      lastPaymentDate: 'Last Payment Date',
      firstPaymentDate: 'First Payment Date'
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
        if (col === 'lastPaymentDate' || col === 'firstPaymentDate') {
          return `"${new Date(value).toLocaleDateString()}"`
        } else if (col === 'customerName' || col === 'customerPhone') {
          return `"${value || ''}"`
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
      customerName: 'Customer Name',
      customerPhone: 'Phone',
      totalPayments: 'Total Payments',
      paymentCount: 'Payment Count',
      invoicesPaid: 'Invoices Paid',
      averagePaymentAmount: 'Avg Payment',
      lastPaymentDate: 'Last Payment Date',
      firstPaymentDate: 'First Payment Date'
    }

    let tableRows = ''

    sortedData.forEach(row => {
      tableRows += '<tr>'
      selectedColumns.forEach(col => {
        const value = (row as any)[col]
        let displayValue = value
        if (col === 'lastPaymentDate' || col === 'firstPaymentDate') {
          displayValue = new Date(value).toLocaleDateString()
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
        totalPayments: acc.totalPayments + item.totalPayments,
        paymentCount: acc.paymentCount + item.paymentCount,
        invoicesPaid: acc.invoicesPaid + item.invoicesPaid,
        averagePaymentAmount: 0, // Will calculate after
      }),
      {
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
      if (field === 'lastPaymentDate' || field === 'firstPaymentDate') {
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
      if (sortBy1 !== 'none') {
        const result1 = compareValues(a, b, sortBy1)
        if (result1 !== 0) return result1
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
            <PaymentIcon sx={{
              fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize,
              color: TYPOGRAPHY_STYLES.pageHeader.icon.color
            }} />
            Customer Payment Summary
          </Typography>
          <Typography variant={TYPOGRAPHY_STYLES.pageSubtitle.variant} color={TYPOGRAPHY_STYLES.pageSubtitle.color}>
            {reportData.length > 0
              ? `Payment summary for ${reportData.length} customers`
              : 'Analyze customer payment history and patterns'}
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
                  Payment Date
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
                        const allColumns = ['customerName', 'customerPhone', 'totalPayments', 'paymentCount', 'invoicesPaid', 'averagePaymentAmount', 'lastPaymentDate', 'firstPaymentDate']
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
                    <MenuItem value="customerName">Customer Name</MenuItem>
                    <MenuItem value="customerPhone">Phone</MenuItem>
                    <MenuItem value="totalPayments">Total Payments</MenuItem>
                    <MenuItem value="paymentCount">Payment Count</MenuItem>
                    <MenuItem value="invoicesPaid">Invoices Paid</MenuItem>
                    <MenuItem value="averagePaymentAmount">Avg Payment</MenuItem>
                    <MenuItem value="lastPaymentDate">Last Payment Date</MenuItem>
                    <MenuItem value="firstPaymentDate">First Payment Date</MenuItem>
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
                    <MenuItem value="totalPayments">Total Payments</MenuItem>
                    <MenuItem value="paymentCount">Payment Count</MenuItem>
                    <MenuItem value="customerName">Customer Name</MenuItem>
                    <MenuItem value="invoicesPaid">Invoices Paid</MenuItem>
                    <MenuItem value="averagePaymentAmount">Avg Payment</MenuItem>
                    <MenuItem value="lastPaymentDate">Last Payment Date</MenuItem>
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
                      <PaymentIcon sx={{ fontSize: 80, color: 'text.disabled', mb: 2 }} />
                      <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
                        No Report Generated
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
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
                <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                  fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                  fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Report Preview ({reportData.length} customers)
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
                      {selectedColumns.includes('customerName') && <TableCell align="center">Customer Name</TableCell>}
                      {selectedColumns.includes('customerPhone') && <TableCell align="center">Phone</TableCell>}
                      {selectedColumns.includes('totalPayments') && <TableCell align="center">Total Payments</TableCell>}
                      {selectedColumns.includes('paymentCount') && <TableCell align="center">Payment Count</TableCell>}
                      {selectedColumns.includes('invoicesPaid') && <TableCell align="center">Invoices Paid</TableCell>}
                      {selectedColumns.includes('averagePaymentAmount') && <TableCell align="center">Avg Payment</TableCell>}
                      {selectedColumns.includes('lastPaymentDate') && <TableCell align="center">Last Payment</TableCell>}
                      {selectedColumns.includes('firstPaymentDate') && <TableCell align="center">First Payment</TableCell>}
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
                        {selectedColumns.includes('customerPhone') && (
                          <TableCell sx={{ fontSize: '0.8rem' }}>
                            {row.customerPhone}
                          </TableCell>
                        )}
                        {selectedColumns.includes('totalPayments') && (
                          <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                            {formatCurrency(row.totalPayments)}
                          </TableCell>
                        )}
                        {selectedColumns.includes('paymentCount') && (
                          <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                            <Chip
                              label={row.paymentCount}
                              size="small"
                              color="primary"
                              sx={{ fontSize: '0.7rem', height: '20px' }}
                            />
                          </TableCell>
                        )}
                        {selectedColumns.includes('invoicesPaid') && (
                          <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                            {row.invoicesPaid}
                          </TableCell>
                        )}
                        {selectedColumns.includes('averagePaymentAmount') && (
                          <TableCell align="right" sx={{ fontSize: '0.8rem' }}>
                            {formatCurrency(row.averagePaymentAmount)}
                          </TableCell>
                        )}
                        {selectedColumns.includes('lastPaymentDate') && (
                          <TableCell sx={{ fontSize: '0.8rem' }}>
                            {new Date(row.lastPaymentDate).toLocaleDateString()}
                          </TableCell>
                        )}
                        {selectedColumns.includes('firstPaymentDate') && (
                          <TableCell sx={{ fontSize: '0.8rem' }}>
                            {new Date(row.firstPaymentDate).toLocaleDateString()}
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
                        {selectedColumns.includes('customerName') && (
                          <TableCell sx={{ fontWeight: 700 }}>
                            TOTAL
                          </TableCell>
                        )}
                        {selectedColumns.includes('customerPhone') && <TableCell />}
                        {selectedColumns.includes('totalPayments') && (
                          <TableCell align="right">
                            {formatCurrency(totals.totalPayments)}
                          </TableCell>
                        )}
                        {selectedColumns.includes('paymentCount') && (
                          <TableCell align="center">
                            {totals.paymentCount}
                          </TableCell>
                        )}
                        {selectedColumns.includes('invoicesPaid') && (
                          <TableCell align="center">
                            {totals.invoicesPaid}
                          </TableCell>
                        )}
                        {selectedColumns.includes('averagePaymentAmount') && (
                          <TableCell align="right">
                            {formatCurrency(totals.averagePaymentAmount)}
                          </TableCell>
                        )}
                        {selectedColumns.includes('lastPaymentDate') && <TableCell />}
                        {selectedColumns.includes('firstPaymentDate') && <TableCell />}
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

export default CustomerPaymentSummary
