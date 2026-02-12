# Balance Sheet Virtual Net Income Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the unbalanced Balance Sheet by calculating and including current period net income in the equity section.

**Architecture:** The `generateBalanceSheet()` method currently only includes ASSET, LIABILITY, and EQUITY accounts. Revenue and Expense accounts are excluded, so their net effect (net income) is missing from equity. The fix adds a second query for REVENUE and EXPENSE accounts within `generateBalanceSheet()`, calculates net income, and includes it as a virtual line item in the equity section. The response interface gains a `netIncome` field. Frontend and Excel export are updated to display it.

**Tech Stack:** NestJS (backend service), TypeORM (queries), React + Redux Toolkit (frontend), ExcelJS (Excel export), Jest (backend tests), Vitest (frontend tests)

---

### Task 1: Add net income to BalanceSheetResponse interface

**Files:**
- Modify: `backend/src/modules/accounting/services/accounting-reports.service.ts:61-81`

**Step 1: Update the BalanceSheetResponse interface**

Add `netIncome` to the equity section and at the top level. Find the `BalanceSheetResponse` interface (line 61) and replace it:

```typescript
export interface BalanceSheetResponse {
  assets: {
    current: AccountBalance[];
    fixed: AccountBalance[];
    totalCurrent: number;
    totalFixed: number;
    total: number;
  };
  liabilities: {
    current: AccountBalance[];
    longTerm: AccountBalance[];
    totalCurrent: number;
    totalLongTerm: number;
    total: number;
  };
  equity: {
    accounts: AccountBalance[];
    netIncome: number;
    total: number;
  };
  isBalanced: boolean;
}
```

Changes:
- Added `netIncome: number` inside the `equity` section
- `equity.total` now includes net income (equity accounts + net income)

**Step 2: Verify the project compiles**

Run: `cd backend && npx tsc --noEmit 2>&1 | head -20`
Expected: Compilation errors related to missing `netIncome` in return values (this is expected, we fix it in Task 2)

**Step 3: Commit**

```bash
git add backend/src/modules/accounting/services/accounting-reports.service.ts
git commit -m "feat(accounting): add netIncome field to BalanceSheetResponse interface"
```

---

### Task 2: Calculate net income inside generateBalanceSheet()

**Files:**
- Modify: `backend/src/modules/accounting/services/accounting-reports.service.ts:533-711`

**Step 1: Write the failing test for net income calculation**

**File:** `backend/src/modules/accounting/services/accounting-reports.service.spec.ts`

Add this test after the existing balance sheet tests (after line 853):

