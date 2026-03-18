# Journal Entries UI Redesign — Design Spec

**Issue**: #113
**Date**: 2026-03-17
**Status**: Approved

---

## Overview

Redesign the Journal Entries list page to follow the existing Material UI dark mode pattern used in `FiscalPeriodsPage` and `BankReconciliationsPage`. The page is view-only (auto-generated entries) — remove all mutation controls and focus on audit readability and transaction navigation.

---

## Approach

Full rewrite of `JournalEntriesPage.tsx`. The current file is structured around features being removed (bulk select, post, delete, edit). A rewrite is cleaner than surgical removal and the new design pattern is well-established in the codebase to follow.

---

## Page Structure

Top to bottom:

1. **Breadcrumb** — `Accounting / Journal Entries` via MUI `Breadcrumbs` (new pattern for accounting pages)
2. **Page header row** — left: icon + "Journal Entries" title + subtitle with entry count and fiscal period indicator (`FY2026 • Mar 2026`). Right: `[Refresh]` `[Export]` icon buttons
3. **Fiscal period indicator** — sourced from `useGetCurrentFiscalPeriodQuery()`
4. **Filter bar** — `<Paper sx={{ p: 2, mb: 3 }}>` wrapper containing Period, Status, Reversal dropdowns + Search text field
5. **Summary row** — plain text line above table showing totals across all filtered results
6. **Table** — simplified columns (see below)
7. **Pagination** — standard MUI `TablePagination` (new pattern for accounting pages)

No `[+ New Entry]` button — view-only page.

Keep `<AccountMappingWarning context="system" />` at the top of the page — retained from current implementation.

---

## Table Columns

| Column | Details |
|--------|---------|
| **JE No** | Clickable → `/accounting/journal-entries/:id`. Styled `primary.main`, cursor pointer. Displays `entry.referenceNumber` (already settings-formatted by backend: `PREFIX-YY-NNN`) |
| **Date** | `formatDate(entry.entryDate)` — reads date format from localStorage (settings-aware) |
| **Reference** | Clickable → source transaction route if `sourceType` exists and is navigable, plain text otherwise |
| **Description** | Truncated with ellipsis, full text in tooltip |
| **Status** | MUI Chip — `success`=Posted, `error`=Reversed. Entries with `reversalOfId` set show an additional `info`-colored "Reversal" chip (these entries have status `POSTED` — "Reversal" is derived from `reversalOfId !== null`, not from a status enum value) |
| **Reversal** | `↪ JE045` or `← JE001`, clickable → `/accounting/journal-entries/:id`. `—` if none |
| **Amount** | `formatCurrency(entry.totalDebits)` right-aligned — reads currency format from localStorage (settings-aware). Relies on `entry.lines` being loaded (keep existing `leftJoinAndSelect('entry.lines', 'lines')` join in `findAll()`) |

**Removed columns**: checkbox, bulk actions toolbar, edit button, actions column, created-by, lines, source/manual type, separate debit/credit columns (collapsed to single Amount).

**Row click**: no action — navigation only via clickable cells.

---

## Filter Bar

| Filter | Type | Options |
|--------|------|---------|
| Period | Select | All Periods + list from fiscal periods API |
| Status | Select | All / Posted / Reversed |
| Reversal | Select | All / Has Reversal / No Reversal |
| Search | TextField | Searches JE No, reference, description |

**Note on DRAFT**: DRAFT entries are excluded from this page. The frontend passes `excludeDraft: true` to the API at all times (see Backend Changes). Status filter offers All / Posted / Reversed only.

---

## Summary Row

Displayed between filter bar and table:

```
Entries: 154 | Total Debit: 8,250.00 | Total Credit: 8,250.00
```

- `Entries` = `meta.total` from pagination
- `Total Debit` / `Total Credit` = aggregate sums across **all filtered results** (not current page only), from new `meta.totalDebitAmount` and `meta.totalCreditAmount` fields
- Currency formatted via `formatCurrency()` (settings-aware)

---

## Backend Changes

### 1. `excludeDraft` param

Add `excludeDraft?: boolean` to `QueryJournalEntriesDto`. In `findAll()`, when `true`, add `WHERE status != 'DRAFT'`. This has no effect on other callers that do not pass the param — backend defaults are unchanged.

### 2. `hasReversal` filter param

Add `hasReversal?: boolean` to `QueryJournalEntriesDto`. In `findAll()`, when set:
- `true` → `WHERE (reversedById IS NOT NULL OR reversalOfId IS NOT NULL)`
- `false` → `WHERE (reversedById IS NULL AND reversalOfId IS NULL)`

**DTO decoration for both new boolean params**: HTTP query strings arrive as strings. Both `excludeDraft` and `hasReversal` require `@Transform(({ value }) => value === 'true' || value === true)` plus `@IsBoolean()` and `@IsOptional()` — following the pattern in `invoice.dto.ts` and `supplier.dto.ts`. Without `@Transform`, the string `"true"` from the frontend will fail `@IsBoolean()` validation and filters will silently never apply.

### 3. Aggregate totals in meta

The current `JournalEntryListResponseDto.meta` only has pagination fields. Add:

```ts
meta: {
  page: number
  limit: number
  total: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
  totalDebitAmount: number   // NEW
  totalCreditAmount: number  // NEW
}
```

`totalDebits`/`totalCredits` on `JournalEntry` are **TypeScript getter properties, not stored DB columns** — they cannot be SUMmed directly on `journal_entries`. The aggregate query must go against `journal_entry_lines`:

