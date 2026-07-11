import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { SalesOrderPaymentService } from './sales-order-payment.service';
import {
  SalesOrder,
  SalesOrderStatus,
  SalesOrderPaymentStatus,
} from '../../../database/entities/sales-order.entity';
import { SalesOrderPayment } from '../../../database/entities/sales-order-payment.entity';
import { PaymentMethodEntity } from '../../../database/entities/payment-method.entity';
import { AuditLogService } from '../../audit-logs/services';
import { ACCOUNTING_POSTING_PORT } from '../../../common/accounting-posting/accounting-posting.port';
import type { AccountingPostingPort } from '../../../common/accounting-posting/accounting-posting.port';

const mockOrder = (overrides: Partial<SalesOrder> = {}): SalesOrder =>
  ({
    id: 'order-1',
    orderNumber: 'SO-000001',
    status: SalesOrderStatus.DRAFT,
    paymentStatus: SalesOrderPaymentStatus.UNPAID,
    totalAmount: 1000,
    customerId: 'customer-1',
    ...overrides,
  }) as SalesOrder;

const mockMethod = (overrides: Partial<PaymentMethodEntity> = {}): PaymentMethodEntity =>
  ({ id: 'method-1', isActive: true, accountingChannel: 'BANK', ...overrides }) as PaymentMethodEntity;

