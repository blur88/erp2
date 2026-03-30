# Period Filter & Start of Week Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize all period/date-range filter logic into shared constants and utilities, add a `FilterPeriod` component consumed by `DashboardFilterBar`, and add a `startOfWeek` setting to Regional Settings so week-based ranges are calculated consistently everywhere.

**Architecture:** New `constants/periods.ts` and `utils/dateRange.ts` form the single source of truth for period keys, labels, and date math. `FilterPeriod.tsx` is a standalone controlled component wrapping the MUI Select + DatePickers. `useDashboardFilters` delegates to `getPeriodDateRange` instead of its own switch-case. Backend adds one integer column to `regional_settings`.

**Tech Stack:** NestJS 11 (backend), TypeORM + PostgreSQL (DB), React 19 + MUI v7 (frontend), date-fns (date math), Vitest (frontend tests), Jest (backend tests), class-validator (DTO validation).

---

## File Map

| File | Action |
|------|--------|
| `frontend/src/constants/periods.ts` | Create |
| `frontend/src/utils/dateRange.ts` | Create |
| `frontend/src/utils/dateRange.test.ts` | Create |
| `frontend/src/components/filters/FilterPeriod.tsx` | Create |
| `frontend/src/hooks/useDashboardFilters.ts` | Modify |
| `frontend/src/hooks/useDashboardFilters.test.ts` | Modify |
| `frontend/src/components/filters/DashboardFilterBar.tsx` | Modify |
| `frontend/src/components/filters/__tests__/DashboardFilterBar.test.tsx` | Modify |
| `frontend/src/pages/settings/RegionalSettingsPage.tsx` | Modify |
| `backend/src/database/entities/regional-settings.entity.ts` | Modify |
| `backend/src/modules/settings/dto/update-regional-settings.dto.ts` | Modify |
| `backend/src/modules/settings/dto/regional-settings-response.dto.ts` | Modify |
| `backend/src/modules/settings/dto/update-regional-settings.dto.spec.ts` | Modify |
| `backend/src/modules/settings/settings.controller.spec.ts` | Modify |
| `backend/src/database/migrations/1774864899422-AddStartOfWeekToRegionalSettings.ts` | Create |

---

## Task 1: Period constants

**Files:**
- Create: `frontend/src/constants/periods.ts`

- [ ] **Step 1: Create the file**

```ts
// frontend/src/constants/periods.ts
export const PERIOD_KEYS = [
  'today',
  'yesterday',
  'this_week',
  'last_week',
  'this_month',
  'last_month',
  'this_year',
  'last_year',
  'last_7_days',
  'last_30_days',
  'last_365_days',
  'custom',
] as const

export type PeriodKey = typeof PERIOD_KEYS[number]

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  this_week: 'This Week',
  last_week: 'Last Week',
  this_month: 'This Month',
  last_month: 'Last Month',
  this_year: 'This Year',
  last_year: 'Last Year',
  last_7_days: 'Last 7 Days',
  last_30_days: 'Last 30 Days',
  last_365_days: 'Last 365 Days',
  custom: 'Custom Range',
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/constants/periods.ts
git commit -m "feat(periods): add period constants and PeriodKey type"
```

---

## Task 2: Date range utilities (TDD)

