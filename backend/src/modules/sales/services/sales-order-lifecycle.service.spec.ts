import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { SalesOrderLifecycleService } from './sales-order-lifecycle.service';
import { SalesOrder, SalesOrderStatus, SalesOrderPaymentStatus } from '../../../database/entities/sales-order.entity';
import { AuditLogService } from '../../audit-logs/services';

const mockOrder = (overrides: Partial<SalesOrder> = {}): SalesOrder => ({
  id: 'order-1',
  orderNumber: 'SO-000001',
  status: SalesOrderStatus.DRAFT,
  paymentStatus: SalesOrderPaymentStatus.UNPAID,
  totalAmount: 1000,
  customerId: 'customer-1',
  items: [],
  ...overrides,
} as SalesOrder);

describe('SalesOrderLifecycleService', () => {
  let service: SalesOrderLifecycleService;
  let orderRepo: jest.Mocked<Repository<SalesOrder>>;
  let auditLogService: jest.Mocked<AuditLogService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesOrderLifecycleService,
        { provide: getRepositoryToken(SalesOrder), useValue: { findOne: jest.fn(), save: jest.fn() } },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get(SalesOrderLifecycleService);
    orderRepo = module.get(getRepositoryToken(SalesOrder));
    auditLogService = module.get(AuditLogService);
  });

  describe('assertEditAllowed', () => {
    it('throws when status is FULFILLED', async () => {
      orderRepo.findOne.mockResolvedValue(mockOrder({ status: SalesOrderStatus.FULFILLED }));
      await expect(service.assertEditAllowed('order-1')).rejects.toThrow(BadRequestException);
    });

    it('throws when DRAFT but paymentStatus is PARTIAL', async () => {
      orderRepo.findOne.mockResolvedValue(mockOrder({ paymentStatus: SalesOrderPaymentStatus.PARTIAL }));
      await expect(service.assertEditAllowed('order-1')).rejects.toThrow(BadRequestException);
    });

    it('passes when DRAFT and UNPAID', async () => {
      orderRepo.findOne.mockResolvedValue(mockOrder());
      await expect(service.assertEditAllowed('order-1')).resolves.not.toThrow();
    });
  });

  describe('cancel', () => {
    it('throws when status is FULFILLED', async () => {
      orderRepo.findOne.mockResolvedValue(mockOrder({ status: SalesOrderStatus.FULFILLED }));
      await expect(service.cancel('order-1')).rejects.toThrow(ConflictException);
    });

    it('throws when DRAFT but paymentStatus is not UNPAID', async () => {
      orderRepo.findOne.mockResolvedValue(mockOrder({ paymentStatus: SalesOrderPaymentStatus.PARTIAL }));
      await expect(service.cancel('order-1')).rejects.toThrow(ConflictException);
    });

    it('sets status to CANCELLED when DRAFT and UNPAID', async () => {
      const order = mockOrder();
      orderRepo.findOne.mockResolvedValue(order);
      orderRepo.save.mockResolvedValue({ ...order, status: SalesOrderStatus.CANCELLED } as SalesOrder);

      await service.cancel('order-1');

      expect(orderRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: SalesOrderStatus.CANCELLED }));
    });
  });

  describe('uncancel', () => {
    it('throws when order is not CANCELLED', async () => {
      orderRepo.findOne.mockResolvedValue(mockOrder({ status: SalesOrderStatus.DRAFT }));
      await expect(service.uncancel('order-1')).rejects.toThrow(ConflictException);
    });

    it('sets status to DRAFT when CANCELLED', async () => {
      const order = mockOrder({ status: SalesOrderStatus.CANCELLED });
      orderRepo.findOne.mockResolvedValue(order);
      orderRepo.save.mockResolvedValue({ ...order, status: SalesOrderStatus.DRAFT } as SalesOrder);

      await service.uncancel('order-1');

      expect(orderRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: SalesOrderStatus.DRAFT }));
    });
  });
});
