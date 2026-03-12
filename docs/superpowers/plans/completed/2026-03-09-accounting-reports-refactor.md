# Accounting Reports Service Refactor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split `accounting-reports.service.ts` (2031 lines) into three focused files without changing any public API.

**Architecture:** Extract the repeated aggregate DB query into `AccountingReportsQueryHelper`, move all ExcelJS boilerplate into `AccountingExcelExportService`, and slim `AccountingReportsService` down to pure report-generation logic that delegates to both. Also extract the inline net income calculation from `generateBalanceSheet` into a private method.

**Tech Stack:** NestJS 11, TypeORM, ExcelJS, Jest

---

## Context You Need

- All commands run from `backend/` unless stated otherwise
- Run a single spec: `npx jest src/path/to/file.spec.ts --no-coverage`
- The existing 6 spec files test `AccountingReportsService` — they must pass unchanged throughout
- TypeScript strict mode is OFF — use `as any` when TypeORM types resist
- The mock pattern used in all existing specs: `createMockQueryBuilder()` + `createMockRepositories(qb)` from `src/modules/accounting/services/__fixtures__/accounting-reports.fixtures.ts`

---

## Task 1: Create `AccountingReportsQueryHelper`

**Files:**
- Create: `src/modules/accounting/services/accounting-reports.query-helper.ts`
- Create: `src/modules/accounting/services/accounting-reports.query-helper.spec.ts`

This service owns the 3 repositories and exposes the shared aggregate query + the two pure math helpers.

### Step 1: Write the failing test

Create `src/modules/accounting/services/accounting-reports.query-helper.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AccountingReportsQueryHelper } from './accounting-reports.query-helper';
import { ChartOfAccount, AccountType } from '../../../database/entities/chart-of-account.entity';
import { JournalEntry, JournalEntryStatus } from '../../../database/entities/journal-entry.entity';
import { JournalEntryLine } from '../../../database/entities/journal-entry-line.entity';
import { createMockQueryBuilder, createMockRepositories } from './__fixtures__/accounting-reports.fixtures';

describe('AccountingReportsQueryHelper', () => {
  let helper: AccountingReportsQueryHelper;
  let qb: ReturnType<typeof createMockQueryBuilder>;
  let lineRepo: any;

  beforeEach(async () => {
    qb = createMockQueryBuilder();
    const { accountRepo, journalRepo, lineRepo: lr } = createMockRepositories(qb);
    lineRepo = lr;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountingReportsQueryHelper,
        { provide: getRepositoryToken(ChartOfAccount), useValue: accountRepo },
        { provide: getRepositoryToken(JournalEntry), useValue: journalRepo },
        { provide: getRepositoryToken(JournalEntryLine), useValue: lineRepo },
      ],
    }).compile();

    helper = module.get<AccountingReportsQueryHelper>(AccountingReportsQueryHelper);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(helper).toBeDefined();
  });

  describe('queryTransactionTotals', () => {
    const statuses = [JournalEntryStatus.POSTED, JournalEntryStatus.REVERSED];

    it('returns empty map for empty accountIds', async () => {
      const result = await helper.queryTransactionTotals([], { type: 'asOf', date: new Date() }, statuses);
      expect(result.size).toBe(0);
    });

    it('asOf filter: returns totals keyed by accountId', async () => {
      qb.getRawMany.mockResolvedValue([
        { accountId: '1', totalDebit: '1000', totalCredit: '200' },
        { accountId: '2', totalDebit: '0', totalCredit: '500' },
      ]);
      const result = await helper.queryTransactionTotals(
        ['1', '2'],
        { type: 'asOf', date: new Date('2026-02-01') },
        statuses,
      );
      expect(result.get('1')).toEqual({ totalDebit: 1000, totalCredit: 200 });
      expect(result.get('2')).toEqual({ totalDebit: 0, totalCredit: 500 });
    });

    it('range filter: queries with startDate and endDate', async () => {
      qb.getRawMany.mockResolvedValue([]);
      await helper.queryTransactionTotals(
        ['1'],
        { type: 'range', startDate: new Date('2026-01-01'), endDate: new Date('2026-01-31') },
        statuses,
      );
      // andWhere called for both startDate and endDate bounds
      expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('>='), expect.any(Object));
      expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('<='), expect.any(Object));
    });

    it('before filter: queries with strict less-than date', async () => {
      qb.getRawMany.mockResolvedValue([]);
      await helper.queryTransactionTotals(
        ['1'],
        { type: 'before', date: new Date('2026-01-01') },
        statuses,
      );
      expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('<'), expect.any(Object));
    });

    it('handles null/undefined raw values as 0', async () => {
      qb.getRawMany.mockResolvedValue([
        { accountId: '1', totalDebit: null, totalCredit: undefined },
      ]);
      const result = await helper.queryTransactionTotals(
        ['1'],
        { type: 'asOf', date: new Date() },
        statuses,
      );
      expect(result.get('1')).toEqual({ totalDebit: 0, totalCredit: 0 });
    });
  });

  describe('calculateBalanceByAccountType', () => {
    it('ASSET: debit - credit', () => {
      expect(helper.calculateBalanceByAccountType(AccountType.ASSET, 1000, 200)).toBe(800);
    });
    it('EXPENSE: debit - credit', () => {
      expect(helper.calculateBalanceByAccountType(AccountType.EXPENSE, 500, 100)).toBe(400);
    });
    it('LIABILITY: credit - debit', () => {
      expect(helper.calculateBalanceByAccountType(AccountType.LIABILITY, 100, 600)).toBe(500);
    });
    it('EQUITY: credit - debit', () => {
      expect(helper.calculateBalanceByAccountType(AccountType.EQUITY, 0, 1000)).toBe(1000);
    });
    it('REVENUE: credit - debit', () => {
      expect(helper.calculateBalanceByAccountType(AccountType.REVENUE, 50, 1050)).toBe(1000);
    });
  });

  describe('roundTo2Decimals', () => {
    it('rounds to 2 decimal places', () => {
      expect(helper.roundTo2Decimals(1.005)).toBe(1.01);
      expect(helper.roundTo2Decimals(1.004)).toBe(1);
      expect(helper.roundTo2Decimals(100)).toBe(100);
    });
  });
});
```

