# Journal Entries Page Refactor — Design Spec

**Issue:** #414  
**Date:** 2026-04-22

## Goal

Align `JournalEntriesPage` with the patterns established in `OrdersPage` and `ProductsPage`.

## Changes

### 1. Named Export

Change the component declaration from:
```ts
const JournalEntriesPage: React.FC = () => {
```
to:
```ts
export const JournalEntriesPage: React.FC = () => {
```
Keep `export default JournalEntriesPage` at the bottom so the router's lazy import is unaffected.

### 2. Static Subtitle

Change:
```ts
subtitle={`Manage and post accounting journal entries (${pagination?.total ?? 0} total)`}
```
to:
```ts
subtitle="Manage and post accounting journal entries"
```
Totals are displayed in the table/pagination — not in the page subtitle.

### 3. filterConfig Inside Component, Wrapped in useMemo

Move `filterConfig` from module scope into the component body and wrap it in `useMemo(() => ({ ... }), [])`, exactly as in `OrdersPage` and `ProductsPage`.

### 4. Search Focus Preservation

Add a `filterHandlers` memo that wraps `onSearchChange` to call `workspace.setShouldPreserveSearchFocus(true)` before delegating to the base handler:
```ts
const filterHandlers = useMemo(() => ({
  ...handlers,
  onSearchChange: (value: string) => {
    workspace.setShouldPreserveSearchFocus(true)
    handlers.onSearchChange(value)
  },
}), [handlers, workspace])
```
Pass `filterHandlers` to `GenericListPage` instead of `handlers`.

### 5. Hook Ordering

Reorder hooks to the standard sequence:
1. React hooks (`useState`, `useCallback`, `useMemo`) — already at top
2. Router hooks (`useLocation`, `useNavigate`)
3. Redux hooks — none in this component
4. Custom workspace hook (`useJournalEntriesWorkspace`) — move after `useFilterBar`

Standard order matches `OrdersPage`: React → Redux → Custom workspace.

## Files Changed

- `frontend/src/pages/accounting/JournalEntriesPage.tsx` — all changes above
- No changes to router, test file, or other components

## Acceptance Criteria

- `JournalEntriesPage` uses named export
- Subtitle is static
- `filterConfig` is memoized within the component
- Search focus is preserved during filtering
- All existing functionality (Master-Detail, bulk actions) remains intact
