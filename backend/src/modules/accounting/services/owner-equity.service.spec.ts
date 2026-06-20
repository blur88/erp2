import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { OwnerEquityService } from './owner-equity.service';
import {
  OwnerEquityTransaction,
  OwnerEquityTransactionStatus,
  OwnerEquityTransactionType,
} from '../../../database/entities/owner-equity-transaction.entity';
import { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';
import { AccountingService } from './accounting.service';
import { SettingsService } from '../../settings/settings.service';
import { AuditLogService } from '../../audit-logs/services';

describe('OwnerEquityService', () => {
  let service: OwnerEquityService;
  let ownerEquityRepository: jest.Mocked<Repository<OwnerEquityTransaction>>;
  let paymentMethodRepository: jest.Mocked<Repository<PaymentMethodEntity>>;
  let accountingService: jest.Mocked<AccountingService>;
  let settingsService: jest.Mocked<SettingsService>;
  let auditLogService: jest.Mocked<AuditLogService>;

  const mockQueryBuilder = {
    withDeleted: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OwnerEquityService,
        {
          provide: getRepositoryToken(OwnerEquityTransaction),
          useValue: {
            createQueryBuilder: jest.fn(() => mockQueryBuilder),
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            softDelete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PaymentMethodEntity),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: AccountingService,
          useValue: {
            postOwnerEquityEntry: jest.fn(),
            reverseSourceEntries: jest.fn(),
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

    service = module.get<OwnerEquityService>(OwnerEquityService);
    ownerEquityRepository = module.get(getRepositoryToken(OwnerEquityTransaction));
    paymentMethodRepository = module.get(getRepositoryToken(PaymentMethodEntity));
    accountingService = module.get(AccountingService);
    settingsService = module.get(SettingsService);
    auditLogService = module.get(AuditLogService);

    settingsService.generateDocumentNumber.mockResolvedValue('EQ-26-001');

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('findAll returns paginated results', async () => {
    const tx = {
      id: 'tx-1',
      referenceNumber: 'EQ-1',
      transactionDate: new Date('2026-02-01'),
      type: OwnerEquityTransactionType.CAPITAL_INJECTION,
      amount: 100,
      paymentMethodId: 'pm-1',
      status: OwnerEquityTransactionStatus.DRAFT,
      paymentMethod: { id: 'pm-1', code: 'CASH', name: 'Cash' },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;
    mockQueryBuilder.getManyAndCount.mockResolvedValue([[tx], 1]);

    const result = await service.findAll({ page: 1, limit: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
    expect(mockQueryBuilder.withDeleted).toHaveBeenCalled();
  });

  it('returns full set when page/limit absent', async () => {
    mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

    await service.findAll({} as any);

    expect(mockQueryBuilder.skip).not.toHaveBeenCalled();
  });

  it('paginates when page/limit present', async () => {
    mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

    await service.findAll({ page: 2, limit: 20 } as any);

    expect(mockQueryBuilder.skip).toHaveBeenCalledWith(20);
    expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
  });

  it('findAll ignores invalid query filters', async () => {
    mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

    await service.findAll({
      page: 1,
      limit: 20,
      type: 'invalid_type' as any,
      status: 'invalid_status',
    });

    expect(mockQueryBuilder.andWhere).not.toHaveBeenCalledWith('oet.type = :type', {
      type: 'invalid_type',
    });
    expect(mockQueryBuilder.andWhere).not.toHaveBeenCalledWith('oet.status = :status', {
      status: 'invalid_status',
    });
    expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
    expect(mockQueryBuilder.take).toHaveBeenCalledWith(20);
  });

  it('findOne returns a single transaction', async () => {
    ownerEquityRepository.findOne.mockResolvedValue({
      id: 'tx-1',
      referenceNumber: 'EQ-1',
      transactionDate: new Date('2026-02-01'),
      type: OwnerEquityTransactionType.CAPITAL_INJECTION,
      amount: 100,
      paymentMethodId: 'pm-1',
      status: OwnerEquityTransactionStatus.DRAFT,
      paymentMethod: { id: 'pm-1', code: 'CASH', name: 'Cash' },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const result = await service.findOne('tx-1');
    expect(result.id).toBe('tx-1');
    expect(ownerEquityRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'tx-1' },
      relations: { paymentMethod: true },
      withDeleted: true,
    });
  });

  it('findOne throws NotFoundException for missing id', async () => {
    ownerEquityRepository.findOne.mockResolvedValue(null);
    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('create creates a draft transaction', async () => {
    paymentMethodRepository.findOne.mockResolvedValue({
      id: 'pm-1',
      isActive: true,
    } as any);

    ownerEquityRepository.create.mockReturnValue({
      id: 'tx-1',
      referenceNumber: 'EQ-26-001',
      transactionDate: new Date('2026-02-01'),
      type: OwnerEquityTransactionType.CAPITAL_INJECTION,
      amount: 100,
      paymentMethodId: 'pm-1',
      status: OwnerEquityTransactionStatus.DRAFT,
    } as any);

    ownerEquityRepository.save.mockResolvedValue({ id: 'tx-1' } as any);
    ownerEquityRepository.findOne.mockResolvedValue({
      id: 'tx-1',
      referenceNumber: 'EQ-1',
      transactionDate: new Date('2026-02-01'),
      type: OwnerEquityTransactionType.CAPITAL_INJECTION,
      amount: 100,
      paymentMethodId: 'pm-1',
      status: OwnerEquityTransactionStatus.DRAFT,
      paymentMethod: { id: 'pm-1', code: 'CASH', name: 'Cash' },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const result = await service.create({
      transactionDate: '2026-02-01',
      type: OwnerEquityTransactionType.CAPITAL_INJECTION,
      amount: 100,
      paymentMethodId: 'pm-1',
    });

    expect(settingsService.generateDocumentNumber).toHaveBeenCalledWith('Owner Equity');
    expect(result.status).toBe(OwnerEquityTransactionStatus.DRAFT);
  });

  it('create throws NotFoundException for invalid payment method', async () => {
    paymentMethodRepository.findOne.mockResolvedValue(null);

    await expect(
      service.create({
        transactionDate: '2026-02-01',
        type: OwnerEquityTransactionType.CAPITAL_INJECTION,
        amount: 100,
        paymentMethodId: 'pm-x',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('update updates a draft transaction', async () => {
    ownerEquityRepository.findOne.mockResolvedValueOnce({
      id: 'tx-1',
      status: OwnerEquityTransactionStatus.DRAFT,
      paymentMethodId: 'pm-1',
    } as any);
    ownerEquityRepository.save.mockResolvedValue({} as any);
    ownerEquityRepository.findOne.mockResolvedValueOnce({
      id: 'tx-1',
      referenceNumber: 'EQ-1',
      transactionDate: new Date('2026-02-02'),
      type: OwnerEquityTransactionType.OWNER_DRAWING,
      amount: 125,
      paymentMethodId: 'pm-1',
      status: OwnerEquityTransactionStatus.DRAFT,
      paymentMethod: { id: 'pm-1', code: 'CASH', name: 'Cash' },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const result = await service.update('tx-1', {
      amount: 125,
      type: OwnerEquityTransactionType.OWNER_DRAWING,
      transactionDate: '2026-02-02',
    });

    expect(result.amount).toBe(125);
    expect(result.type).toBe(OwnerEquityTransactionType.OWNER_DRAWING);
  });

  it('update throws BadRequestException for posted transaction', async () => {
    ownerEquityRepository.findOne.mockResolvedValue({
      id: 'tx-1',
      status: OwnerEquityTransactionStatus.POSTED,
    } as any);

    await expect(service.update('tx-1', { amount: 90 })).rejects.toThrow(BadRequestException);
  });

  it('update throws BadRequestException for reversed transaction', async () => {
    ownerEquityRepository.findOne.mockResolvedValue({
      id: 'tx-1',
      status: 'reversed' as OwnerEquityTransactionStatus,
      deletedAt: null,
    } as any);

    await expect(service.update('tx-1', { amount: 90 })).rejects.toThrow(BadRequestException);
  });

  it('remove soft-deletes a draft transaction', async () => {
    ownerEquityRepository.findOne.mockResolvedValue({
      id: 'tx-1',
      status: OwnerEquityTransactionStatus.DRAFT,
    } as any);

    await service.remove('tx-1');
    expect(ownerEquityRepository.softDelete).toHaveBeenCalledWith('tx-1');
  });

  it('remove throws BadRequestException for posted transaction', async () => {
    ownerEquityRepository.findOne.mockResolvedValue({
      id: 'tx-1',
      status: OwnerEquityTransactionStatus.POSTED,
    } as any);

    await expect(service.remove('tx-1')).rejects.toThrow(BadRequestException);
  });

  it('remove throws BadRequestException for reversed transaction', async () => {
    ownerEquityRepository.findOne.mockResolvedValue({
      id: 'tx-1',
      status: 'reversed' as OwnerEquityTransactionStatus,
      deletedAt: null,
    } as any);

    await expect(service.remove('tx-1')).rejects.toThrow(BadRequestException);
  });

  it('post calls accountingService.postOwnerEquityEntry and updates status to POSTED', async () => {
    ownerEquityRepository.findOne.mockResolvedValueOnce({
      id: 'tx-1',
      referenceNumber: 'EQ-1',
      type: OwnerEquityTransactionType.CAPITAL_INJECTION,
      amount: 100,
      transactionDate: new Date('2026-02-01'),
      paymentMethodId: 'pm-1',
      status: OwnerEquityTransactionStatus.DRAFT,
      paymentMethod: { code: 'CASH', name: 'Cash' },
    } as any);

    accountingService.postOwnerEquityEntry.mockResolvedValue({ id: 'je-1' } as any);
    ownerEquityRepository.save.mockResolvedValue({} as any);
    ownerEquityRepository.findOne.mockResolvedValueOnce({
      id: 'tx-1',
      referenceNumber: 'EQ-1',
      transactionDate: new Date('2026-02-01'),
      type: OwnerEquityTransactionType.CAPITAL_INJECTION,
      amount: 100,
      paymentMethodId: 'pm-1',
      status: OwnerEquityTransactionStatus.POSTED,
      journalEntryId: 'je-1',
      paymentMethod: { id: 'pm-1', code: 'CASH', name: 'Cash' },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const result = await service.post('tx-1');

    expect(accountingService.postOwnerEquityEntry).toHaveBeenCalled();
    expect(result.status).toBe(OwnerEquityTransactionStatus.POSTED);
    expect(result.journalEntryId).toBe('je-1');
    expect(ownerEquityRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'tx-1' },
      relations: { paymentMethod: true },
      withDeleted: true,
    });
  });

  it('post throws BadRequestException if already posted', async () => {
    ownerEquityRepository.findOne.mockResolvedValue({
      id: 'tx-1',
      status: OwnerEquityTransactionStatus.POSTED,
    } as any);

    await expect(service.post('tx-1')).rejects.toThrow(BadRequestException);
  });

  it('post throws BadRequestException for reversed transaction', async () => {
    ownerEquityRepository.findOne.mockResolvedValue({
      id: 'tx-1',
      status: 'reversed' as OwnerEquityTransactionStatus,
      deletedAt: null,
    } as any);

    await expect(service.post('tx-1')).rejects.toThrow(BadRequestException);
  });

  describe('reverse', () => {
    const postedTransaction = {
      id: 'oe-1',
      referenceNumber: 'OE-001',
      status: OwnerEquityTransactionStatus.POSTED,
      deletedAt: null,
      paymentMethod: { id: 'pm-1', code: 'CASH', name: 'Cash' },
    } as any;

    it('throws NotFoundException when transaction is not found', async () => {
      ownerEquityRepository.findOne.mockResolvedValue(null);

      await expect(service.reverse('oe-1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when status is DRAFT', async () => {
      ownerEquityRepository.findOne.mockResolvedValue({
        ...postedTransaction,
        status: OwnerEquityTransactionStatus.DRAFT,
      });

      await expect(service.reverse('oe-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when status is already REVERSED', async () => {
      ownerEquityRepository.findOne.mockResolvedValue({
        ...postedTransaction,
        status: 'reversed' as OwnerEquityTransactionStatus,
      });

      await expect(service.reverse('oe-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('calls reverseSourceEntries with correct sourceType and id', async () => {
      const reversedTx = { ...postedTransaction, status: 'reversed' as OwnerEquityTransactionStatus };

      ownerEquityRepository.findOne
        .mockResolvedValueOnce({ ...postedTransaction })
        .mockResolvedValueOnce(reversedTx);
      accountingService.reverseSourceEntries.mockResolvedValue(undefined);
      ownerEquityRepository.save.mockResolvedValue(reversedTx);

      await service.reverse('oe-1', 'user-1');

      expect(accountingService.reverseSourceEntries).toHaveBeenCalledWith(
        'owner_equity_transaction',
        'oe-1',
        'user-1',
      );
    });

    it('sets status to REVERSED and saves', async () => {
      const tx = { ...postedTransaction };
      const reversedTx = { ...tx, status: 'reversed' as OwnerEquityTransactionStatus };

      ownerEquityRepository.findOne
        .mockResolvedValueOnce(tx)
        .mockResolvedValueOnce(reversedTx);
      accountingService.reverseSourceEntries.mockResolvedValue(undefined);
      ownerEquityRepository.save.mockResolvedValue(reversedTx);

      await service.reverse('oe-1', 'user-1');

      expect(ownerEquityRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'reversed' }),
      );
    });

    it('calls auditLogService with REVERSE action', async () => {
      const reversedTx = { ...postedTransaction, status: 'reversed' as OwnerEquityTransactionStatus };

      ownerEquityRepository.findOne
        .mockResolvedValueOnce({ ...postedTransaction })
        .mockResolvedValueOnce(reversedTx);
      accountingService.reverseSourceEntries.mockResolvedValue(undefined);
      ownerEquityRepository.save.mockResolvedValue(reversedTx);

      await service.reverse('oe-1', 'user-1', 'admin');

      expect(auditLogService.log).toHaveBeenCalledWith(
        'REVERSE',
        'OwnerEquity',
        expect.stringContaining('OE-001'),
        expect.objectContaining({ userId: 'user-1', username: 'admin' }),
      );
    });

    it('propagates error from reverseSourceEntries without updating status', async () => {
      const tx = { ...postedTransaction };
      ownerEquityRepository.findOne.mockResolvedValue(tx);
      accountingService.reverseSourceEntries.mockRejectedValue(
        new BadRequestException('No open fiscal period'),
      );

      await expect(service.reverse('oe-1', 'user-1')).rejects.toThrow('No open fiscal period');
      expect(ownerEquityRepository.save).not.toHaveBeenCalled();
    });
  });
});
