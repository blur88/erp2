---
issue: 367
date: 2026-04-14
topic: Sales Module AppButton Standardization
---

# Sales Module AppButton Standardization — Design Spec

## Goal

Refactor all action buttons in the Sales module's context header components to use `AppButton` instead of MUI `Button` or `IconButton`. This ensures visual consistency with `PageHeader` and `FilterBar` buttons across the app.

## Components in Scope

| File | Current buttons | Action |
|---|---|---|
| `CustomerContextHeader.tsx` | Edit `IconButton`, Delete `IconButton` | Replace with labeled `AppButton` |
| `OrderContextHeader.tsx` | Edit `IconButton`, Delete `IconButton`, Print `IconButton`, Pay/Refund/Unpay `Button`, Fulfill/Unfulfill `Button` | Replace all with `AppButton` |
| `InvoiceContextHeader.tsx` | Print `IconButton` | Replace with labeled `AppButton` |
| `PaymentContextHeader.tsx` | Print `IconButton` | Replace with labeled `AppButton` |

## Button Mapping

### Icon buttons → labeled AppButton (size="small")

| Button | variant | startIcon |
|---|---|---|
| Edit | `secondary` | `<EditIcon />` |
| Delete | `danger` | `<DeleteIcon />` |
| Print | `secondary` | `<PrintIcon />` |

### OrderContextHeader workflow buttons

The Pay/Refund/Unpay button is conditional on payment state:

| State | Label | variant |
|---|---|---|
| `isOverpaid` | "Refund" | `warning` |
| `isPaidInFull` | "Unpay" | `warning` |
| `paidAmount > 0` | "Pay More" | `primary` |
| default | "Pay" | `primary` |

The Fulfill/Unfulfill button:

| State | Label | variant |
|---|---|---|
| `isFulfilled` | "Unfulfill" | `warning` |
| default | "Fulfill" | `success` |

Both workflow buttons keep `size="small"`, `disabled` logic, and `minWidth: 110` sx unchanged.

## Cleanup Per Component

- Remove `actionIconSx` constant (only used by the replaced `IconButton`s)
- Remove `IconButton` and `Button` from MUI imports
- Add `import { AppButton } from '@/components/common/AppButton'`
- `PaymentContextHeader`: remove `CircularProgress` from MUI imports (it was only used for the journal entry loading state in a table cell — keep that unchanged; it's not related to the Print button)

## Tests

`CustomerContextHeader.test.tsx` exists and tests render output but does not assert on button component type. The refactor will not break existing tests. No new tests required for this mechanical change.

## Out of Scope

- Link-style `Typography component="button"` elements used for navigation (invoice numbers, order numbers, payment numbers, journal entry refs) — these are navigation affordances, not command actions, and are not covered by this issue.
- `StockAdjustmentContextHeader.tsx` — tracked separately (issue #365 area).
