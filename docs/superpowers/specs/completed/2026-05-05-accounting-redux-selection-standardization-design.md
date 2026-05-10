# Accounting Module Redux Selection Standardization

**Issue:** #521  
**Date:** 2026-05-05  
**Status:** Approved

## Overview

Standardize selection state across 6 accounting module pages by migrating from local `useState` to Redux, following the pattern established in the Sales and Purchasing modules. Adds `?highlight=ID` URL param support and ensures keyboard navigation works consistently across all pages.

**Scope (6 pages):**
- Journal Entries
- Expenses
- Fund Transfers
- Owner's Equity
- Bank Reconciliations
- Settlements

**Out of scope:** Fiscal Periods (deferred).

## Reference Pattern (Gold Standard)

The `salesSlice` / `purchasingSlice` + `useOrdersWorkspace` pattern is the target:

- One Redux slice per business module holds all entity selections
- Page reads selected entity via `useAppSelector`, passes `dispatch` to workspace hook
- Workspace hook accepts `dispatch: AppDispatch`, passes `(entity) => dispatch(setSelected*(entity))` as `selectEntity` to `useEntityWorkspace`
- `useEntityWorkspace` gets `highlightParam: 'highlight'`
- `ChartOfAccountsPage` + `useChartOfAccountsWorkspace` already apply this pattern inside the accounting module and serve as the in-module reference

## Section 1: Redux Slice

Expand `frontend/src/store/slices/accountingSlice.ts` to add 6 new fields alongside the existing `selectedAccount`:

```ts
interface AccountingState {
  selectedAccount: ChartOfAccount | null           // existing
  selectedJournalEntry: JournalEntry | null        // new
  selectedExpense: ExpenseRecord | null             // new
  selectedFundTransfer: FundTransfer | null         // new
  selectedOwnerEquityTransaction: OwnerEquityTransaction | null  // new
  selectedBankReconciliation: BankReconciliation | null          // new
  selectedSettlement: Settlement | null             // new
}
```

Each new field gets:
- A `setSelected*` reducer action
- A `selectSelected*` selector exported from the slice

Naming follows the purchasing slice convention exactly (e.g., `setSelectedJournalEntry`, `selectSelectedJournalEntry`).

## Section 2: Workspace Hook Changes

All 6 workspace hooks (`useJournalEntriesWorkspace`, `useExpensesWorkspace`, `useFundTransfersWorkspace`, `useOwnerEquityWorkspace`, `useBankReconciliationsWorkspace`, `useSettlementsWorkspace`) get the same treatment:

1. Remove `const [selected, setSelected] = useState<EntityType | null>(null)`
2. Accept `dispatch: AppDispatch` as a parameter
3. Pass `selectEntity: (entity) => dispatch(setSelected*(entity))` to `useEntityWorkspace`
4. Add `highlightParam: 'highlight'` to `useEntityWorkspace` config
5. Replace all direct `setSelected(null)` / `setSelected(value)` calls with `dispatch(setSelected*(null))` / `dispatch(setSelected*(value))`
6. Remove `selected` from the hook return value — pages read it from Redux

**Special cases:**
- `useFundTransfersWorkspace` and `useBankReconciliationsWorkspace` do a lazy fetch after selection to get fresh detail data, then call `setSelected(fresh)` — becomes `dispatch(setSelected*(fresh))`
- `useJournalEntriesWorkspace` passes stub no-ops for `notifications` and `deleteMutation` — these stay unchanged, only the selection wiring changes

## Section 3: Page Changes

Each of the 6 pages (`JournalEntriesPage`, `ExpensesPage`, `FundTransfersPage`, `OwnerEquityPage`, `BankReconciliationsPage`, `SettlementsPage`):

1. Add `const dispatch = useAppDispatch()`
2. Add `const selected = useAppSelector(selectSelected*)` using the new selector
3. Pass `dispatch` to the workspace hook
4. Remove any local `selected` state — all reads come from Redux

No changes to child components (tables, workspace cards, dialogs) — they already receive `selected` as a prop, so their interfaces are unchanged.

## Section 4: Testing

- **Existing page test files** — update to provide a Redux store wrapper with `accountingSlice` instead of relying on local component state
- **`?highlight=ID` tests** — add one test per page verifying that the URL param auto-selects and highlights the matching entity (following `useChartOfAccountsWorkspace.test.tsx` as the reference)
- **No new test files** — update existing `__tests__/` files for each of the 6 pages
- **Keyboard nav** — not tested per-page; already covered at the `useEntityWorkspace` level

## Acceptance Criteria

1. All 6 pages read selection state from `accountingSlice` via `useAppSelector`
2. Selection persists when navigating away and returning (Redux persistence)
3. `?highlight=<id>` URL param auto-selects the matching entity on page load, then removes the param
4. Keyboard navigation (↑↓, PgUp/Dn, Home/End, Escape) works on all 6 pages
5. Existing tests pass; each page has a `?highlight` test
6. No changes to child component prop interfaces
