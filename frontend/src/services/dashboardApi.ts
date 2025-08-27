import { ApiService } from './api'
import type { DashboardStats, ChartData } from '@/types'

export const dashboardApi = {
  // Dashboard statistics
  async getStats() {
    return ApiService.get<DashboardStats>('/dashboard/stats')
  },

  async getSalesChart(period: 'week' | 'month' | 'quarter' | 'year') {
    return ApiService.get<ChartData>('/dashboard/sales-chart', { params: { period } })
  },

  async getRevenueChart(period: 'week' | 'month' | 'quarter' | 'year') {
    return ApiService.get<ChartData>('/dashboard/revenue-chart', { params: { period } })
  },

  async getInventoryChart() {
    return ApiService.get<ChartData>('/dashboard/inventory-chart')
  },

  async getPurchasingChart(period: 'week' | 'month' | 'quarter' | 'year') {
    return ApiService.get<ChartData>('/dashboard/purchasing-chart', { params: { period } })
  },

  // Top performers
  async getTopProducts(limit = 10) {
    return ApiService.get<Array<{
      id: string
      name: string
      sales: number
      revenue: number
      growth: number
    }>>('/dashboard/top-products', { params: { limit } })
  },

  async getTopCustomers(limit = 10) {
    return ApiService.get<Array<{
      id: string
      name: string
      orders: number
      revenue: number
      growth: number
    }>>('/dashboard/top-customers', { params: { limit } })
  },

  async getTopSuppliers(limit = 10) {
    return ApiService.get<Array<{
      id: string
      name: string
      orders: number
      amount: number
      rating: number
    }>>('/dashboard/top-suppliers', { params: { limit } })
  },

  // Recent activities
  async getRecentActivities(limit = 20) {
    return ApiService.get<Array<{
      id: string
      type: 'sale' | 'purchase' | 'inventory' | 'customer' | 'supplier'
      action: string
      description: string
      user: string
      timestamp: Date
      metadata?: any
    }>>('/dashboard/recent-activities', { params: { limit } })
  },

  // Alerts and notifications
  async getAlerts() {
    return ApiService.get<Array<{
      id: string
      type: 'warning' | 'error' | 'info'
      title: string
      message: string
      timestamp: Date
      read: boolean
      priority: 'low' | 'medium' | 'high'
      category: 'inventory' | 'sales' | 'purchasing' | 'system'
    }>>('/dashboard/alerts')
  },

  async markAlertAsRead(alertId: string) {
    return ApiService.put(`/dashboard/alerts/${alertId}/read`)
  },

  async dismissAlert(alertId: string) {
    return ApiService.delete(`/dashboard/alerts/${alertId}`)
  },

  // KPI metrics
  async getKPIs(period?: 'week' | 'month' | 'quarter' | 'year') {
    return ApiService.get<{
      sales: {
        revenue: number
        growth: number
        orders: number
        averageOrderValue: number
      }
      inventory: {
        totalValue: number
        lowStockItems: number
        turnoverRate: number
        stockoutEvents: number
      }
      customers: {
        totalActive: number
        newCustomers: number
        retention: number
        satisfaction: number
      }
      financial: {
        grossProfit: number
        netProfit: number
        profitMargin: number
        cashFlow: number
      }
    }>('/dashboard/kpis', { params: { period } })
  },

  // Business insights
  async getInsights() {
    return ApiService.get<Array<{
      id: string
      type: 'trend' | 'opportunity' | 'risk' | 'achievement'
      title: string
      description: string
      impact: 'low' | 'medium' | 'high'
      actionRequired: boolean
      recommendations?: string[]
      timestamp: Date
    }>>('/dashboard/insights')
  },

  // Performance metrics
  async getPerformanceMetrics(params: {
    period: 'week' | 'month' | 'quarter' | 'year'
    compareWithPrevious?: boolean
  }) {
    return ApiService.get<{
      sales: {
        current: number
        previous?: number
        growth: number
        target: number
        achievement: number
      }
      inventory: {
        turnover: number
        accuracy: number
        fulfillmentRate: number
        wasteReduction: number
      }
      purchasing: {
        costSavings: number
        supplierPerformance: number
        onTimeDelivery: number
        qualityScore: number
      }
      financial: {
        revenueGrowth: number
        profitMargin: number
        costReduction: number
        roi: number
      }
    }>('/dashboard/performance', { params })
  },

  // Forecasting
  async getForecast(params: {
    type: 'sales' | 'inventory' | 'cash_flow'
    period: number // months ahead
    confidence?: 'low' | 'medium' | 'high'
  }) {
    return ApiService.get<{
      type: string
      period: number
      predictions: Array<{
        period: string
        predicted: number
        confidence: number
        factors: string[]
      }>
      accuracy: number
      lastUpdated: Date
    }>('/dashboard/forecast', { params })
  },

  // Custom widgets
  async getWidgetData(widgetId: string, params?: any) {
    return ApiService.get(`/dashboard/widgets/${widgetId}`, { params })
  },

  async saveWidgetConfiguration(config: {
    widgets: Array<{
      id: string
      type: string
      position: { x: number; y: number }
      size: { width: number; height: number }
      settings: any
    }>
  }) {
    return ApiService.post('/dashboard/layout', config)
  },

  async getWidgetConfiguration() {
    return ApiService.get('/dashboard/layout')
  },
}