```typescript
    it('should include net income in equity section for balanced sheet', async () => {
      const asOfDate = new Date('2026-02-01');

      // First call: balance sheet accounts (ASSET, LIABILITY, EQUITY)
      const balanceSheetAccounts = [
        { id: '1', code: '1000', name: 'Cash', type: AccountType.ASSET, isActive: true },
        { id: '2', code: '1200', name: 'Accounts Receivable', type: AccountType.ASSET, isActive: true },
        { id: '3', code: '2000', name: 'Accounts Payable', type: AccountType.LIABILITY, isActive: true },
        { id: '4', code: '3000', name: 'Owner\'s Equity', type: AccountType.EQUITY, isActive: true },
        { id: '5', code: '3100', name: 'Retained Earnings', type: AccountType.EQUITY, isActive: true },
      ];

      // Second call: income statement accounts (REVENUE, EXPENSE)
      const incomeStatementAccounts = [
        { id: '6', code: '4000', name: 'Sales Revenue', type: AccountType.REVENUE, isActive: true },
        { id: '7', code: '5000', name: 'Cost of Goods Sold', type: AccountType.EXPENSE, isActive: true },
        { id: '8', code: '6000', name: 'Rent Expense', type: AccountType.EXPENSE, isActive: true },
      ];

      // Mock: first getMany returns BS accounts, second returns IS accounts
      let getManyCalls = 0;
      mockQueryBuilder.getMany.mockImplementation(() => {
        getManyCalls++;
        if (getManyCalls === 1) return Promise.resolve(balanceSheetAccounts);
        return Promise.resolve(incomeStatementAccounts);
      });

      // Mock: first getRawMany returns BS transactions, second returns IS transactions
      let getRawManyCalls = 0;
      mockQueryBuilder.getRawMany.mockImplementation(() => {
        getRawManyCalls++;
        if (getRawManyCalls === 1) {
          // BS transactions: Assets 10000, Liabilities 3000, Equity 2000
          return Promise.resolve([
            { accountId: '1', totalDebit: '6000', totalCredit: '0' },
            { accountId: '2', totalDebit: '4000', totalCredit: '0' },
            { accountId: '3', totalDebit: '0', totalCredit: '3000' },
            { accountId: '4', totalDebit: '0', totalCredit: '1000' },
            { accountId: '5', totalDebit: '0', totalCredit: '1000' },
          ]);
        }
        // IS transactions: Revenue 8000, Expenses 3000
        // Net Income = 8000 - 3000 = 5000
        return Promise.resolve([
          { accountId: '6', totalDebit: '0', totalCredit: '8000' },
          { accountId: '7', totalDebit: '2000', totalCredit: '0' },
          { accountId: '8', totalDebit: '1000', totalCredit: '0' },
        ]);
      });

      const result = await service.generateBalanceSheet(asOfDate);

      // Net income should be 5000 (Revenue 8000 - COGS 2000 - Expenses 1000)
      expect(result.equity.netIncome).toBe(5000);

      // Equity total should include net income: 2000 (equity accounts) + 5000 (net income) = 7000
      expect(result.equity.total).toBe(7000);

      // Balance check: Assets 10000 = Liabilities 3000 + Equity 7000
      expect(result.assets.total).toBe(10000);
      expect(result.liabilities.total).toBe(3000);
      expect(result.isBalanced).toBe(true);
    });

    it('should handle negative net income (net loss)', async () => {
      const asOfDate = new Date('2026-02-01');

      const balanceSheetAccounts = [
        { id: '1', code: '1000', name: 'Cash', type: AccountType.ASSET, isActive: true },
        { id: '2', code: '3100', name: 'Retained Earnings', type: AccountType.EQUITY, isActive: true },
      ];

      const incomeStatementAccounts = [
        { id: '3', code: '4000', name: 'Sales Revenue', type: AccountType.REVENUE, isActive: true },
        { id: '4', code: '6000', name: 'Rent Expense', type: AccountType.EXPENSE, isActive: true },
      ];

      let getManyCalls = 0;
      mockQueryBuilder.getMany.mockImplementation(() => {
        getManyCalls++;
        if (getManyCalls === 1) return Promise.resolve(balanceSheetAccounts);
        return Promise.resolve(incomeStatementAccounts);
      });

      let getRawManyCalls = 0;
      mockQueryBuilder.getRawMany.mockImplementation(() => {
        getRawManyCalls++;
        if (getRawManyCalls === 1) {
          // Assets 5000, Equity 8000
          return Promise.resolve([
            { accountId: '1', totalDebit: '5000', totalCredit: '0' },
            { accountId: '2', totalDebit: '0', totalCredit: '8000' },
          ]);
        }
        // Revenue 1000, Expenses 4000 => Net loss = -3000
        return Promise.resolve([
          { accountId: '3', totalDebit: '0', totalCredit: '1000' },
          { accountId: '4', totalDebit: '4000', totalCredit: '0' },
        ]);
      });

      const result = await service.generateBalanceSheet(asOfDate);

      // Net income should be -3000 (net loss)
      expect(result.equity.netIncome).toBe(-3000);

      // Equity total: 8000 + (-3000) = 5000
      expect(result.equity.total).toBe(5000);

      // Balance check: Assets 5000 = Liabilities 0 + Equity 5000
      expect(result.isBalanced).toBe(true);
    });

    it('should handle zero net income when no revenue or expenses exist', async () => {
      const asOfDate = new Date('2026-02-01');

      const balanceSheetAccounts = [
        { id: '1', code: '1000', name: 'Cash', type: AccountType.ASSET, isActive: true },
        { id: '2', code: '3000', name: 'Owner\'s Equity', type: AccountType.EQUITY, isActive: true },
      ];

      let getManyCalls = 0;
      mockQueryBuilder.getMany.mockImplementation(() => {
        getManyCalls++;
        if (getManyCalls === 1) return Promise.resolve(balanceSheetAccounts);
        return Promise.resolve([]); // No income statement accounts
      });

      mockQueryBuilder.getRawMany.mockResolvedValue([
        { accountId: '1', totalDebit: '5000', totalCredit: '0' },
        { accountId: '2', totalDebit: '0', totalCredit: '5000' },
      ]);

      const result = await service.generateBalanceSheet(asOfDate);

      expect(result.equity.netIncome).toBe(0);
      expect(result.equity.total).toBe(5000);
      expect(result.isBalanced).toBe(true);
    });
```

**Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest --testPathPattern=accounting-reports.service.spec --no-coverage -t "should include net income" 2>&1 | tail -15`
Expected: FAIL - `netIncome` property does not exist on result

**Step 3: Implement net income calculation in generateBalanceSheet()**

In `backend/src/modules/accounting/services/accounting-reports.service.ts`, replace the `generateBalanceSheet()` method (lines 533-711). The key changes are:

1. After calculating equity account totals, add a second query for REVENUE and EXPENSE accounts
2. Calculate net income using the same `calculateBalanceByAccountType()` method
3. Add net income to equity total
4. Include `netIncome` in the return object

Replace the section starting from the `totalEquity` calculation (around line 669) through the return statement (line 710) with:

```typescript
    // Calculate equity accounts total (before net income)
    const equityAccountsTotal = this.roundTo2Decimals(
      equityAccounts.reduce((sum, acc) => sum + acc.balance, 0),
    );

    // ── Calculate Net Income (Revenue - Expenses) ──
    // Query REVENUE and EXPENSE accounts to compute current period net income
    const incomeQueryBuilder = this.accountRepository.createQueryBuilder('account');
    incomeQueryBuilder.where('account.type IN (:...types)', {
      types: [AccountType.REVENUE, AccountType.EXPENSE],
    });
    if (!includeInactive) {
      incomeQueryBuilder.andWhere('account.isActive = :isActive', { isActive: true });
    }
    const incomeAccounts = await incomeQueryBuilder
      .orderBy('account.code', 'ASC')
      .getMany();

    let netIncome = 0;

    if (incomeAccounts.length > 0) {
      const incomeAccountIds = incomeAccounts.map(a => a.id);

      const incomeTransactionData = await this.journalEntryLineRepository
        .createQueryBuilder('jel')
        .leftJoin('jel.journalEntry', 'je')
        .select('jel.accountId', 'accountId')
        .addSelect('SUM(jel.debitAmount)', 'totalDebit')
        .addSelect('SUM(jel.creditAmount)', 'totalCredit')
        .where('jel.accountId IN (:...accountIds)', { accountIds: incomeAccountIds })
        .andWhere('je.entryDate <= :asOfDate', { asOfDate })
        .andWhere('je.status = :status', { status: JournalEntryStatus.POSTED })
        .groupBy('jel.accountId')
        .getRawMany();

      const incomeTransactionMap = new Map<string, { totalDebit: number; totalCredit: number }>();
      incomeTransactionData.forEach(row => {
        incomeTransactionMap.set(row.accountId, {
          totalDebit: parseFloat(row.totalDebit || '0'),
          totalCredit: parseFloat(row.totalCredit || '0'),
        });
      });

      // Sum up all revenue and expense balances
      // Revenue: positive balance = income, Expense: positive balance = cost
      // Net Income = total revenue balances - total expense balances
      let totalRevenue = 0;
      let totalExpenses = 0;

      incomeAccounts.forEach(account => {
        const txn = incomeTransactionMap.get(account.id) || { totalDebit: 0, totalCredit: 0 };
        const balance = this.calculateBalanceByAccountType(account.type, txn.totalDebit, txn.totalCredit);

        if (account.type === AccountType.REVENUE) {
          totalRevenue += balance;
        } else {
          totalExpenses += balance;
        }
      });

      netIncome = this.roundTo2Decimals(totalRevenue - totalExpenses);
    }

    this.logger.log(`Net income calculated: ${netIncome}`);

    // Total equity includes equity accounts plus current period net income
    const totalEquity = this.roundTo2Decimals(equityAccountsTotal + netIncome);

    // Validate balance sheet equation: Assets = Liabilities + Equity (incl. net income)
    const totalLiabilitiesAndEquity = this.roundTo2Decimals(totalLiabilities + totalEquity);
    const isBalanced = Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01;

    this.logger.log(
      `Balance sheet generated: Assets=${totalAssets}, ` +
      `Liabilities=${totalLiabilities}, Equity=${totalEquity} ` +
      `(Accounts=${equityAccountsTotal}, Net Income=${netIncome}), ` +
      `Balanced=${isBalanced}`,
    );

    if (!isBalanced) {
      this.logger.warn(
        `Balance sheet is UNBALANCED! ` +
        `Assets (${totalAssets}) != Liabilities + Equity (${totalLiabilitiesAndEquity})`,
      );
    }

    return {
      assets: {
        current: currentAssets,
        fixed: fixedAssets,
        totalCurrent: totalCurrentAssets,
        totalFixed: totalFixedAssets,
        total: totalAssets,
      },
      liabilities: {
        current: currentLiabilities,
        longTerm: longTermLiabilities,
        totalCurrent: totalCurrentLiabilities,
        totalLongTerm: totalLongTermLiabilities,
        total: totalLiabilities,
      },
      equity: {
        accounts: equityAccounts,
        netIncome,
        total: totalEquity,
      },
      isBalanced,
    };
