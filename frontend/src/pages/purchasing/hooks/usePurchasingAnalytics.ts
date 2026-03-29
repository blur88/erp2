import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import api from '@/services/api'

export interface PurchasingMetrics {
  totalSpent: number
  totalOrders: number
  averageOrderValue: number
  activeSuppliers: number
}

export interface PurchasingPeriodDataPoint {
  period: string
  spent: number
  orders: number
}

export interface PurchasingPeriodBlock {
  metrics: PurchasingMetrics
  periodData: PurchasingPeriodDataPoint[]
  periodStart: string
  periodEnd: string
}

export interface TopSupplier {
  supplierId: string
  supplierName: string
  totalSpent: number
  orderCount: number
}

export interface RecentPurchaseOrder {
  orderNumber: string
  orderDate: string
  supplierName: string
  totalAmount: number
  status: 'received' | 'pending'
}

export interface PurchasingAnalyticsData {
  current: PurchasingPeriodBlock
  comparison?: PurchasingPeriodBlock
  topSuppliers: TopSupplier[]
  recentOrders: RecentPurchaseOrder[]
}

export interface PurchasingAnalyticsParams {
  dateRange?: string
  startDate?: string
  endDate?: string
  groupBy?: string
  compareWith?: string
  supplierId?: string
  status?: string
  paymentStatus?: string
}

export function usePurchasingAnalytics(params: PurchasingAnalyticsParams) {
  const [data, setData] = useState<PurchasingAnalyticsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isFetching, setIsFetching] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetchAnalytics = useCallback(async (nextParams: PurchasingAnalyticsParams) => {
    abortRef.current?.abort()

    const controller = new AbortController()
    abortRef.current = controller

    setIsFetching(true)
    setError(null)

    try {
      const response = await api.get('/purchasing/analytics/dashboard', {
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
    fetchAnalytics(JSON.parse(serializedParams))
    return () => {
      abortRef.current?.abort()
    }
  }, [fetchAnalytics, serializedParams])

  return { data, isLoading, isFetching, error }
}
