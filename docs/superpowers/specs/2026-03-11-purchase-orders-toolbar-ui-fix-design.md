# Design: Purchase Orders Toolbar UI Consistency Fix

**Issue:** #76
**Date:** 2026-03-11
**Status:** Approved

## Problem

The `PurchaseOrdersToolbar` search field, filter dropdowns, date inputs, and action buttons are taller than the same elements on other pages (Products, Sales Orders, Invoices). The root cause is that `PurchaseOrdersToolbar.tsx` uses MUI's default `size="medium"` height without the `sx` overrides that enforce the standard `40px` compact height used across all other toolbars.

## Approach

**Option B — Shared constant (chosen).** Extract the repeated `sx` height/padding overrides that already exist across 4 toolbar files into a new `toolbarField` section of `TYPOGRAPHY_STYLES`. Then use that constant in all 4 toolbars, including adding it to the currently-missing `PurchaseOrdersToolbar`.

This was chosen over:
- Option A (direct per-file fix only) — already have 15+ duplicate overrides across 4 files, this would add more
- Option C (shared component) — toolbars differ enough in structure that a component abstraction would fight the differences

## Design

### 1. New constant: `TYPOGRAPHY_STYLES.toolbarField`

Add to `frontend/src/constants/typography.ts`:

```ts
toolbarField: {
  textField: {
    '& .MuiOutlinedInput-root': {
      height: '40px',
      fontSize: '0.875rem',
      '& input': {
        padding: '8.5px 14px',
        fontSize: '0.875rem',
      },
    },
  },
  select: {
    '& .MuiOutlinedInput-root': {
      height: '40px',
      fontSize: '0.875rem',
    },
  },
  button: {
    height: '40px',
    fontSize: '0.875rem',
  },
}
```

Values align with `TYPOGRAPHY_STYLES.searchField.input.*` — no new magic numbers.

### 2. File changes

| File | Change |
|------|--------|
| `frontend/src/constants/typography.ts` | Add `toolbarField` section |
| `frontend/src/pages/purchasing/components/PurchaseOrdersToolbar.tsx` | Add `sx` overrides to all 6 toolbar elements using `TYPOGRAPHY_STYLES.toolbarField.*` |
| `frontend/src/pages/sales/components/OrdersToolbar.tsx` | Replace existing inline `sx` overrides with `TYPOGRAPHY_STYLES.toolbarField.*` spreads |
| `frontend/src/pages/sales/components/InvoicesToolbar.tsx` | Same |
| `frontend/src/pages/inventory/components/ProductsToolbar.tsx` | Same (includes Export, Import, Calculator buttons) |

### 3. Elements affected in PurchaseOrdersToolbar

- Search TextField
- Date Filter Select (FormControl)
- From Date TextField (custom range)
- To Date TextField (custom range)
- Supplier Select (FormControl)
- Clear Filters Button
- Sort Button

After the fix all elements in the toolbar will be `40px` tall, matching Products, Sales Orders, and Invoices pages.

## Out of Scope

- No backend changes
- No new files
- No automated tests (pure styling change)
- No changes to mobile layout logic
