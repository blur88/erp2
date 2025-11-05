import { ApiService } from './api'

export interface ReportTemplate {
  id: string
  name: string
  category: 'sales' | 'inventory' | 'purchasing' | 'financial' | 'operational'
  description: string
}

export interface ReportConfig {
  id?: string
  name: string
  category: 'sales' | 'inventory' | 'purchasing' | 'financial' | 'operational'
  type: string
  description?: string
  filters?: Record<string, any>
  timeRange?: {
    start: Date | string
    end: Date | string
  }
}

export interface ReportGenerationOptions {
  format: 'csv' | 'xlsx' | 'pdf' | 'json'
  filters?: Record<string, any>
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  groupBy?: string[]
}

export interface ReportDataAggregationResult {
  totalRecords: number
  data: any[]
  aggregations?: Record<string, any>
  metadata?: Record<string, any>
}

export const reportsApi = {
  // Get available report templates
  async getTemplates(category?: string) {
    const response = await ApiService.get<{ templates: ReportTemplate[] }>('reports/templates', {
      params: category ? { category } : undefined
    })
    return response
  },

  // Generate a report
  async generateReport(reportConfig: ReportConfig, options: ReportGenerationOptions) {
    const response = await ApiService.post<{ data: ReportDataAggregationResult }>('reports/generate', {
      reportConfig,
      options
    })
    return response
  },

  // Export a report
  async exportReport(reportData: ReportDataAggregationResult, format: string) {
    const response = await ApiService.post<{ data: string }>('reports/export', {
      reportData,
      format
    })
    return response
  },
}
