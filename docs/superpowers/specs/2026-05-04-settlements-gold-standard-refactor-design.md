# Settlements Page — Gold Standard Refactor Design

**Issue**: #517  
**Date**: 2026-05-04  
**Pattern reference**: `JournalEntriesPage`, `OrdersPage`, `PurchaseOrdersPage`

## Overview

Refactor the Settlements module to align with the project's List-Detail (Workspace) gold standard. The current implementation uses a legacy manual table and a hand-rolled workspace hook that lacks keyboard navigation, search focus preservation, and proper sort state. This refactor brings it to parity with Journal Entries — the closest accounting-module reference.

## Files Changed

1. `frontend/src/pages/accounting/components/SettlementsTable.tsx`
2. `frontend/src/pages/accounting/hooks/useSettlementsWorkspace.ts`
3. `frontend/src/pages/accounting/SettlementsPage.tsx`
4. `frontend/src/pages/accounting/components/SettlementContextHeader.tsx`
5. `frontend/src/pages/accounting/components/SettlementWorkspaceCard.tsx`
6. `frontend/src/pages/accounting/__tests__/SettlementsPage.test.tsx` (minor, if needed)

---

## 1. SettlementsTable.tsx

**Change**: Replace manual 5-column `Table` with a thin wrapper over `EntityTable`.

**New column config**:
```ts
const COLUMNS: ColumnConfig<Settlement>[] = [
  { key: 'settlementNumber', render: (s) => s.settlementNumber },
]
```

**Props**:
```ts
interface Props {
  settlements: Settlement[]
  loading: boolean
  total: number
  selectedId: string | null
  focusedIndex: number
  onSelect: (item: Settlement) => void
  listRef: React.RefObject<HTMLDivElement | null>
}
```

- Drop manual loading/empty-state rendering — `EntityTable` handles this
- Add `focusedIndex` (required by `EntityTable`)
- Add `total` (passed as `settlements.length` from the page, for the count label)
- `dataAttr="settlement"`

---

## 2. useSettlementsWorkspace.ts

**Change**: Delegate to `useEntityWorkspace` for all generic workspace concerns; keep cancel-specific state on top.

**New signature**:
```ts
export function useSettlementsWorkspace(entities: Settlement[], refetch: () => void)
```

**Structure**:
- `useEntityWorkspace<Settlement>` owns: `focusedIndex`, `listRef`, `searchInputRef`, keyboard shortcuts (Up/Down/PgUp/PgDn/Home/End/Escape), auto-select first item, search focus preservation (`setShouldPreserveSearchFocus`)
- `useEntityWorkspace` config: `routes` point to `/accounting/settlements`; `deleteMutation` is a no-op; `onEnter` is a no-op (no edit route for settlements)
- On top: `selected` (explicitly extracted as `const selected = workspace.selectedEntity`), `dialogOpen`/`setDialogOpen`, `cancelTarget`/`setCancelTarget`, `handleConfirmCancel` (same logic as today — calls `cancelSettlement`, calls `workspace.selectEntity(next)` to update, shows notification, refetches)

**Return**:
```ts
return {
  ...workspace,           // focusedIndex, listRef, searchInputRef, handleSelect, setShouldPreserveSearchFocus, etc.
  selected,
  dialogOpen, setDialogOpen,
  cancelTarget, setCancelTarget,
  handleConfirmCancel,
}
```

---

## 3. SettlementsPage.tsx

**Changes**:

1. **Sort state** — add at page level:
   ```ts
   const [sortBy, setSortBy] = useState('settlementDate')
   const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
   ```
   Add `handleSort` callback (toggles order if same field, else resets to desc). Pass to `GenericListPage` `sort` prop replacing the current static `onSort: () => {}`.

2. **Hook call** — update to new signature:
   ```ts
   const workspace = useSettlementsWorkspace(settlements, refetch)
   ```
   Move `settlements` derivation above the hook call.

