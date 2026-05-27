import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SalesOrderService } from './sales-order.service';
import { SalesOrder, SalesOrderPaymentStatus, SalesOrderStatus } from '../../../database/entities/sales-order.entity';
import { SalesOrderItem } from '../../../database/entities/sales-order-item.entity';
import { Customer } from '../../../database/entities/customer.entity';
import { Product } from '../../../database/entities/product.entity';
import { Invoice } from '../../../database/entities/invoice.entity';
import { InvoiceItem } from '../../../database/entities/invoice-item.entity';
import { User } from '../../../database/entities/user.entity';
import { PriceListItem } from '../../../database/entities/price-list-item.entity';
import { InventoryIntegrationService } from './inventory-integration.service';
import { StockMovementService } from '../../../modules/inventory/services/stock-movement.service';
import { BaseCostCalculatorService } from '../../inventory/services/base-cost-calculator.service';
import { SettingsService } from '../../settings/settings.service';
import { AuditLogService } from '../../audit-logs/services';
import { AccountingService } from '../../accounting/services/accounting.service';
import { SalesOrderFulfillmentService } from './sales-order-fulfillment.service';
import { SalesOrderLifecycleService } from './sales-order-lifecycle.service';
import { SalesOrderPaymentService } from './sales-order-payment.service';
import { SalesOrderQueryService } from './sales-order-query.service';
import { CustomerService } from './customer.service';

