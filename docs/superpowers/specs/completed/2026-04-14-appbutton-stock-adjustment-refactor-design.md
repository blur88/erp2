# AppButton Stock Adjustment Refactor — Design Spec

**Issue:** #361  
**Date:** 2026-04-14  
**Scope:** Migrate all MUI `Button` usages in Stock Adjustment page and sub-components to the standardized `AppButton` component, and extend `AppButton` with a `warning` variant.

---

## Problem

The Stock Adjustment page and its sub-components use raw MUI `Button` components instead of the project's standardized `AppButton` wrapper. This breaks visual consistency and bypasses the project's button contract (standardized variants, loading state, sort integration).

---

## Solution Overview

1. Add a `warning` variant to `AppButton`
2. Migrate three files to use `AppButton` instead of MUI `Button`

`IconButton` components are **not** in scope — `AppButton` does not wrap `IconButton`.

---

## Section 1: AppButton Extension

**File:** `frontend/src/components/common/AppButton.tsx`

Add `'warning'` and `'success'` to `AppButtonVariant`:

```ts
type AppButtonVariant = 'primary' | 'secondary' | 'outlined' | 'danger' | 'warning' | 'success'
```

Add cases in the switch block:

```ts
case 'warning':
  muiVariant = 'contained'
  muiColor = 'warning'
  break
case 'success':
  muiVariant = 'contained'
  muiColor = 'success'
  break
```

No theme changes needed — MUI's default theme includes the `warning` palette color.

---

## Section 2: File Migrations

### `StockAdjustmentContextHeader.tsx`

- Remove `Button` from MUI imports
- Add `import { AppButton } from '@/components/common/AppButton'`
- "Complete" button → `<AppButton variant="primary" size="small" onClick={onComplete} sx={{ minWidth: 110 }}>Complete</AppButton>`
- "Revert to Draft" button → `<AppButton variant="warning" size="small" onClick={onRevert} sx={{ minWidth: 110 }}>Revert to Draft</AppButton>`

### `CreateStockAdjustmentPage.tsx`

- Remove `Button` from MUI imports
- Add `import { AppButton } from '@/components/common/AppButton'`
- "Add Item" → `<AppButton variant="outlined" startIcon={<AddIcon />} onClick={addItem}>Add Item</AppButton>`
- "Cancel" → `<AppButton variant="outlined" onClick={...} disabled={loading}>Cancel</AppButton>`
- "Create/Update Adjustment" (submit) → `<AppButton variant="primary" type="submit" loading={loading}>...</AppButton>` — use `loading` prop instead of manual disabled+text-swap

### `DeletedStockAdjustmentsDialog.tsx`

- Remove `Button` from MUI imports
- Add `import { AppButton } from '@/components/common/AppButton'`
- Also add `success` to `AppButtonVariant` (parallel to `warning`) and handle in the switch: `muiVariant = 'contained'`, `muiColor = 'success'`
- Map each button's MUI `variant`/`color` to `AppButton` equivalent:
  - `variant="outlined"` (no color) → `variant="outlined"`
  - `variant="contained" color="success"` → `variant="success"` (new — "Restore Selected", "Restore" confirm)
  - `variant="contained" color="error"` → `variant="danger"`
  - Plain `<Button>` with no variant (cancel buttons) → `variant="outlined"`

---

## Section 3: Testing & Verification

No new tests required — this is a pure component swap with no logic changes.

Run targeted tests after the change:

```bash
cd frontend && npx vitest run src/pages/inventory/__tests__/StockAdjustmentsPage.filterbar.test.tsx
cd frontend && npx vitest run src/pages/inventory/components/StockAdjustmentPanels.test.tsx
cd frontend && npx vitest run src/pages/inventory/__tests__/CreateStockAdjustmentPage.test.tsx
```

The `loading` prop on the submit button in `CreateStockAdjustmentPage` is the only behavioral change — it delegates disabled state to `AppButton` internals rather than the parent. This is equivalent behavior.

---

## Success Criteria

- No direct `import ... Button ... from '@mui/material'` in `StockAdjustmentsPage.tsx` or its sub-components
- All buttons follow standardized `AppButton` styling and behavior
- `AppButton` has a `warning` variant usable across the project
- All three targeted test files pass