```

Also update `createEmptyBalanceSheet()` (around line 1891) to include `netIncome: 0`:

```typescript
  private createEmptyBalanceSheet(): BalanceSheetResponse {
    return {
      assets: {
        current: [],
        fixed: [],
        totalCurrent: 0,
        totalFixed: 0,
        total: 0,
      },
      liabilities: {
        current: [],
        longTerm: [],
        totalCurrent: 0,
        totalLongTerm: 0,
        total: 0,
      },
      equity: {
        accounts: [],
        netIncome: 0,
        total: 0,
      },
      isBalanced: true,
    };
  }
```

**Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest --testPathPattern=accounting-reports.service.spec --no-coverage -t "generateBalanceSheet" 2>&1 | tail -20`
Expected: All balance sheet tests PASS (including the 3 new ones)

**Step 5: Fix any existing tests that broke**

The existing test "should generate a balanced balance sheet with all sections" (line 629) needs its mock updated because now `generateBalanceSheet()` makes TWO queryBuilder chains (one for BS accounts, one for IS accounts). Update the mock to handle both calls.

The existing test at line 629 needs to be updated so that `getMany` returns BS accounts on first call and empty array on second call, and `getRawMany` returns the BS transactions on first call.

```typescript
    it('should generate a balanced balance sheet with all sections', async () => {
      const asOfDate = new Date('2026-02-01');

      const mockAccounts = [
        { id: '1', code: '1000', name: 'Cash', type: AccountType.ASSET, isActive: true },
        { id: '2', code: '1200', name: 'Accounts Receivable', type: AccountType.ASSET, isActive: true },
        { id: '3', code: '1500', name: 'Equipment', type: AccountType.ASSET, isActive: true },
        { id: '4', code: '1600', name: 'Buildings', type: AccountType.ASSET, isActive: true },
        { id: '5', code: '2000', name: 'Accounts Payable', type: AccountType.LIABILITY, isActive: true },
        { id: '6', code: '2100', name: 'Short-term Debt', type: AccountType.LIABILITY, isActive: true },
        { id: '7', code: '2500', name: 'Long-term Debt', type: AccountType.LIABILITY, isActive: true },
        { id: '8', code: '2600', name: 'Bonds Payable', type: AccountType.LIABILITY, isActive: true },
        { id: '9', code: '3000', name: 'Common Stock', type: AccountType.EQUITY, isActive: true },
        { id: '10', code: '3100', name: 'Retained Earnings', type: AccountType.EQUITY, isActive: true },
      ];

      // First getMany: BS accounts, Second getMany: no income statement accounts
      let getManyCalls = 0;
      mockQueryBuilder.getMany.mockImplementation(() => {
        getManyCalls++;
        if (getManyCalls === 1) return Promise.resolve(mockAccounts);
        return Promise.resolve([]); // No revenue/expense accounts
      });

      mockQueryBuilder.getRawMany.mockResolvedValue([
        { accountId: '1', totalDebit: '5000', totalCredit: '0' },
        { accountId: '2', totalDebit: '3000', totalCredit: '0' },
        { accountId: '3', totalDebit: '10000', totalCredit: '0' },
        { accountId: '4', totalDebit: '20000', totalCredit: '0' },
        { accountId: '5', totalDebit: '0', totalCredit: '2000' },
        { accountId: '6', totalDebit: '0', totalCredit: '1000' },
        { accountId: '7', totalDebit: '0', totalCredit: '10000' },
        { accountId: '8', totalDebit: '0', totalCredit: '5000' },
        { accountId: '9', totalDebit: '0', totalCredit: '15000' },
        { accountId: '10', totalDebit: '0', totalCredit: '5000' },
      ]);

      const result = await service.generateBalanceSheet(asOfDate);

      expect(result).toBeDefined();
      expect(result.assets.current).toHaveLength(2);
      expect(result.assets.fixed).toHaveLength(2);
      expect(result.assets.totalCurrent).toBe(8000);
      expect(result.assets.totalFixed).toBe(30000);
      expect(result.assets.total).toBe(38000);

      expect(result.liabilities.current).toHaveLength(2);
      expect(result.liabilities.longTerm).toHaveLength(2);
      expect(result.liabilities.totalCurrent).toBe(3000);
      expect(result.liabilities.totalLongTerm).toBe(15000);
      expect(result.liabilities.total).toBe(18000);

      expect(result.equity.accounts).toHaveLength(2);
      expect(result.equity.netIncome).toBe(0);
      expect(result.equity.total).toBe(20000);

      expect(result.isBalanced).toBe(true);
      expect(result.assets.total).toBe(result.liabilities.total + result.equity.total);
    });
```

