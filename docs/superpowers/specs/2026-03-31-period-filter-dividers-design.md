# Period Filter Dividers — Design Spec

**Issue:** #230
**Date:** 2026-03-31
**Status:** Approved

## Problem

`FilterPeriod.tsx` renders all period options in a single flat list, making it hard to scan quickly.

## Solution

Add visual `<Divider />` separators between four logical groups in the period dropdown. No group headers — dividers only.

## Group Order

| Group | Options |
|---|---|
| Current | Today, This Week, This Month, This Year |
| Past | Yesterday, Last Week, Last Month, Last Year |
| Rolling | Last 7 Days, Last 30 Days, Last 365 Days |
| Custom | Custom Range |

Dividers appear between groups (not after the last group).

## Changes

### `frontend/src/constants/periods.ts`

Add `PERIOD_GROUPS: PeriodKey[][]` — an array of arrays defining display order and group boundaries:

```ts
export const PERIOD_GROUPS: PeriodKey[][] = [
  ['today', 'this_week', 'this_month', 'this_year'],
  ['yesterday', 'last_week', 'last_month', 'last_year'],
  ['last_7_days', 'last_30_days', 'last_365_days'],
  ['custom'],
]
```

`PERIOD_KEYS` and `PERIOD_LABELS` are unchanged.

### `frontend/src/components/filters/FilterPeriod.tsx`

- Import `Divider` from `@mui/material`
- Import `PERIOD_GROUPS` from `@/constants/periods`
- Replace the `PERIOD_KEYS.map(...)` render with a loop over `PERIOD_GROUPS`, inserting `<Divider />` between groups (index-based, not after last group)

MUI `<Divider />` inside `<Select>` is non-interactive and naturally skipped by keyboard navigation.

## Out of Scope

- Group header labels
- Changes to any other file
- Backend changes