### Step 2: Run test to verify it fails

```bash
npx jest src/modules/accounting/services/accounting-reports.query-helper.spec.ts --no-coverage
```

Expected: FAIL — `Cannot find module './accounting-reports.query-helper'`

### Step 3: Implement `AccountingReportsQueryHelper`

Create `src/modules/accounting/services/accounting-reports.query-helper.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ChartOfAccount,
  AccountType,
} from '../../../database/entities/chart-of-account.entity';
import {
  JournalEntry,
  JournalEntryStatus,
} from '../../../database/entities/journal-entry.entity';
import { JournalEntryLine } from '../../../database/entities/journal-entry-line.entity';

export type DateFilter =
  | { type: 'asOf'; date: Date }
  | { type: 'range'; startDate: Date; endDate: Date }
  | { type: 'before'; date: Date };

@Injectable()
export class AccountingReportsQueryHelper {
  private readonly logger = new Logger(AccountingReportsQueryHelper.name);

  constructor(
    @InjectRepository(ChartOfAccount)
    private readonly accountRepository: Repository<ChartOfAccount>,
    @InjectRepository(JournalEntry)
    private readonly journalEntryRepository: Repository<JournalEntry>,
    @InjectRepository(JournalEntryLine)
    private readonly journalEntryLineRepository: Repository<JournalEntryLine>,
  ) {}

  /**
   * Query aggregate debit/credit totals for a set of accounts.
   * Returns a Map keyed by accountId. Accounts with no transactions are not
   * included in the Map (callers should default to { totalDebit: 0, totalCredit: 0 }).
   */
  async queryTransactionTotals(
    accountIds: string[],
    dateFilter: DateFilter,
    statuses: JournalEntryStatus[],
  ): Promise<Map<string, { totalDebit: number; totalCredit: number }>> {
    if (!accountIds || accountIds.length === 0) {
      return new Map();
    }

    const qb = this.journalEntryLineRepository
      .createQueryBuilder('jel')
      .leftJoin('jel.journalEntry', 'je')
      .select('jel.accountId', 'accountId')
      .addSelect('SUM(jel.debitAmount)', 'totalDebit')
      .addSelect('SUM(jel.creditAmount)', 'totalCredit')
      .where('jel.accountId IN (:...accountIds)', { accountIds })
      .andWhere('je.status IN (:...statuses)', { statuses })
      .groupBy('jel.accountId');

    if (dateFilter.type === 'asOf') {
      qb.andWhere('je.entryDate <= :date', { date: dateFilter.date });
    } else if (dateFilter.type === 'range') {
      qb.andWhere('je.entryDate >= :startDate', { startDate: dateFilter.startDate });
      qb.andWhere('je.entryDate <= :endDate', { endDate: dateFilter.endDate });
    } else {
      qb.andWhere('je.entryDate < :date', { date: dateFilter.date });
    }

    const rows = await qb.getRawMany();

    const result = new Map<string, { totalDebit: number; totalCredit: number }>();
    for (const row of rows) {
      result.set(row.accountId, {
        totalDebit: parseFloat(row.totalDebit || '0'),
        totalCredit: parseFloat(row.totalCredit || '0'),
      });
    }
    return result;
  }

  calculateBalanceByAccountType(
    accountType: AccountType,
    totalDebit: number,
    totalCredit: number,
  ): number {
    switch (accountType) {
      case AccountType.ASSET:
      case AccountType.EXPENSE:
        return this.roundTo2Decimals(totalDebit - totalCredit);
      case AccountType.LIABILITY:
      case AccountType.EQUITY:
      case AccountType.REVENUE:
        return this.roundTo2Decimals(totalCredit - totalDebit);
      default:
        this.logger.warn(`Unknown account type: ${accountType}, defaulting to Debit - Credit`);
        return this.roundTo2Decimals(totalDebit - totalCredit);
    }
  }

  roundTo2Decimals(num: number): number {
    return Math.round(num * 100) / 100;
  }
}
```

