import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import api from '@/services/api'

export interface SalesMetrics {
  totalRevenue: number
  totalOrders: number
  averageOrderValue: number
  newCustomers: number
  conversionRate?: number
  paidInvoicesAmount?: number
  pendingInvoicesAmount?: number
  overdueInvoicesAmount?: number
}

export interface PeriodDataPoint {
  period: string
  revenue: number
  orders: number
  newCustomers: number
  averageOrderValue: number
}

export interface AnalyticsPeriodBlock {
  metrics: SalesMetrics
  periodData: PeriodDataPoint[]
  periodStart: string
  periodEnd: string
}

export interface DashboardAnalyticsData {
  current: AnalyticsPeriodBlock
  comparison?: AnalyticsPeriodBlock
  topCustomers: unknown[]
  topProducts: unknown[]
}

export interface DashboardAnalyticsParams {
  dateRange?: string
  startDate?: string
  endDate?: string
  groupBy?: string
  compareWith?: string
}

export function useDashboardAnalytics(params: DashboardAnalyticsParams) {
  const [data, setData] = useState<DashboardAnalyticsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isFetching, setIsFetching] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetchAnalytics = useCallback(async (nextParams: DashboardAnalyticsParams) => {
    abortRef.current?.abort()

    const controller = new AbortController()
    abortRef.current = controller

    setIsFetching(true)
    setError(null)

    try {
      const response = await api.get('/sales/analytics/dashboard', {
        params: Object.fromEntries(Object.entries(nextParams).filter(([, value]) => value !== undefined)),
        signal: controller.signal,
      })
      setData(response.data)
      setIsLoading(false)
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'AbortError' || (err as { name?: string }).name === 'CanceledError') {
        return
      }

      setError(err instanceof Error ? err : new Error(String(err)))
      setIsLoading(false)
    } finally {
      setIsFetching(false)
    }
  }, [])

  const serializedParams = useMemo(() => JSON.stringify(params), [params])

  useEffect(() => {
    fetchAnalytics(params)

    return () => {
      abortRef.current?.abort()
    }
  }, [fetchAnalytics, params, serializedParams])

  return { data, isLoading, isFetching, error }
}