**Files:**
- Create: `frontend/src/utils/dateRange.ts`
- Create: `frontend/src/utils/dateRange.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/src/utils/dateRange.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getPeriodDateRange, inferPeriodKey, getStartOfWeek } from './dateRange'

// Pin "today" to 2026-03-30 (Monday) for deterministic tests
const FIXED_NOW = new Date('2026-03-30T12:00:00.000Z')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_NOW)
  localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('getStartOfWeek', () => {
  it('returns 1 (Monday) when localStorage has no value', () => {
    expect(getStartOfWeek()).toBe(1)
  })

  it('returns 0 (Sunday) when localStorage has "0"', () => {
    localStorage.setItem('startOfWeek', '0')
    expect(getStartOfWeek()).toBe(0)
  })

  it('returns 1 (Monday) when localStorage has "1"', () => {
    localStorage.setItem('startOfWeek', '1')
    expect(getStartOfWeek()).toBe(1)
  })
})

describe('getPeriodDateRange', () => {
  it('today returns from=today and to=today', () => {
    const { from, to } = getPeriodDateRange('today')
    expect(from).toBe('2026-03-30')
    expect(to).toBe('2026-03-30')
  })

  it('yesterday returns from=yesterday and to=yesterday', () => {
    const { from, to } = getPeriodDateRange('yesterday')
    expect(from).toBe('2026-03-29')
    expect(to).toBe('2026-03-29')
  })

  it('last_7_days returns from=7 days ago and to=today', () => {
    const { from, to } = getPeriodDateRange('last_7_days')
    expect(from).toBe('2026-03-24')
    expect(to).toBe('2026-03-30')
  })

  it('last_30_days returns from=30 days ago and to=today', () => {
    const { from, to } = getPeriodDateRange('last_30_days')
    expect(from).toBe('2026-02-28')
    expect(to).toBe('2026-03-30')
  })

  it('last_365_days returns from=365 days ago and to=today', () => {
    const { from, to } = getPeriodDateRange('last_365_days')
    expect(from).toBe('2025-03-30')
    expect(to).toBe('2026-03-30')
  })

  it('this_month returns from=first of month and to=last of month', () => {
    const { from, to } = getPeriodDateRange('this_month')
    expect(from).toBe('2026-03-01')
    expect(to).toBe('2026-03-31')
  })

  it('last_month returns from=first of last month and to=last of last month', () => {
    const { from, to } = getPeriodDateRange('last_month')
    expect(from).toBe('2026-02-01')
    expect(to).toBe('2026-02-28')
  })

  it('this_year returns from=Jan 1 and to=Dec 31 of current year', () => {
    const { from, to } = getPeriodDateRange('this_year')
    expect(from).toBe('2026-01-01')
    expect(to).toBe('2026-12-31')
  })

  it('last_year returns from=Jan 1 and to=Dec 31 of previous year', () => {
    const { from, to } = getPeriodDateRange('last_year')
    expect(from).toBe('2025-01-01')
    expect(to).toBe('2025-12-31')
  })

  it('this_week with weekStartsOn=1 (Mon): 2026-03-30 is Monday so from=2026-03-30', () => {
    // 2026-03-30 is a Monday → week starts today
    const { from, to } = getPeriodDateRange('this_week', 1)
    expect(from).toBe('2026-03-30')
    expect(to).toBe('2026-04-05')
  })

  it('this_week with weekStartsOn=0 (Sun): week started yesterday (2026-03-29)', () => {
    const { from, to } = getPeriodDateRange('this_week', 0)
    expect(from).toBe('2026-03-29')
    expect(to).toBe('2026-04-04')
  })

  it('last_week with weekStartsOn=1 (Mon): previous Mon-Sun', () => {
    const { from, to } = getPeriodDateRange('last_week', 1)
    expect(from).toBe('2026-03-23')
    expect(to).toBe('2026-03-29')
  })

  it('last_week with weekStartsOn=0 (Sun): previous Sun-Sat', () => {
    const { from, to } = getPeriodDateRange('last_week', 0)
    expect(from).toBe('2026-03-22')
    expect(to).toBe('2026-03-28')
  })
})

describe('inferPeriodKey', () => {
  it('infers today', () => {
    expect(inferPeriodKey('2026-03-30', '2026-03-30')).toBe('today')
  })

  it('infers yesterday', () => {
    expect(inferPeriodKey('2026-03-29', '2026-03-29')).toBe('yesterday')
  })

  it('infers this_month', () => {
    expect(inferPeriodKey('2026-03-01', '2026-03-31')).toBe('this_month')
  })

  it('infers last_month', () => {
    expect(inferPeriodKey('2026-02-01', '2026-02-28')).toBe('last_month')
  })

  it('infers this_year', () => {
    expect(inferPeriodKey('2026-01-01', '2026-12-31')).toBe('this_year')
  })

  it('infers last_year', () => {
    expect(inferPeriodKey('2025-01-01', '2025-12-31')).toBe('last_year')
  })

  it('infers last_7_days', () => {
    expect(inferPeriodKey('2026-03-24', '2026-03-30')).toBe('last_7_days')
  })

  it('infers last_30_days', () => {
    expect(inferPeriodKey('2026-02-28', '2026-03-30')).toBe('last_30_days')
  })

  it('falls back to custom for an arbitrary range', () => {
    expect(inferPeriodKey('2026-01-15', '2026-02-10')).toBe('custom')
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd frontend && npx vitest run src/utils/dateRange.test.ts --no-coverage
```

Expected: FAIL — "Cannot find module './dateRange'"

- [ ] **Step 3: Implement the utilities**

```ts
// frontend/src/utils/dateRange.ts
import {
  format,
  subDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  subMonths,
  subYears,
} from 'date-fns'
import type { PeriodKey } from '@/constants/periods'
import { PERIOD_KEYS } from '@/constants/periods'

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
      const lm = subMonths(now, 1)
      return {
        from: format(startOfMonth(lm), FMT),
        to: format(endOfMonth(lm), FMT),
      }
    }
    case 'this_year':
      return {
        from: format(startOfYear(now), FMT),
        to: format(endOfYear(now), FMT),
      }
    case 'last_year': {
      const ly = subYears(now, 1)
      return {
        from: format(startOfYear(ly), FMT),
        to: format(endOfYear(ly), FMT),
      }
    }
    default:
      // 'custom' — callers must not call getPeriodDateRange with 'custom'
      return { from: format(startOfMonth(now), FMT), to: format(endOfMonth(now), FMT) }
  }
}

export function inferPeriodKey(
  from: string,
  to: string,
  weekStartsOn: 0 | 1 = 1,
): PeriodKey {
  for (const key of PERIOD_KEYS) {
    if (key === 'custom') continue
    const range = getPeriodDateRange(key, weekStartsOn)
    if (range.from === from && range.to === to) return key
  }
  return 'custom'
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd frontend && npx vitest run src/utils/dateRange.test.ts --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/dateRange.ts frontend/src/utils/dateRange.test.ts
git commit -m "feat(dateRange): add getPeriodDateRange, inferPeriodKey, getStartOfWeek utilities"
```

---

## Task 3: FilterPeriod component

**Files:**
- Create: `frontend/src/components/filters/FilterPeriod.tsx`

- [ ] **Step 1: Create the component**