### Step 4: Run tests to verify they pass

```bash
npx jest src/modules/accounting/services/accounting-reports.query-helper.spec.ts --no-coverage
```

Expected: All tests PASS.

### Step 5: Commit

```bash
git add src/modules/accounting/services/accounting-reports.query-helper.ts \
        src/modules/accounting/services/accounting-reports.query-helper.spec.ts
git commit -m "feat: add AccountingReportsQueryHelper with shared aggregate query logic"
```

---

## Task 2: Create `AccountingExcelExportService`

**Files:**
- Create: `src/modules/accounting/services/accounting-reports.excel-export.service.ts`
- Create: `src/modules/accounting/services/accounting-reports.excel-export.service.spec.ts`

Move all 5 `export*ToExcel` methods out of `AccountingReportsService`. The implementations are copied verbatim — no logic changes.

### Step 1: Write the failing test

Create `src/modules/accounting/services/accounting-reports.excel-export.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { AccountingExcelExportService } from './accounting-reports.excel-export.service';
import {
  TrialBalanceResponse,
  BalanceSheetResponse,
  ProfitAndLossResponse,
  GeneralLedgerResponse,
  AccountActivityResponse,
} from './accounting-reports.service';

describe('AccountingExcelExportService', () => {
  let service: AccountingExcelExportService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AccountingExcelExportService],
    }).compile();
    service = module.get<AccountingExcelExportService>(AccountingExcelExportService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('exportTrialBalanceToExcel returns a non-empty Buffer', async () => {
    const data: TrialBalanceResponse = {
      accounts: [{ accountCode: '1000', accountName: 'Cash', accountType: 'ASSET', debit: 1000, credit: 0 }],
      totalDebit: 1000,
      totalCredit: 1000,
      isBalanced: true,
    };
    const result = await service.exportTrialBalanceToExcel(data);
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });

  it('exportBalanceSheetToExcel returns a non-empty Buffer', async () => {
    const data: BalanceSheetResponse = {
      assets: { current: [], fixed: [], totalCurrent: 0, totalFixed: 0, total: 0 },
      liabilities: { current: [], longTerm: [], totalCurrent: 0, totalLongTerm: 0, total: 0 },
      equity: { accounts: [], netIncome: 0, total: 0 },
      isBalanced: true,
    };
    const result = await service.exportBalanceSheetToExcel(data);
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });

  it('exportProfitAndLossToExcel returns a non-empty Buffer', async () => {
    const data: ProfitAndLossResponse = {
      revenue: { accounts: [], total: 0 },
      costOfGoodsSold: { accounts: [], total: 0 },
      grossProfit: 0,
      expenses: { accounts: [], total: 0 },
      netIncome: 0,
    };
    const result = await service.exportProfitAndLossToExcel(data);
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });

  it('exportGeneralLedgerToExcel returns a non-empty Buffer', async () => {
    const data: GeneralLedgerResponse = {
      account: { id: '1', code: '1000', name: 'Cash', type: 'ASSET' },
      openingBalance: 0,
      transactions: [],
      closingBalance: 0,
    };
    const result = await service.exportGeneralLedgerToExcel(data);
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });

  it('exportAccountActivityToExcel returns a non-empty Buffer', async () => {
    const data: AccountActivityResponse = {
      account: { id: '1', code: '1000', name: 'Cash', type: 'ASSET' },
      openingBalance: 0,
      activity: [],
      closingBalance: 0,
    };
    const result = await service.exportAccountActivityToExcel(data);
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });
});
```

