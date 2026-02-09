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
    addOrderBy: jest.fn().mockReturnThis(),
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

  describe('generateTrialBalance', () => {
    it('should generate a balanced trial balance report', async () => {
      const asOfDate = new Date('2026-02-01');

      // Mock all account types
      const mockAccounts = [
        { id: '1', code: '1000', name: 'Cash', type: AccountType.ASSET, isActive: true },
        { id: '2', code: '2000', name: 'Accounts Payable', type: AccountType.LIABILITY, isActive: true },
        { id: '3', code: '3000', name: 'Common Stock', type: AccountType.EQUITY, isActive: true },
        { id: '4', code: '4000', name: 'Sales Revenue', type: AccountType.REVENUE, isActive: true },
        { id: '5', code: '5000', name: 'Rent Expense', type: AccountType.EXPENSE, isActive: true },
      ];

      accountRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue(mockAccounts);

      // Mock transaction data - balanced scenario
      // Cash: Debit 5000, Credit 1000 = Net Debit 4000
      // A/P: Debit 500, Credit 1500 = Net Credit 1000
      // Equity: Debit 0, Credit 2000 = Net Credit 2000
      // Revenue: Debit 200, Credit 1700 = Net Credit 1500
      // Expense: Debit 500, Credit 0 = Net Debit 500
      // Total Debits: 4000 + 500 = 4500
      // Total Credits: 1000 + 2000 + 1500 = 4500
      mockQueryBuilder.getRawMany.mockResolvedValue([
        { accountId: '1', totalDebit: '5000', totalCredit: '1000' },
        { accountId: '2', totalDebit: '500', totalCredit: '1500' },
        { accountId: '3', totalDebit: '0', totalCredit: '2000' },
        { accountId: '4', totalDebit: '200', totalCredit: '1700' },
        { accountId: '5', totalDebit: '500', totalCredit: '0' },
      ]);

      const result = await service.generateTrialBalance(asOfDate);

      expect(result).toBeDefined();
      expect(result.accounts).toHaveLength(5);
      expect(result.totalDebit).toBe(4500);
      expect(result.totalCredit).toBe(4500);
      expect(result.isBalanced).toBe(true);

      // Verify accounts are sorted by account code
      expect(result.accounts[0].accountCode).toBe('1000');
      expect(result.accounts[1].accountCode).toBe('2000');

      // Verify debit/credit columns
      // Cash (Asset) should show debit
      expect(result.accounts[0].debit).toBe(4000);
      expect(result.accounts[0].credit).toBe(0);

      // A/P (Liability) should show credit
      expect(result.accounts[1].debit).toBe(0);
      expect(result.accounts[1].credit).toBe(1000);
    });

    it('should detect unbalanced trial balance', async () => {
      const asOfDate = new Date('2026-02-01');

      const mockAccounts = [
        { id: '1', code: '1000', name: 'Cash', type: AccountType.ASSET, isActive: true },
        { id: '2', code: '2000', name: 'Accounts Payable', type: AccountType.LIABILITY, isActive: true },
      ];

      accountRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue(mockAccounts);

      // Unbalanced data
      // Cash: Net Debit 1000
      // A/P: Net Credit 500
      // Total Debits: 1000, Total Credits: 500 (UNBALANCED)
      mockQueryBuilder.getRawMany.mockResolvedValue([
        { accountId: '1', totalDebit: '1000', totalCredit: '0' },
        { accountId: '2', totalDebit: '0', totalCredit: '500' },
      ]);

      const result = await service.generateTrialBalance(asOfDate);

      expect(result.totalDebit).toBe(1000);
      expect(result.totalCredit).toBe(500);
      expect(result.isBalanced).toBe(false);
    });

    it('should exclude inactive accounts by default', async () => {
      const asOfDate = new Date('2026-02-01');

      const mockAccounts = [
        { id: '1', code: '1000', name: 'Cash', type: AccountType.ASSET, isActive: true },
      ];

      accountRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue(mockAccounts);

      mockQueryBuilder.getRawMany.mockResolvedValue([
        { accountId: '1', totalDebit: '1000', totalCredit: '1000' },
      ]);

      await service.generateTrialBalance(asOfDate);

      // Verify that query filters by isActive = true
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'account.isActive = :isActive',
        { isActive: true },
      );
    });

    it('should include inactive accounts when requested', async () => {
      const asOfDate = new Date('2026-02-01');

      const mockAccounts = [
        { id: '1', code: '1000', name: 'Cash', type: AccountType.ASSET, isActive: true },
        { id: '2', code: '1010', name: 'Old Account', type: AccountType.ASSET, isActive: false },
      ];

      accountRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue(mockAccounts);

      mockQueryBuilder.getRawMany.mockResolvedValue([
        { accountId: '1', totalDebit: '1000', totalCredit: '500' },
        { accountId: '2', totalDebit: '200', totalCredit: '200' },
      ]);

      const result = await service.generateTrialBalance(asOfDate, true);

      expect(result.accounts).toHaveLength(2);
      // Should NOT filter by isActive when includeInactive = true
      expect(mockQueryBuilder.andWhere).not.toHaveBeenCalledWith(
        'account.isActive = :isActive',
        { isActive: true },
      );
    });

    it('should handle accounts with zero balances', async () => {
      const asOfDate = new Date('2026-02-01');

      const mockAccounts = [
        { id: '1', code: '1000', name: 'Cash', type: AccountType.ASSET, isActive: true },
        { id: '2', code: '2000', name: 'Revenue', type: AccountType.REVENUE, isActive: true },
      ];

      accountRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue(mockAccounts);

      // Account with balanced debits/credits = zero balance
      mockQueryBuilder.getRawMany.mockResolvedValue([
        { accountId: '1', totalDebit: '1000', totalCredit: '1000' },
        { accountId: '2', totalDebit: '500', totalCredit: '500' },
      ]);

      const result = await service.generateTrialBalance(asOfDate);

      expect(result.accounts).toHaveLength(2);
      // All accounts should show 0 in both debit and credit columns
      expect(result.accounts[0].debit).toBe(0);
      expect(result.accounts[0].credit).toBe(0);
      expect(result.accounts[1].debit).toBe(0);
      expect(result.accounts[1].credit).toBe(0);
      expect(result.totalDebit).toBe(0);
      expect(result.totalCredit).toBe(0);
      expect(result.isBalanced).toBe(true);
    });

    it('should handle empty trial balance with no transactions', async () => {
      const asOfDate = new Date('2026-02-01');

      const mockAccounts = [
        { id: '1', code: '1000', name: 'Cash', type: AccountType.ASSET, isActive: true },
      ];

      accountRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue(mockAccounts);
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      const result = await service.generateTrialBalance(asOfDate);

      expect(result.accounts).toHaveLength(1);
      expect(result.accounts[0].debit).toBe(0);
      expect(result.accounts[0].credit).toBe(0);
      expect(result.totalDebit).toBe(0);
      expect(result.totalCredit).toBe(0);
      expect(result.isBalanced).toBe(true);
    });

    it('should only include POSTED journal entries', async () => {
      const asOfDate = new Date('2026-02-01');

      accountRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue([
        { id: '1', code: '1000', name: 'Cash', type: AccountType.ASSET, isActive: true },
      ]);
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      await service.generateTrialBalance(asOfDate);

      // Verify that journal entries query filters by POSTED status
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'je.status = :status',
        { status: JournalEntryStatus.POSTED },
      );
    });

    it('should throw BadRequestException when asOfDate is in the future', async () => {
      // Create a future date (tomorrow)
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      futureDate.setHours(12, 0, 0, 0); // Set to noon tomorrow

      await expect(
        service.generateTrialBalance(futureDate),
      ).rejects.toThrow('Trial Balance cannot be generated for future dates');
    });

    it('should allow asOfDate for today', async () => {
      // Use current date/time (today)
      const today = new Date();

      accountRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue([
        { id: '1', code: '1000', name: 'Cash', type: AccountType.ASSET, isActive: true },
      ]);
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      // Should not throw
      const result = await service.generateTrialBalance(today);

      expect(result).toBeDefined();
      expect(result.isBalanced).toBe(true);
    });
  });

  describe('generateBalanceSheet', () => {
    it('should generate a balanced balance sheet with all sections', async () => {
      const asOfDate = new Date('2026-02-01');

      // Mock accounts for all categories
      const mockAccounts = [
        // Current Assets (1000-1499)
        { id: '1', code: '1000', name: 'Cash', type: AccountType.ASSET, isActive: true },
        { id: '2', code: '1200', name: 'Accounts Receivable', type: AccountType.ASSET, isActive: true },
        // Fixed Assets (1500-1999)
        { id: '3', code: '1500', name: 'Equipment', type: AccountType.ASSET, isActive: true },
        { id: '4', code: '1600', name: 'Buildings', type: AccountType.ASSET, isActive: true },
        // Current Liabilities (2000-2499)
        { id: '5', code: '2000', name: 'Accounts Payable', type: AccountType.LIABILITY, isActive: true },
        { id: '6', code: '2100', name: 'Short-term Debt', type: AccountType.LIABILITY, isActive: true },
        // Long-term Liabilities (2500-2999)
        { id: '7', code: '2500', name: 'Long-term Debt', type: AccountType.LIABILITY, isActive: true },
        { id: '8', code: '2600', name: 'Bonds Payable', type: AccountType.LIABILITY, isActive: true },
        // Equity (3000-3999)
        { id: '9', code: '3000', name: 'Common Stock', type: AccountType.EQUITY, isActive: true },
        { id: '10', code: '3100', name: 'Retained Earnings', type: AccountType.EQUITY, isActive: true },
      ];

      accountRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue(mockAccounts);

      // Mock transaction data for balanced balance sheet
      // Current Assets: Cash 5000 + AR 3000 = 8000
      // Fixed Assets: Equipment 10000 + Buildings 20000 = 30000
      // Total Assets: 38000
      // Current Liabilities: AP 2000 + ST Debt 1000 = 3000
      // Long-term Liabilities: LT Debt 10000 + Bonds 5000 = 15000
      // Total Liabilities: 18000
      // Equity: Stock 15000 + RE 5000 = 20000
      // Total Liabilities + Equity: 38000 (BALANCED)
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

      // Verify Assets section
      expect(result.assets.current).toHaveLength(2);
      expect(result.assets.fixed).toHaveLength(2);
      expect(result.assets.totalCurrent).toBe(8000);
      expect(result.assets.totalFixed).toBe(30000);
      expect(result.assets.total).toBe(38000);

      // Verify Liabilities section
      expect(result.liabilities.current).toHaveLength(2);
      expect(result.liabilities.longTerm).toHaveLength(2);
      expect(result.liabilities.totalCurrent).toBe(3000);
      expect(result.liabilities.totalLongTerm).toBe(15000);
      expect(result.liabilities.total).toBe(18000);

      // Verify Equity section
      expect(result.equity.accounts).toHaveLength(2);
      expect(result.equity.total).toBe(20000);

      // Verify balance sheet equation: Assets = Liabilities + Equity
      expect(result.isBalanced).toBe(true);
      expect(result.assets.total).toBe(result.liabilities.total + result.equity.total);
    });

    it('should detect unbalanced balance sheet', async () => {
      const asOfDate = new Date('2026-02-01');

      const mockAccounts = [
        { id: '1', code: '1000', name: 'Cash', type: AccountType.ASSET, isActive: true },
        { id: '2', code: '2000', name: 'Accounts Payable', type: AccountType.LIABILITY, isActive: true },
      ];

      accountRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue(mockAccounts);

      // Unbalanced data: Assets 5000, Liabilities 3000, Equity 0 = UNBALANCED
      mockQueryBuilder.getRawMany.mockResolvedValue([
        { accountId: '1', totalDebit: '5000', totalCredit: '0' },
        { accountId: '2', totalDebit: '0', totalCredit: '3000' },
      ]);

      const result = await service.generateBalanceSheet(asOfDate);

      expect(result.isBalanced).toBe(false);
      expect(result.assets.total).not.toBe(result.liabilities.total + result.equity.total);
    });

    it('should validate balance sheet equation with tolerance', async () => {
      const asOfDate = new Date('2026-02-01');

      const mockAccounts = [
        { id: '1', code: '1000', name: 'Cash', type: AccountType.ASSET, isActive: true },
        { id: '2', code: '2000', name: 'Accounts Payable', type: AccountType.LIABILITY, isActive: true },
        { id: '3', code: '3000', name: 'Common Stock', type: AccountType.EQUITY, isActive: true },
      ];

      accountRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue(mockAccounts);

      // Small rounding difference (within 0.01 tolerance): Assets 1000.00, Liabilities + Equity 1000.005
      mockQueryBuilder.getRawMany.mockResolvedValue([
        { accountId: '1', totalDebit: '1000.00', totalCredit: '0' },
        { accountId: '2', totalDebit: '0', totalCredit: '500.00' },
        { accountId: '3', totalDebit: '0', totalCredit: '500.005' },
      ]);

      const result = await service.generateBalanceSheet(asOfDate);

      // Should still be balanced due to 0.01 tolerance for rounding
      expect(result.isBalanced).toBe(true);
    });

    it('should exclude inactive accounts by default', async () => {
      const asOfDate = new Date('2026-02-01');

      const mockAccounts = [
        { id: '1', code: '1000', name: 'Cash', type: AccountType.ASSET, isActive: true },
      ];

      accountRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue(mockAccounts);

      mockQueryBuilder.getRawMany.mockResolvedValue([
        { accountId: '1', totalDebit: '1000', totalCredit: '0' },
      ]);

      await service.generateBalanceSheet(asOfDate);

      // Verify that query filters by isActive = true
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'account.isActive = :isActive',
        { isActive: true },
      );
    });

    it('should include inactive accounts when requested', async () => {
      const asOfDate = new Date('2026-02-01');

      const mockAccounts = [
        { id: '1', code: '1000', name: 'Cash', type: AccountType.ASSET, isActive: true },
        { id: '2', code: '1100', name: 'Old Asset', type: AccountType.ASSET, isActive: false },
      ];

      accountRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue(mockAccounts);

      mockQueryBuilder.getRawMany.mockResolvedValue([
        { accountId: '1', totalDebit: '1000', totalCredit: '0' },
        { accountId: '2', totalDebit: '500', totalCredit: '0' },
      ]);

      const result = await service.generateBalanceSheet(asOfDate, true);

      expect(result.assets.current.length).toBeGreaterThanOrEqual(1);
    });

    it('should classify assets correctly by account code', async () => {
      const asOfDate = new Date('2026-02-01');

      const mockAccounts = [
        // Current Assets: 1000-1499
        { id: '1', code: '1000', name: 'Cash', type: AccountType.ASSET, isActive: true },
        { id: '2', code: '1499', name: 'Inventory', type: AccountType.ASSET, isActive: true },
        // Fixed Assets: 1500-1999
        { id: '3', code: '1500', name: 'Equipment', type: AccountType.ASSET, isActive: true },
        { id: '4', code: '1999', name: 'Land', type: AccountType.ASSET, isActive: true },
      ];

      accountRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue(mockAccounts);

      mockQueryBuilder.getRawMany.mockResolvedValue([
        { accountId: '1', totalDebit: '1000', totalCredit: '0' },
        { accountId: '2', totalDebit: '2000', totalCredit: '0' },
        { accountId: '3', totalDebit: '5000', totalCredit: '0' },
        { accountId: '4', totalDebit: '10000', totalCredit: '0' },
      ]);

      const result = await service.generateBalanceSheet(asOfDate);

      expect(result.assets.current).toHaveLength(2);
      expect(result.assets.fixed).toHaveLength(2);
      expect(result.assets.totalCurrent).toBe(3000);
      expect(result.assets.totalFixed).toBe(15000);
    });

    it('should classify liabilities correctly by account code', async () => {
      const asOfDate = new Date('2026-02-01');

      const mockAccounts = [
        // Current Liabilities: 2000-2499
        { id: '1', code: '2000', name: 'Accounts Payable', type: AccountType.LIABILITY, isActive: true },
        { id: '2', code: '2499', name: 'Accrued Expenses', type: AccountType.LIABILITY, isActive: true },
        // Long-term Liabilities: 2500-2999
        { id: '3', code: '2500', name: 'Long-term Debt', type: AccountType.LIABILITY, isActive: true },
        { id: '4', code: '2999', name: 'Deferred Revenue', type: AccountType.LIABILITY, isActive: true },
      ];

      accountRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue(mockAccounts);

      mockQueryBuilder.getRawMany.mockResolvedValue([
        { accountId: '1', totalDebit: '0', totalCredit: '1000' },
        { accountId: '2', totalDebit: '0', totalCredit: '500' },
        { accountId: '3', totalDebit: '0', totalCredit: '5000' },
        { accountId: '4', totalDebit: '0', totalCredit: '2000' },
      ]);

      const result = await service.generateBalanceSheet(asOfDate);

      expect(result.liabilities.current).toHaveLength(2);
      expect(result.liabilities.longTerm).toHaveLength(2);
      expect(result.liabilities.totalCurrent).toBe(1500);
      expect(result.liabilities.totalLongTerm).toBe(7000);
    });
  });

  describe('generateGeneralLedger', () => {
    it('should generate general ledger for an account with correct running balance', async () => {
      const accountId = '123e4567-e89b-12d3-a456-426614174000';
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      // Mock account lookup
      accountRepository.findOne.mockResolvedValue({
        id: accountId,
        code: '1000',
        name: 'Cash in Hand',
        type: AccountType.ASSET,
        isActive: true,
      } as ChartOfAccount);

      // Mock opening balance query (transactions before startDate)
      // Opening balance: Debit 50000, Credit 0 = Balance 50000
      mockQueryBuilder.getRawMany.mockResolvedValueOnce([
        { totalDebit: '50000', totalCredit: '0' },
      ]);

      // Mock transactions within date range with journal entry details
      mockQueryBuilder.getRawMany.mockResolvedValueOnce([
        {
          entryDate: new Date('2026-01-02'),
          referenceNumber: 'JE-001',
          description: 'Sales Payment',
          debitAmount: '1000',
          creditAmount: '0',
        },
        {
          entryDate: new Date('2026-01-03'),
          referenceNumber: 'JE-002',
          description: 'Vendor Payment',
          debitAmount: '0',
          creditAmount: '500',
        },
        {
          entryDate: new Date('2026-01-05'),
          referenceNumber: 'JE-003',
          description: 'Cash Sale',
          debitAmount: '2000',
          creditAmount: '0',
        },
      ]);

      const result = await service.generateGeneralLedger(accountId, startDate, endDate);

      expect(result).toBeDefined();
      expect(result.account.id).toBe(accountId);
      expect(result.account.code).toBe('1000');
      expect(result.account.name).toBe('Cash in Hand');
      expect(result.account.type).toBe('ASSET');

      // Opening balance for ASSET: Debit - Credit = 50000 - 0 = 50000
      expect(result.openingBalance).toBe(50000);

      // Verify transactions with running balance
      expect(result.transactions).toHaveLength(3);

      // Transaction 1: Opening 50000 + Debit 1000 = 51000
      expect(result.transactions[0].date).toEqual(new Date('2026-01-02'));
      expect(result.transactions[0].entryNumber).toBe('JE-001');
      expect(result.transactions[0].description).toBe('Sales Payment');
      expect(result.transactions[0].debit).toBe(1000);
      expect(result.transactions[0].credit).toBe(0);
      expect(result.transactions[0].balance).toBe(51000);

      // Transaction 2: Previous 51000 - Credit 500 = 50500
      expect(result.transactions[1].date).toEqual(new Date('2026-01-03'));
      expect(result.transactions[1].entryNumber).toBe('JE-002');
      expect(result.transactions[1].description).toBe('Vendor Payment');
      expect(result.transactions[1].debit).toBe(0);
      expect(result.transactions[1].credit).toBe(500);
      expect(result.transactions[1].balance).toBe(50500);

      // Transaction 3: Previous 50500 + Debit 2000 = 52500
      expect(result.transactions[2].date).toEqual(new Date('2026-01-05'));
      expect(result.transactions[2].entryNumber).toBe('JE-003');
      expect(result.transactions[2].description).toBe('Cash Sale');
      expect(result.transactions[2].debit).toBe(2000);
      expect(result.transactions[2].credit).toBe(0);
      expect(result.transactions[2].balance).toBe(52500);

      // Closing balance should match final running balance
      expect(result.closingBalance).toBe(52500);
    });

    it('should calculate running balance correctly for LIABILITY account', async () => {
      const accountId = '223e4567-e89b-12d3-a456-426614174000';
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      accountRepository.findOne.mockResolvedValue({
        id: accountId,
        code: '2000',
        name: 'Accounts Payable',
        type: AccountType.LIABILITY,
        isActive: true,
      } as ChartOfAccount);

      // Opening balance for LIABILITY: Credit 10000, Debit 0 = Balance 10000
      mockQueryBuilder.getRawMany.mockResolvedValueOnce([
        { totalDebit: '0', totalCredit: '10000' },
      ]);

      // Transactions
      mockQueryBuilder.getRawMany.mockResolvedValueOnce([
        {
          entryDate: new Date('2026-01-10'),
          referenceNumber: 'JE-010',
          description: 'Purchase on credit',
          debitAmount: '0',
          creditAmount: '2000',
        },
        {
          entryDate: new Date('2026-01-15'),
          referenceNumber: 'JE-015',
          description: 'Payment to supplier',
          debitAmount: '1500',
          creditAmount: '0',
        },
      ]);

      const result = await service.generateGeneralLedger(accountId, startDate, endDate);

      // Opening balance for LIABILITY: Credit - Debit = 10000 - 0 = 10000
      expect(result.openingBalance).toBe(10000);

      // For LIABILITY: balance increases with credit, decreases with debit
      // Transaction 1: 10000 + Credit 2000 = 12000
      expect(result.transactions[0].balance).toBe(12000);

      // Transaction 2: 12000 - Debit 1500 = 10500
      expect(result.transactions[1].balance).toBe(10500);

      // Closing balance
      expect(result.closingBalance).toBe(10500);
    });

    it('should calculate running balance correctly for REVENUE account', async () => {
      const accountId = '323e4567-e89b-12d3-a456-426614174000';
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      accountRepository.findOne.mockResolvedValue({
        id: accountId,
        code: '4000',
        name: 'Sales Revenue',
        type: AccountType.REVENUE,
        isActive: true,
      } as ChartOfAccount);

      // Opening balance: 0 (no prior transactions)
      mockQueryBuilder.getRawMany.mockResolvedValueOnce([]);

      // Transactions
      mockQueryBuilder.getRawMany.mockResolvedValueOnce([
        {
          entryDate: new Date('2026-01-05'),
          referenceNumber: 'JE-005',
          description: 'Product sales',
          debitAmount: '0',
          creditAmount: '5000',
        },
        {
          entryDate: new Date('2026-01-20'),
          referenceNumber: 'JE-020',
          description: 'Sales return',
          debitAmount: '500',
          creditAmount: '0',
        },
      ]);

      const result = await service.generateGeneralLedger(accountId, startDate, endDate);

      expect(result.openingBalance).toBe(0);

      // For REVENUE: balance increases with credit, decreases with debit
      // Transaction 1: 0 + Credit 5000 = 5000
      expect(result.transactions[0].balance).toBe(5000);

      // Transaction 2: 5000 - Debit 500 = 4500
      expect(result.transactions[1].balance).toBe(4500);

      expect(result.closingBalance).toBe(4500);
    });

    it('should handle account with no transactions', async () => {
      const accountId = '123e4567-e89b-12d3-a456-426614174000';
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      accountRepository.findOne.mockResolvedValue({
        id: accountId,
        code: '1000',
        name: 'Cash',
        type: AccountType.ASSET,
        isActive: true,
      } as ChartOfAccount);

      // No opening balance
      mockQueryBuilder.getRawMany.mockResolvedValueOnce([]);

      // No transactions
      mockQueryBuilder.getRawMany.mockResolvedValueOnce([]);

      const result = await service.generateGeneralLedger(accountId, startDate, endDate);

      expect(result.openingBalance).toBe(0);
      expect(result.transactions).toEqual([]);
      expect(result.closingBalance).toBe(0);
    });

    it('should throw NotFoundException when account does not exist', async () => {
      const accountId = '123e4567-e89b-12d3-a456-426614174000';
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      accountRepository.findOne.mockResolvedValue(null);

      await expect(
        service.generateGeneralLedger(accountId, startDate, endDate),
      ).rejects.toThrow('Account with ID');
    });

    it('should throw BadRequestException when startDate is after endDate', async () => {
      const accountId = '123e4567-e89b-12d3-a456-426614174000';
      const startDate = new Date('2026-02-01');
      const endDate = new Date('2026-01-01');

      await expect(
        service.generateGeneralLedger(accountId, startDate, endDate),
      ).rejects.toThrow('Start date must be before or equal to end date');
    });

    it('should throw BadRequestException when endDate is in the future', async () => {
      const accountId = '123e4567-e89b-12d3-a456-426614174000';
      const startDate = new Date('2026-01-01');
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      futureDate.setHours(12, 0, 0, 0);

      await expect(
        service.generateGeneralLedger(accountId, startDate, futureDate),
      ).rejects.toThrow('End date cannot be in the future');
    });

    it('should only include POSTED journal entries', async () => {
      const accountId = '123e4567-e89b-12d3-a456-426614174000';
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      accountRepository.findOne.mockResolvedValue({
        id: accountId,
        code: '1000',
        name: 'Cash',
        type: AccountType.ASSET,
        isActive: true,
      } as ChartOfAccount);

      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      await service.generateGeneralLedger(accountId, startDate, endDate);

      // Verify POSTED status is used in both queries
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'je.status = :status',
        { status: JournalEntryStatus.POSTED },
      );
    });

    it('should sort transactions by date and entry number', async () => {
      const accountId = '123e4567-e89b-12d3-a456-426614174000';
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      accountRepository.findOne.mockResolvedValue({
        id: accountId,
        code: '1000',
        name: 'Cash',
        type: AccountType.ASSET,
        isActive: true,
      } as ChartOfAccount);

      mockQueryBuilder.getRawMany.mockResolvedValueOnce([]);

      // Multiple transactions on the same date
      mockQueryBuilder.getRawMany.mockResolvedValueOnce([
        {
          entryDate: new Date('2026-01-05'),
          referenceNumber: 'JE-002',
          description: 'Second entry',
          debitAmount: '200',
          creditAmount: '0',
        },
        {
          entryDate: new Date('2026-01-05'),
          referenceNumber: 'JE-001',
          description: 'First entry',
          debitAmount: '100',
          creditAmount: '0',
        },
      ]);

      await service.generateGeneralLedger(accountId, startDate, endDate);

      // Verify ordering by date and entry number
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('je.entryDate', 'ASC');
      expect(mockQueryBuilder.addOrderBy).toHaveBeenCalledWith('je.referenceNumber', 'ASC');
    });
  });

  describe('generateProfitAndLoss', () => {
    it('should calculate profit and loss for a date range correctly', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      // Mock all income statement accounts
      const mockAccounts = [
        // Revenue accounts (4000-4999)
        { id: '1', code: '4000', name: 'Sales Revenue', type: AccountType.REVENUE, isActive: true },
        { id: '2', code: '4100', name: 'Service Revenue', type: AccountType.REVENUE, isActive: true },
        // COGS accounts (5000-5999)
        { id: '3', code: '5000', name: 'Cost of Goods Sold', type: AccountType.EXPENSE, isActive: true },
        { id: '4', code: '5100', name: 'Direct Labor', type: AccountType.EXPENSE, isActive: true },
        // Operating Expense accounts (6000+)
        { id: '5', code: '6000', name: 'Rent Expense', type: AccountType.EXPENSE, isActive: true },
        { id: '6', code: '6100', name: 'Utilities Expense', type: AccountType.EXPENSE, isActive: true },
      ];

      accountRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue(mockAccounts);

      // Mock transaction data
      // Revenue: Sales 100000 + Service 20000 = 120000
      // COGS: COGS 60000 + Labor 5000 = 65000
      // Gross Profit: 120000 - 65000 = 55000
      // Expenses: Rent 10000 + Utilities 5000 = 15000
      // Net Income: 55000 - 15000 = 40000
      mockQueryBuilder.getRawMany.mockResolvedValue([
        { accountId: '1', totalDebit: '0', totalCredit: '100000' },
        { accountId: '2', totalDebit: '0', totalCredit: '20000' },
        { accountId: '3', totalDebit: '60000', totalCredit: '0' },
        { accountId: '4', totalDebit: '5000', totalCredit: '0' },
        { accountId: '5', totalDebit: '10000', totalCredit: '0' },
        { accountId: '6', totalDebit: '5000', totalCredit: '0' },
      ]);

      const result = await service.generateProfitAndLoss(startDate, endDate);

      expect(result).toBeDefined();

      // Verify Revenue section
      expect(result.revenue.accounts).toHaveLength(2);
      expect(result.revenue.total).toBe(120000);

      // Verify COGS section
      expect(result.costOfGoodsSold.accounts).toHaveLength(2);
      expect(result.costOfGoodsSold.total).toBe(65000);

      // Verify Gross Profit
      expect(result.grossProfit).toBe(55000);

      // Verify Expenses section
      expect(result.expenses.accounts).toHaveLength(2);
      expect(result.expenses.total).toBe(15000);

      // Verify Net Income
      expect(result.netIncome).toBe(40000);
    });

    it('should handle negative net income (loss)', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      const mockAccounts = [
        { id: '1', code: '4000', name: 'Sales Revenue', type: AccountType.REVENUE, isActive: true },
        { id: '2', code: '5000', name: 'Cost of Goods Sold', type: AccountType.EXPENSE, isActive: true },
        { id: '3', code: '6000', name: 'Operating Expenses', type: AccountType.EXPENSE, isActive: true },
      ];

      accountRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue(mockAccounts);

      // Revenue: 50000
      // COGS: 30000
      // Gross Profit: 20000
      // Expenses: 40000
      // Net Income: 20000 - 40000 = -20000 (loss)
      mockQueryBuilder.getRawMany.mockResolvedValue([
        { accountId: '1', totalDebit: '0', totalCredit: '50000' },
        { accountId: '2', totalDebit: '30000', totalCredit: '0' },
        { accountId: '3', totalDebit: '40000', totalCredit: '0' },
      ]);

      const result = await service.generateProfitAndLoss(startDate, endDate);

      expect(result.revenue.total).toBe(50000);
      expect(result.costOfGoodsSold.total).toBe(30000);
      expect(result.grossProfit).toBe(20000);
      expect(result.expenses.total).toBe(40000);
      expect(result.netIncome).toBe(-20000);
    });

    it('should differentiate COGS (5xxx) from Operating Expenses (6xxx+)', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      const mockAccounts = [
        { id: '1', code: '4000', name: 'Revenue', type: AccountType.REVENUE, isActive: true },
        // COGS: 5000-5999
        { id: '2', code: '5000', name: 'COGS', type: AccountType.EXPENSE, isActive: true },
        { id: '3', code: '5999', name: 'Direct Materials', type: AccountType.EXPENSE, isActive: true },
        // Operating Expenses: 6000+
        { id: '4', code: '6000', name: 'Rent', type: AccountType.EXPENSE, isActive: true },
        { id: '5', code: '7000', name: 'Marketing', type: AccountType.EXPENSE, isActive: true },
      ];

      accountRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue(mockAccounts);

      mockQueryBuilder.getRawMany.mockResolvedValue([
        { accountId: '1', totalDebit: '0', totalCredit: '100000' },
        { accountId: '2', totalDebit: '30000', totalCredit: '0' },
        { accountId: '3', totalDebit: '10000', totalCredit: '0' },
        { accountId: '4', totalDebit: '5000', totalCredit: '0' },
        { accountId: '5', totalDebit: '3000', totalCredit: '0' },
      ]);

      const result = await service.generateProfitAndLoss(startDate, endDate);

      // COGS should only include accounts 5000-5999
      expect(result.costOfGoodsSold.accounts).toHaveLength(2);
      expect(result.costOfGoodsSold.total).toBe(40000);

      // Operating Expenses should include 6000+
      expect(result.expenses.accounts).toHaveLength(2);
      expect(result.expenses.total).toBe(8000);

      // Verify calculations
      expect(result.grossProfit).toBe(60000); // 100000 - 40000
      expect(result.netIncome).toBe(52000); // 60000 - 8000
    });

    it('should filter by date range inclusively', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      accountRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue([
        { id: '1', code: '4000', name: 'Revenue', type: AccountType.REVENUE, isActive: true },
      ]);
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      await service.generateProfitAndLoss(startDate, endDate);

      // Verify date range filtering
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'je.entryDate >= :startDate',
        { startDate },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'je.entryDate <= :endDate',
        { endDate },
      );
    });

    it('should exclude inactive accounts by default', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      accountRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue([
        { id: '1', code: '4000', name: 'Revenue', type: AccountType.REVENUE, isActive: true },
      ]);
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      await service.generateProfitAndLoss(startDate, endDate);

      // Verify that query filters by isActive = true
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'account.isActive = :isActive',
        { isActive: true },
      );
    });

    it('should include inactive accounts when requested', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      const mockAccounts = [
        { id: '1', code: '4000', name: 'Revenue', type: AccountType.REVENUE, isActive: true },
        { id: '2', code: '4100', name: 'Old Revenue', type: AccountType.REVENUE, isActive: false },
      ];

      accountRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue(mockAccounts);

      mockQueryBuilder.getRawMany.mockResolvedValue([
        { accountId: '1', totalDebit: '0', totalCredit: '10000' },
        { accountId: '2', totalDebit: '0', totalCredit: '5000' },
      ]);

      const result = await service.generateProfitAndLoss(startDate, endDate, true);

      expect(result.revenue.accounts).toHaveLength(2);
      expect(result.revenue.total).toBe(15000);
    });

    it('should only include POSTED journal entries', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      accountRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue([
        { id: '1', code: '4000', name: 'Revenue', type: AccountType.REVENUE, isActive: true },
      ]);
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      await service.generateProfitAndLoss(startDate, endDate);

      // Verify that query filters by POSTED status
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'je.status = :status',
        { status: JournalEntryStatus.POSTED },
      );
    });

    it('should throw BadRequestException when date range is invalid', async () => {
      const startDate = new Date('2026-02-01');
      const endDate = new Date('2026-01-01'); // End before start

      await expect(
        service.generateProfitAndLoss(startDate, endDate),
      ).rejects.toThrow('Start date must be before or equal to end date');
    });

    it('should throw BadRequestException when endDate is in the future', async () => {
      const startDate = new Date('2026-01-01');
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      futureDate.setHours(12, 0, 0, 0);

      await expect(
        service.generateProfitAndLoss(startDate, futureDate),
      ).rejects.toThrow('End date cannot be in the future');
    });

    it('should handle zero revenue and expenses', async () => {
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      const mockAccounts = [
        { id: '1', code: '4000', name: 'Revenue', type: AccountType.REVENUE, isActive: true },
        { id: '2', code: '5000', name: 'COGS', type: AccountType.EXPENSE, isActive: true },
        { id: '3', code: '6000', name: 'Expenses', type: AccountType.EXPENSE, isActive: true },
      ];

      accountRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockQueryBuilder.getMany.mockResolvedValue(mockAccounts);
      mockQueryBuilder.getRawMany.mockResolvedValue([]);

      const result = await service.generateProfitAndLoss(startDate, endDate);

      expect(result.revenue.total).toBe(0);
      expect(result.costOfGoodsSold.total).toBe(0);
      expect(result.grossProfit).toBe(0);
      expect(result.expenses.total).toBe(0);
      expect(result.netIncome).toBe(0);
    });
  });
});
