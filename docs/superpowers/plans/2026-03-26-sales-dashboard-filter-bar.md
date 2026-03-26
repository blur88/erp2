# Sales Dashboard Filter Bar (Lite) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Period + Compare filters to the Sales Overview dashboard, backed by a comparison-aware analytics API endpoint that returns `{ current, comparison? }`.

**Architecture:** Backend extends the existing `/sales/analytics/dashboard` endpoint with a `compareWith` param and restructures the response into a `current` / `comparison` block shape. Frontend replaces the manual period `<Select>` with three focused units: `useDashboardFilters` (URL state), `useDashboardAnalytics` (data fetch), and `DashboardFilterBar` (UI). The shared FilterBar system is intentionally not used.

**Tech Stack:** NestJS 11 (backend), React 19 + MUI v7 (frontend), Chart.js + react-chartjs-2 (charts), date-fns (date math), Jest (backend tests), Vitest (frontend tests)

**Spec:** `docs/superpowers/specs/2026-03-26-sales-dashboard-filter-bar-design.md`

---

## File Map

### Backend — new/modified

| File | Action | Purpose |
|---|---|---|
| `backend/src/modules/sales/dto/sales-analytics.dto.ts` | Modify | Add `compareWith` to query DTO; add `SalesAnalyticsPeriodBlockDto`; update response DTO |
| `backend/src/modules/sales/services/sales-analytics.service.ts` | Modify | Add `computeComparePeriod`; restructure `getSalesAnalytics` to return `{ current, comparison? }` |
| `backend/src/modules/sales/services/sales-analytics.service.spec.ts` | Create | Unit tests for `computeComparePeriod` and updated `getSalesAnalytics` |

### Frontend — new files

| File | Action | Purpose |
|---|---|---|
| `frontend/src/pages/sales/hooks/useDashboardFilters.ts` | Create | URL state for `{ period, compareWith, from?, to? }` with validation |
| `frontend/src/pages/sales/hooks/useDashboardAnalytics.ts` | Create | Data fetching hook returning `{ data, isLoading, isFetching, error }` |
| `frontend/src/pages/sales/components/DashboardFilterBar.tsx` | Create | Period + Compare dropdowns UI |

### Frontend — modified files

| File | Action | Purpose |
|---|---|---|
| `frontend/src/pages/sales/components/SalesCharts.tsx` | Modify | Add `comparisonData?: number[]` prop to `SalesTrendChart` |
| `frontend/src/pages/sales/components/SalesStatsCards.tsx` | Modify | Support optional delta display with `"New"` / `0%` edge cases |
| `frontend/src/pages/sales/components/index.ts` | Modify | Export `DashboardFilterBar` |
| `frontend/src/pages/sales/SalesPage.tsx` | Modify | Remove manual fetch/period state; wire up three new units |

### Frontend — new test files

| File | Action | Purpose |
|---|---|---|
| `frontend/src/pages/sales/hooks/useDashboardFilters.test.ts` | Create | URL normalization, custom-range validation |
| `frontend/src/pages/sales/hooks/useDashboardAnalytics.test.ts` | Create | Loading states, error on refetch, comparison pass-through |

---

## Task 1: Backend DTO restructure

**Files:**
- Modify: `backend/src/modules/sales/dto/sales-analytics.dto.ts`

This task changes the shape of the response DTO. The controller and service are updated in subsequent tasks. Do not change the service yet.

- [ ] **Step 1: Add `compareWith` to query DTO**

In `sales-analytics.dto.ts`, after the existing `groupBy` field in `SalesAnalyticsQueryDto`, add:

```typescript
@ApiPropertyOptional({ enum: ['previous_period', 'last_month', 'last_year'] })
@IsOptional()
@IsIn(['previous_period', 'last_month', 'last_year'])
compareWith?: 'previous_period' | 'last_month' | 'last_year'
```

Add `IsIn` to the `class-validator` import at the top of the file.

- [ ] **Step 2: Add `SalesAnalyticsPeriodBlockDto`**

After `PeriodMetricDto`, add:

```typescript
export class SalesAnalyticsPeriodBlockDto {
  @ApiProperty({ type: SalesMetricsDto })
  metrics!: SalesMetricsDto

  @ApiProperty({ type: [PeriodMetricDto] })
  periodData!: PeriodMetricDto[]

  @ApiProperty({ example: '2026-03-01' })
  @Transform(({ value }) => (value instanceof Date ? format(value, 'yyyy-MM-dd') : value))
  periodStart!: string

  @ApiProperty({ example: '2026-03-31' })
  @Transform(({ value }) => (value instanceof Date ? format(value, 'yyyy-MM-dd') : value))
  periodEnd!: string
}
```

Add `import { format } from 'date-fns'` at the top of the file (it is already a project dependency).
Add `Transform` to the `class-transformer` import.

- [ ] **Step 3: Replace `SalesAnalyticsResponseDto`**

Replace the existing `SalesAnalyticsResponseDto` class with:

```typescript
export class SalesAnalyticsResponseDto {
  @ApiProperty({ type: SalesAnalyticsPeriodBlockDto })
  current!: SalesAnalyticsPeriodBlockDto

  @ApiPropertyOptional({ type: SalesAnalyticsPeriodBlockDto })
  comparison?: SalesAnalyticsPeriodBlockDto

  @ApiProperty({ type: [TopCustomerDto] })
  topCustomers!: TopCustomerDto[]

  @ApiProperty({ type: [TopProductDto] })
  topProducts!: TopProductDto[]
}
```

The old `periodStart`, `periodEnd`, `metrics`, and `periodData` top-level fields are removed — they are now inside `current`.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit 2>&1 | head -40
```

Expected: errors only in `sales-analytics.service.ts` (which still uses the old shape) — that is expected at this stage. No errors in the DTO file itself.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/sales/dto/sales-analytics.dto.ts
git commit -m "feat(sales): restructure analytics DTO for comparison support"
```

