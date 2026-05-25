import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
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
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import { default as PdfIcon } from '@mui/icons-material/PictureAsPdf'
import { default as ExcelIcon } from '@mui/icons-material/TableChart'
import { default as RefreshIcon } from '@mui/icons-material/Refresh'
import { default as GenerateIcon } from '@mui/icons-material/PlayArrow'
import { default as PurchaseOrderIcon } from '@mui/icons-material/Summarize'
import { AppButton } from '@/components/common/AppButton'
import PageHeader from '@/components/common/PageHeader'
import { printColors } from '@/styles/printTokens'
import { formatCurrency, formatDate, formatDateTime } from '@/utils/formatters'
import { escapeHtml } from '@/utils/security'
import { printReport } from '@/utils/printReport'
import { exportReportExcel } from '@/utils/exportReport'
import { TABLE_STYLES } from '@/constants/tableStyles'
import api from '@/services/api'

interface PurchaseOrderSummaryReport {
  orderNumber: string
  orderDate: string
  supplierName: string
  status: string
  paymentStatus: string
  totalAmount: number
  paidAmount: number
  balance: number
  shippingAmount: number
}

const PurchaseOrderSummary: React.FC = () => {
  const navigate = useNavigate()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const [loading, setLoading] = useState(false)
  const [reportData, setReportData] = useState<PurchaseOrderSummaryReport[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [selectedSupplier, setSelectedSupplier] = useState<string>('')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const [status, setStatus] = useState<string>('all')
  const [paymentStatus, setPaymentStatus] = useState<string>('all')

  // Display options
  const [selectedColumns, setSelectedColumns] = useState<string[]>([
    'orderNumber', 'status', 'paymentStatus', 'supplierName', 'orderDate', 'totalAmount', 'paidAmount', 'balance', 'shippingAmount'
  ])
  const [groupBy, setGroupBy] = useState<string>('none')
  const [sortBy1, setSortBy1] = useState<string>('orderNumber')
  const [reportTitle, setReportTitle] = useState<string>('Purchase Order Summary Report')

  // Pagination
  const [page, setPage] = useState<number>(0)
  const [rowsPerPage, setRowsPerPage] = useState<number>(25)

  useEffect(() => {
    // Load suppliers
    api.get('/purchasing/suppliers')
      .then(res => {
        if (res.data?.data) {
          setSuppliers(res.data.data)
        }
      })
      .catch(() => {})
  }, [])

  // Reset to first page when filters or display options change
  useEffect(() => {
    setPage(0)
  }, [groupBy, sortBy1, status, paymentStatus, selectedSupplier])

  // Reset sortBy1 if the selected column is removed from selectedColumns
  useEffect(() => {
    if (sortBy1 !== 'none' && !selectedColumns.includes(sortBy1)) {
      // Set to first available column, or orderNumber as fallback
      setSortBy1(selectedColumns.length > 0 ? selectedColumns[0] : 'orderNumber')
    }
  }, [selectedColumns, sortBy1])

  const handleGenerateReport = async () => {
    setLoading(true)
    setPage(0) // Reset to first page when generating new report

    try {
      // Build query parameters
      const params = new URLSearchParams()

      if (dateFrom) params.append('dateFrom', dateFrom)
      if (dateTo) params.append('dateTo', dateTo)
      if (selectedSupplier) params.append('supplierId', selectedSupplier)
      if (status && status !== 'all') params.append('status', status)
      if (paymentStatus && paymentStatus !== 'all') params.append('paymentStatus', paymentStatus)

      // Call the backend API
      const response = await api.get(`/purchasing/analytics/purchase-order-summary?${params.toString()}`)

      setReportData(response.data?.data || [])
    } catch (err) {
      console.error('Failed to generate report:', err)
      setReportData([])
    } finally {
      setLoading(false)
    }
  }

  const handleClearFilters = () => {
    setSelectedSupplier('')
    setDateFrom('')
    setDateTo('')
    setStatus('all')
    setPaymentStatus('all')
    setReportData([])
    setSelectedColumns(['orderNumber', 'status', 'paymentStatus', 'supplierName', 'orderDate', 'totalAmount', 'paidAmount', 'balance', 'shippingAmount'])
    setGroupBy('none')
    setSortBy1('orderNumber')
    setReportTitle('Purchase Order Summary Report')
    setPage(0)
    setRowsPerPage(25)
  }

  const handleExportExcel = async () => {
    try {
      const date = new Date().toISOString().split('T')[0]
      await exportReportExcel(
        '/purchasing/analytics/purchase-order-summary/export',
        { dateFrom, dateTo, supplierId: selectedSupplier, status, paymentStatus },
        `purchase-order-summary-${date}.xlsx`,
      )
    } catch (err) {
      console.error('Export failed:', err)
    }
  }

  const handleExportPDF = () => {
    if (sortedData.length === 0) return

    const columnHeaders: { [key: string]: string } = {
      orderNumber: 'PO No',
      status: 'Inventory Status',
      paymentStatus: 'Payment Status',
      supplierName: 'Vendor',
      orderDate: 'PO Date',
      totalAmount: 'Order Total',
      paidAmount: 'Amount Paid',
      balance: 'Balance',
      shippingAmount: 'Freight'
    }

    let tableRows = ''
    let prevGroupKey: any = null

    const getPdfGroupKey = (r: any) => {
      return r[groupBy]
    }

    const getPdfGroupLabel = (r: any) => {
      if (groupBy === 'supplierName') {
        return `Vendor: ${escapeHtml(r.supplierName)}`
      } else if (groupBy === 'status') {
        return `Inventory Status: ${escapeHtml(r.status.charAt(0).toUpperCase() + r.status.slice(1))}`
      } else if (groupBy === 'paymentStatus') {
        return `Payment Status: ${escapeHtml(r.paymentStatus.charAt(0).toUpperCase() + r.paymentStatus.slice(1))}`
      }
      return escapeHtml(r[groupBy])
    }

    sortedData.forEach((row, idx) => {
      const currentGroupKey = groupBy !== 'none' ? getPdfGroupKey(row) : null

      if (groupBy !== 'none' && currentGroupKey !== prevGroupKey) {
        const groupLabel = getPdfGroupLabel(row)
        tableRows += `<tr style="background-color: ${printColors.groupRow}; font-weight: bold;"><td colspan="${selectedColumns.length}">${groupLabel}</td></tr>`
        prevGroupKey = currentGroupKey
      }

      tableRows += '<tr>'
      selectedColumns.forEach(col => {
        const value = (row as any)[col]
        let displayValue = value
        if (col === 'orderDate') {
          displayValue = value ? formatDate(value) : '-'
        } else if (typeof value === 'number') {
          displayValue = formatCurrency(value)
        } else if (col === 'status' || col === 'paymentStatus') {
          displayValue = value ? value.charAt(0).toUpperCase() + value.slice(1) : ''
        }
        const align = (typeof value === 'number') ? 'text-align: right;' : ''
        tableRows += `<td style="${align}">${escapeHtml(displayValue)}</td>`
      })
      tableRows += '</tr>'

      const nextRow = idx < sortedData.length - 1 ? sortedData[idx + 1] : null
      const nextGroupKey = nextRow && groupBy !== 'none' ? getPdfGroupKey(nextRow) : null

      if (groupBy !== 'none' && (!nextRow || currentGroupKey !== nextGroupKey)) {
        const groupData = sortedData.filter(r => getPdfGroupKey(r) === currentGroupKey)

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

    if (totals) {
      tableRows += `<tr style="background-color: ${printColors.successRow}; font-weight: bold; border-top: 3px solid ${printColors.border};">`
      selectedColumns.forEach((col, idx) => {
        if (idx === 0) {
          tableRows += '<td style="font-weight: 800;">GRAND TOTAL</td>'
        } else if (col === 'totalAmount' || col === 'paidAmount' || col === 'balance') {
          const value = (totals as any)[col]
          tableRows += `<td style="text-align: right; font-weight: 800;">${typeof value === 'number' ? formatCurrency(value) : ''}</td>`
        } else {
          const align = 'text-align: right;'
          tableRows += `<td style="${align}"></td>`
        }
      })
      tableRows += '</tr>'
    }

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
        shippingAmount: acc.shippingAmount + item.shippingAmount,
      }),
      {
        totalAmount: 0,
        paidAmount: 0,
        balance: 0,
        shippingAmount: 0,
      }
    )

    return totals
  }

  const totals = calculateTotals()

  const getSortedData = () => {
    if (reportData.length === 0) return []

    let filtered = [...reportData]

    const compareValues = (a: any, b: any, field: string) => {
      const aVal = a[field]
      const bVal = b[field]

      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1

      if (field === 'orderDate') {
        return new Date(aVal).getTime() - new Date(bVal).getTime()
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.toLowerCase().localeCompare(bVal.toLowerCase())
      }

      return bVal - aVal
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

  const getStatusColor = (status: string) => {
    return status === 'received' ? 'success' : 'warning'
  }

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'success'
      case 'partial':
        return 'warning'
      default:
        return 'error'
    }
  }

  return (
    <>
      <PageHeader
        variant="report"
        title={reportTitle}
        subtitle={
          reportData.length > 0
            ? `${reportData.length} purchase order items`
            : 'View detailed purchase order line items'
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
                  <InputLabel>Vendor</InputLabel>
                  <Select
                    value={selectedSupplier}
                    label="Vendor"
                    onChange={(e) => setSelectedSupplier(e.target.value)}
                    MenuProps={{ slotProps: { paper: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } } }}
                  >
                    <MenuItem value="">All Vendors</MenuItem>
                    {suppliers.map((supplier) => (
                      <MenuItem key={supplier.id} value={supplier.id}>
                        {supplier.companyName}
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
                  PO Date
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
                  <InputLabel>PO Inventory Status</InputLabel>
                  <Select
                    value={status}
                    label="PO Inventory Status"
                    onChange={(e) => setStatus(e.target.value)}
                    MenuProps={{ slotProps: { paper: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } } }}
                  >
                    <MenuItem value="all">All</MenuItem>
                    <MenuItem value="received">Received</MenuItem>
                    <MenuItem value="pending">Pending</MenuItem>
                  </Select>
                </FormControl>

                <FormControl fullWidth size="small" sx={{ '& .MuiInputLabel-root': { fontSize: '0.75rem' }, '& .MuiSelect-select': { fontSize: '0.75rem' } }}>
                  <InputLabel>PO Payment Status</InputLabel>
                  <Select
                    value={paymentStatus}
                    label="PO Payment Status"
                    onChange={(e) => setPaymentStatus(e.target.value)}
                    MenuProps={{ slotProps: { paper: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } } }}
                  >
                    <MenuItem value="all">All</MenuItem>
                    <MenuItem value="unpaid">Unpaid</MenuItem>
                    <MenuItem value="partial">Partial</MenuItem>
                    <MenuItem value="paid">Paid</MenuItem>
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

                      if (value.includes('all')) {
                        const allColumns = ['orderNumber', 'status', 'paymentStatus', 'supplierName', 'orderDate', 'totalAmount', 'paidAmount', 'balance', 'shippingAmount']
                        if (selectedColumns.length === allColumns.length) {
                          setSelectedColumns([])
                        } else {
                          setSelectedColumns(allColumns)
                        }
                      } else {
                        setSelectedColumns(value as string[])
                      }
                    }}
                    MenuProps={{ slotProps: { paper: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } } }}
                    renderValue={(selected) => `${selected.length} column${selected.length !== 1 ? 's' : ''} selected`}
                  >
                    <MenuItem value="all">All</MenuItem>
                    <MenuItem value="orderNumber">PO No</MenuItem>
                    <MenuItem value="status">Inventory Status</MenuItem>
                    <MenuItem value="paymentStatus">Payment Status</MenuItem>
                    <MenuItem value="supplierName">Vendor</MenuItem>
                    <MenuItem value="orderDate">PO Date</MenuItem>
                    <MenuItem value="totalAmount">Order Total</MenuItem>
                    <MenuItem value="paidAmount">Amount Paid</MenuItem>
                    <MenuItem value="balance">Balance</MenuItem>
                    <MenuItem value="shippingAmount">Freight</MenuItem>
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
                    <MenuItem value="supplierName">Vendor</MenuItem>
                    <MenuItem value="status">Inventory Status</MenuItem>
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
                    {selectedColumns.includes('orderNumber') && <MenuItem value="orderNumber">PO No</MenuItem>}
                    {selectedColumns.includes('status') && <MenuItem value="status">Inventory Status</MenuItem>}
                    {selectedColumns.includes('paymentStatus') && <MenuItem value="paymentStatus">Payment Status</MenuItem>}
                    {selectedColumns.includes('supplierName') && <MenuItem value="supplierName">Vendor</MenuItem>}
                    {selectedColumns.includes('orderDate') && <MenuItem value="orderDate">PO Date</MenuItem>}
                    {selectedColumns.includes('totalAmount') && <MenuItem value="totalAmount">Order Total</MenuItem>}
                    {selectedColumns.includes('paidAmount') && <MenuItem value="paidAmount">Amount Paid</MenuItem>}
                    {selectedColumns.includes('balance') && <MenuItem value="balance">Balance</MenuItem>}
                    {selectedColumns.includes('shippingAmount') && <MenuItem value="shippingAmount">Freight</MenuItem>}
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
                      <PurchaseOrderIcon sx={{ fontSize: 80, color: 'text.disabled', mb: 2 }} />
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
                        Configure the filters on the left and click "Generate Report" to view purchase order details.
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
                  Report Preview ({reportData.length} records)
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
                      {selectedColumns.includes('orderNumber') && <TableCell align="center">PO No</TableCell>}
                      {selectedColumns.includes('status') && <TableCell align="center">Inventory Status</TableCell>}
                      {selectedColumns.includes('paymentStatus') && <TableCell align="center">Payment Status</TableCell>}
                      {selectedColumns.includes('supplierName') && <TableCell align="center">Vendor</TableCell>}
                      {selectedColumns.includes('orderDate') && <TableCell align="center">PO Date</TableCell>}
                      {selectedColumns.includes('totalAmount') && <TableCell align="center">Order Total</TableCell>}
                      {selectedColumns.includes('paidAmount') && <TableCell align="center">Amount Paid</TableCell>}
                      {selectedColumns.includes('balance') && <TableCell align="center">Balance</TableCell>}
                      {selectedColumns.includes('shippingAmount') && <TableCell align="center">Freight</TableCell>}
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
                        if (field === 'supplierName') {
                          return `Vendor: ${r.supplierName}`
                        } else if (field === 'status') {
                          return `Inventory Status: ${r.status.charAt(0).toUpperCase() + r.status.slice(1)}`
                        } else if (field === 'paymentStatus') {
                          return `Payment Status: ${r.paymentStatus.charAt(0).toUpperCase() + r.paymentStatus.slice(1)}`
                        }
                        return r[field]
                      }

                      const calculateGroupSubtotals = () => {
                        if (groupBy === 'none') return null

                        const currentGroupKey = getGroupKey(row)
                        const groupData = paginatedData.filter(r => getGroupKey(r) === currentGroupKey)

                        return {
                          totalAmount: groupData.reduce((sum, r) => sum + r.totalAmount, 0),
                          paidAmount: groupData.reduce((sum, r) => sum + r.paidAmount, 0),
                          balance: groupData.reduce((sum, r) => sum + r.balance, 0),
                          shippingAmount: groupData.reduce((sum, r) => sum + r.shippingAmount, 0),
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
                        {selectedColumns.includes('orderNumber') && (
                          <TableCell sx={{ fontSize: '0.8rem' }}>
                            {row.orderNumber}
                          </TableCell>
                        )}
                        {selectedColumns.includes('status') && (
                          <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                            <Chip
                              label={row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                              color={getStatusColor(row.status) as any}
                              size="small"
                              sx={{ fontSize: '0.7rem', height: '20px' }}
                            />
                          </TableCell>
                        )}
                        {selectedColumns.includes('paymentStatus') && (
                          <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                            <Chip
                              label={row.paymentStatus.charAt(0).toUpperCase() + row.paymentStatus.slice(1)}
                              color={getPaymentStatusColor(row.paymentStatus) as any}
                              size="small"
                              sx={{ fontSize: '0.7rem', height: '20px' }}
                            />
                          </TableCell>
                        )}
                        {selectedColumns.includes('supplierName') && (
                          <TableCell sx={{ fontSize: '0.8rem' }}>
                            {row.supplierName}
                          </TableCell>
                        )}
                        {selectedColumns.includes('orderDate') && (
                          <TableCell sx={{ fontSize: '0.8rem' }}>
                            {row.orderDate ? formatDate(row.orderDate) : '-'}
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
                          <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                            {formatCurrency(row.balance)}
                          </TableCell>
                        )}
                        {selectedColumns.includes('shippingAmount') && (
                          <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                            {formatCurrency(row.shippingAmount)}
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
                                {selectedColumns.includes('status') && <TableCell />}
                                {selectedColumns.includes('paymentStatus') && <TableCell />}
                                {selectedColumns.includes('supplierName') && <TableCell />}
                                {selectedColumns.includes('orderDate') && <TableCell />}
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
                                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                                    {formatCurrency(groupSubtotals.balance)}
                                  </TableCell>
                                )}
                                {selectedColumns.includes('shippingAmount') && (
                                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                                    {formatCurrency(groupSubtotals.shippingAmount)}
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
                        {selectedColumns.includes('status') && <TableCell />}
                        {selectedColumns.includes('paymentStatus') && <TableCell />}
                        {selectedColumns.includes('supplierName') && <TableCell />}
                        {selectedColumns.includes('orderDate') && <TableCell />}
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
                        {selectedColumns.includes('shippingAmount') && (
                          <TableCell align="right" sx={{ fontWeight: 800 }}>
                            {formatCurrency(totals.shippingAmount)}
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
    </>
  );
}

export default PurchaseOrderSummary
