import { jest } from '@jest/globals';
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
  let paymentRepository: any;
  let customerRepository: any;
  let salesOrderRepository: any;
  let paymentMethodRepository: any;
  let auditLogService: any;

  const createMockPayment = (): Partial<Payment> => ({
    id: '123e4567-e89b-12d3-a456-426614174000',
    amount: '1000.0000',
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
            findOne: (jest.fn as unknown as any)(),
            find: (jest.fn as unknown as any)(),
            save: (jest.fn as unknown as any)(),
            create: (jest.fn as unknown as any)(),
            createQueryBuilder: (jest.fn as unknown as any)(),
            restore: (jest.fn as unknown as any)(),
          },
        },
        {
          provide: getRepositoryToken(Customer),
          useValue: {
            findOne: (jest.fn as unknown as any)(),
            save: (jest.fn as unknown as any)(),
          },
        },
        {
          provide: getRepositoryToken(SalesOrder),
          useValue: {
            findOne: (jest.fn as unknown as any)(),
            save: (jest.fn as unknown as any)(),
            find: (jest.fn as unknown as any)(),
          },
        },
        {
          provide: getRepositoryToken(PaymentMethodEntity),
          useValue: {
            findOne: (jest.fn as unknown as any)(),
          },
        },
        {
          provide: AuditLogService,
          useValue: {
            log: (jest.fn as unknown as any)(),
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
        leftJoinAndSelect: (jest.fn as unknown as any)().mockReturnThis(),
        where: (jest.fn as unknown as any)().mockReturnThis(),
        orderBy: (jest.fn as unknown as any)().mockReturnThis(),
        andWhere: (jest.fn as unknown as any)().mockReturnThis(),
        getManyAndCount: (jest.fn as unknown as any)().mockResolvedValue([mockPayments, 1]),
      } as any);

      const result = await service.findAll({ status: 'completed' as any });

      expect(result.data).toHaveLength(1);
    });

    it('applies skip/take when page and limit are provided', async () => {
      const skip = (jest.fn as unknown as any)().mockReturnThis();
      const take = (jest.fn as unknown as any)().mockReturnThis();
      jest.spyOn(paymentRepository, 'createQueryBuilder').mockReturnValue({
        leftJoinAndSelect: (jest.fn as unknown as any)().mockReturnThis(),
        where: (jest.fn as unknown as any)().mockReturnThis(),
        orderBy: (jest.fn as unknown as any)().mockReturnThis(),
        andWhere: (jest.fn as unknown as any)().mockReturnThis(),
        skip,
        take,
        getManyAndCount: (jest.fn as unknown as any)().mockResolvedValue([[], 100]),
      } as any);

      const result = await service.findAll({ page: 3, limit: 20 } as any);

      expect(skip).toHaveBeenCalledWith(40);
      expect(take).toHaveBeenCalledWith(20);
      expect(result.meta.total).toBe(100);
    });

    it('does NOT apply skip/take when page/limit are absent', async () => {
      const skip = (jest.fn as unknown as any)().mockReturnThis();
      const take = (jest.fn as unknown as any)().mockReturnThis();
      jest.spyOn(paymentRepository, 'createQueryBuilder').mockReturnValue({
        leftJoinAndSelect: (jest.fn as unknown as any)().mockReturnThis(),
        where: (jest.fn as unknown as any)().mockReturnThis(),
        orderBy: (jest.fn as unknown as any)().mockReturnThis(),
        andWhere: (jest.fn as unknown as any)().mockReturnThis(),
        skip,
        take,
        getManyAndCount: (jest.fn as unknown as any)().mockResolvedValue([[], 5]),
      } as any);

      await service.findAll({} as any);

      expect(skip).not.toHaveBeenCalled();
      expect(take).not.toHaveBeenCalled();
    });
  });

  describe('findAll sortBy guard', () => {
    const makeQb = () => ({
      leftJoinAndSelect: (jest.fn as unknown as any)().mockReturnThis(),
      where: (jest.fn as unknown as any)().mockReturnThis(),
      andWhere: (jest.fn as unknown as any)().mockReturnThis(),
      orderBy: (jest.fn as unknown as any)().mockReturnThis(),
      skip: (jest.fn as unknown as any)().mockReturnThis(),
      take: (jest.fn as unknown as any)().mockReturnThis(),
      getManyAndCount: (jest.fn as unknown as any)().mockResolvedValue([[], 0]),
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
        amount: '1000.0000',
        paymentDate: new Date('2024-01-15'),
      } as any);

      expect(paymentRepository.create).toHaveBeenCalledWith(
        expect.not.objectContaining({ paymentNumber: expect.anything() }),
      );
    });

    it('writes a currency-neutral refund note referencing amount and date', async () => {
      const original = {
        ...createMockPayment(),
        amount: '5000.0000',
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

      await service.refund({ paymentId: original.id, amount: '100.0000' } as any);

      const created = paymentRepository.create.mock.calls[0][0] as any;
      expect(created.notes).toBe('Refund of 5000.0000 payment dated 2026-07-27');
      expect(created.notes).not.toMatch(/PAY-/);
      expect(created).not.toHaveProperty('paymentNumber');
    });

    it('formats a YYYY-MM-DD string payment date without shifting it', async () => {
      const original = {
        ...createMockPayment(),
        amount: '250.0000',
        // TypeORM can hand back the raw string for a `date` column.
        paymentDate: '2026-01-01' as any,
        status: PaymentStatus.COMPLETED,
        paymentMethodEntity: { code: 'CASH' },
      };
      paymentRepository.findOne.mockResolvedValue(original as any);
      paymentRepository.create.mockImplementation((v) => v as Payment);
      paymentRepository.save.mockImplementation((v) => Promise.resolve(v as Payment));
      auditLogService.log.mockResolvedValue(undefined);

      await service.refund({ paymentId: original.id, amount: '50.0000' } as any);

      const created = paymentRepository.create.mock.calls[0][0] as any;
      expect(created.notes).toBe('Refund of 250.0000 payment dated 2026-01-01');
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

    it('reports the restore audit date without shifting it', async () => {
      // Local midnight, as the pg driver returns for a `date` column.
      const deleted = {
        ...createMockPayment(),
        amount: '750.0000',
        paymentDate: new Date(2026, 6, 27),
        deletedAt: new Date(),
      };
      paymentRepository.findOne.mockResolvedValue(deleted as any);
      paymentRepository.restore.mockResolvedValue({} as any);
      auditLogService.log.mockResolvedValue(undefined);

      await service.restore(deleted.id as string);

      const [, , message] = auditLogService.log.mock.calls[0];
      expect(message).toBe('Restored payment: 750.0000 on 2026-07-27');
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
        amount: '1000.0000',
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
        amount: '1000.0000',
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
        amount: '1000.0000',
        paymentDate: new Date('2024-01-15'),
      };
      customerRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.create(createDto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('exact scale-4 money handling', () => {
    it('allocates a payment exactly equal to the payment amount', async () => {
      const payment = createMockPayment();
      const order = {
        id: 'so-1',
        customerId: 'customer-1',
        totalAmount: '1000.0000',
        paidAmount: '0.0000',
        balanceDue: '1000.0000',
      };
      paymentRepository.findOne.mockResolvedValue(payment as Payment);
      salesOrderRepository.findOne.mockResolvedValue(order as any);
      salesOrderRepository.save.mockResolvedValue(order as any);
      paymentRepository.save.mockResolvedValue(payment as Payment);

      await service.allocatePayment(payment.id as string, {
        paymentId: payment.id as string,
        allocations: [{ salesOrderId: 'so-1', amount: '1000.0000' }],
      });

      expect(salesOrderRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ paidAmount: '1000.0000', balanceDue: '0.0000' }),
      );
    });

    it('rejects allocation exceeding the payment amount by one minor unit', async () => {
      const payment = createMockPayment();
      paymentRepository.findOne.mockResolvedValue(payment as Payment);

      await expect(
        service.allocatePayment(payment.id as string, {
          paymentId: payment.id as string,
          allocations: [{ salesOrderId: 'so-1', amount: '1000.0001' }],
        }),
      ).rejects.toThrow('Total allocation amount exceeds payment amount');
    });

    // Number('0.1') + Number('0.2') === 0.30000000000000004, so under the old
    // float arithmetic this allocation exceeded a 0.3000 payment and threw.
    it('sums split allocations without binary64 drift', async () => {
      const payment = { ...createMockPayment(), amount: '0.3000' };
      const order = {
        id: 'so-1',
        customerId: 'customer-1',
        totalAmount: '0.3000',
        paidAmount: '0.0000',
        balanceDue: '0.3000',
      };
      paymentRepository.findOne.mockResolvedValue(payment as Payment);
      salesOrderRepository.findOne.mockResolvedValue(order as any);
      salesOrderRepository.save.mockResolvedValue(order as any);
      paymentRepository.save.mockResolvedValue(payment as Payment);

      await service.allocatePayment(payment.id as string, {
        paymentId: payment.id as string,
        allocations: [
          { salesOrderId: 'so-1', amount: '0.1000' },
          { salesOrderId: 'so-1', amount: '0.2000' },
        ],
      });

      // Exactly 0.3000 paid, exactly 0.0000 left — no 0.30000000000000004.
      expect(salesOrderRepository.save).toHaveBeenLastCalledWith(
        expect.objectContaining({ paidAmount: '0.3000', balanceDue: '0.0000' }),
      );
    });

    // 11 integer digits is the maximum decimal(15,4) holds. At this magnitude
    // binary64 spacing exceeds 0.0001, so Number() could not tell these apart.
    it('compares at the maximum decimal(15,4) magnitude without losing a minor unit', async () => {
      const payment = { ...createMockPayment(), amount: '99999999999.9900' };
      paymentRepository.findOne.mockResolvedValue(payment as Payment);

      await expect(
        service.allocatePayment(payment.id as string, {
          paymentId: payment.id as string,
          allocations: [{ salesOrderId: 'so-1', amount: '99999999999.9901' }],
        }),
      ).rejects.toThrow('Total allocation amount exceeds payment amount');
    });

    it('accepts an allocation at the maximum decimal(15,4) magnitude', async () => {
      const payment = { ...createMockPayment(), amount: '99999999999.9900' };
      const order = {
        id: 'so-1',
        customerId: 'customer-1',
        totalAmount: '99999999999.9900',
        paidAmount: '0.0000',
        balanceDue: '99999999999.9900',
      };
      paymentRepository.findOne.mockResolvedValue(payment as Payment);
      salesOrderRepository.findOne.mockResolvedValue(order as any);
      salesOrderRepository.save.mockResolvedValue(order as any);
      paymentRepository.save.mockResolvedValue(payment as Payment);

      await service.allocatePayment(payment.id as string, {
        paymentId: payment.id as string,
        allocations: [{ salesOrderId: 'so-1', amount: '99999999999.9900' }],
      });

      expect(salesOrderRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ paidAmount: '99999999999.9900', balanceDue: '0.0000' }),
      );
    });

    it('refunds a payment exactly equal to the payment amount', async () => {
      const original = {
        ...createMockPayment(),
        paymentMethodEntity: { code: 'CASH' },
      };
      paymentRepository.findOne.mockResolvedValue(original as any);
      paymentRepository.create.mockImplementation((v) => v as Payment);
      paymentRepository.save.mockImplementation((v) => Promise.resolve(v as Payment));
      auditLogService.log.mockResolvedValue(undefined);

      await service.refund({ paymentId: original.id as string, amount: '1000.0000' });

      const created = paymentRepository.create.mock.calls[0][0] as any;
      expect(created.amount).toBe('-1000.0000');
      expect(created.status).toBe(PaymentStatus.REFUNDED);
    });

    it('rejects refund exceeding the payment amount by one minor unit', async () => {
      const original = {
        ...createMockPayment(),
        paymentMethodEntity: { code: 'CASH' },
      };
      paymentRepository.findOne.mockResolvedValue(original as any);

      await expect(
        service.refund({ paymentId: original.id as string, amount: '1000.0001' }),
      ).rejects.toThrow('Refund amount cannot exceed original payment amount');
    });

    it('rejects a zero refund amount', async () => {
      const original = {
        ...createMockPayment(),
        paymentMethodEntity: { code: 'CASH' },
      };
      paymentRepository.findOne.mockResolvedValue(original as any);

      await expect(
        service.refund({ paymentId: original.id as string, amount: '0.0000' }),
      ).rejects.toThrow('Refund amount must be greater than zero');
    });
  });

  describe('getPaidTotalForSalesOrder', () => {
    it('should return sum of completed payment amounts for a sales order', async () => {
      const mockPayments = [
        {
          id: 'p1',
          amount: '200.0000',
          status: PaymentStatus.COMPLETED,
          salesOrderId: 'so-1',
        },
        {
          id: 'p2',
          amount: '300.0000',
          status: PaymentStatus.COMPLETED,
          salesOrderId: 'so-1',
        },
      ];
      jest.spyOn(paymentRepository, 'find').mockResolvedValue(mockPayments as any);

      const total = await service.getPaidTotalForSalesOrder('so-1');

      expect(total).toBe('500.0000');
    });

    it('should return 0 when no completed payments exist', async () => {
      jest.spyOn(paymentRepository, 'find').mockResolvedValue([]);

      const total = await service.getPaidTotalForSalesOrder('so-1');

      expect(total).toBe('0.0000');
    });

    it('should net out a partial refund (original 100, refund -30 => 70)', async () => {
      // A refund flips the original payment to REFUNDED and adds a negative row,
      // both REFUNDED. Net paid must be the remaining amount, not 0.
      const mockPayments = [
        { id: 'orig', amount: '100.0000', status: PaymentStatus.REFUNDED, salesOrderId: 'so-1' },
        { id: 'refund', amount: '-30.0000', status: PaymentStatus.REFUNDED, salesOrderId: 'so-1' },
      ];
      const findSpy = jest
        .spyOn(paymentRepository, 'find')
        .mockResolvedValue(mockPayments as any);

      const total = await service.getPaidTotalForSalesOrder('so-1');

      expect(total).toBe('70.0000');
      // Query must include REFUNDED rows, not just COMPLETED.
      const whereArg = (findSpy.mock.calls[0][0] as any).where;
      expect(whereArg.status.value).toEqual([
        PaymentStatus.COMPLETED,
        PaymentStatus.REFUNDED,
      ]);
    });
  });

});
