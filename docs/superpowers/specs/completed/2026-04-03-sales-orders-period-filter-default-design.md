# Design: Sales Orders Period Filter — Position & Default

**Issue:** #266
**Date:** 2026-04-03

## Summary

Rearrange the period filter to appear immediately after the search box on the Sales Orders page, and change its default to "no selection" (no date filtering applied) rather than "This Month".

## Requirements

1. Period filter is the first field after the search box in the filter bar.
2. By default, no period is selected — the dropdown shows "Period" as a greyed-out placeholder (matching the behaviour of Customer and Payment dropdowns).
3. When no period is selected, no `fromDate` or `toDate` params are sent to the API — all orders are returned.

## Approach

Use `null` as the unselected state for `PeriodValue.key`. No new constants are needed.

## Changes

### `frontend/src/types/filterBar.types.ts`

Change `PeriodValue.key` type from `PeriodKey` to `PeriodKey | null`.

```ts
export type PeriodValue = {
  key: PeriodKey | null
  from: string | null
  to: string | null
}
```

### `frontend/src/components/filters/FilterPeriod.tsx`

- Update `value` prop type to `PeriodKey | null`.
- Add `displayEmpty` to the MUI `Select` so it renders correctly with no selection.
- When `value` is `null`, the Select shows the placeholder label greyed out.
- No change to `onChange` logic.

### `frontend/src/pages/sales/OrdersPage.tsx`

- Move `period` field to the first position in `fields[]`.
- Set default: `period: { key: null, from: null, to: null }`.
- Update `dateRange` logic: when `period.key` is `null`, return `{ fromDate: undefined, toDate: undefined }`.

```ts
const dateRange = useMemo(() => {
  const period = appliedFilters.period
  if (!period || period.key === null) {
    return { fromDate: undefined, toDate: undefined }
  }
  if (period.key === 'custom') {
    return { fromDate: period.from ?? undefined, toDate: period.to ?? undefined }
  }
  const range = getPeriodDateRange(period.key, weekStartsOn)
  return { fromDate: range.from, toDate: range.to }
}, [appliedFilters.period, weekStartsOn])
```

## What Does NOT Change

- `frontend/src/constants/periods.ts` — no new constants or keys
- `frontend/src/utils/dateRange.ts` — `getPeriodDateRange` is not called when key is null
- All other pages using `FilterPeriod` — unaffected (Sales Orders is the only consumer)

## Out of Scope

- Adding "All Time" as a named, selectable option to shared constants
- Changes to other pages' period filter defaults
