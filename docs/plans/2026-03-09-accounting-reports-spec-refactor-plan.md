# Accounting Reports Spec Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor `accounting-reports.service.spec.ts` (2255 lines) into 6 focused spec files + a shared fixtures file, fixing mock reliability, reducing duplication, and splitting by domain.

**Architecture:** Create a `__fixtures__` file with named account constants and a `createMockQueryBuilder()` factory that returns a fresh isolated mock per test. Split tests into 6 spec files — one per report method group — each importing from the fixtures file. Delete the original monolith last.

**Tech Stack:** NestJS 11, Jest, TypeORM mocks, ExcelJS (for export tests)

---

## Task 1: Create the shared fixtures file

**Files:**
- Create: `backend/src/modules/accounting/services/__fixtures__/accounting-reports.fixtures.ts`

**Step 1: Create the fixtures file with all constants and factories**

```typescript
import { AccountType } from '../../../../database/entities/chart-of-account.entity';
import { JournalEntryStatus } from '../../../../database/entities/journal-entry.entity';

// ── UUID constants ────────────────────────────────────────────────────────────
export const ACCOUNT_IDS = {
  cash:    '123e4567-e89b-12d3-a456-426614174000',
  ap:      '223e4567-e89b-12d3-a456-426614174001',
  equity:  '323e4567-e89b-12d3-a456-426614174002',
  revenue: '423e4567-e89b-12d3-a456-426614174003',
  cogs:    '523e4567-e89b-12d3-a456-426614174004',
  opex:    '623e4567-e89b-12d3-a456-426614174005',
};

export const FISCAL_PERIOD_ID = '323e4567-e89b-12d3-a456-426614174000';

// ── Named account fixtures ────────────────────────────────────────────────────
export const CASH_ACCOUNT = {
  id: ACCOUNT_IDS.cash,
  code: '1000',
  name: 'Cash',
  type: AccountType.ASSET,
  isActive: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

export const AP_ACCOUNT = {
  id: ACCOUNT_IDS.ap,
  code: '2000',
  name: 'Accounts Payable',
  type: AccountType.LIABILITY,
  isActive: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

export const EQUITY_ACCOUNT = {
  id: ACCOUNT_IDS.equity,
  code: '3000',
  name: 'Common Stock',
  type: AccountType.EQUITY,
  isActive: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

export const REVENUE_ACCOUNT = {
  id: ACCOUNT_IDS.revenue,
  code: '4000',
  name: 'Sales Revenue',
  type: AccountType.REVENUE,
  isActive: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

export const COGS_ACCOUNT = {
  id: ACCOUNT_IDS.cogs,
  code: '5000',
  name: 'Cost of Goods Sold',
  type: AccountType.EXPENSE,
  isActive: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

export const OPEX_ACCOUNT = {
  id: ACCOUNT_IDS.opex,
  code: '6000',
  name: 'Rent Expense',
  type: AccountType.EXPENSE,
  isActive: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

// ── Query builder factory ─────────────────────────────────────────────────────
// Returns a FRESH isolated mock on each call — never share between tests.
export function createMockQueryBuilder() {
  return {
    createQueryBuilder: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(),
    getMany: jest.fn(),
    getOne: jest.fn(),
  };
}

// ── Repository factory ────────────────────────────────────────────────────────
export function createMockRepositories(qb: ReturnType<typeof createMockQueryBuilder>) {
  const makeRepo = () => ({
    findOne: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(() => qb),
  });

  return {
    accountRepo: makeRepo(),
    journalRepo: makeRepo(),
    lineRepo: makeRepo(),
  };
}
```

**Step 2: Verify the file compiles (no test run needed yet)**

```bash
cd backend && npx tsc --noEmit --project tsconfig.json 2>&1 | grep __fixtures__
```

Expected: no errors mentioning `__fixtures__`.

**Step 3: Commit**

```bash
cd backend
git add src/modules/accounting/services/__fixtures__/accounting-reports.fixtures.ts
git commit -m "test: add shared fixtures and mock factory for accounting reports specs"
```

---

## Task 2: Create `accounting-reports.balances.spec.ts`

**Files:**
- Create: `backend/src/modules/accounting/services/accounting-reports.balances.spec.ts`
- Reference: original spec lines 98–335 (`calculateAccountBalance`, `calculateAccountBalances`, `getAccountsByType`, `getAccountsWithBalances`)

**Step 1: Create the file**