### Step 2: Run test to verify it fails

```bash
npx jest src/modules/accounting/services/accounting-reports.excel-export.service.spec.ts --no-coverage
```

Expected: FAIL — `Cannot find module './accounting-reports.excel-export.service'`

### Step 3: Implement `AccountingExcelExportService`

Create `src/modules/accounting/services/accounting-reports.excel-export.service.ts`.

Copy the 5 `export*ToExcel` method bodies verbatim from `accounting-reports.service.ts` lines 1261–1939, the `ExcelJS` import, and the 5 response type imports. Wrap in a new `@Injectable()` class `AccountingExcelExportService`. No logic changes.

The file structure:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import {
  TrialBalanceResponse,
  BalanceSheetResponse,
  ProfitAndLossResponse,
  GeneralLedgerResponse,
  AccountActivityResponse,
} from './accounting-reports.service';

@Injectable()
export class AccountingExcelExportService {
  private readonly logger = new Logger(AccountingExcelExportService.name);

  async exportTrialBalanceToExcel(data: TrialBalanceResponse, filename = 'trial-balance'): Promise<Buffer> {
    // ... copy from accounting-reports.service.ts lines 1261-1348
  }

  async exportBalanceSheetToExcel(data: BalanceSheetResponse, filename = 'balance-sheet'): Promise<Buffer> {
    // ... copy from accounting-reports.service.ts lines 1357-1560
  }

  async exportProfitAndLossToExcel(data: ProfitAndLossResponse, filename = 'profit-and-loss'): Promise<Buffer> {
    // ... copy from accounting-reports.service.ts lines 1569-1703
  }

  async exportGeneralLedgerToExcel(data: GeneralLedgerResponse, filename = 'general-ledger'): Promise<Buffer> {
    // ... copy from accounting-reports.service.ts lines 1712-1809
  }

  async exportAccountActivityToExcel(data: AccountActivityResponse, filename = 'account-activity'): Promise<Buffer> {
    // ... copy from accounting-reports.service.ts lines 1818-1939
  }
}
```

### Step 4: Run tests to verify they pass

```bash
npx jest src/modules/accounting/services/accounting-reports.excel-export.service.spec.ts --no-coverage
```

Expected: All 6 tests PASS.

### Step 5: Commit

```bash
git add src/modules/accounting/services/accounting-reports.excel-export.service.ts \
        src/modules/accounting/services/accounting-reports.excel-export.service.spec.ts
