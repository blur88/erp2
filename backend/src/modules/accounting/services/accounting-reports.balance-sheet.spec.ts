import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AccountingReportsService } from './accounting-reports.service';
import {
  ChartOfAccount,
  AccountType,
} from '../../../database/entities/chart-of-account.entity';
import {
  JournalEntry,
  JournalEntryStatus,
} from '../../../database/entities/journal-entry.entity';
import { JournalEntryLine } from '../../../database/entities/journal-entry-line.entity';
import {
  createMockExcelExportService,
  createMockQueryHelper,
  createMockQueryBuilder,
  createMockRepositories,
} from './__fixtures__/accounting-reports.fixtures';
import { AccountingExcelExportService } from './accounting-reports.excel-export.service';
import { AccountingReportsQueryHelper } from './accounting-reports.query-helper';

describe('AccountingReportsService - Balance Sheet', () => {
  let service: AccountingReportsService;
  let accountRepository: any;
  let excelExportService: ReturnType<typeof createMockExcelExportService>;
  let queryHelper: ReturnType<typeof createMockQueryHelper>;
  let qb: ReturnType<typeof createMockQueryBuilder>;

  beforeEach(async () => {
    qb = createMockQueryBuilder();
    const { accountRepo, journalRepo, lineRepo } = createMockRepositories(qb);
    excelExportService = createMockExcelExportService();
    queryHelper = createMockQueryHelper();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountingReportsService,
        { provide: getRepositoryToken(ChartOfAccount), useValue: accountRepo },
        { provide: getRepositoryToken(JournalEntry), useValue: journalRepo },
        { provide: getRepositoryToken(JournalEntryLine), useValue: lineRepo },
        { provide: AccountingReportsQueryHelper, useValue: queryHelper },
        {
          provide: AccountingExcelExportService,
          useValue: excelExportService,
        },
      ],
    }).compile();

    service = module.get<AccountingReportsService>(AccountingReportsService);
    accountRepository = module.get(getRepositoryToken(ChartOfAccount));
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateBalanceSheet', () => {
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

      accountRepository.createQueryBuilder.mockReturnValue(qb);
      qb.getMany.mockResolvedValueOnce(mockAccounts).mockResolvedValueOnce([]);
      queryHelper.queryTransactionTotals
        .mockResolvedValueOnce(
          new Map([
            ['1', { totalDebit: 5000, totalCredit: 0 }],
            ['2', { totalDebit: 3000, totalCredit: 0 }],
            ['3', { totalDebit: 10000, totalCredit: 0 }],
            ['4', { totalDebit: 20000, totalCredit: 0 }],
            ['5', { totalDebit: 0, totalCredit: 2000 }],
            ['6', { totalDebit: 0, totalCredit: 1000 }],
            ['7', { totalDebit: 0, totalCredit: 10000 }],
            ['8', { totalDebit: 0, totalCredit: 5000 }],
            ['9', { totalDebit: 0, totalCredit: 15000 }],
            ['10', { totalDebit: 0, totalCredit: 5000 }],
          ]),
        )
        .mockResolvedValueOnce(new Map());

      const result = await service.generateBalanceSheet(asOfDate);

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
      expect(queryHelper.queryTransactionTotals).toHaveBeenNthCalledWith(
        1,
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
        { type: 'asOf', date: asOfDate },
        [JournalEntryStatus.POSTED, JournalEntryStatus.REVERSED],
      );
    });

    it('should detect unbalanced balance sheet', async () => {
      accountRepository.createQueryBuilder.mockReturnValue(qb);
      qb.getMany
        .mockResolvedValueOnce([
          { id: '1', code: '1000', name: 'Cash', type: AccountType.ASSET, isActive: true },
          { id: '2', code: '2000', name: 'Accounts Payable', type: AccountType.LIABILITY, isActive: true },
        ])
        .mockResolvedValueOnce([]);
      queryHelper.queryTransactionTotals
        .mockResolvedValueOnce(
          new Map([
            ['1', { totalDebit: 5000, totalCredit: 0 }],
            ['2', { totalDebit: 0, totalCredit: 3000 }],
          ]),
        )
        .mockResolvedValueOnce(new Map());

      const result = await service.generateBalanceSheet(new Date('2026-02-01'));

      expect(result.isBalanced).toBe(false);
      expect(result.assets.total).not.toBe(result.liabilities.total + result.equity.total);
    });

    it('should validate balance sheet equation with tolerance', async () => {
      accountRepository.createQueryBuilder.mockReturnValue(qb);
      qb.getMany
        .mockResolvedValueOnce([
          { id: '1', code: '1000', name: 'Cash', type: AccountType.ASSET, isActive: true },
          { id: '2', code: '2000', name: 'Accounts Payable', type: AccountType.LIABILITY, isActive: true },
          { id: '3', code: '3000', name: 'Common Stock', type: AccountType.EQUITY, isActive: true },
        ])
        .mockResolvedValueOnce([]);
      queryHelper.queryTransactionTotals
        .mockResolvedValueOnce(
          new Map([
            ['1', { totalDebit: 1000, totalCredit: 0 }],
            ['2', { totalDebit: 0, totalCredit: 500 }],
            ['3', { totalDebit: 0, totalCredit: 500.005 }],
          ]),
        )
        .mockResolvedValueOnce(new Map());

      const result = await service.generateBalanceSheet(new Date('2026-02-01'));

      expect(result.isBalanced).toBe(true);
    });

    it('should exclude inactive accounts by default', async () => {
      accountRepository.createQueryBuilder.mockReturnValue(qb);
      qb.getMany
        .mockResolvedValueOnce([
          { id: '1', code: '1000', name: 'Cash', type: AccountType.ASSET, isActive: true },
        ])
        .mockResolvedValueOnce([]);
      queryHelper.queryTransactionTotals
        .mockResolvedValueOnce(new Map([['1', { totalDebit: 1000, totalCredit: 0 }]]))
        .mockResolvedValueOnce(new Map());

      await service.generateBalanceSheet(new Date('2026-02-01'));

      expect(qb.andWhere).toHaveBeenCalledWith('account.isActive = :isActive', {
        isActive: true,
      });
    });

    it('should include inactive accounts when requested', async () => {
      accountRepository.createQueryBuilder.mockReturnValue(qb);
      qb.getMany
        .mockResolvedValueOnce([
          { id: '1', code: '1000', name: 'Cash', type: AccountType.ASSET, isActive: true },
          { id: '2', code: '1100', name: 'Old Asset', type: AccountType.ASSET, isActive: false },
        ])
        .mockResolvedValueOnce([]);
      queryHelper.queryTransactionTotals
        .mockResolvedValueOnce(
          new Map([
            ['1', { totalDebit: 1000, totalCredit: 0 }],
            ['2', { totalDebit: 500, totalCredit: 0 }],
          ]),
        )
        .mockResolvedValueOnce(new Map());

      const result = await service.generateBalanceSheet(new Date('2026-02-01'), true);

      expect(result.assets.current.length).toBeGreaterThanOrEqual(1);
    });

    it('should classify assets correctly by account code', async () => {
      accountRepository.createQueryBuilder.mockReturnValue(qb);
      qb.getMany
        .mockResolvedValueOnce([
          { id: '1', code: '1000', name: 'Cash', type: AccountType.ASSET, isActive: true },
          { id: '2', code: '1499', name: 'Inventory', type: AccountType.ASSET, isActive: true },
          { id: '3', code: '1500', name: 'Equipment', type: AccountType.ASSET, isActive: true },
          { id: '4', code: '1999', name: 'Land', type: AccountType.ASSET, isActive: true },
        ])
        .mockResolvedValueOnce([]);
      queryHelper.queryTransactionTotals
        .mockResolvedValueOnce(
          new Map([
            ['1', { totalDebit: 1000, totalCredit: 0 }],
            ['2', { totalDebit: 2000, totalCredit: 0 }],
            ['3', { totalDebit: 5000, totalCredit: 0 }],
            ['4', { totalDebit: 10000, totalCredit: 0 }],
          ]),
        )
        .mockResolvedValueOnce(new Map());

      const result = await service.generateBalanceSheet(new Date('2026-02-01'));

      expect(result.assets.current).toHaveLength(2);
      expect(result.assets.fixed).toHaveLength(2);
      expect(result.assets.totalCurrent).toBe(3000);
      expect(result.assets.totalFixed).toBe(15000);
    });

    it('should classify liabilities correctly by account code', async () => {
      accountRepository.createQueryBuilder.mockReturnValue(qb);
      qb.getMany
        .mockResolvedValueOnce([
          { id: '1', code: '2000', name: 'Accounts Payable', type: AccountType.LIABILITY, isActive: true },
          { id: '2', code: '2499', name: 'Accrued Expenses', type: AccountType.LIABILITY, isActive: true },
          { id: '3', code: '2500', name: 'Long-term Debt', type: AccountType.LIABILITY, isActive: true },
          { id: '4', code: '2999', name: 'Deferred Revenue', type: AccountType.LIABILITY, isActive: true },
        ])
        .mockResolvedValueOnce([]);
      queryHelper.queryTransactionTotals
        .mockResolvedValueOnce(
          new Map([
            ['1', { totalDebit: 0, totalCredit: 1000 }],
            ['2', { totalDebit: 0, totalCredit: 500 }],
            ['3', { totalDebit: 0, totalCredit: 5000 }],
            ['4', { totalDebit: 0, totalCredit: 2000 }],
          ]),
        )
        .mockResolvedValueOnce(new Map());

      const result = await service.generateBalanceSheet(new Date('2026-02-01'));

      expect(result.liabilities.current).toHaveLength(2);
      expect(result.liabilities.longTerm).toHaveLength(2);
      expect(result.liabilities.totalCurrent).toBe(1500);
      expect(result.liabilities.totalLongTerm).toBe(7000);
    });

    it('should include net income in equity section for balanced sheet', async () => {
      accountRepository.createQueryBuilder.mockReturnValue(qb);
      qb.getMany
        .mockResolvedValueOnce([
          { id: '1', code: '1000', name: 'Cash', type: AccountType.ASSET, isActive: true },
          { id: '2', code: '1200', name: 'Accounts Receivable', type: AccountType.ASSET, isActive: true },
          { id: '3', code: '2000', name: 'Accounts Payable', type: AccountType.LIABILITY, isActive: true },
          { id: '4', code: '3000', name: "Owner's Equity", type: AccountType.EQUITY, isActive: true },
          { id: '5', code: '3100', name: 'Retained Earnings', type: AccountType.EQUITY, isActive: true },
        ])
        .mockResolvedValueOnce([
          { id: '6', code: '4000', name: 'Sales Revenue', type: AccountType.REVENUE, isActive: true },
          { id: '7', code: '5000', name: 'Cost of Goods Sold', type: AccountType.EXPENSE, isActive: true },
          { id: '8', code: '6000', name: 'Rent Expense', type: AccountType.EXPENSE, isActive: true },
        ]);
      queryHelper.queryTransactionTotals
        .mockResolvedValueOnce(
          new Map([
            ['1', { totalDebit: 6000, totalCredit: 0 }],
            ['2', { totalDebit: 4000, totalCredit: 0 }],
            ['3', { totalDebit: 0, totalCredit: 3000 }],
            ['4', { totalDebit: 0, totalCredit: 1000 }],
            ['5', { totalDebit: 0, totalCredit: 1000 }],
          ]),
        )
        .mockResolvedValueOnce(
          new Map([
            ['6', { totalDebit: 0, totalCredit: 8000 }],
            ['7', { totalDebit: 2000, totalCredit: 0 }],
            ['8', { totalDebit: 1000, totalCredit: 0 }],
          ]),
        );

      const result = await service.generateBalanceSheet(new Date('2026-02-01'));

      expect(result.equity.netIncome).toBe(5000);
      expect(result.equity.total).toBe(7000);
      expect(result.assets.total).toBe(10000);
      expect(result.liabilities.total).toBe(3000);
      expect(result.isBalanced).toBe(true);
    });

    it('should handle negative net income (net loss)', async () => {
      accountRepository.createQueryBuilder.mockReturnValue(qb);
      qb.getMany
        .mockResolvedValueOnce([
          { id: '1', code: '1000', name: 'Cash', type: AccountType.ASSET, isActive: true },
          { id: '2', code: '3100', name: 'Retained Earnings', type: AccountType.EQUITY, isActive: true },
        ])
        .mockResolvedValueOnce([
          { id: '3', code: '4000', name: 'Sales Revenue', type: AccountType.REVENUE, isActive: true },
          { id: '4', code: '6000', name: 'Rent Expense', type: AccountType.EXPENSE, isActive: true },
        ]);
      queryHelper.queryTransactionTotals
        .mockResolvedValueOnce(
          new Map([
            ['1', { totalDebit: 5000, totalCredit: 0 }],
            ['2', { totalDebit: 0, totalCredit: 8000 }],
          ]),
        )
        .mockResolvedValueOnce(
          new Map([
            ['3', { totalDebit: 0, totalCredit: 1000 }],
            ['4', { totalDebit: 4000, totalCredit: 0 }],
          ]),
        );

      const result = await service.generateBalanceSheet(new Date('2026-02-01'));

      expect(result.equity.netIncome).toBe(-3000);
      expect(result.equity.total).toBe(5000);
      expect(result.isBalanced).toBe(true);
    });

    it('should handle zero net income when no revenue or expenses exist', async () => {
      accountRepository.createQueryBuilder.mockReturnValue(qb);
      qb.getMany
        .mockResolvedValueOnce([
          { id: '1', code: '1000', name: 'Cash', type: AccountType.ASSET, isActive: true },
          { id: '2', code: '3000', name: "Owner's Equity", type: AccountType.EQUITY, isActive: true },
        ])
        .mockResolvedValueOnce([]);
      queryHelper.queryTransactionTotals
        .mockResolvedValueOnce(
          new Map([
            ['1', { totalDebit: 5000, totalCredit: 0 }],
            ['2', { totalDebit: 0, totalCredit: 5000 }],
          ]),
        )
        .mockResolvedValueOnce(new Map());

      const result = await service.generateBalanceSheet(new Date('2026-02-01'));

      expect(result.equity.netIncome).toBe(0);
      expect(result.equity.total).toBe(5000);
      expect(result.isBalanced).toBe(true);
    });
  });

  describe('exportBalanceSheetToExcel', () => {
    it('should generate Excel buffer for balance sheet report', async () => {
      const mockBalanceSheet = {
        assets: {
          current: [
            { accountCode: '1000', accountName: 'Cash', balance: 10000 },
            { accountCode: '1200', accountName: 'Accounts Receivable', balance: 5000 },
          ],
          fixed: [{ accountCode: '1500', accountName: 'Equipment', balance: 20000 }],
          totalCurrent: 15000,
          totalFixed: 20000,
          total: 35000,
        },
        liabilities: {
          current: [{ accountCode: '2000', accountName: 'Accounts Payable', balance: 5000 }],
          longTerm: [{ accountCode: '2500', accountName: 'Long-term Debt', balance: 10000 }],
          totalCurrent: 5000,
          totalLongTerm: 10000,
          total: 15000,
        },
        equity: {
          accounts: [
            { accountCode: '3000', accountName: 'Common Stock', balance: 15000 },
            { accountCode: '3100', accountName: 'Retained Earnings', balance: 5000 },
          ],
          netIncome: 0,
          total: 20000,
        },
        isBalanced: true,
      };

      const buffer = await service.exportBalanceSheetToExcel(mockBalanceSheet);

      expect(buffer).toBeDefined();
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
      expect(excelExportService.exportBalanceSheetToExcel).toHaveBeenCalledWith(
        mockBalanceSheet,
        'balance-sheet',
      );
    });

    it('should handle empty balance sheet sections', async () => {
      const mockEmptyBalanceSheet = {
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

      const buffer = await service.exportBalanceSheetToExcel(mockEmptyBalanceSheet);

      expect(buffer).toBeDefined();
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });
});