---

## Task 2: Backend service tests (write first — TDD)

**Files:**
- Create: `backend/src/modules/sales/services/sales-analytics.service.spec.ts`

Tests are written before the implementation. The spec file will fail until Task 3 implements the code — that is correct and expected.

- [ ] **Step 1: Write `computeComparePeriod` and `getSalesAnalytics` tests**

First, look up all injected dependencies:

```bash
grep -n "@InjectRepository\|private readonly.*Service\|SalesAnalyticsReportService" backend/src/modules/sales/services/sales-analytics.service.ts | head -20
```

Then create the spec file:

```typescript
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { SalesAnalyticsService } from './sales-analytics.service'
import { SalesOrder } from '../../entities/sales-order.entity'
import { Invoice } from '../../entities/invoice.entity'
import { Payment } from '../../entities/payment.entity'
import { Customer } from '../../../customers/entities/customer.entity'
import { SalesOrderItem } from '../../entities/sales-order-item.entity'
import { SalesAnalyticsReportService } from './sales-analytics-report.service'
// Adjust entity imports above to match actual paths — use the grep output from Step above

// Helper: parse YYYY-MM-DD as UTC date
const d = (s: string) => new Date(s + 'T00:00:00.000Z')

function makeQueryBuilderMock() {
  const qb: any = {}
  const chainMethods = ['select', 'addSelect', 'from', 'leftJoin', 'innerJoin', 'where', 'andWhere', 'orWhere', 'groupBy', 'addGroupBy', 'orderBy', 'limit', 'offset']
  chainMethods.forEach((m) => { qb[m] = jest.fn().mockReturnValue(qb) })
  qb.getRawMany = jest.fn().mockResolvedValue([])
  qb.getRawOne = jest.fn().mockResolvedValue(null)
  return qb
}

function makeRepoMock() {
  return {
    createQueryBuilder: jest.fn().mockReturnValue(makeQueryBuilderMock()),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
  }
}

describe('SalesAnalyticsService', () => {
  let service: SalesAnalyticsService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesAnalyticsService,
        { provide: getRepositoryToken(SalesOrder), useValue: makeRepoMock() },
        { provide: getRepositoryToken(Invoice), useValue: makeRepoMock() },
        { provide: getRepositoryToken(Payment), useValue: makeRepoMock() },
        { provide: getRepositoryToken(Customer), useValue: makeRepoMock() },
        { provide: getRepositoryToken(SalesOrderItem), useValue: makeRepoMock() },
        { provide: SalesAnalyticsReportService, useValue: { generateReport: jest.fn() } },
        // Add any additional injected services found by the grep above
      ],
    }).compile()
    service = module.get<SalesAnalyticsService>(SalesAnalyticsService)
  })

  describe('computeComparePeriod', () => {
    describe('previous_period', () => {
      it('returns window of same day count ending day before start', () => {
        // Mar 1–Mar 31 (31 days) → Jan 29–Feb 28
        const result = (service as any).computeComparePeriod(d('2026-03-01'), d('2026-03-31'), 'previous_period')
        expect(result.compareStart.toISOString().slice(0, 10)).toBe('2026-01-29')
        expect(result.compareEnd.toISOString().slice(0, 10)).toBe('2026-02-28')
      })

      it('handles 28-day window (non-leap Feb)', () => {
        // Feb 1–Feb 28 (28 days) → Jan 4–Jan 31
        const result = (service as any).computeComparePeriod(d('2026-02-01'), d('2026-02-28'), 'previous_period')
        expect(result.compareStart.toISOString().slice(0, 10)).toBe('2026-01-04')
        expect(result.compareEnd.toISOString().slice(0, 10)).toBe('2026-01-31')
      })

      it('handles single-day window', () => {
        const result = (service as any).computeComparePeriod(d('2026-03-15'), d('2026-03-15'), 'previous_period')
        expect(result.compareStart.toISOString().slice(0, 10)).toBe('2026-03-14')
        expect(result.compareEnd.toISOString().slice(0, 10)).toBe('2026-03-14')
      })
    })

    describe('last_month', () => {
      it('subtracts one calendar month from start and end independently', () => {
        const result = (service as any).computeComparePeriod(d('2026-03-01'), d('2026-03-31'), 'last_month')
        expect(result.compareStart.toISOString().slice(0, 10)).toBe('2026-02-01')
        expect(result.compareEnd.toISOString().slice(0, 10)).toBe('2026-02-28') // date-fns subMonths clamps Mar 31 → Feb 28
      })

      it('handles range spanning a month boundary', () => {
        const result = (service as any).computeComparePeriod(d('2026-01-28'), d('2026-02-03'), 'last_month')
        expect(result.compareStart.toISOString().slice(0, 10)).toBe('2025-12-28')
        expect(result.compareEnd.toISOString().slice(0, 10)).toBe('2026-01-03')
      })
    })

    describe('last_year', () => {
      it('returns same date one year back', () => {
        const result = (service as any).computeComparePeriod(d('2026-03-01'), d('2026-03-31'), 'last_year')
        expect(result.compareStart.toISOString().slice(0, 10)).toBe('2025-03-01')
        expect(result.compareEnd.toISOString().slice(0, 10)).toBe('2025-03-31')
      })

      it('clamps Feb 29 to Feb 28 in non-leap year', () => {
        // 2024 is a leap year; 2023 is not
        const result = (service as any).computeComparePeriod(d('2024-02-01'), d('2024-02-29'), 'last_year')
        expect(result.compareEnd.toISOString().slice(0, 10)).toBe('2023-02-28')
      })
    })
  })

  describe('getSalesAnalytics', () => {
    it('returns comparison block when compareWith is set', async () => {
      const result = await service.getSalesAnalytics({
        dateRange: 'this_month' as any,
        compareWith: 'last_month',
      } as any)
      expect(result.current).toBeDefined()
      expect(result.current.metrics).toBeDefined()
      expect(result.comparison).toBeDefined()
      expect(result.topCustomers).toBeDefined()
      expect(result.topProducts).toBeDefined()
    })

    it('omits comparison block when compareWith is not set', async () => {
      const result = await service.getSalesAnalytics({
        dateRange: 'this_month' as any,
      } as any)
      expect(result.current).toBeDefined()
      expect(result.comparison).toBeUndefined()
    })
  })
})
```

