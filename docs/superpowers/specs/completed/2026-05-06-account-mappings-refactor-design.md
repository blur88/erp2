# Design Spec: Account Mappings Page Refactor

## 1. Goal

Refactor the Account Mappings page UI and UX to follow the "gold standard" established by FiscalPeriodsPage, JournalEntriesPage, and other accounting workspace pages. This includes Redux-managed selection, `useEntityWorkspace` keyboard navigation, `EntityTable`-based list sidebar, and a two-column Context Header.

## 2. Key Decisions

- **List sidebar:** Two-column `EntityTable` (Category chip + Mapping Type label). Removes the "Assigned Account" column — that detail moves to the Context Header and Workspace Card.
- **Unconfigured rows:** All mapping types always shown (configured and unconfigured). Rows use `mappingType` string as synthetic `id` so `EntityTable` works uniformly.
- **Context Header for unconfigured rows:** Shows mapping info (name, category, description) with a "Configure" button. "Clear" button hidden when no account assigned.
- **Context Header for configured rows:** Shows mapping info + Account Details (code, name, type) with "Edit" and "Clear" buttons.
- **Selection split:** Redux holds `AccountMapping | null` (real entity or null). Keyboard-focused row index is local to the workspace hook — enabling navigation over all rows including unconfigured ones.

## 3. Architecture Changes

### 3.1 State Management

**`frontend/src/store/slices/accountingSlice.ts`:**
- Add `selectedAccountMapping: AccountMapping | null` to `AccountingState`
- Add `setSelectedAccountMapping` action
- Export `selectSelectedAccountMapping` selector

**`frontend/src/pages/accounting/hooks/useAccountMappingsWorkspace.ts`:**
- Accept `dispatch: AppDispatch`, `rows: MappingRow[]` (flat row array), `selected: AccountMapping | null` as parameters
- Use `useEntityWorkspace` with:
  - `entities: rows` (rows have synthetic `id = mappingType`)
  - `selectEntity: (row) => dispatch(setSelectedAccountMapping(row?.mapping ?? null))`
  - `routes.edit: () => '/accounting/account-mappings'` (no-op — dialog-based)
  - `onEnter: () => { if (focusedRow) openDialog(focusedRow) }`
  - `onEscape: () => { dispatch(setSelectedAccountMapping(null)) }`
- Retain local dialog state: `dialogOpen`, `selectedMapping`, `selectedMappingType`, `mappingToClear`, `clearing`
- Retain `handleClear` callback

### 3.2 Keyboard Navigation

Via `useEntityWorkspace`:
- `ArrowUp` / `ArrowDown`: navigate rows (all rows, including unconfigured)
- `Enter`: open configure/edit dialog for focused row
- `Escape`: clear selection

## 4. Component Changes

### 4.1 AccountMappingsTable → EntityTable

**`frontend/src/pages/accounting/components/AccountMappingsTable.tsx`:**

Replace raw MUI Table with `EntityTable`. Two columns:
- `category`: renders a `Chip` (size="small", color="primary", variant="outlined")
- `label`: renders the mapping type label string

Row type (`MappingRow`):
```ts
type MappingRow = {
  id: string           // = mappingType (synthetic)
  mappingType: string
  label: string
  category: string
  description: string
  mapping: AccountMapping | undefined
}
```

Props: `rows`, `loading`, `selectedId` (from `selected?.mappingType ?? null` — matched against `row.id`), `focusedIndex`, `onSelect`, `listRef`.

### 4.2 AccountMappingContextHeader

**`frontend/src/pages/accounting/components/AccountMappingContextHeader.tsx`:**

Redesign as two-column Grid layout:

**Header bar** (`EntityContextHeaderBar`):
- Title: focused row's `label` (e.g., "Sales Revenue")
- Actions:
  - `AppButton` variant="outlined": label "Configure" if `!row.mapping`, "Edit" if `row.mapping`
  - `AppButton` variant="warning": label "Clear" — only rendered when `row.mapping` exists

**Left column — Mapping Info:**
- Section title: "Mapping Info"
- Rows: Name, Category, Description

**Right column — Account Details:**
- Section title: "Account Details"
- Rows: Account Code, Account Name, Account Type — show "Not configured" (italic, text.secondary) when no mapping

**Empty state** (no row focused): `<Paper>` with centered "Select an account mapping to view details"

Props: `row: MappingRow | null`, `onConfigure: () => void`, `onClear: () => void`

### 4.3 AccountMappingWorkspaceCard

**`frontend/src/pages/accounting/components/AccountMappingWorkspaceCard.tsx`:**

Minor change: receives `mapping: AccountMapping | undefined` instead of `selected: AccountMapping | null`. Renders `—` for all fields when undefined. No layout changes.

### 4.4 AccountMappingsPage

**`frontend/src/pages/accounting/AccountMappingsPage.tsx`:**

- Add `useAppDispatch` + `useAppSelector(selectSelectedAccountMapping)`
- Pass `dispatch`, flat `tableRows` (as `rows`), and `selected` into `useAccountMappingsWorkspace`
- Move Refresh button from `filterExtra` → `secondaryAction` on `GenericListPage`
- Wire Context Header `onConfigure`/`onClear` through workspace dialog state
- Pass `focusedIndex` from workspace into `AccountMappingsTable`
- `listSlot` `selectedId` = `selected?.mappingType ?? null` (matched against row `id`)
- **Context Header receives the focused row object** (derived as `tableRows[workspace.focusedIndex] ?? null`), not the Redux `selected` entity — because unconfigured rows have no Redux selection but still need to display mapping info in the header

**`AccountMappingsDialogs.tsx`:** No changes.

## 5. Page Layout Summary

```
[Alert: validation status]
GenericListPage
  title="Account Mappings"
  primaryAction={null}           ← no global add action (mappings are fixed set)
  secondaryAction="Refresh"
  listSlot=<AccountMappingsTable>   ← 2-col EntityTable
  headerSlot=<AccountMappingContextHeader>  ← 2-col Grid, Configure/Edit/Clear
  workspaceSlot=<AccountMappingWorkspaceCard>
  dialogs=<AccountMappingsDialogs>
```

## 6. Testing

**`frontend/src/pages/accounting/__tests__/AccountMappingsPage.test.tsx`:**
- Add mocks for `useAppDispatch` / `useAppSelector` following the FiscalPeriodsPage test pattern
- Existing render + title test passes through unchanged
- Add test: clicking a configured row shows "Edit" and "Clear" in the Context Header
- Add test: clicking an unconfigured row shows "Configure" (no "Clear") in the Context Header

## 7. Success Criteria

- Account Mappings page is visually consistent with FiscalPeriodsPage workspace pattern
- All mapping types (configured and unconfigured) always visible in the list
- Keyboard navigation (Arrow, Enter, Escape) fully functional
- Selection state in Redux (`selectedAccountMapping`)
- Context Header adapts label/buttons based on configured vs unconfigured row
- Existing tests pass; new tests cover configure vs edit states
