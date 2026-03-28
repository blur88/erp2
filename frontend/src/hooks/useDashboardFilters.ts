import { useCallback, useMemo, useState } from 'react'
import { subDays, format } from 'date-fns'

export type DashboardPeriod = 'today' | 'last_7_days' | 'this_month' | 'last_month' | 'custom'
export type DashboardCompare = 'previous_period' | 'last_month' | 'last_year' | null
export type PaymentStatusFilter = 'draft' | 'partial_paid' | 'paid'
export interface DashboardResolvedApiParams {
  dateRange?: string
  startDate?: string
  endDate?: string
  groupBy?: string
  compareWith?: string
  customerId?: string
  isFulfilled?: boolean
  paymentStatus?: PaymentStatusFilter
}

const VALID_PERIODS: DashboardPeriod[] = ['today', 'last_7_days', 'this_month', 'last_month', 'custom']
const VALID_COMPARES: NonNullable<DashboardCompare>[] = ['previous_period', 'last_month', 'last_year']
const VALID_PAYMENT_STATUSES: PaymentStatusFilter[] = ['draft', 'partial_paid', 'paid']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function parseUrl(namespace: string): {
  period: DashboardPeriod
  compareWith: DashboardCompare
  customFrom: string | null
  customTo: string | null
  customerId: string | null
  isFulfilled: boolean | null
  paymentStatus: PaymentStatusFilter | null
} {
  const params = new URLSearchParams(window.location.search)
  const rawPeriod = params.get(`${namespace}_period`) ?? 'this_month'
  const rawCompare = params.get(`${namespace}_compare`)
  const rawFrom = params.get(`${namespace}_from`)
  const rawTo = params.get(`${namespace}_to`)
  const rawCustomer = params.get(`${namespace}_customer`) ?? null
  const rawFulfilled = params.get(`${namespace}_fulfilled`)
  const rawPayment = params.get(`${namespace}_payment`)

  const period: DashboardPeriod = VALID_PERIODS.includes(rawPeriod as DashboardPeriod)
    ? (rawPeriod as DashboardPeriod)
    : 'this_month'

  const compareWith: DashboardCompare =
    rawCompare && VALID_COMPARES.includes(rawCompare as NonNullable<DashboardCompare>)
      ? (rawCompare as NonNullable<DashboardCompare>)
      : null

  const customerId = rawCustomer && UUID_RE.test(rawCustomer) ? rawCustomer : null

  const isFulfilled: boolean | null =
    rawFulfilled === 'true' ? true : rawFulfilled === 'false' ? false : null

  const paymentStatus: PaymentStatusFilter | null =
    rawPayment && VALID_PAYMENT_STATUSES.includes(rawPayment as PaymentStatusFilter)
      ? (rawPayment as PaymentStatusFilter)
      : null

  if (period === 'custom') {
    const fromOk = rawFrom && DATE_RE.test(rawFrom)
    const toOk = rawTo && DATE_RE.test(rawTo)
    const rangeOk = fromOk && toOk && rawFrom <= rawTo

    if (!rangeOk) {
      return { period: 'this_month', compareWith, customFrom: null, customTo: null, customerId, isFulfilled, paymentStatus }
    }

    return { period: 'custom', compareWith, customFrom: rawFrom, customTo: rawTo, customerId, isFulfilled, paymentStatus }
  }

  return { period, compareWith, customFrom: null, customTo: null, customerId, isFulfilled, paymentStatus }
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
  namespace: string,
  period: DashboardPeriod,
  compareWith: DashboardCompare,
  customFrom: string | null,
  customTo: string | null,
  customerId: string | null,
  isFulfilled: boolean | null,
  paymentStatus: PaymentStatusFilter | null,
): void {
  const params = new URLSearchParams()
  if (period !== 'this_month') {
    params.set(`${namespace}_period`, period)
  }
  if (compareWith) {
    params.set(`${namespace}_compare`, compareWith)
  }
  if (period === 'custom' && customFrom) {
    params.set(`${namespace}_from`, customFrom)
  }
  if (period === 'custom' && customTo) {
    params.set(`${namespace}_to`, customTo)
  }
  if (customerId) {
    params.set(`${namespace}_customer`, customerId)
  }
  if (isFulfilled !== null) {
    params.set(`${namespace}_fulfilled`, String(isFulfilled))
  }
  if (paymentStatus) {
    params.set(`${namespace}_payment`, paymentStatus)
  }
  const search = params.toString()
  const url = search ? `${window.location.pathname}?${search}` : window.location.pathname
  window.history.replaceState(null, '', url)
}