- [ ] **Step 2: Run tests — expect failures (implementation not written yet)**

```bash
cd backend && npx jest src/modules/sales/services/sales-analytics.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `computeComparePeriod is not a function` or similar.

- [ ] **Step 3: Commit the failing tests**

```bash
git add backend/src/modules/sales/services/sales-analytics.service.spec.ts
git commit -m "test(sales): add failing tests for computeComparePeriod and getSalesAnalytics"
```

---

## Task 3: Backend service — `computeComparePeriod` + restructured `getSalesAnalytics`

**Files:**
- Modify: `backend/src/modules/sales/services/sales-analytics.service.ts`

- [ ] **Step 1: Add `computeComparePeriod` private method**

After the `parseDateRange` method (around line 549), add:

```typescript
private computeComparePeriod(
  start: Date,
  end: Date,
  compareWith: 'previous_period' | 'last_month' | 'last_year',
): { compareStart: Date; compareEnd: Date } {
  if (compareWith === 'previous_period') {
    const dayCount = differenceInCalendarDays(end, start) + 1
    const compareEnd = subDays(start, 1)
    const compareStart = subDays(compareEnd, dayCount - 1)
    return { compareStart, compareEnd }
  }

  if (compareWith === 'last_month') {
    // date-fns subMonths already clamps overflow (e.g. Mar 31 → Feb 28 automatically)
    return {
      compareStart: subMonths(start, 1),
      compareEnd: subMonths(end, 1),
    }
  }

  // last_year — date-fns subYears clamps Feb 29 → Feb 28 in non-leap years automatically
  return {
    compareStart: subYears(start, 1),
    compareEnd: subYears(end, 1),
  }
}
```

Add a new import line at the top of the service file (the service has no existing date-fns import):

```typescript
import { differenceInCalendarDays, subDays, subMonths, subYears } from 'date-fns'
```

- [ ] **Step 2: Restructure `getSalesAnalytics`**

Replace the existing `getSalesAnalytics` method body with:

```typescript
async getSalesAnalytics(query: SalesAnalyticsQueryDto): Promise<SalesAnalyticsResponseDto> {
  const { startDate, endDate } = this.parseDateRange(query.dateRange, query.startDate, query.endDate)
  const groupBy = query.groupBy ?? GroupByPeriod.MONTH

  // Phase 1: synchronous — resolve comparison window
  const comparePeriod = query.compareWith
    ? this.computeComparePeriod(startDate, endDate, query.compareWith)
    : null

  // Phase 2: parallel fetch
  const [metrics, periodData, topCustomers, topProducts] = await Promise.all([
    this.calculateSalesMetrics(startDate, endDate, query),
    this.getPeriodData(startDate, endDate, groupBy),
    this.getTopCustomers(startDate, endDate, 10),
    this.getTopProducts(startDate, endDate, 10),
  ])

  const current: SalesAnalyticsPeriodBlockDto = {
    metrics,
    periodData,
    periodStart: startDate as unknown as string,  // @Transform handles serialization
    periodEnd: endDate as unknown as string,
  }

  let comparison: SalesAnalyticsPeriodBlockDto | undefined
  if (comparePeriod) {
    const [compareMetrics, comparePeriodData] = await Promise.all([
      this.calculateSalesMetrics(comparePeriod.compareStart, comparePeriod.compareEnd),
      this.getPeriodData(comparePeriod.compareStart, comparePeriod.compareEnd, groupBy),
    ])
    comparison = {
      metrics: compareMetrics,
      periodData: comparePeriodData,
      periodStart: comparePeriod.compareStart as unknown as string,
      periodEnd: comparePeriod.compareEnd as unknown as string,
    }
  }

  return { current, comparison, topCustomers, topProducts }
}
```

Note: `as unknown as string` is intentional — the `@Transform` decorator on the DTO handles Date→string serialization on the way out. TypeScript strict mode is off per project conventions.

- [ ] **Step 3: Fix TypeScript errors**

```bash
cd backend && npx tsc --noEmit 2>&1 | head -40
```

Fix any remaining type errors in the service. The controller may have errors referencing old response shape fields — ignore those for now (fixed in Task 4).

- [ ] **Step 4: Run the tests from Task 2 — they should now pass**

```bash
cd backend && npx jest src/modules/sales/services/sales-analytics.service.spec.ts --no-coverage
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/sales/services/sales-analytics.service.ts
git commit -m "feat(sales): add computeComparePeriod and restructure getSalesAnalytics response"
```

---

## Task 4: Fix controller — update API docs to match new response shape

**Files:**
- Modify: `backend/src/modules/sales/controllers/sales-analytics.controller.ts`

- [ ] **Step 1: Update the `@ApiResponse` on `getSalesAnalytics`**

Find the `@ApiResponse` decorator on the `GET dashboard` endpoint (around line 42) and update its `type` from the old `SalesAnalyticsResponseDto` fields to the new shape. No logic changes needed — the controller just calls `this.salesAnalyticsService.getSalesAnalytics(query)` and returns the result.

Also add `@ApiQuery` for `compareWith`:

```typescript
@ApiQuery({
  name: 'compareWith',
  required: false,
  enum: ['previous_period', 'last_month', 'last_year'],
  description: 'Comparison period for delta metrics',
})
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
cd backend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Smoke-test the endpoint manually**

