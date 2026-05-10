# Bank Reconciliation UI Refactor — Design Spec

**Date:** 2026-05-02
**Issue:** #505
**Status:** Approved

## Overview

Refactor the Bank Reconciliations page to match the gold standard UI/UX established by the Journal Entries and Sales Orders pages. This involves migrating from raw MUI Table components to `EntityTable`, rebuilding the context header as a 2-column Grid, standardising the workspace card header, locking completed reconciliations, and moving search server-side.

## Scope

### In scope
- `BankReconciliationsTable.tsx` — migrate to EntityTable, single-column list
- `BankReconciliationContextHeader.tsx` — rebuild as 2-column Grid
- `BankReconciliationWorkspaceCard.tsx` — standardise header, add lock state
- `useBankReconciliationsWorkspace.ts` — add focusedIndex via useEntityWorkspace
- `BankReconciliationsPage.tsx` — server-side search, real sort handler, pass focusedIndex/total
- Backend DTO + service — add `search` param to `QueryBankReconciliationsDto` and `findAll`
- `BankReconciliationsPage.test.tsx` — update assertions

### Out of scope
- New API endpoints or migrations
- Changes to dialogs (BankReconciliationsDialogs, BankReconciliationFormDialog)
- Changes to other accounting pages

---

## Section 1 — Backend: `search` param

**File:** `backend/src/modules/accounting/dto/reconciliation.dto.ts`

Add to `QueryBankReconciliationsDto`:

```typescript
@ApiPropertyOptional({ description: 'Search by account name, account code, or fiscal period name' })
@IsOptional()
@IsString()
search?: string;
```

**File:** `backend/src/modules/accounting/services/reconciliation.service.ts`

In `findAll`, after the existing `status` filter block, add:

```typescript
if (search) {
  queryBuilder.andWhere(
    '(account.name ILIKE :search OR account.code ILIKE :search OR fiscalPeriod.name ILIKE :search)',
    { search: `%${search}%` },
  );
}
```

The `account` and `fiscalPeriod` joins are already present — no extra joins needed. No migration required.

---

## Section 2 — `BankReconciliationsTable` → EntityTable

Replace the raw 4-column MUI Table with `EntityTable`.

**Column config:** single `raw: true` column rendering two stacked lines:
- Primary: `account.name` (Typography body2, fontWeight 500)
- Secondary: `format(reconciliationDate, 'MMMM yyyy')` (Typography caption, color text.secondary)

**Updated props:**
```typescript
interface Props {
  reconciliations: BankReconciliation[]
  loading: boolean
  total: number
  selectedId: string | null
  focusedIndex: number
  onSelect: (item: BankReconciliation) => void
  listRef: React.RefObject<HTMLDivElement | null>
}
```

The status chip is removed from the list sidebar — it is visible in the context header bar instead.

---

## Section 3 — `BankReconciliationContextHeader` → 2-column Grid

Rebuild to match `JournalEntryContextHeader` exactly.

**Empty state:** Centered `Typography variant="h6"` with `color="text.secondary"`:
> "Select a reconciliation to view details"

**When selected:** Keep `EntityContextHeaderBar` with title (`account.name`), `EntityStatusChip`, and action buttons (Complete / Reopen / Delete) unchanged.

Below the bar: `Grid container spacing={3} sx={{ p: TABLE_STYLES.cell.padding.px }}` with two `size={{ xs: 12, md: 6 }}` columns. Use the same `detailTableSx`, `labelCellSx`, `valueCellSx`, `sectionHeaderCellSx` constants as JournalEntryContextHeader.

**Left column — "Reconciliation Details":**

| Row | Label | Value |
|-----|-------|-------|
| header | colspan=2 | "Reconciliation Details" (section header style) |
| grey.50 | Statement Date | `format(reconciliationDate, 'MMMM yyyy')` |
| white | Account | `account.code — account.name` |
| grey.50 | Fiscal Period | `fiscalPeriod?.name ?? '—'` |

**Right column — "Financial Summary":**

| Row | Label | Value |
|-----|-------|-------|
| header | colspan=2 | "Financial Summary" (section header style) |
| grey.50 | Statement Balance | `formatCurrency(statementBalance)` |
| white | Book Balance | `formatCurrency(bookBalance)` |
| grey.50 | Difference | `formatCurrency(difference)` — colored `success.main` if `isBalanced`, `error.main` if not |

---

## Section 4 — `BankReconciliationWorkspaceCard` — header + lock

**Header:** Replace the `Box` + `Typography` header with the single-row Table pattern from `JournalEntryWorkspaceCard`:

```tsx
<TableContainer>
  <Table size={TABLE_STYLES.size} sx={{ tableLayout: 'fixed', '& .MuiTableCell-root': { border: 'none', py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px } }}>
    <TableBody>
      <TableRow>
        <TableCell colSpan={4} sx={{ pb: TABLE_STYLES.cell.padding.py * 0.67, py: TABLE_STYLES.cell.padding.py * 0.67, borderTop: TABLE_STYLES.cell.border }}>
          <Typography variant="tableHeader" sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Transactions
          </Typography>
        </TableCell>
      </TableRow>
    </TableBody>
  </Table>
</TableContainer>
```

The "Difference: X" value moves from the header row into the workspace body as a summary line above the transaction table (consistent with how JE shows imbalance via Alert).

**Lock state:** When `selected.status === COMPLETED`:
- Show `Alert severity="info"` above the transaction table: "This reconciliation is completed. Reopen it to make changes."
- All `Checkbox` components get `disabled={isCompleted}` (where `isCompleted = selected.status === BankReconciliationStatus.COMPLETED`)

The existing imbalance `Alert severity="warning"` is only shown when not completed (an in-progress reconciliation with a non-zero difference).

---

## Section 5 — `useBankReconciliationsWorkspace` + `BankReconciliationsPage`

### Hook

Refactor to use `useEntityWorkspace` for core plumbing (focusedIndex, keyboard nav, listRef, searchInputRef), keeping bank-specific mutation logic on top. The return shape gains `focusedIndex: number`.

### Page

- Add `sortBy` / `sortOrder` state (defaults: `'reconciliationDate'` / `'desc'`), with a real `onSort` handler (same pattern as JournalEntriesPage)
- Pass `search: appliedFilters.search || undefined` to `useGetBankReconciliationsQuery` — removes the client-side filter `useMemo` entirely
- Restore search input focus after search change (same `window.setTimeout` pattern as JE)
- Pass `focusedIndex` and `total` (from `data?.meta?.total ?? 0`) to `BankReconciliationsTable`

---

## Section 6 — Testing (`BankReconciliationsPage.test.tsx`)

- Update mock shape for `useGetBankReconciliationsQuery` to include `meta.total`
- Assert `EntityTable` renders (e.g. check for account name text, absence of column headers like "Account", "Period")
- Assert that completed reconciliations render checkboxes as disabled
- Assert that `search` is passed to the query when the search input changes

---

## Success Criteria

- [ ] Bank Reconciliations list uses EntityTable with a single-column (name + period) sidebar
- [ ] Context header uses 2-column Grid with Reconciliation Details / Financial Summary
- [ ] Difference field in context header is colored success/error based on balance state
- [ ] Workspace card header is uppercase "TRANSACTIONS" using the standard Table pattern
- [ ] Completed reconciliations show an info Alert and disabled checkboxes
- [ ] Search is server-side (passed to API query), client-side filter removed
- [ ] Keyboard navigation (focusedIndex) works consistently with Journal Entries
- [ ] Visual styling matches Journal Entries exactly
- [ ] Existing tests updated and passing