export function useDashboardFilters(namespace: string) {
  if (process.env.NODE_ENV !== 'production' && namespace === '') {
    console.warn('[useDashboardFilters] namespace must not be an empty string. Use the route path segment (e.g. "sales", "purchasing").')
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial = useMemo(() => parseUrl(namespace), [])
  const [period, setPeriodState] = useState<DashboardPeriod>(initial.period)
  const [compareWith, setCompareWith] = useState<DashboardCompare>(initial.compareWith)
  const [customFrom, setCustomFrom] = useState<string | null>(initial.customFrom)
  const [customTo, setCustomTo] = useState<string | null>(initial.customTo)
  const [customerId, setCustomerIdState] = useState<string | null>(initial.customerId)
  const [isFulfilled, setIsFulfilledState] = useState<boolean | null>(initial.isFulfilled)
  const [paymentStatus, setPaymentStatusState] = useState<PaymentStatusFilter | null>(initial.paymentStatus)

  const setPeriod = useCallback((next: DashboardPeriod) => {
    const nextFrom = next === 'custom' ? customFrom : null
    const nextTo = next === 'custom' ? customTo : null

    setPeriodState(next)
    if (next !== 'custom') {
      setCustomFrom(null)
      setCustomTo(null)
    }
    writeUrl(namespace, next, compareWith, nextFrom, nextTo, customerId, isFulfilled, paymentStatus)
  }, [namespace, compareWith, customFrom, customTo, customerId, isFulfilled, paymentStatus])

  const setCompare = useCallback((next: DashboardCompare) => {
    setCompareWith(next)
    writeUrl(namespace, period, next, customFrom, customTo, customerId, isFulfilled, paymentStatus)
  }, [namespace, period, customFrom, customTo, customerId, isFulfilled, paymentStatus])

  const setCustomRange = useCallback((from: string, to: string) => {
    setCustomFrom(from)
    setCustomTo(to)
    if (DATE_RE.test(from) && DATE_RE.test(to) && from <= to) {
      setPeriodState('custom')
      writeUrl(namespace, 'custom', compareWith, from, to, customerId, isFulfilled, paymentStatus)
    }
  }, [namespace, compareWith, customerId, isFulfilled, paymentStatus])

  const setCustomFromOnly = useCallback((from: string | null) => {
    setPeriodState('custom')
    setCustomFrom(from)
    if (from && customTo && DATE_RE.test(from) && DATE_RE.test(customTo) && from <= customTo) {
      writeUrl(namespace, 'custom', compareWith, from, customTo, customerId, isFulfilled, paymentStatus)
    }
  }, [namespace, compareWith, customTo, customerId, isFulfilled, paymentStatus])

  const setCustomToOnly = useCallback((to: string | null) => {
    setPeriodState('custom')
    setCustomTo(to)
    if (customFrom && to && DATE_RE.test(customFrom) && DATE_RE.test(to) && customFrom <= to) {
      writeUrl(namespace, 'custom', compareWith, customFrom, to, customerId, isFulfilled, paymentStatus)
    }
  }, [namespace, compareWith, customFrom, customerId, isFulfilled, paymentStatus])

  const setCustomerId = useCallback((next: string | null) => {
    setCustomerIdState(next)
    writeUrl(namespace, period, compareWith, customFrom, customTo, next, isFulfilled, paymentStatus)
  }, [namespace, period, compareWith, customFrom, customTo, isFulfilled, paymentStatus])

  const setFulfilled = useCallback((next: boolean | null) => {
    setIsFulfilledState(next)
    writeUrl(namespace, period, compareWith, customFrom, customTo, customerId, next, paymentStatus)
  }, [namespace, period, compareWith, customFrom, customTo, customerId, paymentStatus])

  const setPaymentStatus = useCallback((next: PaymentStatusFilter | null) => {
    setPaymentStatusState(next)
    writeUrl(namespace, period, compareWith, customFrom, customTo, customerId, isFulfilled, next)
  }, [namespace, period, compareWith, customFrom, customTo, customerId, isFulfilled])

  const reset = useCallback(() => {
    setPeriodState('this_month')
    setCompareWith(null)
    setCustomFrom(null)
    setCustomTo(null)
    setCustomerIdState(null)
    setIsFulfilledState(null)
    setPaymentStatusState(null)
    writeUrl(namespace, 'this_month', null, null, null, null, null, null)
  }, [namespace])

  const isDefault = period === 'this_month'
    && compareWith === null
    && customerId === null
    && isFulfilled === null
    && paymentStatus === null

  const resolvedApiParams = useMemo(
    (): DashboardResolvedApiParams => ({
      ...toApiParams(period, compareWith, customFrom, customTo),
      ...(customerId ? { customerId } : {}),
      ...(isFulfilled !== null ? { isFulfilled } : {}),
      ...(paymentStatus ? { paymentStatus } : {}),
    }),
    [period, compareWith, customFrom, customTo, customerId, isFulfilled, paymentStatus],
  )

  return {
    period,
    compareWith,
    customFrom,
    customTo,
    customerId,
    isFulfilled,
    paymentStatus,
    setPeriod,
    setCompare,
    setCustomRange,
    setCustomFrom: setCustomFromOnly,
    setCustomTo: setCustomToOnly,
    setCustomerId,
    setFulfilled,
    setPaymentStatus,
    reset,
    isDefault,
    resolvedApiParams,
  }
}
