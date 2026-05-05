# Accounting Workspace Hook Cleanup — Design Spec

**Issue:** #523
**Date:** 2026-05-05
**Scope:** Accounting module workspace hooks + shared `useEntityWorkspace` hook (no behavior changes)

---

## Background

Identified during code review of PR #522. Three pre-existing inconsistencies exist across the accounting (and sales) workspace hooks that warrant a cleanup pass.

---

## Issue 1 — `import type` consistency

**Files:**
- `frontend/src/pages/accounting/hooks/useBankReconciliationsWorkspace.ts` line 16
- `frontend/src/pages/accounting/hooks/useJournalEntriesWorkspace.ts` line 8

**Change:** Convert value imports to `import type` for type-only symbols:

```ts
// before
import { BankReconciliation, ReconciledTransaction } from '@/types'
import { JournalEntry } from '@/types'

// after
import type { BankReconciliation, ReconciledTransaction } from '@/types'
import type { JournalEntry } from '@/types'
```

All other migrated hooks already use `import type`. This makes them consistent.

---

## Issue 2 — Dead `deleteMutation` wiring in `useExpensesWorkspace`

**File:** `frontend/src/pages/accounting/hooks/useExpensesWorkspace.ts`

**Problem:** `deleteMutation` is passed to `useEntityWorkspace`, but `ExpensesPage` never sets `deleteConfirmOpen`, so `useEntityWorkspace`'s built-in `handleDelete` path is never triggered. The `deleteExpense` mutation is already correctly used in the hook's own `handleConfirmDelete` callback.

**Change:** Remove the `deleteMutation` prop from the `useEntityWorkspace` call in `useExpensesWorkspace`. No other changes needed.

---

## Issue 3 — Make `notifications` and `deleteMutation` optional in `useEntityWorkspace`

**Root cause:** Many hooks pass no-op stubs (`showSuccess: () => {}, showError: () => {}, deleteMutation: async () => {}`) because `useEntityWorkspace` requires these fields but the hooks never trigger the built-in delete path. The stubs are inert — removing them changes nothing at runtime.

**Affected hooks (currently passing stubs, to be cleaned up):**

| Hook | Module |
|---|---|
| `useJournalEntriesWorkspace` | Accounting |
| `useOwnerEquityWorkspace` | Accounting |
| `useSettlementsWorkspace` | Accounting |
| `useOrdersWorkspace` | Sales |
| `useInvoicesWorkspace` | Sales |
| `usePaymentsWorkspace` | Sales |

**Hooks that use the built-in delete path (keep passing both fields):**

| Hook | Module |
|---|---|
| `useSuppliersWorkspace` (via `SuppliersPage`) | Purchasing |
| `useCustomersWorkspace` (via `CustomersPage`) | Sales |
| `useChartOfAccountsWorkspace` | Accounting |

### Changes

**`frontend/src/hooks/useEntityWorkspace.ts`**

1. Mark both fields optional in `UseEntityWorkspaceConfig`:
   ```ts
   notifications?: {
     showSuccess: (message: string) => void
     showError: (message: string) => void
   }
   deleteMutation?: (id: string) => Promise<void>
   ```

2. Guard both call sites inside `handleDelete`:
   ```ts
   const handleDelete = useCallback(async () => {
     if (!selectedEntity) return
     if (!deleteMutation) return
     try {
       await deleteMutation(selectedEntity.id)
       notifications?.showSuccess('Deleted successfully')
       selectEntity(null)
       setFocusedIndex(-1)
       setDeleteConfirmOpen(false)
       refetch()
     } catch (error: any) {
       const message = error?.data?.message || error?.message || 'An unexpected error occurred.'
       notifications?.showError(message)
     }
   }, [deleteMutation, notifications, refetch, selectEntity, selectedEntity])
   ```

**6 stub hooks (accounting + sales):** Remove `notifications` and `deleteMutation` props from the `useEntityWorkspace` call entirely.

---

## Testing

- TypeScript check: `cd frontend && npm run type-check`
- No new tests needed — pure cleanup, no logic changes
- Spot-check that Suppliers, Customers, and ChartOfAccounts delete flows still compile correctly
