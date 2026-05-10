# Accounting Workspace Hook Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three pre-existing inconsistencies in accounting (and sales) workspace hooks: `import type` consistency, dead `deleteMutation` wiring in `useExpensesWorkspace`, and no-op stub removal via making `notifications`/`deleteMutation` optional in `useEntityWorkspace`.

**Architecture:** Three independent changes — a trivial import fix, a dead-code removal, and a shared-hook interface change that ripples to 7 consumer hooks. No behavior changes anywhere.

**Tech Stack:** React 19, TypeScript (strict: false), Vitest

---

## File Map

| File | Change |
|---|---|
| `frontend/src/hooks/useEntityWorkspace.ts` | Make `notifications` and `deleteMutation` optional; guard call sites |
| `frontend/src/pages/accounting/hooks/useBankReconciliationsWorkspace.ts` | Fix `import type`; remove stub `deleteMutation` |
| `frontend/src/pages/accounting/hooks/useJournalEntriesWorkspace.ts` | Fix `import type`; remove stub `notifications` + `deleteMutation` |
| `frontend/src/pages/accounting/hooks/useOwnerEquityWorkspace.ts` | Remove stub `notifications` + `deleteMutation` |
| `frontend/src/pages/accounting/hooks/useSettlementsWorkspace.ts` | Remove stub `notifications` + `deleteMutation` |
| `frontend/src/pages/accounting/hooks/useExpensesWorkspace.ts` | Remove dead `deleteMutation` wiring |
| `frontend/src/pages/sales/hooks/useOrdersWorkspace.ts` | Remove stub `notifications` + `deleteMutation` |
| `frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts` | Remove stub `notifications` + `deleteMutation` |
| `frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts` | Remove stub `notifications` + `deleteMutation` |

---

## Task 1: Make `notifications` and `deleteMutation` optional in `useEntityWorkspace`

**Files:**
- Modify: `frontend/src/hooks/useEntityWorkspace.ts:18-22` (interface fields)
- Modify: `frontend/src/hooks/useEntityWorkspace.ts:297-313` (handleDelete body)

- [ ] **Step 1: Make the interface fields optional**

In `frontend/src/hooks/useEntityWorkspace.ts`, change lines 18–22 from:

```ts
  notifications: {
    showSuccess: (message: string) => void
    showError: (message: string) => void
  }
  deleteMutation: (id: string) => Promise<void>
```

to:

```ts
  notifications?: {
    showSuccess: (message: string) => void
    showError: (message: string) => void
  }
  deleteMutation?: (id: string) => Promise<void>
```

- [ ] **Step 2: Guard the call sites in `handleDelete`**

In `frontend/src/hooks/useEntityWorkspace.ts`, replace lines 297–313 (the `handleDelete` callback) with:

```ts
  const handleDelete = useCallback(async () => {
    if (!selectedEntity) {
      return
    }
    if (!deleteMutation) {
      return
    }

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

- [ ] **Step 3: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useEntityWorkspace.ts
git commit -m "refactor(workspace): make notifications and deleteMutation optional in useEntityWorkspace"
```

---

## Task 2: Fix `import type` in `useBankReconciliationsWorkspace` and remove stub `deleteMutation`

**Files:**
- Modify: `frontend/src/pages/accounting/hooks/useBankReconciliationsWorkspace.ts`

Context: This hook passes real `notifications: { showSuccess, showError }` (kept as-is) but a stub `deleteMutation: async () => {}` (removed). It also has a value import on line 16 that needs `import type`.

- [ ] **Step 1: Fix the import and remove the stub `deleteMutation`**

In `frontend/src/pages/accounting/hooks/useBankReconciliationsWorkspace.ts`:

Change line 16 from:
```ts
import { BankReconciliation, ReconciledTransaction } from '@/types'
```
to:
```ts
import type { BankReconciliation, ReconciledTransaction } from '@/types'
```

In the `useEntityWorkspace(...)` call (around line 57–58), remove only the `deleteMutation` line:
```ts
// remove this line:
deleteMutation: async () => {},
```