git commit -m "feat: add AccountingExcelExportService with all report Excel exports"
```

---

## Task 3: Register new services in the module

**Files:**
- Modify: `src/modules/accounting/accounting.module.ts`

### Step 1: Add providers and exports

In `accounting.module.ts`, add imports and register both new services:

```typescript
import { AccountingReportsQueryHelper } from './services/accounting-reports.query-helper';
import { AccountingExcelExportService } from './services/accounting-reports.excel-export.service';
```

Add both to the `providers` array and the `exports` array alongside `AccountingReportsService`.

### Step 2: Verify TypeScript compiles

```bash
cd .. && npx tsc --noEmit -p backend/tsconfig.json 2>&1 | head -30
```

Expected: No errors (or only pre-existing unrelated errors).

### Step 3: Commit

```bash
git add src/modules/accounting/accounting.module.ts
git commit -m "chore: register AccountingReportsQueryHelper and AccountingExcelExportService in module"
```

---

## Task 4: Slim down `AccountingReportsService` — wire in query helper

**Files:**
- Modify: `src/modules/accounting/services/accounting-reports.service.ts`

This is the main refactor. We update `AccountingReportsService` to inject and use `AccountingReportsQueryHelper` instead of duplicating query logic. Do this method by method. All existing tests must remain green throughout.

**Before starting:** Run all existing spec files to establish a green baseline:

```bash
npx jest src/modules/accounting/services/accounting-reports --no-coverage
```

Expected: All tests PASS.

### Step 1: Update constructor to inject helpers

Replace the current constructor (lines 169–176) with:

```typescript
constructor(
  @InjectRepository(ChartOfAccount)
  private readonly accountRepository: Repository<ChartOfAccount>,
  @InjectRepository(JournalEntry)
  private readonly journalEntryRepository: Repository<JournalEntry>,
  @InjectRepository(JournalEntryLine)
  private readonly journalEntryLineRepository: Repository<JournalEntryLine>,
  private readonly queryHelper: AccountingReportsQueryHelper,
  private readonly excelExportService: AccountingExcelExportService,
) {}
```

Add imports at top of file:
```typescript
import { AccountingReportsQueryHelper, DateFilter } from './accounting-reports.query-helper';
import { AccountingExcelExportService } from './accounting-reports.excel-export.service';
```

### Step 2: Update `calculateAccountBalance` to delegate math helpers

Replace `this.calculateBalanceByAccountType(...)` calls in this method with `this.queryHelper.calculateBalanceByAccountType(...)`. Replace `this.roundTo2Decimals(...)` with `this.queryHelper.roundTo2Decimals(...)`.

Do the same for `calculateAccountBalances` — replace the inline `journalEntryLineRepository` query with:

```typescript
const totalsMap = await this.queryHelper.queryTransactionTotals(
  accountIds,
  { type: 'asOf', date: asOfDate },
  [JournalEntryStatus.POSTED, JournalEntryStatus.REVERSED],
);
```

Then use `totalsMap.get(accountId) || { totalDebit: 0, totalCredit: 0 }` instead of iterating over the raw result.

### Step 3: Run tests

```bash
npx jest src/modules/accounting/services/accounting-reports --no-coverage
```

Expected: All tests PASS.

### Step 4: Update `generateTrialBalance`

Replace the inline `journalEntryLineRepository` aggregate query (lines 437–456) with:

```typescript
const totalsMap = await this.queryHelper.queryTransactionTotals(
  accountIds,
  { type: 'asOf', date: asOfDate },
  [JournalEntryStatus.POSTED, JournalEntryStatus.REVERSED],
);
```

Replace all `transactionMap.get(...)` usages with `totalsMap.get(...)`. Replace `parseFloat(...)` parsing with direct map values. Replace `this.roundTo2Decimals` and `this.calculateBalanceByAccountType` calls with `this.queryHelper.*`.

### Step 5: Run tests

```bash
npx jest src/modules/accounting/services/accounting-reports.trial-balance.spec.ts --no-coverage
```

Expected: All tests PASS.

### Step 6: Update `generateProfitAndLoss`

Replace the inline aggregate query (lines 1152–1172) with:

```typescript
const totalsMap = await this.queryHelper.queryTransactionTotals(
  accountIds,
  { type: 'range', startDate, endDate },
  [JournalEntryStatus.POSTED, JournalEntryStatus.REVERSED],
);
```

Update usages accordingly.

### Step 7: Run tests

```bash
npx jest src/modules/accounting/services/accounting-reports.profit-and-loss.spec.ts --no-coverage
```

Expected: All tests PASS.

### Step 8: Extract `calculateNetIncome` private method from `generateBalanceSheet`

The block from approximately line 675 to 730 (second account fetch + query for net income) becomes:

```typescript
private async calculateNetIncome(asOfDate: Date, includeInactive: boolean): Promise<number> {
  const incomeQueryBuilder = this.accountRepository.createQueryBuilder('account');
  incomeQueryBuilder.where('account.type IN (:...types)', {
    types: [AccountType.REVENUE, AccountType.EXPENSE],
  });
  if (!includeInactive) {
    incomeQueryBuilder.andWhere('account.isActive = :isActive', { isActive: true });
  }
  const incomeAccounts = await incomeQueryBuilder.orderBy('account.code', 'ASC').getMany();

  if (incomeAccounts.length === 0) return 0;

  const incomeAccountIds = incomeAccounts.map(a => a.id);
  const totalsMap = await this.queryHelper.queryTransactionTotals(
    incomeAccountIds,
    { type: 'asOf', date: asOfDate },
    [JournalEntryStatus.POSTED, JournalEntryStatus.REVERSED],
  );

  let totalRevenue = 0;
  let totalExpenses = 0;
  for (const account of incomeAccounts) {
    const { totalDebit, totalCredit } = totalsMap.get(account.id) || { totalDebit: 0, totalCredit: 0 };
    const balance = this.queryHelper.calculateBalanceByAccountType(account.type, totalDebit, totalCredit);
    if (account.type === AccountType.REVENUE) {
      totalRevenue += balance;
    } else {
      totalExpenses += balance;
    }
  }
  return this.queryHelper.roundTo2Decimals(totalRevenue - totalExpenses);
}
```

In `generateBalanceSheet`, replace the inline net income block with:

```typescript
const netIncome = await this.calculateNetIncome(asOfDate, includeInactive);
```

Also replace the main balance sheet aggregate query with `queryTransactionTotals` using `{ type: 'asOf', date: asOfDate }`.

### Step 9: Run tests

```bash
npx jest src/modules/accounting/services/accounting-reports.balance-sheet.spec.ts --no-coverage
```

Expected: All tests PASS.

### Step 10: Update `generateGeneralLedger` opening balance query

The opening balance aggregate query (lines 828–849) uses a `before` date filter. Replace with:

```typescript
const openingTotalsMap = await this.queryHelper.queryTransactionTotals(
  [accountId],
  { type: 'before', date: startDate },
  [JournalEntryStatus.POSTED, JournalEntryStatus.REVERSED],
);
const { totalDebit: openingDebit, totalCredit: openingCredit } =
  openingTotalsMap.get(accountId) || { totalDebit: 0, totalCredit: 0 };