Similar updates are needed for the other existing balance sheet tests: they need `getMany` to return `[]` on the second call (for income statement accounts). Follow the same pattern of using `let getManyCalls = 0` counter.

**Step 6: Run ALL balance sheet tests**

Run: `cd backend && npx jest --testPathPattern=accounting-reports.service.spec --no-coverage -t "generateBalanceSheet" 2>&1 | tail -30`
Expected: ALL tests PASS

**Step 7: Commit**

```bash
git add backend/src/modules/accounting/services/accounting-reports.service.ts backend/src/modules/accounting/services/accounting-reports.service.spec.ts
git commit -m "feat(accounting): calculate net income in balance sheet for proper balancing"
```

---

### Task 3: Update Excel export to show Net Income

**Files:**
- Modify: `backend/src/modules/accounting/services/accounting-reports.service.ts` (the `exportBalanceSheetToExcel` method, ~line 1292)

**Step 1: Add Net Income row in the equity section of the Excel export**

In the `exportBalanceSheetToExcel()` method, after the equity accounts loop (around line 1442) and before the total equity row, add:

```typescript
    // Net Income row (virtual/calculated, not an account)
    if (data.equity.netIncome !== 0) {
      const netIncomeRow = worksheet.addRow([
        '',
        data.equity.netIncome >= 0 ? 'Net Income (Current Period)' : 'Net Loss (Current Period)',
        data.equity.netIncome,
      ]);
      netIncomeRow.font = { bold: true, italic: true };
      netIncomeRow.getCell(3).numFmt = '#,##0.00';
    }
```