```bash
cd backend && npm run start:dev &
sleep 5
curl -s "http://localhost:3000/api/sales/analytics/dashboard?dateRange=this_month" | python3 -m json.tool | head -30
```

Verify `current.metrics`, `current.periodData`, `topCustomers`, `topProducts` appear in the response. `comparison` should be absent.

```bash
curl -s "http://localhost:3000/api/sales/analytics/dashboard?dateRange=this_month&compareWith=last_month" | python3 -m json.tool | head -40
```

Verify `comparison.metrics` and `comparison.periodData` appear.

Kill the dev server after verifying.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/sales/controllers/sales-analytics.controller.ts
git commit -m "feat(sales): add compareWith query param to dashboard endpoint"
```

---

## Task 5: Frontend — `useDashboardFilters` hook

**Files:**
- Create: `frontend/src/pages/sales/hooks/useDashboardFilters.ts`
- Create: `frontend/src/pages/sales/hooks/useDashboardFilters.test.ts`

**Important:** The Vitest config maps `src/**/*.test.ts` to the `node` environment, but this hook uses `window.location` and `window.history`. The test file must opt into jsdom via the `// @vitest-environment jsdom` directive. The hook reads `window.location.search` directly (not React Router), so tests use `vi.stubGlobal` to set the URL rather than `MemoryRouter`.

- [ ] **Step 1: Write failing tests first**

Create `useDashboardFilters.test.ts`:

```typescript
// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useDashboardFilters } from './useDashboardFilters'

function setUrl(search: string) {
  vi.stubGlobal('location', { search, pathname: '/', href: `http://localhost/${search}` })
  vi.stubGlobal('history', { replaceState: vi.fn() })
}

beforeEach(() => { setUrl('') })
afterEach(() => { vi.unstubAllGlobals() })