const openingBalance = this.queryHelper.calculateBalanceByAccountType(account.type, openingDebit, openingCredit);
```

The individual transaction row query (lines 854–868) stays as-is — it selects individual rows, not aggregates.

Replace remaining `this.roundTo2Decimals` calls with `this.queryHelper.roundTo2Decimals`.

### Step 11: Run tests

```bash
npx jest src/modules/accounting/services/accounting-reports.general-ledger.spec.ts --no-coverage
```

Expected: All tests PASS.

### Step 12: Update `generateAccountActivity` opening balance query

Same pattern as Step 10. Replace the opening balance aggregate query (lines 977–998) with `queryTransactionTotals` using `{ type: 'before', date: startDate }`. The individual transaction row query stays inline.

Replace remaining `this.roundTo2Decimals` calls with `this.queryHelper.roundTo2Decimals`.

### Step 13: Run tests

```bash
npx jest src/modules/accounting/services/accounting-reports.account-activity.spec.ts --no-coverage
```

Expected: All tests PASS.

### Step 14: Delete the now-unused private methods from `AccountingReportsService`

Remove:
- `private calculateBalanceByAccountType(...)` (lines ~2009–2029)
- `private roundTo2Decimals(...)` (lines ~1994–1996)

These are now on `AccountingReportsQueryHelper`.

### Step 15: Run all accounting reports specs

```bash
npx jest src/modules/accounting/services/accounting-reports --no-coverage
```

Expected: All tests PASS.

### Step 16: Commit

```bash
git add src/modules/accounting/services/accounting-reports.service.ts
git commit -m "refactor: delegate aggregate queries and math helpers to AccountingReportsQueryHelper"
```

---

## Task 5: Wire in `AccountingExcelExportService` and remove Excel methods from `AccountingReportsService`

**Files:**
- Modify: `src/modules/accounting/services/accounting-reports.service.ts`

### Step 1: Delegate all `export*ToExcel` calls

In `AccountingReportsService`, replace each `export*ToExcel` method body with a one-line delegation:

```typescript
async exportTrialBalanceToExcel(data: TrialBalanceResponse, filename = 'trial-balance'): Promise<Buffer> {
  return this.excelExportService.exportTrialBalanceToExcel(data, filename);
}
```

Do this for all 5 methods. This keeps the public API identical for the controller.

### Step 2: Run all specs

```bash
npx jest src/modules/accounting/services/accounting-reports --no-coverage
```

Expected: All tests PASS.

### Step 3: Remove ExcelJS import from `AccountingReportsService`

Remove `import * as ExcelJS from 'exceljs';` from the top of `accounting-reports.service.ts` — it is now only used in `AccountingExcelExportService`.

### Step 4: Run TypeScript check

```bash
cd .. && npx tsc --noEmit -p backend/tsconfig.json 2>&1 | head -30
```

Expected: No new errors.

### Step 5: Commit

```bash
git add src/modules/accounting/services/accounting-reports.service.ts
git commit -m "refactor: delegate Excel exports to AccountingExcelExportService"
```

---

## Task 6: Update existing spec files to mock the new injected services

**Files:**
- Modify all 6 existing spec files in `src/modules/accounting/services/`

The existing specs will now fail because `AccountingReportsService` requires two new injectable dependencies (`AccountingReportsQueryHelper`, `AccountingExcelExportService`) in its constructor. Each spec's `Test.createTestingModule` providers list must include mocks for both.

### Step 1: Run the existing specs to see the failure

```bash
npx jest src/modules/accounting/services/accounting-reports --no-coverage
```

Expected: FAIL — NestJS DI error about missing `AccountingReportsQueryHelper` and `AccountingExcelExportService`.

### Step 2: Add mock helpers to the shared fixture

Update `__fixtures__/accounting-reports.fixtures.ts` to export a `createMockQueryHelper()` and `createMockExcelExportService()` factory:

```typescript
export function createMockQueryHelper() {
  return {
    queryTransactionTotals: jest.fn().mockResolvedValue(new Map()),
    calculateBalanceByAccountType: jest.fn().mockReturnValue(0),
    roundTo2Decimals: jest.fn((n: number) => Math.round(n * 100) / 100),
  };
}

