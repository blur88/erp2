import React, { useState, useEffect, useCallback, useRef } from 'react'
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
  Stack,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  Divider,
  useTheme,
  useMediaQuery,
  Skeleton,
} from '@mui/material'
import {
  Assessment as ReportIcon,
  PictureAsPdf as PdfIcon,
  TableChart as ExcelIcon,
  InsertDriveFile as CsvIcon,
  FilterList as FilterIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  PlayArrow as GenerateIcon,
} from '@mui/icons-material'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import {
  fetchReportTemplates,
  generateReport,
  exportReport,
  setSelectedTemplate,
  clearReport,
} from '@/store/slices/reportsSlice'
import { formatCurrency, formatDate } from '@/utils/formatters'
import { useNotification } from '@/hooks/useNotification'

const ReportsPage: React.FC = () => {
  const dispatch = useAppDispatch()
  const { showSuccess, showError } = useNotification()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))

  const { templates, currentReport, selectedTemplate, loading, error } =
    useAppSelector((state) => state.reports)

  const [category, setCategory] = useState<string>('')
  const [dateRange, setDateRange] = useState({
    start: '',
    end: '',
  })
  const [format, setFormat] = useState<'csv' | 'xlsx' | 'pdf' | 'json'>('json')
  const [focusedTemplateIndex, setFocusedTemplateIndex] = useState<number>(-1)
  const templateListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    dispatch(fetchReportTemplates(undefined as any))
  }, [dispatch])

  const handleCategoryChange = (newCategory: string) => {
    setCategory(newCategory)
    dispatch(fetchReportTemplates(newCategory || undefined))
  }

  const handleTemplateSelect = (template: any, index: number) => {
    console.log('Selecting template:', template)
    dispatch(setSelectedTemplate(template))
    setFocusedTemplateIndex(index)
  }

  const handleGenerateReport = async () => {
    if (!selectedTemplate) {
      showError('Please select a report template')
      return
    }

    const reportConfig = {
      name: selectedTemplate.name,
      category: selectedTemplate.category,
      type: selectedTemplate.id,
      timeRange: dateRange.start && dateRange.end ? {
        start: new Date(dateRange.start),
        end: new Date(dateRange.end),
      } : undefined,
    }

    const options = {
      format,
      filters: {},
    }

    try {
      await dispatch(generateReport({ reportConfig, options })).unwrap()
      showSuccess('Report generated successfully')
    } catch (err) {
      showError('Failed to generate report')
    }
  }

  const handleExportReport = async (exportFormat: string) => {
    if (!currentReport) {
      showError('No report to export')
      return
    }

    try {
      const result = await dispatch(exportReport({
        reportData: currentReport,
        format: exportFormat,
      })).unwrap()

      // Download the file
      const blob = new Blob([atob((result as any).data)], { type: 'application/octet-stream' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `report_${Date.now()}.${exportFormat}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

      showSuccess(`Report exported as ${exportFormat.toUpperCase()}`)
    } catch (err) {
      showError('Failed to export report')
    }
  }

  // Auto-focus first template when templates load
  useEffect(() => {
    if (templates.length > 0 && focusedTemplateIndex === -1 && !selectedTemplate) {
      setFocusedTemplateIndex(0)
      dispatch(setSelectedTemplate(templates[0]))
    }
  }, [templates, focusedTemplateIndex, selectedTemplate, dispatch])

  // Keyboard shortcuts for navigation
  const handleNavigateUp = useCallback(() => {
    if (focusedTemplateIndex > 0) {
      const newIndex = focusedTemplateIndex - 1
      setFocusedTemplateIndex(newIndex)
      dispatch(setSelectedTemplate(templates[newIndex]))
    }
  }, [focusedTemplateIndex, templates, dispatch])

  const handleNavigateDown = useCallback(() => {
    if (focusedTemplateIndex < templates.length - 1) {
      const newIndex = focusedTemplateIndex + 1
      setFocusedTemplateIndex(newIndex)
      dispatch(setSelectedTemplate(templates[newIndex]))
    }
  }, [focusedTemplateIndex, templates, dispatch])

  useKeyboardShortcuts({
    onArrowUp: handleNavigateUp,
    onArrowDown: handleNavigateDown,
  })

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
            <ReportIcon sx={{
              fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize,
              color: TYPOGRAPHY_STYLES.pageHeader.icon.color
            }} />
            Reports
          </Typography>
          <Typography variant={TYPOGRAPHY_STYLES.pageSubtitle.variant} color={TYPOGRAPHY_STYLES.pageSubtitle.color}>
            Generate and export business reports ({templates.length} templates available)
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
            onClick={() => dispatch(fetchReportTemplates(undefined as any))}
            size={isMobile ? "medium" : "medium"}
            fullWidth={isMobile}
            disabled={loading.templates}
          >
            {isMobile ? "Refresh" : "Refresh"}
          </Button>
          {currentReport && (
            <Button
              variant="contained"
              startIcon={!isMobile ? <DownloadIcon /> : undefined}
              size={isMobile ? "medium" : "medium"}
              onClick={() => handleExportReport('xlsx')}
              fullWidth={isMobile}
              disabled={loading.export}
            >
              {isMobile ? "Export Current" : "Export"}
            </Button>
          )}
        </Box>
      </Box>

      {/* Filters Bar */}
      <Box sx={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        gap: isMobile ? 2 : 1,
        alignItems: isMobile ? 'stretch' : 'center',
        mb: 3,
        '& > *': {
          alignSelf: isMobile ? 'stretch' : 'flex-start'
        }
      }}>
        <FormControl
          size="medium"
          sx={{
            minWidth: isMobile ? 'auto' : 120,
            '& .MuiOutlinedInput-root': {
              height: TYPOGRAPHY_STYLES.searchField.input.height,
            }
          }}
        >
          <InputLabel>Category</InputLabel>
          <Select
            value={category}
            label="Category"
            onChange={(e) => handleCategoryChange(e.target.value)}
            sx={{ fontSize: '0.875rem' }}
          >
            <MenuItem value="">All Categories</MenuItem>
            <MenuItem value="sales">Sales</MenuItem>
            <MenuItem value="inventory">Inventory</MenuItem>
            <MenuItem value="purchasing">Purchasing</MenuItem>
            <MenuItem value="financial">Financial</MenuItem>
          </Select>
        </FormControl>

        <TextField
          label="Start Date"
          type="date"
          value={dateRange.start}
          onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
          InputLabelProps={{ shrink: true }}
          size="medium"
          sx={{
            minWidth: isMobile ? 'auto' : 150,
            '& .MuiOutlinedInput-root': {
              height: TYPOGRAPHY_STYLES.searchField.input.height,
              fontSize: '0.875rem',
            }
          }}
        />

        <TextField
          label="End Date"
          type="date"
          value={dateRange.end}
          onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
          InputLabelProps={{ shrink: true }}
          size="medium"
          sx={{
            minWidth: isMobile ? 'auto' : 150,
            '& .MuiOutlinedInput-root': {
              height: TYPOGRAPHY_STYLES.searchField.input.height,
              fontSize: '0.875rem',
            }
          }}
        />

        <FormControl
          size="medium"
          sx={{
            minWidth: isMobile ? 'auto' : 120,
            '& .MuiOutlinedInput-root': {
              height: TYPOGRAPHY_STYLES.searchField.input.height,
            }
          }}
        >
          <InputLabel>Format</InputLabel>
          <Select
            value={format}
            label="Format"
            onChange={(e) => setFormat(e.target.value as any)}
            sx={{ fontSize: '0.875rem' }}
          >
            <MenuItem value="json">JSON (View)</MenuItem>
            <MenuItem value="csv">CSV</MenuItem>
            <MenuItem value="xlsx">Excel</MenuItem>
            <MenuItem value="pdf">PDF</MenuItem>
          </Select>
        </FormControl>

        <Button
          variant="contained"
          startIcon={<GenerateIcon />}
          size="medium"
          onClick={handleGenerateReport}
          disabled={!selectedTemplate || loading.report}
          sx={{
            height: TYPOGRAPHY_STYLES.searchField.input.height,
            fontSize: '0.875rem',
            minWidth: 'auto',
            px: 3
          }}
        >
          {loading.report ? 'Generating...' : 'Generate'}
        </Button>

        {currentReport && (
          <Button
            variant="outlined"
            onClick={() => dispatch(clearReport())}
            size="medium"
            sx={{
              height: TYPOGRAPHY_STYLES.searchField.input.height,
              fontSize: '0.875rem',
              minWidth: 'auto',
              px: 2
            }}
          >
            Clear Report
          </Button>
        )}
      </Box>

      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Split Layout */}
      <Grid container spacing={3}>
        {/* Left Side - Report Templates List */}
        <Grid item xs={12} md={3}>
          <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
              <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Report Templates ({templates.length})
              </Typography>
            </Box>

            <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} ref={templateListRef}>
              <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
                <Table size={TABLE_STYLES.size}>
                  <TableBody>
                    {loading.templates && templates.length === 0 ? (
                      [...Array(10)].map((_, i) => (
                        <TableRow key={`skeleton-${i}`}>
                          <TableCell>
                            <Skeleton height={60} />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : templates.length === 0 ? (
                      <TableRow>
                        <TableCell>
                          <Box sx={{ p: 4, textAlign: 'center' }}>
                            <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} color="text.secondary">
                              No report templates available.
                            </Typography>
                          </Box>
                        </TableCell>
                      </TableRow>
                    ) : (
                      templates.map((template: any, index: number) => {
                        const isSelected = selectedTemplate?.id === template.id
                        const isFocused = index === focusedTemplateIndex
                        return (
                          <TableRow
                            key={template.id}
                            hover
                            onClick={() => handleTemplateSelect(template, index)}
                            data-template-index={index}
                            sx={{
                              cursor: 'pointer',
                              backgroundColor: isSelected ? 'action.selected' : isFocused ? 'action.focus' : 'inherit',
                              '&:hover': {
                                backgroundColor: isSelected ? 'action.selected' : 'action.hover'
                              },
                              transition: 'background-color 0.2s ease',
                            }}
                          >
                            <TableCell sx={{ py: 1.5 }}>
                              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                                  <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{
                                    fontWeight: 600,
                                    fontSize: '0.875rem',
                                    lineHeight: 1.3
                                  }}>
                                    {template.name}
                                  </Typography>
                                  <Chip
                                    label={template.category}
                                    size="small"
                                    color="primary"
                                    variant="outlined"
                                    sx={{
                                      fontSize: TYPOGRAPHY_STYLES.chip.small.fontSize,
                                      height: 20,
                                      ml: 1
                                    }}
                                  />
                                </Box>
                                <Typography variant={TYPOGRAPHY_STYLES.tableCell.caption.variant} color="text.secondary" sx={{
                                  fontSize: '0.75rem',
                                  lineHeight: 1.4
                                }}>
                                  {template.description}
                                </Typography>
                              </Box>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          </Paper>
        </Grid>

        {/* Right Side - Report Results */}
        <Grid item xs={12} md={9}>
          {!currentReport ? (
            <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', p: 4 }}>
                <Box sx={{ textAlign: 'center', maxWidth: 500 }}>
                  <ReportIcon sx={{ fontSize: 80, color: 'text.disabled', mb: 2 }} />
                  <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
                    No Report Generated
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Select a report template from the list, configure filters, and click "Generate" to create a report.
                  </Typography>
                  {selectedTemplate && (
                    <Box sx={{ mt: 3, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                      <Typography variant="body2" sx={{ mb: 1, fontWeight: 600 }}>
                        Selected Template:
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {selectedTemplate.name}
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Box>
            </Paper>
          ) : (
            <Paper sx={{ height: 'calc(100vh - 300px)', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                  fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                  fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  Report Results
                </Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Button
                    size="small"
                    startIcon={<CsvIcon />}
                    onClick={() => handleExportReport('csv')}
                    disabled={loading.export}
                    sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.secondary.fontSize }}
                  >
                    CSV
                  </Button>
                  <Button
                    size="small"
                    startIcon={<ExcelIcon />}
                    onClick={() => handleExportReport('xlsx')}
                    disabled={loading.export}
                    sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.secondary.fontSize }}
                  >
                    Excel
                  </Button>
                  <Button
                    size="small"
                    startIcon={<PdfIcon />}
                    onClick={() => handleExportReport('pdf')}
                    disabled={loading.export}
                    sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.secondary.fontSize }}
                  >
                    PDF
                  </Button>
                </Stack>
              </Box>

              {/* Summary Stats */}
              <Box sx={{ p: 3, overflow: 'auto', flex: 1 }}>
                <Grid container spacing={2} sx={{ mb: 3 }}>
                  <Grid item xs={12} sm={6} md={3}>
                    <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                      <Typography variant={TYPOGRAPHY_STYLES.tableCell.caption.variant} color="text.secondary">
                        Total Records
                      </Typography>
                      <Typography variant="h4" sx={{ fontWeight: 700 }}>
                        {currentReport.totalRecords}
                      </Typography>
                    </Box>
                  </Grid>

                  {currentReport.aggregations?.totalRevenue !== undefined && (
                    <Grid item xs={12} sm={6} md={3}>
                      <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                        <Typography variant={TYPOGRAPHY_STYLES.tableCell.caption.variant} color="text.secondary">
                          Total Revenue
                        </Typography>
                        <Typography variant="h4" sx={{ fontWeight: 700 }}>
                          {formatCurrency(currentReport.aggregations.totalRevenue)}
                        </Typography>
                      </Box>
                    </Grid>
                  )}

                  {currentReport.aggregations?.orderCount !== undefined && (
                    <Grid item xs={12} sm={6} md={3}>
                      <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                        <Typography variant={TYPOGRAPHY_STYLES.tableCell.caption.variant} color="text.secondary">
                          Orders
                        </Typography>
                        <Typography variant="h4" sx={{ fontWeight: 700 }}>
                          {currentReport.aggregations.orderCount}
                        </Typography>
                      </Box>
                    </Grid>
                  )}

                  {currentReport.aggregations?.averageOrderValue !== undefined && (
                    <Grid item xs={12} sm={6} md={3}>
                      <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                        <Typography variant={TYPOGRAPHY_STYLES.tableCell.caption.variant} color="text.secondary">
                          Avg Order Value
                        </Typography>
                        <Typography variant="h4" sx={{ fontWeight: 700 }}>
                          {formatCurrency(currentReport.aggregations.averageOrderValue)}
                        </Typography>
                      </Box>
                    </Grid>
                  )}
                </Grid>

                {/* Data Table */}
                <TableContainer sx={{ maxHeight: 'calc(100vh - 600px)' }}>
                  <Table
                    size={TABLE_STYLES.size}
                    stickyHeader
                    sx={{
                      '& .MuiTableCell-root': {
                        borderBottom: TABLE_STYLES.cell.border,
                        py: TABLE_STYLES.cell.padding.py,
                        px: TABLE_STYLES.cell.padding.px
                      }
                    }}
                  >
                    <TableHead>
                      <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, backgroundColor: 'grey.50' } }}>
                        {currentReport.data.length > 0 &&
                          Object.keys(currentReport.data[0]).map((key) => (
                            <TableCell key={key}>
                              <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{
                                fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight,
                                fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize
                              }}>
                                {key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')}
                              </Typography>
                            </TableCell>
                          ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {currentReport.data.map((row, index) => (
                        <TableRow key={index} hover sx={{ height: TABLE_STYLES.row.height }}>
                          {Object.entries(row).map(([key, value]) => (
                            <TableCell key={key}>
                              <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} sx={{
                                fontSize: TYPOGRAPHY_STYLES.tableCell.secondary.fontSize
                              }}>
                                {typeof value === 'number' && key.toLowerCase().includes('amount')
                                  ? formatCurrency(value as number)
                                  : typeof value === 'string' && key.toLowerCase().includes('date')
                                  ? formatDate(value)
                                  : String(value)}
                              </Typography>
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            </Paper>
          )}
        </Grid>
      </Grid>
    </Box>
  )
}

export default ReportsPage
