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
  ACCOUNT_IDS,
  AP_ACCOUNT,
  CASH_ACCOUNT,
  REVENUE_ACCOUNT,
  createMockExcelExportService,
  createMockQueryHelper,
  createMockQueryBuilder,
  createMockRepositories,
} from './__fixtures__/accounting-reports.fixtures';
import { AccountingExcelExportService } from './accounting-reports.excel-export.service';
import { AccountingReportsQueryHelper } from './accounting-reports.query-helper';

describe('AccountingReportsService - Account Balances', () => {
  let service: AccountingReportsService;
  let accountRepository: any;
  let queryHelper: ReturnType<typeof createMockQueryHelper>;
  let qb: ReturnType<typeof createMockQueryBuilder>;

  beforeEach(async () => {
    qb = createMockQueryBuilder();
    const { accountRepo, journalRepo, lineRepo } = createMockRepositories(qb);
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
          useValue: createMockExcelExportService(),
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

  describe('calculateAccountBalance', () => {
    it('should calculate balance for an asset account correctly', async () => {
      const accountId = ACCOUNT_IDS.cash;
      const asOfDate = new Date('2026-02-01');

      accountRepository.findOne.mockResolvedValue(CASH_ACCOUNT as ChartOfAccount);
      qb.getRawMany.mockResolvedValue([{ totalDebit: '1500', totalCredit: '300' }]);

      const balance = await service.calculateAccountBalance(accountId, asOfDate);

      expect(balance).toBe(1200);
      expect(accountRepository.findOne).toHaveBeenCalledWith({
        where: { id: accountId, isActive: true },
      });
    });

    it('should calculate balance for a revenue account correctly', async () => {
      const accountId = ACCOUNT_IDS.revenue;
      const asOfDate = new Date('2026-02-01');

      accountRepository.findOne.mockResolvedValue(REVENUE_ACCOUNT as ChartOfAccount);
      qb.getRawMany.mockResolvedValue([{ totalDebit: '200', totalCredit: '1500' }]);

      const balance = await service.calculateAccountBalance(accountId, asOfDate);

      expect(balance).toBe(1300);
    });

    it('should calculate balance for a liability account correctly', async () => {
      const accountId = ACCOUNT_IDS.ap;
      const asOfDate = new Date('2026-02-01');

      accountRepository.findOne.mockResolvedValue(AP_ACCOUNT as ChartOfAccount);
      qb.getRawMany.mockResolvedValue([{ totalDebit: '500', totalCredit: '2000' }]);

      const balance = await service.calculateAccountBalance(accountId, asOfDate);

      expect(balance).toBe(1500);
    });

    it('should return 0 when account has no transactions', async () => {
      accountRepository.findOne.mockResolvedValue(CASH_ACCOUNT as ChartOfAccount);
      qb.getRawMany.mockResolvedValue([]);

      const balance = await service.calculateAccountBalance(
        ACCOUNT_IDS.cash,
        new Date('2026-02-01'),
      );

      expect(balance).toBe(0);
    });

    it('should throw NotFoundException when account does not exist', async () => {
      accountRepository.findOne.mockResolvedValue(null);

      await expect(
        service.calculateAccountBalance(ACCOUNT_IDS.cash, new Date('2026-02-01')),
      ).rejects.toThrow('Account with ID');
    });

    it('should include POSTED and REVERSED journal entries', async () => {
      accountRepository.findOne.mockResolvedValue(CASH_ACCOUNT as ChartOfAccount);
      qb.getRawMany.mockResolvedValue([{ totalDebit: '1000', totalCredit: '500' }]);

      await service.calculateAccountBalance(ACCOUNT_IDS.cash, new Date('2026-02-01'));

      expect(qb.andWhere).toHaveBeenCalledWith('je.status IN (:...statuses)', {
        statuses: [JournalEntryStatus.POSTED, JournalEntryStatus.REVERSED],
      });
    });
  });

  describe('calculateAccountBalances', () => {
    it('should calculate balances for multiple accounts', async () => {
      const accountIds = [ACCOUNT_IDS.cash, ACCOUNT_IDS.revenue];
      const asOfDate = new Date('2026-02-01');

      accountRepository.find.mockResolvedValue([
        CASH_ACCOUNT as ChartOfAccount,
        REVENUE_ACCOUNT as ChartOfAccount,
      ]);
      queryHelper.queryTransactionTotals.mockResolvedValue(
        new Map([
          [accountIds[0], { totalDebit: 1000, totalCredit: 200 }],
          [accountIds[1], { totalDebit: 100, totalCredit: 800 }],
        ]),
      );

      const balances = await service.calculateAccountBalances(accountIds, asOfDate);

      expect(balances).toHaveProperty(accountIds[0]);
      expect(balances).toHaveProperty(accountIds[1]);
      expect(balances[accountIds[0]]).toBe(800);
      expect(balances[accountIds[1]]).toBe(700);
      expect(queryHelper.queryTransactionTotals).toHaveBeenCalledWith(
        accountIds,
        { type: 'asOf', date: asOfDate },
        [JournalEntryStatus.POSTED, JournalEntryStatus.REVERSED],
      );
    });

    it('should return empty object when no account IDs provided', async () => {
      const balances = await service.calculateAccountBalances([], new Date());
      expect(balances).toEqual({});
    });

    it('should handle accounts with no transactions', async () => {
      const accountIds = [ACCOUNT_IDS.cash];

      accountRepository.find.mockResolvedValue([CASH_ACCOUNT as ChartOfAccount]);
      queryHelper.queryTransactionTotals.mockResolvedValue(new Map());

      const balances = await service.calculateAccountBalances(
        accountIds,
        new Date('2026-02-01'),
      );

      expect(balances[accountIds[0]]).toBe(0);
    });
  });

  describe('getAccountsByType', () => {
    it('should filter accounts by a single type', async () => {
      const mockAccounts = [
        { ...CASH_ACCOUNT, id: '1', type: AccountType.ASSET },
        { ...CASH_ACCOUNT, id: '2', type: AccountType.ASSET },
      ];

      accountRepository.find.mockResolvedValue(mockAccounts as ChartOfAccount[]);

      const accounts = await service.getAccountsByType([AccountType.ASSET]);

      expect(accounts).toHaveLength(2);
      expect(accountRepository.find).toHaveBeenCalledWith({
        where: { type: AccountType.ASSET, isActive: true },
        order: { code: 'ASC' },
      });
    });

    it('should filter accounts by multiple types', async () => {
      const mockAccounts = [
        { ...CASH_ACCOUNT, id: '1', type: AccountType.ASSET },
        { ...AP_ACCOUNT, id: '2', type: AccountType.LIABILITY },
      ];

      accountRepository.createQueryBuilder.mockReturnValue(qb);
      qb.getMany.mockResolvedValue(mockAccounts);

      const accounts = await service.getAccountsByType([
        AccountType.ASSET,
        AccountType.LIABILITY,
      ]);

      expect(accounts).toHaveLength(2);
      expect(qb.where).toHaveBeenCalled();
      expect(qb.andWhere).toHaveBeenCalledWith('account.isActive = :isActive', {
        isActive: true,
      });
    });

    it('should return empty array when no types provided', async () => {
      const accounts = await service.getAccountsByType([]);
      expect(accounts).toEqual([]);
    });

    it('should only return active accounts', async () => {
      await service.getAccountsByType([AccountType.ASSET]);

      expect(accountRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
        }),
      );
    });
  });

  describe('getAccountsWithBalances', () => {
    it('should return accounts with their calculated balances', async () => {
      const mockAccounts = [
        { ...CASH_ACCOUNT, id: ACCOUNT_IDS.cash, type: AccountType.ASSET },
        { ...CASH_ACCOUNT, id: '223e4567-e89b-12d3-a456-426614174000', type: AccountType.ASSET },
      ];

      accountRepository.find.mockResolvedValue(mockAccounts as ChartOfAccount[]);
      queryHelper.queryTransactionTotals.mockResolvedValue(
        new Map([
          [ACCOUNT_IDS.cash, { totalDebit: 1000, totalCredit: 200 }],
          [
            '223e4567-e89b-12d3-a456-426614174000',
            { totalDebit: 500, totalCredit: 100 },
          ],
        ]),
      );

      const result = await service.getAccountsWithBalances(
        [AccountType.ASSET],
        new Date('2026-02-01'),
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('account');
      expect(result[0]).toHaveProperty('balance');
      expect(result[0].balance).toBe(800);
      expect(result[1].balance).toBe(400);
    });

    it('should return empty array when no accounts match type', async () => {
      accountRepository.find.mockResolvedValue([]);

      const result = await service.getAccountsWithBalances(
        [AccountType.ASSET],
        new Date('2026-02-01'),
      );

      expect(result).toEqual([]);
    });

    it('should handle accounts with zero balances', async () => {
      accountRepository.find.mockResolvedValue([CASH_ACCOUNT as ChartOfAccount]);
      qb.getRawMany.mockResolvedValue([]);

      const result = await service.getAccountsWithBalances(
        [AccountType.ASSET],
        new Date('2026-02-01'),
      );

      expect(result).toHaveLength(1);
      expect(result[0].balance).toBe(0);
    });
  });
});