**Step 2: Run Excel export test**

Run: `cd backend && npx jest --testPathPattern=accounting-reports.service.spec --no-coverage -t "exportBalanceSheetToExcel" 2>&1 | tail -15`
Expected: PASS

**Step 3: Commit**

```bash
git add backend/src/modules/accounting/services/accounting-reports.service.ts
git commit -m "feat(accounting): include net income row in balance sheet Excel export"
```

---

### Task 4: Update Redux slice type

**Files:**
- Modify: `frontend/src/store/slices/accountingReportsSlice.ts:27-47`

**Step 1: Add netIncome to the BalanceSheetReport interface**

Find the `BalanceSheetReport` interface (line 27) and add `netIncome` to the equity section:

```typescript
interface BalanceSheetReport {
  assets: {
    current: AccountBalance[];
    fixed: AccountBalance[];
    totalCurrent: number;
    totalFixed: number;
    total: number;
  };
  liabilities: {
    current: AccountBalance[];
    longTerm: AccountBalance[];
    totalCurrent: number;
    totalLongTerm: number;
    total: number;
  };
  equity: {
    accounts: AccountBalance[];
    netIncome: number;
    total: number;
  };
  isBalanced: boolean;
}
```

**Step 2: Run frontend type check**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: PASS (no type errors)

**Step 3: Commit**

```bash
git add frontend/src/store/slices/accountingReportsSlice.ts
git commit -m "feat(accounting): add netIncome to BalanceSheetReport type in Redux slice"
```

---

### Task 5: Display Net Income in Balance Sheet UI

**Files:**
- Modify: `frontend/src/pages/accounting/reports/BalanceSheetPage.tsx`

**Step 1: Add Net Income line in the equity section**

In `BalanceSheetPage.tsx`, find where `equityAccounts` is extracted (line 253) and add:

```typescript
  const equityAccounts = normalizeAccounts(data?.equity?.accounts);
  const netIncome = data?.equity?.netIncome ?? 0;
```

Then find the equity `BalanceSheetSection` (around line 407-416). Replace the equity Grid item with a version that shows net income:

```typescript
              {/* Equity Section */}
              <Grid item xs={12} md={4}>
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <BalanceSheetSection
                    title="EQUITY"
                    accounts={equityAccounts}
                    subtotal={equitySubtotal}
                    color="success"
                  />
                  {/* Net Income Line */}
                  {netIncome !== 0 && (
                    <Box sx={{ mt: 1, px: 1, py: 0.5, borderTop: 1, borderColor: 'divider' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography
                          variant="body2"
                          sx={{ fontStyle: 'italic', fontWeight: 600 }}
                        >
                          {netIncome >= 0 ? 'Net Income' : 'Net Loss'}
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{
                            fontFamily: 'monospace',
                            fontWeight: 600,
                            fontStyle: 'italic',
                            color: netIncome >= 0 ? 'success.main' : 'error.main',
                          }}
                        >
                          {formatCurrency(Math.abs(netIncome))}
                          {netIncome < 0 && ' (Loss)'}
                        </Typography>
                      </Box>
                    </Box>
                  )}
                </Paper>
              </Grid>
```

Also update `equitySubtotal` to use `data?.equity?.total` which now includes net income:

```typescript
  const equitySubtotal = data?.equity?.subtotal ?? data?.equity?.total ?? 0;
```

This line already exists and correctly uses `data?.equity?.total`, which now includes net income from the backend. No change needed here.

**Step 2: Run frontend type check**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: PASS

**Step 3: Commit**

```bash
git add frontend/src/pages/accounting/reports/BalanceSheetPage.tsx
git commit -m "feat(accounting): display net income line in balance sheet equity section"
```

---

### Task 6: Update frontend test