```tsx
// frontend/src/components/filters/FilterPeriod.tsx
import { useState } from 'react'
import { FormControl, InputLabel, MenuItem, Select, Stack } from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers'
import { format, parseISO } from 'date-fns'
import { toMuiDatePickerFormat } from '@/utils/formatters'
import { PERIOD_KEYS, PERIOD_LABELS } from '@/constants/periods'
import type { PeriodKey } from '@/constants/periods'

interface FilterPeriodProps {
  value: PeriodKey
  customFrom: string | null
  customTo: string | null
  onChange: (key: PeriodKey, from?: string, to?: string) => void
}

export function FilterPeriod({ value, customFrom, customTo, onChange }: FilterPeriodProps) {
  const [internalFrom, setInternalFrom] = useState<string | null>(customFrom)
  const [internalTo, setInternalTo] = useState<string | null>(customTo)
  const pickerFormat = toMuiDatePickerFormat(localStorage.getItem('dateFormat') || 'DD/MM/YYYY')

  const handleKeyChange = (key: PeriodKey) => {
    if (key !== 'custom') {
      setInternalFrom(null)
      setInternalTo(null)
      onChange(key)
    } else {
      onChange('custom')
    }
  }

  const handleFromChange = (newFrom: string | null) => {
    setInternalFrom(newFrom)
    if (newFrom && internalTo && newFrom <= internalTo) {
      onChange('custom', newFrom, internalTo)
    }
  }

  const handleToChange = (newTo: string | null) => {
    setInternalTo(newTo)
    if (internalFrom && newTo && internalFrom <= newTo) {
      onChange('custom', internalFrom, newTo)
    }
  }

  return (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
      <FormControl size="small" sx={{ minWidth: 150 }}>
        <InputLabel>Period</InputLabel>
        <Select
          value={value}
          label="Period"
          onChange={(e) => handleKeyChange(e.target.value as PeriodKey)}
        >
          {PERIOD_KEYS.map((key) => (
            <MenuItem key={key} value={key}>
              {PERIOD_LABELS[key]}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {value === 'custom' && (
        <>
          <DatePicker
            label="From"
            value={internalFrom ? parseISO(internalFrom) : null}
            format={pickerFormat}
            onChange={(date) => {
              handleFromChange(date ? format(date, 'yyyy-MM-dd') : null)
            }}
            slotProps={{ textField: { size: 'small' } }}
          />
          <DatePicker
            label="To"
            value={internalTo ? parseISO(internalTo) : null}
            format={pickerFormat}
            onChange={(date) => {
              handleToChange(date ? format(date, 'yyyy-MM-dd') : null)
            }}
            slotProps={{ textField: { size: 'small' } }}
          />
        </>
      )}
    </Stack>
  )
}
```

- [ ] **Step 2: Export from filters index**

Open `frontend/src/components/filters/index.ts` and add:
```ts
export { FilterPeriod } from './FilterPeriod'
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/filters/FilterPeriod.tsx frontend/src/components/filters/index.ts
git commit -m "feat(FilterPeriod): add standalone period filter component"
```

---

## Task 4: Refactor useDashboardFilters

**Files:**
- Modify: `frontend/src/hooks/useDashboardFilters.ts`
- Modify: `frontend/src/hooks/useDashboardFilters.test.ts`

- [ ] **Step 1: Update the failing tests first**

Add these tests to `frontend/src/hooks/useDashboardFilters.test.ts` inside the main `describe('useDashboardFilters', ...)` block, after the existing tests:

```ts
it('accepts yesterday as a valid period from URL', () => {
  setUrl('?sales_period=yesterday')
  const { result } = renderHook(() => useDashboardFilters('sales'))
  expect(result.current.period).toBe('yesterday')
})

it('accepts this_week as a valid period from URL', () => {
  setUrl('?sales_period=this_week')
  const { result } = renderHook(() => useDashboardFilters('sales'))
  expect(result.current.period).toBe('this_week')
})

it('accepts last_week as a valid period from URL', () => {
  setUrl('?sales_period=last_week')
  const { result } = renderHook(() => useDashboardFilters('sales'))
  expect(result.current.period).toBe('last_week')
})

it('accepts this_year as a valid period from URL', () => {
  setUrl('?sales_period=this_year')
  const { result } = renderHook(() => useDashboardFilters('sales'))
  expect(result.current.period).toBe('this_year')
})

it('accepts last_year as a valid period from URL', () => {
  setUrl('?sales_period=last_year')
  const { result } = renderHook(() => useDashboardFilters('sales'))
  expect(result.current.period).toBe('last_year')
})

it('accepts last_30_days as a valid period from URL', () => {
  setUrl('?sales_period=last_30_days')
  const { result } = renderHook(() => useDashboardFilters('sales'))
  expect(result.current.period).toBe('last_30_days')
})

it('accepts last_365_days as a valid period from URL', () => {
  setUrl('?sales_period=last_365_days')
  const { result } = renderHook(() => useDashboardFilters('sales'))
  expect(result.current.period).toBe('last_365_days')
})

it('resolvedApiParams maps yesterday to explicit startDate/endDate', () => {
  setUrl('?sales_period=yesterday')
  const { result } = renderHook(() => useDashboardFilters('sales'))
  expect(result.current.resolvedApiParams.startDate).toBeDefined()
  expect(result.current.resolvedApiParams.endDate).toBeDefined()
  expect(result.current.resolvedApiParams.startDate).toBe(result.current.resolvedApiParams.endDate)
})

it('resolvedApiParams maps this_week to explicit startDate/endDate', () => {
  setUrl('?sales_period=this_week')
  const { result } = renderHook(() => useDashboardFilters('sales'))
  expect(result.current.resolvedApiParams.startDate).toBeDefined()
  expect(result.current.resolvedApiParams.endDate).toBeDefined()
  expect(result.current.resolvedApiParams.groupBy).toBe('day')
})
```

- [ ] **Step 2: Run new tests — expect FAIL**

```bash
cd frontend && npx vitest run src/hooks/useDashboardFilters.test.ts --no-coverage
```

Expected: new tests FAIL — new period keys not yet accepted as valid.

- [ ] **Step 3: Refactor useDashboardFilters.ts**

Replace the full contents of `frontend/src/hooks/useDashboardFilters.ts`:

