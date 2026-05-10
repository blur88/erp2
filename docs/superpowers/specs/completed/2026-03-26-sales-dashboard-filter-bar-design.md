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
Data fetching. Receives resolved filter state, calls `/sales/analytics/dashboard` (one request), returns `{ data, isLoading, isFetching, error }`.

### SalesPage simplification

Remove: `fetchSalesData`, `getDateRange`, `period` useState, `previousPeriodRevenue`, `previousPeriodOrders`, all bare `api.get` calls for analytics and top-customers.

The separate `api.get('/sales-orders', ...)` call for the Recent Orders table is **kept as-is** — it is unrelated to the analytics endpoint and is not period-scoped.

Replace analytics fetching with: `useDashboardFilters` + `useDashboardAnalytics`. KPI cards and `SalesTrendChart` gain optional comparison props.

### Backend — additive changes only

- Add `compareWith` to `SalesAnalyticsQueryDto`
- Introduce `SalesAnalyticsPeriodBlockDto` (shared block type)
- Update `SalesAnalyticsResponseDto` to `{ current, comparison?, topCustomers, topProducts }`
- Add `computeComparePeriod` to service
- Existing query methods (`calculateSalesMetrics`, `getPeriodData`) called twice when compare is active — no logic changes to those methods

---

## URL Contract

The URL params used in the browser address bar are distinct from the backend DTO field names. `useDashboardFilters` is responsible for mapping between them.

| URL param | Values | Default | Notes |
|---|---|---|---|
| `period` | `today`, `last_7_days`, `this_month`, `last_month`, `custom` | `this_month` | |
| `compare` | `previous_period`, `last_month`, `last_year` | absent = none | `compare=none` never written to URL |
| `from` | `YYYY-MM-DD` | — | Required when `period=custom` |
| `to` | `YYYY-MM-DD` | — | Required when `period=custom` |

**Mapping to backend query params:**

The frontend maps URL state → backend DTO fields as follows when calling the API:

| URL state | Backend query param | Notes |
|---|---|---|
| `period=today` | `startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` | uses explicit dates, not `dateRange=today` enum — avoids backend timezone ambiguity in `parseDateRange` |
| `period=last_7_days` | `startDate=...&endDate=...` | no `dateRange` enum match exists; uses explicit dates |
| `period=this_month` | `dateRange=this_month` | uses existing enum |
| `period=last_month` | `dateRange=last_month` | uses existing enum |
| `period=custom` | `startDate=from&endDate=to` | explicit dates from URL |
| `compare=previous_period` | `compareWith=previous_period` | |
| `compare=last_month` | `compareWith=last_month` | |
| `compare=last_year` | `compareWith=last_year` | |

All periods that use explicit `startDate`/`endDate` send dates as `YYYY-MM-DD` strings. `groupBy` is always sent as a separate param (see table below). The existing `DateRange` enum (`today`, `this_month`, `last_month`, etc.) is used only where the URL `period` value has a direct enum match. `today` and `last_7_days` bypass the enum and send explicit dates to avoid any ambiguity in the backend's `parseDateRange` resolver.

**Compare combinations:** All `period + compare` combinations are permitted — no UI guards are applied. When `period=last_month` and `compare=last_month`, the comparison period resolves to two months ago, which is internally consistent. No special-casing is needed.

**`groupBy` mapping per period:**

| Period | groupBy sent to backend |
|---|---|
| `today` | `day` |
| `last_7_days` | `day` |
| `this_month` | `day` |
| `last_month` | `day` |
| `custom` (≤ 31 days) | `day` |
| `custom` (32–90 days) | `week` |
| `custom` (> 90 days) | `month` |

The same `groupBy` is used for both current and comparison period data fetches, so both series always have the same point count. The backend is responsible for producing exactly `n` points matching the `groupBy` granularity over the requested date range.

**Custom range validation** (enforced in `useDashboardFilters`, not backend):
- Valid only when both `from` and `to` are present, parseable, and `from <= to`
- Any violation → silently normalize to `this_month`, clear `from`/`to` from URL
- Normalization runs on mount, not only on user interaction

**Compare URL parse rules:**
- Missing → none
- Invalid value → none
- `compare=none` → treated as absent, normalized out on next write

**Reset behavior:** removes `period`, `compare`, `from`, and `to` from URL, restoring defaults.

---

## API Contract

### Query DTO addition

```typescript
class SalesAnalyticsQueryDto {
  // ... existing fields unchanged (dateRange, startDate, endDate, groupBy, customerId, salesRepId) ...
  compareWith?: 'previous_period' | 'last_month' | 'last_year'
}
```

### New shared block DTO

```typescript
class SalesAnalyticsPeriodBlockDto {
  metrics: SalesMetricsDto
  periodData: PeriodMetricDto[]
  @Transform(({ value }) => format(value, 'yyyy-MM-dd'))
  periodStart: string   // YYYY-MM-DD — serialized via class-transformer @Transform, not raw Date
  @Transform(({ value }) => format(value, 'yyyy-MM-dd'))
  periodEnd: string     // YYYY-MM-DD
}
```

