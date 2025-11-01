import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import { reportsApi, ReportTemplate, ReportConfig, ReportGenerationOptions, ReportDataAggregationResult } from '@/services/reportsApi'

interface ReportsState {
  templates: ReportTemplate[]
  currentReport: ReportDataAggregationResult | null
  selectedTemplate: ReportTemplate | null
  reportConfig: ReportConfig | null
  filters: {
    category: string
    dateRange: {
      start: string
      end: string
    }
  }
  loading: {
    templates: boolean
    report: boolean
    export: boolean
  }
  error: string | null
}

const initialState: ReportsState = {
  templates: [],
  currentReport: null,
  selectedTemplate: null,
  reportConfig: null,
  filters: {
    category: '',
    dateRange: {
      start: '',
      end: ''
    }
  },
  loading: {
    templates: false,
    report: false,
    export: false
  },
  error: null
}

// Async thunks
export const fetchReportTemplates = createAsyncThunk(
  'reports/fetchTemplates',
  async (category?: string) => {
    const response = await reportsApi.getTemplates(category)
    return response
  }
)

export const generateReport = createAsyncThunk(
  'reports/generate',
  async ({ reportConfig, options }: { reportConfig: ReportConfig; options: ReportGenerationOptions }) => {
    const response = await reportsApi.generateReport(reportConfig, options)
    return response
  }
)

export const exportReport = createAsyncThunk(
  'reports/export',
  async ({ reportData, format }: { reportData: ReportDataAggregationResult; format: string }) => {
    const response = await reportsApi.exportReport(reportData, format)
    return response
  }
)

const reportsSlice = createSlice({
  name: 'reports',
  initialState,
  reducers: {
    setSelectedTemplate: (state, action: PayloadAction<ReportTemplate | null>) => {
      state.selectedTemplate = action.payload
    },
    setReportConfig: (state, action: PayloadAction<ReportConfig | null>) => {
      state.reportConfig = action.payload
    },
    setFilters: (state, action: PayloadAction<Partial<ReportsState['filters']>>) => {
      state.filters = { ...state.filters, ...action.payload }
    },
    clearReport: (state) => {
      state.currentReport = null
      state.error = null
    },
    clearError: (state) => {
      state.error = null
    }
  },
  extraReducers: (builder) => {
    // Fetch templates
    builder
      .addCase(fetchReportTemplates.pending, (state) => {
        state.loading.templates = true
        state.error = null
      })
      .addCase(fetchReportTemplates.fulfilled, (state, action) => {
        state.loading.templates = false
        if (action.payload) {
          state.templates = (action.payload as any).templates || []
        }
      })
      .addCase(fetchReportTemplates.rejected, (state, action) => {
        state.loading.templates = false
        state.error = action.error.message || 'Failed to fetch report templates'
      })

    // Generate report
    builder
      .addCase(generateReport.pending, (state) => {
        state.loading.report = true
        state.error = null
      })
      .addCase(generateReport.fulfilled, (state, action) => {
        state.loading.report = false
        if (action.payload) {
          state.currentReport = (action.payload as any).data || action.payload
        }
      })
      .addCase(generateReport.rejected, (state, action) => {
        state.loading.report = false
        state.error = action.error.message || 'Failed to generate report'
      })

    // Export report
    builder
      .addCase(exportReport.pending, (state) => {
        state.loading.export = true
        state.error = null
      })
      .addCase(exportReport.fulfilled, (state) => {
        state.loading.export = false
      })
      .addCase(exportReport.rejected, (state, action) => {
        state.loading.export = false
        state.error = action.error.message || 'Failed to export report'
      })
  }
})

export const {
  setSelectedTemplate,
  setReportConfig,
  setFilters,
  clearReport,
  clearError
} = reportsSlice.actions

export default reportsSlice.reducer
