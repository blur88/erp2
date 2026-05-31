import {
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
  subYears,
} from 'date-fns'

import { PERIOD_KEYS, type PeriodKey } from '@/constants/periods'

const FMT = 'yyyy-MM-dd'

export function getStartOfWeek(): 0 | 1 {
  const raw = localStorage.getItem('startOfWeek')
  return raw === '0' ? 0 : 1
}

export function getPeriodDateRange(
  key: PeriodKey,
  weekStartsOn: 0 | 1 = 1,
): { from: string; to: string } {
  const now = new Date()

  switch (key) {
    case 'today': {
      const d = format(now, FMT)
      return { from: d, to: d }
    }
    case 'yesterday': {
      const d = format(subDays(now, 1), FMT)
      return { from: d, to: d }
    }
    case 'last_7_days':
      return { from: format(subDays(now, 6), FMT), to: format(now, FMT) }
    // Ranges are inclusive: "last N days" = today + (N-1) prior days = N days total.
    // So all three use subDays(N-1): last_7_days→6, last_30_days→29, last_365_days→364.
    case 'last_30_days':
      return { from: format(subDays(now, 29), FMT), to: format(now, FMT) }
    case 'last_365_days':
      return { from: format(subDays(now, 364), FMT), to: format(now, FMT) }
    case 'this_week':
      return {
        from: format(startOfWeek(now, { weekStartsOn }), FMT),
        to: format(endOfWeek(now, { weekStartsOn }), FMT),
      }
    case 'last_week': {
      const lastWeek = subDays(startOfWeek(now, { weekStartsOn }), 1)
      return {
        from: format(startOfWeek(lastWeek, { weekStartsOn }), FMT),
        to: format(endOfWeek(lastWeek, { weekStartsOn }), FMT),
      }
    }
    case 'this_month':
      return {
        from: format(startOfMonth(now), FMT),
        to: format(endOfMonth(now), FMT),
      }
    case 'last_month': {
      const lastMonth = subMonths(now, 1)
      return {
        from: format(startOfMonth(lastMonth), FMT),
        to: format(endOfMonth(lastMonth), FMT),
      }
    }
    case 'this_year':
      return {
        from: format(startOfYear(now), FMT),
        to: format(endOfYear(now), FMT),
      }
    case 'last_year': {
      const lastYear = subYears(now, 1)
      return {
        from: format(startOfYear(lastYear), FMT),
        to: format(endOfYear(lastYear), FMT),
      }
    }
    default:
      return {
        from: format(startOfMonth(now), FMT),
        to: format(endOfMonth(now), FMT),
      }
  }
}

export function inferPeriodKey(
  from: string,
  to: string,
  weekStartsOn: 0 | 1 = 1,
): PeriodKey {
  for (const key of PERIOD_KEYS) {
    if (key === 'custom') {
      continue
    }

    const range = getPeriodDateRange(key, weekStartsOn)
    if (range.from === from && range.to === to) {
      return key
    }
  }

  return 'custom'
}
