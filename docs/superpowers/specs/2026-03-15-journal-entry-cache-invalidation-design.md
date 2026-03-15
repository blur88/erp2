# Journal Entry Cache Invalidation Fix — Design Spec

**Date:** 2026-03-15
**Issue:** #105
**File:** `frontend/src/store/api/accountingApi.ts`

## Problem

The Journal Entries page does not auto-refresh after certain accounting actions (Owner Equity post/reverse, Settlement create, Expense post/bulk-post) because those RTK Query mutations are missing `'JournalEntry'` in their `invalidatesTags` arrays. Users must manually refresh to see new journal entries.

## Root Cause

Mutations that create journal entries on the backend must include `'JournalEntry'` in `invalidatesTags` so RTK Query invalidates the journal entries cache and triggers a re-fetch. This pattern is already correctly applied to `createFundTransfer` and `cancelFundTransfer` — the fix applies the same pattern to the 5 affected mutations.

## Audit Results

Full audit of all mutations in `accountingApi.ts` that interact with journal entries:

| Mutation | Creates JE? | Fix needed? |
|---|---|---|
| `postOwnerEquityTransaction` | Yes — calls `postOwnerEquityEntry` | **Yes** |
| `reverseOwnerEquityTransaction` | Yes — creates reversal JE | **Yes** |
| `createSettlement` | Yes — calls `postSettlementEntry` inline | **Yes** |
| `postExpense` | Yes — calls `postExpenseEntry` | **Yes** |
| `bulkPostExpenses` | Yes — calls post per item | **Yes** |
| `cancelSettlement` | No — status change only, no JE | No |
| `bulkDeleteExpenses` | No — deletes drafts only | No |
| `createFundTransfer` | Yes — already has `JournalEntry` tag | No change needed |
| `cancelFundTransfer` | Yes — already has `JournalEntry` tag | No change needed |
| Bank reconciliation mutations | Read-only on JE lines | No |

Note: `bulkPostOwnerEquityTransactions` referenced in the issue does not exist in the codebase.

## Changes

Single file: `frontend/src/store/api/accountingApi.ts`

### 1. `postOwnerEquityTransaction`
```typescript
// Before
invalidatesTags: (_result, _error, id) => [{ type: 'OwnerEquity', id }, 'OwnerEquity', 'AccountingReport'],
// After
invalidatesTags: (_result, _error, id) => [{ type: 'OwnerEquity', id }, 'OwnerEquity', 'JournalEntry', 'AccountingReport'],
```

### 2. `reverseOwnerEquityTransaction`
```typescript
// Before
invalidatesTags: (_result, _error, id) => [{ type: 'OwnerEquity', id }, 'OwnerEquity', 'AccountingReport'],
// After
invalidatesTags: (_result, _error, id) => [{ type: 'OwnerEquity', id }, 'OwnerEquity', 'JournalEntry', 'AccountingReport'],
```

### 3. `createSettlement`
```typescript
// Before
invalidatesTags: ['Settlement', 'AccountingReport'],
// After
invalidatesTags: ['Settlement', 'JournalEntry', 'AccountingReport'],
```

### 4. `postExpense`
```typescript
// Before
invalidatesTags: (_result, _error, id) => [{ type: 'Expense', id }, 'Expense', 'AccountingReport'],
// After
invalidatesTags: (_result, _error, id) => [{ type: 'Expense', id }, 'Expense', 'JournalEntry', 'AccountingReport'],
```

### 5. `bulkPostExpenses`
```typescript
// Before
invalidatesTags: ['Expense', 'AccountingReport'],
// After
invalidatesTags: ['Expense', 'JournalEntry', 'AccountingReport'],
```

## Testing

- No new test files needed — this is a configuration-only change.
- Existing RTK Query integration tests (if any) should continue to pass.
- Manual verification: perform each action and confirm Journal Entries page auto-refreshes without a manual reload.

## Scope

- No backend changes
- No database migrations
- No new files
- No API contract changes
