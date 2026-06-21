import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { FundTransferService } from './fund-transfer.service';
import {
  FundTransfer,
  FundTransferStatus,
} from '../../../database/entities/fund-transfer.entity';
import { ChartOfAccount } from '../../../database/entities/chart-of-account.entity';
import { AccountingService } from './accounting.service';
import { SettingsService } from '../../settings/settings.service';
import { AuditLogService } from '../../audit-logs/services';
import { FiscalPeriodService } from './fiscal-period.service';

describe('FundTransferService', () => {
  let service: FundTransferService;
  let transferRepository: jest.Mocked<Repository<FundTransfer>>;
  let coaRepository: jest.Mocked<Repository<ChartOfAccount>>;
  let accountingService: jest.Mocked<AccountingService>;
  let settingsService: jest.Mocked<SettingsService>;
  let fiscalPeriodService: jest.Mocked<FiscalPeriodService>;
  let auditLogService: jest.Mocked<AuditLogService>;

  const mockCashAccount = (id: string) =>
    ({
      id,
      code: '1001',
      name: 'Cash',
      type: 'ASSET',
      isActive: true,
      deletedAt: null,
      isCashEquivalent: true,
    }) as any;

  const mockQueryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FundTransferService,
        {
          provide: getRepositoryToken(FundTransfer),
          useValue: {
            createQueryBuilder: jest.fn(() => mockQueryBuilder),
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            softDelete: jest.fn(),
            restore: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ChartOfAccount),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: AccountingService,
          useValue: {
            postFundTransferEntry: jest.fn(),
            reverseSourceEntries: jest.fn(),
          },
        },
        {
          provide: SettingsService,
          useValue: {
            generateDocumentNumber: jest.fn().mockResolvedValue('TRF-26-001'),
          },
        },
        {
          provide: FiscalPeriodService,
          useValue: {
            validatePeriod: jest.fn(),
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

    service = module.get<FundTransferService>(FundTransferService);
    transferRepository = module.get(getRepositoryToken(FundTransfer));
    coaRepository = module.get(getRepositoryToken(ChartOfAccount));
    accountingService = module.get(AccountingService);
    settingsService = module.get(SettingsService);
    fiscalPeriodService = module.get(FiscalPeriodService);
    auditLogService = module.get(AuditLogService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAll', () => {
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
  });

  describe('create', () => {
    const dto = {
      sourceAccountId: 'acc-1',
      destinationAccountId: 'acc-2',
      amount: 500,
      transferDate: '2026-03-12',
    };

    it('throws BadRequestException when source and destination are the same', async () => {
      await expect(
        service.create({ ...dto, destinationAccountId: 'acc-1' }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when source account is not cash equivalent', async () => {
      coaRepository.findOne
        .mockResolvedValueOnce({
          ...mockCashAccount('acc-1'),
          isCashEquivalent: false,
        } as any)
        .mockResolvedValueOnce(mockCashAccount('acc-2'));

      await expect(service.create(dto, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when destination account is not cash equivalent', async () => {
      coaRepository.findOne
        .mockResolvedValueOnce(mockCashAccount('acc-1'))
        .mockResolvedValueOnce({
          ...mockCashAccount('acc-2'),
          isCashEquivalent: false,
        } as any);

      await expect(service.create(dto, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when source account does not exist', async () => {
      coaRepository.findOne.mockResolvedValueOnce(null);

      await expect(service.create(dto, 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when amount is zero or negative', async () => {
      coaRepository.findOne
        .mockResolvedValueOnce(mockCashAccount('acc-1'))
        .mockResolvedValueOnce(mockCashAccount('acc-2'));

      await expect(service.create({ ...dto, amount: 0 }, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when no open fiscal period', async () => {
      coaRepository.findOne
        .mockResolvedValueOnce(mockCashAccount('acc-1'))
        .mockResolvedValueOnce(mockCashAccount('acc-2'));
      fiscalPeriodService.validatePeriod.mockResolvedValue({
        isValid: false,
        period: null,
      } as any);

      await expect(service.create(dto, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('creates a draft transfer without posting a journal entry', async () => {
      coaRepository.findOne
        .mockResolvedValueOnce(mockCashAccount('acc-1'))
        .mockResolvedValueOnce(mockCashAccount('acc-2'));
      fiscalPeriodService.validatePeriod.mockResolvedValue({
        isValid: true,
        period: { id: 'period-1' },
      } as any);
      const savedTransfer = {
        id: 'trf-1',
        referenceNumber: 'TRF-26-001',
        status: FundTransferStatus.DRAFT,
        sourceAccountId: 'acc-1',
        destinationAccountId: 'acc-2',
        deletedAt: null,
      };
      transferRepository.create.mockReturnValue(savedTransfer as any);
      transferRepository.save.mockResolvedValue(savedTransfer as any);
      transferRepository.findOne.mockResolvedValue({
        ...savedTransfer,
        sourceAccount: mockCashAccount('acc-1'),
        destinationAccount: mockCashAccount('acc-2'),
      } as any);

      const result = await service.create(dto, 'user-1');

      expect(accountingService.postFundTransferEntry).not.toHaveBeenCalled();
      expect(result.status).toBe(FundTransferStatus.DRAFT);
    });
  });

  describe('post', () => {
    const mockDraftTransfer = {
      id: 'trf-1',
      referenceNumber: 'TRF-26-001',
      status: FundTransferStatus.DRAFT,
      deletedAt: null,
      transferDate: new Date('2026-03-12'),
      sourceAccount: mockCashAccount('acc-1'),
      destinationAccount: mockCashAccount('acc-2'),
    };

    it('posts a draft transfer and links journal entry', async () => {
      transferRepository.findOne.mockResolvedValueOnce(mockDraftTransfer as any);
      accountingService.postFundTransferEntry.mockResolvedValue({ id: 'je-1' } as any);
      transferRepository.save.mockResolvedValue({
        ...mockDraftTransfer,
        status: FundTransferStatus.POSTED,
        journalEntryId: 'je-1',
      } as any);
      transferRepository.findOne.mockResolvedValueOnce({
        ...mockDraftTransfer,
        status: FundTransferStatus.POSTED,
        journalEntryId: 'je-1',
      } as any);

      const result = await service.post('trf-1', 'user-1');

      expect(accountingService.postFundTransferEntry).toHaveBeenCalledWith(
        mockDraftTransfer,
        'user-1',
        undefined,
      );
      expect(result.status).toBe(FundTransferStatus.POSTED);
    });

    it('throws BadRequestException when transfer is POSTED', async () => {
      transferRepository.findOne.mockResolvedValue({
        ...mockDraftTransfer,
        status: FundTransferStatus.POSTED,
      } as any);

      await expect(service.post('trf-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('posts a REVERSED transfer back to POSTED', async () => {
      const reversedTransfer = { ...mockDraftTransfer, status: FundTransferStatus.REVERSED };
      transferRepository.findOne.mockResolvedValueOnce(reversedTransfer as any);
      accountingService.postFundTransferEntry.mockResolvedValue({ id: 'je-2' } as any);
      transferRepository.save.mockResolvedValue({} as any);
      transferRepository.findOne.mockResolvedValueOnce({
        ...reversedTransfer,
        status: FundTransferStatus.POSTED,
        journalEntryId: 'je-2',
      } as any);

      const result = await service.post('trf-1', 'user-1');

      expect(result.status).toBe(FundTransferStatus.POSTED);
    });

    it('throws NotFoundException when transfer does not exist', async () => {
      transferRepository.findOne.mockResolvedValue(null);

      await expect(service.post('trf-1', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('unpost', () => {
    const mockPostedTransfer = {
      id: 'trf-1',
      referenceNumber: 'TRF-26-001',
      status: FundTransferStatus.POSTED,
      deletedAt: null,
    };

    it('unposted a posted transfer and sets status to REVERSED', async () => {
      transferRepository.findOne
        .mockResolvedValueOnce(mockPostedTransfer as any)
        .mockResolvedValueOnce({ ...mockPostedTransfer, status: FundTransferStatus.REVERSED } as any);
      accountingService.reverseSourceEntries.mockResolvedValue(undefined);
      transferRepository.save.mockResolvedValue({} as any);

      const result = await service.unpost('trf-1', 'user-1');

      expect(accountingService.reverseSourceEntries).toHaveBeenCalledWith(
        'fund_transfer',
        'trf-1',
        'user-1',
      );
      expect(result.status).toBe(FundTransferStatus.REVERSED);
    });

    it('throws BadRequestException when transfer is not POSTED', async () => {
      transferRepository.findOne.mockResolvedValue({
        ...mockPostedTransfer,
        status: FundTransferStatus.DRAFT,
      } as any);

      await expect(service.unpost('trf-1', 'user-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('soft-deletes a DRAFT transfer', async () => {
      transferRepository.findOne.mockResolvedValue({
        id: 'trf-1',
        referenceNumber: 'TRF-26-001',
        status: FundTransferStatus.DRAFT,
        deletedAt: null,
      } as any);
      transferRepository.softDelete.mockResolvedValue({} as any);

      await service.remove('trf-1', 'user-1');

      expect(transferRepository.softDelete).toHaveBeenCalledWith('trf-1');
    });

    it('throws BadRequestException when trying to delete a POSTED transfer', async () => {
      transferRepository.findOne.mockResolvedValue({
        id: 'trf-1',
        status: FundTransferStatus.POSTED,
        deletedAt: null,
      } as any);

      await expect(service.remove('trf-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('soft-deletes a REVERSED transfer', async () => {
      transferRepository.findOne.mockResolvedValue({
        id: 'trf-1',
        referenceNumber: 'TRF-26-001',
        status: FundTransferStatus.REVERSED,
        deletedAt: null,
      } as any);
      transferRepository.softDelete.mockResolvedValue({} as any);

      await service.remove('trf-1', 'user-1');

      expect(transferRepository.softDelete).toHaveBeenCalledWith('trf-1');
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when not found', async () => {
      transferRepository.findOne.mockResolvedValue(null);
      await expect(service.findOne('trf-1')).rejects.toThrow(NotFoundException);
    });

    it('returns transfer when found', async () => {
      const transfer = { id: 'trf-1', status: FundTransferStatus.DRAFT } as any;
      transferRepository.findOne.mockResolvedValue(transfer);
      const result = await service.findOne('trf-1');
      expect(result).toBeDefined();
    });
  });
});
