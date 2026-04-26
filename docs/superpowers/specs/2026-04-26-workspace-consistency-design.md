# Workspace Consistency Refactor — Design Spec
**Issue:** #448
**Date:** 2026-04-26

## Overview

Three workspace hooks (`usePurchaseOrdersWorkspace`, `useChartOfAccountsWorkspace`, and several others) manually re-implement infrastructure that already exists in `useEntityWorkspace`. This causes inconsistent UX (missing keyboard shortcuts, no deep-linking on COA), diverged naming conventions, and maintenance overhead.

This refactor makes all 8 master-detail pages consistent by:
1. Promoting truly generic patterns into `useEntityWorkspace`
2. Making `usePurchaseOrdersWorkspace` wrap `useEntityWorkspace` (matching the Sales Orders pattern)
3. Giving `useChartOfAccountsWorkspace` Redux state and full `useEntityWorkspace` integration
4. Removing duplicated `useEffect`s from all outer workspace hooks

---

## 1. `useEntityWorkspace` Extensions

Two optional config fields are added. No existing callers are affected — both are optional.

### 1a. `highlightParam?: string`

When provided, `useEntityWorkspace` internally:
- Reads `searchParams.get(highlightParam)` on mount and when entities change
- Finds the matching entity in the list by `id`
- Calls `selectEntity` + `setFocusedIndex` on it
- Removes the param from the URL via `setSearchParams(..., { replace: true })`

This replaces manual `useEffect`s in: Sales Orders (`?highlight=`), Purchase Orders (`?highlight=`), Payments (`?highlight=`), GRN (`?grnId=`), Vendor Payments (`?vpId=`), and will cover COA (`?highlight=`).

Each hook passes its own param key — the logic inside `useEntityWorkspace` is identical regardless of key name.

### 1b. `locationStateHighlightKey?: string`

When provided, `useEntityWorkspace` internally:
- Reads `location.state[locationStateHighlightKey]` — value may be an entity id (string) or a full entity object with an `id` field
- Finds or uses the entity, calls `selectEntity` + `setFocusedIndex`
- Clears state via `window.history.replaceState`

This replaces manual `useEffect`s in: Invoices (`highlightInvoice` / `highlightInvoiceId`) and Payments (`highlightPaymentId`).

### What does NOT move into `useEntityWorkspace`

The following are domain-specific and stay in the outer hooks:
- Fetch full entity on select (each domain has a different API call)
- Journal entry ref loading (different `sourceType` per domain)
- `?poId=` legacy navigation param (PO-specific)
- Stale persisted order refresh on mount (Sales Orders-specific)
- Sync fresh list data back to selected entity (SO/Invoices-specific field comparisons)
- All business action handlers

---

## 2. Purchase Orders — Wrap `useEntityWorkspace`

**File:** `frontend/src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.ts`

**Remove:**
- `focusedOrderIndex` state → use `workspace.focusedIndex`
- Manual scroll `useEffect` (lines 226–233) → handled by `useEntityWorkspace`
- Partial `useKeyboardShortcuts` call (lines 639–643, only up/down/search) → `useEntityWorkspace` now wires full set
- Manual auto-select `useEffect`s (lines 180–209) → handled by `useEntityWorkspace`
- Manual highlight `useEffect`s (lines 79–88, 211–224) → replaced by `highlightParam: 'highlight'`
- `pendingHighlightId` state, `processedHighlightRef`, `userHasNavigatedRef`
- `orderListRef`, `searchInputRef` — use `workspace.listRef`, `workspace.searchInputRef`

**Add:**
- Call `useEntityWorkspace` with `highlightParam: 'highlight'`
- `onEnter`: navigate to edit route for focused order
- `onEscape`: clear selection, close all dialogs

**Keep unchanged:** all domain handlers (receive, return, pay, blocked dialogs, `handleDeleteConfirm`, `selectAfterDelete`, `navigateToGoodsReceived`, etc.), journal entry ref loading, `?poId=` legacy param effect.

**Rename in return object:**
- `focusedOrderIndex` → alias of `workspace.focusedIndex` (keep alias for backward compat with `PurchaseOrdersPage`)
- `orderListRef` → alias of `workspace.listRef`
- `searchInputRef` → from workspace

**Fix table:** `PurchaseOrdersTable` rows use `data-order-index` attribute. Change to `data-index` to match what `useEntityWorkspace`'s scroll effect queries (`[data-index="${focusedIndex}"]`).

**Keyboard shortcuts gained:** PageUp, PageDown, Home, End, Enter (navigate to edit), Escape (clear selection)

---

## 3. Chart of Accounts — Redux + `useEntityWorkspace`

### 3a. New Redux slice

**File:** `frontend/src/store/slices/accountingSlice.ts` (new file)

```
interface AccountingState {
  selectedAccount: ChartOfAccount | null
}

actions: setSelectedAccount(account | null)
selector: selectSelectedAccount
```

Register in `frontend/src/store/index.ts` under key `accounting`.

