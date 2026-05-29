import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { SalesOrderPaymentService } from './sales-order-payment.service';
import { SalesOrder, SalesOrderStatus, SalesOrderPaymentStatus } from '../../../database/entities/sales-order.entity';
import { SalesOrderPayment } from '../../../database/entities/sales-order-payment.entity';
import { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';
import { AuditLogService } from '../../audit-logs/services';

const mockOrder = (overrides: Partial<SalesOrder> = {}): SalesOrder => ({
  id: 'order-1',
  orderNumber: 'SO-000001',
  status: SalesOrderStatus.DRAFT,
  paymentStatus: SalesOrderPaymentStatus.UNPAID,
  totalAmount: 1000,
  customerId: 'customer-1',
  ...overrides,
} as SalesOrder);

const mockMethod = (): PaymentMethodEntity => ({ id: 'method-1', isActive: true } as PaymentMethodEntity);

describe('SalesOrderPaymentService', () => {
  let service: SalesOrderPaymentService;
  let orderRepo: jest.Mocked<Repository<SalesOrder>>;
  let paymentRepo: jest.Mocked<Repository<SalesOrderPayment>>;
  let methodRepo: jest.Mocked<Repository<PaymentMethodEntity>>;
  let auditLogService: jest.Mocked<AuditLogService>;
  let dataSource: jest.Mocked<DataSource>;

  const buildMockManager = (paymentRecordsAfterSave: SalesOrderPayment[] = []): EntityManager => ({
    getRepository: jest.fn().mockImplementation((entity) => {
      if (entity === SalesOrderPayment) {
        return {
          create: jest.fn().mockImplementation((data) => data),
          save: jest.fn().mockImplementation((data) => Promise.resolve({ id: 'payment-new', ...data })),
          find: jest.fn().mockResolvedValue(paymentRecordsAfterSave),
        };
      }
      if (entity === SalesOrder) {
        return { update: jest.fn().mockResolvedValue(undefined) };
      }
      return {};
    }),
  } as any);

  beforeEach(async () => {
    dataSource = { transaction: jest.fn() } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesOrderPaymentService,
        { provide: getRepositoryToken(SalesOrder), useValue: { findOne: jest.fn(), save: jest.fn() } },
        { provide: getRepositoryToken(SalesOrderPayment), useValue: { find: jest.fn(), create: jest.fn(), save: jest.fn() } },
        { provide: getRepositoryToken(PaymentMethodEntity), useValue: { findOne: jest.fn() } },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(SalesOrderPaymentService);
    orderRepo = module.get(getRepositoryToken(SalesOrder));
    paymentRepo = module.get(getRepositoryToken(SalesOrderPayment));
    methodRepo = module.get(getRepositoryToken(PaymentMethodEntity));
    auditLogService = module.get(AuditLogService);
  });

  describe('computePaymentStatus', () => {
    it('returns UNPAID when no payments', () => {
      expect(service.computePaymentStatus([], 1000)).toBe(SalesOrderPaymentStatus.UNPAID);
    });

    it('returns UNPAID when net paid is negative (over-refunded edge case)', () => {
      const records = [{ amount: -100 }] as SalesOrderPayment[];
      expect(service.computePaymentStatus(records, 1000)).toBe(SalesOrderPaymentStatus.UNPAID);
    });

    it('returns PARTIAL when net paid < total', () => {
      const records = [{ amount: 400 }] as SalesOrderPayment[];
      expect(service.computePaymentStatus(records, 1000)).toBe(SalesOrderPaymentStatus.PARTIAL);
    });

    it('returns PAID when net paid = total (exact)', () => {
      const records = [{ amount: 1000 }] as SalesOrderPayment[];
      expect(service.computePaymentStatus(records, 1000)).toBe(SalesOrderPaymentStatus.PAID);
    });

    it('returns PAID for three partial payments totalling the exact amount (floating-point tolerance)', () => {
      // 333.33 + 333.33 + 333.34 = 1000.00 but floating-point may drift
      const records = [{ amount: 333.33 }, { amount: 333.33 }, { amount: 333.34 }] as SalesOrderPayment[];
      expect(service.computePaymentStatus(records, 1000)).toBe(SalesOrderPaymentStatus.PAID);
    });

    it('returns OVERPAID when net paid > total', () => {
      const records = [{ amount: 1200 }] as SalesOrderPayment[];
      expect(service.computePaymentStatus(records, 1000)).toBe(SalesOrderPaymentStatus.OVERPAID);
    });

    it('returns UNPAID after full payment + full refund', () => {
      const records = [{ amount: 1000 }, { amount: -1000 }] as SalesOrderPayment[];
      expect(service.computePaymentStatus(records, 1000)).toBe(SalesOrderPaymentStatus.UNPAID);
    });

    it('returns PARTIAL after partial refund', () => {
      const records = [{ amount: 1000 }, { amount: -400 }] as SalesOrderPayment[];
      expect(service.computePaymentStatus(records, 1000)).toBe(SalesOrderPaymentStatus.PARTIAL);
    });
  });

  describe('recordPayment', () => {
    it('throws NotFoundException when order not found', async () => {
      orderRepo.findOne.mockResolvedValue(null);
      await expect(service.recordPayment('order-1', { paymentMethodId: 'method-1', amount: 100, paymentDate: '2026-01-01' }))
        .rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when order is not DRAFT', async () => {
      orderRepo.findOne.mockResolvedValue(mockOrder({ status: SalesOrderStatus.FULFILLED }));
      await expect(service.recordPayment('order-1', { paymentMethodId: 'method-1', amount: 100, paymentDate: '2026-01-01' }))
        .rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException for non-positive amount', async () => {
      await expect(service.recordPayment('order-1', { paymentMethodId: 'method-1', amount: 0, paymentDate: '2026-01-01' }))
        .rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when payment method not found', async () => {
      orderRepo.findOne.mockResolvedValue(mockOrder());
      methodRepo.findOne.mockResolvedValue(null);
      await expect(service.recordPayment('order-1', { paymentMethodId: 'method-1', amount: 100, paymentDate: '2026-01-01' }))
        .rejects.toThrow(BadRequestException);
    });

    it('creates payment record inside a transaction and updates paymentStatus', async () => {
      const order = mockOrder();
      orderRepo.findOne.mockResolvedValue(order);
      methodRepo.findOne.mockResolvedValue(mockMethod());

      const mockManager = buildMockManager([{ id: 'payment-new', amount: 1000 }] as SalesOrderPayment[]);
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb: (m: EntityManager) => Promise<any>) => cb(mockManager));

      await service.recordPayment('order-1', { paymentMethodId: 'method-1', amount: 1000, paymentDate: '2026-01-01' });

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(auditLogService.log).toHaveBeenCalledWith('CREATE', 'SalesOrderPayment', expect.any(String), expect.objectContaining({ newValues: expect.objectContaining({ amount: 1000 }) }));
    });

    it('passes userId and username to audit log', async () => {
      const order = mockOrder();
      orderRepo.findOne.mockResolvedValue(order);
      methodRepo.findOne.mockResolvedValue(mockMethod());

      const mockManager = buildMockManager([{ id: 'payment-new', amount: 500 }] as SalesOrderPayment[]);
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb: (m: EntityManager) => Promise<any>) => cb(mockManager));

      await service.recordPayment('order-1', { paymentMethodId: 'method-1', amount: 500, paymentDate: '2026-01-01' }, 'user-abc', 'alice');

      expect(auditLogService.log).toHaveBeenCalledWith('CREATE', 'SalesOrderPayment', expect.any(String), expect.objectContaining({ userId: 'user-abc', username: 'alice' }));
    });

    it('persists paidAmount and balanceDue (partial payment)', async () => {
      const order = mockOrder({ totalAmount: 1000 });
      orderRepo.findOne.mockResolvedValue(order);
      methodRepo.findOne.mockResolvedValue(mockMethod());

      const updateSpy = jest.fn().mockResolvedValue(undefined);
      const manager = {
        getRepository: jest.fn().mockImplementation((entity) => {
          if (entity === SalesOrderPayment) {
            return {
              create: jest.fn().mockImplementation((d) => d),
              save: jest.fn().mockImplementation((d) => Promise.resolve({ id: 'p1', ...d })),
              find: jest.fn().mockResolvedValue([{ amount: 400 }] as SalesOrderPayment[]),
            };
          }
          if (entity === SalesOrder) return { update: updateSpy };
          return {};
        }),
      } as any;
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb: any) => cb(manager));

      await service.recordPayment('order-1', { paymentMethodId: 'method-1', amount: 400, paymentDate: '2026-01-01' });

      expect(updateSpy).toHaveBeenCalledWith('order-1', expect.objectContaining({
        paymentStatus: SalesOrderPaymentStatus.PARTIAL,
        paidAmount: 400,
        balanceDue: 600,
      }));
    });

    it('persists negative balanceDue when overpaid', async () => {
      const order = mockOrder({ totalAmount: 1000 });
      orderRepo.findOne.mockResolvedValue(order);
      methodRepo.findOne.mockResolvedValue(mockMethod());

      const updateSpy = jest.fn().mockResolvedValue(undefined);
      const manager = {
        getRepository: jest.fn().mockImplementation((entity) => {
          if (entity === SalesOrderPayment) {
            return {
              create: jest.fn().mockImplementation((d) => d),
              save: jest.fn().mockImplementation((d) => Promise.resolve({ id: 'p1', ...d })),
              find: jest.fn().mockResolvedValue([{ amount: 1200 }] as SalesOrderPayment[]),
            };
          }
          if (entity === SalesOrder) return { update: updateSpy };
          return {};
        }),
      } as any;
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb: any) => cb(manager));

      await service.recordPayment('order-1', { paymentMethodId: 'method-1', amount: 1200, paymentDate: '2026-01-01' });

      expect(updateSpy).toHaveBeenCalledWith('order-1', expect.objectContaining({
        paymentStatus: SalesOrderPaymentStatus.OVERPAID,
        paidAmount: 1200,
        balanceDue: -200,
      }));
    });
  });

  describe('recordRefund', () => {
    it('throws BadRequestException for non-positive amount', async () => {
      await expect(service.recordRefund('order-1', { paymentMethodId: 'method-1', amount: 0, paymentDate: '2026-01-01' }))
        .rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when order not found', async () => {
      orderRepo.findOne.mockResolvedValue(null);
      await expect(service.recordRefund('order-1', { paymentMethodId: 'method-1', amount: 100, paymentDate: '2026-01-01' }))
        .rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when order is CANCELLED', async () => {
      orderRepo.findOne.mockResolvedValue(mockOrder({ status: SalesOrderStatus.CANCELLED }));
      await expect(service.recordRefund('order-1', { paymentMethodId: 'method-1', amount: 100, paymentDate: '2026-01-01' }))
        .rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when refund amount exceeds net paid', async () => {
      orderRepo.findOne.mockResolvedValue(mockOrder({ paymentStatus: SalesOrderPaymentStatus.PARTIAL }));
      methodRepo.findOne.mockResolvedValue(mockMethod());
      paymentRepo.find.mockResolvedValue([{ amount: 400 }] as SalesOrderPayment[]);

      await expect(service.recordRefund('order-1', { paymentMethodId: 'method-1', amount: 500, paymentDate: '2026-01-01' }))
        .rejects.toThrow(BadRequestException);
    });

    it('creates negative payment record inside a transaction', async () => {
      const order = mockOrder({ paymentStatus: SalesOrderPaymentStatus.PAID });
      orderRepo.findOne.mockResolvedValue(order);
      methodRepo.findOne.mockResolvedValue(mockMethod());
      paymentRepo.find.mockResolvedValue([{ amount: 1000 }] as SalesOrderPayment[]);

      const mockManager = buildMockManager([{ amount: 1000 }, { amount: -400 }] as SalesOrderPayment[]);
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb: (m: EntityManager) => Promise<any>) => cb(mockManager));

      await service.recordRefund('order-1', { paymentMethodId: 'method-1', amount: 400, paymentDate: '2026-01-01' });

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(auditLogService.log).toHaveBeenCalledWith('CREATE', 'SalesOrderPayment', expect.any(String), expect.objectContaining({ newValues: expect.objectContaining({ amount: -400 }) }));
    });

    it('records the resulting payment status in the refund audit log', async () => {
      const order = mockOrder({ paymentStatus: SalesOrderPaymentStatus.OVERPAID, totalAmount: 1000 });
      orderRepo.findOne.mockResolvedValue(order);
      methodRepo.findOne.mockResolvedValue(mockMethod());
      paymentRepo.find.mockResolvedValue([{ amount: 1200 }] as SalesOrderPayment[]);

      // After refunding 200, the manager-side find returns net 1000 -> status PAID
      const mockManager = buildMockManager([{ amount: 1200 }, { amount: -200 }] as SalesOrderPayment[]);
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb: (m: EntityManager) => Promise<any>) => cb(mockManager));

      await service.recordRefund('order-1', { paymentMethodId: 'method-1', amount: 200, paymentDate: '2026-01-01' });

      expect(auditLogService.log).toHaveBeenCalledWith(
        'CREATE',
        'SalesOrderPayment',
        expect.any(String),
        expect.objectContaining({
          newValues: expect.objectContaining({ amount: -200, resultingPaymentStatus: SalesOrderPaymentStatus.PAID }),
        }),
      );
    });

    it('allows refund on FULFILLED orders', async () => {
      const order = mockOrder({ status: SalesOrderStatus.FULFILLED, paymentStatus: SalesOrderPaymentStatus.PAID });
      orderRepo.findOne.mockResolvedValue(order);
      methodRepo.findOne.mockResolvedValue(mockMethod());
      paymentRepo.find.mockResolvedValue([{ amount: 1000 }] as SalesOrderPayment[]);

      const mockManager = buildMockManager([{ amount: 1000 }, { amount: -1000 }] as SalesOrderPayment[]);
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb: (m: EntityManager) => Promise<any>) => cb(mockManager));

      await expect(service.recordRefund('order-1', { paymentMethodId: 'method-1', amount: 1000, paymentDate: '2026-01-01' }))
        .resolves.not.toThrow();
    });
  });

  describe('recordPayments', () => {
    it('returns empty array when dtos is empty', async () => {
      const result = await service.recordPayments('order-1', []);
      expect(result).toEqual([]);
    });

    it('inserts all payment rows in a single transaction and returns results', async () => {
      dataSource.transaction.mockClear();
      orderRepo.findOne.mockResolvedValue(mockOrder());
      methodRepo.findOne.mockResolvedValue(mockMethod());

      const paymentRecordsAfterSave = [
        { id: 'payment-new-1', amount: 100, salesOrderId: 'order-1' },
        { id: 'payment-new-2', amount: 200, salesOrderId: 'order-1' },
      ] as SalesOrderPayment[];

      const manager = buildMockManager(paymentRecordsAfterSave);
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb: (m: EntityManager) => Promise<any>) => cb(manager));

      const dtos = [
        { paymentMethodId: 'method-1', amount: 100, paymentDate: '2026-01-01' },
        { paymentMethodId: 'method-1', amount: 200, paymentDate: '2026-01-02' },
      ];

      const results = await service.recordPayments('order-1', dtos);
      expect(results).toHaveLength(2);
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });

    it('throws if any dto has invalid paymentMethodId', async () => {
      orderRepo.findOne.mockResolvedValue(mockOrder());
      methodRepo.findOne.mockResolvedValue(null);

      const dtos = [{ paymentMethodId: 'bad-method', amount: 100, paymentDate: '2026-01-01' }];
      await expect(service.recordPayments('order-1', dtos)).rejects.toThrow(BadRequestException);
    });
  });

  describe('listPayments', () => {
    it('throws NotFoundException when order not found', async () => {
      orderRepo.findOne.mockResolvedValue(null);
      await expect(service.listPayments('order-1')).rejects.toThrow(NotFoundException);
    });

    it('returns payments ordered by paymentDate', async () => {
      orderRepo.findOne.mockResolvedValue(mockOrder());
      paymentRepo.find.mockResolvedValue([{ id: 'p1', amount: 500 }] as SalesOrderPayment[]);

      const result = await service.listPayments('order-1');

      expect(paymentRepo.find).toHaveBeenCalledWith(expect.objectContaining({
        where: { salesOrderId: 'order-1' },
        order: { paymentDate: 'ASC' },
      }));
      expect(result).toHaveLength(1);
    });
  });
});