**Files:**
- Modify: `frontend/src/pages/accounting/reports/__tests__/BalanceSheetPage.test.tsx`

**Step 1: Update existing test data to include netIncome**

In the test "renders balance sheet data from backend response shape" (line 70), update the equity section in the mock data:

```typescript
            equity: {
              accounts: [{ accountCode: '3100', accountName: 'Capital', balance: 1300 }],
              netIncome: 0,
              total: 1300,
            },
```

**Step 2: Add a test that verifies net income is displayed**

Add this test after the existing tests:

```typescript
  it('renders net income in equity section when present', () => {
    const store = createMockStore({
      accountingReports: {
        trialBalance: { data: null, loading: false, error: null },
        balanceSheet: {
          loading: false,
          error: null,
          data: {
            assets: {
              current: [{ accountCode: '1000', accountName: 'Cash', balance: 5000 }],
              fixed: [],
              totalCurrent: 5000,
              totalFixed: 0,
              total: 5000,
            },
            liabilities: {
              current: [],
              longTerm: [],
              totalCurrent: 0,
              totalLongTerm: 0,
              total: 0,
            },
            equity: {
              accounts: [{ accountCode: '3000', accountName: 'Owner\'s Equity', balance: 2000 }],
              netIncome: 3000,
              total: 5000,
            },
            isBalanced: true,
          },
        },
        profitAndLoss: { data: null, loading: false, error: null },
        generalLedger: { data: null, loading: false, error: null },
        accountActivity: { data: null, loading: false, error: null },
        downloading: false,
      },
    });

    render(
      <Provider store={store}>
        <BrowserRouter>
          <BalanceSheetPage />
        </BrowserRouter>
      </Provider>
    );

    expect(screen.getByText('Net Income')).toBeInTheDocument();
  });
```

**Step 3: Run frontend tests**

Run: `cd frontend && npx vitest run src/pages/accounting/reports/__tests__/BalanceSheetPage.test.tsx 2>&1 | tail -20`
Expected: ALL tests PASS

**Step 4: Commit**

```bash
git add frontend/src/pages/accounting/reports/__tests__/BalanceSheetPage.test.tsx
git commit -m "test(accounting): add net income display tests for balance sheet page"
```

---

### Task 7: Run full test suite and verify

**Files:** None (verification only)

**Step 1: Run all backend accounting tests**

Run: `cd backend && npx jest --testPathPattern=accounting-reports.service.spec --no-coverage 2>&1 | tail -30`
Expected: ALL tests PASS

**Step 2: Run all frontend accounting tests**

Run: `cd frontend && npx vitest run src/pages/accounting/reports/ 2>&1 | tail -20`
Expected: ALL tests PASS

**Step 3: Rebuild and test in Docker**

Run: `docker compose build backend && docker compose up -d backend`
Wait 15 seconds for startup.

Run: `curl -s http://localhost:3001/api/accounting/reports/balance-sheet -H "Authorization: Bearer <token>" | python3 -m json.tool | head -40`

Verify:
- Response includes `equity.netIncome` field
- `isBalanced` is `true`
- `equity.total` equals equity accounts + net income

**Step 4: Rebuild frontend**

Run: `docker compose build frontend && docker compose up -d frontend`

**Step 5: Final commit**

```bash
git add -A
git commit -m "feat(accounting): balance sheet includes virtual net income for proper balancing

Balance sheet now calculates current period net income (Revenue - Expenses)
and includes it in the equity section. This ensures the accounting equation
Assets = Liabilities + Equity always balances without requiring manual
closing entries.

Changes:
- Backend: generateBalanceSheet() calculates net income from REVENUE/EXPENSE accounts
- Backend: BalanceSheetResponse interface includes equity.netIncome field
- Backend: Excel export shows Net Income row in equity section
- Frontend: Redux type updated with netIncome field
- Frontend: Balance sheet page displays Net Income/Loss in equity section
- Tests: 3 new backend tests, 1 new frontend test, existing tests updated"
```
