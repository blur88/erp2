# Design: Purchase Orders Toolbar UI Consistency Fix

**Issue:** #76
**Date:** 2026-03-11
**Status:** Approved

## Problem

The `PurchaseOrdersToolbar` search field, filter dropdowns, date inputs, and action buttons are taller than the same elements on other pages (Products, Sales Orders, Invoices). The root cause is that `PurchaseOrdersToolbar.tsx` uses MUI's default `size="medium"` height without the `sx` overrides that enforce the standard `40px` compact height.

The same bug also exists in `OrdersToolbar.tsx`: the Customer, Payment Status, Fulfillment Status selects and the From/To date fields, Clear Filters button, and Sort button all lack height overrides.

## Approach

**Use the existing `TYPOGRAPHY_STYLES.searchField.input` constant consistently across all toolbar files.** This constant already defines `{ fontSize: '0.875rem', height: '40px', padding: '8.5px 14px' }`. No new constants are needed — the fix is to make all toolbar elements reference it where they currently don't, and replace hardcoded values with it where they exist.

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

Note: `ProductsToolbar`'s Category Select applies the height override at the `Select` element level (`sx={{ height: ..., '& .MuiSelect-select': { height: ... } }}`), which is a legacy exception. New fixes should use the `FormControl`-level `MuiOutlinedInput-root` pattern above.

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
All toolbar elements currently missing `sx` height overrides. Add to each:

| Element | Fix |
|---------|-----|
| Search TextField | Add `MuiOutlinedInput-root` height + padding overrides |
| Date Filter FormControl | Add `MuiOutlinedInput-root` height override |
| From Date TextField (conditional) | Add `MuiOutlinedInput-root` height + padding overrides |
| To Date TextField (conditional) | Add `MuiOutlinedInput-root` height + padding overrides |
| Supplier FormControl | Add `MuiOutlinedInput-root` height override |
| Clear Filters Button | Add `height` + `fontSize` to `sx` |
| Sort Button | Add `height` + `fontSize` to `sx` |

#### `frontend/src/pages/sales/components/OrdersToolbar.tsx`
Several elements missing height overrides; TextField has them but hardcoded:

| Element | Current state | Fix |
|---------|--------------|-----|
| Search TextField | Has height override with hardcoded `'0.875rem'` / `'8.5px 14px'` | Replace hardcoded values with `TYPOGRAPHY_STYLES.searchField.input.*` |
| Date Filter FormControl | No height override | Add `MuiOutlinedInput-root` height override |
| From Date TextField (conditional) | No height override (`sx={{ minWidth: 120 }}` only) | Add `MuiOutlinedInput-root` height + padding overrides |
| To Date TextField (conditional) | No height override (`sx={{ minWidth: 120 }}` only) | Add `MuiOutlinedInput-root` height + padding overrides |
| Customer FormControl | No height override | Add `MuiOutlinedInput-root` height override |
| Payment Status FormControl | No height override | Add `MuiOutlinedInput-root` height override |
| Fulfillment FormControl | No height override | Add `MuiOutlinedInput-root` height override |
| Clear Filters Button | No `sx` at all | Add `sx` with `height` + `fontSize` |
| Sort Button | No `sx` at all | Add `sx` with `height` + `fontSize` |

#### `frontend/src/pages/sales/components/InvoicesToolbar.tsx`
Mostly correct but uses hardcoded values instead of constants, and has redundant Select-level overrides:

| Element | Current state | Fix |
|---------|--------------|-----|
| Search TextField | Height uses constant; `fontSize` and `padding` hardcoded | Replace hardcoded `'0.875rem'` / `'8.5px 14px'` with constants |
| Date Filter FormControl | Height uses constant; `fontSize` hardcoded. Select also has redundant `sx` with `'& .MuiSelect-select': { padding, fontSize }` and `MenuProps` font overrides | Replace hardcoded values with constants; remove redundant `Select`-level `sx` block and `MenuProps` (menu items inherit theme font size) |
| From Date TextField (conditional) | Height uses constant; `fontSize` hardcoded; missing `'& input': { padding }` sub-rule | Replace hardcoded `'0.875rem'` with constant; add missing `padding` sub-rule |
| To Date TextField (conditional) | Height uses constant; `fontSize` hardcoded; missing `'& input': { padding }` sub-rule | Replace hardcoded `'0.875rem'` with constant; add missing `padding` sub-rule |
| Clear Filters Button | Height uses constant; `fontSize` hardcoded | Replace hardcoded `'0.875rem'` with constant |
| Sort Button | Height uses constant; `fontSize` hardcoded | Replace hardcoded `'0.875rem'` with constant |

#### `frontend/src/pages/inventory/components/ProductsToolbar.tsx`
Already fully correct — uses `TYPOGRAPHY_STYLES.searchField.input.*` for all elements including all buttons. **No changes needed.**

### Result

After the fix, every visible toolbar element across `PurchaseOrdersToolbar`, `OrdersToolbar`, and `InvoicesToolbar` will be `40px` tall, using `TYPOGRAPHY_STYLES.searchField.input` as the single source of truth. `ProductsToolbar` is already correct and unchanged.

## Out of Scope

- No backend changes
- No new files
- No new constants
- No automated tests (pure styling change)
- No changes to mobile layout logic
- Header-area action buttons (View Deleted, Create Order, Add Product, etc.) are intentionally excluded — `ProductsToolbar` (the reference) also has no height override on these, so the standard is filter-area elements only
- `slotProps` vs `InputProps` API inconsistency across toolbar files is out of scope for this styling fix
