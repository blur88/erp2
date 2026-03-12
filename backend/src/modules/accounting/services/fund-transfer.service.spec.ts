import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
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
  let dataSource: jest.Mocked<DataSource>;

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
            create: jest.fn(),
            save: jest.fn(),
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
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn((cb) =>
              cb({
                create: jest.fn().mockReturnValue({}),
                save: jest
                  .fn()
                  .mockResolvedValue({ id: 'trf-1', referenceNumber: 'TRF-26-001' }),
              }),
            ),
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
    dataSource = module.get(DataSource);
  });

  afterEach(() => jest.clearAllMocks());

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

    it('creates transfer and posts journal entry on success', async () => {
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
        status: FundTransferStatus.ACTIVE,
        journalEntryId: 'je-1',
        sourceAccount: mockCashAccount('acc-1'),
        destinationAccount: mockCashAccount('acc-2'),
        journalEntry: {
          id: 'je-1',
          referenceNumber: 'JE-26-001',
          status: 'POSTED',
        },
      } as any;

      dataSource.transaction.mockImplementation(async (cb: any) =>
        cb({
          create: jest.fn().mockReturnValue(savedTransfer),
          save: jest.fn().mockResolvedValue(savedTransfer),
        }),
      );

      transferRepository.findOne.mockResolvedValue(savedTransfer);
      (accountingService as any).postFundTransferEntry.mockResolvedValue({ id: 'je-1' } as any);

      const result = await service.create(dto, 'user-1');

      expect((accountingService as any).postFundTransferEntry).toHaveBeenCalled();
      expect(auditLogService.log).toHaveBeenCalledWith(
        'CREATE',
        'FundTransfer',
        expect.any(String),
        expect.any(Object),
      );
      expect(result).toBeDefined();
    });
  });

  describe('cancel', () => {
    it('throws NotFoundException when transfer not found', async () => {
      transferRepository.findOne.mockResolvedValue(null);
      await expect(service.cancel('trf-1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when already cancelled', async () => {
      transferRepository.findOne.mockResolvedValue({
        id: 'trf-1',
        status: FundTransferStatus.CANCELLED,
      } as any);
      await expect(service.cancel('trf-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when journalEntryId is null', async () => {
      transferRepository.findOne.mockResolvedValue({
        id: 'trf-1',
        status: FundTransferStatus.ACTIVE,
        journalEntryId: null,
      } as any);
      await expect(service.cancel('trf-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('cancels transfer and reverses journal entry on success', async () => {
      const transfer = {
        id: 'trf-1',
        referenceNumber: 'TRF-26-001',
        status: FundTransferStatus.ACTIVE,
        journalEntryId: 'je-1',
      } as any;

      transferRepository.findOne
        .mockResolvedValueOnce(transfer)
        .mockResolvedValueOnce({
          ...transfer,
          status: FundTransferStatus.CANCELLED,
          journalEntry: {
            id: 'je-1',
            referenceNumber: 'JE-26-001',
            status: 'REVERSED',
          },
        } as any);

      transferRepository.save.mockResolvedValue({
        ...transfer,
        status: FundTransferStatus.CANCELLED,
      } as any);
      accountingService.reverseSourceEntries.mockResolvedValue(undefined);

      const result = await service.cancel('trf-1', 'user-1');

      expect(accountingService.reverseSourceEntries).toHaveBeenCalledWith(
        'fund_transfer',
        'trf-1',
        'user-1',
      );
      expect(transferRepository.save).toHaveBeenCalled();
      expect(auditLogService.log).toHaveBeenCalledWith(
        'CANCEL',
        'FundTransfer',
        expect.any(String),
        expect.any(Object),
      );
      expect(result).toBeDefined();
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when not found', async () => {
      transferRepository.findOne.mockResolvedValue(null);
      await expect(service.findOne('trf-1')).rejects.toThrow(NotFoundException);
    });

    it('returns transfer when found', async () => {
      const transfer = { id: 'trf-1', status: FundTransferStatus.ACTIVE } as any;
      transferRepository.findOne.mockResolvedValue(transfer);
      const result = await service.findOne('trf-1');
      expect(result).toBeDefined();
    });
  });
});
