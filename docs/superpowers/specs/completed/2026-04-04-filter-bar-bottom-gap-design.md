# Filter Bar Bottom Gap Standardization — Design Spec

**Issue:** #272
**Date:** 2026-04-04
**Status:** Approved

## Overview

Standardize the bottom margin below the filter bar to 16px (`mb: 2`) across all pages, matching the 16px top gap established in issue #271. This creates a symmetrical 16px/16px spacing above and below the filter bar on every page.

## Scope

### Files changed (5 one-line edits)

| File | Location | Change |
|------|----------|--------|
| `frontend/src/components/filters/DashboardFilterBar.tsx` | Line 78, root `Box` sx | `mb: 3` → `mb: 2` |
| `frontend/src/pages/sales/OrdersPage.tsx` | Line 246, wrapping `Box` | `mb: 3` → `mb: 2` |
| `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx` | Line 186, wrapping `Box` | `mb: 3` → `mb: 2` |
| `frontend/src/pages/inventory/ProductsPage.tsx` | Line 142, wrapping `Stack` | `mb: 3` → `mb: 2` |
| `frontend/src/pages/sales/CustomersPage.tsx` | Line 426, wrapping `Box` | `mb: 3` → `mb: 2` |

### Out of scope

- `InvoicesPage.tsx` — no filter bar present, deferred
- `FilterBar.tsx` — no internal margin, no change needed
- `PageHeader` spacing — handled in issue #271

## Notes

- `DashboardFilterBar` owns its own bottom margin internally (`mb` on the root `Box`), so one edit fixes both dashboard pages (`SalesPage`, `PurchasingPage`).
- List pages own the margin externally via a wrapping `Box` or `Stack`, so each page needs its own edit.
- `ProductsPage` uses a `Stack` with transition styles — only `mb` changes, other styles are preserved.
