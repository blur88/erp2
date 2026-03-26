# Sales Dashboard Filter Bar (Lite) — Design Spec

**Issue:** #190
**Date:** 2026-03-26
**Scope:** Period + Compare filters for Sales Overview dashboard. Customer/Product segmentation deferred to a follow-up issue.

---

## Summary

Replace the single `<Select>` period dropdown on `SalesPage` with a purpose-built `DashboardFilterBar` component backed by a comparison-aware analytics API. This is a full-stack feature: new backend response shape + frontend filter UI + comparison-aware KPI cards and chart.

The dashboard is an analytics view, not a list page. The shared `FilterBar` system is not used — it is designed for transactional list filtering and carries machinery (chips, drawer, Apply button, debounced search) that does not belong here.

---

## Architecture

### Frontend — three new units

**`DashboardFilterBar`** (`src/pages/sales/components/DashboardFilterBar.tsx`)
UI only. Renders Period + Compare dropdowns in a single row. Fires `onChange` instantly. No chips, no drawer, no Apply button.

**`useDashboardFilters`** (`src/pages/sales/hooks/useDashboardFilters.ts`)
State + URL sync. Owns `{ period, compareWith, from?, to? }`. Reads initial values from URL on mount (normalizing invalid state immediately). Writes back via `replaceState`. Single source of truth for custom-range validation.

**`useDashboardAnalytics`** (`src/pages/sales/hooks/useDashboardAnalytics.ts`)
Data fetching. Receives resolved filter state, calls `/sales/analytics/dashboard`, returns `{ data, isLoading, isFetching, error }`.

### SalesPage simplification

Remove: `fetchSalesData`, `getDateRange`, `period` useState, `previousPeriodRevenue`, `previousPeriodOrders`, all bare `api.get` calls.
Replace with: `useDashboardFilters` + `useDashboardAnalytics`. KPI cards and `SalesTrendChart` gain optional comparison props.

### Backend — additive changes only

- Add `compareWith` to `SalesAnalyticsQueryDto`
- Introduce `SalesAnalyticsPeriodBlockDto` (shared block type)
- Update `SalesAnalyticsResponseDto` to `{ current, comparison?, topCustomers, topProducts }`
- Add `computeComparePeriod` to service
- Existing query methods (`calculateSalesMetrics`, `getPeriodData`) called twice when compare is active — no logic changes to those methods

---

## URL Contract

| Param | Values | Default | Notes |
|---|---|---|---|
| `period` | `today`, `last_7_days`, `this_month`, `last_month`, `custom` | `this_month` | |
| `compare` | `previous_period`, `last_month`, `last_year` | absent = none | `compare=none` never written to URL |
| `from` | `YYYY-MM-DD` | — | Required when `period=custom` |
| `to` | `YYYY-MM-DD` | — | Required when `period=custom` |

**Custom range validation** (enforced in `useDashboardFilters`, not backend):
- Valid only when both `from` and `to` are present, parseable, and `from <= to`
- Any violation → silently normalize to `this_month`, clear `from`/`to` from URL
- Normalization runs on mount, not only on user interaction

**Compare URL parse rules:**
- Missing → none
- Invalid value → none
- `compare=none` → treated as absent, normalized out on next write

**Reset behavior:** removes both `period` and `compare` (and `from`/`to`) from URL, restoring defaults.

---

## API Contract

### Query DTO addition

```typescript
class SalesAnalyticsQueryDto {
  // ... existing fields unchanged ...
  compareWith?: 'previous_period' | 'last_month' | 'last_year'
}
```

### New shared block DTO

```typescript
class SalesAnalyticsPeriodBlockDto {
  metrics: SalesMetricsDto
  periodData: PeriodMetricDto[]
  periodStart: string   // YYYY-MM-DD — date-only, consistent everywhere
  periodEnd: string     // YYYY-MM-DD
}
```

### Updated response DTO

```typescript
class SalesAnalyticsResponseDto {
  current: SalesAnalyticsPeriodBlockDto
  comparison?: SalesAnalyticsPeriodBlockDto   // omitted when compareWith not set
  topCustomers: TopCustomerDto[]              // current period only
  topProducts: TopProductDto[]               // current period only
}
```

### Service data flow

Always fetch in parallel:
- `calculateSalesMetrics(start, end)` → `current.metrics`
- `getPeriodData(start, end, groupBy)` → `current.periodData`
- `getTopCustomers(start, end)`
- `getTopProducts(start, end)`

