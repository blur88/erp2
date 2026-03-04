import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';
import {
  BankReconciliation,
  BankReconciliationStatus,
} from '../../../database/entities/bank-reconciliation.entity';
import { ReconciledTransaction } from '../../../database/entities/reconciled-transaction.entity';
import { JournalEntryLine } from '../../../database/entities/journal-entry-line.entity';
import { ChartOfAccount } from '../../../database/entities/chart-of-account.entity';
import { FiscalPeriod, FiscalPeriodStatus } from '../../../database/entities/fiscal-period.entity';
import { AuditLogService } from '../../audit-logs/services';

describe('ReconciliationService', () => {
  let service: ReconciliationService;
  let reconciliationRepo: jest.Mocked<Repository<BankReconciliation>>;
  let reconciledTxnRepo: jest.Mocked<Repository<ReconciledTransaction>>;
  let journalEntryLineRepo: jest.Mocked<Repository<JournalEntryLine>>;
  let chartOfAccountRepo: jest.Mocked<Repository<ChartOfAccount>>;
  let fiscalPeriodRepo: jest.Mocked<Repository<FiscalPeriod>>;

  const mockAccount = {
    id: 'acct-001',
    code: '1000',
    name: 'Cash in Hand',
    type: 'ASSET',
    isActive: true,
  };

  const mockPeriod = {
    id: 'period-001',
    code: '2026-01',
    name: 'January 2026',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-01-31'),
    status: FiscalPeriodStatus.OPEN,
  };

  const mockReconciliation = {
    id: 'recon-001',
    accountId: 'acct-001',
    fiscalPeriodId: 'period-001',
    reconciliationDate: new Date('2026-01-31'),
    statementBalance: 50000,
    bookBalance: 50000,
    difference: 0,
    status: BankReconciliationStatus.IN_PROGRESS,
    isCompleted: false,
    isInProgress: true,
    isBalanced: true,
    calculateDifference: jest.fn(),
    account: mockAccount,
    fiscalPeriod: mockPeriod,
    reconciledTransactions: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const createMockQueryBuilder = (result: any = [], count: number = 0) => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(result),
    getMany: jest.fn().mockResolvedValue(Array.isArray(result) ? result : [result]),
    getManyAndCount: jest.fn().mockResolvedValue([
      Array.isArray(result) ? result : [result],
      count || (Array.isArray(result) ? result.length : 1),
    ]),
    getRawOne: jest.fn().mockResolvedValue({ totalDebit: '50000', totalCredit: '0' }),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReconciliationService,
        {
          provide: getRepositoryToken(BankReconciliation),
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
          provide: getRepositoryToken(ReconciledTransaction),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(JournalEntryLine),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ChartOfAccount),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(FiscalPeriod),
          useValue: {
            findOne: jest.fn(),
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

    service = module.get<ReconciliationService>(ReconciliationService);
    reconciliationRepo = module.get(getRepositoryToken(BankReconciliation));
    reconciledTxnRepo = module.get(getRepositoryToken(ReconciledTransaction));
    journalEntryLineRepo = module.get(getRepositoryToken(JournalEntryLine));
    chartOfAccountRepo = module.get(getRepositoryToken(ChartOfAccount));
    fiscalPeriodRepo = module.get(getRepositoryToken(FiscalPeriod));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createDto = {
      accountId: 'acct-001',
      fiscalPeriodId: 'period-001',
      reconciliationDate: new Date('2026-01-31'),
      statementBalance: 50000,
    };

    it('should create a bank reconciliation', async () => {
      chartOfAccountRepo.findOne.mockResolvedValue(mockAccount as any);
      fiscalPeriodRepo.findOne.mockResolvedValue(mockPeriod as any);
      reconciliationRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockReconciliation as any);
      reconciliationRepo.create.mockReturnValue(mockReconciliation as any);
      reconciliationRepo.save.mockResolvedValue(mockReconciliation as any);
      journalEntryLineRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder([], 0) as any);
      reconciledTxnRepo.create.mockReturnValue({} as any);
      reconciledTxnRepo.save.mockResolvedValue([] as any);

      const result = await service.create(createDto as any);
      expect(result).toBeDefined();
      expect(result.id).toBe('recon-001');
    });

    it('should throw NotFoundException if account not found', async () => {
      chartOfAccountRepo.findOne.mockResolvedValue(null);

      await expect(service.create(createDto as any)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if fiscal period not found', async () => {
      chartOfAccountRepo.findOne.mockResolvedValue(mockAccount as any);
      fiscalPeriodRepo.findOne.mockResolvedValue(null);

      await expect(service.create(createDto as any)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if period is closed', async () => {
      chartOfAccountRepo.findOne.mockResolvedValue(mockAccount as any);
      fiscalPeriodRepo.findOne.mockResolvedValue({
        ...mockPeriod,
        status: FiscalPeriodStatus.CLOSED,
      } as any);

      await expect(service.create(createDto as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if in-progress reconciliation exists', async () => {
      chartOfAccountRepo.findOne.mockResolvedValue(mockAccount as any);
      fiscalPeriodRepo.findOne.mockResolvedValue(mockPeriod as any);
      reconciliationRepo.findOne.mockResolvedValue(mockReconciliation as any);

      await expect(service.create(createDto as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('should return a reconciliation by ID', async () => {
      reconciliationRepo.findOne.mockResolvedValue(mockReconciliation as any);

      const result = await service.findOne('recon-001');
      expect(result).toBeDefined();
      expect(result.id).toBe('recon-001');
    });

    it('should throw NotFoundException if not found', async () => {
      reconciliationRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return paginated reconciliations', async () => {
      reconciliationRepo.createQueryBuilder.mockReturnValue(
        createMockQueryBuilder([mockReconciliation], 1) as any,
      );

      const result = await service.findAll({ page: 1, limit: 20 });
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('update', () => {
    it('should update statement balance', async () => {
      const updatedRecon = { ...mockReconciliation, statementBalance: 51000 };
      reconciliationRepo.findOne
        .mockResolvedValueOnce(mockReconciliation as any)
        .mockResolvedValueOnce(updatedRecon as any);
      reconciliationRepo.save.mockResolvedValue(updatedRecon as any);

      const result = await service.update('recon-001', { statementBalance: 51000 });
      expect(result).toBeDefined();
    });

    it('should throw BadRequestException if reconciliation is completed', async () => {
      reconciliationRepo.findOne.mockResolvedValue({
        ...mockReconciliation,
        status: BankReconciliationStatus.COMPLETED,
      } as any);

      await expect(
        service.update('recon-001', { statementBalance: 51000 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if not found', async () => {
      reconciliationRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { statementBalance: 51000 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should soft delete an in-progress reconciliation', async () => {
      reconciliationRepo.findOne.mockResolvedValue(mockReconciliation as any);
      reconciliationRepo.softDelete.mockResolvedValue({ affected: 1 } as any);

      await service.remove('recon-001');
      expect(reconciliationRepo.softDelete).toHaveBeenCalledWith('recon-001');
    });

    it('should throw BadRequestException if reconciliation is completed', async () => {
      reconciliationRepo.findOne.mockResolvedValue({
        ...mockReconciliation,
        status: BankReconciliationStatus.COMPLETED,
      } as any);

      await expect(service.remove('recon-001')).rejects.toThrow(BadRequestException);
    });
  });

  describe('markCleared', () => {
    it('should mark transactions as cleared', async () => {
      const mockTxn = { reconciliationId: 'recon-001', journalEntryLineId: 'line-001', cleared: false };

      reconciliationRepo.findOne
        .mockResolvedValueOnce(mockReconciliation as any)
        .mockResolvedValueOnce(mockReconciliation as any)
        .mockResolvedValueOnce(mockReconciliation as any);
      reconciledTxnRepo.findOne.mockResolvedValue(mockTxn as any);
      reconciledTxnRepo.save.mockResolvedValue({ ...mockTxn, cleared: true } as any);
      reconciledTxnRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder() as any);
      reconciliationRepo.save.mockResolvedValue(mockReconciliation as any);

      const result = await service.markCleared('recon-001', {
        journalEntryLineIds: ['line-001'],
      });
      expect(result).toBeDefined();
    });

    it('should throw BadRequestException if reconciliation is completed', async () => {
      reconciliationRepo.findOne.mockResolvedValue({
        ...mockReconciliation,
        status: BankReconciliationStatus.COMPLETED,
      } as any);

      await expect(
        service.markCleared('recon-001', { journalEntryLineIds: ['line-001'] }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('complete', () => {
    it('should complete a balanced reconciliation', async () => {
      const balancedRecon = { ...mockReconciliation, isBalanced: true };
      reconciliationRepo.findOne
        .mockResolvedValueOnce(balancedRecon as any)
        .mockResolvedValueOnce(balancedRecon as any)
        .mockResolvedValueOnce(balancedRecon as any)
        .mockResolvedValueOnce({
          ...balancedRecon,
          status: BankReconciliationStatus.COMPLETED,
        } as any);
      reconciledTxnRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder() as any);
      reconciliationRepo.save.mockResolvedValue({
        ...balancedRecon,
        status: BankReconciliationStatus.COMPLETED,
      } as any);

      const result = await service.complete('recon-001');
      expect(result).toBeDefined();
    });

    it('should throw BadRequestException if already completed', async () => {
      reconciliationRepo.findOne.mockResolvedValue({
        ...mockReconciliation,
        status: BankReconciliationStatus.COMPLETED,
      } as any);

      await expect(service.complete('recon-001')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if not balanced', async () => {
      const unbalancedRecon = {
        ...mockReconciliation,
        isBalanced: false,
        difference: 250,
        statementBalance: 50250,
        bookBalance: 50000,
      };
      reconciliationRepo.findOne
        .mockResolvedValueOnce(unbalancedRecon as any)
        .mockResolvedValueOnce(unbalancedRecon as any)
        .mockResolvedValueOnce(unbalancedRecon as any);
      reconciledTxnRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder() as any);
      reconciliationRepo.save.mockResolvedValue(unbalancedRecon as any);

      await expect(service.complete('recon-001')).rejects.toThrow(BadRequestException);
    });
  });

  describe('reopen', () => {
    it('should reopen a completed reconciliation', async () => {
      const completedRecon = {
        ...mockReconciliation,
        status: BankReconciliationStatus.COMPLETED,
      };
      reconciliationRepo.findOne
        .mockResolvedValueOnce(completedRecon as any)
        .mockResolvedValueOnce({ ...completedRecon, status: BankReconciliationStatus.IN_PROGRESS } as any);
      reconciliationRepo.save.mockResolvedValue({
        ...completedRecon,
        status: BankReconciliationStatus.IN_PROGRESS,
      } as any);

      const result = await service.reopen('recon-001');
      expect(result).toBeDefined();
    });

    it('should throw BadRequestException if not completed', async () => {
      reconciliationRepo.findOne.mockResolvedValue(mockReconciliation as any);

      await expect(service.reopen('recon-001')).rejects.toThrow(BadRequestException);
    });
  });
});