describe('useDashboardFilters', () => {
  it('returns default period=this_month and compareWith=null when URL is empty', () => {
    const { result } = renderHook(() => useDashboardFilters())
    expect(result.current.period).toBe('this_month')
    expect(result.current.compareWith).toBeNull()
    expect(result.current.customFrom).toBeNull()
    expect(result.current.customTo).toBeNull()
  })

  it('reads period and compare from URL on mount', () => {
    setUrl('?period=last_month&compare=last_year')
    const { result } = renderHook(() => useDashboardFilters())
    expect(result.current.period).toBe('last_month')
    expect(result.current.compareWith).toBe('last_year')
  })

  it('normalizes invalid period to this_month on mount', () => {
    setUrl('?period=garbage')
    const { result } = renderHook(() => useDashboardFilters())
    expect(result.current.period).toBe('this_month')
  })

  it('normalizes period=custom without from/to to this_month on mount', () => {
    setUrl('?period=custom')
    const { result } = renderHook(() => useDashboardFilters())
    expect(result.current.period).toBe('this_month')
  })

  it('normalizes period=custom with from > to to this_month on mount', () => {
    setUrl('?period=custom&from=2026-03-31&to=2026-03-01')
    const { result } = renderHook(() => useDashboardFilters())
    expect(result.current.period).toBe('this_month')
  })

  it('accepts valid period=custom with from and to', () => {
    setUrl('?period=custom&from=2026-03-01&to=2026-03-31')
    const { result } = renderHook(() => useDashboardFilters())
    expect(result.current.period).toBe('custom')
    expect(result.current.customFrom).toBe('2026-03-01')
    expect(result.current.customTo).toBe('2026-03-31')
  })

  it('normalizes invalid compare value to null', () => {
    setUrl('?compare=garbage')
    const { result } = renderHook(() => useDashboardFilters())
    expect(result.current.compareWith).toBeNull()
  })

  it('setPeriod updates period and clears from/to for non-custom', () => {
    setUrl('?period=custom&from=2026-03-01&to=2026-03-31')
    const { result } = renderHook(() => useDashboardFilters())
    act(() => { result.current.setPeriod('this_month') })
    expect(result.current.period).toBe('this_month')
    expect(result.current.customFrom).toBeNull()
    expect(result.current.customTo).toBeNull()
  })

  it('reset restores defaults', () => {
    setUrl('?period=last_month&compare=last_year')
    const { result } = renderHook(() => useDashboardFilters())
    act(() => { result.current.reset() })
    expect(result.current.period).toBe('this_month')
    expect(result.current.compareWith).toBeNull()
  })

  it('resolvedApiParams maps this_month to dateRange=this_month', () => {
    setUrl('?period=this_month')
    const { result } = renderHook(() => useDashboardFilters())
    expect(result.current.resolvedApiParams.dateRange).toBe('this_month')
    expect(result.current.resolvedApiParams.groupBy).toBe('day')
    expect(result.current.resolvedApiParams.compareWith).toBeUndefined()
  })

  it('resolvedApiParams maps last_7_days to explicit startDate/endDate', () => {
    setUrl('?period=last_7_days')
    const { result } = renderHook(() => useDashboardFilters())
    expect(result.current.resolvedApiParams.dateRange).toBeUndefined()
    expect(result.current.resolvedApiParams.startDate).toBeDefined()
    expect(result.current.resolvedApiParams.groupBy).toBe('day')
  })

  it('resolvedApiParams includes compareWith when set', () => {
    setUrl('?period=this_month&compare=previous_period')
    const { result } = renderHook(() => useDashboardFilters())
    expect(result.current.resolvedApiParams.compareWith).toBe('previous_period')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npx vitest run src/pages/sales/hooks/useDashboardFilters.test.ts 2>&1 | tail -20
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `useDashboardFilters`**

Create `useDashboardFilters.ts`:

```typescript
import { useCallback, useMemo, useState } from 'react'
import { subDays, startOfMonth, endOfMonth, subMonths, format } from 'date-fns'

export type DashboardPeriod = 'today' | 'last_7_days' | 'this_month' | 'last_month' | 'custom'
export type DashboardCompare = 'previous_period' | 'last_month' | 'last_year' | null

const VALID_PERIODS: DashboardPeriod[] = ['today', 'last_7_days', 'this_month', 'last_month', 'custom']
const VALID_COMPARES: DashboardCompare[] = ['previous_period', 'last_month', 'last_year']
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

  // Validate custom range
  if (period === 'custom') {
    const fromOk = rawFrom && DATE_RE.test(rawFrom)
    const toOk = rawTo && DATE_RE.test(rawTo)
    const rangeOk = fromOk && toOk && rawFrom! <= rawTo!
    if (!rangeOk) {
      return { period: 'this_month', compareWith, customFrom: null, customTo: null }
    }
    return { period: 'custom', compareWith, customFrom: rawFrom!, customTo: rawTo! }
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
    if (days <= 31) return 'day'
    if (days <= 90) return 'week'
    return 'month'
  }

  const compareParam = compareWith ?? undefined

  switch (period) {
    case 'today':
      return { startDate: todayStr, endDate: todayStr, groupBy: 'day', compareWith: compareParam }
    case 'last_7_days': {
      const from = format(subDays(now, 6), 'yyyy-MM-dd')
      return { startDate: from, endDate: todayStr, groupBy: 'day', compareWith: compareParam }
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
  if (period !== 'this_month') params.set('period', period)
  if (compareWith) params.set('compare', compareWith)
  if (period === 'custom' && customFrom) params.set('from', customFrom)
  if (period === 'custom' && customTo) params.set('to', customTo)
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
    if (next !== 'custom') { setCustomFrom(null); setCustomTo(null) }
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
      writeUrl('custom', compareWith, from, to)
    }
  }, [compareWith])

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
    reset,
    isDefault,
    resolvedApiParams,
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && npx vitest run src/pages/sales/hooks/useDashboardFilters.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/sales/hooks/useDashboardFilters.ts frontend/src/pages/sales/hooks/useDashboardFilters.test.ts
git commit -m "feat(sales): add useDashboardFilters hook with URL sync and validation"
```

---

## Task 6: Frontend — `useDashboardAnalytics` hook

**Files:**
- Create: `frontend/src/pages/sales/hooks/useDashboardAnalytics.ts`
- Create: `frontend/src/pages/sales/hooks/useDashboardAnalytics.test.ts`

- [ ] **Step 1: Write failing tests first**

Create `useDashboardAnalytics.test.ts`:

```typescript
import { renderHook, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useDashboardAnalytics } from './useDashboardAnalytics'

vi.mock('@/services/api', () => ({
  default: { get: vi.fn() },
}))

import api from '@/services/api'

const mockCurrentData = {
  current: {
    metrics: { totalRevenue: 1000, totalOrders: 10, averageOrderValue: 100, newCustomers: 2 },
    periodData: [{ period: '2026-03-01', revenue: 1000, orders: 10, newCustomers: 2, averageOrderValue: 100 }],
    periodStart: '2026-03-01',
    periodEnd: '2026-03-31',
  },
  topCustomers: [],
  topProducts: [],
}

describe('useDashboardAnalytics', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('starts with isLoading=true and no data', () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {})) // never resolves
    const { result } = renderHook(() => useDashboardAnalytics({ dateRange: 'this_month', groupBy: 'day' }))
    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeNull()
  })

  it('returns data and isLoading=false after successful fetch', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: mockCurrentData })
    const { result } = renderHook(() => useDashboardAnalytics({ dateRange: 'this_month', groupBy: 'day' }))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data?.current.metrics.totalRevenue).toBe(1000)
    expect(result.current.error).toBeNull()
  })

  it('sets error on fetch failure and data remains null on first load', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useDashboardAnalytics({ dateRange: 'this_month', groupBy: 'day' }))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.data).toBeNull()
  })

  it('preserves existing data when a subsequent fetch fails', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: mockCurrentData })
      .mockRejectedValueOnce(new Error('Network error'))

    const { result, rerender } = renderHook(
      (params) => useDashboardAnalytics(params),
      { initialProps: { dateRange: 'this_month' as const, groupBy: 'day' as const } },
    )
    await waitFor(() => expect(result.current.data).not.toBeNull())

    rerender({ dateRange: 'last_month', groupBy: 'day' })
    await waitFor(() => expect(result.current.error).not.toBeNull())

    // Data must be preserved — do not blank the UI on refetch failure
    expect(result.current.data?.current.metrics.totalRevenue).toBe(1000)
  })

  it('isFetching is true while request is in-flight after first load', async () => {
    let resolve!: (v: unknown) => void
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: mockCurrentData })
      .mockReturnValueOnce(new Promise((r) => { resolve = r }))

    const { result, rerender } = renderHook(
      (params) => useDashboardAnalytics(params),
      { initialProps: { dateRange: 'this_month' as const, groupBy: 'day' as const } },
    )
    await waitFor(() => expect(result.current.data).not.toBeNull())

    rerender({ dateRange: 'last_month', groupBy: 'day' })
    expect(result.current.isFetching).toBe(true)
    expect(result.current.isLoading).toBe(false) // has prior data
    resolve({ data: mockCurrentData })
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npx vitest run src/pages/sales/hooks/useDashboardAnalytics.test.ts 2>&1 | tail -10
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `useDashboardAnalytics`**

Create `useDashboardAnalytics.ts`:

```typescript
import { useCallback, useEffect, useRef, useState } from 'react'
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

  const fetch = useCallback(async (p: DashboardAnalyticsParams) => {
    if (abortRef.current) abortRef.current.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsFetching(true)
    setError(null)

    try {
      const response = await api.get('/sales/analytics/dashboard', {
        params: Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)),
        signal: controller.signal,
      })
      setData(response.data)
      setIsLoading(false)
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'AbortError' || (err as { name?: string }).name === 'CanceledError') return
      setError(err instanceof Error ? err : new Error(String(err)))
      setIsLoading(false)
      // data is intentionally NOT cleared — preserve prior data on refetch failure
    } finally {
      setIsFetching(false)
    }
  }, [])

  useEffect(() => {
    fetch(params)
    return () => { abortRef.current?.abort() }
  }, [JSON.stringify(params)]) // stringify to deep-compare params object

  return { data, isLoading, isFetching, error }
}
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && npx vitest run src/pages/sales/hooks/useDashboardAnalytics.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/sales/hooks/useDashboardAnalytics.ts frontend/src/pages/sales/hooks/useDashboardAnalytics.test.ts
git commit -m "feat(sales): add useDashboardAnalytics hook with loading state separation"
```

---

## Task 7: Frontend — `DashboardFilterBar` component

**Files:**
- Create: `frontend/src/pages/sales/components/DashboardFilterBar.tsx`
- Modify: `frontend/src/pages/sales/components/index.ts`

- [ ] **Step 1: Implement `DashboardFilterBar`**

Create `DashboardFilterBar.tsx`:

```typescript
import { Box, Button, CircularProgress, FormControl, InputLabel, MenuItem, Select, Tooltip, Typography } from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers'
import { parseISO } from 'date-fns'
import type { DashboardCompare, DashboardPeriod } from '../hooks/useDashboardFilters'