Additionally, when `compareWith` is set:
- `computeComparePeriod(start, end, compareWith)` → `{ compareStart, compareEnd }`
- `calculateSalesMetrics(compareStart, compareEnd)` → `comparison.metrics`
- `getPeriodData(compareStart, compareEnd, groupBy)` → `comparison.periodData`

### `computeComparePeriod` semantics

Three explicitly separated branches:

**`previous_period`:**
- Window = exact day count of current range
- `compareEnd` = day before `start`
- `compareStart` = `compareEnd` minus (day count − 1)
- Example: current Mar 1–Mar 31 (31 days) → previous Jan 29–Feb 28

**`last_month`:**
- Calendar-aligned: same start/end day, one calendar month back
- If end day doesn't exist in target month (e.g. Mar 31 → Feb 28), clamp to last day of month

**`last_year`:**
- Calendar-aligned: same start/end date, one year back
- Leap year edge case: Feb 29 → Feb 28

All dates use `YYYY-MM-DD` format throughout — backend response, chart labels, URL params, comparison calculation.

### `useDashboardAnalytics` return shape

```typescript
{
  data: {
    current: SalesAnalyticsPeriodBlock
    comparison?: SalesAnalyticsPeriodBlock
    topCustomers: TopCustomer[]
    topProducts: TopProduct[]
  } | null
  isLoading: boolean   // true on first load only (no prior data)
  isFetching: boolean  // true whenever a request is in-flight
  error: Error | null
}
```

---

## UI Behavior

### DashboardFilterBar layout

```
[Period ▼]  [Compare ▼]    Showing: This Month vs Last Month    [⟳] [Reset]
```

- Single row, instant apply on selection change
- Context text (center-left) shown only when compare is active
- Spinner size=16 at right of filter row during `isFetching` — no layout shift
- Reset button shown only when either filter differs from default

**Period options:** Today / Last 7 Days / This Month / Last Month / Custom Range
**Compare options:** No Comparison / Previous Period / Same Period Last Month / Same Period Last Year

Compare is **disabled** when `period=today`. Explicit product decision — `previous_period` for a single day is ambiguous; deferred.

When `period=custom`: two `DatePicker` fields appear inline. Fetch triggers only when both `from` and `to` are valid and `from <= to`. Intermediate edits do not trigger fetch. Invalid range on blur resets to `this_month`.

### KPI cards — comparison mode

Delta formula: `(current − comparison) / comparison × 100`

Edge cases:
- `comparison === 0` and `current > 0` → display `"New"` (not `+∞`, not `NaN`)
- `comparison === 0` and `current === 0` → display `0%` neutral
- `comparison` absent → hide delta entirely (no placeholder shown)

Positive delta = green ▲, negative = red ▼, zero = neutral.

### Chart — comparison overlay

`SalesTrendChart` accepts optional `comparisonData` series. When present:
- Second line: dashed, `alpha(primary, 0.4)`
- Alignment is **index-based** — comparison series mapped proportionally across current range length, not date-label-matched
- Both series always have the same point count (backend responsibility)

### Loading & error states

| State | Behavior |
|---|---|
| `isLoading` (first load, no data) | Full skeleton — KPI cards + chart placeholder |
| `isFetching` (filter change, data exists) | Existing data at `opacity: 0.7`, spinner in filter row |
| Error on first load | Inline error + Retry below filter bar; KPI/chart hidden |
| Error on refetch | Keep existing data visible; show error banner + Retry; do not blank UI |
| Compare fetch failure | Suppress comparison overlay silently; current data shown normally |
| `period=custom` invalid URL on mount | Silently normalize to `this_month`; no error shown |

**Opacity:** `0.7` everywhere (standardized).

---

## Out of Scope (this issue)

- Customer filter (deferred — full-dashboard scoping is a separate issue)
- Product / category filter (deferred — same reason)
- Saved dashboard views
- Exported / scheduled reports
- Automated growth insights
- Compare enabled for `period=today`

---

## Testing Notes

- `computeComparePeriod` unit tests must cover: month-boundary edge cases, leap years (Feb 29 → Feb 28), `previous_period` for ranges of 28/29/30/31 days
- `useDashboardFilters` must be tested for mount-time normalization of invalid URLs
- KPI delta helper must be tested for division-by-zero cases (`comparison=0`, `current=0`, `current>0`)
- Chart alignment: verify both series have equal point count for mismatched month lengths
- Error on refetch: verify existing data is not cleared when a subsequent fetch fails