### 3b. Refactor `useChartOfAccountsWorkspace`

**File:** `frontend/src/pages/accounting/hooks/useChartOfAccountsWorkspace.ts`

**Remove:**
- `useState<ChartOfAccount | null>(null)` for `selected` → use Redux `selectedAccount`

**Add:**
- Accept `dispatch: AppDispatch` as a parameter
- Call `useEntityWorkspace` with:
  - `entities`: the flat filtered accounts list (passed in from the page)
  - `selectedEntity`: from Redux `selectSelectedAccount`
  - `selectEntity`: `(account) => dispatch(setSelectedAccount(account))`
  - `highlightParam: 'highlight'`
  - `deleteMutation`: wrap existing `deleteChartOfAccount` call
  - `onEnter`: open form dialog (COA has no separate edit route — Enter opens the edit form)
  - `onEscape`: clear selection, close dialogs
  - `routes`: `{ create: '/accounting/chart-of-accounts', edit: () => '/accounting/chart-of-accounts' }` (unused, Enter is overridden)

**Keep unchanged:** `handleSeed`, `seedConfirmOpen`, `deletedDialogOpen`, `formDialogOpen`, `deleteTarget`.

**Keyboard shortcuts gained:** All arrows, PageUp, PageDown, Home, End, Enter (open form), Escape (clear), Search (focus search input)

### 3c. Update `ChartOfAccountsPage`

- Pass `dispatch` to `useChartOfAccountsWorkspace`
- Pass real `focusedIndex` from workspace to `ChartOfAccountsTable` (remove hardcoded `-1`)
- Read `selectedAccount` from Redux instead of `workspace.selected`

### 3d. Fix `ChartOfAccountsTable`

- Change `dataAttr` from `"account"` to match `useEntityWorkspace`'s scroll query. `EntityTable` must render `data-index={rowIndex}` on each row (verify existing `EntityTable` implementation — it likely already does this for `data-index`; if `dataAttr` controls the attribute name, change to `"index"` or remove the override).

---

## 4. Clean up remaining outer hooks

For each hook below, remove the manual highlight `useEffect` and pass the config to `useEntityWorkspace` instead.

| Hook | Remove | Add to `useEntityWorkspace` config |
|---|---|---|
| `useOrdersWorkspace` | Lines 159–168 (`?highlight=` clear), lines 290–304 (pending highlight resolution) | `highlightParam: 'highlight'` |
| `usePaymentsWorkspace` | Lines 187–202 (`?highlight=`), lines 204–216 (`location.state`) | `highlightParam: 'highlight'`, `locationStateHighlightKey: 'highlightPaymentId'` |
| `useInvoicesWorkspace` | Lines 186–207 (`location.state` with two keys) | `locationStateHighlightKey: 'highlightInvoice'` — `useEntityWorkspace` checks if value is a string (id) or object (entity); for the `highlightInvoiceId` fallback key, pass a second `locationStateHighlightKey: 'highlightInvoiceId'` or handle by checking both keys in order within the single `useEffect` in `useEntityWorkspace` |
| `useGRNWorkspace` | Lines 108–124 (`?grnId=`) | `highlightParam: 'grnId'` |
| `useVendorPaymentsWorkspace` | Lines 106–122 (`?vpId=`) | `highlightParam: 'vpId'` |

`hasRestoredSelection` refs in Invoices and Payments are also removed — `useEntityWorkspace`'s existing auto-select effect already handles this on load.

---

## 5. Final Consistency Table

| Concern | All 8 pages after refactor |
|---|---|
| Uses `useEntityWorkspace` | Yes |
| Redux selection state | Yes (new `accountingSlice` for COA) |
| `focusedIndex` owned by | `useEntityWorkspace` |
| Scroll-into-view | `useEntityWorkspace` (`data-index` attr) |
| Full keyboard shortcuts | Yes (arrows, page, home/end, enter, escape, search) |
| `?highlight=` deep-link | Yes (all via `highlightParam` config) |
| `location.state` highlight | Yes for Invoices + Payments (via `locationStateHighlightKey`) |
| Auto-select first on load | Yes (existing `useEntityWorkspace` logic) |

Customers and Suppliers already match this pattern and require no changes.

---

## 6. Testing

- Update `usePurchaseOrdersWorkspace.test.tsx` — existing tests cover domain handlers; add tests for keyboard nav and highlight resolution
- Update `useEntityWorkspace.test.ts` — add tests for `highlightParam` and `locationStateHighlightKey` branches
- Add `useChartOfAccountsWorkspace` tests (currently none exist)
- Update `ChartOfAccountsPage.test.tsx` — mock Redux `accountingSlice`, verify keyboard nav and highlight
- Run full frontend test suite after changes to verify no regressions in Customers/Suppliers/Invoices/GRN/VP pages

---

## 7. Out of Scope

- `TABLE_STYLES` cell padding / row height standardization (mentioned in issue) — deferred, separate PR
- Journal entry background fetching pattern standardization — deferred, separate PR
- Any backend changes
