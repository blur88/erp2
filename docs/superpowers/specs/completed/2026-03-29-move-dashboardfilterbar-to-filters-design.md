# Design: Move DashboardFilterBar to filters folder

**Issue:** #212 (partial — folder move only, full unification deferred)
**Date:** 2026-03-29

## Goal

Move `DashboardFilterBar.tsx` and its test into `components/filters/` to co-locate it with the rest of the filter system. No logic changes. Sets up the folder structure for future unification.

## Scope

This is a pure file move. No logic, API, or behaviour changes.

## Changes

| From | To |
|------|----|
| `src/components/dashboard/DashboardFilterBar.tsx` | `src/components/filters/DashboardFilterBar.tsx` |
| `src/components/dashboard/DashboardFilterBar.test.tsx` | `src/components/filters/__tests__/DashboardFilterBar.test.tsx` |

## Import updates

Three consumer files need their import path updated:

- `src/pages/sales/SalesPage.tsx`
- `src/pages/purchasing/PurchasingPage.tsx`
- `src/pages/inventory/InventoryPage.tsx`

Old: `@/components/dashboard/DashboardFilterBar`
New: `@/components/filters/DashboardFilterBar`

## Out of scope

- No changes to `components/filters/index.ts` (DashboardFilterBar is not barrel-exported)
- No subfolder structure (`core/`, `specialized/`, `atoms/`) — deferred to full unification
- No shared utils extraction (date regex, isValidDate) — deferred
- No MUI DatePicker upgrade for FilterDateRange — deferred
- No engine alignment (useDashboardFilters as FilterBar config) — permanently deferred as not worth the complexity cost

## Future work (issue #212 remainder)

- Extract shared date utilities (`ISO_DATE_RE`, `isValidDate`) into `components/filters/utils.ts`
- Upgrade `FilterDateRange` to use MUI DatePicker
- Subfolder structure if the filters folder grows unwieldy
