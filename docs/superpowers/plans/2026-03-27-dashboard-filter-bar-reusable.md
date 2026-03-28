# Dashboard Filter Bar — Reusable Across Dashboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `DashboardFilterBar` and `useDashboardFilters` to shared locations and add a `namespace` parameter to isolate each dashboard's URL state, enabling reuse across Sales, Purchasing, Main, and any future dashboard pages.

**Architecture:** The `useDashboardFilters(namespace)` hook prefixes all URL params with the given namespace (e.g. `sales_period`, `purchasing_compare`) so each dashboard page maintains independent filter state in the URL. `DashboardFilterBar` props stay unchanged — the component knows nothing about namespaces. The shared files live in `src/components/dashboard/` and `src/hooks/`.

**Tech Stack:** React 19, TypeScript, Vitest, `@testing-library/react` (`renderHook`, `act`), MUI v7, `date-fns`, Vite path alias `@/` → `src/`

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Move (and edit) | `src/pages/sales/hooks/useDashboardFilters.ts` → `src/hooks/useDashboardFilters.ts` | Add `namespace` param; prefix URL keys |
| Move (and edit) | `src/pages/sales/components/DashboardFilterBar.tsx` → `src/components/dashboard/DashboardFilterBar.tsx` | Update internal type import path |
| Move (and edit) | `src/pages/sales/hooks/useDashboardFilters.test.ts` → `src/hooks/useDashboardFilters.test.ts` | Update import path; add namespace arg to all call sites; add 3 new namespace tests |
| Modify | `src/pages/sales/components/index.ts` | Remove `DashboardFilterBar` export |
| Modify | `src/pages/sales/SalesPage.tsx` | Update import paths; add `'sales'` namespace arg |

---

## Task 1: Move and update `useDashboardFilters` hook

**Files:**
- Delete: `src/pages/sales/hooks/useDashboardFilters.ts`
- Create: `src/hooks/useDashboardFilters.ts`

- [ ] **Step 1: Create the new shared hook file**

Create `frontend/src/hooks/useDashboardFilters.ts` with the following content. Changes from the original:
1. `useDashboardFilters` now accepts `namespace: string`
2. `parseUrl` and `writeUrl` accept and use `namespace`, prefixing all param keys with `${namespace}_`
3. All `writeUrl` calls inside callbacks now pass `namespace` as the first argument
4. A dev-mode guard warns if namespace is empty string
5. A `// eslint-disable-next-line` comment suppresses the `exhaustive-deps` warning on `useMemo(() => parseUrl(namespace), [])` — namespace is intentionally parsed only on mount

```typescript
import { useCallback, useMemo, useState } from 'react'
import { subDays, format } from 'date-fns'

export type DashboardPeriod = 'today' | 'last_7_days' | 'this_month' | 'last_month' | 'custom'
export type DashboardCompare = 'previous_period' | 'last_month' | 'last_year' | null

const VALID_PERIODS: DashboardPeriod[] = ['today', 'last_7_days', 'this_month', 'last_month', 'custom']
const VALID_COMPARES: NonNullable<DashboardCompare>[] = ['previous_period', 'last_month', 'last_year']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function parseUrl(namespace: string): {
  period: DashboardPeriod
  compareWith: DashboardCompare
  customFrom: string | null
  customTo: string | null
} {
  const params = new URLSearchParams(window.location.search)
  const rawPeriod = params.get(`${namespace}_period`) ?? 'this_month'
  const rawCompare = params.get(`${namespace}_compare`)
  const rawFrom = params.get(`${namespace}_from`)
  const rawTo = params.get(`${namespace}_to`)

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
  namespace: string,
  period: DashboardPeriod,
  compareWith: DashboardCompare,
  customFrom: string | null,
  customTo: string | null,
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

  const setPeriod = useCallback((next: DashboardPeriod) => {
    const nextFrom = next === 'custom' ? customFrom : null
    const nextTo = next === 'custom' ? customTo : null

    setPeriodState(next)
    if (next !== 'custom') {
      setCustomFrom(null)
      setCustomTo(null)
    }
    writeUrl(namespace, next, compareWith, nextFrom, nextTo)
  }, [namespace, compareWith, customFrom, customTo])

  const setCompare = useCallback((next: DashboardCompare) => {
    setCompareWith(next)
    writeUrl(namespace, period, next, customFrom, customTo)
  }, [namespace, period, customFrom, customTo])

  const setCustomRange = useCallback((from: string, to: string) => {
    setCustomFrom(from)
    setCustomTo(to)
    if (DATE_RE.test(from) && DATE_RE.test(to) && from <= to) {
      setPeriodState('custom')
      writeUrl(namespace, 'custom', compareWith, from, to)
    }
  }, [namespace, compareWith])

  const setCustomFromOnly = useCallback((from: string | null) => {
    setPeriodState('custom')
    setCustomFrom(from)
    if (from && customTo && DATE_RE.test(from) && DATE_RE.test(customTo) && from <= customTo) {
      writeUrl(namespace, 'custom', compareWith, from, customTo)
    }
  }, [namespace, compareWith, customTo])

  const setCustomToOnly = useCallback((to: string | null) => {
    setPeriodState('custom')
    setCustomTo(to)
    if (customFrom && to && DATE_RE.test(customFrom) && DATE_RE.test(to) && customFrom <= to) {
      writeUrl(namespace, 'custom', compareWith, customFrom, to)
    }
  }, [namespace, compareWith, customFrom])

  const reset = useCallback(() => {
    setPeriodState('this_month')
    setCompareWith(null)
    setCustomFrom(null)
    setCustomTo(null)
    writeUrl(namespace, 'this_month', null, null, null)
  }, [namespace])

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
```

