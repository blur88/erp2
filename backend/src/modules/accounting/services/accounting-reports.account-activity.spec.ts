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

describe('AccountingReportsService - Account Activity', () => {
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

  describe('generateAccountActivity', () => {
    it('should generate account activity with all entry statuses', async () => {
      const accountId = '123e4567-e89b-12d3-a456-426614174000';
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      accountRepository.findOne.mockResolvedValue({
        id: accountId,
        code: '1200',
        name: 'Accounts Receivable',
        type: AccountType.ASSET,
        isActive: true,
      } as ChartOfAccount);
      queryHelper.queryTransactionTotals
        .mockResolvedValueOnce(new Map([[accountId, { totalDebit: 10000, totalCredit: 0 }]]));
      qb.getRawMany
        .mockResolvedValueOnce([
          {
            entryDate: new Date('2026-01-02'),
            referenceNumber: 'JE-001',
            description: 'Sales Order',
            debitAmount: '1000',
            creditAmount: '0',
            status: 'POSTED',
            sourceType: 'SALES_ORDER',
            sourceId: 'SO-001',
          },
          {
            entryDate: new Date('2026-01-03'),
            referenceNumber: 'JE-002',
            description: 'Payment Received',
            debitAmount: '0',
            creditAmount: '500',
            status: 'POSTED',
            sourceType: 'PAYMENT',
            sourceId: 'PAY-001',
          },
          {
            entryDate: new Date('2026-01-04'),
            referenceNumber: 'JE-003',
            description: 'Draft Invoice',
            debitAmount: '200',
            creditAmount: '0',
            status: 'DRAFT',
            sourceType: 'INVOICE',
            sourceId: 'INV-001',
          },
        ]);

      const result = await service.generateAccountActivity(accountId, startDate, endDate);

      expect(result.account.id).toBe(accountId);
      expect(result.account.code).toBe('1200');
      expect(result.account.name).toBe('Accounts Receivable');
      expect(result.openingBalance).toBe(10000);
      expect(result.activity).toHaveLength(3);
      expect(result.activity[0].date).toEqual(new Date('2026-01-02'));
      expect(result.activity[0].entryNumber).toBe('JE-001');
      expect(result.activity[0].description).toBe('Sales Order');
      expect(result.activity[0].debit).toBe(1000);
      expect(result.activity[0].credit).toBe(0);
      expect(result.activity[0].status).toBe('POSTED');
      expect(result.activity[0].referenceType).toBe('SALES_ORDER');
      expect(result.activity[0].referenceId).toBe('SO-001');
      expect(result.activity[0].balance).toBe(11000);
      expect(result.activity[1].date).toEqual(new Date('2026-01-03'));
      expect(result.activity[1].entryNumber).toBe('JE-002');
      expect(result.activity[1].description).toBe('Payment Received');
      expect(result.activity[1].debit).toBe(0);
      expect(result.activity[1].credit).toBe(500);
      expect(result.activity[1].status).toBe('POSTED');
      expect(result.activity[1].referenceType).toBe('PAYMENT');
      expect(result.activity[1].referenceId).toBe('PAY-001');
      expect(result.activity[1].balance).toBe(10500);
      expect(result.activity[2].date).toEqual(new Date('2026-01-04'));
      expect(result.activity[2].entryNumber).toBe('JE-003');
      expect(result.activity[2].description).toBe('Draft Invoice');
      expect(result.activity[2].debit).toBe(200);
      expect(result.activity[2].credit).toBe(0);
      expect(result.activity[2].status).toBe('DRAFT');
      expect(result.activity[2].referenceType).toBe('INVOICE');
      expect(result.activity[2].referenceId).toBe('INV-001');
      expect(result.activity[2].balance).toBe(10700);
    });

    it('should filter account activity by status', async () => {
      const accountId = '123e4567-e89b-12d3-a456-426614174000';
      const startDate = new Date('2026-01-01');
      const endDate = new Date('2026-01-31');

      accountRepository.findOne.mockResolvedValue({
        id: accountId,
        code: '1200',
        name: 'Accounts Receivable',
        type: AccountType.ASSET,
        isActive: true,
      } as ChartOfAccount);
      queryHelper.queryTransactionTotals
        .mockResolvedValueOnce(new Map([[accountId, { totalDebit: 5000, totalCredit: 0 }]]));
      qb.getRawMany
        .mockResolvedValueOnce([
          {
            entryDate: new Date('2026-01-02'),
            referenceNumber: 'JE-001',
            description: 'Posted Entry',
            debitAmount: '1000',
            creditAmount: '0',
            status: 'POSTED',
            sourceType: 'SALES_ORDER',
            sourceId: 'SO-001',
          },
        ]);

      const result = await service.generateAccountActivity(
        accountId,
        startDate,
        endDate,
        JournalEntryStatus.POSTED,
      );

      expect(result.activity).toHaveLength(1);
      expect(result.activity[0].status).toBe('POSTED');
      expect(qb.andWhere).toHaveBeenCalledWith('je.status = :statusFilter', {
        statusFilter: JournalEntryStatus.POSTED,
      });
    });

    it('should handle entries without reference metadata', async () => {
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
      queryHelper.queryTransactionTotals.mockResolvedValueOnce(new Map());
      qb.getRawMany.mockResolvedValueOnce([
        {
          entryDate: new Date('2026-01-10'),
          referenceNumber: 'JE-010',
          description: 'Manual Adjustment',
          debitAmount: '500',
          creditAmount: '0',
          status: 'POSTED',
          sourceType: null,
          sourceId: null,
        },
      ]);

      const result = await service.generateAccountActivity(accountId, startDate, endDate);

      expect(result.activity).toHaveLength(1);
      expect(result.activity[0].referenceType).toBeUndefined();
      expect(result.activity[0].referenceId).toBeUndefined();
    });

    it('should throw NotFoundException when account does not exist', async () => {
      accountRepository.findOne.mockResolvedValue(null);

      await expect(
        service.generateAccountActivity(
          '123e4567-e89b-12d3-a456-426614174000',
          new Date('2026-01-01'),
          new Date('2026-01-31'),
        ),
      ).rejects.toThrow('Account with ID');
    });

    it('should throw BadRequestException when date range is invalid', async () => {
      await expect(
        service.generateAccountActivity(
          '123e4567-e89b-12d3-a456-426614174000',
          new Date('2026-02-01'),
          new Date('2026-01-01'),
        ),
      ).rejects.toThrow('Start date must be before or equal to end date');
    });
  });

  describe('exportAccountActivityToExcel', () => {
    it('should generate Excel buffer for account activity report', async () => {
      const mockAccountActivity = {
        account: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          code: '1200',
          name: 'Accounts Receivable',
          type: 'ASSET',
        },
        openingBalance: 10000,
        activity: [
          {
            date: new Date('2026-01-02'),
            entryNumber: 'JE-001',
            description: 'Sales Order',
            referenceType: 'SALES_ORDER',
            referenceId: 'SO-001',
            status: 'POSTED',
            debit: 1000,
            credit: 0,
            balance: 11000,
          },
          {
            date: new Date('2026-01-03'),
            entryNumber: 'JE-002',
            description: 'Draft Invoice',
            referenceType: 'INVOICE',
            referenceId: 'INV-001',
            status: 'DRAFT',
            debit: 500,
            credit: 0,
            balance: 11500,
          },
          {
            date: new Date('2026-01-04'),
            entryNumber: 'JE-003',
            description: 'Reversed Entry',
            referenceType: undefined,
            referenceId: undefined,
            status: 'REVERSED',
            debit: 0,
            credit: 200,
            balance: 11300,
          },
        ],
        closingBalance: 11300,
      };

      const buffer = await service.exportAccountActivityToExcel(mockAccountActivity);

      expect(buffer).toBeDefined();
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
      expect(excelExportService.exportAccountActivityToExcel).toHaveBeenCalledWith(
        mockAccountActivity,
        'account-activity',
      );
    });

    it('should handle activity with missing reference metadata', async () => {
      const mockActivityNoRefs = {
        account: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          code: '1000',
          name: 'Cash',
          type: 'ASSET',
        },
        openingBalance: 5000,
        activity: [
          {
            date: new Date('2026-01-10'),
            entryNumber: 'JE-010',
            description: 'Manual Adjustment',
            status: 'POSTED',
            debit: 500,
            credit: 0,
            balance: 5500,
          },
        ],
        closingBalance: 5500,
      };

      const buffer = await service.exportAccountActivityToExcel(mockActivityNoRefs);

      expect(buffer).toBeDefined();
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });
  });
});
