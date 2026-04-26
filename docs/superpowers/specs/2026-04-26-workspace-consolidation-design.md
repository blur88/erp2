# Workspace Consolidation Design

**Issue:** #450
**Date:** 2026-04-26
**Scope:** Single PR — extract `useJournalEntryRef`, `EntityContextHeaderBar`, `EntityStatusChip`

## Context

Following the Gold Standard workspace unification, three high-value consolidation points remain:

1. Six workspace hooks duplicate identical journal entry fetch logic inline
2. Twenty+ context headers each hardcode their own outer shell and journal entry button placement
3. Status chip color logic is defined five different ways across ~20 files

The `GenericDeletedDialog` and `ConfirmationDialog` abstractions already exist and require no work.

## Deliverables

All three changes ship in a single PR against `main`, closing issue #450.

---

## 1. `useJournalEntryRef` Hook

**File:** `frontend/src/hooks/useJournalEntryRef.ts`

### Signature

```ts
function useJournalEntryRef(
  sources: Array<{ sourceType: string; sourceId: string | undefined }>
): {
  journalEntryRef: { referenceNumber: string; sourceType: string; sourceId: string } | null
  journalEntryRefLoading: boolean
  navigateToJournalEntry: () => void
}
```

### Behavior

- Filters out sources where `sourceId` is undefined before fetching
- Iterates sources in order; returns the first matching journal entry
- Sets `journalEntryRef` to null if no match found or sources array is empty
- Cancels in-flight requests via `cancelled` flag on cleanup
- `navigateToJournalEntry` navigates to `/accounting/journal-entries?highlight=<id>`

### Migration

Remove from each of these 6 hooks:
- `frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts`
- `frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts`
- `frontend/src/pages/sales/hooks/useSalesOrdersWorkspace.ts` (if applicable)
- `frontend/src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.ts`
- `frontend/src/pages/purchasing/hooks/useGRNWorkspace.ts`
- `frontend/src/pages/inventory/hooks/useStockAdjustmentsWorkspace.ts`

Delete: local `journalEntryRef` state, `journalEntryRefLoading` state, the `useEffect` fetching block, and the inline `navigateToJournalEntry` callback.

Replace with a single call to `useJournalEntryRef(sources)`. Returned values have identical names — no renaming needed at call sites.

---

## 2. `EntityContextHeaderBar` Component

**File:** `frontend/src/components/common/EntityContextHeaderBar.tsx`

### Signature

```tsx
interface EntityContextHeaderBarProps {
  title: string
  statusChip?: ReactNode
  actions?: ReactNode
  journalEntryRef?: { referenceNumber: string; sourceType: string; sourceId: string } | null
  journalEntryRefLoading?: boolean
  onNavigateToJournalEntry?: () => void
}
```

### Behavior

- Renders a flex row using `TABLE_STYLES.cell.padding.px` and `TABLE_STYLES.cell.border` (same values used across all existing headers)
- Left side: `title` as `Typography variant="tableHeader"` + optional `statusChip`
- Right side: `actions` (caller-provided buttons in any order) + Journal Entry `IconButton` (MenuBook icon) always rendered last
- Journal Entry button only renders when `journalEntryRef` is non-null
- When `journalEntryRefLoading` is true and no ref yet, renders a small `CircularProgress` in place of the icon
- All props except `title` are optional — headers with no journal entry and no actions render cleanly

### Migration

All 20+ context headers replace their outer `Box` wrapper and inline journal entry button with `<EntityContextHeaderBar>`. Everything below the header bar (entity-specific detail tables, secondary info rows) is untouched.

Headers with no journal entry pass no `journalEntryRef` prop. Headers with complex conditional actions (e.g. `OrderContextHeader`, `PurchaseOrderContextHeader`) pass their existing button JSX as the `actions` prop unchanged.

---

## 3. `EntityStatusChip` Component

**File:** `frontend/src/components/common/EntityStatusChip.tsx`

### Signature

```tsx
interface EntityStatusChipProps {
  status: string
}

function EntityStatusChip({ status }: EntityStatusChipProps): JSX.Element
```

### Status Map

| Status key | MUI color | Display label |
|---|---|---|
| `paid` | `success` | Paid |
| `completed` | `success` | Completed |
| `posted` | `success` | Posted |
| `received` | `success` | Received |
| `partial_paid` | `warning` | Partial Paid |
| `pending` | `warning` | Pending |
| `draft` | `warning` | Draft |
| `cancelled` | `default` | Cancelled |
| `refunded` | `default` | Refunded |
| `reversed` | `error` | Reversed |
| `failed` | `error` | Failed |
| `overpaid` | `info` | Overpaid |

Unknown statuses: `color="default"`, label = raw status string (title-cased).

### Behavior

- Renders `<Chip size="small" color={...} label={...} />`
- Status lookup is case-insensitive (normalizes to lowercase before map lookup)
- No external dependencies beyond MUI

### Migration

Delete all local `STATUS_COLORS` records, inline ternary chains, and function-based color lookups. Replace each `<Chip>` with `<EntityStatusChip status={entity.status} />`.

The `statusChip` prop passed to `EntityContextHeaderBar` is typically:
```tsx
statusChip={<EntityStatusChip status={entity.status} />}
```

For the `overpaid` case in `InvoiceContextHeader`, the caller passes the appropriate status string and the chip resolves it:
```tsx
statusChip={<EntityStatusChip status={isOverpaid ? 'overpaid' : invoice.status} />}
```

---

## File Inventory

### New files
- `frontend/src/hooks/useJournalEntryRef.ts`
- `frontend/src/components/common/EntityContextHeaderBar.tsx`
- `frontend/src/components/common/EntityStatusChip.tsx`

### Modified files (workspace hooks — 6)
- `frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts`
- `frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts`
- `frontend/src/pages/sales/hooks/useOrdersWorkspace.ts`
- `frontend/src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.ts`
- `frontend/src/pages/purchasing/hooks/useGRNWorkspace.ts`
- `frontend/src/pages/inventory/hooks/useStockAdjustmentsWorkspace.ts`

### Modified files (context headers — ~20)
- `frontend/src/pages/sales/components/InvoiceContextHeader.tsx`
- `frontend/src/pages/sales/components/PaymentContextHeader.tsx`
- `frontend/src/pages/sales/components/OrderContextHeader.tsx`
- `frontend/src/pages/purchasing/components/PurchaseOrderContextHeader.tsx`
- `frontend/src/pages/purchasing/components/GRNContextHeader.tsx`
- *(plus all remaining context header components across inventory, accounting modules)*

### No changes needed
- `frontend/src/components/common/GenericDeletedDialog.tsx` — already abstracted
- `frontend/src/components/common/ConfirmationDialog.tsx` — already generic
- `frontend/src/hooks/useEntityWorkspace.ts` — unchanged (hook composition chosen over modification)

---

## Testing

- Run existing workspace hook tests after migration — behavior is identical, only the location of the logic changes
- Visually verify Journal Entry icon position is consistent across all 20 headers
- Verify `EntityStatusChip` renders correct color for each status by checking the status map against existing visual output
- No new test files required — mechanical refactor with no behavioral change
