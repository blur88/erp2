import { useCallback, useMemo, useState } from 'react'
import { subDays, format } from 'date-fns'

export type DashboardPeriod = 'today' | 'last_7_days' | 'this_month' | 'last_month' | 'custom'
export type DashboardCompare = 'previous_period' | 'last_month' | 'last_year' | null
export type PaymentStatusFilter = 'draft' | 'partial_paid' | 'paid' | 'partial' | 'unpaid'
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
}

const VALID_PERIODS: DashboardPeriod[] = ['today', 'last_7_days', 'this_month', 'last_month', 'custom']
const VALID_COMPARES: NonNullable<DashboardCompare>[] = ['previous_period', 'last_month', 'last_year']
const VALID_PAYMENT_STATUSES: PaymentStatusFilter[] = ['draft', 'partial_paid', 'paid', 'partial', 'unpaid']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function parseUrl(namespace: string): {
  period: DashboardPeriod
  compareWith: DashboardCompare
  customFrom: string | null
  customTo: string | null
  customerId: string | null
  supplierId: string | null
  isFulfilled: boolean | null
  status: string | null
  paymentStatus: PaymentStatusFilter | null
} {
  const params = new URLSearchParams(window.location.search)
  const rawPeriod = params.get(`${namespace}_period`) ?? 'this_month'
  const rawCompare = params.get(`${namespace}_compare`)
  const rawFrom = params.get(`${namespace}_from`)
  const rawTo = params.get(`${namespace}_to`)
  const rawCustomer = params.get(`${namespace}_customer`) ?? null
  const rawSupplier = params.get(`${namespace}_supplier`) ?? null
  const rawFulfilled = params.get(`${namespace}_fulfilled`)
  const rawStatus = params.get(`${namespace}_status`) ?? null
  const rawPayment = params.get(`${namespace}_payment`)

  const period: DashboardPeriod = VALID_PERIODS.includes(rawPeriod as DashboardPeriod)
    ? (rawPeriod as DashboardPeriod)
    : 'this_month'

  const compareWith: DashboardCompare =
    rawCompare && VALID_COMPARES.includes(rawCompare as NonNullable<DashboardCompare>)
      ? (rawCompare as NonNullable<DashboardCompare>)
      : null

  const customerId = rawCustomer && UUID_RE.test(rawCustomer) ? rawCustomer : null
  const supplierId = rawSupplier && UUID_RE.test(rawSupplier) ? rawSupplier : null

  const isFulfilled: boolean | null =
    rawFulfilled === 'true' ? true : rawFulfilled === 'false' ? false : null

  const status: string | null = rawStatus

  const paymentStatus: PaymentStatusFilter | null =
    rawPayment && VALID_PAYMENT_STATUSES.includes(rawPayment as PaymentStatusFilter)
      ? (rawPayment as PaymentStatusFilter)
      : null

  if (period === 'custom') {
    const fromOk = rawFrom && DATE_RE.test(rawFrom)
    const toOk = rawTo && DATE_RE.test(rawTo)
    const rangeOk = fromOk && toOk && rawFrom <= rawTo

    if (!rangeOk) {
      return {
        period: 'this_month',
        compareWith,
        customFrom: null,
        customTo: null,
        customerId,
        supplierId,
        isFulfilled,
        status,
        paymentStatus,
      }
    }

    return {
      period: 'custom',
      compareWith,
      customFrom: rawFrom,
      customTo: rawTo,
      customerId,
      supplierId,
      isFulfilled,
      status,
      paymentStatus,
    }
  }

  return {
    period,
    compareWith,
    customFrom: null,
    customTo: null,
    customerId,
    supplierId,
    isFulfilled,
    status,
    paymentStatus,
  }
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
  supplierId: string | null,
  isFulfilled: boolean | null,
  status: string | null,
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
  if (supplierId) {
    params.set(`${namespace}_supplier`, supplierId)
  }
  if (isFulfilled !== null) {
    params.set(`${namespace}_fulfilled`, String(isFulfilled))
  }
  if (status !== null) {
    params.set(`${namespace}_status`, status)
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
  const [supplierId, setSupplierIdState] = useState<string | null>(initial.supplierId)
  const [isFulfilled, setIsFulfilledState] = useState<boolean | null>(initial.isFulfilled)
  const [status, setStatusState] = useState<string | null>(initial.status)
  const [paymentStatus, setPaymentStatusState] = useState<PaymentStatusFilter | null>(initial.paymentStatus)

  const setPeriod = useCallback((next: DashboardPeriod) => {
    setPeriodState(next)
    let nextFrom = customFrom
    let nextTo = customTo
    if (next !== 'custom') {
      setCustomFrom(null)
      setCustomTo(null)
      nextFrom = null
      nextTo = null
    }
    writeUrl(namespace, next, compareWith, nextFrom, nextTo, customerId, supplierId, isFulfilled, status, paymentStatus)
  }, [namespace, compareWith, customFrom, customTo, customerId, supplierId, isFulfilled, status, paymentStatus])

  const setCompare = useCallback((next: DashboardCompare) => {
    setCompareWith(next)
    writeUrl(namespace, period, next, customFrom, customTo, customerId, supplierId, isFulfilled, status, paymentStatus)
  }, [namespace, period, customFrom, customTo, customerId, supplierId, isFulfilled, status, paymentStatus])

  const setCustomRange = useCallback((from: string, to: string) => {
    setCustomFrom(from)
    setCustomTo(to)
    if (DATE_RE.test(from) && DATE_RE.test(to) && from <= to) {
      setPeriodState('custom')
      writeUrl(namespace, 'custom', compareWith, from, to, customerId, supplierId, isFulfilled, status, paymentStatus)
    }
  }, [namespace, compareWith, customerId, supplierId, isFulfilled, status, paymentStatus])

  const setCustomFromOnly = useCallback((from: string | null) => {
    setPeriodState('custom')
    setCustomFrom(from)
    if (from && customTo && DATE_RE.test(from) && DATE_RE.test(customTo) && from <= customTo) {
      writeUrl(namespace, 'custom', compareWith, from, customTo, customerId, supplierId, isFulfilled, status, paymentStatus)
    }
  }, [namespace, compareWith, customTo, customerId, supplierId, isFulfilled, status, paymentStatus])

  const setCustomToOnly = useCallback((to: string | null) => {
    setPeriodState('custom')
    setCustomTo(to)
    if (customFrom && to && DATE_RE.test(customFrom) && DATE_RE.test(to) && customFrom <= to) {
      writeUrl(namespace, 'custom', compareWith, customFrom, to, customerId, supplierId, isFulfilled, status, paymentStatus)
    }
  }, [namespace, compareWith, customFrom, customerId, supplierId, isFulfilled, status, paymentStatus])

  const setCustomerId = useCallback((next: string | null) => {
    setCustomerIdState(next)
    writeUrl(namespace, period, compareWith, customFrom, customTo, next, supplierId, isFulfilled, status, paymentStatus)
  }, [namespace, period, compareWith, customFrom, customTo, supplierId, isFulfilled, status, paymentStatus])

  const setSupplierId = useCallback((next: string | null) => {
    setSupplierIdState(next)
    writeUrl(namespace, period, compareWith, customFrom, customTo, customerId, next, isFulfilled, status, paymentStatus)
  }, [namespace, period, compareWith, customFrom, customTo, customerId, isFulfilled, status, paymentStatus])

  const setFulfilled = useCallback((next: boolean | null) => {
    setIsFulfilledState(next)
    writeUrl(namespace, period, compareWith, customFrom, customTo, customerId, supplierId, next, status, paymentStatus)
  }, [namespace, period, compareWith, customFrom, customTo, customerId, supplierId, status, paymentStatus])

  const setStatus = useCallback((next: string | null) => {
    setStatusState(next)
    writeUrl(namespace, period, compareWith, customFrom, customTo, customerId, supplierId, isFulfilled, next, paymentStatus)
  }, [namespace, period, compareWith, customFrom, customTo, customerId, supplierId, isFulfilled, paymentStatus])

  const setPaymentStatus = useCallback((next: PaymentStatusFilter | null) => {
    setPaymentStatusState(next)
    writeUrl(namespace, period, compareWith, customFrom, customTo, customerId, supplierId, isFulfilled, status, next)
  }, [namespace, period, compareWith, customFrom, customTo, customerId, supplierId, isFulfilled, status])

  const reset = useCallback(() => {
    setPeriodState('this_month')
    setCompareWith(null)
    setCustomFrom(null)
    setCustomTo(null)
    setCustomerIdState(null)
    setSupplierIdState(null)
    setIsFulfilledState(null)
    setStatusState(null)
    setPaymentStatusState(null)
    writeUrl(namespace, 'this_month', null, null, null, null, null, null, null, null)
  }, [namespace])

  const isDefault = period === 'this_month'
    && compareWith === null
    && customerId === null
    && supplierId === null
    && isFulfilled === null
    && status === null
    && paymentStatus === null

  const resolvedApiParams = useMemo(
    (): DashboardResolvedApiParams => ({
      ...toApiParams(period, compareWith, customFrom, customTo),
      ...(customerId ? { customerId } : {}),
      ...(supplierId ? { supplierId } : {}),
      ...(isFulfilled !== null ? { isFulfilled } : {}),
      ...(status !== null ? { status } : {}),
      ...(paymentStatus ? { paymentStatus } : {}),
    }),
    [period, compareWith, customFrom, customTo, customerId, supplierId, isFulfilled, status, paymentStatus],
  )

  return {
    period,
    compareWith,
    customFrom,
    customTo,
    customerId,
    supplierId,
    isFulfilled,
    status,
    paymentStatus,
    setPeriod,
    setCompare,
    setCustomRange,
    setCustomFrom: setCustomFromOnly,
    setCustomTo: setCustomToOnly,
    setCustomerId,
    setSupplierId,
    setFulfilled,
    setStatus,
    setPaymentStatus,
    reset,
    isDefault,
    resolvedApiParams,
  }
}