- [ ] **Step 2: Delete the old hook file**

```bash
rm frontend/src/pages/sales/hooks/useDashboardFilters.ts
```

- [ ] **Step 3: Commit**

```bash
cd frontend
git add src/hooks/useDashboardFilters.ts
git add -u src/pages/sales/hooks/useDashboardFilters.ts
git commit -m "refactor: move useDashboardFilters to shared hooks, add namespace param"
```

---

## Task 2: Move and update `DashboardFilterBar` component

**Files:**
- Delete: `src/pages/sales/components/DashboardFilterBar.tsx`
- Create: `src/components/dashboard/DashboardFilterBar.tsx`

- [ ] **Step 1: Create the shared component directory and file**

Create `frontend/src/components/dashboard/DashboardFilterBar.tsx`. The content is identical to the original except line 5 — update the type import path:

Change:
```typescript
import type { DashboardCompare, DashboardPeriod } from '../hooks/useDashboardFilters'
```

To:
```typescript
import type { DashboardCompare, DashboardPeriod } from '@/hooks/useDashboardFilters'
```

All other lines remain identical. Copy the full file and apply only this one-line change.

- [ ] **Step 2: Delete the old component file**

```bash
rm frontend/src/pages/sales/components/DashboardFilterBar.tsx
```

- [ ] **Step 3: Commit**

```bash
cd frontend
git add src/components/dashboard/DashboardFilterBar.tsx
git add -u src/pages/sales/components/DashboardFilterBar.tsx
git commit -m "refactor: move DashboardFilterBar to shared components/dashboard"
```

---

## Task 3: Update barrel export and SalesPage imports

**Files:**
- Modify: `src/pages/sales/components/index.ts`
- Modify: `src/pages/sales/SalesPage.tsx`

- [ ] **Step 1: Remove DashboardFilterBar from the sales components barrel**

In `frontend/src/pages/sales/components/index.ts`, remove line 3:

```typescript
export { DashboardFilterBar } from './DashboardFilterBar'
```

The file after the change should be:

```typescript
export { default as SalesStatsCards } from './SalesStatsCards'
export type { StatItem } from './SalesStatsCards'
export { SalesTrendChart, TopProductsList, TopCustomersList } from './SalesCharts'
```

- [ ] **Step 2: Update SalesPage imports**

In `frontend/src/pages/sales/SalesPage.tsx`:

Change line 30 from:
```typescript
import { DashboardFilterBar, SalesStatsCards, SalesTrendChart, TopProductsList, TopCustomersList } from './components'
```
To:
```typescript
import { SalesStatsCards, SalesTrendChart, TopProductsList, TopCustomersList } from './components'
import { DashboardFilterBar } from '@/components/dashboard/DashboardFilterBar'
```

Change line 32 from:
```typescript
import { useDashboardFilters } from './hooks/useDashboardFilters'
```
To:
```typescript
import { useDashboardFilters } from '@/hooks/useDashboardFilters'
```

- [ ] **Step 3: Add namespace arg to useDashboardFilters call in SalesPage**

In `frontend/src/pages/sales/SalesPage.tsx`, find the hook call (around line 40):
```typescript
} = useDashboardFilters()
```
Change to:
```typescript
} = useDashboardFilters('sales')
```

- [ ] **Step 4: Run TypeScript check to confirm no type errors**

```bash
cd frontend && npm run type-check
```

