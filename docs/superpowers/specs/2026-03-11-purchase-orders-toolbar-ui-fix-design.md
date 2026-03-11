# Design: Purchase Orders Toolbar UI Consistency Fix

**Issue:** #76
**Date:** 2026-03-11
**Status:** Approved

## Problem

The `PurchaseOrdersToolbar` search field, filter dropdowns, date inputs, and action buttons are taller than the same elements on other pages (Products, Sales Orders, Invoices). The root cause is that `PurchaseOrdersToolbar.tsx` uses MUI's default `size="medium"` height without the `sx` overrides that enforce the standard `40px` compact height used across all other toolbars.

Additionally, `OrdersToolbar.tsx` has three Select components (Customer, Payment Status, Fulfillment Status) that also lack height overrides — the same underlying bug in a different file.

## Approach

**Use the existing `TYPOGRAPHY_STYLES.searchField.input` constant consistently across all toolbar files.** This constant already defines `{ fontSize: '0.875rem', height: '40px', padding: '8.5px 14px' }`. No new constants are needed — the fix is to make all toolbar elements reference it where they currently don't.

This was chosen over adding a new `toolbarField` constant, which would duplicate `searchField.input` and require keeping two constants in sync.

## Design

### Existing constant (no changes needed)

`TYPOGRAPHY_STYLES.searchField.input` in `frontend/src/constants/typography.ts`:
```ts
{
  fontSize: '0.875rem',
  height: '40px',
  padding: '8.5px 14px',
}
```

### Standard `sx` patterns

**TextField / date input:**
```ts
sx={{
  '& .MuiOutlinedInput-root': {
    height: TYPOGRAPHY_STYLES.searchField.input.height,
    fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
    '& input': {
      padding: TYPOGRAPHY_STYLES.searchField.input.padding,
      fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
    },
  },
}}
```

**FormControl wrapping a Select** (applied to the `FormControl`):
```ts
sx={{
  '& .MuiOutlinedInput-root': {
    height: TYPOGRAPHY_STYLES.searchField.input.height,
    fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
  },
}}
```

**Button** (merged into existing per-button `sx`, alongside any button-specific styles):
```ts
sx={{
  height: TYPOGRAPHY_STYLES.searchField.input.height,
  fontSize: TYPOGRAPHY_STYLES.searchField.input.fontSize,
  // ...existing button-specific styles (color, borderColor, flex, etc.) kept as-is
}}
```

### File changes

#### `frontend/src/pages/purchasing/components/PurchaseOrdersToolbar.tsx`
Add `sx` height/fontSize overrides to all toolbar elements. Currently missing on all of them:

| Element | Fix |
|---------|-----|
| Search TextField | Add `MuiOutlinedInput-root` height + padding overrides |
| Date Filter FormControl/Select | Add `MuiOutlinedInput-root` height override to FormControl |
| From Date TextField (conditional) | Add `MuiOutlinedInput-root` height + padding overrides |
| To Date TextField (conditional) | Add `MuiOutlinedInput-root` height + padding overrides |
| Supplier FormControl/Select | Add `MuiOutlinedInput-root` height override to FormControl |
| Clear Filters Button | Add `height` + `fontSize` to existing `sx` |
| Sort Button | Add `height` + `fontSize` to `sx` |

#### `frontend/src/pages/sales/components/OrdersToolbar.tsx`
Three selects currently use bare `size="medium"` with no height override. TextField already has height override but with hardcoded values — replace with constants:

| Element | Fix |
|---------|-----|
| Search TextField | Replace hardcoded `'0.875rem'` / `'8.5px 14px'` with `TYPOGRAPHY_STYLES.searchField.input.*` |
| Date Filter FormControl | Add `MuiOutlinedInput-root` height override |
| Customer FormControl | Add `MuiOutlinedInput-root` height override |
| Payment Status FormControl | Add `MuiOutlinedInput-root` height override |
| Fulfillment Status FormControl | Add `MuiOutlinedInput-root` height override |
| From/To Date TextFields (conditional) | No change needed (already unstyled, add height override) |

#### `frontend/src/pages/sales/components/InvoicesToolbar.tsx`
Already mostly correct. Standardise to use constants instead of hardcoded values:

| Element | Fix |
|---------|-----|
| Search TextField | Replace hardcoded values with `TYPOGRAPHY_STYLES.searchField.input.*` |
| Date Filter FormControl | Replace hardcoded values with constants; drop redundant `Select`-level `sx` and `MenuProps` font-size overrides (menu items use theme font size, no override needed) |
| From/To Date TextFields (conditional) | Replace hardcoded values with constants |
| Clear Filters Button | Replace hardcoded values with constants |
| Sort Button | Replace hardcoded values with constants |

#### `frontend/src/pages/inventory/components/ProductsToolbar.tsx`
Already uses constants correctly for TextField and Category Select. Buttons need height added:

| Element | Fix |
|---------|-----|
| Export Button | Add `height: TYPOGRAPHY_STYLES.searchField.input.height` (already has `fontSize`) |
| Import Button | Same |
| Calculator Button | Same |

### Result

After the fix, every visible toolbar element across all 4 pages will be `40px` tall, using `TYPOGRAPHY_STYLES.searchField.input` as the single source of truth for that value.

## Out of Scope

- No backend changes
- No new files
- No new constants
- No automated tests (pure styling change)
- No changes to mobile layout logic
- No changes to `MenuProps` font sizes beyond the redundant override in `InvoicesToolbar`