export function createMockExcelExportService() {
  return {
    exportTrialBalanceToExcel: jest.fn().mockResolvedValue(Buffer.from([])),
    exportBalanceSheetToExcel: jest.fn().mockResolvedValue(Buffer.from([])),
    exportProfitAndLossToExcel: jest.fn().mockResolvedValue(Buffer.from([])),
    exportGeneralLedgerToExcel: jest.fn().mockResolvedValue(Buffer.from([])),
    exportAccountActivityToExcel: jest.fn().mockResolvedValue(Buffer.from([])),
  };
}
```

### Step 3: Update each spec file

In each of the 6 spec files, add to the `providers` array in `Test.createTestingModule`:

```typescript
import {
  createMockQueryBuilder,
  createMockRepositories,
  createMockQueryHelper,
  createMockExcelExportService,
} from './__fixtures__/accounting-reports.fixtures';
import { AccountingReportsQueryHelper } from './accounting-reports.query-helper';
import { AccountingExcelExportService } from './accounting-reports.excel-export.service';

// In providers:
{ provide: AccountingReportsQueryHelper, useValue: createMockQueryHelper() },
{ provide: AccountingExcelExportService, useValue: createMockExcelExportService() },
```

**Important:** The mock `calculateBalanceByAccountType` and `roundTo2Decimals` must return real values for the report tests to produce correct output. Update `createMockQueryHelper` to use real implementations:

```typescript
export function createMockQueryHelper() {
  const roundTo2Decimals = (n: number) => Math.round(n * 100) / 100;
  return {
    queryTransactionTotals: jest.fn().mockResolvedValue(new Map()),
    calculateBalanceByAccountType: jest.fn((type: AccountType, debit: number, credit: number) => {
      if (type === AccountType.ASSET || type === AccountType.EXPENSE) {
        return roundTo2Decimals(debit - credit);
      }
      return roundTo2Decimals(credit - debit);
    }),
    roundTo2Decimals: jest.fn(roundTo2Decimals),
  };
}
```

Also update the individual spec's mock setup for `queryTransactionTotals` where the test was previously calling `qb.getRawMany.mockResolvedValue(...)` for aggregate queries. Those tests now need to mock `queryHelper.queryTransactionTotals` instead. For example, in `accounting-reports.trial-balance.spec.ts`:

```typescript
// Before:
qb.getRawMany.mockResolvedValue([
  { accountId: '1', totalDebit: '5000', totalCredit: '1000' },
  ...
]);