Migrate all tests from `describe('calculateAccountBalance')`, `describe('calculateAccountBalances')`, `describe('getAccountsByType')`, and `describe('getAccountsWithBalances')` blocks. Use `CASH_ACCOUNT`, `AP_ACCOUNT`, `REVENUE_ACCOUNT` from fixtures. Use `createMockQueryBuilder()` in `beforeEach`.

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AccountingReportsService } from './accounting-reports.service';
import { ChartOfAccount, AccountType } from '../../../database/entities/chart-of-account.entity';
import { JournalEntry, JournalEntryStatus } from '../../../database/entities/journal-entry.entity';
import { JournalEntryLine } from '../../../database/entities/journal-entry-line.entity';
import {
  ACCOUNT_IDS,
  CASH_ACCOUNT,
  AP_ACCOUNT,
  REVENUE_ACCOUNT,
  createMockQueryBuilder,
  createMockRepositories,
} from './__fixtures__/accounting-reports.fixtures';

describe('AccountingReportsService - Account Balances', () => {
  let service: AccountingReportsService;
  let accountRepository: any;
  let qb: ReturnType<typeof createMockQueryBuilder>;

  beforeEach(async () => {
    qb = createMockQueryBuilder();
    const { accountRepo, journalRepo, lineRepo } = createMockRepositories(qb);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountingReportsService,
        { provide: getRepositoryToken(ChartOfAccount), useValue: accountRepo },
        { provide: getRepositoryToken(JournalEntry), useValue: journalRepo },
        { provide: getRepositoryToken(JournalEntryLine), useValue: lineRepo },
      ],
    }).compile();

    service = module.get<AccountingReportsService>(AccountingReportsService);
    accountRepository = module.get(getRepositoryToken(ChartOfAccount));
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // --- Paste and adapt all tests from the original describe blocks here ---
  // calculateAccountBalance (lines 98-217)
  // calculateAccountBalances (lines 219-276)
  // getAccountsByType (lines 278-335)
  // getAccountsWithBalances (lines 337-398)
});
```

**Step 2: Run this file in isolation**

```bash
cd backend && npx jest src/modules/accounting/services/accounting-reports.balances.spec.ts --no-coverage
```

Expected: all tests pass (same count as the 4 describe blocks in the original).

**Step 3: Commit**

```bash
git add src/modules/accounting/services/accounting-reports.balances.spec.ts
git commit -m "test: extract account balance specs into dedicated file"
```

---

## Task 3: Create `accounting-reports.trial-balance.spec.ts`

**Files:**
- Create: `backend/src/modules/accounting/services/accounting-reports.trial-balance.spec.ts`
- Reference: original spec lines 400–626 (`generateTrialBalance`) and lines 1906–1966 (`exportTrialBalanceToExcel`)

**Step 1: Create the file**

Same `beforeEach` skeleton as Task 2. Migrate all tests from `describe('generateTrialBalance')` and `describe('exportTrialBalanceToExcel')`. No counter hacks in this section — straightforward `mockResolvedValue` calls.

**Step 2: Run in isolation**

```bash
cd backend && npx jest src/modules/accounting/services/accounting-reports.trial-balance.spec.ts --no-coverage
```

Expected: all tests pass.

**Step 3: Commit**

```bash
git add src/modules/accounting/services/accounting-reports.trial-balance.spec.ts
git commit -m "test: extract trial balance specs into dedicated file"
```

---

## Task 4: Create `accounting-reports.balance-sheet.spec.ts`

**Files:**
- Create: `backend/src/modules/accounting/services/accounting-reports.balance-sheet.spec.ts`
- Reference: original spec lines 628–1016 (`generateBalanceSheet`) and lines 1968–2042 (`exportBalanceSheetToExcel`)

**Step 1: Create the file**

This section contains the fragile counter pattern. Replace all occurrences with chained `mockResolvedValueOnce`. Example:

```typescript
// BEFORE (fragile — DO NOT use):
let getManyCalls = 0;
mockQueryBuilder.getMany.mockImplementation(() => {
  getManyCalls++;
  if (getManyCalls === 1) return Promise.resolve(balanceSheetAccounts);
  return Promise.resolve(incomeStatementAccounts);
});

// AFTER (correct):
qb.getMany
  .mockResolvedValueOnce(balanceSheetAccounts)
  .mockResolvedValueOnce(incomeStatementAccounts);