```ts
import { useCallback, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { PERIOD_KEYS, type PeriodKey } from '@/constants/periods'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'

export type DashboardPeriod = PeriodKey
export type DashboardCompare = 'previous_period' | 'last_month' | 'last_year' | null
export type PaymentStatusFilter = 'draft' | 'partial_paid' | 'paid' | 'partial' | 'unpaid'
export type StockStatusFilter = 'in_stock' | 'low_stock' | 'out_of_stock'
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

const VALID_COMPARES: NonNullable<DashboardCompare>[] = ['previous_period', 'last_month', 'last_year']
const VALID_PAYMENT_STATUSES: PaymentStatusFilter[] = ['draft', 'partial_paid', 'paid', 'partial', 'unpaid']
const VALID_STOCK_STATUSES: StockStatusFilter[] = ['in_stock', 'low_stock', 'out_of_stock']
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
  categoryId: string | null
  stockStatus: StockStatusFilter | null
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
  const rawCategory = params.get(`${namespace}_category`) ?? null
  const rawStockStatus = params.get(`${namespace}_stock_status`) ?? null

  const period: DashboardPeriod = (PERIOD_KEYS as readonly string[]).includes(rawPeriod)
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
  const categoryId = rawCategory && UUID_RE.test(rawCategory) ? rawCategory : null
  const stockStatus: StockStatusFilter | null =
    rawStockStatus && VALID_STOCK_STATUSES.includes(rawStockStatus as StockStatusFilter)
      ? (rawStockStatus as StockStatusFilter)
      : null

  if (period === 'custom') {
    const fromOk = rawFrom && DATE_RE.test(rawFrom)
    const toOk = rawTo && DATE_RE.test(rawTo)
    const rangeOk = fromOk && toOk && rawFrom <= rawTo

    if (!rangeOk) {
      return { period: 'this_month', compareWith, customFrom: null, customTo: null, customerId, supplierId, isFulfilled, status, paymentStatus, categoryId, stockStatus }
    }
    return { period: 'custom', compareWith, customFrom: rawFrom, customTo: rawTo, customerId, supplierId, isFulfilled, status, paymentStatus, categoryId, stockStatus }
  }

  return { period, compareWith, customFrom: null, customTo: null, customerId, supplierId, isFulfilled, status, paymentStatus, categoryId, stockStatus }
}

function groupByForRange(from: string, to: string): string {
  const days = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1
  if (days <= 31) return 'day'
  if (days <= 90) return 'week'
  return 'month'
}

function toApiParams(
  period: DashboardPeriod,
  compareWith: DashboardCompare,
  customFrom: string | null,
  customTo: string | null,
): Record<string, string | undefined> {
  const compareParam = compareWith ?? undefined

  if (period === 'custom') {
    if (customFrom && customTo) {
      return {
        startDate: customFrom,
        endDate: customTo,
        groupBy: groupByForRange(customFrom, customTo),
        compareWith: compareParam,
      }
    }
    return { dateRange: 'this_month', groupBy: 'day', compareWith: compareParam }
  }

  // Periods that the backend understands natively as dateRange shortcuts
  if (period === 'this_month' || period === 'last_month') {
    return { dateRange: period, groupBy: 'day', compareWith: compareParam }
  }

  // All other presets — resolve to explicit startDate/endDate
  const { from, to } = getPeriodDateRange(period, getStartOfWeek())
  return {
    startDate: from,
    endDate: to,
    groupBy: groupByForRange(from, to),
    compareWith: compareParam,
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
  categoryId: string | null,
  stockStatus: StockStatusFilter | null,
): void {
  const params = new URLSearchParams()
  if (period !== 'this_month') params.set(`${namespace}_period`, period)
  if (compareWith) params.set(`${namespace}_compare`, compareWith)
  if (period === 'custom' && customFrom) params.set(`${namespace}_from`, customFrom)
  if (period === 'custom' && customTo) params.set(`${namespace}_to`, customTo)
  if (customerId) params.set(`${namespace}_customer`, customerId)
  if (supplierId) params.set(`${namespace}_supplier`, supplierId)
  if (isFulfilled !== null) params.set(`${namespace}_fulfilled`, String(isFulfilled))
  if (status !== null) params.set(`${namespace}_status`, status)
  if (paymentStatus) params.set(`${namespace}_payment`, paymentStatus)
  if (categoryId) params.set(`${namespace}_category`, categoryId)
  if (stockStatus) params.set(`${namespace}_stock_status`, stockStatus)
  const search = params.toString()
  const url = search ? `${window.location.pathname}?${search}` : window.location.pathname
  window.history.replaceState(null, '', url)
}

export function useDashboardFilters(namespace: string) {
  if (process.env.NODE_ENV !== 'production' && namespace === '') {
    console.warn('[useDashboardFilters] namespace must not be an empty string.')
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
  const [categoryId, setCategoryIdState] = useState<string | null>(initial.categoryId)
  const [stockStatus, setStockStatusState] = useState<StockStatusFilter | null>(initial.stockStatus)

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
    writeUrl(namespace, next, compareWith, nextFrom, nextTo, customerId, supplierId, isFulfilled, status, paymentStatus, categoryId, stockStatus)
  }, [namespace, compareWith, customFrom, customTo, customerId, supplierId, isFulfilled, status, paymentStatus, categoryId, stockStatus])

  const setCompare = useCallback((next: DashboardCompare) => {
    setCompareWith(next)
    writeUrl(namespace, period, next, customFrom, customTo, customerId, supplierId, isFulfilled, status, paymentStatus, categoryId, stockStatus)
  }, [namespace, period, customFrom, customTo, customerId, supplierId, isFulfilled, status, paymentStatus, categoryId, stockStatus])

  const setCustomRange = useCallback((from: string, to: string) => {
    setCustomFrom(from)
    setCustomTo(to)
    if (DATE_RE.test(from) && DATE_RE.test(to) && from <= to) {
      setPeriodState('custom')
      writeUrl(namespace, 'custom', compareWith, from, to, customerId, supplierId, isFulfilled, status, paymentStatus, categoryId, stockStatus)
    }
  }, [namespace, compareWith, customerId, supplierId, isFulfilled, status, paymentStatus, categoryId, stockStatus])

  const setCustomFromOnly = useCallback((from: string | null) => {
    setPeriodState('custom')
    setCustomFrom(from)
    if (from && customTo && DATE_RE.test(from) && DATE_RE.test(customTo) && from <= customTo) {
      writeUrl(namespace, 'custom', compareWith, from, customTo, customerId, supplierId, isFulfilled, status, paymentStatus, categoryId, stockStatus)
    }
  }, [namespace, compareWith, customTo, customerId, supplierId, isFulfilled, status, paymentStatus, categoryId, stockStatus])

  const setCustomToOnly = useCallback((to: string | null) => {
    setPeriodState('custom')
    setCustomTo(to)
    if (customFrom && to && DATE_RE.test(customFrom) && DATE_RE.test(to) && customFrom <= to) {
      writeUrl(namespace, 'custom', compareWith, customFrom, to, customerId, supplierId, isFulfilled, status, paymentStatus, categoryId, stockStatus)
    }
  }, [namespace, compareWith, customFrom, customerId, supplierId, isFulfilled, status, paymentStatus, categoryId, stockStatus])

  const setCustomerId = useCallback((next: string | null) => {
    setCustomerIdState(next)
    writeUrl(namespace, period, compareWith, customFrom, customTo, next, supplierId, isFulfilled, status, paymentStatus, categoryId, stockStatus)
  }, [namespace, period, compareWith, customFrom, customTo, supplierId, isFulfilled, status, paymentStatus, categoryId, stockStatus])

  const setSupplierId = useCallback((next: string | null) => {
    setSupplierIdState(next)
    writeUrl(namespace, period, compareWith, customFrom, customTo, customerId, next, isFulfilled, status, paymentStatus, categoryId, stockStatus)
  }, [namespace, period, compareWith, customFrom, customTo, customerId, isFulfilled, status, paymentStatus, categoryId, stockStatus])

  const setFulfilled = useCallback((next: boolean | null) => {
    setIsFulfilledState(next)
    writeUrl(namespace, period, compareWith, customFrom, customTo, customerId, supplierId, next, status, paymentStatus, categoryId, stockStatus)
  }, [namespace, period, compareWith, customFrom, customTo, customerId, supplierId, status, paymentStatus, categoryId, stockStatus])

  const setStatus = useCallback((next: string | null) => {
    setStatusState(next)
    writeUrl(namespace, period, compareWith, customFrom, customTo, customerId, supplierId, isFulfilled, next, paymentStatus, categoryId, stockStatus)
  }, [namespace, period, compareWith, customFrom, customTo, customerId, supplierId, isFulfilled, paymentStatus, categoryId, stockStatus])

  const setPaymentStatus = useCallback((next: PaymentStatusFilter | null) => {
    setPaymentStatusState(next)
    writeUrl(namespace, period, compareWith, customFrom, customTo, customerId, supplierId, isFulfilled, status, next, categoryId, stockStatus)
  }, [namespace, period, compareWith, customFrom, customTo, customerId, supplierId, isFulfilled, status, categoryId, stockStatus])

  const setCategoryId = useCallback((next: string | null) => {
    setCategoryIdState(next)
    writeUrl(namespace, period, compareWith, customFrom, customTo, customerId, supplierId, isFulfilled, status, paymentStatus, next, stockStatus)
  }, [namespace, period, compareWith, customFrom, customTo, customerId, supplierId, isFulfilled, status, paymentStatus, stockStatus])

  const setStockStatus = useCallback((next: StockStatusFilter | null) => {
    setStockStatusState(next)
    writeUrl(namespace, period, compareWith, customFrom, customTo, customerId, supplierId, isFulfilled, status, paymentStatus, categoryId, next)
  }, [namespace, period, compareWith, customFrom, customTo, customerId, supplierId, isFulfilled, status, paymentStatus, categoryId])

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
    setCategoryIdState(null)
    setStockStatusState(null)
    writeUrl(namespace, 'this_month', null, null, null, null, null, null, null, null, null, null)
  }, [namespace])

  const isDefault = period === 'this_month'
    && compareWith === null
    && customerId === null
    && supplierId === null
    && isFulfilled === null
    && status === null
    && paymentStatus === null
    && categoryId === null
    && stockStatus === null

  const resolvedApiParams = useMemo(
    (): DashboardResolvedApiParams => ({
      ...toApiParams(period, compareWith, customFrom, customTo),
      ...(customerId ? { customerId } : {}),
      ...(supplierId ? { supplierId } : {}),
      ...(isFulfilled !== null ? { isFulfilled } : {}),
      ...(status !== null ? { status } : {}),
      ...(paymentStatus ? { paymentStatus } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(stockStatus ? { stockStatus } : {}),
    }),
    [period, compareWith, customFrom, customTo, customerId, supplierId, isFulfilled, status, paymentStatus, categoryId, stockStatus],
  )

  return {
    period, compareWith, customFrom, customTo, customerId, supplierId,
    isFulfilled, status, paymentStatus, categoryId, stockStatus,
    setPeriod, setCompare, setCustomRange,
    setCustomFrom: setCustomFromOnly, setCustomTo: setCustomToOnly,
    setCustomerId, setSupplierId, setFulfilled, setStatus,
    setPaymentStatus, setCategoryId, setStockStatus, reset,
    isDefault, resolvedApiParams,
  }
}
```

