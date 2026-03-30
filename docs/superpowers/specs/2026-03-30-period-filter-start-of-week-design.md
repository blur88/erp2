# Period Filter Component & Start of Week Setting

**Issues:** #223 (Period Filter Component), #224 (Start of Week Setting)
**Date:** 2026-03-30
**Approach:** Option B — standalone `FilterPeriod` component + centralized utility layer

---

## Overview

Implement a centralized period filtering system across the ERP frontend. All date-range presets (Today, This Week, Last 30 Days, etc.) are defined in one place and consumed by all filter bars. A new `startOfWeek` setting (Sunday/Monday) is added to Regional Settings and used when calculating week-based ranges.

---

## Section 1: Data Layer (Backend + localStorage)

### Backend

Add one integer column to the existing regional settings table:

```
startOfWeek: integer, NOT NULL, DEFAULT 1
valid values: 0 (Sunday), 1 (Monday)
```

Files to change:
- `UpdateRegionalSettingsDto` — add `@IsInt() @IsIn([0, 1]) startOfWeek?: number`
- `RegionalSettingsResponseDto` — expose `startOfWeek: number`
- `settings.service.ts` — include `startOfWeek` in read/write (same pattern as `lowStockThreshold`)
- Migration: `AddStartOfWeekToRegionalSettings`

### Frontend localStorage

On save in `RegionalSettingsPage`:
```ts
localStorage.setItem('startOfWeek', String(data.startOfWeek))
```

On settings load (`useEffect` that calls `setValue`):
```ts
setValue('startOfWeek', s.startOfWeek ?? 1)
```

### Reading in utilities

```ts
export function getStartOfWeek(): 0 | 1 {
  const raw = localStorage.getItem('startOfWeek')
  return raw === '0' ? 0 : 1  // default Monday
}
```

Lives in `src/utils/dateRange.ts` alongside `getPeriodDateRange`.

---

## Section 2: Period Constants & Date Utilities

### `src/constants/periods.ts`

```ts
export const PERIOD_KEYS = [
  'today', 'yesterday',
  'this_week', 'last_week',
  'this_month', 'last_month',
  'this_year', 'last_year',
  'last_7_days', 'last_30_days', 'last_365_days',
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

### `src/utils/dateRange.ts`

Three exported functions:

**`getPeriodDateRange(key: PeriodKey, weekStartsOn: 0 | 1 = 1): { from: string, to: string }`**
Returns ISO date strings using `date-fns`. Week-based presets (`this_week`, `last_week`) pass `weekStartsOn` to `startOfWeek`/`endOfWeek`. All others ignore it.

**`inferPeriodKey(from: string, to: string, weekStartsOn: 0 | 1 = 1): PeriodKey | 'custom'`**
Reverse-maps a date range back to a preset key by comparing against all non-custom presets. Falls back to `'custom'` if no match.

**`getStartOfWeek(): 0 | 1`**
Reads from localStorage, defaults to `1` (Monday).

---

## Section 3: FilterPeriod Component

**`src/components/filters/FilterPeriod.tsx`**

```ts
interface FilterPeriodProps {
  value: PeriodKey
  customFrom: string | null
  customTo: string | null
  onChange: (key: PeriodKey, from?: string, to?: string) => void
}
```

**Behaviour:**
- Renders a MUI `Select` dropdown with all 11 presets + Custom Range, labels from `PERIOD_LABELS`
- When user selects a preset (not custom) → calls `onChange(key)`
- When user selects Custom Range → shows two `DatePicker` fields, calls `onChange('custom', from, to)` once both dates are valid and `from <= to`
- Reads `getStartOfWeek()` internally — parent does not need to pass it
- Uses `pickerFormat` from `localStorage.getItem('dateFormat')` (same pattern as current `DashboardFilterBar`)

**Internal state:** `FilterPeriod` holds `internalFrom` and `internalTo` as local state while the user is filling in a custom range. Once both dates are valid and `from <= to`, it fires `onChange('custom', from, to)` to the parent. This avoids the parent receiving half-filled custom ranges.

**What it does NOT own:**
- No URL sync
- No compare logic

---

## Section 4: useDashboardFilters Refactor

**`src/hooks/useDashboardFilters.ts`**

**1. Expand `DashboardPeriod` type:**
```ts
// after
export type DashboardPeriod = PeriodKey
```

**2. Replace `toApiParams` switch-case:**
Replace hardcoded date calculations with `getPeriodDateRange(period, getStartOfWeek())`. The `groupBy` auto-selection logic (day/week/month based on range length) stays — it is dashboard-specific.

**3. Replace `VALID_PERIODS` array:**
Replace with `PERIOD_KEYS` from constants for URL validation.

**Default period** stays `'this_month'`.

**Public API is unchanged** — all callers remain identical, no dashboard pages need to be touched.

---

## Section 5: DashboardFilterBar Refactor

**`src/components/filters/DashboardFilterBar.tsx`**

Replace the hardcoded period `<Select>` + custom `DatePicker` block with `<FilterPeriod>`:

```tsx
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
```

**Props cleanup:** `onCustomFromChange` and `onCustomToChange` can be removed from `DashboardFilterBarProps` — `FilterPeriod` handles partial custom state internally and only fires `onChange` when both dates are valid.

**Compare dropdown, and all other filters** (customer, supplier, category, etc.) stay exactly as-is.

---

## Section 6: RegionalSettingsPage Update

**`src/pages/settings/RegionalSettingsPage.tsx`**

1. Add `startOfWeek: number` to `RegionalFormData` interface and yup schema (`yup.number().oneOf([0, 1]).required()`), default `1`.
2. Add dropdown in the Date & Time Format section:
```tsx
<TextField select label="Start of Week" ...>
  <MenuItem value={1}>Monday</MenuItem>
  <MenuItem value={0}>Sunday</MenuItem>