// After:
queryHelper.queryTransactionTotals.mockResolvedValue(new Map([
  ['1', { totalDebit: 5000, totalCredit: 1000 }],
  ...
]));
```

Do this update for each spec file, matching its existing test data. The General Ledger and Account Activity specs also use `qb.getRawMany` for the individual row queries — those still use `qb.getRawMany` for the transaction row query, but the opening balance query now uses `queryHelper.queryTransactionTotals`.

### Step 4: Run all specs

```bash
npx jest src/modules/accounting/services/accounting-reports --no-coverage
```

Expected: All tests PASS.

### Step 5: Run the full backend test suite

```bash
npm run test -- --no-coverage 2>&1 | tail -20
```

Expected: All tests PASS (or only pre-existing failures unrelated to this refactor).

### Step 6: Commit

```bash
git add src/modules/accounting/services/__fixtures__/accounting-reports.fixtures.ts \
        src/modules/accounting/services/accounting-reports.trial-balance.spec.ts \
        src/modules/accounting/services/accounting-reports.balance-sheet.spec.ts \
        src/modules/accounting/services/accounting-reports.profit-and-loss.spec.ts \
        src/modules/accounting/services/accounting-reports.general-ledger.spec.ts \
        src/modules/accounting/services/accounting-reports.account-activity.spec.ts \
        src/modules/accounting/services/accounting-reports.balances.spec.ts
git commit -m "test: update accounting reports specs to mock new injected services"
```

---

## Task 7: Final verification

### Step 1: Check final line counts

```bash
wc -l src/modules/accounting/services/accounting-reports.service.ts \
       src/modules/accounting/services/accounting-reports.query-helper.ts \
       src/modules/accounting/services/accounting-reports.excel-export.service.ts
```

Expected roughly: service ~600, query-helper ~80, excel-export ~750.

### Step 2: Run full backend test suite

```bash
npm run test -- --no-coverage 2>&1 | tail -20
```

Expected: All tests PASS.

### Step 3: TypeScript check

```bash
cd .. && npx tsc --noEmit -p backend/tsconfig.json 2>&1 | head -30
```

Expected: No new errors.

### Step 4: Final commit (if any loose files)

```bash
git status
```

If clean, you're done. If any files were missed, stage and commit them.
