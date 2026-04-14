# Stock Adjustments Period Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Period (date range) filter to the Stock Adjustments page, mirroring the pattern used by `InvoicesPage` and `OrdersPage`.

**Architecture:** Add `period: PeriodValue` to the filters interface and config, compute `dateRange` via `getPeriodDateRange`, and pass `fromDate`/`toDate` to the existing RTK Query call. The backend already handles these params — no backend changes needed.

**Tech Stack:** React 19, TypeScript, RTK Query, `useFilterBar` hook, `FilterBar` component (renders `FilterPeriod` internally for `type: 'period'` fields), Vitest

---

### Task 1: Write failing tests for the period filter

**Files:**
- Modify: `frontend/src/pages/inventory/__tests__/StockAdjustmentsPage.filterbar.test.tsx`

- [ ] **Step 1: Add three failing test cases to the existing describe block**

Open `frontend/src/pages/inventory/__tests__/StockAdjustmentsPage.filterbar.test.tsx` and append these three tests inside the existing `describe('StockAdjustmentsPage FilterBar', ...)` block (after the last `it(...)` call, before the closing `}`):

```tsx
  it('sends no fromDate or toDate when period is not selected (default)', () => {
    renderPage()

    expect(useGetStockAdjustmentsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fromDate: undefined,
        toDate: undefined,
      }),
    )
  })

  it('restores period=this_week from URL and resolves to fromDate/toDate in the query', () => {
    renderPage('/?period=this_week')

    expect(useGetStockAdjustmentsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fromDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        toDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
  })

  it('sends no fromDate or toDate when period is reset to null', () => {
    renderPage('/?period=this_week')

    // Re-render with no period param (simulates reset)
    renderPage('/')

    expect(useGetStockAdjustmentsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fromDate: undefined,
        toDate: undefined,
      }),
    )
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd frontend && npx vitest run src/pages/inventory/__tests__/StockAdjustmentsPage.filterbar.test.tsx
```

Expected: the three new tests FAIL. The existing tests (`renders the search input`, `restores filters from URL`, `passes no status when unset`, `loads the adjustment referenced by saId`) should still PASS.

---

### Task 2: Implement the period filter in StockAdjustmentsPage

**Files:**
- Modify: `frontend/src/pages/inventory/StockAdjustmentsPage.tsx`

- [ ] **Step 1: Add the missing imports**

At the top of `frontend/src/pages/inventory/StockAdjustmentsPage.tsx`, update the existing `filterBar.types` import to include `PeriodValue`, and add the `dateRange` utilities:

Change:
```ts
import type { FilterBarConfig } from '@/types/filterBar.types'
```
To:
```ts
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'
```

- [ ] **Step 2: Add `period` to the filters interface**

Change:
```ts
interface StockAdjustmentFilters {
  search: string
  status: 'draft' | 'completed' | 'cancelled' | null
}
```
To:
```ts
interface StockAdjustmentFilters {
  search: string
  period: PeriodValue
  status: 'draft' | 'completed' | 'cancelled' | null
}
```

- [ ] **Step 3: Update filterConfig to include the period field and default**

Change:
```ts
  const filterConfig = useMemo<FilterBarConfig<StockAdjustmentFilters>>(
    () => ({
      search: { placeholder: 'Search by adjustment number or notes...' },
      fields: [
        { field: 'status', label: 'Status', type: 'stock-adjustment-status' },
      ],
      defaults: { search: '', status: null },
    }),
    [],
  )
```
To:
```ts
  const filterConfig = useMemo<FilterBarConfig<StockAdjustmentFilters>>(
    () => ({
      search: { placeholder: 'Search by adjustment number or notes...' },
      fields: [
        { field: 'period', label: 'Period', type: 'period' },
        { field: 'status', label: 'Status', type: 'stock-adjustment-status' },
      ],
      defaults: { search: '', period: { key: null, from: null, to: null }, status: null },
    }),
    [],
  )
```

- [ ] **Step 4: Add the dateRange memo**

After `const filterBar = useFilterBar(filterConfig)` and before the `queryParams` memo, add:

```ts
  const weekStartsOn = getStartOfWeek()
  const dateRange = useMemo(() => {
    const period = filterBar.appliedFilters.period
    if (!period || period.key === null) {
      return { fromDate: undefined, toDate: undefined }
    }
    if (period.key === 'custom') {
      return { fromDate: period.from ?? undefined, toDate: period.to ?? undefined }
    }
    const range = getPeriodDateRange(period.key, weekStartsOn)
    return { fromDate: range.from, toDate: range.to }
  }, [filterBar.appliedFilters.period, weekStartsOn])
```

- [ ] **Step 5: Pass fromDate/toDate into queryParams**

Change:
```ts
  const queryParams = useMemo(
    () => ({
      search: filterBar.appliedFilters.search || undefined,
      status: filterBar.appliedFilters.status ?? undefined,
      sortBy: pageState.sorting.sortBy,
      sortOrder: pageState.sorting.sortOrder.toUpperCase(),
    }),
    [filterBar.appliedFilters, pageState.sorting],
  )
```
To:
```ts
  const queryParams = useMemo(
    () => ({
      search: filterBar.appliedFilters.search || undefined,
      status: filterBar.appliedFilters.status ?? undefined,
      fromDate: dateRange.fromDate,
      toDate: dateRange.toDate,
      sortBy: pageState.sorting.sortBy,
      sortOrder: pageState.sorting.sortOrder.toUpperCase(),
    }),
    [filterBar.appliedFilters, dateRange, pageState.sorting],
  )
```

- [ ] **Step 6: Run the tests to verify all pass**

```bash
cd frontend && npx vitest run src/pages/inventory/__tests__/StockAdjustmentsPage.filterbar.test.tsx
```

Expected: all 7 tests PASS.

- [ ] **Step 7: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/pages/inventory/StockAdjustmentsPage.tsx \
        frontend/src/pages/inventory/__tests__/StockAdjustmentsPage.filterbar.test.tsx
git commit -m "feat(inventory): add Period filter to Stock Adjustments page (#365)"
```