interface DashboardFilterBarProps {
  period: DashboardPeriod
  compareWith: DashboardCompare
  customFrom: string | null
  customTo: string | null
  isFetching: boolean
  isDefault: boolean
  onPeriodChange: (p: DashboardPeriod) => void
  onCompareChange: (c: DashboardCompare) => void
  onCustomRangeChange: (from: string, to: string) => void
  onReset: () => void
}

const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  today: 'Today',
  last_7_days: 'Last 7 Days',
  this_month: 'This Month',
  last_month: 'Last Month',
  custom: 'Custom Range',
}

const COMPARE_LABELS: Record<NonNullable<DashboardCompare>, string> = {
  previous_period: 'Previous Period',
  last_month: 'Same Period Last Month',
  last_year: 'Same Period Last Year',
}

function contextLabel(period: DashboardPeriod, compareWith: DashboardCompare): string {
  const periodLabel = PERIOD_LABELS[period]
  if (!compareWith) return ''
  const compareLabel = COMPARE_LABELS[compareWith]
  return `Showing: ${periodLabel} vs ${compareLabel}`
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
}: DashboardFilterBarProps) {
  const ctx = contextLabel(period, compareWith)
  const compareDisabled = period === 'today'

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 3 }}>
      {/* Period */}
      <FormControl size="small" sx={{ minWidth: 150 }}>
        <InputLabel>Period</InputLabel>
        <Select
          value={period}
          label="Period"
          onChange={(e) => onPeriodChange(e.target.value as DashboardPeriod)}
        >
          <MenuItem value="today">Today</MenuItem>
          <MenuItem value="last_7_days">Last 7 Days</MenuItem>
          <MenuItem value="this_month">This Month</MenuItem>
          <MenuItem value="last_month">Last Month</MenuItem>
          <MenuItem value="custom">Custom Range</MenuItem>
        </Select>
      </FormControl>

      {/* Custom date pickers — only shown when period=custom */}
      {period === 'custom' && (
        <>
          <DatePicker
            label="From"
            value={customFrom ? parseISO(customFrom) : null}
            onChange={(v) => {
              if (v && customTo) onCustomRangeChange(v.toISOString().slice(0, 10), customTo)
            }}
            slotProps={{ textField: { size: 'small' } }}
          />
          <DatePicker
            label="To"
            value={customTo ? parseISO(customTo) : null}
            onChange={(v) => {
              if (v && customFrom) onCustomRangeChange(customFrom, v.toISOString().slice(0, 10))
            }}
            slotProps={{ textField: { size: 'small' } }}
          />
        </>
      )}

      {/* Compare */}
      <Tooltip
        title={compareDisabled ? 'Comparison is not available for Today' : ''}
        placement="top"
      >
        <span> {/* wrapper needed for Tooltip on disabled element */}
          <FormControl size="small" sx={{ minWidth: 210 }} disabled={compareDisabled}>
            <InputLabel>Compare</InputLabel>
            <Select
              value={compareWith ?? ''}
              label="Compare"
              onChange={(e) => onCompareChange((e.target.value || null) as DashboardCompare)}
            >
              <MenuItem value="">No Comparison</MenuItem>
              <MenuItem value="previous_period">Previous Period</MenuItem>
              <MenuItem value="last_month">Same Period Last Month</MenuItem>
              <MenuItem value="last_year">Same Period Last Year</MenuItem>
            </Select>
          </FormControl>
        </span>
      </Tooltip>

      {/* Context label */}
      {ctx && (
        <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
          {ctx}
        </Typography>
      )}

      {/* Spinner */}
      {isFetching && (
        <CircularProgress size={16} sx={{ ml: 'auto' }} />
      )}

      {/* Reset */}
      {!isDefault && (
        <Button variant="outlined" color="inherit" size="small" onClick={onReset}>
          Reset
        </Button>
      )}
    </Box>
  )
}
```

- [ ] **Step 2: Export from index**

In `frontend/src/pages/sales/components/index.ts`, add:

```typescript
export { DashboardFilterBar } from './DashboardFilterBar'
```

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "DashboardFilterBar\|useDashboardFilters" | head -20
```

