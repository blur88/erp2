# Accounting Workspace Refactor Design

**Issue:** #424  
**Date:** 2026-04-24  
**Scope:** Journal Entries page and Chart of Accounts page only

## Goal

Refactor `useJournalEntriesWorkspace` and `useChartOfAccountsWorkspace` to match the interactivity and state management standards established by the Sales/Purchasing pages (`useOrdersWorkspace` is the reference implementation).

## Gaps Being Closed

| Feature | Sales/Purchasing | JE/COA (before) |
|:---|:---|:---|
| Workspace Hook | `useEntityWorkspace` (wrapped) | Custom hook, no wrapping |
| Keyboard Nav | Full (Arrows/Enter/Home/End/PageUp/PageDown) | None |
| State Storage | Redux slice | Local hook state |
| Auto-Selection | First item on load | Manual only |
| Search Focus | `setShouldPreserveSearchFocus` | Manual `setTimeout` (JE) / none (COA) |
| Focused Index | Tracked in table | Hardcoded `-1` (JE) / absent (COA) |

---

## Section 1 — Redux Slice

**New file:** `frontend/src/store/slices/accountingSlice.ts`

```ts
interface AccountingState {
  selectedJournalEntry: JournalEntry | null
  selectedAccount: ChartOfAccount | null
}
```

- Actions: `setSelectedJournalEntry`, `setSelectedAccount`
- Selectors: `selectSelectedJournalEntry`, `selectSelectedAccount`
- Registered in the store root reducer under the key `accounting`

**New test file:** `frontend/src/store/slices/__tests__/accountingSlice.test.ts`  
Minimal reducer tests: set/clear each selection. Matches existing slice test patterns.

---

## Section 2 — `useJournalEntriesWorkspace` Refactor

**Signature change:** Accepts a config object `{ dispatch, entries, selectedEntry, refetch }` instead of just `refetch`.

**Internally wraps `useEntityWorkspace`:**
- `entities`: JE list passed in
- `selectedEntity`: `selectedEntry` from Redux (via selector in the page, passed in)
- `selectEntity`: dispatches `setSelectedJournalEntry`
- `routes.edit`: `/accounting/journal-entries/:id/edit`
- `onEnter`: default behavior (navigate to edit route) — no override needed
- `onEscape`: clears selection, resets focused index, closes open dialogs
- `deleteMutation`: no-op (`async () => {}`) — JE deletion is handled by `handleConfirmDelete` via `deleteTarget` flow, not the generic `useEntityWorkspace` delete

**On selection (click and keyboard nav):** triggers `useLazyGetJournalEntryQuery` to fetch the full entry detail, then dispatches `setSelectedJournalEntry` with the fresh data. Matches the `triggerGetSalesOrder` pattern in `useOrdersWorkspace`.

**Retained JE-specific state (unchanged):**
- `postTarget`, `reverseTarget`, `deleteTarget`, `actionLoading`
- `handleConfirmPost`, `handleConfirmReverse`, `handleConfirmDelete`
- `navigateToCreate`, `navigateToSource`

**`JournalEntriesPage` changes:**
- Adds `useAppDispatch` + `useAppSelector(selectSelectedJournalEntry)`
- Passes `dispatch`, `entries`, `selectedEntry` into the hook
- Passes `workspace.focusedIndex` to `JournalEntriesTable` (removes hardcoded `-1`)
- Removes manual `setTimeout` search focus — replaced by `setShouldPreserveSearchFocus`

---

## Section 3 — `useChartOfAccountsWorkspace` Refactor

**Signature change:** Accepts a config object `{ dispatch, accounts, selectedAccount, refetch }`.

**Internally wraps `useEntityWorkspace`:**
- `entities`: flattened accounts array (computed in the page, passed in)
- `selectedEntity`: `selectedAccount` from Redux
- `selectEntity`: dispatches `setSelectedAccount`
- `routes`: `{ create: '', edit: () => '' }` — no-ops, COA has no navigation routes
- `onEnter`: override that calls `setFormDialogOpen(true)` (Enter opens the edit dialog)
- `onEscape`: clears selection, closes form/delete dialogs
- `deleteMutation`: no-op (`async () => {}`) — COA deletion is handled by `handleDelete` via `deleteTarget` flow, not the generic `useEntityWorkspace` delete

**Retained COA-specific state (unchanged):**
- `formDialogOpen`, `deleteTarget`, `seedConfirmOpen`, `deletedDialogOpen`
- `handleDelete`, `handleSeed`

**`ChartOfAccountsPage` changes:**
- Adds `useAppDispatch` + `useAppSelector(selectSelectedAccount)`
- Passes `dispatch`, `filteredAccounts`, `selectedAccount` into the hook
- Passes `workspace.focusedIndex` to `ChartOfAccountsTable`
- Search focus standardized via `setShouldPreserveSearchFocus`

---

## Section 4 — Table Updates

### `JournalEntriesTable`
- `focusedIndex: number` prop already exists in the interface but is hardcoded to `-1` at the call site
- Pass the real `focusedIndex` from the workspace
- Render visual focus highlight on the row matching `focusedIndex` (consistent with Sales/Purchasing tables)

### `ChartOfAccountsTable`
- Add `focusedIndex: number` prop
- Render visual focus highlight on the row matching `focusedIndex`
- Keep existing `selectedId` prop for the selection highlight (focused = keyboard cursor, selected = active workspace item — two distinct visual states)

Both tables already use `data-index={index}` on rows and `listRef` for scroll-into-view — no structural changes needed.

---

## Section 5 — Testing

### Updated test files
- `pages/accounting/__tests__/JournalEntriesPage.test.tsx` — provide Redux store with `accountingSlice`, mock `selectedJournalEntry` from store
- `pages/accounting/__tests__/ChartOfAccountsPage.test.tsx` — provide Redux store with `accountingSlice`, mock `selectedAccount` from store
- `pages/accounting/components/JournalEntriesTable.test.tsx` — add test for `focusedIndex` visual highlight

### New test files
- `store/slices/__tests__/accountingSlice.test.ts` — basic reducer tests (set/clear selected entry, set/clear selected account)

No changes to `useEntityWorkspace.test.ts` — the hook itself is not modified.

---

## Files Changed Summary

| File | Change |
|:---|:---|
| `store/slices/accountingSlice.ts` | **New** |
| `store/slices/__tests__/accountingSlice.test.ts` | **New** |
| `store/index.ts` | Register `accountingSlice` reducer |
| `pages/accounting/hooks/useJournalEntriesWorkspace.ts` | Refactor — wrap `useEntityWorkspace` |
| `pages/accounting/hooks/useChartOfAccountsWorkspace.ts` | Refactor — wrap `useEntityWorkspace` |
| `pages/accounting/JournalEntriesPage.tsx` | Add Redux wiring, pass `focusedIndex` |
| `pages/accounting/ChartOfAccountsPage.tsx` | Add Redux wiring, pass `focusedIndex` |
| `pages/accounting/components/JournalEntriesTable.tsx` | Pass real `focusedIndex`, add highlight |
| `pages/accounting/components/ChartOfAccountsTable.tsx` | Add `focusedIndex` prop, add highlight |
| `pages/accounting/__tests__/JournalEntriesPage.test.tsx` | Update Redux store setup |
| `pages/accounting/__tests__/ChartOfAccountsPage.test.tsx` | Update Redux store setup |
| `pages/accounting/components/JournalEntriesTable.test.tsx` | Add focusedIndex test |