`periodStart` and `periodEnd` are stored internally as `Date` objects but serialized to `YYYY-MM-DD` strings via `class-transformer`'s `@Transform` decorator on the way out. The existing `SalesAnalyticsResponseDto.periodStart` (a raw `Date`) is superseded by this DTO and removed from the updated response shape.

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

One endpoint, one request. `comparison` is computed server-side when `compareWith` is present.

`computeComparePeriod` receives the already-resolved `{ start, end }` Date objects (output of `parseDateRange`), not the raw DTO enum values. The service resolves concrete dates first, then passes them through.

**Phase 1 — resolve dates and compute comparison window (synchronous):**
```
{ start, end } = parseDateRange(query.dateRange, query.startDate, query.endDate)
{ compareStart, compareEnd } = compareWith
  ? computeComparePeriod(start, end, compareWith)
  : undefined
```

**Phase 2 — fetch all data in parallel:**
```
Promise.all([
  calculateSalesMetrics(start, end),
  getPeriodData(start, end, groupBy),
  getTopCustomers(start, end),
  getTopProducts(start, end),
  ...(compareWith ? [
    calculateSalesMetrics(compareStart, compareEnd),
    getPeriodData(compareStart, compareEnd, groupBy),
  ] : []),
])
```

Since both periods use the same `groupBy`, the backend guarantees equal point counts in `current.periodData` and `comparison.periodData`.

### `computeComparePeriod` semantics

Three explicitly separated branches:

**`previous_period`:**
- Window = exact day count of current range
- `compareEnd` = day before `start`
- `compareStart` = `compareEnd` minus (day count − 1)
- Example: current Mar 1–Mar 31 (31 days) → compare Jan 29–Feb 28

**`last_month`:**
- Subtract one calendar month from both `start` and `end` independently
- Clamp each individually: if the resulting day doesn't exist (e.g. Mar 31 → Feb doesn't have 31 days), clamp to the last day of that month
- Example: Jan 28–Feb 3 → Dec 28–Jan 3. Example: Mar 31–Apr 30 → Feb 28–Mar 30.

**`last_year`:**
- Calendar-aligned: same start/end date, one year back
- Leap year edge case: Feb 29 → Feb 28

All dates use `YYYY-MM-DD` format throughout — backend response, frontend chart labels, URL params, comparison calculation.

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

Compare is **disabled** when `period=today`. Explicit product decision — comparison for a single day is deferred. Note: `period=today` with `groupBy=day` produces a single data point; the line chart will render a degenerate single-point series. This is accepted behavior for this issue — no chart fallback is implemented.

When `period=custom`: two `DatePicker` fields appear inline. Fetch triggers only when both `from` and `to` are valid and `from <= to`. Intermediate edits (mid-typing) do not trigger fetch. Invalid range on blur resets to `this_month`.

### KPI cards — comparison mode

Delta formula: `(current − comparison) / comparison × 100`

Edge cases:
- `comparison === 0` and `current > 0` → display `"New"` (not `+∞`, not `NaN`)
- `comparison === 0` and `current === 0` → display `0%` neutral
- `comparison` absent → hide delta entirely (no placeholder shown)

Positive delta = green ▲, negative = red ▼, zero = neutral.

### Chart — comparison overlay

`SalesTrendChart` gains one new optional prop: `comparisonData?: number[]` (parallel array to existing `data: number[]`, same length).

When `comparisonData` is present:
- Second line: dashed, `alpha(primary, 0.4)`
- Alignment is **index-based** — point `i` in `comparisonData` corresponds to point `i` in `data`; no date-label matching
- Both arrays are the same length (guaranteed by backend, as both use the same `groupBy`)
- Chart tooltips show both values for the hovered index: current period value + comparison value (no comparison date label — index alignment only)

### Loading & error states

All errors come from a single request (one endpoint, one response). There is no separate "compare fetch" — comparison failure means the whole request failed.

| State | Behavior |
|---|---|
| `isLoading` (first load, no data) | Full skeleton — KPI cards + chart placeholder |
| `isFetching` (filter change, data exists) | Existing data at `opacity: 0.7`, spinner in filter row |
| Error on first load | Inline error + Retry below filter bar; KPI/chart hidden |
| Error on refetch | Keep existing data visible; show error banner + Retry; do not blank UI |
| `comparison` absent in response (e.g. `compareWith` not set) | Show current data only; no overlay |
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

- `computeComparePeriod` unit tests must cover: `previous_period` for ranges of 28/29/30/31 days; `last_month` for start/end spanning a month boundary; `last_month` end-day clamping (Mar 31 → Feb 28); `last_year` Feb 29 → Feb 28
- `useDashboardFilters` must be tested for mount-time normalization of invalid URLs: `period=custom` with missing `from`/`to`, invalid date strings, `from > to`
- KPI delta helper must be tested for: `comparison=0, current>0` → `"New"`; `comparison=0, current=0` → `0%`; normal positive/negative cases
- Chart: verify `comparisonData` length always equals `data` length for all period/groupBy combinations
- Error on refetch: mock a successful first load then a failing second request; verify existing `data` is not cleared and error banner appears
- `groupBy` mapping: verify each period value maps to the correct `groupBy` when building the API call
