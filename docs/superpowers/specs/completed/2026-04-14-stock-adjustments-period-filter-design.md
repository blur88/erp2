# Stock Adjustments Period Filter — Design Spec

**Issue**: #365
**Date**: 2026-04-14

## Overview

Add a Period (date range) filter to the Stock Adjustments page, matching the existing pattern used by `InvoicesPage` and `OrdersPage`.

## Backend

No changes required. `GET /inventory/stock-adjustments` already accepts `fromDate` and `toDate` query params, and the service filters by `adjustmentDate` using `BETWEEN`, `>=`, or `<=` as appropriate.

## Frontend Changes

### `StockAdjustmentsPage.tsx`

**Imports** — add:
- `PeriodValue` from `@/types/filterBar.types`
- `getPeriodDateRange, getStartOfWeek` from `@/utils/dateRange`

**`StockAdjustmentFilters` interface** — add:
```ts
period: PeriodValue
```

**`filterConfig`** — add period field (before status) and default:
```ts
fields: [
  { field: 'period', label: 'Period', type: 'period' },
  { field: 'status', label: 'Status', type: 'stock-adjustment-status' },
],
defaults: {
  search: '',
  period: { key: null, from: null, to: null },
  status: null,
},
```

**`dateRange` memo** — identical to `InvoicesPage`:
```ts
const weekStartsOn = getStartOfWeek()
const dateRange = useMemo(() => {
  const period = filterBar.appliedFilters.period
  if (!period || period.key === null) return { fromDate: undefined, toDate: undefined }
  if (period.key === 'custom') return { fromDate: period.from ?? undefined, toDate: period.to ?? undefined }
  const range = getPeriodDateRange(period.key, weekStartsOn)
  return { fromDate: range.from, toDate: range.to }
}, [filterBar.appliedFilters.period, weekStartsOn])
```

**`queryParams` memo** — add:
```ts
fromDate: dateRange.fromDate,
toDate: dateRange.toDate,
```

### `StockAdjustmentsPage.filterbar.test.tsx`

Add three test cases to the existing `describe` block:

1. **Default — no dates sent**: when no period is selected, `useGetStockAdjustmentsQuery` is not called with `fromDate` or `toDate`.
2. **Preset period resolves to dates**: with `?period=this_week` in the URL, query receives `fromDate` and `toDate` matching `/^\d{4}-\d{2}-\d{2}$/`.
3. **No period — no dates**: (same as default, mirrors Orders test naming convention).

## Success Criteria

- Users can select predefined periods (Today, This Week, This Month, etc.) or a custom date range.
- The list updates automatically when the period changes.
- The filter state is correctly managed and can be reset (sends no `fromDate`/`toDate`).
- URL param `?period=this_week` (and `custom` with `from`/`to`) round-trips correctly via `useFilterBar`.
