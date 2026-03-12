# Accounting Reports Spec Refactor Design

**Date:** 2026-03-09
**File:** `backend/src/modules/accounting/services/accounting-reports.service.spec.ts`
**Approach:** B (reliability) → A (readability) → C (structure)

## Problem

The existing 2255-line spec file has three compounding issues:

1. **Reliability (B):** A single shared `mockQueryBuilder` object is reused across all tests. Sequential call differentiation uses fragile counter patterns (`let getManyCalls = 0`) that silently assert wrong data if the service adds an internal query call.
2. **Readability (A):** Account fixture objects are copy-pasted ~30 times inline. UUID strings are repeated literals. No shared named constants.
3. **Structure (C):** Six distinct report domains (trial balance, balance sheet, general ledger, P&L, account activity, Excel exports) are collapsed into one file, making it hard to navigate and destined to grow unboundedly.

## Design

### Shared Fixtures File

**Path:** `src/modules/accounting/services/__fixtures__/accounting-reports.fixtures.ts`

Contains:
- Named account constants: `CASH_ACCOUNT`, `AP_ACCOUNT`, `EQUITY_ACCOUNT`, `REVENUE_ACCOUNT`, `COGS_ACCOUNT`, `OPEX_ACCOUNT`
- Named UUID constants: `ACCOUNT_IDS` object
- `createMockQueryBuilder()` factory — returns a **fresh isolated mock object** per call (core reliability fix)
- `createMockRepositories(qb)` factory — wires the three repository mocks against a given query builder

### Mock Isolation Pattern

Each spec file creates a fresh query builder in `beforeEach`:

```ts
beforeEach(async () => {
  qb = createMockQueryBuilder(); // fresh per test — no shared state
  const { accountRepo, journalRepo, lineRepo } = createMockRepositories(qb);
  // ...module setup
});
```

Sequential call differentiation replaces counter hacks with chained `mockResolvedValueOnce`:

```ts
// Before (fragile):
let getManyCalls = 0;
mockQueryBuilder.getMany.mockImplementation(() => {
  if (++getManyCalls === 1) return Promise.resolve(bsAccounts);
  return Promise.resolve(isAccounts);
});

// After (clear):
qb.getMany
  .mockResolvedValueOnce(bsAccounts)
  .mockResolvedValueOnce(isAccounts);
```

### File Split

| New File | Methods Covered |
|----------|----------------|
| `accounting-reports.balances.spec.ts` | `calculateAccountBalance`, `calculateAccountBalances`, `getAccountsByType`, `getAccountsWithBalances` |
| `accounting-reports.trial-balance.spec.ts` | `generateTrialBalance`, `exportTrialBalanceToExcel` |
| `accounting-reports.balance-sheet.spec.ts` | `generateBalanceSheet`, `exportBalanceSheetToExcel` |
| `accounting-reports.general-ledger.spec.ts` | `generateGeneralLedger`, `exportGeneralLedgerToExcel` |
| `accounting-reports.profit-and-loss.spec.ts` | `generateProfitAndLoss`, `exportProfitAndLossToExcel` |
| `accounting-reports.account-activity.spec.ts` | `generateAccountActivity`, `exportAccountActivityToExcel` |

Excel export tests are co-located with their report type file.

### Fixture Reuse Policy

- **Extract to fixture:** Any account shape used more than once across the file → named constant
- **Stay inline:** One-off scenario data (specific transaction amounts, unique mock responses)
- **No assertion helpers:** `expect` calls stay as-is — no abstraction that obscures what's being verified

### Migration & Deletion

1. Create `__fixtures__/accounting-reports.fixtures.ts`
2. Create 6 spec files one at a time, migrating tests from the original
3. After each file: run its tests in isolation to confirm green
4. Delete original file last, run full suite to confirm nothing missed
5. No test logic changes — assertions are preserved exactly, only structure moves

**No Jest config changes needed** — all `*.spec.ts` files are auto-discovered.

## Constraints

- TypeScript strict: false (project standard — use `as any` where needed)
- No new test cases added in this refactor
- No assertion rewrites — if a test was passing before, it passes after
