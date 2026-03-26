# Dashboard Filter Bar — Reusable Across Dashboards

**Date:** 2026-03-27
**Status:** Approved

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

`SalesPage` updates its import paths. No other changes to `SalesPage`.

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

No new test files needed. The only new logic is URL param key prefixing (`${namespace}_period`, etc.), which is verified by confirming SalesPage continues to work correctly after the migration.

## Out of Scope

- Different period presets or comparison options per dashboard (YAGNI — all dashboards use the same options for now)
- Shared/global filter state across dashboards
- Configurable defaults per dashboard