Expected: no errors for the new files.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/sales/components/DashboardFilterBar.tsx frontend/src/pages/sales/components/index.ts
git commit -m "feat(sales): add DashboardFilterBar component"
```

---

## Task 8: Frontend — Update `SalesStatsCards` for comparison deltas

**Files:**
- Modify: `frontend/src/pages/sales/components/SalesStatsCards.tsx`

The `StatItem` interface currently has a hardcoded `change: string` field. We need to support a `comparisonValue?: number` that the card computes and renders as a delta.

- [ ] **Step 1: Extend `StatItem` interface**

In `SalesStatsCards.tsx`, update `StatItem`:

```typescript
export interface StatItem {
  title: string
  value: string | number
  change?: string            // kept for backwards compatibility (unused if comparisonValue provided)
  trend?: 'up' | 'down'
  icon: React.ElementType
  color: string
  onClick?: () => void
  currentValue?: number      // raw number for delta calculation
  comparisonValue?: number   // raw comparison number; if provided, delta is computed
}
```

- [ ] **Step 2: Add `computeDelta` helper**

Before the component, add:

```typescript
function computeDelta(current: number, comparison: number): { label: string; direction: 'up' | 'down' | 'neutral' } {
  if (comparison === 0 && current > 0) return { label: 'New', direction: 'up' }
  if (comparison === 0 && current === 0) return { label: '0%', direction: 'neutral' }
  const pct = ((current - comparison) / comparison) * 100
  const label = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
  return { label, direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'neutral' }
}
```

- [ ] **Step 3: Update card rendering to use delta when `comparisonValue` is provided**

In the card render, replace the hardcoded change/trend display with:

```typescript
const delta = stat.currentValue != null && stat.comparisonValue != null
  ? computeDelta(stat.currentValue, stat.comparisonValue)
  : null

// In JSX, where the change indicator is rendered:
{delta ? (
  <Typography
    variant="body2"
    color={delta.direction === 'up' ? 'success.main' : delta.direction === 'down' ? 'error.main' : 'text.secondary'}
  >
    {delta.direction === 'up' ? '▲' : delta.direction === 'down' ? '▼' : ''} {delta.label}
  </Typography>
) : stat.change ? (
  // existing change string rendering
  <Typography variant="body2" color={stat.trend === 'up' ? 'success.main' : 'error.main'}>
    {stat.change}
  </Typography>
) : null}
```

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep "SalesStatsCards" | head -10
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/sales/components/SalesStatsCards.tsx
git commit -m "feat(sales): add comparison delta display to SalesStatsCards"
```

---

## Task 9: Frontend — Update `SalesTrendChart` for comparison overlay

**Files:**
- Modify: `frontend/src/pages/sales/components/SalesCharts.tsx`

- [ ] **Step 1: Add `comparisonData` prop to `SalesTrendChart`**

In `SalesCharts.tsx`, find the `SalesTrendChart` component. Update its props interface:

```typescript
interface SalesTrendChartProps {
  labels: string[]
  data: number[]
  comparisonData?: number[]   // NEW — index-aligned comparison series
  loading?: boolean
}
```

- [ ] **Step 2: Add comparison dataset to Chart.js config**

Inside `SalesTrendChart`, update the `chartData` construction to include a second dataset when `comparisonData` is present:

```typescript
const chartData = {
  labels,
  datasets: [
    {
      label: 'Current Period',
      data,
      // ...existing styling...
    },
    ...(comparisonData ? [{
      label: 'Comparison Period',
      data: comparisonData,
      borderColor: 'rgba(99, 102, 241, 0.4)',   // muted version of primary
      backgroundColor: 'transparent',
      borderDash: [6, 3],
      pointRadius: 0,
      tension: 0.4,
      fill: false,
    }] : []),
  ],
}
```

- [ ] **Step 3: Update chart tooltip**

In the Chart.js options, ensure the tooltip shows both values when hovering:

```typescript
plugins: {
  tooltip: {
    callbacks: {
      label: (context) => {
        const label = context.dataset.label ?? ''
        const value = context.parsed.y
        return `${label}: ${formatCurrency(value)}`
      },
    },
  },
  // ...existing plugin options...
}
```

The `formatCurrency` function should already be imported or defined in `SalesCharts.tsx`.

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep "SalesCharts\|SalesTrendChart" | head -10
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/sales/components/SalesCharts.tsx
git commit -m "feat(sales): add comparison overlay to SalesTrendChart"
```

---

## Task 10: Frontend — Wire up `SalesPage`

**Files:**
- Modify: `frontend/src/pages/sales/SalesPage.tsx`

This is the integration task. We replace the manual fetch/period state with the three new hooks and pass comparison data to cards and chart.

- [ ] **Step 1: Remove old state and fetch logic**

Delete these from `SalesPage.tsx`:
- `type PeriodType` declaration
- `period` useState
- `previousPeriodRevenue`, `previousPeriodOrders` useState
- `getDateRange` function
- `fetchSalesData` function
- The `useEffect(() => { fetchSalesData() }, [period])` call
- The `analytics` useState (replaced by hook)
- The `loading` useState (replaced by hook)
- The `topCustomers` useState (replaced by hook — topCustomers now comes from `data.topCustomers`)

Keep: `recentOrders` useState and its `api.get('/sales-orders', ...)` call — this is unrelated and stays.

- [ ] **Step 2: Add new hook imports and wire up**

Add imports:

```typescript
import { DashboardFilterBar } from './components'
import { useDashboardFilters } from './hooks/useDashboardFilters'
import { useDashboardAnalytics } from './hooks/useDashboardAnalytics'
```

In the component body, replace removed state with:

```typescript
const {
  period,
  compareWith,
  customFrom,
  customTo,
  setPeriod,
  setCompare,
  setCustomRange,
  reset,
  isDefault,
  resolvedApiParams,
} = useDashboardFilters()

