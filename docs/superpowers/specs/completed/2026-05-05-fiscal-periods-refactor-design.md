# Design Spec: Fiscal Periods UI/UX Refactor

Refactor the Fiscal Periods page to align with the "Gold Standard" UI/UX patterns established in the Sales and Purchase Order pages. This refactor focuses on architectural consistency, simplified navigation, and standardizing shared components.

## Goals
- **Architectural Alignment:** Move selection state to Redux and use `useEntityWorkspace` for logic.
- **Simplified Navigation:** Implement a single-column reference table.
- **Component Standardization:** Use `EntityTable` (table) and `EntityContextHeaderBar` (header — already in place).
- **Keyboard Support:** Enable full arrow-key and shortcut navigation.

## 1. Architecture Changes

### State Management (`accountingSlice.ts`)
- Add `selectedFiscalPeriod: FiscalPeriod | null` to `AccountingState`, initialized to `null`.
- Add `setSelectedFiscalPeriod` reducer (same pattern as every other entry in the slice).
- Add `selectSelectedFiscalPeriod` selector for component consumption.

### Logic Layer (`useFiscalPeriodsWorkspace.ts`)
Follow the `useExpensesWorkspace` pattern exactly — this is the established pattern for all accounting pages.

- Signature: `(refetch: () => void, periods: FiscalPeriod[], dispatch: AppDispatch, selected: FiscalPeriod | null)`
- Calls `useEntityWorkspace<FiscalPeriod>` internally with:
  - `entities: periods`
  - `selectedEntity: selected`
  - `selectEntity: (p) => dispatch(setSelectedFiscalPeriod(p))`
  - `routes: { create: '/accounting/fiscal-periods', edit: () => '/accounting/fiscal-periods' }` (dummy routes — edit is a dialog)
  - `onEnter: () => { if (selected) setFormDialogOpen(true) }` — Enter opens the Edit dialog
  - `onEscape: () => { dispatch(setSelectedFiscalPeriod(null)); setCloseTarget(null); setReopenTarget(null) }`
- Delete flow uses `useEntityWorkspace`'s built-in `deleteConfirmOpen` / `handleDelete` (with `deleteMutation`) — removes the bespoke `deleteTarget` state.
- Keeps domain-specific handlers: `handleClose`, `handleReopen`, `handleGenerate`.
- Returns: `focusedIndex`, `listRef`, `searchInputRef`, `handleSelect`, `formDialogOpen`, `setFormDialogOpen`, `generateDialogOpen`, `setGenerateDialogOpen`, `closeTarget`, `setCloseTarget`, `reopenTarget`, `setReopenTarget`, `deleteConfirmOpen`, `handleDelete`, `handleCancelDelete`, `handleClose`, `handleReopen`, `handleGenerate`.

## 2. UI Component Changes

### Main Page (`FiscalPeriodsPage.tsx`)
- Add `useAppDispatch` / `useAppSelector` to get `dispatch` and `selectedFiscalPeriod` from Redux.
- Pass `(refetch, periods, dispatch, selectedFiscalPeriod)` to `useFiscalPeriodsWorkspace`.
- Replace all `workspace.selected` references with `selectedFiscalPeriod`.
- Replace `workspace.setSelected` with `workspace.handleSelect` in `listSlot`.
- Wire `deleteConfirmOpen` / `handleCancelDelete` / `handleDelete` from workspace into `FiscalPeriodsDialogs` — replace the old `deleteTarget` prop with `deleteConfirmOpen: boolean` (the dialogs component will need its props updated to match).

### Table (`FiscalPeriodsTable.tsx`)
- Replace the manual 4-column `<Table>` with `EntityTable`.
- Single column: `{ key: 'code', render: (p) => p.code }` — displays period code (e.g., "2024-01").
- Props: `periods`, `loading`, `total`, `selectedId`, `focusedIndex`, `onSelect`, `listRef`.
- `dataAttr="period"`, `label="Fiscal Periods List"`.

### Context Header (`FiscalPeriodContextHeader.tsx`)
- **No changes required.** Already uses `EntityContextHeaderBar` + `EntityStatusChip`.
- Receives `selected` prop from the page (now sourced from Redux instead of local state — same type, no interface change).

### Workspace Card (`FiscalPeriodWorkspaceCard.tsx`)
- **No changes required.** Already displays Start Date, End Date, Fiscal Year, Duration.

## 3. User Experience Improvements
- **Single-Column Navigation:** Focus on the period code for quick scanning.
- **Keyboard Shortcuts** (provided by `useEntityWorkspace`):
  - `Up/Down`: Navigate through periods.
  - `Enter`: Opens the Edit dialog (via `onEnter` override).
  - `Escape`: Clears selection.
  - `/`: Focuses search.
- **Loading States:** Standardized `EntityTable` skeleton/loading states.

## 4. Test Changes (`FiscalPeriodsPage.test.tsx`)
- Add Redux store mock: mock `useAppSelector` to return `null` for `selectedFiscalPeriod` and mock `useAppDispatch`.
- Update workspace mock to match new signature if needed.
- Existing render/row assertion (`'2026-01'` visible) stays the same.
- No new test cases needed — keyboard/selection behavior is covered by `useEntityWorkspace.test.ts`.

## 5. Verification Plan
- **Selection:** Clicking a row selects the period and updates the context header and workspace card.
- **Keyboard:** Arrow keys move focus and selection; Enter opens Edit dialog; Escape clears selection; `/` focuses search.
- **Actions:** Close, Reopen, Edit, and Delete all function correctly from the Context Header.
- **Delete flow:** Delete confirmation uses the standard `deleteConfirmOpen` dialog (not a custom target dialog).
- **Generation:** "Generate Periods" dialog works and refreshes the list.
- **Auto-select:** First period is auto-selected on load (standard `useEntityWorkspace` behavior).
