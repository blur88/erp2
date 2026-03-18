# Journal Entry Cache Invalidation Fix Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `'JournalEntry'` to `invalidatesTags` for 5 RTK Query mutations in `accountingApi.ts` so the Journal Entries page auto-refreshes after Owner Equity, Settlement, and Expense actions.

**Architecture:** Single-file change in the RTK Query API slice. No backend changes. The pattern is already established by `createFundTransfer` and `cancelFundTransfer` which correctly include `'JournalEntry'` in their tags.

**Tech Stack:** React 19, RTK Query, TypeScript

---

## Chunk 1: Fix the 5 mutations

**Files:**
- Modify: `frontend/src/store/api/accountingApi.ts`

### Task 1: Fix `postOwnerEquityTransaction` and `reverseOwnerEquityTransaction`

- [ ] **Step 1: Open the file and locate the two Owner Equity post/reverse mutations**

  File: `frontend/src/store/api/accountingApi.ts`

  Find `postOwnerEquityTransaction` (~line 645) and `reverseOwnerEquityTransaction` (~line 650). Both currently have:

  ```typescript
  invalidatesTags: (_result, _error, id) => [{ type: 'OwnerEquity', id }, 'OwnerEquity', 'AccountingReport'],
  ```

- [ ] **Step 2: Add `'JournalEntry'` to both**

  For `postOwnerEquityTransaction`:
  ```typescript
  invalidatesTags: (_result, _error, id) => [{ type: 'OwnerEquity', id }, 'OwnerEquity', 'JournalEntry', 'AccountingReport'],
  ```

  For `reverseOwnerEquityTransaction`:
  ```typescript
  invalidatesTags: (_result, _error, id) => [{ type: 'OwnerEquity', id }, 'OwnerEquity', 'JournalEntry', 'AccountingReport'],
  ```

- [ ] **Step 3: Run the frontend type-check and tests**

  ```bash
  cd frontend && npm run type-check && npm run test
  ```

  Expected: no type errors, all tests pass

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/store/api/accountingApi.ts
  git commit -m "fix: invalidate JournalEntry cache on owner equity post and reverse (issue #105)"
  ```

---

### Task 2: Fix `createSettlement`

- [ ] **Step 1: Locate `createSettlement` (~line 603)**

  Current:
  ```typescript
  invalidatesTags: ['Settlement', 'AccountingReport'],
  ```

- [ ] **Step 2: Add `'JournalEntry'`**

  ```typescript
  invalidatesTags: ['Settlement', 'JournalEntry', 'AccountingReport'],
  ```

- [ ] **Step 3: Run the frontend type-check and tests**

  ```bash
  cd frontend && npm run type-check && npm run test
  ```

  Expected: no type errors, all tests pass

- [ ] **Step 4: Commit**

  ```bash
  git add frontend/src/store/api/accountingApi.ts
  git commit -m "fix: invalidate JournalEntry cache on settlement create (issue #105)"
  ```

---

### Task 3: Fix `postExpense` and `bulkPostExpenses`

- [ ] **Step 1: Locate `postExpense` (~line 692) and `bulkPostExpenses` (~line 697)**

  `postExpense` currently:
  ```typescript
  invalidatesTags: (_result, _error, id) => [{ type: 'Expense', id }, 'Expense', 'AccountingReport'],
  ```

  `bulkPostExpenses` currently:
  ```typescript
  invalidatesTags: ['Expense', 'AccountingReport'],
  ```

- [ ] **Step 2: Add `'JournalEntry'` to both**

  `postExpense`:
  ```typescript
  invalidatesTags: (_result, _error, id) => [{ type: 'Expense', id }, 'Expense', 'JournalEntry', 'AccountingReport'],
  ```

  `bulkPostExpenses`:
  ```typescript
  invalidatesTags: ['Expense', 'JournalEntry', 'AccountingReport'],
  ```

- [ ] **Step 3: Run the frontend type-check**

  ```bash
  cd frontend && npm run type-check
  ```

  Expected: no errors

- [ ] **Step 4: Run the full frontend test suite**

  ```bash
  cd frontend && npm run test
  ```

  Expected: all tests pass

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/store/api/accountingApi.ts
  git commit -m "fix: invalidate JournalEntry cache on expense post and bulk-post (issue #105)"
  ```

---

### Task 4: Manual verification

- [ ] **Step 1: Start the app**

  ```bash
  docker compose up -d
  ```

- [ ] **Step 2: Verify Owner Equity post**

  1. Navigate to Accounting > Owner Equity
  2. Post a draft transaction
  3. Navigate to Accounting > Journal Entries
  4. Confirm the new journal entry appears without a manual page refresh

- [ ] **Step 3: Verify Owner Equity reverse**

  1. Navigate to Accounting > Owner Equity
  2. Reverse a posted transaction
  3. Navigate to Accounting > Journal Entries
  4. Confirm the reversal journal entry appears without a manual page refresh

- [ ] **Step 4: Verify Settlement create**

  1. Navigate to Accounting > Settlements
  2. Create a new settlement
  3. Navigate to Accounting > Journal Entries
  4. Confirm the settlement journal entry appears without a manual page refresh

- [ ] **Step 5: Verify Expense post**

  1. Navigate to Accounting > Expenses
  2. Post a draft expense
  3. Navigate to Accounting > Journal Entries
  4. Confirm the expense journal entry appears without a manual page refresh

- [ ] **Step 6: Verify Expense bulk-post**

  1. Navigate to Accounting > Expenses
  2. Select multiple draft expenses and bulk-post them
  3. Navigate to Accounting > Journal Entries
  4. Confirm all expense journal entries appear without a manual page refresh

- [ ] **Step 7: Close the issue**

  ```bash
  gh issue close 105 --comment "Fixed by adding 'JournalEntry' to invalidatesTags for postOwnerEquityTransaction, reverseOwnerEquityTransaction, createSettlement, postExpense, and bulkPostExpenses in accountingApi.ts."
  ```