const { data, isLoading, isFetching, error } = useDashboardAnalytics(resolvedApiParams)

const topCustomers = data?.topCustomers ?? []
const current = data?.current
const comparison = data?.comparison
```

- [ ] **Step 3: Build `stats` array using comparison data**

Replace the hardcoded `stats` array with:

```typescript
const stats: StatItem[] = [
  {
    title: 'Total Sales',
    value: formatCurrency(current?.metrics.totalRevenue ?? 0),
    icon: SalesIcon,
    color: 'primary',
    onClick: () => navigate('/sales/orders'),
    currentValue: current?.metrics.totalRevenue,
    comparisonValue: comparison?.metrics.totalRevenue,
  },
  {
    title: 'Orders',
    value: formatNumber(current?.metrics.totalOrders ?? 0),
    icon: OrdersIcon,
    color: 'info',
    onClick: () => navigate('/sales/orders'),
    currentValue: current?.metrics.totalOrders,
    comparisonValue: comparison?.metrics.totalOrders,
  },
  {
    title: 'Avg Order Value',
    value: formatCurrency(current?.metrics.averageOrderValue ?? 0),
    icon: PaymentsIcon,
    color: 'success',
    currentValue: current?.metrics.averageOrderValue,
    comparisonValue: comparison?.metrics.averageOrderValue,
  },
  {
    title: 'Top Customers',
    value: formatNumber(topCustomers.length),
    icon: CustomersIcon,
    color: 'secondary',
    onClick: () => navigate('/sales/customers'),
  },
]
```

- [ ] **Step 4: Replace the period selector UI with `DashboardFilterBar`**

Remove the `<Box sx={{ mb: 3 }}>...<FormControl>...</FormControl>...</Box>` period selector block.

Replace with:

```tsx
<DashboardFilterBar
  period={period}
  compareWith={compareWith}
  customFrom={customFrom}
  customTo={customTo}
  isFetching={isFetching}
  isDefault={isDefault}
  onPeriodChange={setPeriod}
  onCompareChange={setCompare}
  onCustomRangeChange={setCustomRange}
  onReset={reset}
/>
```

- [ ] **Step 5: Pass `comparisonData` to `SalesTrendChart`**

Update the `SalesTrendChart` call:

```tsx
<SalesTrendChart
  labels={current?.periodData.map((p) => p.period) ?? []}
  data={current?.periodData.map((p) => p.revenue) ?? []}
  comparisonData={comparison?.periodData.map((p) => p.revenue)}
  loading={isLoading}
/>
```

- [ ] **Step 6: Handle error state**

Add an error banner below `DashboardFilterBar`:

```tsx
{error && (
  <Alert severity="error" sx={{ mb: 2 }} action={
    <Button size="small" onClick={() => window.location.reload()}>Retry</Button>
  }>
    Failed to load dashboard data.
  </Alert>
)}
```

Import `Alert` from `@mui/material`.

- [ ] **Step 7: Update loading prop on SalesStatsCards**

```tsx
<SalesStatsCards stats={stats} loading={isLoading} />
```

- [ ] **Step 8: Apply opacity during isFetching**

Wrap the KPI cards + chart section in a Box with conditional opacity:

```tsx
<Box sx={{ opacity: isFetching ? 0.7 : 1, transition: 'opacity 0.2s' }}>
  <SalesStatsCards stats={stats} loading={isLoading} />
  {/* chart grid */}
</Box>
```

- [ ] **Step 9: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "salespage\|SalesPage" | head -20
```

Fix any errors.

- [ ] **Step 10: Run all frontend tests**

```bash
cd frontend && npm run test 2>&1 | tail -20
```

Expected: all pass. Fix any regressions.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/pages/sales/SalesPage.tsx
git commit -m "feat(sales): wire up DashboardFilterBar, useDashboardFilters, useDashboardAnalytics in SalesPage"
```

---

## Task 11: Run all tests and verify

- [ ] **Step 1: Run backend tests**

```bash
cd backend && npm run test 2>&1 | tail -30
```

Expected: all pass including new `sales-analytics.service.spec.ts`.

- [ ] **Step 2: Run frontend tests**

```bash
cd frontend && npm run test 2>&1 | tail -30
```

Expected: all pass.

- [ ] **Step 3: Full TypeScript check**

```bash
cd frontend && npm run type-check && echo "Frontend OK"
cd backend && npx tsc --noEmit && echo "Backend OK"
```

- [ ] **Step 4: Final commit if any fixups**

```bash
git add -p
git commit -m "fix(sales): post-integration cleanup"
```

---

## Implementation Polish Notes

These are implementation-time concerns noted during spec review (not design changes):

1. **Compare disabled tooltip** — `DashboardFilterBar` wraps the disabled Compare control in a `<Tooltip>` explaining why. Already in Task 7.
2. **Context label from resolved labels** — The `contextLabel` function in `DashboardFilterBar` uses `PERIOD_LABELS` and `COMPARE_LABELS` maps (human-readable), not raw enum values. Already in Task 7.
3. **Custom pickers disappear immediately on reset** — `setPeriod('this_month')` in `useDashboardFilters` synchronously clears `customFrom`/`customTo` state before any re-render, so the `DatePicker` fields (which only render when `period === 'custom'`) disappear on the same render cycle. No special handling needed.
