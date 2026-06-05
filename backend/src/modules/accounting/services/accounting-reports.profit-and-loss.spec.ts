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

describe('AccountingReportsService - Profit And Loss', () => {
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

  describe('generateProfitAndLoss', () => {
    it('should calculate profit and loss for a date range correctly', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      accountRepository.createQueryBuilder.mockReturnValue(qb);
      qb.getMany.mockResolvedValue([
        { id: '1', code: '4000', name: 'Sales Revenue', type: AccountType.REVENUE, isActive: true },
        { id: '2', code: '4100', name: 'Service Revenue', type: AccountType.REVENUE, isActive: true },
        { id: '3', code: '5000', name: 'Cost of Goods Sold', type: AccountType.EXPENSE, isActive: true },
        { id: '4', code: '5100', name: 'Direct Labor', type: AccountType.EXPENSE, isActive: true },
        { id: '5', code: '6000', name: 'Rent Expense', type: AccountType.EXPENSE, isActive: true },
        { id: '6', code: '6100', name: 'Utilities Expense', type: AccountType.EXPENSE, isActive: true },
      ]);
      queryHelper.queryTransactionTotals.mockResolvedValue(
        new Map([
          ['1', { totalDebit: 0, totalCredit: 100000 }],
          ['2', { totalDebit: 0, totalCredit: 20000 }],
          ['3', { totalDebit: 60000, totalCredit: 0 }],
          ['4', { totalDebit: 5000, totalCredit: 0 }],
          ['5', { totalDebit: 10000, totalCredit: 0 }],
          ['6', { totalDebit: 5000, totalCredit: 0 }],
        ]),
      );

      const result = await service.generateProfitAndLoss(startDate, endDate);

      expect(result.revenue.accounts).toHaveLength(2);
      expect(result.revenue.total).toBe(120000);
      expect(result.costOfGoodsSold.accounts).toHaveLength(2);
      expect(result.costOfGoodsSold.total).toBe(65000);
      expect(result.grossProfit).toBe(55000);
      expect(result.expenses.accounts).toHaveLength(2);
      expect(result.expenses.total).toBe(15000);
      expect(result.netIncome).toBe(40000);
      expect(queryHelper.queryTransactionTotals).toHaveBeenCalledWith(
        ['1', '2', '3', '4', '5', '6'],
        { type: 'range', startDate, endDate },
        [JournalEntryStatus.POSTED, JournalEntryStatus.REVERSED],
      );
    });

    it('should handle negative net income (loss)', async () => {
      accountRepository.createQueryBuilder.mockReturnValue(qb);
      qb.getMany.mockResolvedValue([
        { id: '1', code: '4000', name: 'Sales Revenue', type: AccountType.REVENUE, isActive: true },
        { id: '2', code: '5000', name: 'Cost of Goods Sold', type: AccountType.EXPENSE, isActive: true },
        { id: '3', code: '6000', name: 'Operating Expenses', type: AccountType.EXPENSE, isActive: true },
      ]);
      queryHelper.queryTransactionTotals.mockResolvedValue(
        new Map([
          ['1', { totalDebit: 0, totalCredit: 50000 }],
          ['2', { totalDebit: 30000, totalCredit: 0 }],
          ['3', { totalDebit: 40000, totalCredit: 0 }],
        ]),
      );

      const result = await service.generateProfitAndLoss(
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(result.revenue.total).toBe(50000);
      expect(result.costOfGoodsSold.total).toBe(30000);
      expect(result.grossProfit).toBe(20000);
      expect(result.expenses.total).toBe(40000);
      expect(result.netIncome).toBe(-20000);
    });

    it('should differentiate COGS (5xxx) from Operating Expenses (6xxx+)', async () => {
      accountRepository.createQueryBuilder.mockReturnValue(qb);
      qb.getMany.mockResolvedValue([
        { id: '1', code: '4000', name: 'Revenue', type: AccountType.REVENUE, isActive: true },
        { id: '2', code: '5000', name: 'COGS', type: AccountType.EXPENSE, isActive: true },
        { id: '3', code: '5999', name: 'Direct Materials', type: AccountType.EXPENSE, isActive: true },
        { id: '4', code: '6000', name: 'Rent', type: AccountType.EXPENSE, isActive: true },
        { id: '5', code: '7000', name: 'Marketing', type: AccountType.EXPENSE, isActive: true },
      ]);
      queryHelper.queryTransactionTotals.mockResolvedValue(
        new Map([
          ['1', { totalDebit: 0, totalCredit: 100000 }],
          ['2', { totalDebit: 30000, totalCredit: 0 }],
          ['3', { totalDebit: 10000, totalCredit: 0 }],
          ['4', { totalDebit: 5000, totalCredit: 0 }],
          ['5', { totalDebit: 3000, totalCredit: 0 }],
        ]),
      );

      const result = await service.generateProfitAndLoss(
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(result.costOfGoodsSold.accounts).toHaveLength(2);
      expect(result.costOfGoodsSold.total).toBe(40000);
      expect(result.expenses.accounts).toHaveLength(2);
      expect(result.expenses.total).toBe(8000);
      expect(result.grossProfit).toBe(60000);
      expect(result.netIncome).toBe(52000);
    });

    it('should filter by date range inclusively', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      accountRepository.createQueryBuilder.mockReturnValue(qb);
      qb.getMany.mockResolvedValue([
        { id: '1', code: '4000', name: 'Revenue', type: AccountType.REVENUE, isActive: true },
      ]);
      queryHelper.queryTransactionTotals.mockResolvedValue(new Map());

      await service.generateProfitAndLoss(startDate, endDate);

      expect(queryHelper.queryTransactionTotals).toHaveBeenCalledWith(
        ['1'],
        { type: 'range', startDate, endDate },
        [JournalEntryStatus.POSTED, JournalEntryStatus.REVERSED],
      );
    });

    it('should exclude inactive accounts by default', async () => {
      accountRepository.createQueryBuilder.mockReturnValue(qb);
      qb.getMany.mockResolvedValue([
        { id: '1', code: '4000', name: 'Revenue', type: AccountType.REVENUE, isActive: true },
      ]);
      queryHelper.queryTransactionTotals.mockResolvedValue(new Map());

      await service.generateProfitAndLoss(
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(qb.andWhere).toHaveBeenCalledWith('account.isActive = :isActive', {
        isActive: true,
      });
    });

    it('should include inactive accounts when requested', async () => {
      accountRepository.createQueryBuilder.mockReturnValue(qb);
      qb.getMany.mockResolvedValue([
        { id: '1', code: '4000', name: 'Revenue', type: AccountType.REVENUE, isActive: true },
        { id: '2', code: '4100', name: 'Old Revenue', type: AccountType.REVENUE, isActive: false },
      ]);
      queryHelper.queryTransactionTotals.mockResolvedValue(
        new Map([
          ['1', { totalDebit: 0, totalCredit: 10000 }],
          ['2', { totalDebit: 0, totalCredit: 5000 }],
        ]),
      );

      const result = await service.generateProfitAndLoss(
        new Date('2026-01-01'),
        new Date('2026-01-31'),
        true,
      );

      expect(result.revenue.accounts).toHaveLength(2);
      expect(result.revenue.total).toBe(15000);
    });

    it('should include POSTED and REVERSED journal entries', async () => {
      accountRepository.createQueryBuilder.mockReturnValue(qb);
      qb.getMany.mockResolvedValue([
        { id: '1', code: '4000', name: 'Revenue', type: AccountType.REVENUE, isActive: true },
      ]);
      queryHelper.queryTransactionTotals.mockResolvedValue(new Map());

      await service.generateProfitAndLoss(
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(queryHelper.queryTransactionTotals).toHaveBeenCalledWith(
        ['1'],
        {
          type: 'range',
          startDate: new Date('2026-01-01'),
          endDate: new Date('2026-01-31'),
        },
        [JournalEntryStatus.POSTED, JournalEntryStatus.REVERSED],
      );
    });

    it('should throw BadRequestException when date range is invalid', async () => {
      await expect(
        service.generateProfitAndLoss(new Date('2026-02-01'), new Date('2026-01-01')),
      ).rejects.toThrow('Start date must be before or equal to end date');
    });

    it('should throw BadRequestException when endDate is in the future', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      futureDate.setHours(12, 0, 0, 0);

      await expect(
        service.generateProfitAndLoss(new Date('2026-01-01'), futureDate),
      ).rejects.toThrow('End date cannot be in the future');
    });

    it('should handle zero revenue and expenses', async () => {
      accountRepository.createQueryBuilder.mockReturnValue(qb);
      qb.getMany.mockResolvedValue([
        { id: '1', code: '4000', name: 'Revenue', type: AccountType.REVENUE, isActive: true },
        { id: '2', code: '5000', name: 'COGS', type: AccountType.EXPENSE, isActive: true },
        { id: '3', code: '6000', name: 'Expenses', type: AccountType.EXPENSE, isActive: true },
      ]);
      queryHelper.queryTransactionTotals.mockResolvedValue(new Map());

      const result = await service.generateProfitAndLoss(
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(result.revenue.total).toBe(0);
      expect(result.costOfGoodsSold.total).toBe(0);
      expect(result.grossProfit).toBe(0);
      expect(result.expenses.total).toBe(0);
      expect(result.netIncome).toBe(0);
    });
  });

  describe('exportProfitAndLossToExcel', () => {
    it('should generate Excel buffer for profit and loss report', async () => {
      const mockProfitAndLoss = {
        revenue: {
          accounts: [
            { accountCode: '4000', accountName: 'Sales Revenue', balance: 100000 },
            { accountCode: '4100', accountName: 'Service Revenue', balance: 20000 },
          ],
          total: 120000,
        },
        costOfGoodsSold: {
          accounts: [{ accountCode: '5000', accountName: 'Cost of Goods Sold', balance: 60000 }],
          total: 60000,
        },
        grossProfit: 60000,
        expenses: {
          accounts: [
            { accountCode: '6000', accountName: 'Rent Expense', balance: 10000 },
            { accountCode: '6100', accountName: 'Utilities', balance: 5000 },
          ],
          total: 15000,
        },
        netIncome: 45000,
      };

      const buffer = await service.exportProfitAndLossToExcel(mockProfitAndLoss);

      expect(buffer).toBeDefined();
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
      expect(excelExportService.exportProfitAndLossToExcel).toHaveBeenCalledWith(
        mockProfitAndLoss,
        'profit-and-loss',
      );
    });

    it('should handle negative net income (loss)', async () => {
      const mockLoss = {
        revenue: {
          accounts: [{ accountCode: '4000', accountName: 'Sales Revenue', balance: 50000 }],
          total: 50000,
        },
        costOfGoodsSold: {
          accounts: [{ accountCode: '5000', accountName: 'COGS', balance: 30000 }],
          total: 30000,
        },
        grossProfit: 20000,
        expenses: {
          accounts: [
            { accountCode: '6000', accountName: 'Operating Expenses', balance: 40000 },
          ],
          total: 40000,
        },
        netIncome: -20000,
      };

      const buffer = await service.exportProfitAndLossToExcel(mockLoss);

      expect(buffer).toBeDefined();
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
      expect(excelExportService.exportProfitAndLossToExcel).toHaveBeenCalledWith(
        mockLoss,
        'profit-and-loss',
      );
    });
  });
});