describe('SalesOrderService', () => {
  let service: SalesOrderService;
  let salesOrderLifecycleService: jest.Mocked<SalesOrderLifecycleService>;
  let salesOrderPaymentService: jest.Mocked<SalesOrderPaymentService>;
  let salesOrderFulfillmentService: jest.Mocked<SalesOrderFulfillmentService>;
  let salesOrderQueryService: jest.Mocked<SalesOrderQueryService>;
  let salesOrderRepository: any;
  let salesOrderItemRepository: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesOrderService,
        { provide: getRepositoryToken(SalesOrder), useValue: { findOne: jest.fn(), create: jest.fn(), save: jest.fn(), update: jest.fn(), createQueryBuilder: jest.fn() } },
        { provide: getRepositoryToken(SalesOrderItem), useValue: { save: jest.fn(), delete: jest.fn(), insert: jest.fn(), find: jest.fn() } },
        { provide: getRepositoryToken(Customer), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Product), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(Invoice), useValue: { createQueryBuilder: jest.fn(), create: jest.fn(), save: jest.fn(), find: jest.fn() } },
        { provide: getRepositoryToken(InvoiceItem), useValue: { insert: jest.fn(), delete: jest.fn() } },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: getRepositoryToken(PriceListItem), useValue: { findOne: jest.fn() } },
        { provide: CustomerService, useValue: { updateCustomerMetrics: jest.fn() } },
        { provide: InventoryIntegrationService, useValue: { checkAvailability: jest.fn(), reserveStock: jest.fn(), getOrderFulfillmentStatus: jest.fn() } },
        { provide: StockMovementService, useValue: {} },
        { provide: BaseCostCalculatorService, useValue: {} },
        { provide: SettingsService, useValue: { generateDocumentNumber: jest.fn() } },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
        { provide: AccountingService, useValue: {} },
        { provide: SalesOrderFulfillmentService, useValue: { fulfillOrder: jest.fn(), unfulfillOrder: jest.fn() } },
        { provide: SalesOrderLifecycleService, useValue: { assertEditAllowed: jest.fn(), cancel: jest.fn(), uncancel: jest.fn() } },
        { provide: SalesOrderPaymentService, useValue: { recordPayment: jest.fn(), recordRefund: jest.fn(), listPayments: jest.fn() } },
        { provide: SalesOrderQueryService, useValue: { findById: jest.fn(), findAll: jest.fn(), findSummaries: jest.fn(), getDashboardStats: jest.fn(), findByOrderNumber: jest.fn(), findOrdersByCustomer: jest.fn() } },
      ],
    }).compile();

    service = module.get(SalesOrderService);
    salesOrderLifecycleService = module.get(SalesOrderLifecycleService);
    salesOrderPaymentService = module.get(SalesOrderPaymentService);
    salesOrderFulfillmentService = module.get(SalesOrderFulfillmentService);
    salesOrderQueryService = module.get(SalesOrderQueryService);
    salesOrderRepository = module.get(getRepositoryToken(SalesOrder));
    salesOrderItemRepository = module.get(getRepositoryToken(SalesOrderItem));
    salesOrderQueryService.findById.mockResolvedValue({ id: 'order-1' } as any);
  });

  it('delegates cancel then reloads the response', async () => {
    await service.cancel('order-1', 'user-1', 'admin');

    expect(salesOrderLifecycleService.cancel).toHaveBeenCalledWith('order-1', 'user-1', 'admin');
    expect(salesOrderQueryService.findById).toHaveBeenCalledWith('order-1');
  });

  it('delegates uncancel then reloads the response', async () => {
    await service.uncancel('order-1', 'user-1', 'admin');

    expect(salesOrderLifecycleService.uncancel).toHaveBeenCalledWith('order-1', 'user-1', 'admin');
    expect(salesOrderQueryService.findById).toHaveBeenCalledWith('order-1');
  });

  it('delegates recordPayment then reloads the response', async () => {
    const dto = { paymentMethodId: 'method-1', amount: 100, paymentDate: '2026-05-26' };

    await service.recordPayment('order-1', dto, 'user-1', 'admin');

    expect(salesOrderPaymentService.recordPayment).toHaveBeenCalledWith('order-1', dto, 'user-1', 'admin');
    expect(salesOrderQueryService.findById).toHaveBeenCalledWith('order-1');
  });

  it('delegates recordRefund then reloads the response', async () => {
    const dto = { paymentMethodId: 'method-1', amount: 100, paymentDate: '2026-05-26' };

    await service.recordRefund('order-1', dto, 'user-1', 'admin');

    expect(salesOrderPaymentService.recordRefund).toHaveBeenCalledWith('order-1', dto, 'user-1', 'admin');
    expect(salesOrderQueryService.findById).toHaveBeenCalledWith('order-1');
  });

  it('delegates fulfillOrder then reloads the response', async () => {
    await service.fulfillOrder('order-1', 'user-1', 'admin');

    expect(salesOrderFulfillmentService.fulfillOrder).toHaveBeenCalledWith('order-1', 'user-1', 'admin');
    expect(salesOrderQueryService.findById).toHaveBeenCalledWith('order-1');
  });

  it('delegates unfulfillOrder then reloads the response', async () => {
    await service.unfulfillOrder('order-1', 'user-1', 'admin');

    expect(salesOrderFulfillmentService.unfulfillOrder).toHaveBeenCalledWith('order-1', 'user-1', 'admin');
    expect(salesOrderQueryService.findById).toHaveBeenCalledWith('order-1');
  });

  it('uses status/paymentStatus enum fields in mock orders', () => {
    const order = {
      status: SalesOrderStatus.DRAFT,
      paymentStatus: SalesOrderPaymentStatus.PAID,
      subtotal: 1000,
      totalAmount: 1000,
    } as Partial<SalesOrder>;

    expect(order.status).toBe(SalesOrderStatus.DRAFT);
    expect(order.paymentStatus).toBe(SalesOrderPaymentStatus.PAID);
  });

  describe('update - shipping only', () => {
    it('should recalculate totalAmount from DB items when only shippingAmount changes', async () => {
      const mockOrder = {
        id: 'order-1',
        customerId: 'customer-1',
        shippingAmount: 0,
        subtotal: 100,
        totalAmount: 100,
        items: undefined,
      };

      const mockItems = [
        { totalAmount: 60 },
        { totalAmount: 40 },
      ];

      salesOrderRepository.findOne = jest.fn().mockResolvedValue(mockOrder);
      salesOrderItemRepository.find = jest.fn().mockResolvedValue(mockItems);
      salesOrderRepository.update = jest.fn().mockResolvedValue({ affected: 1 });
      salesOrderQueryService.findById.mockResolvedValue({ ...mockOrder, shippingAmount: 15, totalAmount: 115 } as any);
      salesOrderLifecycleService.assertEditAllowed.mockResolvedValue(undefined);

      await service.update('order-1', { shippingAmount: 15 } as any, 'user-1', 'admin');

      expect(salesOrderItemRepository.find).toHaveBeenCalledWith({ where: { salesOrderId: 'order-1' } });
      expect(salesOrderRepository.update).toHaveBeenCalledWith(
        'order-1',
        expect.objectContaining({
          shippingAmount: 15,
          subtotal: 100,
          totalAmount: 115,
        }),
      );
    });
  });
});
