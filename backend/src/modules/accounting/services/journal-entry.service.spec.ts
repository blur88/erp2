import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { JournalEntryService } from './journal-entry.service';
import { ChartOfAccountsService } from './chart-of-accounts.service';
import { FiscalPeriodService } from './fiscal-period.service';
import { SettingsService } from '../../settings/settings.service';
import { AuditLogService } from '../../audit-logs/services';
import { JournalEntry, JournalEntryStatus } from '../../../database/entities/journal-entry.entity';
import { JournalEntryLine } from '../../../database/entities/journal-entry-line.entity';
import { FiscalPeriod, FiscalPeriodStatus } from '../../../database/entities/fiscal-period.entity';
import { ChartOfAccount, AccountType } from '../../../database/entities/chart-of-account.entity';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { PurchaseOrder } from '../../../database/entities/purchase-order.entity';

import { Payment } from '../../../database/entities/payment.entity';
import { VendorPayment } from '../../../database/entities/vendor-payment.entity';
import { Expense } from '../../../database/entities/expense.entity';
import { OwnerEquityTransaction } from '../../../database/entities/owner-equity-transaction.entity';
import { FundTransfer } from '../../../database/entities/fund-transfer.entity';
import { Settlement } from '../../../database/entities/settlement.entity';
import { StockAdjustment } from '../../../database/entities/stock-adjustment.entity';
import {
  CreateJournalEntryDto,
  UpdateJournalEntryDto,
  QueryJournalEntriesDto,
} from '../dto/journal-entry.dto';
import { UserRole } from '../../../database/entities/user.entity';

