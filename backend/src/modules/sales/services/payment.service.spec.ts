import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentService } from './payment.service';
import { Payment, PaymentStatus } from '../../../database/entities/payment.entity';
import { Customer } from '../../../database/entities/customer.entity';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';
import { AuditLogService } from '../../audit-logs/services';
import { AccountingService } from '../../accounting/services/accounting.service';
import { NotFoundException } from '@nestjs/common';
import { UserRole } from '../../../database/entities/user.entity';
import { SettingsService } from '../../settings/settings.service';

describe('PaymentService', () => {
  let service: PaymentService;
  let paymentRepository: jest.Mocked<Repository<Payment>>;
  let customerRepository: jest.Mocked<Repository<Customer>>;
  let salesOrderRepository: jest.Mocked<Repository<SalesOrder>>;
  let paymentMethodRepository: jest.Mocked<Repository<PaymentMethodEntity>>;
  let accountingService: jest.Mocked<AccountingService>;
  let auditLogService: jest.Mocked<AuditLogService>;
  let settingsService: jest.Mocked<Pick<SettingsService, 'generateDocumentNumber'>>;

  const createMockPayment = (): Partial<Payment> => ({
    id: '123e4567-e89b-12d3-a456-426614174000',
    paymentNumber: 'PAY-26-001',
    amount: 1000,
    paymentDate: new Date('2024-01-15'),
    status: PaymentStatus.COMPLETED,
    paymentMethodId: 'pm-1',
    customerId: 'customer-1',
    customer: {
      id: 'customer-1',
      name: 'Test Customer',
    } as Customer,
  });

  const createMockCustomer = (): Partial<Customer> => ({
    id: 'customer-1',
    name: 'Test Customer',
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        {
          provide: getRepositoryToken(Payment),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Customer),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(SalesOrder),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PaymentMethodEntity),
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
        {
          provide: AccountingService,
          useValue: {
            postCustomerPaymentEntry: jest.fn(),
            reverseSourceEntries: jest.fn(),
          },
        },
        {
          provide: SettingsService,
          useValue: {
            generateDocumentNumber: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
    paymentRepository = module.get(getRepositoryToken(Payment));
    customerRepository = module.get(getRepositoryToken(Customer));
    salesOrderRepository = module.get(getRepositoryToken(SalesOrder));
    paymentMethodRepository = module.get(getRepositoryToken(PaymentMethodEntity));
    accountingService = module.get(AccountingService);
    auditLogService = module.get(AuditLogService);
    settingsService = module.get(SettingsService);
    (settingsService.generateDocumentNumber as jest.Mock).mockResolvedValue('PAY-26-001');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('filters payments by status when status is provided', async () => {
      const mockPayments = [{ id: '1', status: 'completed', paymentNumber: 'PAY-001' }];
      jest.spyOn(paymentRepository, 'createQueryBuilder').mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([mockPayments, 1]),
      } as any);

      const result = await service.findAll({ status: 'completed' as any });

      expect(result.data).toHaveLength(1);
    });
  });

  describe('create', () => {
    it('should post accounting entry successfully', async () => {
      // Arrange
      const createDto = {
        customerId: 'customer-1',
        paymentMethodId: 'pm-1',
        amount: 1000,
        paymentDate: new Date('2024-01-15'),
      };
      const mockCustomer = createMockCustomer();
      const mockPayment = createMockPayment();

      customerRepository.findOne.mockResolvedValue(mockCustomer as Customer);
      paymentMethodRepository.findOne.mockResolvedValue({
        id: 'pm-1',
        code: 'CASH',
        requiresSettlement: false,
      } as any);
      customerRepository.save.mockResolvedValue(mockCustomer as Customer);
      paymentRepository.create.mockReturnValue(mockPayment as Payment);
      paymentRepository.save.mockResolvedValue(mockPayment as Payment);

      // Mock findPaymentWithRelations (called twice - once for accounting, once for return)
      paymentRepository.findOne.mockResolvedValue(mockPayment as Payment);

      auditLogService.log.mockResolvedValue(undefined);
      accountingService.postCustomerPaymentEntry.mockResolvedValue({
        id: 'journal-1',
        referenceNumber: 'JE-000001',
      } as any);

      // Act
      const result = await service.create(createDto);

      // Assert
      expect(settingsService.generateDocumentNumber).toHaveBeenCalledWith('Payments');
      expect(paymentRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ paymentNumber: 'PAY-26-001' }),
      );
      expect(accountingService.postCustomerPaymentEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          id: mockPayment.id,
          paymentNumber: mockPayment.paymentNumber,
          customer: expect.objectContaining({
            id: 'customer-1',
            name: 'Test Customer',
          }),
        }),
        'system',
        undefined,
      );
      expect(result).toBeDefined();
      expect(paymentRepository.save).toHaveBeenCalled();
    });

    it('should continue when accounting post fails', async () => {
      // Arrange
      const createDto = {
        customerId: 'customer-1',
        paymentMethodId: 'pm-1',
        amount: 1000,
        paymentDate: new Date('2024-01-15'),
      };
      const mockCustomer = createMockCustomer();
      const mockPayment = createMockPayment();

      customerRepository.findOne.mockResolvedValue(mockCustomer as Customer);
      paymentMethodRepository.findOne.mockResolvedValue({
        id: 'pm-1',
        code: 'CASH',
        requiresSettlement: false,
      } as any);
      customerRepository.save.mockResolvedValue(mockCustomer as Customer);
      paymentRepository.create.mockReturnValue(mockPayment as Payment);
      paymentRepository.save.mockResolvedValue(mockPayment as Payment);

      // Mock findPaymentWithRelations
      paymentRepository.findOne.mockResolvedValue(mockPayment as Payment);

      auditLogService.log.mockResolvedValue(undefined);
      accountingService.postCustomerPaymentEntry.mockRejectedValue(
        new Error('Account mappings not configured'),
      );

      // Act
      const result = await service.create(createDto);

      // Assert
      expect(accountingService.postCustomerPaymentEntry).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(paymentRepository.save).toHaveBeenCalled();
      // Should not throw error despite accounting failure
    });

    it('should load payment with relations before posting', async () => {
      // Arrange
      const createDto = {
        customerId: 'customer-1',
        paymentMethodId: 'pm-1',
        amount: 1000,
        paymentDate: new Date('2024-01-15'),
      };
      const mockCustomer = createMockCustomer();
      const mockPayment = createMockPayment();

      customerRepository.findOne.mockResolvedValue(mockCustomer as Customer);
      paymentMethodRepository.findOne.mockResolvedValue({
        id: 'pm-1',
        code: 'CASH',
        requiresSettlement: false,
      } as any);
      customerRepository.save.mockResolvedValue(mockCustomer as Customer);
      paymentRepository.create.mockReturnValue(mockPayment as Payment);
      paymentRepository.save.mockResolvedValue(mockPayment as Payment);

      // Mock findPaymentWithRelations
      paymentRepository.findOne.mockResolvedValue(mockPayment as Payment);

      auditLogService.log.mockResolvedValue(undefined);
      accountingService.postCustomerPaymentEntry.mockResolvedValue({
        id: 'journal-1',
      } as any);

      // Act
      await service.create(createDto);

      // Assert
      // Verify findOne was called to get payment with relations before accounting post
      expect(paymentRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockPayment.id },
        relations: {
          customer: true,
          salesOrder: { items: { product: true } },
          paymentMethodEntity: true,
        },
      });

      // Verify the accounting service received the payment with customer relation
      const callArg = accountingService.postCustomerPaymentEntry.mock.calls[0][0];
      expect(callArg).toHaveProperty('customer');
      expect(callArg.customer).toEqual(mockCustomer);
    });

    it('should throw error when customer not found', async () => {
      // Arrange
      const createDto = {
        customerId: 'non-existent-customer',
        paymentMethodId: 'pm-1',
        amount: 1000,
        paymentDate: new Date('2024-01-15'),
      };
      customerRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.create(createDto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('searchGlobal', () => {
    const adminUser = { role: UserRole.ADMIN } as any;

    it('exact payment number match scores SCORE_EXACT_CODE + BOOST_CUSTOMER_PAYMENT + BOOST_EXACT_MATCH', async () => {
      const mockPayment = {
        id: 'pay-1',
        paymentNumber: 'PAY-001',
      };

      paymentRepository.createQueryBuilder.mockReturnValue({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockPayment]),
      } as any);

      const results = await service.searchGlobal('PAY-001', adminUser);

      expect(results[0]).toMatchObject({
        type: 'customer_payment',
        id: 'pay-1',
        label: 'PAY-001',
        route: '/sales/payments/pay-1',
      });
      expect(results[0].score).toBe(148);
    });
  });

  describe('getPaidTotalForSalesOrder', () => {
    it('should return sum of completed payment amounts for a sales order', async () => {
      const mockPayments = [
        {
          id: 'p1',
          amount: 200,
          status: PaymentStatus.COMPLETED,
          salesOrderId: 'so-1',
        },
        {
          id: 'p2',
          amount: 300,
          status: PaymentStatus.COMPLETED,
          salesOrderId: 'so-1',
        },
      ];
      jest.spyOn(paymentRepository, 'find').mockResolvedValue(mockPayments as any);

      const total = await service.getPaidTotalForSalesOrder('so-1');

      expect(total).toBe(500);
    });

    it('should return 0 when no completed payments exist', async () => {
      jest.spyOn(paymentRepository, 'find').mockResolvedValue([]);

      const total = await service.getPaidTotalForSalesOrder('so-1');

      expect(total).toBe(0);
    });

    it('should net out a partial refund (original 100, refund -30 => 70)', async () => {
      // A refund flips the original payment to REFUNDED and adds a negative row,
      // both REFUNDED. Net paid must be the remaining amount, not 0.
      const mockPayments = [
        { id: 'orig', amount: 100, status: PaymentStatus.REFUNDED, salesOrderId: 'so-1' },
        { id: 'refund', amount: -30, status: PaymentStatus.REFUNDED, salesOrderId: 'so-1' },
      ];
      const findSpy = jest
        .spyOn(paymentRepository, 'find')
        .mockResolvedValue(mockPayments as any);

      const total = await service.getPaidTotalForSalesOrder('so-1');

      expect(total).toBe(70);
      // Query must include REFUNDED rows, not just COMPLETED.
      const whereArg = (findSpy.mock.calls[0][0] as any).where;
      expect(whereArg.status.value).toEqual([
        PaymentStatus.COMPLETED,
        PaymentStatus.REFUNDED,
      ]);
    });
  });

  describe('refund', () => {
    const createOriginalPayment = () => ({
      id: 'pay-123',
      paymentNumber: 'PAY-001',
      amount: 500,
      status: PaymentStatus.COMPLETED,
      customerId: 'cust-123',
      salesOrderId: 'so-123',
      paymentMethodId: 'pm-cash',
      paymentMethodEntity: { id: 'pm-cash', code: 'CASH' },
      customer: { id: 'cust-123', name: 'Test Customer' },
      settlementStatus: 'NOT_APPLICABLE',
    });

    beforeEach(() => {
      paymentRepository.create.mockImplementation((dto: any) => dto);
      paymentRepository.findOne.mockImplementation(() =>
        Promise.resolve(createOriginalPayment() as any),
      );
      auditLogService.log.mockResolvedValue(undefined);
    });

    it('should call reverseSourceEntries when refund method is same as original', async () => {
      paymentRepository.save
        .mockResolvedValueOnce({ id: 'refund-pay-123', amount: -200 } as any)
        .mockResolvedValueOnce({
          ...createOriginalPayment(),
          status: PaymentStatus.REFUNDED,
        } as any);
      accountingService.reverseSourceEntries.mockResolvedValue(undefined);

      await service.refund({ paymentId: 'pay-123', amount: 200 });

      expect(accountingService.reverseSourceEntries).toHaveBeenCalledWith(
        'payment',
        'pay-123',
        'system',
      );
    });
  });
});
