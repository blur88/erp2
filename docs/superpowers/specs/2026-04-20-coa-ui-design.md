# Chart of Accounts UI Improvement — Design Spec

**Issue:** #397
**Date:** 2026-04-20

## Problem

The COA page was refactored to `GenericListPage` in commit `021f298af7` (issue #395). Several
specialized features were lost: type-specific badge colors, consistent styling with the sales page
standard, and missing workspace detail fields.

## Decisions Made

- **No indentation**: Default seed has no parent relationships; indentation adds complexity for
  zero immediate visual benefit. Account code numbering (1000, 1010, 1020) conveys hierarchy.
- **No row-level actions**: Consistent with all other pages except `ExpensesTable` (which is an
  outlier). Actions stay in the context header only.
- **Hierarchy endpoint**: Switch from `getChartOfAccounts` (flat paginated) to
  `getChartOfAccountsHierarchy` (tree). COA datasets are small (~18 default, rarely >200).
  Active-only is acceptable — inactive accounts belong in the "View Deleted" flow.
- **`EntityTable`**: COA table migrates to `EntityTable` + `ColumnConfig[]`, matching
  `CategoryList`, `InvoicesTable`, `OrdersTable`. Requires one shared component change.
- **Sales page standard**: `ChartOfAccountContextHeader` and `ChartOfAccountWorkspaceCard`
  updated to match `InvoiceContextHeader` / `InvoiceWorkspaceCard` styling conventions.

## Scope

### 1. `EntityTable` — add `raw` flag to `ColumnConfig`

Add optional `raw?: boolean` to the `ColumnConfig` interface. When `true`, the cell renders
the `render()` result directly without the `<Typography>` wrapper. Required for Chip cells.

**File:** `frontend/src/components/common/EntityTable.tsx`

Change the cell render from:
```tsx
<Typography variant="body2" ...>{column.render(row)}</Typography>
```
to:
```tsx
{column.raw ? column.render(row) : <Typography variant="body2" ...>{column.render(row)}</Typography>}
```

### 2. `ChartOfAccountsPage` — switch to hierarchy endpoint

**File:** `frontend/src/pages/accounting/ChartOfAccountsPage.tsx`

- Replace `useGetChartOfAccountsQuery` with `useGetChartOfAccountsHierarchy`
- Add inline `useMemo` to flatten the tree depth-first into a `ChartOfAccount[]`
- Pass the flat array to `ChartOfAccountsTable` (same prop shape as today)
- Remove pagination-related props (`accountsResponse?.meta?.total`) — use `accounts.length` instead

Flatten utility (inline `useMemo`):
```ts
const accounts = useMemo(() => {
  const result: ChartOfAccount[] = []
  const walk = (nodes: ChartOfAccount[]) => {
    for (const node of nodes) {
      result.push(node)
      if (node.children?.length) walk(node.children)
    }
  }
  walk(hierarchyData ?? [])
  return result
}, [hierarchyData])
```

### 3. `ChartOfAccountsTable` — migrate to `EntityTable`

**File:** `frontend/src/pages/accounting/components/ChartOfAccountsTable.tsx`

Replace raw MUI `Table` with `EntityTable` + `ColumnConfig<ChartOfAccount>[]`.

Columns:
| Key | Render | `raw` |
|-----|--------|-------|
| `code` | `account.code` | false |
| `name` | `account.name` | false |
| `type` | `<Chip>` with color map | true |
| `status` | `<Chip>` Active/Inactive | true |

Type badge color map:
```ts
const TYPE_COLORS: Record<AccountType, ChipProps['color']> = {
  ASSET: 'success',
  LIABILITY: 'error',
  EQUITY: 'primary',
  REVENUE: 'info',
  EXPENSE: 'warning',
}
```

Props interface change: remove `listRef` (pass directly to `EntityTable`). Pass `focusedIndex={-1}`
as a constant — COA has no keyboard navigation. Match `CategoryList` prop signature pattern.

### 4. `ChartOfAccountContextHeader` — align to sales page standard

**File:** `frontend/src/pages/accounting/components/ChartOfAccountContextHeader.tsx`

- Replace custom `px: 2, py: 1.5` with `TABLE_STYLES.cell.padding.px`
- Switch title from `variant="subtitle2"` to `variant="tableHeader"` uppercase with
  `letterSpacing: '0.5px'`
- Fix empty state: centered Paper with `variant="h6"` `color="text.secondary"` (matches
  `InvoiceContextHeader`)
- Apply type badge color map (same as table) to the selected account chip

### 5. `ChartOfAccountWorkspaceCard` — align to sales page standard

**File:** `frontend/src/pages/accounting/components/ChartOfAccountWorkspaceCard.tsx`

- Add `fontSize: '0.8rem'` to value cells
- Add alternating `grey.50` background on even rows (matching `InvoiceContextHeader` pattern)
- Add missing fields:
  - `isCashEquivalent` — show "Yes" / "No"
  - `createdAt` — formatted date
  - `updatedAt` — formatted date

## Files Changed

| File | Change type |
|------|-------------|
| `frontend/src/components/common/EntityTable.tsx` | Add `raw` flag to `ColumnConfig` |
| `frontend/src/pages/accounting/ChartOfAccountsPage.tsx` | Switch endpoint, flatten tree |
| `frontend/src/pages/accounting/components/ChartOfAccountsTable.tsx` | Migrate to `EntityTable` |
| `frontend/src/pages/accounting/components/ChartOfAccountContextHeader.tsx` | Styling fixes |
| `frontend/src/pages/accounting/components/ChartOfAccountWorkspaceCard.tsx` | Styling + new fields |

## Out of Scope

- Removing row-level actions from `ExpensesTable` (separate cleanup issue)
- Adding indentation (deferred — no parent relationships in default seed)
- Backend changes (none required)
- `useChartOfAccountsWorkspace` (no changes needed)
- `ChartOfAccountsDialogs` (no changes needed)
