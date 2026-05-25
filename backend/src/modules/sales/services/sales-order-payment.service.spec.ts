import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesOrderPaymentService,
        { provide: getRepositoryToken(SalesOrder), useValue: { findOne: jest.fn(), save: jest.fn() } },
        { provide: getRepositoryToken(SalesOrderPayment), useValue: { find: jest.fn(), create: jest.fn(), save: jest.fn() } },
        { provide: getRepositoryToken(PaymentMethodEntity), useValue: { findOne: jest.fn() } },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get(SalesOrderPaymentService);
    orderRepo = module.get(getRepositoryToken(SalesOrder));
    paymentRepo = module.get(getRepositoryToken(SalesOrderPayment));
    methodRepo = module.get(getRepositoryToken(PaymentMethodEntity));
    auditLogService = module.get(AuditLogService);
  });

  describe('recomputePaymentStatus', () => {
    it('returns UNPAID when no payments', () => {
      expect(service.computePaymentStatus([], 1000)).toBe(SalesOrderPaymentStatus.UNPAID);
    });

    it('returns PARTIAL when net paid < total', () => {
      const records = [{ amount: 400 } as SalesOrderPayment];
      expect(service.computePaymentStatus(records, 1000)).toBe(SalesOrderPaymentStatus.PARTIAL);
    });

    it('returns PAID when net paid = total', () => {
      const records = [{ amount: 1000 } as SalesOrderPayment];
      expect(service.computePaymentStatus(records, 1000)).toBe(SalesOrderPaymentStatus.PAID);
    });

    it('returns OVERPAID when net paid > total', () => {
      const records = [{ amount: 1200 } as SalesOrderPayment];
      expect(service.computePaymentStatus(records, 1000)).toBe(SalesOrderPaymentStatus.OVERPAID);
    });

    it('returns UNPAID after full payment + full refund', () => {
      const records = [{ amount: 1000 }, { amount: -1000 }] as SalesOrderPayment[];
      expect(service.computePaymentStatus(records, 1000)).toBe(SalesOrderPaymentStatus.UNPAID);
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
      orderRepo.findOne.mockResolvedValue(mockOrder());
      await expect(service.recordPayment('order-1', { paymentMethodId: 'method-1', amount: 0, paymentDate: '2026-01-01' }))
        .rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when payment method not found', async () => {
      orderRepo.findOne.mockResolvedValue(mockOrder());
      methodRepo.findOne.mockResolvedValue(null);
      await expect(service.recordPayment('order-1', { paymentMethodId: 'method-1', amount: 100, paymentDate: '2026-01-01' }))
        .rejects.toThrow(BadRequestException);
    });

    it('creates payment record and updates paymentStatus', async () => {
      const order = mockOrder();
      orderRepo.findOne.mockResolvedValue(order);
      methodRepo.findOne.mockResolvedValue(mockMethod());
      paymentRepo.find.mockResolvedValue([]);
      paymentRepo.create.mockReturnValue({ amount: 1000 } as SalesOrderPayment);
      paymentRepo.save.mockResolvedValue({ amount: 1000 } as SalesOrderPayment);
      orderRepo.save.mockResolvedValue({ ...order, paymentStatus: SalesOrderPaymentStatus.PAID } as SalesOrder);

      await service.recordPayment('order-1', { paymentMethodId: 'method-1', amount: 1000, paymentDate: '2026-01-01' });

      expect(paymentRepo.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 1000, salesOrderId: 'order-1' }));
      expect(orderRepo.save).toHaveBeenCalledWith(expect.objectContaining({ paymentStatus: SalesOrderPaymentStatus.PAID }));
    });
  });

  describe('recordRefund', () => {
    it('throws BadRequestException when refund amount exceeds net paid', async () => {
      const order = mockOrder({ paymentStatus: SalesOrderPaymentStatus.PARTIAL });
      orderRepo.findOne.mockResolvedValue(order);
      methodRepo.findOne.mockResolvedValue(mockMethod());
      paymentRepo.find.mockResolvedValue([{ amount: 400 }] as SalesOrderPayment[]);

      await expect(service.recordRefund('order-1', { paymentMethodId: 'method-1', amount: 500, paymentDate: '2026-01-01' }))
        .rejects.toThrow(BadRequestException);
    });

    it('creates negative payment record for refund', async () => {
      const order = mockOrder({ paymentStatus: SalesOrderPaymentStatus.PAID });
      orderRepo.findOne.mockResolvedValue(order);
      methodRepo.findOne.mockResolvedValue(mockMethod());
      paymentRepo.find.mockResolvedValue([{ amount: 1000 }] as SalesOrderPayment[]);
      paymentRepo.create.mockReturnValue({ amount: -400 } as SalesOrderPayment);
      paymentRepo.save.mockResolvedValue({ amount: -400 } as SalesOrderPayment);
      orderRepo.save.mockResolvedValue({ ...order, paymentStatus: SalesOrderPaymentStatus.PARTIAL } as SalesOrder);

      await service.recordRefund('order-1', { paymentMethodId: 'method-1', amount: 400, paymentDate: '2026-01-01' });

      expect(paymentRepo.create).toHaveBeenCalledWith(expect.objectContaining({ amount: -400 }));
    });
  });

  describe('listPayments', () => {
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