- [ ] **Step 4: Run all useDashboardFilters tests — expect PASS**

```bash
cd frontend && npx vitest run src/hooks/useDashboardFilters.test.ts --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useDashboardFilters.ts frontend/src/hooks/useDashboardFilters.test.ts
git commit -m "feat(useDashboardFilters): expand to full PeriodKey set, delegate date math to getPeriodDateRange"
```

---

## Task 5: Refactor DashboardFilterBar

**Files:**
- Modify: `frontend/src/components/filters/DashboardFilterBar.tsx`
- Modify: `frontend/src/components/filters/__tests__/DashboardFilterBar.test.tsx`

- [ ] **Step 1: Update the test file**

Replace the `baseProps()` function and add a new test — remove `onCustomFromChange` and `onCustomToChange` from props since they are being removed:

```ts
function baseProps() {
  return {
    period: 'this_month' as const,
    compareWith: null,
    customFrom: null,
    customTo: null,
    isFetching: false,
    isDefault: true,
    onPeriodChange: vi.fn(),
    onCompareChange: vi.fn(),
    onCustomRangeChange: vi.fn(),
    onReset: vi.fn(),
  }
}
```

Also add this test at the end of the describe block:

```ts
it('renders all period options including Yesterday and This Week', async () => {
  wrap(<DashboardFilterBar {...baseProps()} />)
  await userEvent.click(screen.getByLabelText('Period'))
  expect(screen.getByText('Yesterday')).toBeTruthy()
  expect(screen.getByText('This Week')).toBeTruthy()
  expect(screen.getByText('Last Week')).toBeTruthy()
  expect(screen.getByText('This Year')).toBeTruthy()
})

it('calls onPeriodChange when a preset is selected', async () => {
  const onPeriodChange = vi.fn()
  wrap(<DashboardFilterBar {...baseProps()} onPeriodChange={onPeriodChange} />)
  await userEvent.click(screen.getByLabelText('Period'))
  await userEvent.click(screen.getByText('Yesterday'))
  expect(onPeriodChange).toHaveBeenCalledWith('yesterday')
})
```