</TextField>
```
3. On save: `localStorage.setItem('startOfWeek', String(data.startOfWeek))`
4. On load: `setValue('startOfWeek', s.startOfWeek ?? 1)`

No changes to the preview section.

---

## Section 7: Testing

### Backend
- `update-regional-settings.dto.spec.ts` — add tests for `startOfWeek` validation (valid: 0, 1; invalid: 2, -1, string)
- `settings.controller.spec.ts` — add `startOfWeek` to regional settings read/write tests

### Frontend
- `src/utils/dateRange.test.ts` — unit tests for `getPeriodDateRange` (all 11 keys, both `weekStartsOn` values, edge cases like year boundaries) and `inferPeriodKey`
- `src/hooks/useDashboardFilters.test.ts` — update existing tests to cover new period keys; verify `toApiParams` equivalent produces correct `startDate`/`endDate`
- `src/components/filters/__tests__/DashboardFilterBar.test.tsx` — update to use `FilterPeriod`
- No new test file for `FilterPeriod` itself — logic lives in `dateRange.ts` which is fully unit tested

---

## File Change Summary

| File | Status |
|------|--------|
| `src/constants/periods.ts` | New |
| `src/utils/dateRange.ts` | New |
| `src/components/filters/FilterPeriod.tsx` | New |
| `src/hooks/useDashboardFilters.ts` | Modified |
| `src/components/filters/DashboardFilterBar.tsx` | Modified |
| `src/pages/settings/RegionalSettingsPage.tsx` | Modified |
| Backend: regional settings entity | Modified |
| Backend: `UpdateRegionalSettingsDto` | Modified |
| Backend: `RegionalSettingsResponseDto` | Modified |
| Backend: `settings.service.ts` | Modified |
| Backend: migration | New |
| `src/utils/dateRange.test.ts` | New |
| `src/hooks/useDashboardFilters.test.ts` | Modified |
| `src/components/filters/__tests__/DashboardFilterBar.test.tsx` | Modified |
| Backend: `update-regional-settings.dto.spec.ts` | Modified |
| Backend: `settings.controller.spec.ts` | Modified |