```sql
SELECT
  COALESCE(SUM(jel.debit_amount), 0) AS totalDebitAmount,
  COALESCE(SUM(jel.credit_amount), 0) AS totalCreditAmount
FROM journal_entry_lines jel
INNER JOIN journal_entries je ON jel.journal_entry_id = je.id
WHERE <same WHERE conditions as the paginated query>
  AND je.deleted_at IS NULL
```

Run this as a separate query in `findAll()` alongside the paginated query, using the same filter conditions.

**Important**: the `findAll()` paginated query uses a `QueryBuilder` with dynamic `andWhere()` clauses. The aggregate query must apply the exact same conditions (including `excludeDraft` and `hasReversal`). Extract condition-building into a shared helper, or keep both queries explicitly in sync — if conditions drift, the summary row totals will not match the displayed entries.

**DTO change**: `journal-entry.dto.ts` — add `totalDebitAmount` and `totalCreditAmount` to `JournalEntryListResponseDto.meta`.

---

## Frontend Changes

### `JournalEntryPaginatedResponse` type

`PaginatedResponse<T>` in `frontend/src/types/index.ts` defines `meta` as `{ total: number }` only — the new fields would be silently dropped by the generic type.

Add a `JournalEntryPaginatedResponse` interface:

```ts
export interface JournalEntryPaginatedResponse extends PaginatedResponse<JournalEntry> {
  meta: PaginatedResponse<JournalEntry>['meta'] & {
    totalDebitAmount: number
    totalCreditAmount: number
  }
}
```

Update `getJournalEntries` in `accountingApi.ts` to return `JournalEntryPaginatedResponse` and use a custom `transformResponse` (instead of the generic `normalizePaginated`) that preserves `totalDebitAmount` and `totalCreditAmount` from the raw response `meta`. The type change is additive — existing callers reading only `meta.total` continue to work without modification.

---

## Navigation Behavior

### JE No
Navigates to `/accounting/journal-entries/:id` (journal entry detail page).

### Reference
Reuses the existing `navigateToSourceTransaction` routing logic (lowercase sourceType values as stored by backend):

| sourceType (lowercase) | Route |
|------------------------|-------|
| `sales_order` | `/sales/orders?highlight=:sourceId` |
| `payment` | `/sales/payments?highlight=:sourceId` |
| `goods_received_note` | `/purchasing/goods-received?grnId=:sourceId` |
| `vendor_payment` | `/purchasing/vendor-payments?vpId=:sourceId` |
| `expense` | `/accounting/expenses` |
| `owner_equity_transaction` | `/accounting/owner-equity` |
| `stock_adjustment` | `/inventory/stock-adjustments/:sourceId/edit` |
| `fund_transfer` | `/accounting/fund-transfers` |
| `manual` / no sourceType | Plain text, not clickable |

### Reversal Column

| Entry type | Display | Navigates to |
|------------|---------|-------------|
| Original (Reversed) | `↪ JE045` | `/accounting/journal-entries/:reversedById` |
| Reversal entry (`reversalOfId` set) | `← JE001` | `/accounting/journal-entries/:reversalOfId` |
| No relationship | `—` | — |

Both navigate to the journal entry detail page.

---

## Component Patterns

Follows `FiscalPeriodsPage` / `BankReconciliationsPage` patterns:

- `useTheme()` + `useMediaQuery()` for responsive layout
- `TYPOGRAPHY_STYLES` constants for font consistency
- `TABLE_STYLES` constants for cell borders/padding/heights
- `useNotification()` hook for toasts
- `useGetCurrentFiscalPeriodQuery()` for period indicator
- `AccountMappingWarning` retained at top of page
- No `ConfirmationDialog` needed (no mutations)

---

## Testing

### Frontend — `frontend/src/pages/accounting/JournalEntriesPage.test.tsx` (full rewrite)

Delete the duplicate at `__tests__/JournalEntriesPage.test.tsx` — the canonical location is the co-located file at `pages/accounting/JournalEntriesPage.test.tsx`, consistent with `BankReconciliationDetailsPage.test.tsx` and `JournalEntryDetailsPage.test.tsx`.

| Test | Coverage |
|------|----------|
| Renders breadcrumb (`Accounting / Journal Entries`) and period indicator | Header structure |
| Renders summary row with totals from meta | `totalDebitAmount` / `totalCreditAmount` |
| Renders correct columns, no checkbox/bulk actions | Column structure |
| JE No click navigates to detail page | `/accounting/journal-entries/:id` |
| Reference click navigates to source transaction | Each sourceType mapping |
| Reversal link navigates to related journal entry | `reversedById` and `reversalOfId` |
| Status chip shows "Reversal" (info) for entries with `reversalOfId` set | Derived chip logic |
| Status chips show correct colors for Posted / Reversed | Enum-based chip logic |
| Filter changes trigger new API call | Period, Status, Reversal, Search |
| Empty reversal shows `—` | Null/undefined reversal |

### Backend — `journal-entry.service.spec.ts`

Add tests covering:
- `totalDebitAmount` and `totalCreditAmount` in `meta` for filtered queries (aggregated from `journal_entry_lines`)
- `excludeDraft: true` excludes DRAFT entries from results
- `hasReversal: true` returns only entries with reversal relationships
- `hasReversal: false` returns only entries without reversal relationships

---

## Out of Scope

- Manual journal creation
- Inline journal editing
- Bulk operations
- Journal entry creation from this page