Leave `notifications: { showSuccess, showError }` in place — it is a real handler used if `handleDelete` is ever triggered.

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/hooks/useBankReconciliationsWorkspace.ts
git commit -m "fix(accounting): import type and remove stub deleteMutation in useBankReconciliationsWorkspace"
```

---

## Task 3: Fix `import type` in `useJournalEntriesWorkspace` and remove stubs

**Files:**
- Modify: `frontend/src/pages/accounting/hooks/useJournalEntriesWorkspace.ts`

Context: Line 8 uses a value import for `JournalEntry`. Lines 32–33 pass stub `notifications` and `deleteMutation`.

- [ ] **Step 1: Fix import and remove stubs**

Change line 8 from:
```ts
import { JournalEntry } from '@/types'
```
to:
```ts
import type { JournalEntry } from '@/types'
```

In the `useEntityWorkspace(...)` call, remove lines 32–33:
```ts
// remove these two lines:
notifications: { showSuccess: () => {}, showError: () => {} },
deleteMutation: async () => {},
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/hooks/useJournalEntriesWorkspace.ts
git commit -m "fix(accounting): import type and remove stubs in useJournalEntriesWorkspace"
```

---

## Task 4: Remove stubs from `useOwnerEquityWorkspace`

**Files:**
- Modify: `frontend/src/pages/accounting/hooks/useOwnerEquityWorkspace.ts`

Context: Lines 44–45 pass stub `notifications` and `deleteMutation`. This hook owns its delete flow via `handleDelete` callback returned directly.

- [ ] **Step 1: Remove stubs**

In the `useEntityWorkspace(...)` call, remove lines 44–45:
```ts
// remove these two lines:
notifications: { showSuccess: () => {}, showError: () => {} },
deleteMutation: async () => {},
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/hooks/useOwnerEquityWorkspace.ts
git commit -m "fix(accounting): remove notification and deleteMutation stubs from useOwnerEquityWorkspace"
```

---

## Task 5: Remove stubs from `useSettlementsWorkspace`

**Files:**
- Modify: `frontend/src/pages/accounting/hooks/useSettlementsWorkspace.ts`

Context: Lines 34–35 pass stub `notifications` and `deleteMutation`. This hook owns its cancel flow via `handleConfirmCancel`.

- [ ] **Step 1: Remove stubs**

In the `useEntityWorkspace(...)` call, remove lines 34–35:
```ts
// remove these two lines:
notifications: { showSuccess: () => {}, showError: () => {} },
deleteMutation: async () => {},
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/hooks/useSettlementsWorkspace.ts
git commit -m "fix(accounting): remove notification and deleteMutation stubs from useSettlementsWorkspace"
```

---

## Task 6: Remove dead `deleteMutation` from `useExpensesWorkspace`

**Files:**
- Modify: `frontend/src/pages/accounting/hooks/useExpensesWorkspace.ts`

Context: Lines 43–45 pass `notifications: { showSuccess, showError }` (real — kept) and `deleteMutation: async (id) => { await deleteExpense(id).unwrap() }` (dead — removed). The `deleteExpense` mutation is already correctly used in `handleConfirmDelete`.

- [ ] **Step 1: Remove the dead `deleteMutation` prop**

In the `useEntityWorkspace(...)` call, remove lines 44–46:
```ts
// remove these lines:
deleteMutation: async (id) => {
  await deleteExpense(id).unwrap()
},
```

Leave `notifications: { showSuccess, showError }` in place.

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/accounting/hooks/useExpensesWorkspace.ts
git commit -m "fix(accounting): remove dead deleteMutation wiring from useExpensesWorkspace"
```

---

## Task 7: Remove stubs from sales hooks

**Files:**
- Modify: `frontend/src/pages/sales/hooks/useOrdersWorkspace.ts:92-93`
- Modify: `frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts:75-79`
- Modify: `frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts:90-91`

Context: All three sales hooks pass stub `notifications` and `deleteMutation` — same pattern as the accounting stubs. Each hook owns its own delete/error flow.

- [ ] **Step 1: Remove stubs from `useOrdersWorkspace`**

In `frontend/src/pages/sales/hooks/useOrdersWorkspace.ts`, remove lines 92–93:
```ts
// remove these two lines:
notifications: { showSuccess: () => {}, showError: () => {} },
deleteMutation: async () => {},
```

- [ ] **Step 2: Remove stubs from `useInvoicesWorkspace`**

In `frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts`, remove lines 75–79:
```ts
// remove these lines:
notifications: {
  showSuccess: () => {},
  showError: () => {},
},
deleteMutation: async () => {},
```

- [ ] **Step 3: Remove stubs from `usePaymentsWorkspace`**

In `frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts`, remove lines 90–91:
```ts
// remove these two lines:
notifications: { showSuccess: () => {}, showError: () => {} },
deleteMutation: async () => {},
```

- [ ] **Step 4: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/sales/hooks/useOrdersWorkspace.ts \
        frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts \
        frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts
git commit -m "fix(sales): remove notification and deleteMutation stubs from sales workspace hooks"
```

---

## Task 8: Final verification

- [ ] **Step 1: Run full type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 2: Run affected test files**

```bash
cd frontend && npx vitest run src/pages/accounting/hooks/useChartOfAccountsWorkspace.test.tsx
cd frontend && npx vitest run src/pages/sales/hooks/useOrdersWorkspace.test.tsx
cd frontend && npx vitest run src/pages/sales/hooks/useInvoicesWorkspace.test.tsx
cd frontend && npx vitest run src/pages/sales/hooks/usePaymentsWorkspace.test.tsx
```

Expected: all pass.

- [ ] **Step 3: Open a PR closing issue #523**

```bash
gh pr create --title "fix(accounting): workspace hook consistency cleanup (issue #523)" --body "$(cat <<'EOF'
## Summary

- Convert value imports to `import type` for type-only symbols in `useBankReconciliationsWorkspace` and `useJournalEntriesWorkspace`
- Remove dead `deleteMutation` wiring from `useExpensesWorkspace` (delete flow owned by `handleConfirmDelete`)
- Make `notifications` and `deleteMutation` optional in `useEntityWorkspace`; remove no-op stubs from 7 hooks across accounting and sales modules

No behavior changes. Pure cleanup pass identified during review of PR #522.

Closes #523

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
