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

describe('AccountingReportsService - General Ledger', () => {
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

  describe('generateGeneralLedger', () => {
    it('should generate general ledger for an account with correct running balance', async () => {
      const accountId = '123e4567-e89b-12d3-a456-426614174000';
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      accountRepository.findOne.mockResolvedValue({
        id: accountId,
        code: '1000',
        name: 'Cash in Hand',
        type: AccountType.ASSET,
        isActive: true,
      } as ChartOfAccount);
      queryHelper.queryTransactionTotals
        .mockResolvedValueOnce(new Map([[accountId, { totalDebit: 50000, totalCredit: 0 }]]));
      qb.getRawMany
        .mockResolvedValueOnce([
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

      expect(result.account.id).toBe(accountId);
      expect(result.account.code).toBe('1000');
      expect(result.account.name).toBe('Cash in Hand');
      expect(result.account.type).toBe('ASSET');
      expect(result.openingBalance).toBe(50000);
      expect(result.transactions).toHaveLength(3);
      expect(result.transactions[0].date).toEqual(new Date('2026-01-02'));
      expect(result.transactions[0].entryNumber).toBe('JE-001');
      expect(result.transactions[0].description).toBe('Sales Payment');
      expect(result.transactions[0].debit).toBe(1000);
      expect(result.transactions[0].credit).toBe(0);
      expect(result.transactions[0].balance).toBe(51000);
      expect(result.transactions[1].date).toEqual(new Date('2026-01-03'));
      expect(result.transactions[1].entryNumber).toBe('JE-002');
      expect(result.transactions[1].description).toBe('Vendor Payment');
      expect(result.transactions[1].debit).toBe(0);
      expect(result.transactions[1].credit).toBe(500);
      expect(result.transactions[1].balance).toBe(50500);
      expect(result.transactions[2].date).toEqual(new Date('2026-01-05'));
      expect(result.transactions[2].entryNumber).toBe('JE-003');
      expect(result.transactions[2].description).toBe('Cash Sale');
      expect(result.transactions[2].debit).toBe(2000);
      expect(result.transactions[2].credit).toBe(0);
      expect(result.transactions[2].balance).toBe(52500);
      expect(result.closingBalance).toBe(52500);
    });

    it('should calculate running balance correctly for LIABILITY account', async () => {
      accountRepository.findOne.mockResolvedValue({
        id: '223e4567-e89b-12d3-a456-426614174000',
        code: '2000',
        name: 'Accounts Payable',
        type: AccountType.LIABILITY,
        isActive: true,
      } as ChartOfAccount);
      queryHelper.queryTransactionTotals
        .mockResolvedValueOnce(
          new Map([['223e4567-e89b-12d3-a456-426614174000', { totalDebit: 0, totalCredit: 10000 }]]),
        );
      qb.getRawMany
        .mockResolvedValueOnce([
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

      const result = await service.generateGeneralLedger(
        '223e4567-e89b-12d3-a456-426614174000',
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(result.openingBalance).toBe(10000);
      expect(result.transactions[0].balance).toBe(12000);
      expect(result.transactions[1].balance).toBe(10500);
      expect(result.closingBalance).toBe(10500);
    });

    it('should calculate running balance correctly for REVENUE account', async () => {
      accountRepository.findOne.mockResolvedValue({
        id: '323e4567-e89b-12d3-a456-426614174000',
        code: '4000',
        name: 'Sales Revenue',
        type: AccountType.REVENUE,
        isActive: true,
      } as ChartOfAccount);
      queryHelper.queryTransactionTotals
        .mockResolvedValueOnce(new Map());
      qb.getRawMany.mockResolvedValueOnce([
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

      const result = await service.generateGeneralLedger(
        '323e4567-e89b-12d3-a456-426614174000',
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(result.openingBalance).toBe(0);
      expect(result.transactions[0].balance).toBe(5000);
      expect(result.transactions[1].balance).toBe(4500);
      expect(result.closingBalance).toBe(4500);
    });

    it('should calculate running balance correctly for EXPENSE account', async () => {
      accountRepository.findOne.mockResolvedValue({
        id: '423e4567-e89b-12d3-a456-426614174000',
        code: '6000',
        name: 'Rent Expense',
        type: AccountType.EXPENSE,
        isActive: true,
      } as ChartOfAccount);
      queryHelper.queryTransactionTotals
        .mockResolvedValueOnce(
          new Map([['423e4567-e89b-12d3-a456-426614174000', { totalDebit: 2000, totalCredit: 0 }]]),
        );
      qb.getRawMany
        .mockResolvedValueOnce([
          {
            entryDate: new Date('2026-01-10'),
            referenceNumber: 'JE-010',
            description: 'Monthly rent payment',
            debitAmount: '3000',
            creditAmount: '0',
          },
          {
            entryDate: new Date('2026-01-25'),
            referenceNumber: 'JE-025',
            description: 'Rent correction',
            debitAmount: '0',
            creditAmount: '200',
          },
        ]);

      const result = await service.generateGeneralLedger(
        '423e4567-e89b-12d3-a456-426614174000',
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(result.openingBalance).toBe(2000);
      expect(result.transactions[0].balance).toBe(5000);
      expect(result.transactions[1].balance).toBe(4800);
      expect(result.closingBalance).toBe(4800);
    });

    it('should calculate running balance correctly for EQUITY account', async () => {
      accountRepository.findOne.mockResolvedValue({
        id: '523e4567-e89b-12d3-a456-426614174000',
        code: '3000',
        name: 'Common Stock',
        type: AccountType.EQUITY,
        isActive: true,
      } as ChartOfAccount);
      queryHelper.queryTransactionTotals
        .mockResolvedValueOnce(
          new Map([['523e4567-e89b-12d3-a456-426614174000', { totalDebit: 0, totalCredit: 50000 }]]),
        );
      qb.getRawMany
        .mockResolvedValueOnce([
          {
            entryDate: new Date('2026-01-15'),
            referenceNumber: 'JE-015',
            description: 'Additional capital investment',
            debitAmount: '0',
            creditAmount: '10000',
          },
          {
            entryDate: new Date('2026-01-20'),
            referenceNumber: 'JE-020',
            description: 'Withdrawal',
            debitAmount: '2000',
            creditAmount: '0',
          },
        ]);

      const result = await service.generateGeneralLedger(
        '523e4567-e89b-12d3-a456-426614174000',
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(result.openingBalance).toBe(50000);
      expect(result.transactions[0].balance).toBe(60000);
      expect(result.transactions[1].balance).toBe(58000);
      expect(result.closingBalance).toBe(58000);
    });

    it('should handle account with no transactions', async () => {
      const accountId = '123e4567-e89b-12d3-a456-426614174000';

      accountRepository.findOne.mockResolvedValue({
        id: accountId,
        code: '1000',
        name: 'Cash',
        type: AccountType.ASSET,
        isActive: true,
      } as ChartOfAccount);
      queryHelper.queryTransactionTotals.mockResolvedValueOnce(new Map());
      qb.getRawMany.mockResolvedValueOnce([]);

      const result = await service.generateGeneralLedger(
        accountId,
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(result.openingBalance).toBe(0);
      expect(result.transactions).toEqual([]);
      expect(result.closingBalance).toBe(0);
    });

    it('should throw NotFoundException when account does not exist', async () => {
      accountRepository.findOne.mockResolvedValue(null);

      await expect(
        service.generateGeneralLedger(
          '123e4567-e89b-12d3-a456-426614174000',
          new Date('2026-01-01'),
          new Date('2026-01-31'),
        ),
      ).rejects.toThrow('Account with ID');
    });

    it('should throw BadRequestException when startDate is after endDate', async () => {
      await expect(
        service.generateGeneralLedger(
          '123e4567-e89b-12d3-a456-426614174000',
          new Date('2026-02-01'),
          new Date('2026-01-01'),
        ),
      ).rejects.toThrow('Start date must be before or equal to end date');
    });

    it('should throw BadRequestException when endDate is in the future', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      futureDate.setHours(12, 0, 0, 0);

      await expect(
        service.generateGeneralLedger(
          '123e4567-e89b-12d3-a456-426614174000',
          new Date('2026-01-01'),
          futureDate,
        ),
      ).rejects.toThrow('End date cannot be in the future');
    });

    it('should include POSTED and REVERSED journal entries', async () => {
      accountRepository.findOne.mockResolvedValue({
        id: '123e4567-e89b-12d3-a456-426614174000',
        code: '1000',
        name: 'Cash',
        type: AccountType.ASSET,
        isActive: true,
      } as ChartOfAccount);
      qb.getRawMany.mockResolvedValue([]);

      await service.generateGeneralLedger(
        '123e4567-e89b-12d3-a456-426614174000',
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(qb.andWhere).toHaveBeenCalledWith('je.status IN (:...statuses)', {
        statuses: [JournalEntryStatus.POSTED, JournalEntryStatus.REVERSED],
      });
    });

    it('should sort transactions by date and entry number', async () => {
      accountRepository.findOne.mockResolvedValue({
        id: '123e4567-e89b-12d3-a456-426614174000',
        code: '1000',
        name: 'Cash',
        type: AccountType.ASSET,
        isActive: true,
      } as ChartOfAccount);
      qb.getRawMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
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

      await service.generateGeneralLedger(
        '123e4567-e89b-12d3-a456-426614174000',
        new Date('2026-01-01'),
        new Date('2026-01-31'),
      );

      expect(qb.orderBy).toHaveBeenCalledWith('je.entryDate', 'ASC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('je.referenceNumber', 'ASC');
    });
  });

  describe('exportGeneralLedgerToExcel', () => {
    it('should generate Excel buffer for general ledger report', async () => {
      const mockGeneralLedger = {
        account: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          code: '1000',
          name: 'Cash',
          type: 'ASSET',
        },
        openingBalance: 50000,
        transactions: [
          {
            date: new Date('2026-01-02'),
            entryNumber: 'JE-001',
            description: 'Sales Payment',
            debit: 1000,
            credit: 0,
            balance: 51000,
          },
          {
            date: new Date('2026-01-03'),
            entryNumber: 'JE-002',
            description: 'Vendor Payment',
            debit: 0,
            credit: 500,
            balance: 50500,
          },
        ],
        closingBalance: 50500,
      };

      const buffer = await service.exportGeneralLedgerToExcel(mockGeneralLedger);

      expect(buffer).toBeDefined();
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
      expect(excelExportService.exportGeneralLedgerToExcel).toHaveBeenCalledWith(
        mockGeneralLedger,
        'general-ledger',
      );
    });

    it('should handle account with no transactions', async () => {
      const mockEmptyLedger = {
        account: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          code: '1000',
          name: 'Cash',
          type: 'ASSET',
        },
        openingBalance: 0,
        transactions: [],
        closingBalance: 0,
      };

      const buffer = await service.exportGeneralLedgerToExcel(mockEmptyLedger);

      expect(buffer).toBeDefined();
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });
});
