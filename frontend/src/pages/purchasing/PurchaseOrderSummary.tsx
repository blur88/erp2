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
  ShoppingCart as PurchaseOrderIcon,
} from '@mui/icons-material'
import { formatCurrency } from '@/utils/formatters'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'

interface PurchaseOrderSummaryReport {
  orderNumber: string
  orderDate: string
  supplierName: string
  productName: string
  categoryName: string
  quantity: number
  unitPrice: number
  subtotal: number
  status: string
  paymentStatus: string
  supplierPhone: string
  supplierEmail: string
}

const PurchaseOrderSummary: React.FC = () => {
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
    'orderNumber', 'orderDate', 'supplierName', 'productName', 'categoryName', 'quantity', 'unitPrice', 'subtotal', 'status', 'paymentStatus'
  ])
  const [groupBy, setGroupBy] = useState<string>('none')
  const [sortBy1, setSortBy1] = useState<string>('orderDate')
  const [reportTitle, setReportTitle] = useState<string>('Purchase Order Summary Report')

  // Pagination
  const [page, setPage] = useState<number>(0)
  const [rowsPerPage, setRowsPerPage] = useState<number>(25)

  useEffect(() => {
    // Load suppliers
    fetch('/api/purchasing/suppliers?limit=100')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.data) {
          setSuppliers(data.data)
        }
      })
      .catch(() => {})
  }, [])

  // Reset to first page when filters or display options change
  useEffect(() => {
    setPage(0)
  }, [groupBy, sortBy1, status, paymentStatus, selectedSupplier])

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
      const response = await fetch(`/api/purchasing/analytics/purchase-order-summary?${params.toString()}`)

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
    setSelectedSupplier('')
    setDateFrom('')
    setDateTo('')
    setStatus('all')
    setPaymentStatus('all')
    setReportData([])
    setSelectedColumns(['orderNumber', 'orderDate', 'supplierName', 'productName', 'categoryName', 'quantity', 'unitPrice', 'subtotal', 'status', 'paymentStatus'])
    setGroupBy('none')
    setSortBy1('orderDate')
    setReportTitle('Purchase Order Summary Report')
    setPage(0)
    setRowsPerPage(25)
  }

  const handleExportExcel = () => {
    if (sortedData.length === 0) return

    const columnHeaders: { [key: string]: string } = {
      orderNumber: 'PO Number',
      orderDate: 'PO Date',
      supplierName: 'Vendor',
      productName: 'Product',
      categoryName: 'Category',
      quantity: 'Quantity',
      unitPrice: 'Unit Price',
      subtotal: 'Subtotal',
      status: 'PO Inventory Status',
      paymentStatus: 'PO Payment Status'
    }

    let csv = reportTitle + '\n\n'
    const headers = selectedColumns.map(col => columnHeaders[col] || col)
    csv += headers.join(',') + '\n'

    let prevGroupKey: any = null

    const getExportGroupKey = (r: any) => {
      if (groupBy === 'supplierCategory') {
        return `${r.supplierName}|${r.categoryName}`
      }
      return r[groupBy]
    }

    const getExportGroupLabel = (r: any) => {
      if (groupBy === 'supplierCategory') {
        return `Vendor: ${r.supplierName} | Category: ${r.categoryName}`
      } else if (groupBy === 'supplierName') {
        return `Vendor: ${r.supplierName}`
      } else if (groupBy === 'categoryName') {
        return `Category: ${r.categoryName}`
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
        const value = (row as any)[col]
        if (col === 'orderDate') {
          return value ? `"${new Date(value).toLocaleDateString()}"` : '""'
        } else if (col === 'supplierName' || col === 'orderNumber' || col === 'status' || col === 'paymentStatus' || col === 'productName' || col === 'categoryName') {
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
          quantity: groupData.reduce((sum, r) => sum + r.quantity, 0),
          subtotal: groupData.reduce((sum, r) => sum + r.subtotal, 0),
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
      orderNumber: 'PO Number',
      orderDate: 'PO Date',
      supplierName: 'Vendor',
      productName: 'Product',
      categoryName: 'Category',
      quantity: 'Quantity',
      unitPrice: 'Unit Price',
      subtotal: 'Subtotal',
      status: 'PO Inventory Status',
      paymentStatus: 'PO Payment Status'
    }

    let tableRows = ''
    let prevGroupKey: any = null

    const getPdfGroupKey = (r: any) => {
      if (groupBy === 'supplierCategory') {
        return `${r.supplierName}|${r.categoryName}`
      }
      return r[groupBy]
    }

    const getPdfGroupLabel = (r: any) => {
      if (groupBy === 'supplierCategory') {
        return `Supplier: ${r.supplierName} | Category: ${r.categoryName}`
      } else if (groupBy === 'supplierName') {
        return `Supplier: ${r.supplierName}`
      } else if (groupBy === 'categoryName') {
        return `Category: ${r.categoryName}`
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
        const value = (row as any)[col]
        let displayValue = value
        if (col === 'orderDate') {
          displayValue = value ? new Date(value).toLocaleDateString() : '-'
        } else if (typeof value === 'number') {
          displayValue = formatCurrency(value)
        } else if (col === 'status' || col === 'paymentStatus') {
          displayValue = value ? value.charAt(0).toUpperCase() + value.slice(1) : ''
        }
        const align = (typeof value === 'number') ? 'text-align: right;' : ''
        tableRows += `<td style="${align}">${displayValue || ''}</td>`
      })
      tableRows += '</tr>'

      const nextRow = idx < sortedData.length - 1 ? sortedData[idx + 1] : null
      const nextGroupKey = nextRow && groupBy !== 'none' ? getPdfGroupKey(nextRow) : null

      if (groupBy !== 'none' && (!nextRow || currentGroupKey !== nextGroupKey)) {
        const groupData = sortedData.filter(r => getPdfGroupKey(r) === currentGroupKey)

        const subtotal = {
          quantity: groupData.reduce((sum, r) => sum + r.quantity, 0),
          subtotal: groupData.reduce((sum, r) => sum + r.subtotal, 0),
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
            document.title = '${reportTitle.replace(/'/g, "\\'")}';

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
        quantity: acc.quantity + item.quantity,
        subtotal: acc.subtotal + item.subtotal,
      }),
      {
        quantity: 0,
        subtotal: 0,
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
        return new Date(bVal).getTime() - new Date(aVal).getTime()
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.toLowerCase().localeCompare(bVal.toLowerCase())
      }

      return bVal - aVal
    }

    if (groupBy !== 'none') {
      filtered.sort((a, b) => {
        if (groupBy === 'supplierCategory') {
          const supplierResult = compareValues(a, b, 'supplierName')
          if (supplierResult !== 0) return supplierResult
          const categoryResult = compareValues(a, b, 'categoryName')
          if (categoryResult !== 0) return categoryResult
        } else {
          const groupResult = compareValues(a, b, groupBy)
          if (groupResult !== 0) return groupResult
        }

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
            <PurchaseOrderIcon sx={{
              fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize,
              color: TYPOGRAPHY_STYLES.pageHeader.icon.color
            }} />
            Purchase Order Summary
          </Typography>
          <Typography variant={TYPOGRAPHY_STYLES.pageSubtitle.variant} color={TYPOGRAPHY_STYLES.pageSubtitle.color}>
            {reportData.length > 0
              ? `${reportData.length} purchase order items`
              : 'View detailed purchase order line items'}
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
                  <InputLabel>Vendor</InputLabel>
                  <Select
                    value={selectedSupplier}
                    label="Vendor"
                    onChange={(e) => setSelectedSupplier(e.target.value)}
                    MenuProps={{ PaperProps: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } }}
                  >
                    <MenuItem value="">All Vendors</MenuItem>
                    {suppliers.map((supplier) => (
                      <MenuItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontSize: '0.75rem' }}>
                  PO Date
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
                  <InputLabel>PO Inventory Status</InputLabel>
                  <Select
                    value={status}
                    label="PO Inventory Status"
                    onChange={(e) => setStatus(e.target.value)}
                    MenuProps={{ PaperProps: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } }}
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
                    MenuProps={{ PaperProps: { sx: { '& .MuiMenuItem-root': { fontSize: '0.75rem' } } } }}
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
                        const allColumns = ['orderNumber', 'orderDate', 'supplierName', 'productName', 'categoryName', 'quantity', 'unitPrice', 'subtotal', 'status', 'paymentStatus']
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
                    <MenuItem value="orderNumber">PO Number</MenuItem>
                    <MenuItem value="orderDate">PO Date</MenuItem>
                    <MenuItem value="supplierName">Vendor</MenuItem>
                    <MenuItem value="productName">Product</MenuItem>
                    <MenuItem value="categoryName">Category</MenuItem>
                    <MenuItem value="quantity">Quantity</MenuItem>
                    <MenuItem value="unitPrice">Unit Price</MenuItem>
                    <MenuItem value="subtotal">Subtotal</MenuItem>
                    <MenuItem value="status">PO Inventory Status</MenuItem>
                    <MenuItem value="paymentStatus">PO Payment Status</MenuItem>
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
                    <MenuItem value="supplierName">Vendor</MenuItem>
                    <MenuItem value="categoryName">Category</MenuItem>
                    <MenuItem value="supplierCategory">Vendor, Category</MenuItem>
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
                    <MenuItem value="orderDate">PO Date</MenuItem>
                    <MenuItem value="orderNumber">PO Number</MenuItem>
                    <MenuItem value="supplierName">Vendor</MenuItem>
                    <MenuItem value="productName">Product</MenuItem>
                    <MenuItem value="categoryName">Category</MenuItem>
                    <MenuItem value="quantity">Quantity</MenuItem>
                    <MenuItem value="subtotal">Subtotal</MenuItem>
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
                      <PurchaseOrderIcon sx={{ fontSize: 80, color: 'text.disabled', mb: 2 }} />
                      <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
                        No Report Generated
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
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
                      {selectedColumns.includes('orderNumber') && <TableCell align="center">PO Number</TableCell>}
                      {selectedColumns.includes('orderDate') && <TableCell align="center">PO Date</TableCell>}
                      {selectedColumns.includes('supplierName') && <TableCell align="center">Vendor</TableCell>}
                      {selectedColumns.includes('productName') && <TableCell align="center">Product</TableCell>}
                      {selectedColumns.includes('categoryName') && <TableCell align="center">Category</TableCell>}
                      {selectedColumns.includes('quantity') && <TableCell align="center">Quantity</TableCell>}
                      {selectedColumns.includes('unitPrice') && <TableCell align="center">Unit Price</TableCell>}
                      {selectedColumns.includes('subtotal') && <TableCell align="center">Subtotal</TableCell>}
                      {selectedColumns.includes('status') && <TableCell align="center">PO Inventory Status</TableCell>}
                      {selectedColumns.includes('paymentStatus') && <TableCell align="center">PO Payment Status</TableCell>}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginatedData.map((row, idx) => {
                      const prevRow = idx > 0 ? paginatedData[idx - 1] : null
                      const nextRow = idx < paginatedData.length - 1 ? paginatedData[idx + 1] : null

                      const getGroupKey = (r: any) => {
                        if (groupBy === 'supplierCategory') {
                          return `${r.supplierName}|${r.categoryName}`
                        }
                        return r[groupBy]
                      }

                      const showGroupHeader = groupBy !== 'none' && (!prevRow || getGroupKey(row) !== getGroupKey(prevRow))
                      const showGroupFooter = groupBy !== 'none' && (!nextRow || getGroupKey(row) !== getGroupKey(nextRow))

                      const getGroupLabel = (field: string, r: any) => {
                        if (field === 'supplierCategory') {
                          return `Vendor: ${r.supplierName} | Category: ${r.categoryName}`
                        } else if (field === 'supplierName') {
                          return `Vendor: ${r.supplierName}`
                        } else if (field === 'categoryName') {
                          return `Category: ${r.categoryName}`
                        }
                        return r[field]
                      }

                      const calculateGroupSubtotals = () => {
                        if (groupBy === 'none') return null

                        const currentGroupKey = getGroupKey(row)
                        const groupData = paginatedData.filter(r => getGroupKey(r) === currentGroupKey)

                        return {
                          quantity: groupData.reduce((sum, r) => sum + r.quantity, 0),
                          subtotal: groupData.reduce((sum, r) => sum + r.subtotal, 0),
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
                        {selectedColumns.includes('orderDate') && (
                          <TableCell sx={{ fontSize: '0.8rem' }}>
                            {row.orderDate ? new Date(row.orderDate).toLocaleDateString() : '-'}
                          </TableCell>
                        )}
                        {selectedColumns.includes('supplierName') && (
                          <TableCell sx={{ fontSize: '0.8rem' }}>
                            {row.supplierName}
                          </TableCell>
                        )}
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
                        {selectedColumns.includes('subtotal') && (
                          <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                            {formatCurrency(row.subtotal)}
                          </TableCell>
                        )}
                        {selectedColumns.includes('status') && (
                          <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                            <Chip
                              label={row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                              color={getStatusColor(row.status) as any}
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
                              {selectedColumns.includes('orderDate') && <TableCell />}
                              {selectedColumns.includes('supplierName') && <TableCell />}
                              {selectedColumns.includes('productName') && <TableCell />}
                              {selectedColumns.includes('categoryName') && <TableCell />}
                              {selectedColumns.includes('quantity') && (
                                <TableCell align="right">
                                  {groupSubtotals.quantity}
                                </TableCell>
                              )}
                              {selectedColumns.includes('unitPrice') && <TableCell />}
                              {selectedColumns.includes('subtotal') && (
                                <TableCell align="right">
                                  {formatCurrency(groupSubtotals.subtotal)}
                                </TableCell>
                              )}
                              {selectedColumns.includes('status') && <TableCell />}
                              {selectedColumns.includes('paymentStatus') && <TableCell />}
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
                        {selectedColumns.includes('orderDate') && <TableCell />}
                        {selectedColumns.includes('supplierName') && <TableCell />}
                        {selectedColumns.includes('productName') && <TableCell />}
                        {selectedColumns.includes('categoryName') && <TableCell />}
                        {selectedColumns.includes('quantity') && (
                          <TableCell align="right">
                            {totals.quantity}
                          </TableCell>
                        )}
                        {selectedColumns.includes('unitPrice') && <TableCell />}
                        {selectedColumns.includes('subtotal') && (
                          <TableCell align="right">
                            {formatCurrency(totals.subtotal)}
                          </TableCell>
                        )}
                        {selectedColumns.includes('status') && <TableCell />}
                        {selectedColumns.includes('paymentStatus') && <TableCell />}
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

export default PurchaseOrderSummary