```

Similarly replace `getRawManyCalls` counter with chained `mockResolvedValueOnce`.

**Step 2: Run in isolation**

```bash
cd backend && npx jest src/modules/accounting/services/accounting-reports.balance-sheet.spec.ts --no-coverage
```

Expected: all tests pass.

**Step 3: Commit**

```bash
git add src/modules/accounting/services/accounting-reports.balance-sheet.spec.ts
git commit -m "test: extract balance sheet specs and fix fragile call-counter mocks"
```

---

## Task 5: Create `accounting-reports.general-ledger.spec.ts`

**Files:**
- Create: `backend/src/modules/accounting/services/accounting-reports.general-ledger.spec.ts`
- Reference: original spec lines 1018–1433 (`generateGeneralLedger`) and lines 2110–2167 (`exportGeneralLedgerToExcel`)

**Step 1: Create the file**

Same `beforeEach` skeleton. Migrate all tests from `describe('generateGeneralLedger')` and `describe('exportGeneralLedgerToExcel')`. This section uses `mockResolvedValueOnce` already (opening balance query then transactions query) — keep that pattern.

**Step 2: Run in isolation**

```bash
cd backend && npx jest src/modules/accounting/services/accounting-reports.general-ledger.spec.ts --no-coverage
```

Expected: all tests pass.

**Step 3: Commit**

```bash
git add src/modules/accounting/services/accounting-reports.general-ledger.spec.ts
git commit -m "test: extract general ledger specs into dedicated file"
```

---

## Task 6: Create `accounting-reports.profit-and-loss.spec.ts`

**Files:**
- Create: `backend/src/modules/accounting/services/accounting-reports.profit-and-loss.spec.ts`
- Reference: original spec lines 1435–1693 (`generateProfitAndLoss`) and lines 2044–2108 (`exportProfitAndLossToExcel`)

**Step 1: Create the file**

Same `beforeEach` skeleton. Migrate all tests. No counter hacks in this section.

**Step 2: Run in isolation**

```bash
cd backend && npx jest src/modules/accounting/services/accounting-reports.profit-and-loss.spec.ts --no-coverage
```

Expected: all tests pass.

**Step 3: Commit**

```bash
git add src/modules/accounting/services/accounting-reports.profit-and-loss.spec.ts
git commit -m "test: extract profit and loss specs into dedicated file"
```

---

## Task 7: Create `accounting-reports.account-activity.spec.ts`

**Files:**
- Create: `backend/src/modules/accounting/services/accounting-reports.account-activity.spec.ts`
- Reference: original spec lines 1695–1903 (`generateAccountActivity`) and lines 2169–2253 (`exportAccountActivityToExcel`)

**Step 1: Create the file**

Same `beforeEach` skeleton. Migrate all tests from `describe('generateAccountActivity')` and `describe('exportAccountActivityToExcel')`.

**Step 2: Run in isolation**

```bash
cd backend && npx jest src/modules/accounting/services/accounting-reports.account-activity.spec.ts --no-coverage
```

Expected: all tests pass.

**Step 3: Commit**

```bash
git add src/modules/accounting/services/accounting-reports.account-activity.spec.ts
git commit -m "test: extract account activity specs into dedicated file"
```

---

## Task 8: Delete the original file and verify full suite

**Files:**
- Delete: `backend/src/modules/accounting/services/accounting-reports.service.spec.ts`

**Step 1: Run the full accounting module test suite before deletion**

```bash
cd backend && npx jest src/modules/accounting --no-coverage
```

Expected: all tests pass. Note the total test count.

**Step 2: Delete the original file**

```bash
rm backend/src/modules/accounting/services/accounting-reports.service.spec.ts
```

**Step 3: Run the full accounting module test suite again**

```bash
cd backend && npx jest src/modules/accounting --no-coverage
```

Expected: same test count as Step 1, all passing. If count differs, a test was missed — check which describe block wasn't migrated.

**Step 4: Run the full backend test suite**

```bash
cd backend && npm run test
```

Expected: no regressions outside the accounting module.

**Step 5: Commit**

```bash
git add -A
git commit -m "test: delete original accounting reports spec monolith after successful split"
```

---

## Verification Checklist

- [ ] `__fixtures__/accounting-reports.fixtures.ts` exists and compiles
- [ ] 6 new spec files exist, each running green in isolation
- [ ] No `let getManyCalls` or `let getRawManyCalls` counter patterns remain
- [ ] No shared `mockQueryBuilder` object — each test uses `qb` from `beforeEach`
- [ ] Original file deleted
- [ ] Full suite test count matches before/after deletion
- [ ] `npm run test` passes with no regressions