3. **Search focus preservation** — wrap `handlers.onSearchChange` in a `filterHandlers` memo (matching JournalEntries pattern):
   ```ts
   const filterHandlers = useMemo(() => ({
     ...handlers,
     onSearchChange: (value: string) => {
       handlers.onSearchChange(value)
       workspace.setShouldPreserveSearchFocus(true)
     },
   }), [handlers, workspace])
   ```
   Pass `filterHandlers` instead of `handlers` to `GenericListPage`.

4. **Table props** — add `focusedIndex={workspace.focusedIndex}` and change `onSelect={workspace.setSelected}` to `onSelect={workspace.handleSelect}`.

---

## 4. SettlementContextHeader.tsx

**Change**: Adopt the two-column Grid layout from `JournalEntryContextHeader`.

**Structure**:
```
Paper sx={{ overflow: 'hidden' }}
  EntityContextHeaderBar (title, statusChip, actions)
  Grid container spacing={3} sx={{ p: TABLE_STYLES.cell.padding.px }}
    Grid size={{ xs: 12, md: 6 }}   ← Left: Settlement Information
      Table: Date, Payment Method, Status
    Grid size={{ xs: 12, md: 6 }}   ← Right: Amounts & Details
      Table: Total Amount, Linked Payments, Reference, Notes
```

**Styling constants** (same as JournalEntryContextHeader):
```ts
const detailTableSx = { tableLayout: 'fixed', '& .MuiTableCell-root': { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px, '&:nth-of-type(1)': { width: '40%' }, '&:nth-of-type(2)': { width: '60%' } } }
const labelCellSx = { fontWeight: 600, color: 'text.secondary', fontSize: '0.8rem' }
const valueCellSx = { fontSize: '0.8rem' }
const sectionHeaderCellSx = { pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }
```

**Empty state**:
```tsx
<Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
  <Typography variant="h6" sx={{ color: 'text.secondary' }}>
    Select a settlement to view details
  </Typography>
</Paper>
```

**Cancel button** stays in `EntityContextHeaderBar`'s `actions` slot, unchanged.

**Left column — "Settlement Information"**:
| Label | Value |
|---|---|
| Date | `formatDate(selected.settlementDate)` |
| Payment Method | `selected.paymentMethod?.name \|\| '—'` |
| Status | `<EntityStatusChip status={selected.status} />` |

**Right column — "Amounts & Details"**:
| Label | Value |
|---|---|
| Total Amount | `formatCurrency(Number(selected.totalAmount \|\| 0))` |
| Linked Payments | `selected.paymentCount` |
| Reference | `selected.reference \|\| '—'` |
| Notes | `selected.notes \|\| '—'` |

---

## 5. SettlementWorkspaceCard.tsx

**Change**: Minimal — align section header styling to use the same `sectionHeaderCellSx` constant pattern used in reference modules. Data rows (Payment Method, Linked Payments, Reference, Notes) are unchanged.

No data reshaping. The WorkspaceCard is intentionally left with its current fields — the issue does not call for a payments-list view and the ContextHeader right column already shows the summary data.

---

## 6. Tests

`SettlementsPage.test.tsx` requires no structural changes:
- `'renders title and settlement row'` — `EntityTable` still renders `settlementNumber`, so `SET-001` is still found
- `'renders create action'` — unchanged
- `BrowserRouter` wrapper already present, satisfies `useNavigate`/`useSearchParams` from `useEntityWorkspace`

---

## Success Criteria (from issue #517)

- [x] Left panel uses `EntityTable` with single `settlementNumber` column
- [x] `SettlementContextHeader` uses 2-column Grid layout (Date/Status/Method left, Amounts right)
- [x] `SettlementWorkspaceCard` uses `TABLE_STYLES` consistently
- [x] Keyboard navigation (Up/Down arrows) via `useEntityWorkspace`
- [x] Search focus preservation via `setShouldPreserveSearchFocus`
- [x] Sorting moved to page-level state (default: `settlementDate` DESC)
