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

describe('AccountingReportsService - Trial Balance', () => {
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

  describe('generateTrialBalance', () => {
    it('should generate a balanced trial balance report', async () => {
      const asOfDate = new Date('2026-02-01');

      const mockAccounts = [
        { id: '1', code: '1000', name: 'Cash', type: AccountType.ASSET, isActive: true },
        { id: '2', code: '2000', name: 'Accounts Payable', type: AccountType.LIABILITY, isActive: true },
        { id: '3', code: '3000', name: 'Common Stock', type: AccountType.EQUITY, isActive: true },
        { id: '4', code: '4000', name: 'Sales Revenue', type: AccountType.REVENUE, isActive: true },
        { id: '5', code: '5000', name: 'Rent Expense', type: AccountType.EXPENSE, isActive: true },
      ];

      accountRepository.createQueryBuilder.mockReturnValue(qb);
      qb.getMany.mockResolvedValue(mockAccounts);
      queryHelper.queryTransactionTotals.mockResolvedValue(
        new Map([
          ['1', { totalDebit: 5000, totalCredit: 1000 }],
          ['2', { totalDebit: 500, totalCredit: 1500 }],
          ['3', { totalDebit: 0, totalCredit: 2000 }],
          ['4', { totalDebit: 200, totalCredit: 1700 }],
          ['5', { totalDebit: 500, totalCredit: 0 }],
        ]),
      );

      const result = await service.generateTrialBalance(asOfDate);

      expect(result).toBeDefined();
      expect(result.accounts).toHaveLength(5);
      expect(result.totalDebit).toBe(4500);
      expect(result.totalCredit).toBe(4500);
      expect(result.isBalanced).toBe(true);
      expect(result.accounts[0].accountCode).toBe('1000');
      expect(result.accounts[1].accountCode).toBe('2000');
      expect(result.accounts[0].debit).toBe(4000);
      expect(result.accounts[0].credit).toBe(0);
      expect(result.accounts[1].debit).toBe(0);
      expect(result.accounts[1].credit).toBe(1000);
      expect(queryHelper.queryTransactionTotals).toHaveBeenCalledWith(
        ['1', '2', '3', '4', '5'],
        { type: 'asOf', date: asOfDate },
        [JournalEntryStatus.POSTED, JournalEntryStatus.REVERSED],
      );
    });

    it('should detect unbalanced trial balance', async () => {
      accountRepository.createQueryBuilder.mockReturnValue(qb);
      qb.getMany.mockResolvedValue([
        { id: '1', code: '1000', name: 'Cash', type: AccountType.ASSET, isActive: true },
        { id: '2', code: '2000', name: 'Accounts Payable', type: AccountType.LIABILITY, isActive: true },
      ]);
      queryHelper.queryTransactionTotals.mockResolvedValue(
        new Map([
          ['1', { totalDebit: 1000, totalCredit: 0 }],
          ['2', { totalDebit: 0, totalCredit: 500 }],
        ]),
      );

      const result = await service.generateTrialBalance(new Date('2026-02-01'));

      expect(result.totalDebit).toBe(1000);
      expect(result.totalCredit).toBe(500);
      expect(result.isBalanced).toBe(false);
    });

    it('should exclude inactive accounts by default', async () => {
      accountRepository.createQueryBuilder.mockReturnValue(qb);
      qb.getMany.mockResolvedValue([
        { id: '1', code: '1000', name: 'Cash', type: AccountType.ASSET, isActive: true },
      ]);
      queryHelper.queryTransactionTotals.mockResolvedValue(
        new Map([['1', { totalDebit: 1000, totalCredit: 1000 }]]),
      );

      await service.generateTrialBalance(new Date('2026-02-01'));

      expect(qb.andWhere).toHaveBeenCalledWith('account.isActive = :isActive', {
        isActive: true,
      });
    });

    it('should include inactive accounts when requested', async () => {
      accountRepository.createQueryBuilder.mockReturnValue(qb);
      qb.getMany.mockResolvedValue([
        { id: '1', code: '1000', name: 'Cash', type: AccountType.ASSET, isActive: true },
        { id: '2', code: '1010', name: 'Old Account', type: AccountType.ASSET, isActive: false },
      ]);
      queryHelper.queryTransactionTotals.mockResolvedValue(
        new Map([
          ['1', { totalDebit: 1000, totalCredit: 500 }],
          ['2', { totalDebit: 200, totalCredit: 200 }],
        ]),
      );

      const result = await service.generateTrialBalance(new Date('2026-02-01'), true);

      expect(result.accounts).toHaveLength(2);
      expect(qb.andWhere).not.toHaveBeenCalledWith('account.isActive = :isActive', {
        isActive: true,
      });
    });

    it('should handle accounts with zero balances', async () => {
      accountRepository.createQueryBuilder.mockReturnValue(qb);
      qb.getMany.mockResolvedValue([
        { id: '1', code: '1000', name: 'Cash', type: AccountType.ASSET, isActive: true },
        { id: '2', code: '2000', name: 'Revenue', type: AccountType.REVENUE, isActive: true },
      ]);
      queryHelper.queryTransactionTotals.mockResolvedValue(
        new Map([
          ['1', { totalDebit: 1000, totalCredit: 1000 }],
          ['2', { totalDebit: 500, totalCredit: 500 }],
        ]),
      );

      const result = await service.generateTrialBalance(new Date('2026-02-01'));

      expect(result.accounts).toHaveLength(2);
      expect(result.accounts[0].debit).toBe(0);
      expect(result.accounts[0].credit).toBe(0);
      expect(result.accounts[1].debit).toBe(0);
      expect(result.accounts[1].credit).toBe(0);
      expect(result.totalDebit).toBe(0);
      expect(result.totalCredit).toBe(0);
      expect(result.isBalanced).toBe(true);
    });

    it('should handle empty trial balance with no transactions', async () => {
      accountRepository.createQueryBuilder.mockReturnValue(qb);
      qb.getMany.mockResolvedValue([
        { id: '1', code: '1000', name: 'Cash', type: AccountType.ASSET, isActive: true },
      ]);
      queryHelper.queryTransactionTotals.mockResolvedValue(new Map());

      const result = await service.generateTrialBalance(new Date('2026-02-01'));

      expect(result.accounts).toHaveLength(1);
      expect(result.accounts[0].debit).toBe(0);
      expect(result.accounts[0].credit).toBe(0);
      expect(result.totalDebit).toBe(0);
      expect(result.totalCredit).toBe(0);
      expect(result.isBalanced).toBe(true);
    });

    it('should include POSTED and REVERSED journal entries', async () => {
      const asOfDate = new Date('2026-02-01');

      accountRepository.createQueryBuilder.mockReturnValue(qb);
      qb.getMany.mockResolvedValue([
        { id: '1', code: '1000', name: 'Cash', type: AccountType.ASSET, isActive: true },
      ]);
      queryHelper.queryTransactionTotals.mockResolvedValue(new Map());

      await service.generateTrialBalance(asOfDate);

      expect(queryHelper.queryTransactionTotals).toHaveBeenCalledWith(
        ['1'],
        { type: 'asOf', date: asOfDate },
        [JournalEntryStatus.POSTED, JournalEntryStatus.REVERSED],
      );
    });

    it('should throw BadRequestException when asOfDate is in the future', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      futureDate.setHours(12, 0, 0, 0);

      await expect(service.generateTrialBalance(futureDate)).rejects.toThrow(
        'Trial Balance cannot be generated for future dates',
      );
    });

    it('should allow asOfDate for today', async () => {
      accountRepository.createQueryBuilder.mockReturnValue(qb);
      qb.getMany.mockResolvedValue([
        { id: '1', code: '1000', name: 'Cash', type: AccountType.ASSET, isActive: true },
      ]);
      queryHelper.queryTransactionTotals.mockResolvedValue(new Map());

      const result = await service.generateTrialBalance(new Date());

      expect(result).toBeDefined();
      expect(result.isBalanced).toBe(true);
    });
  });

  describe('exportTrialBalanceToExcel', () => {
    it('should generate Excel buffer for trial balance report', async () => {
      const mockTrialBalance = {
        accounts: [
          {
            accountCode: '1000',
            accountName: 'Cash',
            accountType: 'ASSET',
            debit: 5000,
            credit: 0,
          },
          {
            accountCode: '2000',
            accountName: 'Accounts Payable',
            accountType: 'LIABILITY',
            debit: 0,
            credit: 3000,
          },
          {
            accountCode: '3000',
            accountName: 'Common Stock',
            accountType: 'EQUITY',
            debit: 0,
            credit: 2000,
          },
        ],
        totalDebit: 5000,
        totalCredit: 5000,
        isBalanced: true,
      };

      const buffer = await service.exportTrialBalanceToExcel(mockTrialBalance);

      expect(buffer).toBeDefined();
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
      expect(excelExportService.exportTrialBalanceToExcel).toHaveBeenCalledWith(
        mockTrialBalance,
        'trial-balance',
      );
    });

    it('should include balanced status in export', async () => {
      const mockUnbalancedTrialBalance = {
        accounts: [
          {
            accountCode: '1000',
            accountName: 'Cash',
            accountType: 'ASSET',
            debit: 5000,
            credit: 0,
          },
        ],
        totalDebit: 5000,
        totalCredit: 3000,
        isBalanced: false,
      };

      const buffer = await service.exportTrialBalanceToExcel(
        mockUnbalancedTrialBalance,
      );

      expect(buffer).toBeDefined();
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
      expect(excelExportService.exportTrialBalanceToExcel).toHaveBeenCalledWith(
        mockUnbalancedTrialBalance,
        'trial-balance',
      );
    });
  });
});
