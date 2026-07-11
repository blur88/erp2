import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { PaymentMethodService } from './payment-method.service';
import { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';
import { Payment } from '../../../database/entities/payment.entity';

describe('PaymentMethodService', () => {
  let service: PaymentMethodService;
  let paymentMethodRepository: jest.Mocked<Repository<PaymentMethodEntity>>;
  let paymentRepository: jest.Mocked<Repository<Payment>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentMethodService,
        {
          provide: getRepositoryToken(PaymentMethodEntity),
          useValue: {
            createQueryBuilder: jest.fn(),
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
          provide: getRepositoryToken(Payment),
          useValue: {
            count: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue({
              delete: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              execute: jest.fn().mockResolvedValue({}),
            }),
          },
        },
      ],
    }).compile();

    service = module.get<PaymentMethodService>(PaymentMethodService);
    paymentMethodRepository = module.get(getRepositoryToken(PaymentMethodEntity));
    paymentRepository = module.get(getRepositoryToken(Payment));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll pagination', () => {
    const createQb = () => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    });

    it('returns full set when page/limit absent', async () => {
      const qb = createQb();
      paymentMethodRepository.createQueryBuilder.mockReturnValue(qb as any);
      await service.findAll({} as any);
      expect(qb.skip).not.toHaveBeenCalled();
    });

    it('paginates when page/limit present', async () => {
      const qb = createQb();
      paymentMethodRepository.createQueryBuilder.mockReturnValue(qb as any);
      await service.findAll({ page: 2, limit: 20 } as any);
      expect(qb.skip).toHaveBeenCalledWith(20);
      expect(qb.take).toHaveBeenCalledWith(20);
    });
  });

  it('findOne should throw NotFoundException when item is missing', async () => {
    paymentMethodRepository.findOne.mockResolvedValue(null);

    await expect(service.findOne('missing-id')).rejects.toThrow(NotFoundException);
  });

  it('create should reject duplicate code', async () => {
    paymentMethodRepository.findOne.mockResolvedValue({
      id: '1',
      code: 'TNG',
      deletedAt: null,
    } as any);

    await expect(
      service.create({ code: 'TNG', name: 'Touch n Go' }),
    ).rejects.toThrow(ConflictException);
  });

  it('getActiveList should return active methods sorted by repository order', async () => {
    paymentMethodRepository.find.mockResolvedValue([
      {
        id: '1',
        code: 'CASH',
        name: 'Cash',
        sortOrder: 1,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
    ] as any);

    const result = await service.getActiveList();

    expect(result).toHaveLength(1);
    expect(result[0].code).toBe('CASH');
  });

  it('remove should throw NotFoundException when method is missing', async () => {
    paymentMethodRepository.findOne.mockResolvedValue(null);

    await expect(service.remove('missing-id')).rejects.toThrow(NotFoundException);
  });

  it('getDeletedList should return soft-deleted payment methods', async () => {
    paymentMethodRepository.find.mockResolvedValue([
      {
        id: 'pm-deleted',
        code: 'TNG',
        name: 'Touch n Go',
        sortOrder: 3,
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(),
      },
    ] as any);

    const result = await service.getDeletedList();

    expect(result).toHaveLength(1);
    expect(result[0].code).toBe('TNG');
  });

  it('restore should restore a soft-deleted payment method', async () => {
    paymentMethodRepository.findOne.mockResolvedValue({
      id: 'pm-deleted',
      code: 'TNG',
      name: 'Touch n Go',
      sortOrder: 3,
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: new Date(),
    } as any);

    paymentMethodRepository.restore.mockResolvedValue({} as any);

    await service.restore('pm-deleted');

    expect(paymentMethodRepository.restore).toHaveBeenCalledWith('pm-deleted');
  });

  it('permanentDelete should throw ConflictException when payment method has payments', async () => {
    paymentMethodRepository.findOne.mockResolvedValue({
      id: 'pm-1',
      code: 'SHOPEE',
      name: 'Shopee',
      deletedAt: new Date(),
    } as any);
    paymentRepository.count.mockResolvedValue(2);

    await expect(service.permanentDelete('pm-1')).rejects.toThrow(ConflictException);
    expect(paymentMethodRepository.delete).not.toHaveBeenCalled();
  });

  it('permanentDelete should delete soft-deleted method when no references exist', async () => {
    paymentMethodRepository.findOne.mockResolvedValue({
      id: 'pm-1',
      code: 'SHOPEE',
      name: 'Shopee',
      deletedAt: new Date(),
    } as any);
    paymentRepository.count.mockResolvedValue(0);
    paymentMethodRepository.delete.mockResolvedValue({} as any);

    await service.permanentDelete('pm-1');

    expect(paymentMethodRepository.delete).toHaveBeenCalledWith('pm-1');
  });

  describe('PaymentMethodEntity accountingChannel', () => {
    it('defaults accountingChannel to BANK when unset', () => {
      const pm = new PaymentMethodEntity();
      pm.code = 'TEST';
      pm.name = 'Test';
      expect(pm.accountingChannel).toBe('BANK');
    });

    it('allows setting accountingChannel to CASH', () => {
      const pm = new PaymentMethodEntity();
      pm.code = 'CASH';
      pm.name = 'Cash';
      pm.accountingChannel = 'CASH';
      expect(pm.accountingChannel).toBe('CASH');
    });
  });
});
