import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'
import type { PeriodValue } from '@/types/filterBar.types'

export type DashboardCompare = 'previous_period' | 'last_month' | 'last_year' | null

export interface DashboardResolvedApiParams {
  dateRange?: string
  startDate?: string
  endDate?: string
  groupBy?: string
  compareWith?: string
  customerId?: string
  supplierId?: string
  status?: string
  isFulfilled?: boolean
  paymentStatus?: string
  categoryId?: string
  stockStatus?: string
}

export interface DashboardFilterBase {
  period: PeriodValue
  compareWith: DashboardCompare
  customerId?: string | null
  supplierId?: string | null
  isFulfilled?: string | null
  status?: string | null
  paymentStatus?: string | null
  categoryId?: string | null
  stockStatus?: string | null
}

function groupByForRange(from: string, to: string): string {
  const days = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1
  if (days <= 31) return 'day'
  if (days <= 90) return 'week'
  return 'month'
}

function periodToApiParams(
  period: PeriodValue,
  compareWith: DashboardCompare,
): Record<string, string | undefined> {
  const compareParam = compareWith ?? undefined

  if (period.key === 'custom') {
    if (period.from && period.to) {
      return {
        startDate: period.from,
        endDate: period.to,
        groupBy: groupByForRange(period.from, period.to),
        compareWith: compareParam,
      }
    }

    return { dateRange: 'this_month', groupBy: 'day', compareWith: compareParam }
  }

  if (period.key === 'this_month' || period.key === 'last_month') {
    return { dateRange: period.key, groupBy: 'day', compareWith: compareParam }
  }

  if (period.key === null) {
    return { dateRange: 'this_month', groupBy: 'day', compareWith: compareParam }
  }

  const { from, to } = getPeriodDateRange(period.key, getStartOfWeek())
  return {
    startDate: from,
    endDate: to,
    groupBy: groupByForRange(from, to),
    compareWith: compareParam,
  }
}

export function resolveApiParams(filters: DashboardFilterBase): DashboardResolvedApiParams {
  const base = periodToApiParams(filters.period, filters.compareWith)

  return {
    ...base,
    ...(filters.customerId ? { customerId: filters.customerId } : {}),
    ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
    ...(filters.isFulfilled !== null && filters.isFulfilled !== undefined
      ? { isFulfilled: filters.isFulfilled === 'true' }
      : {}),
    ...(filters.status !== null && filters.status !== undefined ? { status: filters.status } : {}),
    ...(filters.paymentStatus !== null && filters.paymentStatus !== undefined
      ? { paymentStatus: filters.paymentStatus }
      : {}),
    ...(filters.categoryId !== null && filters.categoryId !== undefined
      ? { categoryId: filters.categoryId }
      : {}),
    ...(filters.stockStatus !== null && filters.stockStatus !== undefined
      ? { stockStatus: filters.stockStatus }
      : {}),
  }
}
