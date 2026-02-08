import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountingReportsService } from './accounting-reports.service';
import {
  ChartOfAccount,
  AccountType,
} from '../../../database/entities/chart-of-account.entity';
import { JournalEntry, JournalEntryStatus } from '../../../database/entities/journal-entry.entity';
import { JournalEntryLine } from '../../../database/entities/journal-entry-line.entity';

describe('AccountingReportsService', () => {
  let service: AccountingReportsService;
  let accountRepository: jest.Mocked<Repository<ChartOfAccount>>;
  let journalEntryRepository: jest.Mocked<Repository<JournalEntry>>;
  let journalEntryLineRepository: jest.Mocked<Repository<JournalEntryLine>>;

  const mockAccount: Partial<ChartOfAccount> = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    code: '1000',
    name: 'Cash',
    type: AccountType.ASSET,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockJournalEntry: Partial<JournalEntry> = {
    id: '223e4567-e89b-12d3-a456-426614174000',
    entryDate: new Date('2026-01-15'),
    referenceNumber: 'JE-2026-001',
    description: 'Test Entry',
    status: JournalEntryStatus.POSTED,
    fiscalPeriodId: '323e4567-e89b-12d3-a456-426614174000',
  };

  const mockQueryBuilder: any = {
    createQueryBuilder: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(),
    getMany: jest.fn(),
    getOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AccountingReportsService,
        {
          provide: getRepositoryToken(ChartOfAccount),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            createQueryBuilder: jest.fn(() => mockQueryBuilder),
          },
        },
        {
          provide: getRepositoryToken(JournalEntry),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            createQueryBuilder: jest.fn(() => mockQueryBuilder),
          },
        },
        {
          provide: getRepositoryToken(JournalEntryLine),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            createQueryBuilder: jest.fn(() => mockQueryBuilder),
          },
        },
      ],
    }).compile();

    service = module.get<AccountingReportsService>(AccountingReportsService);
    accountRepository = module.get(getRepositoryToken(ChartOfAccount));
    journalEntryRepository = module.get(getRepositoryToken(JournalEntry));
    journalEntryLineRepository = module.get(getRepositoryToken(JournalEntryLine));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateAccountBalance', () => {
    it('should calculate balance for an asset account correctly', async () => {
      const accountId = '123e4567-e89b-12d3-a456-426614174000';
      const asOfDate = new Date('2026-02-01');

      // Mock account lookup
      accountRepository.findOne.mockResolvedValue({
        ...mockAccount,
        type: AccountType.ASSET,
      } as ChartOfAccount);

      // Mock journal entry lines query
      const mockLines = [
        { debitAmount: 1000, creditAmount: 0 },
        { debitAmount: 500, creditAmount: 0 },
        { debitAmount: 0, creditAmount: 300 },
      ];

      mockQueryBuilder.getRawMany.mockResolvedValue([
        { totalDebit: '1500', totalCredit: '300' },
      ]);

      const balance = await service.calculateAccountBalance(accountId, asOfDate);

      // For ASSET: Balance = Debit - Credit = 1500 - 300 = 1200
      expect(balance).toBe(1200);
      expect(accountRepository.findOne).toHaveBeenCalledWith({
        where: { id: accountId, isActive: true },
      });
    });

    it('should calculate balance for a revenue account correctly', async () => {
      const accountId = '123e4567-e89b-12d3-a456-426614174000';
      const asOfDate = new Date('2026-02-01');

      // Mock account lookup
      accountRepository.findOne.mockResolvedValue({
        ...mockAccount,
        type: AccountType.REVENUE,
      } as ChartOfAccount);

      // Mock journal entry lines query
      mockQueryBuilder.getRawMany.mockResolvedValue([
        { totalDebit: '200', totalCredit: '1500' },
      ]);

      const balance = await service.calculateAccountBalance(accountId, asOfDate);

      // For REVENUE: Balance = Credit - Debit = 1500 - 200 = 1300
      expect(balance).toBe(1300);
    });

    it('should calculate balance for a liability account correctly', async () => {
      const accountId = '123e4567-e89b-12d3-a456-426614174000';
      const asOfDate = new Date('2026-02-01');

      accountRepository.findOne.mockResolvedValue({
        ...mockAccount,
        type: AccountType.LIABILITY,
      } as ChartOfAccount);

      mockQueryBuilder.getRawMany.mockResolvedValue([
        { totalDebit: '500', totalCredit: '2000' },
      ]);

      const balance = await service.calculateAccountBalance(accountId, asOfDate);

      // For LIABILITY: Balance = Credit - Debit = 2000 - 500 = 1500
      expect(balance).toBe(1500);
    });

    it('should return 0 when account has no transactions', async () => {
      const accountId = '123e4567-e89b-12d3-a456-426614174000';
      const asOfDate = new Date('2026-02-01');

      accountRepository.findOne.mockResolvedValue({
        ...mockAccount,
        type: AccountType.ASSET,
      } as ChartOfAccount);

      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      const balance = await service.calculateAccountBalance(accountId, asOfDate);

      expect(balance).toBe(0);
    });

    it('should throw NotFoundException when account does not exist', async () => {
      const accountId = '123e4567-e89b-12d3-a456-426614174000';
      const asOfDate = new Date('2026-02-01');

      accountRepository.findOne.mockResolvedValue(null);

      await expect(
        service.calculateAccountBalance(accountId, asOfDate),
      ).rejects.toThrow('Account with ID');
    });

    it('should only include POSTED journal entries', async () => {
      const accountId = '123e4567-e89b-12d3-a456-426614174000';
      const asOfDate = new Date('2026-02-01');

      accountRepository.findOne.mockResolvedValue({
        ...mockAccount,
        type: AccountType.ASSET,
      } as ChartOfAccount);

      mockQueryBuilder.getRawMany.mockResolvedValue([
        { totalDebit: '1000', totalCredit: '500' },
      ]);

      await service.calculateAccountBalance(accountId, asOfDate);

      // Verify that query builder filters by POSTED status
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'je.status = :status',
        { status: JournalEntryStatus.POSTED },
      );
    });
  });

  describe('calculateAccountBalances', () => {
    it('should calculate balances for multiple accounts', async () => {
      const accountIds = [
        '123e4567-e89b-12d3-a456-426614174000',
        '223e4567-e89b-12d3-a456-426614174000',
      ];
      const asOfDate = new Date('2026-02-01');

      // Mock accounts lookup
      accountRepository.find.mockResolvedValue([
        { ...mockAccount, id: accountIds[0], type: AccountType.ASSET } as ChartOfAccount,
        { ...mockAccount, id: accountIds[1], type: AccountType.REVENUE } as ChartOfAccount,
      ]);

      // Mock batch query for balances
      mockQueryBuilder.getRawMany.mockResolvedValue([
        {
          accountId: accountIds[0],
          totalDebit: '1000',
          totalCredit: '200',
        },
        {
          accountId: accountIds[1],
          totalDebit: '100',
          totalCredit: '800',
        },
      ]);

      const balances = await service.calculateAccountBalances(accountIds, asOfDate);

      expect(balances).toHaveProperty(accountIds[0]);
      expect(balances).toHaveProperty(accountIds[1]);
      // ASSET: 1000 - 200 = 800
      expect(balances[accountIds[0]]).toBe(800);
      // REVENUE: 800 - 100 = 700
      expect(balances[accountIds[1]]).toBe(700);
    });

    it('should return empty object when no account IDs provided', async () => {
      const balances = await service.calculateAccountBalances([], new Date());
      expect(balances).toEqual({});
    });

    it('should handle accounts with no transactions', async () => {
      const accountIds = ['123e4567-e89b-12d3-a456-426614174000'];
      const asOfDate = new Date('2026-02-01');

      accountRepository.find.mockResolvedValue([
        { ...mockAccount, id: accountIds[0], type: AccountType.ASSET } as ChartOfAccount,
      ]);

      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      const balances = await service.calculateAccountBalances(accountIds, asOfDate);

      expect(balances[accountIds[0]]).toBe(0);
    });
  });

  describe('getAccountsByType', () => {
    it('should filter accounts by a single type', async () => {
      const accountType = AccountType.ASSET;

      const mockAccounts = [
        { ...mockAccount, id: '1', type: AccountType.ASSET },
        { ...mockAccount, id: '2', type: AccountType.ASSET },
      ];

      accountRepository.find.mockResolvedValue(mockAccounts as ChartOfAccount[]);

      const accounts = await service.getAccountsByType([accountType]);

      expect(accounts).toHaveLength(2);
      expect(accountRepository.find).toHaveBeenCalledWith({
        where: { type: accountType, isActive: true },
        order: { code: 'ASC' },
      });
    });

    it('should filter accounts by multiple types', async () => {
      const accountTypes = [AccountType.ASSET, AccountType.LIABILITY];

      const mockAccounts = [
        { ...mockAccount, id: '1', type: AccountType.ASSET },
        { ...mockAccount, id: '2', type: AccountType.LIABILITY },
      ];

      accountRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue(mockAccounts);

      const accounts = await service.getAccountsByType(accountTypes);

      expect(accounts).toHaveLength(2);
      expect(mockQueryBuilder.where).toHaveBeenCalled();
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'account.isActive = :isActive',
        { isActive: true },
      );
    });

    it('should return empty array when no types provided', async () => {
      const accounts = await service.getAccountsByType([]);
      expect(accounts).toEqual([]);
    });

    it('should only return active accounts', async () => {
      const accountType = AccountType.ASSET;

      await service.getAccountsByType([accountType]);

      expect(accountRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
        }),
      );
    });
  });

  describe('getAccountsWithBalances', () => {
    it('should return accounts with their calculated balances', async () => {
      const accountTypes = [AccountType.ASSET];
      const asOfDate = new Date('2026-02-01');

      const mockAccounts = [
        { ...mockAccount, id: '123e4567-e89b-12d3-a456-426614174000', type: AccountType.ASSET },
        { ...mockAccount, id: '223e4567-e89b-12d3-a456-426614174000', type: AccountType.ASSET },
      ];

      accountRepository.find.mockResolvedValue(mockAccounts as ChartOfAccount[]);

      mockQueryBuilder.getRawMany.mockResolvedValue([
        {
          accountId: '123e4567-e89b-12d3-a456-426614174000',
          totalDebit: '1000',
          totalCredit: '200',
        },
        {
          accountId: '223e4567-e89b-12d3-a456-426614174000',
          totalDebit: '500',
          totalCredit: '100',
        },
      ]);

      const result = await service.getAccountsWithBalances(accountTypes, asOfDate);

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('account');
      expect(result[0]).toHaveProperty('balance');
      expect(result[0].balance).toBe(800); // 1000 - 200
      expect(result[1].balance).toBe(400); // 500 - 100
    });

    it('should return empty array when no accounts match type', async () => {
      const accountTypes = [AccountType.ASSET];
      const asOfDate = new Date('2026-02-01');

      accountRepository.find.mockResolvedValue([]);

      const result = await service.getAccountsWithBalances(accountTypes, asOfDate);

      expect(result).toEqual([]);
    });

    it('should handle accounts with zero balances', async () => {
      const accountTypes = [AccountType.ASSET];
      const asOfDate = new Date('2026-02-01');

      const mockAccounts = [
        { ...mockAccount, id: '123e4567-e89b-12d3-a456-426614174000', type: AccountType.ASSET },
      ];

      accountRepository.find.mockResolvedValue(mockAccounts as ChartOfAccount[]);
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      const result = await service.getAccountsWithBalances(accountTypes, asOfDate);

      expect(result).toHaveLength(1);
      expect(result[0].balance).toBe(0);
    });
  });
});
