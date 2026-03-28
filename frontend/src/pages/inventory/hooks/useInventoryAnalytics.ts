import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import api from '@/services/api'

export interface InventoryMetrics {
  totalProducts: number
  totalCategories: number
  inventoryValue: number
  lowStockCount: number
  outOfStockCount: number
  stockMovementsIn: number
  stockMovementsOut: number
}

export interface InventoryPeriodDataPoint {
  period: string
  movementsIn: number
  movementsOut: number
}

export interface InventoryPeriodBlock {
  metrics: InventoryMetrics
  periodData: InventoryPeriodDataPoint[]
  periodStart: string
  periodEnd: string
}

export interface LowStockAlert {
  productId: string
  productName: string
  categoryName: string
  stockQuantity: number
  status: 'low_stock' | 'out_of_stock'
}

export interface RecentMovement {
  movementDate: string
  productName: string
  movementType: string
  quantity: number
  referenceNumber: string
}

export interface InventoryAnalyticsData {
  current: InventoryPeriodBlock
  comparison?: InventoryPeriodBlock
  lowStockAlerts: LowStockAlert[]
  recentMovements: RecentMovement[]
}

export interface InventoryAnalyticsParams {
  dateRange?: string
  startDate?: string
  endDate?: string
  groupBy?: string
  compareWith?: string
}

export function useInventoryAnalytics(params: InventoryAnalyticsParams) {
  const [data, setData] = useState<InventoryAnalyticsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isFetching, setIsFetching] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetchAnalytics = useCallback(async (nextParams: InventoryAnalyticsParams) => {
    abortRef.current?.abort()

    const controller = new AbortController()
    abortRef.current = controller

    setIsFetching(true)
    setError(null)

    try {
      const response = await api.get('/inventory/analytics/dashboard', {
        params: Object.fromEntries(
          Object.entries(nextParams).filter(([, value]) => value !== undefined && value !== null),
        ),
        signal: controller.signal,
      })
      setData(response.data)
      setIsLoading(false)
    } catch (err: unknown) {
      const errorName = (err as { name?: string }).name
      if (errorName === 'AbortError' || errorName === 'CanceledError') {
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
