# PageHeader Spacing Standardization — Design Spec

**Issue:** #271
**Date:** 2026-04-03

## Problem

The gap between `PageHeader` and the content below it (FilterBar, DashboardFilterBar, or table) is 32px (`mb: 4`). This is too large and visually disconnects the page title from the primary action/filter area.

## Decision

Reduce `PageHeader`'s default bottom margin from `mb: 4` (32px) to `mb: 2` (16px).

## Change

**File:** `frontend/src/components/common/PageHeader.tsx`

```diff
- mb: 4,
+ mb: 2,
```

This single change applies uniformly to all pages using `PageHeader` (~75 pages across Sales, Purchasing, Inventory, Accounting, Dashboard, Settings, Audit Logs).

## What stays the same

- `pb: 2` (16px padding below the divider line) — unchanged
- No new props
- No per-page overrides
- No test changes (existing tests do not assert on spacing values)

## Scope

All pages are affected equally. There is no case where a larger gap is preferred — the issue explicitly calls for a consistent 16px across the entire application, including:

- List pages with `FilterBar` (Sales Orders, Products, Customers, etc.)
- Dashboard overview pages with `DashboardFilterBar` (SalesPage, PurchasingPage, InventoryPage)
- Pages going straight to a table/grid (no toolbar)
- Detail/form pages (CreateSalesOrderPage, etc.)
