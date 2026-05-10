---
title: Inventory Module AppButton Standardization
issue: "#370"
date: 2026-04-15
status: approved
---

# Inventory Module AppButton Standardization

## Goal

Replace all remaining MUI `Button` and `IconButton` command-action usages in the Inventory module with `AppButton`, matching the pattern established in the Sales and Purchasing modules (issues #367, #368).

## Scope

Four files require changes:

| File | Change |
|------|--------|
| `src/pages/inventory/InventoryPage.tsx` | Replace `Button` in error alert with `AppButton variant="secondary"` |
| `src/pages/inventory/components/ProductContextHeader.tsx` | Replace Edit + Delete `IconButton` with `AppButton` |
| `src/pages/inventory/components/CategoryContextHeader.tsx` | Replace Edit + Delete `IconButton` with `AppButton` |
| `src/pages/inventory/components/StockAdjustmentContextHeader.tsx` | Replace Edit + Delete `IconButton` with `AppButton` (workflow buttons already use AppButton) |

One test file is updated:

| File | Change |
|------|--------|
| `src/pages/inventory/components/CategoryContextHeader.test.tsx` | Add button render + callback tests |

## Button Pattern

All Edit/Delete button pairs follow the Sales/Purchasing standard:

```tsx
<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
  <AppButton
    size="small"
    variant="secondary"
    startIcon={<EditIcon />}
    title="Edit <Entity>"
    onClick={onEdit}
  >
    Edit
  </AppButton>
  <AppButton
    size="small"
    variant="danger"
    startIcon={<DeleteIcon />}
    title="Delete <Entity>"
    onClick={onDelete}
  >
    Delete
  </AppButton>
</Box>
```

Key details:
- `gap` changes from `0.25` → `0.5` (matches sibling modules)
- `actionIconSx` constant removed (dead code after migration)
- `IconButton` removed from MUI imports
- `AppButton` import added from `@/components/common/AppButton`

## InventoryPage Error Alert

```tsx
// Before
import { Button } from '@mui/material'
<Button size="small" onClick={() => window.location.reload()}>Retry</Button>

// After
import { AppButton } from '@/components/common/AppButton'
<AppButton size="small" variant="secondary" onClick={() => window.location.reload()}>Retry</AppButton>
```

`Button` removed from MUI imports.

## Tests

Extend `CategoryContextHeader.test.tsx` with two new cases following the `getByTitle` pattern from `PurchaseOrderContextHeader.test.tsx`:

1. **Renders Edit and Delete buttons** — asserts `getByTitle('Edit Root')` and `getByTitle('Delete Root')` are in the document.
2. **Fires callbacks** — clicks each button via `userEvent` and asserts the respective mock was called once.

`ProductContextHeader.test.tsx` does not exist yet and is out of scope for this issue (no tests currently exist for that component; a dedicated issue can be raised if needed).

## Success Criteria

- No direct usage of MUI `Button` or `IconButton` for command actions in the four listed files.
- All action buttons use `AppButton` with `variant="secondary"` (edit/retry) or `variant="danger"` (delete) and `size="small"`.
- `CategoryContextHeader.test.tsx` covers button rendering and callback firing.
- Frontend type-check passes (`npm run type-check`).
- Targeted test runs pass for affected test files.