Expected: no errors. If errors appear, fix them before continuing.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add src/pages/sales/components/index.ts src/pages/sales/SalesPage.tsx
git commit -m "refactor: update SalesPage to use shared DashboardFilterBar and useDashboardFilters"
```

---

## Task 4: Update tests

**Files:**
- Delete: `src/pages/sales/hooks/useDashboardFilters.test.ts`
- Create: `src/hooks/useDashboardFilters.test.ts`

- [ ] **Step 1: Create the updated test file at the new shared location**

Create `frontend/src/hooks/useDashboardFilters.test.ts` with the following content. Changes from the original:
1. Import path updated to `'./useDashboardFilters'`
2. All 13 `useDashboardFilters()` call sites now pass `'sales'` as the namespace argument
3. URL params in `setUrl()` calls updated to use `sales_` prefix throughout
4. Three new tests added at the end for namespace-prefixing behaviour

```typescript
// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useDashboardFilters } from './useDashboardFilters'

function setUrl(search: string) {
  vi.stubGlobal('location', { search, pathname: '/', href: `http://localhost/${search}` })
  vi.stubGlobal('history', { replaceState: vi.fn() })
}

beforeEach(() => {
  setUrl('')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useDashboardFilters', () => {
  it('returns default period=this_month and compareWith=null when URL is empty', () => {
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.period).toBe('this_month')
    expect(result.current.compareWith).toBeNull()
    expect(result.current.customFrom).toBeNull()
    expect(result.current.customTo).toBeNull()
  })

  it('reads period and compare from URL on mount', () => {
    setUrl('?sales_period=last_month&sales_compare=last_year')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.period).toBe('last_month')
    expect(result.current.compareWith).toBe('last_year')
  })

  it('normalizes invalid period to this_month on mount', () => {
    setUrl('?sales_period=garbage')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.period).toBe('this_month')
  })

  it('normalizes period=custom without from/to to this_month on mount', () => {
    setUrl('?sales_period=custom')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.period).toBe('this_month')
  })

  it('normalizes period=custom with from > to to this_month on mount', () => {
    setUrl('?sales_period=custom&sales_from=2026-03-31&sales_to=2026-03-01')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.period).toBe('this_month')
  })

  it('accepts valid period=custom with from and to', () => {
    setUrl('?sales_period=custom&sales_from=2026-03-01&sales_to=2026-03-31')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.period).toBe('custom')
    expect(result.current.customFrom).toBe('2026-03-01')
    expect(result.current.customTo).toBe('2026-03-31')
  })

  it('normalizes invalid compare value to null', () => {
    setUrl('?sales_compare=garbage')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.compareWith).toBeNull()
  })

  it('setPeriod updates period and clears from/to for non-custom', () => {
    setUrl('?sales_period=custom&sales_from=2026-03-01&sales_to=2026-03-31')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    act(() => {
      result.current.setPeriod('this_month')
    })
    expect(result.current.period).toBe('this_month')
    expect(result.current.customFrom).toBeNull()
    expect(result.current.customTo).toBeNull()
  })

  it('reset restores defaults', () => {
    setUrl('?sales_period=last_month&sales_compare=last_year')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    act(() => {
      result.current.reset()
    })
    expect(result.current.period).toBe('this_month')
    expect(result.current.compareWith).toBeNull()
  })

  it('resolvedApiParams maps this_month to dateRange=this_month', () => {
    setUrl('?sales_period=this_month')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.resolvedApiParams.dateRange).toBe('this_month')
    expect(result.current.resolvedApiParams.groupBy).toBe('day')
    expect(result.current.resolvedApiParams.compareWith).toBeUndefined()
  })

  it('resolvedApiParams maps last_7_days to explicit startDate/endDate', () => {
    setUrl('?sales_period=last_7_days')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.resolvedApiParams.dateRange).toBeUndefined()
    expect(result.current.resolvedApiParams.startDate).toBeDefined()
    expect(result.current.resolvedApiParams.groupBy).toBe('day')
  })

  it('resolvedApiParams includes compareWith when set', () => {
    setUrl('?sales_period=this_month&sales_compare=previous_period')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.resolvedApiParams.compareWith).toBe('previous_period')
  })

  it('preserves a custom from date before the to date is selected', () => {
    setUrl('?sales_period=custom')
    const { result } = renderHook(() => useDashboardFilters('sales'))

    act(() => {
      result.current.setCustomFrom('2026-03-01')
    })

    expect(result.current.period).toBe('custom')
    expect(result.current.customFrom).toBe('2026-03-01')
    expect(result.current.customTo).toBeNull()
  })

  it('preserves a custom to date before the from date is selected', () => {
    setUrl('?sales_period=custom')
    const { result } = renderHook(() => useDashboardFilters('sales'))

    act(() => {
      result.current.setCustomTo('2026-03-31')
    })

    expect(result.current.period).toBe('custom')
    expect(result.current.customFrom).toBeNull()
    expect(result.current.customTo).toBe('2026-03-31')
  })

  it('reads from namespace-prefixed URL params (not bare keys)', () => {
    // bare keys without prefix must be ignored
    setUrl('?period=last_month&compare=last_year')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.period).toBe('this_month')
    expect(result.current.compareWith).toBeNull()
  })

  it('writes namespace-prefixed keys to the URL', () => {
    setUrl('')
    const replaceState = vi.fn()
    vi.stubGlobal('history', { replaceState })
    const { result } = renderHook(() => useDashboardFilters('purchasing'))
    act(() => {
      result.current.setPeriod('last_month')
    })
    const calledUrl: string = replaceState.mock.calls[0][2]
    expect(calledUrl).toContain('purchasing_period=last_month')
  })

  it('two namespaces in the same URL are independent', () => {
    setUrl('?sales_period=today&purchasing_period=last_month')
    const { result: salesResult } = renderHook(() => useDashboardFilters('sales'))
    const { result: purchasingResult } = renderHook(() => useDashboardFilters('purchasing'))
    expect(salesResult.current.period).toBe('today')
    expect(purchasingResult.current.period).toBe('last_month')
  })
})
```

- [ ] **Step 2: Delete the old test file**

```bash
rm frontend/src/pages/sales/hooks/useDashboardFilters.test.ts
```

- [ ] **Step 3: Run the tests**

```bash
cd frontend && npx vitest run src/hooks/useDashboardFilters.test.ts
```

Expected: all 16 tests pass. If any fail, fix the implementation in `src/hooks/useDashboardFilters.ts` before continuing.

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/hooks/useDashboardFilters.test.ts
git add -u src/pages/sales/hooks/useDashboardFilters.test.ts
git commit -m "test: move and update useDashboardFilters tests, add namespace coverage"
```

