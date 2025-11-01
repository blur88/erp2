import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  CardActions,
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
} from '@mui/material'
import {
  Assessment as ReportIcon,
  PictureAsPdf as PdfIcon,
  TableChart as ExcelIcon,
  InsertDriveFile as CsvIcon,
  FilterList as FilterIcon,
} from '@mui/icons-material'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  fetchReportTemplates,
  generateReport,
  exportReport,
  setSelectedTemplate,
  setFilters,
  clearReport,
} from '@/store/slices/reportsSlice'
import { formatCurrency, formatDate } from '@/utils/formatters'
import { useNotification } from '@/hooks/useNotification'

const ReportsPage: React.FC = () => {
  const dispatch = useAppDispatch()
  const { showSuccess, showError } = useNotification()

  const { templates, currentReport, selectedTemplate, filters, loading, error } =
    useAppSelector((state) => state.reports)

  const [category, setCategory] = useState<string>('')
  const [dateRange, setDateRange] = useState({
    start: '',
    end: '',
  })
  const [format, setFormat] = useState<'csv' | 'xlsx' | 'pdf' | 'json'>('json')

  useEffect(() => {
    dispatch(fetchReportTemplates(undefined as any))
  }, [dispatch])

  const handleCategoryChange = (newCategory: string) => {
    setCategory(newCategory)
    dispatch(fetchReportTemplates(newCategory || undefined))
  }

  const handleTemplateSelect = (template: any) => {
    console.log('Selecting template:', template)
    dispatch(setSelectedTemplate(template))
  }

  // Debug log
  console.log('selectedTemplate:', selectedTemplate)
  console.log('templates:', templates)
  console.log('loading:', loading)

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
      const blob = new Blob([atob(result.data)], { type: 'application/octet-stream' })
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

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 4 }}>
        Reports
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Filters Panel */}
        <Grid item xs={12} md={4} lg={3}>
          <Paper sx={{ p: 3 }}>
            <Stack spacing={3}>
              <Box>
                <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <FilterIcon /> Filters
                </Typography>
                <Divider sx={{ mb: 2 }} />
              </Box>

              <FormControl fullWidth>
                <InputLabel>Category</InputLabel>
                <Select
                  value={category}
                  label="Category"
                  onChange={(e) => handleCategoryChange(e.target.value)}
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
                fullWidth
              />

              <TextField
                label="End Date"
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />

              <FormControl fullWidth>
                <InputLabel>Export Format</InputLabel>
                <Select
                  value={format}
                  label="Export Format"
                  onChange={(e) => setFormat(e.target.value as any)}
                >
                  <MenuItem value="json">JSON (View)</MenuItem>
                  <MenuItem value="csv">CSV</MenuItem>
                  <MenuItem value="xlsx">Excel</MenuItem>
                  <MenuItem value="pdf">PDF</MenuItem>
                </Select>
              </FormControl>

              <Button
                variant="contained"
                fullWidth
                startIcon={<ReportIcon />}
                onClick={handleGenerateReport}
                disabled={!selectedTemplate || loading.report}
              >
                {loading.report ? <CircularProgress size={24} /> : 'Generate Report'}
              </Button>
            </Stack>
          </Paper>
        </Grid>

        {/* Main Content Area */}
        <Grid item xs={12} md={8} lg={9}>
          {/* Report Templates */}
          {!currentReport && (
            <Box>
              <Typography variant="h5" sx={{ mb: 3, fontWeight: 600 }}>
                Report Templates
              </Typography>

              {loading.templates ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
                  <CircularProgress />
                </Box>
              ) : (
                <Grid container spacing={2}>
                  {templates.map((template) => (
                    <Grid item xs={12} sm={6} lg={4} key={template.id}>
                      <Card
                        sx={{
                          cursor: 'pointer',
                          border: selectedTemplate?.id === template.id ? 2 : 1,
                          borderColor: selectedTemplate?.id === template.id ? 'primary.main' : 'divider',
                          '&:hover': {
                            borderColor: 'primary.main',
                            transform: 'translateY(-2px)',
                            boxShadow: 3,
                          },
                          transition: 'all 0.2s',
                        }}
                        onClick={() => handleTemplateSelect(template)}
                      >
                        <CardContent>
                          <Stack spacing={2}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <ReportIcon color="primary" />
                              <Chip
                                label={template.category}
                                size="small"
                                color="primary"
                                variant="outlined"
                              />
                            </Box>
                            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                              {template.name}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {template.description}
                            </Typography>
                          </Stack>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              )}
            </Box>
          )}

          {/* Report Results */}
          {currentReport && (
            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
                <Typography variant="h5" sx={{ fontWeight: 600 }}>
                  Report Results
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Button
                    startIcon={<CsvIcon />}
                    onClick={() => handleExportReport('csv')}
                    disabled={loading.export}
                  >
                    CSV
                  </Button>
                  <Button
                    startIcon={<ExcelIcon />}
                    onClick={() => handleExportReport('xlsx')}
                    disabled={loading.export}
                  >
                    Excel
                  </Button>
                  <Button
                    startIcon={<PdfIcon />}
                    onClick={() => handleExportReport('pdf')}
                    disabled={loading.export}
                  >
                    PDF
                  </Button>
                  <Button variant="outlined" onClick={() => dispatch(clearReport())}>
                    New Report
                  </Button>
                </Stack>
              </Stack>

              {/* Summary Stats */}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={6} md={3}>
                  <Paper sx={{ p: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      Total Records
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 700 }}>
                      {currentReport.totalRecords}
                    </Typography>
                  </Paper>
                </Grid>

                {currentReport.aggregations?.totalRevenue !== undefined && (
                  <Grid item xs={12} sm={6} md={3}>
                    <Paper sx={{ p: 2 }}>
                      <Typography variant="body2" color="text.secondary">
                        Total Revenue
                      </Typography>
                      <Typography variant="h4" sx={{ fontWeight: 700 }}>
                        {formatCurrency(currentReport.aggregations.totalRevenue)}
                      </Typography>
                    </Paper>
                  </Grid>
                )}

                {currentReport.aggregations?.orderCount !== undefined && (
                  <Grid item xs={12} sm={6} md={3}>
                    <Paper sx={{ p: 2 }}>
                      <Typography variant="body2" color="text.secondary">
                        Orders
                      </Typography>
                      <Typography variant="h4" sx={{ fontWeight: 700 }}>
                        {currentReport.aggregations.orderCount}
                      </Typography>
                    </Paper>
                  </Grid>
                )}

                {currentReport.aggregations?.averageOrderValue !== undefined && (
                  <Grid item xs={12} sm={6} md={3}>
                    <Paper sx={{ p: 2 }}>
                      <Typography variant="body2" color="text.secondary">
                        Avg Order Value
                      </Typography>
                      <Typography variant="h4" sx={{ fontWeight: 700 }}>
                        {formatCurrency(currentReport.aggregations.averageOrderValue)}
                      </Typography>
                    </Paper>
                  </Grid>
                )}
              </Grid>

              {/* Data Table */}
              <TableContainer component={Paper}>
                <Table>
                  <TableHead>
                    <TableRow>
                      {currentReport.data.length > 0 &&
                        Object.keys(currentReport.data[0]).map((key) => (
                          <TableCell key={key}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                              {key.charAt(0).toUpperCase() + key.slice(1)}
                            </Typography>
                          </TableCell>
                        ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {currentReport.data.map((row, index) => (
                      <TableRow key={index}>
                        {Object.entries(row).map(([key, value]) => (
                          <TableCell key={key}>
                            {typeof value === 'number' && key.toLowerCase().includes('amount')
                              ? formatCurrency(value as number)
                              : typeof value === 'string' && key.toLowerCase().includes('date')
                              ? formatDate(value)
                              : String(value)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </Grid>
      </Grid>
    </Box>
  )
}

export default ReportsPage
