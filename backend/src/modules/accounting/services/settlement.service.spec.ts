import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SettlementService } from './settlement.service';
import { Settlement, SettlementStatus } from '../../../database/entities/settlement.entity';
import { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';
import { Payment, SettlementStatusEnum } from '../../../database/entities/payment.entity';
import { AccountingService } from './accounting.service';

describe('SettlementService', () => {
  let service: SettlementService;
  let settlementRepository: jest.Mocked<Repository<Settlement>>;
  let paymentMethodRepository: jest.Mocked<Repository<PaymentMethodEntity>>;
  let paymentRepository: jest.Mocked<Repository<Payment>>;
  let accountingService: jest.Mocked<AccountingService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettlementService,
        {
          provide: getRepositoryToken(Settlement),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PaymentMethodEntity),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Payment),
          useValue: {
            find: jest.fn(),
            update: jest.fn(),
            count: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: AccountingService,
          useValue: {
            postSettlementEntry: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SettlementService>(SettlementService);
    settlementRepository = module.get(getRepositoryToken(Settlement));
    paymentMethodRepository = module.get(getRepositoryToken(PaymentMethodEntity));
    paymentRepository = module.get(getRepositoryToken(Payment));
    accountingService = module.get(AccountingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('create should create settlement and settle payments', async () => {
    paymentMethodRepository.findOne.mockResolvedValue({
      id: 'pm-1',
      code: 'SHOPEE',
      name: 'Shopee',
      requiresSettlement: true,
    } as any);

    paymentRepository.find.mockResolvedValue([
      {
        id: 'p-1',
        paymentNumber: 'PAY-1',
        amount: 100,
        paymentMethodId: 'pm-1',
        settlementStatus: SettlementStatusEnum.PENDING,
      },
    ] as any);

    settlementRepository.create.mockReturnValue({
      paymentMethodId: 'pm-1',
      totalAmount: 100,
      status: SettlementStatus.COMPLETED,
    } as any);

    settlementRepository.save.mockResolvedValue({
      id: 's-1',
      settlementNumber: 'STL-1',
      paymentMethodId: 'pm-1',
      settlementDate: new Date('2026-02-14'),
      totalAmount: 100,
      status: SettlementStatus.COMPLETED,
      paymentMethod: {
        id: 'pm-1',
        code: 'SHOPEE',
        name: 'Shopee',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    settlementRepository.findOne.mockResolvedValue({
      id: 's-1',
      settlementNumber: 'STL-1',
      paymentMethodId: 'pm-1',
      settlementDate: new Date('2026-02-14'),
      totalAmount: 100,
      status: SettlementStatus.COMPLETED,
      paymentMethod: {
        id: 'pm-1',
        code: 'SHOPEE',
        name: 'Shopee',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    paymentRepository.count.mockResolvedValue(1);

    const result = await service.create({
      paymentMethodId: 'pm-1',
      settlementDate: '2026-02-14',
      paymentIds: ['p-1'],
    });

    expect(result.paymentCount).toBe(1);
    expect(paymentRepository.update).toHaveBeenCalled();
    expect(accountingService.postSettlementEntry).toHaveBeenCalled();
  });
});
