# Purchasing Module AppButton Standardization

**Issue:** #368  
**Date:** 2026-04-15  
**Pattern reference:** Sales module AppButton standardization (PR #369)

## Goal

Replace all raw MUI `Button` and `IconButton` usages in Purchasing module context headers and the overview page with the `AppButton` component, matching the pattern established in the Sales module.

## Scope

Five files require changes:

1. `frontend/src/pages/purchasing/PurchasingPage.tsx`
2. `frontend/src/pages/purchasing/components/SupplierContextHeader.tsx`
3. `frontend/src/pages/purchasing/components/PurchaseOrderContextHeader.tsx`
4. `frontend/src/pages/purchasing/components/GRNContextHeader.tsx`
5. `frontend/src/pages/purchasing/components/VendorPaymentContextHeader.tsx`

## Changes Per File

### PurchasingPage.tsx

The error `Alert` action contains a bare `Button`:

```tsx
// Before
<Button size="small" onClick={() => window.location.reload()}>Retry</Button>

// After
<AppButton size="small" variant="secondary" onClick={() => window.location.reload()}>Retry</AppButton>
```

Remove `Button` from MUI imports; add `AppButton` import.

### SupplierContextHeader.tsx

Header bar has Edit + Delete `IconButton` components. Replace with labelled `AppButton`s and remove the `actionIconSx` constant:

| Button | Old | New variant |
|--------|-----|-------------|
| Edit | `IconButton` color `primary.main` | `secondary` |
| Delete | `IconButton` color `error.main` | `danger` |

Both use `size="small"` with `startIcon`.

Remove `IconButton` from MUI imports; remove `actionIconSx`; add `AppButton` import.

### PurchaseOrderContextHeader.tsx

**Header bar icons** (Edit, Delete, Print):

| Button | New variant |
|--------|-------------|
| Edit | `secondary` |
| Delete | `danger` |
| Print | `secondary` |

**Workflow buttons** (in the Payment and Receiving table row):

| Button | Condition | Old color | New variant |
|--------|-----------|-----------|-------------|
| Pay | `!hasPayment` | `primary` | `primary` |
| Unpay | `hasPayment` | `warning` | `warning` |
| Return | `isReceived` | `warning` | `warning` |
| Receive | `!isReceived` | `success` | `success` |

Remove `Button`, `IconButton` from MUI imports; remove `actionIconSx`; add `AppButton` import.

### GRNContextHeader.tsx

Header bar has a single Print `IconButton`. Replace with `AppButton size="small" variant="secondary" startIcon={<PrintIcon/>}` with label "Print".

Remove `IconButton` from MUI imports; remove `actionIconSx`; add `AppButton` import.

### VendorPaymentContextHeader.tsx

Same as GRNContextHeader — single Print `IconButton` in header bar. Same replacement.

Remove `IconButton` from MUI imports; remove `actionIconSx`; add `AppButton` import.

## Variant Mapping

| Old MUI usage | AppButton variant |
|---------------|-------------------|
| `Button color="primary" variant="contained"` | `primary` |
| `Button color="warning" variant="contained"` | `warning` |
| `Button color="success" variant="contained"` | `success` |
| `IconButton color="error.main"` / delete action | `danger` |
| `IconButton color="primary.main"` / `color="info.main"` | `secondary` |

## Tests

`SupplierContextHeader.test.tsx` exists. It queries buttons by role/label — no changes needed since `AppButton` renders a `<button>` element. Verify it still passes after the refactor; no new test cases required as no behavior changes.

## Success Criteria

- No direct `Button` or `IconButton` usage for command actions in the listed files
- All action buttons use `AppButton` with appropriate `variant` and `size` props
- Visual consistency with Sales module context headers
- Existing tests pass unchanged