- [ ] **Step 2: Run updated tests — expect FAIL**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/DashboardFilterBar.test.tsx --no-coverage
```

Expected: FAIL — `onCustomFromChange` / `onCustomToChange` prop type errors, and new period options not yet present.

- [ ] **Step 3: Update DashboardFilterBar.tsx**

Replace the full file:

```tsx
// frontend/src/components/filters/DashboardFilterBar.tsx
import { Box, Button, CircularProgress, FormControl, InputLabel, MenuItem, Select, Tooltip } from '@mui/material'
import type { DashboardCompare, DashboardPeriod } from '@/hooks/useDashboardFilters'
import { FilterPeriod } from './FilterPeriod'

interface DashboardFilterBarProps {
  period: DashboardPeriod
  compareWith: DashboardCompare
  customFrom: string | null
  customTo: string | null
  isFetching: boolean
  isDefault: boolean
  onPeriodChange: (period: DashboardPeriod) => void
  onCompareChange: (compare: DashboardCompare) => void
  onCustomRangeChange: (from: string, to: string) => void
  onReset: () => void
  customers?: { id: string; name: string }[]
  customerId?: string | null
  onCustomerChange?: (id: string | null) => void
  suppliers?: { id: string; name: string }[]
  supplierId?: string | null
  onSupplierChange?: (id: string | null) => void
  isFulfilled?: boolean | null
  onFulfilledChange?: (value: boolean | null) => void
  status?: string | null
  onStatusChange?: (value: string | null) => void
  paymentStatus?: string | null
  onPaymentStatusChange?: (value: string | null) => void
  paymentStatusOptions?: { value: string; label: string }[]
  categories?: { id: string; name: string }[]
  categoryId?: string | null
  onCategoryChange?: (id: string | null) => void
  stockStatus?: string | null
  onStockStatusChange?: (value: string | null) => void
}