---

## Task 5: Final verification

- [ ] **Step 1: Run the full frontend test suite**

```bash
cd frontend && npm run test
```

Expected: all tests pass, no regressions.

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Run lint**

```bash
cd frontend && npm run lint
```

Expected: no errors. Fix any lint issues before continuing.

- [ ] **Step 4: Commit if any lint fixes were needed**

Only commit if step 3 required fixes:

```bash
cd frontend
git add src/hooks/useDashboardFilters.ts src/components/dashboard/DashboardFilterBar.tsx src/pages/sales/SalesPage.tsx src/pages/sales/components/index.ts src/hooks/useDashboardFilters.test.ts
git commit -m "chore: fix lint issues after dashboard filter bar refactor"
```

---

## Verification Checklist

After all tasks are complete:

- [ ] `src/hooks/useDashboardFilters.ts` exists and exports `useDashboardFilters(namespace: string)`
- [ ] `src/components/dashboard/DashboardFilterBar.tsx` exists and imports types from `@/hooks/useDashboardFilters`
- [ ] `src/pages/sales/hooks/useDashboardFilters.ts` no longer exists
- [ ] `src/pages/sales/components/DashboardFilterBar.tsx` no longer exists
- [ ] `src/pages/sales/components/index.ts` does NOT export `DashboardFilterBar`
- [ ] `SalesPage.tsx` calls `useDashboardFilters('sales')`
- [ ] All 16 tests in `src/hooks/useDashboardFilters.test.ts` pass
- [ ] TypeScript check passes
- [ ] Lint passes

---

## Using on a New Dashboard Page

Once this plan is complete, wiring up the filter bar on any new dashboard page is:

```typescript
import { useDashboardFilters } from '@/hooks/useDashboardFilters'
import { DashboardFilterBar } from '@/components/dashboard/DashboardFilterBar'

// inside the component:
const filters = useDashboardFilters('purchasing') // use the route segment as namespace

// in JSX:
<DashboardFilterBar
  period={filters.period}
  compareWith={filters.compareWith}
  customFrom={filters.customFrom}
  customTo={filters.customTo}
  isFetching={isFetching}
  isDefault={filters.isDefault}
  onPeriodChange={filters.setPeriod}
  onCompareChange={filters.setCompare}
  onCustomRangeChange={filters.setCustomRange}
  onCustomFromChange={filters.setCustomFrom}
  onCustomToChange={filters.setCustomTo}
  onReset={filters.reset}
/>
```
