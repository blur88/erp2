# COA Page Filters & Sort — Issue #405

## Overview

Add Account Type and Active Status filters to the Chart of Accounts page, plus a working sort button that toggles the account list by code asc/desc.

## Scope

Three changes to `ChartOfAccountsPage.tsx` and the shared FilterBar system:

1. New `account-type` filter type (Account Type dropdown)
2. Reuse existing `status` filter type (Active Status dropdown)
3. Working sort toggle by account code

## New Filter Type: `account-type`

**`filterBar.types.ts`**
- Add `'account-type'` to `FilterFieldType` union
- Add `AccountTypeFilterFieldConfig` interface (extends `BaseFilterFieldConfig`, type `'account-type'`)
- Add to `FilterFieldConfig` union

**`useFilterBar.ts`**
- Add `'account-type'` to the null-default branch alongside `'journal-entry-type'`, `'owner-equity-type'`, etc.

**`FilterAccountType.tsx`** — new component at `frontend/src/components/filters/FilterAccountType.tsx`
- Follows same pattern as `FilterJournalEntryType`
- Renders `FilterSelect` with label "Account Type"
- Options (value → label): `ASSET → Asset`, `LIABILITY → Liability`, `EQUITY → Equity`, `REVENUE → Revenue`, `EXPENSE → Expense`

**`FilterBar.tsx`**
- Import `FilterAccountType`
- Add `if (field.type === 'account-type')` branch in `renderQuickField`

## `ChartOfAccountsPage.tsx` Changes

**`CoaFilters` interface**
```ts
interface CoaFilters {
  search: string
  accountType: string | null
  isActive: string | null
}
```

**`filterConfig`**
```ts
const filterConfig: FilterBarConfig<CoaFilters> = {
  search: { placeholder: 'Search by code or name...' },
  fields: [
    { field: 'accountType', label: 'Account Type', type: 'account-type' },
    { field: 'isActive', label: 'Status', type: 'status' },
  ],
  defaults: { search: '', accountType: null, isActive: null },
}
```

**Sort state**
```ts
const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
```

**`filteredAccounts` useMemo** — apply filters then sort:
1. Search filter (existing)
2. `accountType` — `account.type === appliedFilters.accountType` when non-null
3. `isActive` — `String(account.isActive) === appliedFilters.isActive` when non-null (values: `'true'` / `'false'`)
4. Sort by `account.code` asc or desc

**Sort prop**
```ts
sort={{
  field: 'code',
  sortBy: 'code',
  sortOrder,
  onSort: () => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc')),
}}
```

**Subtitle** — use `hasActiveFilters` to decide when to show "X of Y":
```ts
subtitle={`Manage your accounting structure and account hierarchy (${hasActiveFilters ? `${filteredAccounts.length} of ${accounts.length}` : `${accounts.length} total`})`}
```

## Tests

Update `ChartOfAccountsPage.test.tsx`:
- Filter by account type hides accounts of other types
- Filter by active status shows only active/inactive accounts
- Combined filters (type + status) work correctly
- Sort toggles order of accounts by code

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/types/filterBar.types.ts` | Add `account-type` type + config interface |
| `frontend/src/hooks/useFilterBar.ts` | Add `account-type` to null-default branch |
| `frontend/src/components/filters/FilterAccountType.tsx` | New component |
| `frontend/src/components/filters/FilterBar.tsx` | Wire `account-type` in `renderQuickField` |
| `frontend/src/pages/accounting/ChartOfAccountsPage.tsx` | Filters + sort |
| `frontend/src/pages/accounting/__tests__/ChartOfAccountsPage.test.tsx` | New test cases |
