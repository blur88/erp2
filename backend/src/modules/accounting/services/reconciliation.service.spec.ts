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
    addOrderBy: jest.fn().mockReturnThis(),
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
            restore: jest.fn(),
            delete: jest.fn(),
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
            delete: jest.fn(),
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

  describe('getDeleted', () => {
    it('returns all soft-deleted reconciliations', async () => {
      const deletedRecon = {
        ...mockReconciliation,
        id: 'recon-deleted-1',
        deletedAt: new Date('2026-02-01'),
        isActive: false,
      };
      reconciliationRepo.find.mockResolvedValue([deletedRecon] as any);

      const result = await service.getDeleted();

      expect(reconciliationRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ withDeleted: true }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('recon-deleted-1');
    });

    it('returns empty array when no deleted reconciliations', async () => {
      reconciliationRepo.find.mockResolvedValue([]);

      const result = await service.getDeleted();

      expect(result).toHaveLength(0);
    });
  });

  describe('restore', () => {
    it('restores a soft-deleted reconciliation', async () => {
      const deletedRecon = {
        ...mockReconciliation,
        deletedAt: new Date('2026-02-01'),
        isActive: false,
      };
      reconciliationRepo.findOne
        .mockResolvedValueOnce(deletedRecon as any)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          ...deletedRecon,
          deletedAt: null,
          isActive: true,
          reconciledTransactions: [],
        } as any);
      reconciliationRepo.restore.mockResolvedValue(undefined as any);
      reconciliationRepo.save.mockResolvedValue({
        ...deletedRecon,
        deletedAt: null,
        isActive: true,
      } as any);

      const result = await service.restore('recon-001', 'user-1', 'admin');

      expect(reconciliationRepo.restore).toHaveBeenCalledWith('recon-001');
      expect(result.id).toBe('recon-001');
    });

    it('throws NotFoundException when id does not exist', async () => {
      reconciliationRepo.findOne.mockResolvedValue(null);

      await expect(service.restore('bad-id')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when reconciliation is not deleted', async () => {
      reconciliationRepo.findOne.mockResolvedValue(mockReconciliation as any);

      await expect(service.restore('recon-001')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when an IN_PROGRESS reconciliation already exists for same account+period', async () => {
      const deletedRecon = {
        ...mockReconciliation,
        deletedAt: new Date('2026-02-01'),
        isActive: false,
      };
      reconciliationRepo.findOne
        .mockResolvedValueOnce(deletedRecon as any)
        .mockResolvedValueOnce(mockReconciliation as any);

      await expect(service.restore('recon-001')).rejects.toThrow(BadRequestException);
    });
  });

  describe('permanentDelete', () => {
    it('permanently deletes a reconciliation', async () => {
      const deletedRecon = { ...mockReconciliation, deletedAt: new Date('2026-02-01') };
      reconciliationRepo.findOne.mockResolvedValue(deletedRecon as any);
      reconciliationRepo.delete.mockResolvedValue({ affected: 1 } as any);

      await expect(service.permanentDelete('recon-001', 'user-1', 'admin')).resolves.toBeUndefined();
      expect(reconciliationRepo.delete).toHaveBeenCalledWith('recon-001');
    });

    it('throws NotFoundException when id does not exist', async () => {
      reconciliationRepo.findOne.mockResolvedValue(null);

      await expect(service.permanentDelete('bad-id')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when reconciliation is not soft-deleted', async () => {
      reconciliationRepo.findOne.mockResolvedValue(mockReconciliation as any);

      await expect(service.permanentDelete('recon-001')).rejects.toThrow(BadRequestException);
    });
  });

  describe('bulkRestore', () => {
    it('returns zero counts for empty input', async () => {
      const result = await service.bulkRestore([]);
      expect(result).toEqual({ restoredCount: 0, failedIds: [] });
    });

    it('restores all ids and returns restoredCount', async () => {
      const deletedRecon = { ...mockReconciliation, deletedAt: new Date('2026-02-01'), isActive: false };
      const restoredRecon = { ...deletedRecon, deletedAt: null, isActive: true, reconciledTransactions: [] };
      reconciliationRepo.findOne
        .mockResolvedValueOnce(deletedRecon as any)  // restore: withDeleted lookup
        .mockResolvedValueOnce(null as any)           // restore: duplicate check
        .mockResolvedValueOnce(restoredRecon as any); // findOne for response
      reconciliationRepo.restore.mockResolvedValue(undefined as any);
      reconciliationRepo.save.mockResolvedValue(restoredRecon as any);

      const result = await service.bulkRestore(['recon-001'], 'user-1', 'admin');

      expect(result.restoredCount).toBe(1);
      expect(result.failedIds).toEqual([]);
    });

    it('collects failedIds when restore throws', async () => {
      reconciliationRepo.findOne.mockResolvedValue(null);

      const result = await service.bulkRestore(['bad-id'], 'user-1', 'admin');

      expect(result.restoredCount).toBe(0);
      expect(result.failedIds).toEqual(['bad-id']);
    });
  });

  describe('bulkPermanentDelete', () => {
    it('returns zero counts for empty input', async () => {
      const result = await service.bulkPermanentDelete([]);
      expect(result).toEqual({ deletedCount: 0, failedIds: [] });
    });

    it('permanently deletes all ids and returns deletedCount', async () => {
      const deletedRecon = { ...mockReconciliation, deletedAt: new Date('2026-02-01') };
      reconciliationRepo.findOne.mockResolvedValue(deletedRecon as any);
      reconciliationRepo.delete.mockResolvedValue({ affected: 1 } as any);

      const result = await service.bulkPermanentDelete(['recon-001'], 'user-1', 'admin');

      expect(result.deletedCount).toBe(1);
      expect(result.failedIds).toEqual([]);
    });

    it('collects failedIds when permanentDelete throws', async () => {
      reconciliationRepo.findOne.mockResolvedValue(null);

      const result = await service.bulkPermanentDelete(['bad-id'], 'user-1', 'admin');

      expect(result.deletedCount).toBe(0);
      expect(result.failedIds).toEqual(['bad-id']);
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

    it('should apply secondary sort by account name ASC', async () => {
      const queryBuilder = createMockQueryBuilder([mockReconciliation], 1);
      reconciliationRepo.createQueryBuilder.mockReturnValue(queryBuilder as any);

      await service.findAll({ page: 1, limit: 20 });

      expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('account.name', 'ASC');
    });

    it('should search by account and fiscal period fields', async () => {
      const queryBuilder = createMockQueryBuilder([mockReconciliation], 1);
      reconciliationRepo.createQueryBuilder.mockReturnValue(queryBuilder as any);

      await service.findAll({ page: 1, limit: 20, search: 'cash' } as any);

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        '(account.name ILIKE :search OR account.code ILIKE :search OR fiscalPeriod.name ILIKE :search)',
        { search: '%cash%' },
      );
    });

    it('should filter by startDate', async () => {
      const queryBuilder = createMockQueryBuilder([mockReconciliation], 1);
      reconciliationRepo.createQueryBuilder.mockReturnValue(queryBuilder as any);

      await service.findAll({ page: 1, limit: 20, startDate: '2026-01-01' } as any);

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'recon.reconciliationDate >= :startDate',
        { startDate: '2026-01-01' },
      );
    });

    it('should filter by endDate', async () => {
      const queryBuilder = createMockQueryBuilder([mockReconciliation], 1);
      reconciliationRepo.createQueryBuilder.mockReturnValue(queryBuilder as any);

      await service.findAll({ page: 1, limit: 20, endDate: '2026-12-31' } as any);

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'recon.reconciliationDate <= :endDate',
        { endDate: '2026-12-31' },
      );
    });

    it('should filter balanced reconciliations (difference = 0)', async () => {
      const queryBuilder = createMockQueryBuilder([mockReconciliation], 1);
      reconciliationRepo.createQueryBuilder.mockReturnValue(queryBuilder as any);

      await service.findAll({ page: 1, limit: 20, isBalanced: true } as any);

      expect(queryBuilder.andWhere).toHaveBeenCalledWith('ABS(recon.difference) < 0.01');
    });

    it('should filter unbalanced reconciliations (difference != 0)', async () => {
      const queryBuilder = createMockQueryBuilder([mockReconciliation], 1);
      reconciliationRepo.createQueryBuilder.mockReturnValue(queryBuilder as any);

      await service.findAll({ page: 1, limit: 20, isBalanced: false } as any);

      expect(queryBuilder.andWhere).toHaveBeenCalledWith('ABS(recon.difference) >= 0.01');
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

    describe('account change', () => {
      const newAccount = {
        id: 'acct-002',
        code: '1001',
        name: 'Bank Account',
        type: 'ASSET',
        isActive: true,
      };

      it('deletes all transactions, reloads for new account, resets statementBalance to 0', async () => {
        const existingRecon = {
          ...mockReconciliation,
          accountId: 'acct-001',
          statementBalance: 50000,
        };
        const existingTxns = [
          { id: 'txn-1', reconciliationId: 'recon-001', journalEntryLineId: 'line-1', cleared: true },
          { id: 'txn-2', reconciliationId: 'recon-001', journalEntryLineId: 'line-2', cleared: false },
        ];
        const updatedRecon = {
          ...mockReconciliation,
          accountId: 'acct-002',
          statementBalance: 0,
          bookBalance: 30000,
          difference: -30000,
        };

        chartOfAccountRepo.findOne.mockResolvedValue(newAccount as any);
        reconciliationRepo.findOne
          .mockResolvedValueOnce(existingRecon as any)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(updatedRecon as any);
        reconciledTxnRepo.find.mockResolvedValue(existingTxns as any);
        reconciledTxnRepo.delete.mockResolvedValue({ affected: 2 } as any);
        reconciliationRepo.save.mockResolvedValue(updatedRecon as any);
        journalEntryLineRepo.createQueryBuilder.mockReturnValue(
          createMockQueryBuilder([], 0) as any,
        );
        reconciledTxnRepo.create.mockReturnValue({} as any);

        const result = await service.update('recon-001', { accountId: 'acct-002' } as any);

        expect(reconciledTxnRepo.find).not.toHaveBeenCalled();
        expect(reconciledTxnRepo.delete).toHaveBeenCalledWith({ reconciliationId: 'recon-001' });
        expect(result.accountId).toBe('acct-002');
      });

      it('throws NotFoundException when new account does not exist', async () => {
        reconciliationRepo.findOne.mockResolvedValueOnce({
          ...mockReconciliation,
          accountId: 'acct-001',
        } as any);
        chartOfAccountRepo.findOne.mockResolvedValue(null);

        await expect(
          service.update('recon-001', { accountId: 'acct-bad' } as any),
        ).rejects.toThrow(NotFoundException);
      });

      it('throws BadRequestException when new account+period already has an in-progress reconciliation', async () => {
        const duplicateRecon = { ...mockReconciliation, id: 'recon-999', accountId: 'acct-002' };

        chartOfAccountRepo.findOne.mockResolvedValue(newAccount as any);
        reconciliationRepo.findOne
          .mockResolvedValueOnce({
            ...mockReconciliation,
            accountId: 'acct-001',
          } as any)
          .mockResolvedValueOnce(duplicateRecon as any);

        await expect(
          service.update('recon-001', { accountId: 'acct-002' } as any),
        ).rejects.toThrow(BadRequestException);
      });

      it('does not delete or reload transactions when accountId is unchanged (no-op)', async () => {
        const updatedRecon = { ...mockReconciliation, statementBalance: 55000 };

        reconciliationRepo.findOne
          .mockResolvedValueOnce(mockReconciliation as any)
          .mockResolvedValueOnce(updatedRecon as any);
        reconciliationRepo.save.mockResolvedValue(updatedRecon as any);

        // same accountId as current — should be treated as no-op for account change
        await service.update('recon-001', { accountId: 'acct-001', statementBalance: 55000 } as any);

        expect(reconciledTxnRepo.delete).not.toHaveBeenCalled();
        expect(journalEntryLineRepo.createQueryBuilder).not.toHaveBeenCalled();
      });

      it('uses new accountId for duplicate check when both accountId and fiscalPeriodId change simultaneously', async () => {
        const newPeriod = {
          id: 'period-002',
          code: '2026-02',
          name: 'February 2026',
          startDate: new Date('2026-02-01'),
          endDate: new Date('2026-02-28'),
          status: FiscalPeriodStatus.OPEN,
        };
        const updatedRecon = {
          ...mockReconciliation,
          accountId: 'acct-002',
          fiscalPeriodId: 'period-002',
          statementBalance: 0,
        };

        chartOfAccountRepo.findOne.mockResolvedValue(newAccount as any);
        fiscalPeriodRepo.findOne.mockResolvedValue(newPeriod as any);
        reconciliationRepo.findOne
          .mockResolvedValueOnce({ ...mockReconciliation, accountId: 'acct-001', fiscalPeriodId: 'period-001' } as any)
          .mockResolvedValueOnce(null)   // account-change duplicate check
          .mockResolvedValueOnce(null)   // period-change duplicate check
          .mockResolvedValueOnce(updatedRecon as any);
        reconciledTxnRepo.delete.mockResolvedValue({ affected: 0 } as any);
        reconciliationRepo.save.mockResolvedValue(updatedRecon as any);
        journalEntryLineRepo.createQueryBuilder.mockReturnValue(createMockQueryBuilder([], 0) as any);
        reconciledTxnRepo.create.mockReturnValue({} as any);

        const result = await service.update('recon-001', {
          accountId: 'acct-002',
          fiscalPeriodId: 'period-002',
        } as any);

        // Account-change duplicate check must have used the new fiscalPeriodId (period-002)
        expect(reconciliationRepo.findOne).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({ accountId: 'acct-002', fiscalPeriodId: 'period-002' }),
          }),
        );
        expect(result.accountId).toBe('acct-002');
        expect(result.fiscalPeriodId).toBe('period-002');
      });
    });

    describe('fiscal period change', () => {
      const newPeriod = {
        id: 'period-002',
        code: '2026-02',
        name: 'February 2026',
        startDate: new Date('2026-02-01'),
        endDate: new Date('2026-02-28'),
        status: FiscalPeriodStatus.OPEN,
      };

      it('updates fiscal period and leaves transactions untouched', async () => {
        const updatedRecon = { ...mockReconciliation, fiscalPeriodId: 'period-002' };

        fiscalPeriodRepo.findOne.mockResolvedValue(newPeriod as any);
        reconciliationRepo.findOne
          .mockResolvedValueOnce({
            ...mockReconciliation,
            accountId: 'acct-001',
            fiscalPeriodId: 'period-001',
          } as any)
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(updatedRecon as any);
        reconciliationRepo.save.mockResolvedValue(updatedRecon as any);

        const result = await service.update('recon-001', { fiscalPeriodId: 'period-002' } as any);

        expect(reconciledTxnRepo.find).not.toHaveBeenCalled();
        expect(result.fiscalPeriodId).toBe('period-002');
      });

      it('throws NotFoundException when new fiscal period does not exist', async () => {
        reconciliationRepo.findOne.mockResolvedValueOnce({
          ...mockReconciliation,
          fiscalPeriodId: 'period-001',
        } as any);
        fiscalPeriodRepo.findOne.mockResolvedValue(null);

        await expect(
          service.update('recon-001', { fiscalPeriodId: 'period-bad' } as any),
        ).rejects.toThrow(NotFoundException);
      });

      it('throws BadRequestException when new fiscal period is closed', async () => {
        reconciliationRepo.findOne.mockResolvedValueOnce({
          ...mockReconciliation,
          fiscalPeriodId: 'period-001',
        } as any);
        fiscalPeriodRepo.findOne.mockResolvedValue({
          ...newPeriod,
          status: FiscalPeriodStatus.CLOSED,
        } as any);

        await expect(
          service.update('recon-001', { fiscalPeriodId: 'period-002' } as any),
        ).rejects.toThrow(BadRequestException);
      });

      it('throws BadRequestException when account+new period already has an in-progress reconciliation', async () => {
        const duplicateRecon = { ...mockReconciliation, id: 'recon-999', fiscalPeriodId: 'period-002' };

        fiscalPeriodRepo.findOne.mockResolvedValue(newPeriod as any);
        reconciliationRepo.findOne
          .mockResolvedValueOnce({
            ...mockReconciliation,
            accountId: 'acct-001',
            fiscalPeriodId: 'period-001',
          } as any)
          .mockResolvedValueOnce(duplicateRecon as any);

        await expect(
          service.update('recon-001', { fiscalPeriodId: 'period-002' } as any),
        ).rejects.toThrow(BadRequestException);
      });
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
