import { useCallback, useMemo, useState } from 'react'
import { subDays, format } from 'date-fns'

export type DashboardPeriod = 'today' | 'last_7_days' | 'this_month' | 'last_month' | 'custom'
export type DashboardCompare = 'previous_period' | 'last_month' | 'last_year' | null

const VALID_PERIODS: DashboardPeriod[] = ['today', 'last_7_days', 'this_month', 'last_month', 'custom']
const VALID_COMPARES: NonNullable<DashboardCompare>[] = ['previous_period', 'last_month', 'last_year']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function parseUrl(): {
  period: DashboardPeriod
  compareWith: DashboardCompare
  customFrom: string | null
  customTo: string | null
} {
  const params = new URLSearchParams(window.location.search)
  const rawPeriod = params.get('period') ?? 'this_month'
  const rawCompare = params.get('compare')
  const rawFrom = params.get('from')
  const rawTo = params.get('to')

  const period: DashboardPeriod = VALID_PERIODS.includes(rawPeriod as DashboardPeriod)
    ? (rawPeriod as DashboardPeriod)
    : 'this_month'

  const compareWith: DashboardCompare =
    rawCompare && VALID_COMPARES.includes(rawCompare as NonNullable<DashboardCompare>)
      ? (rawCompare as NonNullable<DashboardCompare>)
      : null

  if (period === 'custom') {
    const fromOk = rawFrom && DATE_RE.test(rawFrom)
    const toOk = rawTo && DATE_RE.test(rawTo)
    const rangeOk = fromOk && toOk && rawFrom <= rawTo

    if (!rangeOk) {
      return { period: 'this_month', compareWith, customFrom: null, customTo: null }
    }

    return { period: 'custom', compareWith, customFrom: rawFrom, customTo: rawTo }
  }

  return { period, compareWith, customFrom: null, customTo: null }
}

function toApiParams(
  period: DashboardPeriod,
  compareWith: DashboardCompare,
  customFrom: string | null,
  customTo: string | null,
): Record<string, string | undefined> {
  const now = new Date()
  const todayStr = format(now, 'yyyy-MM-dd')

  const groupByForCustom = (from: string, to: string): string => {
    const days = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1
    if (days <= 31) {
      return 'day'
    }
    if (days <= 90) {
      return 'week'
    }
    return 'month'
  }

  const compareParam = compareWith ?? undefined

  switch (period) {
    case 'today':
      return { startDate: todayStr, endDate: todayStr, groupBy: 'day', compareWith: compareParam }
    case 'last_7_days':
      return {
        startDate: format(subDays(now, 6), 'yyyy-MM-dd'),
        endDate: todayStr,
        groupBy: 'day',
        compareWith: compareParam,
      }
    case 'this_month':
      return { dateRange: 'this_month', groupBy: 'day', compareWith: compareParam }
    case 'last_month':
      return { dateRange: 'last_month', groupBy: 'day', compareWith: compareParam }
    case 'custom':
      if (customFrom && customTo) {
        return {
          startDate: customFrom,
          endDate: customTo,
          groupBy: groupByForCustom(customFrom, customTo),
          compareWith: compareParam,
        }
      }
      return { dateRange: 'this_month', groupBy: 'day', compareWith: compareParam }
    default:
      return { dateRange: 'this_month', groupBy: 'day', compareWith: compareParam }
  }
}

function writeUrl(
  period: DashboardPeriod,
  compareWith: DashboardCompare,
  customFrom: string | null,
  customTo: string | null,
): void {
  const params = new URLSearchParams()
  if (period !== 'this_month') {
    params.set('period', period)
  }
  if (compareWith) {
    params.set('compare', compareWith)
  }
  if (period === 'custom' && customFrom) {
    params.set('from', customFrom)
  }
  if (period === 'custom' && customTo) {
    params.set('to', customTo)
  }
  const search = params.toString()
  const url = search ? `${window.location.pathname}?${search}` : window.location.pathname
  window.history.replaceState(null, '', url)
}

export function useDashboardFilters() {
  const initial = useMemo(() => parseUrl(), [])
  const [period, setPeriodState] = useState<DashboardPeriod>(initial.period)
  const [compareWith, setCompareWith] = useState<DashboardCompare>(initial.compareWith)
  const [customFrom, setCustomFrom] = useState<string | null>(initial.customFrom)
  const [customTo, setCustomTo] = useState<string | null>(initial.customTo)

  const setPeriod = useCallback((next: DashboardPeriod) => {
    const nextFrom = next === 'custom' ? customFrom : null
    const nextTo = next === 'custom' ? customTo : null

    setPeriodState(next)
    if (next !== 'custom') {
      setCustomFrom(null)
      setCustomTo(null)
    }
    writeUrl(next, compareWith, nextFrom, nextTo)
  }, [compareWith, customFrom, customTo])

  const setCompare = useCallback((next: DashboardCompare) => {
    setCompareWith(next)
    writeUrl(period, next, customFrom, customTo)
  }, [period, customFrom, customTo])

  const setCustomRange = useCallback((from: string, to: string) => {
    setCustomFrom(from)
    setCustomTo(to)
    if (DATE_RE.test(from) && DATE_RE.test(to) && from <= to) {
      setPeriodState('custom')
      writeUrl('custom', compareWith, from, to)
    }
  }, [compareWith])

  const setCustomFromOnly = useCallback((from: string | null) => {
    setPeriodState('custom')
    setCustomFrom(from)
    if (from && customTo && DATE_RE.test(from) && DATE_RE.test(customTo) && from <= customTo) {
      writeUrl('custom', compareWith, from, customTo)
    }
  }, [compareWith, customTo])

  const setCustomToOnly = useCallback((to: string | null) => {
    setPeriodState('custom')
    setCustomTo(to)
    if (customFrom && to && DATE_RE.test(customFrom) && DATE_RE.test(to) && customFrom <= to) {
      writeUrl('custom', compareWith, customFrom, to)
    }
  }, [compareWith, customFrom])

  const reset = useCallback(() => {
    setPeriodState('this_month')
    setCompareWith(null)
    setCustomFrom(null)
    setCustomTo(null)
    writeUrl('this_month', null, null, null)
  }, [])

  const isDefault = period === 'this_month' && compareWith === null

  const resolvedApiParams = useMemo(
    () => toApiParams(period, compareWith, customFrom, customTo),
    [period, compareWith, customFrom, customTo],
  )

  return {
    period,
    compareWith,
    customFrom,
    customTo,
    setPeriod,
    setCompare,
    setCustomRange,
    setCustomFrom: setCustomFromOnly,
    setCustomTo: setCustomToOnly,
    reset,
    isDefault,
    resolvedApiParams,
  }
}