export function DashboardFilterBar({
  period,
  compareWith,
  customFrom,
  customTo,
  isFetching,
  isDefault,
  onPeriodChange,
  onCompareChange,
  onCustomRangeChange,
  onReset,
  customers,
  customerId,
  onCustomerChange,
  suppliers,
  supplierId,
  onSupplierChange,
  isFulfilled,
  onFulfilledChange,
  status,
  onStatusChange,
  paymentStatus,
  onPaymentStatusChange,
  paymentStatusOptions,
  categories,
  categoryId,
  onCategoryChange,
  stockStatus,
  onStockStatusChange,
}: DashboardFilterBarProps) {
  const compareDisabled = period === 'today'
  const resolvedPaymentStatusOptions = paymentStatusOptions ?? [
    { value: 'paid', label: 'Paid' },
    { value: 'partial_paid', label: 'Partially Paid' },
    { value: 'draft', label: 'Draft' },
  ]

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 3 }}>
      <FilterPeriod
        value={period}
        customFrom={customFrom}
        customTo={customTo}
        onChange={(key, from, to) => {
          if (key === 'custom' && from && to) {
            onCustomRangeChange(from, to)
          } else {
            onPeriodChange(key)
          }
        }}
      />

      <Tooltip title={compareDisabled ? 'Comparison is not available for Today' : ''} placement="top">
        <span>
          <FormControl size="small" sx={{ minWidth: 210 }} disabled={compareDisabled}>
            <InputLabel>Compare</InputLabel>
            <Select
              value={compareWith ?? ''}
              label="Compare"
              onChange={(event) => onCompareChange((event.target.value || null) as DashboardCompare)}
            >
              <MenuItem value="">No Comparison</MenuItem>
              <MenuItem value="previous_period">Previous Period</MenuItem>
              <MenuItem value="last_month">Same Period Last Month</MenuItem>
              <MenuItem value="last_year">Same Period Last Year</MenuItem>
            </Select>
          </FormControl>
        </span>
      </Tooltip>

      {customers !== undefined && onCustomerChange && (
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel id="dashboard-customer-label">Customer</InputLabel>
          <Select
            labelId="dashboard-customer-label"
            id="dashboard-customer"
            value={customerId ?? ''}
            label="Customer"
            onChange={(e) => onCustomerChange(e.target.value || null)}
          >
            <MenuItem value="">All Customers</MenuItem>
            {customers.map((customer) => (
              <MenuItem key={customer.id} value={customer.id}>{customer.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {suppliers !== undefined && onSupplierChange && (
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel id="dashboard-supplier-label">Supplier</InputLabel>
          <Select
            labelId="dashboard-supplier-label"
            id="dashboard-supplier"
            value={supplierId ?? ''}
            label="Supplier"
            onChange={(e) => onSupplierChange(e.target.value || null)}
          >
            <MenuItem value="">All Suppliers</MenuItem>
            {suppliers.map((supplier) => (
              <MenuItem key={supplier.id} value={supplier.id}>{supplier.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {categories !== undefined && onCategoryChange && (
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel id="dashboard-category-label">Category</InputLabel>
          <Select
            labelId="dashboard-category-label"
            id="dashboard-category"
            value={categoryId ?? ''}
            label="Category"
            onChange={(e) => onCategoryChange(e.target.value || null)}
          >
            <MenuItem value="">All Categories</MenuItem>
            {categories.map((category) => (
              <MenuItem key={category.id} value={category.id}>{category.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {stockStatus !== undefined && onStockStatusChange && (
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel id="dashboard-stock-status-label">Stock Status</InputLabel>
          <Select
            labelId="dashboard-stock-status-label"
            id="dashboard-stock-status"
            value={stockStatus ?? ''}
            label="Stock Status"
            onChange={(e) => onStockStatusChange(e.target.value || null)}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="in_stock">In Stock</MenuItem>
            <MenuItem value="low_stock">Low Stock</MenuItem>
            <MenuItem value="out_of_stock">Out of Stock</MenuItem>
          </Select>
        </FormControl>
      )}

      {isFulfilled !== undefined && onFulfilledChange && (
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel id="dashboard-order-status-label">Order Status</InputLabel>
          <Select
            labelId="dashboard-order-status-label"
            id="dashboard-order-status"
            value={isFulfilled === null ? '' : String(isFulfilled)}
            label="Order Status"
            onChange={(e) => {
              const value = e.target.value
              onFulfilledChange(value === '' ? null : value === 'true')
            }}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="true">Fulfilled</MenuItem>
            <MenuItem value="false">Pending</MenuItem>
          </Select>
        </FormControl>
      )}

      {status !== undefined && onStatusChange && (
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel id="dashboard-purchasing-order-status-label">Order Status</InputLabel>
          <Select
            labelId="dashboard-purchasing-order-status-label"
            id="dashboard-order-status-purchasing"
            value={status ?? ''}
            label="Order Status"
            onChange={(e) => onStatusChange(e.target.value || null)}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="received">Received</MenuItem>
            <MenuItem value="pending">Pending</MenuItem>
          </Select>
        </FormControl>
      )}

      {paymentStatus !== undefined && onPaymentStatusChange && (
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel id="dashboard-payment-status-label">Payment Status</InputLabel>
          <Select
            labelId="dashboard-payment-status-label"
            id="dashboard-payment-status"
            value={paymentStatus ?? ''}
            label="Payment Status"
            onChange={(e) => onPaymentStatusChange(e.target.value || null)}
          >
            <MenuItem value="">All</MenuItem>
            {resolvedPaymentStatusOptions.map((option) => (
              <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {!isDefault && (
        <Button variant="outlined" size="small" onClick={onReset} sx={{ height: 40 }}>
          Reset
        </Button>
      )}

      {isFetching && <CircularProgress size={16} />}
    </Box>
  )
}
```

- [ ] **Step 4: Remove onCustomFromChange/onCustomToChange from the three dashboard pages**

These three files pass the now-removed props to `DashboardFilterBar`. In each file, delete the two prop lines:
- `frontend/src/pages/sales/SalesPage.tsx`
- `frontend/src/pages/purchasing/PurchasingPage.tsx`
- `frontend/src/pages/inventory/InventoryPage.tsx`

In each file, find the `<DashboardFilterBar` usage and remove:
```tsx
onCustomFromChange={filters.setCustomFrom}
onCustomToChange={filters.setCustomTo}
```
(The exact prop values may vary slightly — search for `onCustomFromChange` and `onCustomToChange` in each file and delete those lines.)

- [ ] **Step 5: Run DashboardFilterBar tests — expect PASS**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/DashboardFilterBar.test.tsx --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 6: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/filters/DashboardFilterBar.tsx frontend/src/components/filters/__tests__/DashboardFilterBar.test.tsx
git commit -m "feat(DashboardFilterBar): replace hardcoded period Select with FilterPeriod component"
```

---

## Task 6: Backend — add startOfWeek to regional settings

**Files:**
- Modify: `backend/src/database/entities/regional-settings.entity.ts`
- Modify: `backend/src/modules/settings/dto/update-regional-settings.dto.ts`
- Modify: `backend/src/modules/settings/dto/regional-settings-response.dto.ts`
- Modify: `backend/src/modules/settings/dto/update-regional-settings.dto.spec.ts`
- Modify: `backend/src/modules/settings/settings.controller.spec.ts`
- Create: `backend/src/database/migrations/1774864899422-AddStartOfWeekToRegionalSettings.ts`

- [ ] **Step 1: Write the failing DTO tests**

Add to `backend/src/modules/settings/dto/update-regional-settings.dto.spec.ts`:

```ts
describe('UpdateRegionalSettingsDto startOfWeek', () => {
  it('accepts 0 (Sunday)', async () => {
    const dto = new UpdateRegionalSettingsDto()
    dto.startOfWeek = 0
    const errors = await validate(dto)
    expect(errors).toHaveLength(0)
  })

  it('accepts 1 (Monday)', async () => {
    const dto = new UpdateRegionalSettingsDto()
    dto.startOfWeek = 1
    const errors = await validate(dto)
    expect(errors).toHaveLength(0)
  })

  it('rejects 2', async () => {
    const dto = new UpdateRegionalSettingsDto()
    dto.startOfWeek = 2
    const errors = await validate(dto)
    expect(errors.length).toBeGreaterThan(0)
  })

  it('rejects -1', async () => {
    const dto = new UpdateRegionalSettingsDto()
    dto.startOfWeek = -1
    const errors = await validate(dto)
    expect(errors.length).toBeGreaterThan(0)
  })
})
```

Add to `backend/src/modules/settings/settings.controller.spec.ts`:

```ts
describe('SettingsController startOfWeek', () => {
  it('UpdateRegionalSettingsDto accepts startOfWeek as optional integer 0 or 1', () => {
    const dto = new UpdateRegionalSettingsDto()
    dto.startOfWeek = 0
    expect(dto.startOfWeek).toBe(0)
  })

  it('RegionalSettingsResponseDto exposes startOfWeek', () => {
    const dto = new RegionalSettingsResponseDto()
    ;(dto as any).startOfWeek = 1
    expect(dto.startOfWeek).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd backend && npx jest src/modules/settings/dto/update-regional-settings.dto.spec.ts src/modules/settings/settings.controller.spec.ts --no-coverage
```

Expected: FAIL — `startOfWeek` property does not exist.

- [ ] **Step 3: Update the entity**

In `backend/src/database/entities/regional-settings.entity.ts`, add after the `lowStockThreshold` column:

```ts
@Column({ type: 'int', default: 1 })
startOfWeek: number;
```

- [ ] **Step 4: Update the DTOs**

In `backend/src/modules/settings/dto/update-regional-settings.dto.ts`, add after the `lowStockThreshold` field:

```ts
@ApiProperty({ description: 'Start of week: 0 = Sunday, 1 = Monday', example: 1, enum: [0, 1] })
@IsInt()
@IsOptional()
@IsIn([0, 1])
startOfWeek?: number;
```

In `backend/src/modules/settings/dto/regional-settings-response.dto.ts`, add after `lowStockThreshold`:

```ts
@ApiProperty({ description: 'Start of week: 0 = Sunday, 1 = Monday', example: 1 })
@Expose()
startOfWeek: number;
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd backend && npx jest src/modules/settings/dto/update-regional-settings.dto.spec.ts src/modules/settings/settings.controller.spec.ts --no-coverage
```

Expected: all tests PASS. (No changes needed to `settings.service.ts` — it uses `Object.assign(settings, updateDto)` which picks up new fields automatically.)

- [ ] **Step 6: Create the migration**

Create `backend/src/database/migrations/1774864899422-AddStartOfWeekToRegionalSettings.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStartOfWeekToRegionalSettings1774864899422 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "regional_settings" ADD COLUMN IF NOT EXISTS "startOfWeek" integer NOT NULL DEFAULT 1`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "regional_settings" DROP COLUMN IF EXISTS "startOfWeek"`,
    );
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add \
  backend/src/database/entities/regional-settings.entity.ts \
  backend/src/modules/settings/dto/update-regional-settings.dto.ts \
  backend/src/modules/settings/dto/regional-settings-response.dto.ts \
  backend/src/modules/settings/dto/update-regional-settings.dto.spec.ts \
  backend/src/modules/settings/settings.controller.spec.ts \
  backend/src/database/migrations/1774864899422-AddStartOfWeekToRegionalSettings.ts
git commit -m "feat(settings): add startOfWeek field to regional settings"
```

---

## Task 7: RegionalSettingsPage — add Start of Week dropdown

**Files:**
- Modify: `frontend/src/pages/settings/RegionalSettingsPage.tsx`

- [ ] **Step 1: Update RegionalFormData interface and schema**

In `RegionalSettingsPage.tsx`, update the interface:

```ts
interface RegionalFormData {
  currency: string
  dateFormat: string
  timeFormat: string
  numberFormat: string
  timezone: string
  startOfWeek: number
}
```

Update the yup schema — add after the `timezone` field:

```ts
startOfWeek: yup.number().oneOf([0, 1]).required('Start of week is required'),
```

Update the `useForm` default values — add:

```ts
startOfWeek: 1,
```

- [ ] **Step 2: Add the dropdown to the form**

In the Date & Time Format section, after the Time Format `<Grid>` block and before the closing `<Grid size={12}><Divider ... /></Grid>`, add:

```tsx
<Grid size={{ xs: 12, md: 6 }}>
  <Controller
    name="startOfWeek"
    control={control}
    render={({ field }) => (
      <TextField
        {...field}
        select
        label="Start of Week"
        fullWidth
        required
        error={!!errors.startOfWeek}
        helperText={errors.startOfWeek?.message || 'Which day the week starts on'}
      >
        <MenuItem value={1}>Monday</MenuItem>
        <MenuItem value={0}>Sunday</MenuItem>
      </TextField>
    )}
  />
</Grid>
```

- [ ] **Step 3: Populate from loaded settings**

In the `useEffect` that calls `setValue`, add:

```ts
setValue('startOfWeek', s.startOfWeek ?? 1)
```

- [ ] **Step 4: Persist to localStorage on save**

In the `onSubmit` function, after the existing `localStorage.setItem` calls, add:

```ts
localStorage.setItem('startOfWeek', String(data.startOfWeek))
```

- [ ] **Step 5: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/settings/RegionalSettingsPage.tsx
git commit -m "feat(settings): add Start of Week dropdown to Regional Settings page"
```

---

## Task 8: Final verification

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && npm run test
```

Expected: all tests PASS.

- [ ] **Step 2: Run all frontend tests (this takes ~12 minutes — do not assume hung)**

```bash
cd frontend && npm run test
```

Expected: all tests PASS.

- [ ] **Step 3: Type-check frontend**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 4: Lint**

```bash
cd backend && npm run lint && npm run format
cd frontend && npm run lint
```

Expected: no errors.

- [ ] **Step 5: Final commit if any lint auto-fixes were applied**

```bash
git add -p
git commit -m "chore: lint and format fixes"
```
