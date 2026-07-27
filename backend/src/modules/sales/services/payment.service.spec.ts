import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentService } from './payment.service';
import { Payment, PaymentStatus } from '../../../database/entities/payment.entity';
import { Customer } from '../../../database/entities/customer.entity';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';
import { AuditLogService } from '../../audit-logs/services';
import { NotFoundException } from '@nestjs/common';

describe('PaymentService', () => {
  let service: PaymentService;
  let paymentRepository: jest.Mocked<Repository<Payment>>;
  let customerRepository: jest.Mocked<Repository<Customer>>;
  let salesOrderRepository: jest.Mocked<Repository<SalesOrder>>;
  let paymentMethodRepository: jest.Mocked<Repository<PaymentMethodEntity>>;
  let auditLogService: jest.Mocked<AuditLogService>;

  const createMockPayment = (): Partial<Payment> => ({
    id: '123e4567-e89b-12d3-a456-426614174000',
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
            restore: jest.fn(),
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
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
    paymentRepository = module.get(getRepositoryToken(Payment));
    customerRepository = module.get(getRepositoryToken(Customer));
    salesOrderRepository = module.get(getRepositoryToken(SalesOrder));
    paymentMethodRepository = module.get(getRepositoryToken(PaymentMethodEntity));
    auditLogService = module.get(AuditLogService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('filters payments by status when status is provided', async () => {
      const mockPayments = [{ id: '1', status: 'completed' }];
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

    it('applies skip/take when page and limit are provided', async () => {
      const skip = jest.fn().mockReturnThis();
      const take = jest.fn().mockReturnThis();
      jest.spyOn(paymentRepository, 'createQueryBuilder').mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        skip,
        take,
        getManyAndCount: jest.fn().mockResolvedValue([[], 100]),
      } as any);

      const result = await service.findAll({ page: 3, limit: 20 } as any);

      expect(skip).toHaveBeenCalledWith(40);
      expect(take).toHaveBeenCalledWith(20);
      expect(result.meta.total).toBe(100);
    });

    it('does NOT apply skip/take when page/limit are absent', async () => {
      const skip = jest.fn().mockReturnThis();
      const take = jest.fn().mockReturnThis();
      jest.spyOn(paymentRepository, 'createQueryBuilder').mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        skip,
        take,
        getManyAndCount: jest.fn().mockResolvedValue([[], 5]),
      } as any);

      await service.findAll({} as any);

      expect(skip).not.toHaveBeenCalled();
      expect(take).not.toHaveBeenCalled();
    });
  });

  describe('findAll sortBy guard', () => {
    const makeQb = () => ({
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    });

    it('falls back to paymentDate when sortBy is not an allowed column', async () => {
      const qb = makeQb();
      paymentRepository.createQueryBuilder.mockReturnValue(qb as any);

      await service.findAll({ sortBy: 'paymentNumber', sortOrder: 'ASC' } as any);

      expect(qb.orderBy).toHaveBeenCalledWith('payment.paymentDate', 'ASC');
    });

    it('honours an allowed sortBy column', async () => {
      const qb = makeQb();
      paymentRepository.createQueryBuilder.mockReturnValue(qb as any);

      await service.findAll({ sortBy: 'amount', sortOrder: 'DESC' } as any);

      expect(qb.orderBy).toHaveBeenCalledWith('payment.amount', 'DESC');
    });
  });

  describe('paymentNumber retirement', () => {
    it('creates a payment without a generated document number', async () => {
      const mockCustomer = createMockCustomer();
      const mockPayment = createMockPayment();
      customerRepository.findOne.mockResolvedValue(mockCustomer as Customer);
      paymentMethodRepository.findOne.mockResolvedValue({ id: 'pm-1', code: 'CASH' } as any);
      customerRepository.save.mockResolvedValue(mockCustomer as Customer);
      paymentRepository.create.mockReturnValue(mockPayment as Payment);
      paymentRepository.save.mockResolvedValue(mockPayment as Payment);
      paymentRepository.findOne.mockResolvedValue(mockPayment as Payment);
      auditLogService.log.mockResolvedValue(undefined);

      await service.create({
        customerId: 'customer-1',
        paymentMethodId: 'pm-1',
        amount: 1000,
        paymentDate: new Date('2024-01-15'),
      } as any);

      expect(paymentRepository.create).toHaveBeenCalledWith(
        expect.not.objectContaining({ paymentNumber: expect.anything() }),
      );
    });

    it('writes a currency-neutral refund note referencing amount and date', async () => {
      const original = {
        ...createMockPayment(),
        amount: 5000,
        // Local midnight, which is what the pg driver produces for a `date`
        // column. Using new Date('2026-07-27') here would be UTC midnight and
        // would mask an off-by-one in the formatter east of UTC.
        paymentDate: new Date(2026, 6, 27),
        status: PaymentStatus.COMPLETED,
        paymentMethodEntity: { code: 'CASH' },
      };
      paymentRepository.findOne.mockResolvedValue(original as any);
      paymentRepository.create.mockImplementation((v) => v as Payment);
      paymentRepository.save.mockImplementation((v) => Promise.resolve(v as Payment));
      auditLogService.log.mockResolvedValue(undefined);

      await service.refund({ paymentId: original.id, amount: 100 } as any);

      const created = paymentRepository.create.mock.calls[0][0] as any;
      expect(created.notes).toBe('Refund of 5000.00 payment dated 2026-07-27');
      expect(created.notes).not.toMatch(/PAY-/);
      expect(created).not.toHaveProperty('paymentNumber');
    });

    it('formats a YYYY-MM-DD string payment date without shifting it', async () => {
      const original = {
        ...createMockPayment(),
        amount: 250,
        // TypeORM can hand back the raw string for a `date` column.
        paymentDate: '2026-01-01' as any,
        status: PaymentStatus.COMPLETED,
        paymentMethodEntity: { code: 'CASH' },
      };
      paymentRepository.findOne.mockResolvedValue(original as any);
      paymentRepository.create.mockImplementation((v) => v as Payment);
      paymentRepository.save.mockImplementation((v) => Promise.resolve(v as Payment));
      auditLogService.log.mockResolvedValue(undefined);

      await service.refund({ paymentId: original.id, amount: 50 } as any);

      const created = paymentRepository.create.mock.calls[0][0] as any;
      expect(created.notes).toBe('Refund of 250.00 payment dated 2026-01-01');
    });

    it('omits paymentNumber from restore audit newValues', async () => {
      const deleted = { ...createMockPayment(), deletedAt: new Date() };
      paymentRepository.findOne.mockResolvedValue(deleted as any);
      paymentRepository.restore.mockResolvedValue({} as any);
      auditLogService.log.mockResolvedValue(undefined);

      await service.restore(deleted.id as string);

      const [, , message, options] = auditLogService.log.mock.calls[0];
      expect(message).not.toMatch(/PAY-/);
      expect(options.newValues).not.toHaveProperty('paymentNumber');
    });

    it('returns customer payment summaries without paymentNumber', async () => {
      paymentRepository.find.mockResolvedValue([createMockPayment() as Payment]);
      const result = await service.getPaymentsByCustomer('customer-1');
      expect(result[0]).not.toHaveProperty('paymentNumber');
    });

    it('returns sales-order payment summaries without paymentNumber', async () => {
      paymentRepository.find.mockResolvedValue([createMockPayment() as Payment]);
      const result = await service.getPaymentsBySalesOrder('so-1');
      expect(result[0]).not.toHaveProperty('paymentNumber');
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
      } as any);
      customerRepository.save.mockResolvedValue(mockCustomer as Customer);
      paymentRepository.create.mockReturnValue(mockPayment as Payment);
      paymentRepository.save.mockResolvedValue(mockPayment as Payment);

      // Mock findPaymentWithRelations (called twice - once for accounting, once for return)
      paymentRepository.findOne.mockResolvedValue(mockPayment as Payment);

      auditLogService.log.mockResolvedValue(undefined);

      // Act
      const result = await service.create(createDto);

      // Assert
      expect(result).toBeDefined();
      expect(paymentRepository.save).toHaveBeenCalled();
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
      } as any);
      customerRepository.save.mockResolvedValue(mockCustomer as Customer);
      paymentRepository.create.mockReturnValue(mockPayment as Payment);
      paymentRepository.save.mockResolvedValue(mockPayment as Payment);

      // Mock findPaymentWithRelations
      paymentRepository.findOne.mockResolvedValue(mockPayment as Payment);

      auditLogService.log.mockResolvedValue(undefined);

      // Act
      await service.create(createDto);

      // Assert
      // Verify findOne was called to get payment with relations
      expect(paymentRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockPayment.id },
        relations: {
          customer: true,
          salesOrder: { items: { product: true } },
          paymentMethodEntity: true,
        },
      });
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

});