describe('JournalEntryService', () => {
  let service: JournalEntryService;
  let journalEntryRepository: jest.Mocked<Repository<JournalEntry>>;
  let journalEntryLineRepository: jest.Mocked<Repository<JournalEntryLine>>;
  let fiscalPeriodRepository: jest.Mocked<Repository<FiscalPeriod>>;
  let chartOfAccountRepository: jest.Mocked<Repository<ChartOfAccount>>;
  let chartOfAccountsService: jest.Mocked<ChartOfAccountsService>;
  let fiscalPeriodService: jest.Mocked<FiscalPeriodService>;
  let settingsService: jest.Mocked<SettingsService>;
  let mockSalesOrderRepo: { findOne: jest.Mock; find: jest.Mock };
  let mockPurchaseOrderRepo: { findOne: jest.Mock; find: jest.Mock };
  let mockGrnRepo: { findOne: jest.Mock; find: jest.Mock };
  let mockPaymentRepo: { findOne: jest.Mock; find: jest.Mock };
  let mockVendorPaymentRepo: { findOne: jest.Mock; find: jest.Mock };
  let mockExpenseRepo: { findOne: jest.Mock; find: jest.Mock };
  let mockOwnerEquityTransactionRepo: { findOne: jest.Mock; find: jest.Mock };
  let mockFundTransferRepo: { findOne: jest.Mock; find: jest.Mock };
  let mockSettlementRepo: { findOne: jest.Mock; find: jest.Mock };
  let mockStockAdjustmentRepo: { findOne: jest.Mock; find: jest.Mock };

  // Test data
  const mockFiscalPeriod: Partial<FiscalPeriod> = {
    id: 'period-1',
    code: '2026-01',
    name: 'January 2026',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-01-31'),
    status: FiscalPeriodStatus.OPEN,
    isOpen: true,
    isClosed: false,
  };

  const mockAccount1: Partial<ChartOfAccount> = {
    id: 'account-1',
    code: '1000',
    name: 'Cash',
    type: AccountType.ASSET,
    isActive: true,
  };

  const mockAccount2: Partial<ChartOfAccount> = {
    id: 'account-2',
    code: '4000',
    name: 'Sales Revenue',
    type: AccountType.REVENUE,
    isActive: true,
  };

  const mockJournalEntry: Partial<JournalEntry> = {
    id: 'entry-1',
    entryDate: new Date('2026-01-15'),
    referenceNumber: 'JE-2026-001',
    description: 'Test journal entry',
    status: JournalEntryStatus.DRAFT,
    fiscalPeriodId: 'period-1',
    fiscalPeriod: mockFiscalPeriod as FiscalPeriod,
    lines: [],
    isDraft: true,
    isPosted: false,
    isReversed: false,
    totalDebits: 1000,
    totalCredits: 1000,
    isBalanced: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockJournalEntryLine1: Partial<JournalEntryLine> = {
    id: 'line-1',
    journalEntryId: 'entry-1',
    accountId: 'account-1',
    debitAmount: 1000,
    creditAmount: 0,
    account: mockAccount1 as ChartOfAccount,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockJournalEntryLine2: Partial<JournalEntryLine> = {
    id: 'line-2',
    journalEntryId: 'entry-1',
    accountId: 'account-2',
    debitAmount: 0,
    creditAmount: 1000,
    account: mockAccount2 as ChartOfAccount,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockSalesOrderRepo = { findOne: jest.fn(), find: jest.fn() };
    mockPurchaseOrderRepo = { findOne: jest.fn(), find: jest.fn() };
    mockGrnRepo = { findOne: jest.fn(), find: jest.fn() };
    mockPaymentRepo = { findOne: jest.fn(), find: jest.fn() };
    mockVendorPaymentRepo = { findOne: jest.fn(), find: jest.fn() };
    mockExpenseRepo = { findOne: jest.fn(), find: jest.fn() };
    mockOwnerEquityTransactionRepo = { findOne: jest.fn(), find: jest.fn() };
    mockFundTransferRepo = { findOne: jest.fn(), find: jest.fn() };
    mockSettlementRepo = { findOne: jest.fn(), find: jest.fn() };
    mockStockAdjustmentRepo = { findOne: jest.fn(), find: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JournalEntryService,
        {
          provide: getRepositoryToken(JournalEntry),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            softDelete: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(JournalEntryLine),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(FiscalPeriod),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ChartOfAccount),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(SalesOrder),
          useValue: mockSalesOrderRepo,
        },
        {
          provide: getRepositoryToken(PurchaseOrder),
          useValue: mockPurchaseOrderRepo,
        },

        { provide: getRepositoryToken(Payment), useValue: mockPaymentRepo },
        {
          provide: getRepositoryToken(VendorPayment),
          useValue: mockVendorPaymentRepo,
        },
        { provide: getRepositoryToken(Expense), useValue: mockExpenseRepo },
        {
          provide: getRepositoryToken(OwnerEquityTransaction),
          useValue: mockOwnerEquityTransactionRepo,
        },
        {
          provide: getRepositoryToken(FundTransfer),
          useValue: mockFundTransferRepo,
        },
        {
          provide: getRepositoryToken(Settlement),
          useValue: mockSettlementRepo,
        },
        {
          provide: getRepositoryToken(StockAdjustment),
          useValue: mockStockAdjustmentRepo,
        },
        {
          provide: ChartOfAccountsService,
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: FiscalPeriodService,
          useValue: {
            checkPeriodOpen: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: SettingsService,
          useValue: {
            generateDocumentNumber: jest.fn(),
          },
        },
        {
          provide: AuditLogService,
          useValue: {
            log: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<JournalEntryService>(JournalEntryService);
    journalEntryRepository = module.get(getRepositoryToken(JournalEntry));
    journalEntryLineRepository = module.get(getRepositoryToken(JournalEntryLine));
    fiscalPeriodRepository = module.get(getRepositoryToken(FiscalPeriod));
    chartOfAccountRepository = module.get(getRepositoryToken(ChartOfAccount));
    chartOfAccountsService = module.get(ChartOfAccountsService);
    fiscalPeriodService = module.get(FiscalPeriodService);
    settingsService = module.get(SettingsService);
    settingsService.generateDocumentNumber.mockResolvedValue('JE-26-001');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createDto: CreateJournalEntryDto = {
      entryDate: new Date('2026-01-15'),
      description: 'Test entry',
      fiscalPeriodId: 'period-1',
      lines: [
        { accountId: 'account-1', debitAmount: 1000, creditAmount: 0 },
        { accountId: 'account-2', debitAmount: 0, creditAmount: 1000 },
      ],
    };

    it('should create a journal entry with DRAFT status', async () => {
      fiscalPeriodRepository.findOne.mockResolvedValue(mockFiscalPeriod as FiscalPeriod);
      chartOfAccountRepository.findOne
        .mockResolvedValueOnce(mockAccount1 as ChartOfAccount)
        .mockResolvedValueOnce(mockAccount2 as ChartOfAccount);

      // Mock for checking existing entry
      journalEntryRepository.findOne.mockResolvedValueOnce(null);

      // Mock for generating reference number
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      journalEntryRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);

      journalEntryRepository.create.mockReturnValue(mockJournalEntry as JournalEntry);
      journalEntryRepository.save.mockResolvedValue(mockJournalEntry as JournalEntry);
      journalEntryLineRepository.create.mockReturnValue(mockJournalEntryLine1 as JournalEntryLine);
      journalEntryLineRepository.save.mockResolvedValue([
        mockJournalEntryLine1,
        mockJournalEntryLine2,
      ] as any);

      // Mock findOne for final result
      const entryWithLines = {
        ...mockJournalEntry,
        lines: [mockJournalEntryLine1, mockJournalEntryLine2],
      };
      journalEntryRepository.findOne.mockResolvedValueOnce(entryWithLines as JournalEntry);

      const result = await service.create(createDto);

      expect(result).toBeDefined();
      expect(result.status).toBe(JournalEntryStatus.DRAFT);
      expect(journalEntryRepository.create).toHaveBeenCalled();
      expect(journalEntryRepository.save).toHaveBeenCalled();
    });

    it('should generate reference number if not provided', async () => {
      fiscalPeriodRepository.findOne.mockResolvedValue(mockFiscalPeriod as FiscalPeriod);
      chartOfAccountRepository.findOne
        .mockResolvedValueOnce(mockAccount1 as ChartOfAccount)
        .mockResolvedValueOnce(mockAccount2 as ChartOfAccount);

      // Mock for checking existing entry
      journalEntryRepository.findOne.mockResolvedValueOnce(null);

      // Mock for generating reference number
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      journalEntryRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);

      journalEntryRepository.create.mockReturnValue(mockJournalEntry as JournalEntry);
      journalEntryRepository.save.mockResolvedValue(mockJournalEntry as JournalEntry);
      journalEntryLineRepository.create.mockReturnValue(mockJournalEntryLine1 as JournalEntryLine);
      journalEntryLineRepository.save.mockResolvedValue([mockJournalEntryLine1] as any);

      const entryWithLines = {
        ...mockJournalEntry,
        lines: [mockJournalEntryLine1, mockJournalEntryLine2],
      };
      journalEntryRepository.findOne.mockResolvedValueOnce(entryWithLines as JournalEntry);

      const result = await service.create(createDto);

      expect(settingsService.generateDocumentNumber).toHaveBeenCalledWith('Journal Entries');
      expect(result.referenceNumber).toBeDefined();
    });

    it('should throw BadRequestException if fiscal period is closed', async () => {
      const closedPeriod = {
        ...mockFiscalPeriod,
        status: FiscalPeriodStatus.CLOSED,
      };
      fiscalPeriodRepository.findOne.mockResolvedValue(closedPeriod as FiscalPeriod);

      await expect(service.create(createDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if fiscal period not found', async () => {
      fiscalPeriodRepository.findOne.mockResolvedValue(null);

      await expect(service.create(createDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if account not found', async () => {
      fiscalPeriodRepository.findOne.mockResolvedValue(mockFiscalPeriod as FiscalPeriod);
      chartOfAccountRepository.findOne.mockResolvedValue(null);

      await expect(service.create(createDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if lines have both debit and credit', async () => {
      const invalidDto = {
        ...createDto,
        lines: [
          { accountId: 'account-1', debitAmount: 100, creditAmount: 100 },
          { accountId: 'account-2', debitAmount: 0, creditAmount: 100 },
        ],
      };

      fiscalPeriodRepository.findOne.mockResolvedValue(mockFiscalPeriod as FiscalPeriod);
      chartOfAccountRepository.findOne
        .mockResolvedValueOnce(mockAccount1 as ChartOfAccount)
        .mockResolvedValueOnce(mockAccount2 as ChartOfAccount);

      await expect(service.create(invalidDto as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if lines have neither debit nor credit', async () => {
      const invalidDto = {
        ...createDto,
        lines: [
          { accountId: 'account-1', debitAmount: 0, creditAmount: 0 },
          { accountId: 'account-2', debitAmount: 100, creditAmount: 0 },
        ],
      };

      fiscalPeriodRepository.findOne.mockResolvedValue(mockFiscalPeriod as FiscalPeriod);
      chartOfAccountRepository.findOne
        .mockResolvedValueOnce(mockAccount1 as ChartOfAccount)
        .mockResolvedValueOnce(mockAccount2 as ChartOfAccount);

      await expect(service.create(invalidDto as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if less than 2 lines', async () => {
      const invalidDto = {
        ...createDto,
        lines: [{ accountId: 'account-1', debitAmount: 100, creditAmount: 0 }],
      };

      fiscalPeriodRepository.findOne.mockResolvedValue(mockFiscalPeriod as FiscalPeriod);
      chartOfAccountRepository.findOne.mockResolvedValue(mockAccount1 as ChartOfAccount);

      await expect(service.create(invalidDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if reference number already exists', async () => {
      const dtoWithRef = { ...createDto, referenceNumber: 'JE-2026-001' };

      fiscalPeriodRepository.findOne.mockResolvedValue(mockFiscalPeriod as FiscalPeriod);
      chartOfAccountRepository.findOne
        .mockResolvedValueOnce(mockAccount1 as ChartOfAccount)
        .mockResolvedValueOnce(mockAccount2 as ChartOfAccount);
      journalEntryRepository.findOne.mockResolvedValue(mockJournalEntry as JournalEntry);

      await expect(service.create(dtoWithRef)).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('should default to sorting by entry date then reference number in ascending order', async () => {
      const queryDto: QueryJournalEntriesDto = { page: 1, limit: 20 };

      const queryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      journalEntryRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);

      await service.findAll(queryDto);

      expect(queryBuilder.orderBy).toHaveBeenCalledWith('entry.entryDate', 'ASC');
      expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('entry.referenceNumber', 'ASC');
    });

    it('should return paginated journal entries', async () => {
      const queryDto: QueryJournalEntriesDto = { page: 1, limit: 20 };

      const queryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockJournalEntry], 1]),
      };

      journalEntryRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);

      const result = await service.findAll(queryDto);

      expect(result).toBeDefined();
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('should apply status filter', async () => {
      const queryDto: QueryJournalEntriesDto = {
        page: 1,
        limit: 20,
        status: JournalEntryStatus.POSTED,
      };

      const queryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      journalEntryRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);

      await service.findAll(queryDto);

      expect(queryBuilder.andWhere).toHaveBeenCalledWith('entry.status = :status', {
        status: JournalEntryStatus.POSTED,
      });
    });

    it('filters by comma-separated ids when ids param is provided', async () => {
      const andWhereMock = jest.fn().mockReturnThis();
      const queryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: andWhereMock,
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      journalEntryRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);

      await service.findAll({ ids: 'entry-1,entry-2' });

      expect(andWhereMock).toHaveBeenCalledWith('entry.id IN (:...idList)', {
        idList: ['entry-1', 'entry-2'],
      });
    });

    it('calls resolveSourceRefNumbersMany once and does not call per-entry findOne on source repos', async () => {
      const entryWithSource = {
        ...mockJournalEntry,
        sourceType: 'sales_order',
        sourceId: 'so-1',
        lines: [],
      };

      const queryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[entryWithSource], 1]),
      };
      journalEntryRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);
      mockSalesOrderRepo.find.mockResolvedValue([{ id: 'so-1', orderNumber: 'SO-001' }]);

      const result = await service.findAll({ page: 1, limit: 20 });

      // Batch find was called once, not once per entry
      expect(mockSalesOrderRepo.find).toHaveBeenCalledTimes(1);
      // Per-entry findOne was never called
      expect(mockSalesOrderRepo.findOne).not.toHaveBeenCalled();
      // The resolved ref number surfaces in the response
      expect(result.data[0].sourceRefNumber).toBe('SO-001');
    });

    it('returns full set when page/limit absent', async () => {
      const qb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      journalEntryRepository.createQueryBuilder.mockReturnValue(qb as any);

      await service.findAll({} as any);

      expect(qb.skip).not.toHaveBeenCalled();
    });

    it('paginates when page/limit present', async () => {
      const qb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      journalEntryRepository.createQueryBuilder.mockReturnValue(qb as any);

      await service.findAll({ page: 2, limit: 20 } as any);
      expect(qb.skip).toHaveBeenCalledWith(20);
      expect(qb.take).toHaveBeenCalledWith(20);
    });

    it('does not apply ids filter when ids param is absent', async () => {
      const andWhereMock = jest.fn().mockReturnThis();
      const queryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: andWhereMock,
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };
      journalEntryRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);

      await service.findAll({});

      const calls = andWhereMock.mock.calls.map((c: any[]) => c[0] as string);
      expect(calls.some((c) => c.includes('id IN'))).toBe(false);
    });
  });

  describe('searchGlobal', () => {
    const adminUser = { role: UserRole.ADMIN } as any;

    it('exact reference number match scores SCORE_EXACT_CODE + BOOST_JOURNAL + BOOST_EXACT_MATCH', async () => {
      journalEntryRepository.createQueryBuilder.mockReturnValue({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            id: 'je-1',
            referenceNumber: 'JE-001',
            description: 'Manual adjustment',
          },
        ]),
      } as any);

      const results = await service.searchGlobal('JE-001', adminUser);

      expect(results[0]).toMatchObject({
        type: 'journal_entry',
        id: 'je-1',
        label: 'JE-001',
        description: 'Manual adjustment',
        route: '/accounting/journal-entries/je-1',
      });
      expect(results[0].score).toBe(144);
    });
  });

  describe('findOne', () => {
    it('should return a journal entry by ID', async () => {
      const entryWithRelations = {
        ...mockJournalEntry,
        lines: [mockJournalEntryLine1, mockJournalEntryLine2],
      };
      journalEntryRepository.findOne.mockResolvedValue(entryWithRelations as JournalEntry);

      const result = await service.findOne('entry-1');

      expect(result).toBeDefined();
      expect(result.id).toBe('entry-1');
    });

    it('should throw NotFoundException if entry not found', async () => {
      journalEntryRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('sourceRefNumber resolution', () => {
    it('resolves sourceRefNumber for sales_order sourceType', async () => {
      const entry = {
        ...mockJournalEntry,
        sourceType: 'sales_order',
        sourceId: 'so-uuid-1',
      } as JournalEntry;

      journalEntryRepository.findOne.mockResolvedValue(entry);
      mockSalesOrderRepo.findOne.mockResolvedValue({ orderNumber: 'SO-0042' });

      const result = await service.findOne('entry-1');

      expect(result.sourceRefNumber).toBe('SO-0042');
    });

    it('resolves sourceRefNumber for purchase_order sourceType', async () => {
      const entry = {
        ...mockJournalEntry,
        sourceType: 'purchase_order',
        sourceId: 'po-uuid-1',
      } as JournalEntry;

      journalEntryRepository.findOne.mockResolvedValue(entry);
      mockPurchaseOrderRepo.findOne.mockResolvedValue({
        orderNumber: 'PO-0007',
      });

      const result = await service.findOne('entry-1');

      expect(result.sourceRefNumber).toBe('PO-0007');
    });

    it('returns undefined sourceRefNumber for manual entries', async () => {
      const entry = {
        ...mockJournalEntry,
        sourceType: 'manual',
        sourceId: undefined,
      } as JournalEntry;

      journalEntryRepository.findOne.mockResolvedValue(entry);

      const result = await service.findOne('entry-1');

      expect(result.sourceRefNumber).toBeUndefined();
    });

    it('returns undefined sourceRefNumber when source record not found', async () => {
      const entry = {
        ...mockJournalEntry,
        sourceType: 'sales_order',
        sourceId: 'so-missing',
      } as JournalEntry;

      journalEntryRepository.findOne.mockResolvedValue(entry);
      mockSalesOrderRepo.findOne.mockResolvedValue(null);

      const result = await service.findOne('entry-1');

      expect(result.sourceRefNumber).toBeUndefined();
    });
  });

  describe('update', () => {
    const updateDto: UpdateJournalEntryDto = {
      description: 'Updated description',
    };

    it('should update a DRAFT journal entry', async () => {
      const entryWithLines = {
        ...mockJournalEntry,
        lines: [mockJournalEntryLine1, mockJournalEntryLine2],
      };
      journalEntryRepository.findOne
        .mockResolvedValueOnce(entryWithLines as JournalEntry)
        .mockResolvedValueOnce(entryWithLines as JournalEntry);
      journalEntryRepository.save.mockResolvedValue(entryWithLines as JournalEntry);

      const result = await service.update('entry-1', updateDto);

      expect(result).toBeDefined();
      expect(journalEntryRepository.save).toHaveBeenCalled();
    });

    it('should throw BadRequestException if entry is not DRAFT', async () => {
      const postedEntry = {
        ...mockJournalEntry,
        status: JournalEntryStatus.POSTED,
      };
      journalEntryRepository.findOne.mockResolvedValue(postedEntry as JournalEntry);

      await expect(service.update('entry-1', updateDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if entry not found', async () => {
      journalEntryRepository.findOne.mockResolvedValue(null);

      await expect(service.update('non-existent', updateDto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should soft delete a DRAFT journal entry', async () => {
      journalEntryRepository.findOne.mockResolvedValue(mockJournalEntry as JournalEntry);
      journalEntryRepository.softDelete.mockResolvedValue({
        affected: 1,
      } as any);

      await service.remove('entry-1');

      expect(journalEntryRepository.softDelete).toHaveBeenCalledWith('entry-1');
    });

    it('should throw BadRequestException if entry is not DRAFT', async () => {
      const postedEntry = {
        ...mockJournalEntry,
        status: JournalEntryStatus.POSTED,
      };
      journalEntryRepository.findOne.mockResolvedValue(postedEntry as JournalEntry);

      await expect(service.remove('entry-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if entry has been reversed', async () => {
      const reversedEntry = {
        ...mockJournalEntry,
        reversedById: 'rev-entry-1',
      };
      journalEntryRepository.findOne.mockResolvedValue(reversedEntry as JournalEntry);

      await expect(service.remove('entry-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if entry not found', async () => {
      journalEntryRepository.findOne.mockResolvedValue(null);

      await expect(service.remove('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('postEntry', () => {
    it('should post a balanced DRAFT entry', async () => {
      const entryWithLines = {
        ...mockJournalEntry,
        lines: [mockJournalEntryLine1, mockJournalEntryLine2],
        isBalanced: true,
      };
      journalEntryRepository.findOne.mockResolvedValue(entryWithLines as JournalEntry);
      fiscalPeriodService.checkPeriodOpen.mockResolvedValue(true);
      journalEntryRepository.save.mockResolvedValue({
        ...entryWithLines,
        status: JournalEntryStatus.POSTED,
      } as JournalEntry);

      const result = await service.postEntry('entry-1');

      expect(result.status).toBe(JournalEntryStatus.POSTED);
      expect(journalEntryRepository.save).toHaveBeenCalled();
    });

    it('should post an entry dated on the last day of the period even with a time component', async () => {
      // Regression: an entryDate carrying a time-of-day (e.g. created via `new Date()`
      // late on the period's end date) must not be treated as "after" the period end,
      // which is stored as a date-only value (midnight).
      const entryWithLines = {
        ...mockJournalEntry,
        entryDate: new Date('2026-01-31T19:32:31Z'),
        fiscalPeriod: {
          ...mockFiscalPeriod,
          startDate: new Date('2026-01-01'),
          endDate: new Date('2026-01-31'),
        },
        lines: [mockJournalEntryLine1, mockJournalEntryLine2],
        isBalanced: true,
      };
      journalEntryRepository.findOne.mockResolvedValue(entryWithLines as JournalEntry);
      fiscalPeriodService.checkPeriodOpen.mockResolvedValue(true);
      journalEntryRepository.save.mockResolvedValue({
        ...entryWithLines,
        status: JournalEntryStatus.POSTED,
      } as JournalEntry);

      const result = await service.postEntry('entry-1');

      expect(result.status).toBe(JournalEntryStatus.POSTED);
    });

    it('should throw BadRequestException if entry is not balanced', async () => {
      const unbalancedEntry = {
        ...mockJournalEntry,
        lines: [mockJournalEntryLine1],
        isBalanced: false,
        totalDebits: 1000,
        totalCredits: 500,
      };
      journalEntryRepository.findOne.mockResolvedValue(unbalancedEntry as JournalEntry);

      await expect(service.postEntry('entry-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if entry is not DRAFT', async () => {
      const postedEntry = {
        ...mockJournalEntry,
        status: JournalEntryStatus.POSTED,
        isBalanced: true,
      };
      journalEntryRepository.findOne.mockResolvedValue(postedEntry as JournalEntry);

      await expect(service.postEntry('entry-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if fiscal period is closed', async () => {
      const entryWithLines = {
        ...mockJournalEntry,
        lines: [mockJournalEntryLine1, mockJournalEntryLine2],
        isBalanced: true,
      };
      journalEntryRepository.findOne.mockResolvedValue(entryWithLines as JournalEntry);
      fiscalPeriodService.checkPeriodOpen.mockResolvedValue(false);

      await expect(service.postEntry('entry-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException with clear message when period is closed', async () => {
      const entryWithLines = {
        ...mockJournalEntry,
        lines: [mockJournalEntryLine1, mockJournalEntryLine2],
        isBalanced: true,
        fiscalPeriod: { ...mockFiscalPeriod, name: 'January 2026' },
      };
      journalEntryRepository.findOne.mockResolvedValue(entryWithLines as JournalEntry);
      fiscalPeriodService.checkPeriodOpen.mockResolvedValue(false);

      await expect(service.postEntry('entry-1')).rejects.toThrow(
        new BadRequestException(
          `Cannot post journal entry - fiscal period 'January 2026' is closed`,
        ),
      );
    });
  });

  describe('bulkPost', () => {
    it('should post multiple draft entries', async () => {
      const ids = ['id1', 'id2', 'id3'];
      jest
        .spyOn(service, 'postEntry')
        .mockResolvedValueOnce({ id: 'id1', status: 'POSTED' } as any)
        .mockResolvedValueOnce({ id: 'id2', status: 'POSTED' } as any)
        .mockResolvedValueOnce({ id: 'id3', status: 'POSTED' } as any);

      const result = await service.bulkPost(ids);

      expect(result.succeeded).toHaveLength(3);
      expect(result.failed).toHaveLength(0);
    });

    it('should return partial results when some entries fail', async () => {
      const ids = ['id1', 'id2'];
      jest
        .spyOn(service, 'postEntry')
        .mockResolvedValueOnce({ id: 'id1', status: 'POSTED' } as any)
        .mockRejectedValueOnce(new BadRequestException('Not balanced'));

      const result = await service.bulkPost(ids);

      expect(result.succeeded).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].id).toBe('id2');
      expect(result.failed[0].error).toContain('Not balanced');
    });
  });

  describe('bulkDelete', () => {
    it('should delete multiple draft entries', async () => {
      const ids = ['id1', 'id2'];
      jest
        .spyOn(service, 'remove')
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      const result = await service.bulkDelete(ids);

      expect(result.succeeded).toHaveLength(2);
      expect(result.failed).toHaveLength(0);
    });

    it('should return failures for non-draft entries', async () => {
      const ids = ['id1', 'id2'];
      jest
        .spyOn(service, 'remove')
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new BadRequestException('Cannot delete posted entry'));

      const result = await service.bulkDelete(ids);

      expect(result.succeeded).toHaveLength(1);
      expect(result.failed).toHaveLength(1);
    });
  });

  describe('reverseEntry', () => {
    it('should reverse a POSTED entry', async () => {
      const postedEntry = {
        ...mockJournalEntry,
        status: JournalEntryStatus.POSTED,
        lines: [mockJournalEntryLine1, mockJournalEntryLine2],
      };
      journalEntryRepository.findOne
        .mockResolvedValueOnce(postedEntry as JournalEntry)
        .mockResolvedValueOnce({ id: 'rev-entry-1' } as JournalEntry);

      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      journalEntryRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);

      fiscalPeriodService.checkPeriodOpen.mockResolvedValue(true);
      journalEntryRepository.create.mockReturnValue({
        id: 'rev-entry-1',
      } as JournalEntry);
      journalEntryRepository.save.mockResolvedValue({
        id: 'rev-entry-1',
      } as JournalEntry);
      journalEntryLineRepository.create.mockReturnValue({} as JournalEntryLine);
      journalEntryLineRepository.save.mockResolvedValue([] as any);

      const result = await service.reverseEntry('entry-1');

      expect(result).toBeDefined();
      expect(journalEntryRepository.save).toHaveBeenCalled();
    });

    it('should throw BadRequestException if entry is not POSTED', async () => {
      journalEntryRepository.findOne.mockResolvedValue(mockJournalEntry as JournalEntry);

      await expect(service.reverseEntry('entry-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if entry already reversed', async () => {
      const reversedEntry = {
        ...mockJournalEntry,
        status: JournalEntryStatus.POSTED,
        reversedById: 'rev-entry-1',
      };
      journalEntryRepository.findOne.mockResolvedValue(reversedEntry as JournalEntry);

      await expect(service.reverseEntry('entry-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if fiscal period is closed', async () => {
      const postedEntry = {
        ...mockJournalEntry,
        status: JournalEntryStatus.POSTED,
        lines: [mockJournalEntryLine1, mockJournalEntryLine2],
      };
      journalEntryRepository.findOne.mockResolvedValue(postedEntry as JournalEntry);
      fiscalPeriodService.checkPeriodOpen.mockResolvedValue(false);

      await expect(service.reverseEntry('entry-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if entry not found', async () => {
      journalEntryRepository.findOne.mockResolvedValue(null);

      await expect(service.reverseEntry('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('resolveSourceRefNumbersMany', () => {
    it('batches lookups by sourceType - one find call per type, correct map keys', async () => {
      const entries = [
        {
          id: 'e1',
          sourceType: 'sales_order',
          sourceId: 'so-1',
        },
        {
          id: 'e2',
          sourceType: 'sales_order',
          sourceId: 'so-2',
        },
        {
          id: 'e3',
          sourceType: 'payment',
          sourceId: 'pay-1',
        },
      ] as any[];

      mockSalesOrderRepo.find.mockResolvedValue([
        { id: 'so-1', orderNumber: 'SO-001' },
        { id: 'so-2', orderNumber: 'SO-002' },
      ]);
      mockPaymentRepo.find.mockResolvedValue([{ id: 'pay-1', paymentNumber: 'PAY-001' }]);

      const map = await (service as any).resolveSourceRefNumbersMany(entries);

      expect(mockSalesOrderRepo.find).toHaveBeenCalledTimes(1);
      expect(mockSalesOrderRepo.find).toHaveBeenCalledWith({
        where: { id: expect.anything() },
        select: { id: true, orderNumber: true },
      });
      expect(mockPaymentRepo.find).toHaveBeenCalledTimes(1);
      expect(map.get('sales_order:so-1')).toBe('SO-001');
      expect(map.get('sales_order:so-2')).toBe('SO-002');
      expect(map.get('payment:pay-1')).toBe('PAY-001');
    });

    it('skips entries with null sourceType or sourceId - no repo calls', async () => {
      const entries = [
        { id: 'e1', sourceType: null, sourceId: 'so-1' },
        { id: 'e2', sourceType: 'sales_order', sourceId: null },
        { id: 'e3', sourceType: undefined, sourceId: undefined },
      ] as any[];

      const map = await (service as any).resolveSourceRefNumbersMany(entries);

      expect(mockSalesOrderRepo.find).not.toHaveBeenCalled();
      expect(map.size).toBe(0);
    });

    it('returns empty Map when a repo throws - does not rethrow', async () => {
      const entries = [{ id: 'e1', sourceType: 'sales_order', sourceId: 'so-1' }] as any[];

      mockSalesOrderRepo.find.mockRejectedValue(new Error('DB error'));

      const map = await (service as any).resolveSourceRefNumbersMany(entries);

      expect(map).toBeInstanceOf(Map);
      expect(map.size).toBe(0);
    });

    it('preserves partial results when one source type throws and another succeeds', async () => {
      const entries = [
        { id: 'e1', sourceType: 'sales_order', sourceId: 'so-1' },
        { id: 'e2', sourceType: 'payment', sourceId: 'pay-1' },
      ] as any[];

      mockSalesOrderRepo.find.mockRejectedValue(new Error('DB error'));
      mockPaymentRepo.find.mockResolvedValue([{ id: 'pay-1', paymentNumber: 'PAY-001' }]);

      const map = await (service as any).resolveSourceRefNumbersMany(entries);

      expect(map).toBeInstanceOf(Map);
      // payment succeeded even though sales_order failed
      expect(map.get('payment:pay-1')).toBe('PAY-001');
      // sales_order entries are absent (not resolved) but did not wipe payment entries
      expect(map.has('sales_order:so-1')).toBe(false);
    });
  });
});
