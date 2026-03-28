# Dashboard Filter Bar — Reusable Across Dashboards

**Date:** 2026-03-27
**Status:** Draft

## Summary

Make `DashboardFilterBar` and `useDashboardFilters` reusable across multiple dashboard pages (Sales Overview, Main Dashboard, Purchasing Dashboard, etc.) by moving them to shared locations and adding a `namespace` parameter to isolate each dashboard's URL state.

## Problem

`DashboardFilterBar` and `useDashboardFilters` currently live inside `pages/sales/` and are used only by `SalesPage`. Other dashboard pages cannot reuse them without importing from a cross-module path, which is a code smell.

## Approach

Option A — move files to shared locations and add a `namespace` param. No changes to the component's prop interface or visual behaviour.

## File Moves

| From | To |
|---|---|
| `src/pages/sales/components/DashboardFilterBar.tsx` | `src/components/dashboard/DashboardFilterBar.tsx` |
| `src/pages/sales/hooks/useDashboardFilters.ts` | `src/hooks/useDashboardFilters.ts` |

**Import updates required after moves:**

1. `SalesPage.tsx` — update imports for both `DashboardFilterBar` and `useDashboardFilters` to their new shared paths. Import `DashboardFilterBar` directly from `'@/components/dashboard/DashboardFilterBar'` and `useDashboardFilters` from `'@/hooks/useDashboardFilters'`.
2. `DashboardFilterBar.tsx` itself — the component imports its types from `'../hooks/useDashboardFilters'` (relative path). After the move, update this import to the new shared hook path `'@/hooks/useDashboardFilters'`.
3. `src/pages/sales/components/index.ts` — remove the `DashboardFilterBar` barrel export. Do not re-export it from the sales barrel; consumers should import directly from `'@/components/dashboard/DashboardFilterBar'`.
4. `src/pages/sales/hooks/useDashboardFilters.test.ts` — update the import path to the new shared location and update all `useDashboardFilters()` call sites (13 total) to pass the `namespace` argument (use `'sales'` as the test namespace).

## Namespace / URL Isolation

`useDashboardFilters` gains a required `namespace: string` parameter. All URL params are prefixed with the namespace so each dashboard's filter state is independent.

```typescript
useDashboardFilters(namespace: string)
```

| Dashboard | Call | URL params |
|---|---|---|
| Sales | `useDashboardFilters('sales')` | `?sales_period=this_month&sales_compare=...` |
| Purchasing | `useDashboardFilters('purchasing')` | `?purchasing_period=this_month&purchasing_compare=...` |
| Main | `useDashboardFilters('main')` | `?main_period=this_month&main_compare=...` |

**Namespace convention:** Use the route path segment of the dashboard page as the namespace value (e.g. if the route is `/sales`, use `'sales'`). This makes namespaces predictable and avoids accidental collisions between pages.

**Namespace validation:** In development, the hook should `console.warn` if an empty string is passed. An empty string produces URL keys like `_period` which are confusing and may conflict.

**Known limitation — `writeUrl` replaces the full query string:** The current `writeUrl` implementation creates a fresh `URLSearchParams` and calls `window.history.replaceState`, replacing all existing query params. This means any unrelated query params on the page URL (pagination, tab state, etc.) will be wiped when the filter changes. This is a pre-existing behaviour and is accepted as-is for this task. Do not change this behaviour as part of this work.

## Component Props — Unchanged

`DashboardFilterBar` props stay exactly the same. The component does not need to know about namespaces — `useDashboardFilters` owns all URL logic.

Example usage on a new dashboard page:

```typescript
const filters = useDashboardFilters('purchasing');

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

## Regional Settings

No additional work needed. `DashboardFilterBar` already reads `localStorage.getItem('dateFormat')` via `toMuiDatePickerFormat()` for the custom date pickers. Dates are stored internally as ISO `yyyy-MM-dd` and displayed in the user's configured format. This behaviour moves with the file unchanged.

## Defaults

All dashboards use the same default: `period = 'this_month'`, `compareWith = null`.

## Period Presets & Comparison Options

All dashboards share the same options for now:

**Period presets:** `today`, `last_7_days`, `this_month`, `last_month`, `custom`

**Comparison options:** `previous_period`, `last_month`, `last_year`, `null` (none)

## Testing

Update the existing test file `src/pages/sales/hooks/useDashboardFilters.test.ts`:

1. Update the import path to the new shared location.
2. Pass `'sales'` as the namespace argument in all 13 existing `useDashboardFilters()` call sites.
3. Add tests for the new namespace prefixing behaviour:
   - Reading URL params: given `?sales_period=last_month` in the URL, the hook should return `period = 'last_month'`
   - Writing URL params: after calling `setPeriod('today')`, the URL should contain `sales_period=today`
   - Namespace isolation: given both `?sales_period=today&purchasing_period=last_month` in the URL, `useDashboardFilters('sales')` returns `today` and `useDashboardFilters('purchasing')` returns `last_month`

No new test files needed.

## Hook Placement Note

`useDashboardFilters` is placed in `src/hooks/` root (alongside `useCurrency.ts`, `useRegionalSettings.ts`) rather than a subdirectory. It is dashboard-domain-specific, but it is shared across multiple page domains (sales, purchasing, main), making the flat shared hooks location more appropriate than a page-specific subdirectory.

## Out of Scope

- Different period presets or comparison options per dashboard (YAGNI — all dashboards use the same options for now)
- Shared/global filter state across dashboards
- Configurable defaults per dashboard
- Fixing the `writeUrl` full-replacement behaviour
