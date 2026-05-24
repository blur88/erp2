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
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import { default as PdfIcon } from '@mui/icons-material/PictureAsPdf'
import { default as ExcelIcon } from '@mui/icons-material/TableChart'
import { default as RefreshIcon } from '@mui/icons-material/Refresh'
import { default as GenerateIcon } from '@mui/icons-material/PlayArrow'
import { default as PaymentIcon } from '@mui/icons-material/MonetizationOn'
import { AppButton } from '@/components/common/AppButton'
import PageHeader from '@/components/common/PageHeader'
import { printColors } from '@/styles/printTokens'
import { PRINT_STYLES } from '@/styles/printStyles'
import { formatCurrency, formatDate, formatDateTime } from '@/utils/formatters'
import { escapeHtml } from '@/utils/security'
import { printReport } from '@/utils/printReport'
import { exportReportExcel } from '@/utils/exportReport'
import { TABLE_STYLES } from '@/constants/tableStyles'
import api from '@/services/api'

interface VendorPaymentDetail {
  paymentNumber: string
  paymentDate: string
  supplierName: string
  orderNumber: string
  orderDate: string | null
  grnNumber: string | null
  paymentAmount: number
  paymentMethod: string
  referenceNumber: string | null
  status: string
  notes: string
}

const VendorPaymentDetailsReport: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const [loading, setLoading] = useState(false)
  const [reportData, setReportData] = useState<VendorPaymentDetail[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [selectedSupplier, setSelectedSupplier] = useState<string>('')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')

  // Display options
  const [selectedColumns, setSelectedColumns] = useState<string[]>([
    'supplierName', 'paymentDate', 'orderNumber', 'paymentAmount'
  ])
  const [groupBy, setGroupBy] = useState<string>('none')
  const [sortBy1, setSortBy1] = useState<string>('supplierName')
  const [reportTitle, setReportTitle] = useState<string>('Vendor Payment Details Report')

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

  const handleGenerateReport = async () => {
    setLoading(true)
    setPage(0)

    try {
      const params = new URLSearchParams()

      if (dateFrom) params.append('dateFrom', dateFrom)
      if (dateTo) params.append('dateTo', dateTo)
      if (selectedSupplier) params.append('supplierId', selectedSupplier)

      const response = await api.get(`/purchasing/analytics/vendor-payment-details?${params.toString()}`)

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
    setReportData([])
    setSelectedColumns(['supplierName', 'paymentDate', 'orderNumber', 'paymentAmount'])
    setGroupBy('none')
    setSortBy1('supplierName')
    setReportTitle('Vendor Payment Details Report')
    setPage(0)
    setRowsPerPage(25)
  }

  const handleExportExcel = async () => {
    try {
      const date = new Date().toISOString().split('T')[0]
      await exportReportExcel(
        '/purchasing/analytics/vendor-payment-details/export',
        { dateFrom, dateTo, supplierId: selectedSupplier },
        `vendor-payment-details-${date}.xlsx`,
      )
    } catch (err) {
      console.error('Export failed:', err)
    }
  }

  const handleExportPDF = () => {
    if (sortedData.length === 0) return

    const columnHeaders: { [key: string]: string } = {
      supplierName: 'Vendor',
      paymentDate: 'Payment Date',
      orderNumber: 'Order No',
      paymentAmount: 'Amount'
    }

    let tableRows = ''
    let prevGroupKey: any = null

    const getPdfGroupKey = (r: any) => {
      return r[groupBy]
    }

    const getPdfGroupLabel = (r: any) => {
      if (groupBy === 'supplierName') {
        return `Vendor: ${escapeHtml(r.supplierName)}`
      } else if (groupBy === 'paymentDate') {
        return `Payment Date: ${r.paymentDate ? escapeHtml(formatDate(r.paymentDate)) : 'N/A'}`
      } else if (groupBy === 'orderNumber') {
        return `Order No: ${escapeHtml(r.orderNumber || 'N/A')}`
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
        if (col === 'paymentDate') {
          displayValue = value ? formatDate(value) : '-'
        } else if (typeof value === 'number') {
          displayValue = formatCurrency(value)
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
          paymentAmount: groupData.reduce((sum, r) => sum + r.paymentAmount, 0),
        }

        tableRows += `<tr style="background-color: ${printColors.infoRow}; font-weight: bold; border-top: 2px solid ${printColors.tableHeaderBg};">`
        selectedColumns.forEach((col, colIdx) => {
          if (colIdx === 0) {
            tableRows += '<td style="font-weight: bold;">Subtotal</td>'
          } else if (col === 'paymentAmount') {
            const value = (subtotal as any)[col]
            tableRows += `<td style="text-align: right; font-weight: bold;">${typeof value === 'number' ? formatCurrency(value) : ''}</td>`
          } else {
            tableRows += '<td></td>'
          }
        })
        tableRows += '</tr>'
        tableRows += `<tr style="height: 20px;"><td colspan="${selectedColumns.length}" style="border: none;"></td></tr>`
      }
    })

    if (totals) {
      tableRows += `<tr style="background-color: ${printColors.successRow}; font-weight: bold; border-top: 3px solid ${printColors.border};">`
      selectedColumns.forEach((col, idx) => {
        if (idx === 0) {
          tableRows += '<td style="font-weight: 800;">GRAND TOTAL</td>'
        } else if (col === 'paymentAmount') {
          const value = (totals as any)[col]
          tableRows += `<td style="text-align: right; font-weight: 800;">${typeof value === 'number' ? formatCurrency(value) : ''}</td>`
        } else {
          const align = 'text-align: right;'
          tableRows += `<td style="${align}"></td>`
        }
      })
      tableRows += '</tr>'
    }

    const filterText = []
    if (dateFrom && dateTo) {
      filterText.push(`<p><strong>Payment Date Range:</strong> ${escapeHtml(formatDate(dateFrom))} - ${escapeHtml(formatDate(dateTo))}</p>`)
    } else if (dateFrom) {
      filterText.push(`<p><strong>Payment Date From:</strong> ${escapeHtml(formatDate(dateFrom))}</p>`)
    } else if (dateTo) {
      filterText.push(`<p><strong>Payment Date To:</strong> ${escapeHtml(formatDate(dateTo))}</p>`)
    }
    const dateRangeText = filterText.join('')

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${escapeHtml(reportTitle)}</title>
          <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=Roboto:400,500,700&display=swap" />
          <style>${PRINT_STYLES}</style>
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
        </body>
      </html>
    `

    printReport(html, reportTitle)
  }

  const calculateTotals = () => {
    if (reportData.length === 0) return null

    const totals = reportData.reduce(
      (acc, item) => ({
        paymentAmount: acc.paymentAmount + item.paymentAmount,
      }),
      {
        paymentAmount: 0,
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

      if (field === 'paymentDate' || field === 'orderDate') {
        return new Date(aVal).getTime() - new Date(bVal).getTime()
      }

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
    <>
      <PageHeader
        variant="report"
        title={reportTitle}
        subtitle={
          reportData.length > 0
            ? `Individual vendor payment transactions for ${reportData.length} payments`
            : 'View detailed vendor payment transaction records'
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
                      input: { sx: { fontSize: '0.75rem' } }
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
                      input: { sx: { fontSize: '0.75rem' } }
                    }}
                    size="small"
                    fullWidth
                  />

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
                          const allColumns = ['supplierName', 'paymentDate', 'orderNumber', 'paymentAmount']
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
                      <MenuItem value="supplierName">Vendor</MenuItem>
                      <MenuItem value="paymentDate">Payment Date</MenuItem>
                      <MenuItem value="orderNumber">Order No</MenuItem>
                      <MenuItem value="paymentAmount">Amount</MenuItem>
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
                      <MenuItem value="paymentDate">Payment Date</MenuItem>
                      <MenuItem value="orderNumber">Order No</MenuItem>
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
                      {selectedColumns.includes('supplierName') && <MenuItem value="supplierName">Vendor</MenuItem>}
                      {selectedColumns.includes('paymentDate') && <MenuItem value="paymentDate">Payment Date</MenuItem>}
                      {selectedColumns.includes('orderNumber') && <MenuItem value="orderNumber">Order No</MenuItem>}
                      {selectedColumns.includes('paymentAmount') && <MenuItem value="paymentAmount">Amount</MenuItem>}
                    </Select>
                  </FormControl>

                  <TextField
                    label="Report Title"
                    value={reportTitle}
                    onChange={(e) => setReportTitle(e.target.value)}
                    slotProps={{
                      inputLabel: { sx: { fontSize: '0.75rem' } },
                      input: { sx: { fontSize: '0.75rem' } }
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
                      <PaymentIcon sx={{ fontSize: 80, color: 'text.disabled', mb: 2 }} />
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
                        Configure the filters on the left and click "Generate Report" to view vendor payment transaction details.
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
                  Report Preview ({reportData.length} payments)
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
                        {selectedColumns.includes('supplierName') && <TableCell align="center">Vendor</TableCell>}
                        {selectedColumns.includes('paymentDate') && <TableCell align="center">Payment Date</TableCell>}
                        {selectedColumns.includes('orderNumber') && <TableCell align="center">Order No</TableCell>}
                        {selectedColumns.includes('paymentAmount') && <TableCell align="center">Amount</TableCell>}
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
                          } else if (field === 'paymentDate') {
                            return `Payment Date: ${r.paymentDate ? formatDate(r.paymentDate) : 'N/A'}`
                          } else if (field === 'orderNumber') {
                            return `Order No: ${r.orderNumber || 'N/A'}`
                          }
                          return r[field]
                        }

                        const calculateGroupSubtotals = () => {
                          if (groupBy === 'none') return null

                          const currentGroupKey = getGroupKey(row)
                          const groupData = paginatedData.filter(r => getGroupKey(r) === currentGroupKey)

                          return {
                            paymentAmount: groupData.reduce((sum, r) => sum + r.paymentAmount, 0),
                          }
                        }

                        const groupSubtotals = showGroupFooter ? calculateGroupSubtotals() : null

                        return (
                          <React.Fragment key={`${row.supplierName}-${idx}`}>
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
                              {selectedColumns.includes('supplierName') && (
                                <TableCell sx={{ fontSize: '0.8rem' }}>
                                  {row.supplierName}
                                </TableCell>
                              )}
                              {selectedColumns.includes('paymentDate') && (
                                <TableCell sx={{ fontSize: '0.8rem' }}>
                                  {row.paymentDate ? formatDate(row.paymentDate) : '-'}
                                </TableCell>
                              )}
                              {selectedColumns.includes('orderNumber') && (
                                <TableCell sx={{ fontSize: '0.8rem' }}>
                                  {row.orderNumber || '-'}
                                </TableCell>
                              )}
                              {selectedColumns.includes('paymentAmount') && (
                                <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                                  {formatCurrency(row.paymentAmount)}
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
                                  {selectedColumns.includes('supplierName') && (
                                    <TableCell sx={{ fontWeight: 700 }}>
                                      Subtotal
                                    </TableCell>
                                  )}
                                  {selectedColumns.includes('paymentDate') && <TableCell />}
                                  {selectedColumns.includes('orderNumber') && <TableCell />}
                                  {selectedColumns.includes('paymentAmount') && (
                                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                                      {formatCurrency(groupSubtotals.paymentAmount)}
                                    </TableCell>
                                  )}
                                </TableRow>
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
                          {selectedColumns.includes('supplierName') && (
                            <TableCell sx={{ fontWeight: 800 }}>
                              GRAND TOTAL
                            </TableCell>
                          )}
                          {selectedColumns.includes('paymentDate') && <TableCell />}
                          {selectedColumns.includes('orderNumber') && <TableCell />}
                          {selectedColumns.includes('paymentAmount') && (
                            <TableCell align="right" sx={{ fontWeight: 800 }}>
                              {formatCurrency(totals.paymentAmount)}
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

export default VendorPaymentDetailsReport