describe('SalesOrderPaymentService', () => {
  let service: SalesOrderPaymentService;
  let orderRepo: jest.Mocked<Repository<SalesOrder>>;
  let paymentRepo: jest.Mocked<Repository<SalesOrderPayment>>;
  let methodRepo: jest.Mocked<Repository<PaymentMethodEntity>>;
  let auditLogService: jest.Mocked<AuditLogService>;
  let dataSource: jest.Mocked<DataSource>;
  let accountingPort: jest.Mocked<AccountingPostingPort>;

  const buildMockManager = (
    paymentRecordsAfterSave: SalesOrderPayment[] = [],
    update = jest.fn().mockResolvedValue(undefined),
    order: SalesOrder = mockOrder(),
  ): EntityManager =>
    ({
      getRepository: jest.fn().mockImplementation((entity) => {
        if (entity === SalesOrderPayment) {
          return {
            create: jest.fn().mockImplementation((data) => data),
            save: jest
              .fn()
              .mockImplementation((data) => Promise.resolve({ id: 'payment-new', ...data })),
            find: jest.fn().mockResolvedValue(paymentRecordsAfterSave),
          };
        }
        if (entity === SalesOrder) {
          return { update, findOne: jest.fn().mockResolvedValue(order) };
        }
        return {};
      }),
    }) as any;

  beforeEach(async () => {
    dataSource = { transaction: jest.fn() } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesOrderPaymentService,
        {
          provide: getRepositoryToken(SalesOrder),
          useValue: { findOne: jest.fn(), save: jest.fn() },
        },
        {
          provide: getRepositoryToken(SalesOrderPayment),
          useValue: { find: jest.fn(), create: jest.fn(), save: jest.fn() },
        },
        {
          provide: getRepositoryToken(PaymentMethodEntity),
          useValue: { findOne: jest.fn() },
        },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
        { provide: ACCOUNTING_POSTING_PORT, useValue: { postSalesPayment: jest.fn(), postSalesRefund: jest.fn() } },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(SalesOrderPaymentService);
    orderRepo = module.get(getRepositoryToken(SalesOrder));
    paymentRepo = module.get(getRepositoryToken(SalesOrderPayment));
    methodRepo = module.get(getRepositoryToken(PaymentMethodEntity));
    auditLogService = module.get(AuditLogService);
    accountingPort = module.get(ACCOUNTING_POSTING_PORT);
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
      const records = [
        { amount: 333.33 },
        { amount: 333.33 },
        { amount: 333.34 },
      ] as SalesOrderPayment[];
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

  describe('reconcileOrderState', () => {
    // Helper: build a transaction manager whose SalesOrderPayment repo returns `payments`
    // and whose SalesOrder repo captures the update() call.
    function mockTxManager(payments: { amount: number }[], order: SalesOrder) {
      const captured: { update?: any } = {};
      const manager = {
        getRepository: (entity: any) => {
          if (entity === SalesOrderPayment) {
            return { find: jest.fn().mockResolvedValue(payments) };
          }
          // SalesOrder repo
          return {
            findOne: jest.fn().mockResolvedValue(order),
            update: jest.fn().mockImplementation((_id, patch) => {
              captured.update = patch;
              return Promise.resolve();
            }),
          };
        },
      } as unknown as EntityManager;
      return { manager, captured };
    }

    it('demotes READY -> DRAFT + PARTIAL when total rises above amount paid', async () => {
      const order = {
        id: 'o1',
        status: SalesOrderStatus.READY,
        totalAmount: 200,
        paidAmount: 100,
      } as SalesOrder;
      const { manager, captured } = mockTxManager([{ amount: 100 }], order);
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb: any) => cb(manager));

      await service.reconcileOrderState('o1');

      expect(captured.update.paymentStatus).toBe(SalesOrderPaymentStatus.PARTIAL);
      expect(captured.update.balanceDue).toBe(100);
      expect(captured.update.status).toBe(SalesOrderStatus.DRAFT);
    });

    it('keeps DRAFT and yields OVERPAID when total drops below amount paid', async () => {
      const order = {
        id: 'o2',
        status: SalesOrderStatus.DRAFT,
        totalAmount: 50,
        paidAmount: 100,
      } as SalesOrder;
      const { manager, captured } = mockTxManager([{ amount: 100 }], order);
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb: any) => cb(manager));

      await service.reconcileOrderState('o2');

      expect(captured.update.paymentStatus).toBe(SalesOrderPaymentStatus.OVERPAID);
      expect(order.status).toBe(SalesOrderStatus.DRAFT);
    });

    it('demotes READY -> DRAFT + OVERPAID when an extra payment tips into overpayment', async () => {
      const order = {
        id: 'o-over',
        status: SalesOrderStatus.READY,
        totalAmount: 100,
        paidAmount: 100,
      } as SalesOrder;
      const { manager, captured } = mockTxManager([{ amount: 120 }], order);
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb: any) => cb(manager));

      await service.reconcileOrderState('o-over');

      expect(captured.update.paymentStatus).toBe(SalesOrderPaymentStatus.OVERPAID);
      expect(captured.update.status).toBe(SalesOrderStatus.DRAFT);
    });

    it('reuses a provided transaction manager (no new transaction) and locks the order', async () => {
      const order = {
        id: 'o3',
        status: SalesOrderStatus.DRAFT,
        totalAmount: 80,
        paidAmount: 80,
      } as SalesOrder;
      const findOne = jest.fn().mockResolvedValue(order);
      const update = jest.fn().mockResolvedValue(undefined);
      const manager = {
        getRepository: (entity: any) => {
          if (entity === SalesOrderPayment)
            return { find: jest.fn().mockResolvedValue([{ amount: 80 }]) };
          return { findOne, update };
        },
      } as unknown as EntityManager;

      await service.reconcileOrderState('o3', manager);

      // Must NOT start its own transaction when a manager is supplied.
      expect(dataSource.transaction as jest.Mock).not.toHaveBeenCalled();
      // Reads the order through the manager with a write lock.
      expect(findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'o3' },
          lock: { mode: 'pessimistic_write' },
        }),
      );
      expect(update).toHaveBeenCalled();
    });
  });

  describe('recordPayment', () => {
    it('lock-reads the order through the transaction manager (pessimistic_write)', async () => {
      const order = mockOrder({ status: SalesOrderStatus.DRAFT });
      const findOne = jest.fn().mockResolvedValue(order);
      const update = jest.fn().mockResolvedValue(undefined);
      const manager = {
        getRepository: jest.fn().mockImplementation((entity) => {
          if (entity === SalesOrderPayment) {
            return {
              create: jest.fn().mockImplementation((d) => d),
              save: jest.fn().mockImplementation((d) => Promise.resolve({ id: 'p1', ...d })),
              find: jest.fn().mockResolvedValue([{ amount: 1000 }]),
            };
          }
          return { findOne, update };
        }),
      } as unknown as EntityManager;
      methodRepo.findOne.mockResolvedValue(mockMethod());
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb: any) => cb(manager));

      await service.recordPayment('order-1', {
        amount: 1000,
        paymentMethodId: 'method-1',
        paymentDate: new Date(),
      } as any);

      expect(findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'order-1' },
          lock: { mode: 'pessimistic_write' },
        }),
      );
    });

    it('throws ConflictException in-lock when the order is no longer DRAFT', async () => {
      const findOne = jest.fn().mockResolvedValue(mockOrder({ status: SalesOrderStatus.READY }));
      const manager = {
        getRepository: jest
          .fn()
          .mockImplementation((entity) =>
            entity === SalesOrderPayment
              ? { create: jest.fn(), save: jest.fn(), find: jest.fn() }
              : { findOne, update: jest.fn() },
          ),
      } as unknown as EntityManager;
      methodRepo.findOne.mockResolvedValue(mockMethod());
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb: any) => cb(manager));

      await expect(
        service.recordPayment('order-1', {
          amount: 100,
          paymentMethodId: 'method-1',
          paymentDate: new Date(),
        } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when order not found', async () => {
      methodRepo.findOne.mockResolvedValue(mockMethod());
      const manager = buildMockManager([], jest.fn(), null as any);
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb: any) => cb(manager));
      await expect(
        service.recordPayment('order-1', {
          paymentMethodId: 'method-1',
          amount: 100,
          paymentDate: '2026-01-01',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when order is not DRAFT', async () => {
      methodRepo.findOne.mockResolvedValue(mockMethod());
      const manager = buildMockManager(
        [],
        jest.fn(),
        mockOrder({ status: SalesOrderStatus.FULFILLED }),
      );
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb: any) => cb(manager));
      await expect(
        service.recordPayment('order-1', {
          paymentMethodId: 'method-1',
          amount: 100,
          paymentDate: '2026-01-01',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException for non-positive amount', async () => {
      await expect(
        service.recordPayment('order-1', {
          paymentMethodId: 'method-1',
          amount: 0,
          paymentDate: '2026-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when payment method not found', async () => {
      orderRepo.findOne.mockResolvedValue(mockOrder());
      methodRepo.findOne.mockResolvedValue(null);
      await expect(
        service.recordPayment('order-1', {
          paymentMethodId: 'method-1',
          amount: 100,
          paymentDate: '2026-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates payment record inside a transaction and updates paymentStatus', async () => {
      const order = mockOrder();
      orderRepo.findOne.mockResolvedValue(order);
      methodRepo.findOne.mockResolvedValue(mockMethod());

      const mockManager = buildMockManager([
        { id: 'payment-new', amount: 1000 },
      ] as SalesOrderPayment[]);
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (cb: (m: EntityManager) => Promise<any>) => cb(mockManager),
      );

      await service.recordPayment('order-1', {
        paymentMethodId: 'method-1',
        amount: 1000,
        paymentDate: '2026-01-01',
      });

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(auditLogService.log).toHaveBeenCalledWith(
        'CREATE',
        'SalesOrderPayment',
        expect.any(String),
        expect.objectContaining({
          newValues: expect.objectContaining({ amount: 1000 }),
        }),
      );
    });

    it('passes userId and username to audit log', async () => {
      const order = mockOrder();
      orderRepo.findOne.mockResolvedValue(order);
      methodRepo.findOne.mockResolvedValue(mockMethod());

      const mockManager = buildMockManager([
        { id: 'payment-new', amount: 500 },
      ] as SalesOrderPayment[]);
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (cb: (m: EntityManager) => Promise<any>) => cb(mockManager),
      );

      await service.recordPayment(
        'order-1',
        { paymentMethodId: 'method-1', amount: 500, paymentDate: '2026-01-01' },
        'user-abc',
        'alice',
      );

      expect(auditLogService.log).toHaveBeenCalledWith(
        'CREATE',
        'SalesOrderPayment',
        expect.any(String),
        expect.objectContaining({ userId: 'user-abc', username: 'alice' }),
      );
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
          if (entity === SalesOrder)
            return {
              update: updateSpy,
              findOne: jest.fn().mockResolvedValue(order),
            };
          return {};
        }),
      } as any;
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb: any) => cb(manager));

      await service.recordPayment('order-1', {
        paymentMethodId: 'method-1',
        amount: 400,
        paymentDate: '2026-01-01',
      });

      expect(updateSpy).toHaveBeenCalledWith(
        'order-1',
        expect.objectContaining({
          paymentStatus: SalesOrderPaymentStatus.PARTIAL,
          paidAmount: 400,
          balanceDue: 600,
        }),
      );
    });

    it('posts a SALES_PAYMENT JE inside the payment transaction', async () => {
      const order = mockOrder({ status: SalesOrderStatus.DRAFT });
      methodRepo.findOne.mockResolvedValue(mockMethod({ accountingChannel: 'CASH' }));
      const findOne = jest.fn().mockResolvedValue(order);
      const update = jest.fn().mockResolvedValue(undefined);
      const manager = {
        getRepository: jest.fn().mockImplementation((entity) => {
          if (entity === SalesOrderPayment) {
            return {
              create: jest.fn().mockImplementation((d) => d),
              save: jest.fn().mockImplementation((d) => Promise.resolve({ id: 'payment-new', ...d })),
              find: jest.fn().mockResolvedValue([{ amount: 500 }]),
            };
          }
          return { findOne, update };
        }),
      } as unknown as EntityManager;
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb: any) => cb(manager));

      await service.recordPayment('order-1', {
        paymentMethodId: 'method-1', amount: 500, paymentDate: '2026-07-10',
      } as any, 'u', 'admin');

      expect(accountingPort.postSalesPayment).toHaveBeenCalledWith(
        expect.objectContaining({ salesOrderId: 'order-1', channel: 'CASH', amount: '500.0000', paymentRowId: 'payment-new' }),
        expect.anything(),
      );
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
          if (entity === SalesOrder)
            return {
              update: updateSpy,
              findOne: jest.fn().mockResolvedValue(order),
            };
          return {};
        }),
      } as any;
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb: any) => cb(manager));

      await service.recordPayment('order-1', {
        paymentMethodId: 'method-1',
        amount: 1200,
        paymentDate: '2026-01-01',
      });

      expect(updateSpy).toHaveBeenCalledWith(
        'order-1',
        expect.objectContaining({
          paymentStatus: SalesOrderPaymentStatus.OVERPAID,
          paidAmount: 1200,
          balanceDue: -200,
        }),
      );
    });
  });

  describe('recordRefund', () => {
    it('throws BadRequestException for non-positive amount', async () => {
      await expect(
        service.recordRefund('order-1', {
          paymentMethodId: 'method-1',
          amount: 0,
          paymentDate: '2026-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when order not found', async () => {
      methodRepo.findOne.mockResolvedValue(mockMethod());
      const manager = buildMockManager([], jest.fn(), null as any);
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb: any) => cb(manager));
      await expect(
        service.recordRefund('order-1', {
          paymentMethodId: 'method-1',
          amount: 100,
          paymentDate: '2026-01-01',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when order is CANCELLED', async () => {
      methodRepo.findOne.mockResolvedValue(mockMethod());
      const manager = buildMockManager(
        [],
        jest.fn(),
        mockOrder({ status: SalesOrderStatus.CANCELLED }),
      );
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb: any) => cb(manager));
      await expect(
        service.recordRefund('order-1', {
          paymentMethodId: 'method-1',
          amount: 100,
          paymentDate: '2026-01-01',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws BadRequestException when refund amount exceeds net paid', async () => {
      methodRepo.findOne.mockResolvedValue(mockMethod());
      const manager = buildMockManager(
        [{ amount: 400 }] as SalesOrderPayment[],
        jest.fn(),
        mockOrder({ paymentStatus: SalesOrderPaymentStatus.PARTIAL }),
      );
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb: any) => cb(manager));

      await expect(
        service.recordRefund('order-1', {
          paymentMethodId: 'method-1',
          amount: 500,
          paymentDate: '2026-01-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates negative payment record inside a transaction', async () => {
      const order = mockOrder({ paymentStatus: SalesOrderPaymentStatus.PAID });
      orderRepo.findOne.mockResolvedValue(order);
      methodRepo.findOne.mockResolvedValue(mockMethod());
      paymentRepo.find.mockResolvedValue([{ amount: 1000 }] as SalesOrderPayment[]);

      const mockManager = buildMockManager([
        { amount: 1000 },
        { amount: -400 },
      ] as SalesOrderPayment[]);
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (cb: (m: EntityManager) => Promise<any>) => cb(mockManager),
      );

      await service.recordRefund('order-1', {
        paymentMethodId: 'method-1',
        amount: 400,
        paymentDate: '2026-01-01',
      });

      expect(dataSource.transaction).toHaveBeenCalled();
      expect(auditLogService.log).toHaveBeenCalledWith(
        'CREATE',
        'SalesOrderPayment',
        expect.any(String),
        expect.objectContaining({
          newValues: expect.objectContaining({ amount: -400 }),
        }),
      );
    });

    it('records the resulting payment status in the refund audit log', async () => {
      const order = mockOrder({
        paymentStatus: SalesOrderPaymentStatus.OVERPAID,
        totalAmount: 1000,
      });
      orderRepo.findOne.mockResolvedValue(order);
      methodRepo.findOne.mockResolvedValue(mockMethod());
      paymentRepo.find.mockResolvedValue([{ amount: 1200 }] as SalesOrderPayment[]);

      // After refunding 200, the manager-side find returns net 1000 -> status PAID
      const mockManager = buildMockManager([
        { amount: 1200 },
        { amount: -200 },
      ] as SalesOrderPayment[]);
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (cb: (m: EntityManager) => Promise<any>) => cb(mockManager),
      );

      await service.recordRefund('order-1', {
        paymentMethodId: 'method-1',
        amount: 200,
        paymentDate: '2026-01-01',
      });

      expect(auditLogService.log).toHaveBeenCalledWith(
        'CREATE',
        'SalesOrderPayment',
        expect.any(String),
        expect.objectContaining({
          newValues: expect.objectContaining({
            amount: -200,
            resultingPaymentStatus: SalesOrderPaymentStatus.PAID,
          }),
        }),
      );
    });

    it('allows refund on FULFILLED orders', async () => {
      const order = mockOrder({
        status: SalesOrderStatus.FULFILLED,
        paymentStatus: SalesOrderPaymentStatus.PAID,
      });
      methodRepo.findOne.mockResolvedValue(mockMethod());

      const mockManager = buildMockManager(
        [{ amount: 1000 }] as SalesOrderPayment[],
        jest.fn(),
        order,
      );
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (cb: (m: EntityManager) => Promise<any>) => cb(mockManager),
      );

      await expect(
        service.recordRefund('order-1', {
          paymentMethodId: 'method-1',
          amount: 1000,
          paymentDate: '2026-01-01',
        }),
      ).resolves.not.toThrow();
    });

    it('lock-reads the order and computes the refund cap inside the transaction', async () => {
      const order = mockOrder({ status: SalesOrderStatus.READY });
      const findOne = jest.fn().mockResolvedValue(order);
      const paymentFind = jest.fn().mockResolvedValue([{ amount: 1000 }]);
      const manager = {
        getRepository: jest.fn().mockImplementation((entity) => {
          if (entity === SalesOrderPayment) {
            return {
              create: jest.fn().mockImplementation((d) => d),
              save: jest.fn().mockImplementation((d) => Promise.resolve({ id: 'r1', ...d })),
              find: paymentFind,
            };
          }
          return { findOne, update: jest.fn() };
        }),
      } as unknown as EntityManager;
      methodRepo.findOne.mockResolvedValue(mockMethod());
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb: any) => cb(manager));

      await service.recordRefund('order-1', {
        amount: 400,
        paymentMethodId: 'method-1',
        paymentDate: new Date(),
      } as any);

      expect(findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'order-1' },
          lock: { mode: 'pessimistic_write' },
        }),
      );
      expect(paymentFind).toHaveBeenCalled();
    });

    it('throws ConflictException in-lock when the order is CANCELLED', async () => {
      const findOne = jest
        .fn()
        .mockResolvedValue(mockOrder({ status: SalesOrderStatus.CANCELLED }));
      const manager = {
        getRepository: jest
          .fn()
          .mockImplementation((entity) =>
            entity === SalesOrderPayment
              ? { find: jest.fn(), create: jest.fn(), save: jest.fn() }
              : { findOne, update: jest.fn() },
          ),
      } as unknown as EntityManager;
      methodRepo.findOne.mockResolvedValue(mockMethod());
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb: any) => cb(manager));

      await expect(
        service.recordRefund('order-1', {
          amount: 100,
          paymentMethodId: 'method-1',
          paymentDate: new Date(),
        } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('posts a SALES_REFUND JE inside the refund transaction', async () => {
      const order = mockOrder({ status: SalesOrderStatus.READY });
      methodRepo.findOne.mockResolvedValue(mockMethod({ accountingChannel: 'BANK' }));
      const findOne = jest.fn().mockResolvedValue(order);
      const paymentFind = jest.fn().mockResolvedValue([{ amount: 1000 }]);
      const manager = {
        getRepository: jest.fn().mockImplementation((entity) => {
          if (entity === SalesOrderPayment) {
            return {
              create: jest.fn().mockImplementation((d) => d),
              save: jest.fn().mockImplementation((d) => Promise.resolve({ id: 'refund-new', ...d })),
              find: paymentFind,
            };
          }
          return { findOne, update: jest.fn() };
        }),
      } as unknown as EntityManager;
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb: any) => cb(manager));

      await service.recordRefund('order-1', {
        paymentMethodId: 'method-1', amount: 400, paymentDate: '2026-07-10',
      } as any, 'u', 'admin');

      expect(accountingPort.postSalesRefund).toHaveBeenCalledWith(
        expect.objectContaining({ salesOrderId: 'order-1', channel: 'BANK', amount: '400.0000', refundRowId: 'refund-new' }),
        expect.anything(),
      );
    });

    it('rejects a refund exceeding net paid (cap read in-lock)', async () => {
      const findOne = jest.fn().mockResolvedValue(mockOrder({ status: SalesOrderStatus.READY }));
      const manager = {
        getRepository: jest.fn().mockImplementation((entity) =>
          entity === SalesOrderPayment
            ? {
                find: jest.fn().mockResolvedValue([{ amount: 100 }]),
                create: jest.fn(),
                save: jest.fn(),
              }
            : { findOne, update: jest.fn() },
        ),
      } as unknown as EntityManager;
      methodRepo.findOne.mockResolvedValue(mockMethod());
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb: any) => cb(manager));

      await expect(
        service.recordRefund('order-1', {
          amount: 500,
          paymentMethodId: 'method-1',
          paymentDate: new Date(),
        } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('READY status reconciliation', () => {
    it('flips DRAFT -> READY when a payment pays the order in full', async () => {
      const order = mockOrder({
        status: SalesOrderStatus.DRAFT,
        totalAmount: 100,
      });
      orderRepo.findOne.mockResolvedValue(order);
      methodRepo.findOne.mockResolvedValue(mockMethod());
      const update = jest.fn().mockResolvedValue(undefined);
      const manager = buildMockManager([{ amount: 100 }] as SalesOrderPayment[], update, order);
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (cb: (m: EntityManager) => Promise<any>) => cb(manager),
      );

      await service.recordPayment(order.id, {
        amount: 100,
        paymentMethodId: 'method-1',
        paymentDate: '2026-05-30',
      });

      expect(update).toHaveBeenCalledWith(
        order.id,
        expect.objectContaining({
          status: SalesOrderStatus.READY,
          paymentStatus: SalesOrderPaymentStatus.PAID,
        }),
      );
    });

    it('keeps DRAFT on overpayment', async () => {
      const order = mockOrder({
        status: SalesOrderStatus.DRAFT,
        totalAmount: 100,
      });
      orderRepo.findOne.mockResolvedValue(order);
      methodRepo.findOne.mockResolvedValue(mockMethod());
      const update = jest.fn().mockResolvedValue(undefined);
      const manager = buildMockManager([{ amount: 120 }] as SalesOrderPayment[], update, order);
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (cb: (m: EntityManager) => Promise<any>) => cb(manager),
      );

      await service.recordPayment(order.id, {
        amount: 120,
        paymentMethodId: 'method-1',
        paymentDate: '2026-05-30',
      });

      expect(update).toHaveBeenCalledWith(
        order.id,
        expect.objectContaining({ paymentStatus: SalesOrderPaymentStatus.OVERPAID }),
      );
      expect(order.status).toBe(SalesOrderStatus.DRAFT);
    });

    it('flips READY -> DRAFT when a refund drops below full payment', async () => {
      const order = mockOrder({
        status: SalesOrderStatus.READY,
        paymentStatus: SalesOrderPaymentStatus.PAID,
        totalAmount: 100,
      });
      methodRepo.findOne.mockResolvedValue(mockMethod());
      const update = jest.fn().mockResolvedValue(undefined);
      const manager = buildMockManager(
        [{ amount: 100 }, { amount: -40 }] as SalesOrderPayment[],
        update,
        order,
      );
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (cb: (m: EntityManager) => Promise<any>) => cb(manager),
      );

      await service.recordRefund(order.id, {
        amount: 40,
        paymentMethodId: 'method-1',
        paymentDate: '2026-05-30',
      });

      expect(update).toHaveBeenCalledWith(
        order.id,
        expect.objectContaining({
          status: SalesOrderStatus.DRAFT,
          paymentStatus: SalesOrderPaymentStatus.PARTIAL,
        }),
      );
    });

    it('leaves status DRAFT when a partial payment does not reach full', async () => {
      const order = mockOrder({
        status: SalesOrderStatus.DRAFT,
        totalAmount: 100,
      });
      orderRepo.findOne.mockResolvedValue(order);
      methodRepo.findOne.mockResolvedValue(mockMethod());
      const update = jest.fn().mockResolvedValue(undefined);
      const manager = buildMockManager([{ amount: 30 }] as SalesOrderPayment[], update, order);
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (cb: (m: EntityManager) => Promise<any>) => cb(manager),
      );

      await service.recordPayment(order.id, {
        amount: 30,
        paymentMethodId: 'method-1',
        paymentDate: '2026-05-30',
      });

      expect(update).toHaveBeenCalledWith(
        order.id,
        expect.objectContaining({
          paymentStatus: SalesOrderPaymentStatus.PARTIAL,
        }),
      );
      expect(update.mock.calls[0][1]).not.toHaveProperty('status');
    });
  });

  describe('payment guards under READY', () => {
    it('rejects a new payment on a READY order', async () => {
      methodRepo.findOne.mockResolvedValue(mockMethod());
      const manager = buildMockManager(
        [],
        jest.fn(),
        mockOrder({ status: SalesOrderStatus.READY }),
      );
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb: any) => cb(manager));

      await expect(
        service.recordPayment('order-1', {
          amount: 10,
          paymentMethodId: 'method-1',
          paymentDate: '2026-05-30',
        }),
      ).rejects.toThrow('Payments can only be recorded on DRAFT orders');
    });

    it('allows a refund on a READY order', async () => {
      orderRepo.findOne.mockResolvedValue(
        mockOrder({
          status: SalesOrderStatus.READY,
          paymentStatus: SalesOrderPaymentStatus.PAID,
          totalAmount: 100,
        }),
      );
      methodRepo.findOne.mockResolvedValue(mockMethod());
      paymentRepo.find.mockResolvedValue([{ amount: 100 }] as SalesOrderPayment[]);
      const manager = buildMockManager([{ amount: 100 }, { amount: -40 }] as SalesOrderPayment[]);
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (cb: (m: EntityManager) => Promise<any>) => cb(manager),
      );

      await expect(
        service.recordRefund('order-1', {
          amount: 40,
          paymentMethodId: 'method-1',
          paymentDate: '2026-05-30',
        }),
      ).resolves.toBeDefined();
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
      (dataSource.transaction as jest.Mock).mockImplementation(
        async (cb: (m: EntityManager) => Promise<any>) => cb(manager),
      );

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

      const dtos = [
        {
          paymentMethodId: 'bad-method',
          amount: 100,
          paymentDate: '2026-01-01',
        },
      ];
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

      expect(paymentRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { salesOrderId: 'order-1' },
          order: { paymentDate: 'ASC' },
        }),
      );
      expect(result).toHaveLength(1);
    });
  });
});
