import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { SalesOrderService } from './sales-order.service';
import { SalesOrder, SalesOrderPaymentStatus, SalesOrderStatus } from '../../../database/entities/sales-order.entity';
import { SalesOrderItem, DiscountType } from '../../../database/entities/sales-order-item.entity';
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
  let customerRepository: any;
  let productRepository: any;
  let priceListItemRepository: any;
  let dataSource: jest.Mocked<DataSource>;
  let reconcileSpy: jest.SpyInstance;

  beforeEach(async () => {
    dataSource = { transaction: jest.fn() } as any;

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
        { provide: SalesOrderPaymentService, useValue: { recordPayment: jest.fn(), recordRefund: jest.fn(), listPayments: jest.fn(), reconcileOrderState: jest.fn() } },
        { provide: SalesOrderQueryService, useValue: { findById: jest.fn(), findAll: jest.fn(), findSummaries: jest.fn(), getDashboardStats: jest.fn(), findByOrderNumber: jest.fn(), findOrdersByCustomer: jest.fn() } },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(SalesOrderService);
    salesOrderLifecycleService = module.get(SalesOrderLifecycleService);
    salesOrderPaymentService = module.get(SalesOrderPaymentService);
    salesOrderFulfillmentService = module.get(SalesOrderFulfillmentService);
    salesOrderQueryService = module.get(SalesOrderQueryService);
    salesOrderRepository = module.get(getRepositoryToken(SalesOrder));
    salesOrderItemRepository = module.get(getRepositoryToken(SalesOrderItem));
    customerRepository = module.get(getRepositoryToken(Customer));
    productRepository = module.get(getRepositoryToken(Product));
    priceListItemRepository = module.get(getRepositoryToken(PriceListItem));
    reconcileSpy = jest.spyOn(salesOrderPaymentService, 'reconcileOrderState');
    dataSource.transaction.mockImplementation(async (cb: any) => cb({
      getRepository: (entity: any) => entity === SalesOrderItem ? salesOrderItemRepository : salesOrderRepository,
    }));
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

    it('reconciles payment state when an edit changes the total', async () => {
      const existing = {
        id: 'order-1',
        orderNumber: 'SO-1',
        customerId: 'customer-1',
        status: SalesOrderStatus.DRAFT,
        paidAmount: 400,
        totalAmount: 1000,
        shippingAmount: 0,
      } as any;

      salesOrderRepository.findOne = jest.fn().mockResolvedValue(existing);
      salesOrderItemRepository.find = jest.fn().mockResolvedValue([{ totalAmount: 1100 }] as any);
      salesOrderRepository.update = jest.fn().mockResolvedValue({ affected: 1 });
      salesOrderQueryService.findById.mockResolvedValue({ ...existing, totalAmount: 1100, balanceDue: 700 } as any);
      salesOrderLifecycleService.assertEditAllowed.mockResolvedValue(undefined);

      await service.update('order-1', { shippingAmount: 0 } as any);

      expect(salesOrderRepository.update).toHaveBeenCalledWith('order-1', expect.objectContaining({
        totalAmount: 1100,
      }));
      expect(salesOrderPaymentService.reconcileOrderState).toHaveBeenCalledWith('order-1', expect.any(Object));
    });
  });

  describe('update — atomicity', () => {
    it('prices fallback-customer items from the LOCKED order customer, not the pre-lock read', async () => {
      // Pre-lock read returns the STALE customer; the locked read returns the FRESH one.
      salesOrderRepository.findOne = jest.fn().mockResolvedValue({
        id: 'order-1', orderNumber: 'SO-1', status: 'DRAFT', paymentStatus: 'UNPAID',
        paidAmount: 0, shippingAmount: 0, customerId: 'cust-STALE',
      });
      const mgrOrderRepo = {
        findOne: jest.fn().mockResolvedValue({
          id: 'order-1', orderNumber: 'SO-1', status: 'DRAFT', paymentStatus: 'UNPAID',
          paidAmount: 0, shippingAmount: 0, customerId: 'cust-FRESH',
        }),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      const mgrItemRepo = { delete: jest.fn().mockResolvedValue(undefined), insert: jest.fn().mockResolvedValue(undefined), find: jest.fn().mockResolvedValue([]) };
      const mgrCustomerRepo = {
        findOne: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve({ id: where.id, priceListId: where.id === 'cust-FRESH' ? 'PL-FRESH' : 'PL-STALE' }),
        ),
      };
      const manager = {
        getRepository: (e: any) => e === SalesOrderItem ? mgrItemRepo : e === Customer ? mgrCustomerRepo : mgrOrderRepo,
      } as unknown as EntityManager;
      dataSource.transaction = jest.fn().mockImplementation(async (cb: any) => cb(manager));
      reconcileSpy.mockResolvedValue('UNPAID');

      customerRepository.findOne = jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve({ id: where.id, priceListId: where.id === 'cust-FRESH' ? 'PL-FRESH' : 'PL-STALE' }),
      );
      productRepository.findOne = jest.fn().mockResolvedValue({ id: 'p1', baseCost: 1 });
      priceListItemRepository.findOne = jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(where.priceListId === 'PL-FRESH' ? { price: 70 } : { price: 999 }),
      );

      await service.update('order-1', { items: [{ productId: 'p1', quantity: 1 }] } as any);

      expect(priceListItemRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ priceListId: 'PL-FRESH' }) }),
      );
      expect(mgrItemRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ unitPrice: 70, totalAmount: 70 }),
      );
      expect(mgrOrderRepo.update).toHaveBeenCalledWith(
        'order-1', expect.objectContaining({ subtotal: 70, totalAmount: 70 }),
      );
    });

    it('derives shipping fallback from the LOCKED order and writes via the manager', async () => {
      // Root repos return a STALE order (old shipping=5); the locked read returns fresh shipping=20.
      salesOrderRepository.findOne = jest.fn().mockResolvedValue({
        id: 'order-1', orderNumber: 'SO-1', status: 'DRAFT', paymentStatus: 'UNPAID',
        paidAmount: 0, shippingAmount: 5, customerId: 'c1',
      });
      // Distinct manager-scoped repos so we can prove writes use them, not the root repos.
      const mgrOrderRepo = {
        findOne: jest.fn().mockResolvedValue({
          id: 'order-1', orderNumber: 'SO-1', status: 'DRAFT', paymentStatus: 'UNPAID',
          paidAmount: 0, shippingAmount: 20, customerId: 'c1',
        }),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      const mgrItemRepo = { delete: jest.fn().mockResolvedValue(undefined), insert: jest.fn().mockResolvedValue(undefined), find: jest.fn().mockResolvedValue([]) };
      const manager = {
        getRepository: (e: any) => (e === SalesOrderItem ? mgrItemRepo : mgrOrderRepo),
      } as unknown as EntityManager;
      dataSource.transaction = jest.fn().mockImplementation(async (cb: any) => cb(manager));
      reconcileSpy.mockResolvedValue('UNPAID');
      // One product priced at 100, no shippingAmount in the DTO -> fallback must use shipping=20.
      productRepository.findOne = jest.fn().mockResolvedValue({ id: 'p1', sellingPrice: 100 });

      await service.update('order-1', { items: [{ productId: 'p1', quantity: 1, unitPrice: 100 }] } as any);

      // Writes go through the MANAGER repos, never the root repos.
      expect(mgrItemRepo.insert).toHaveBeenCalled();
      expect(salesOrderItemRepository.insert).not.toHaveBeenCalled();
      // The order read used a write lock.
      expect(mgrOrderRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'order-1' }, lock: { mode: 'pessimistic_write' } }),
      );
      // Total used the LOCKED shipping (20), not the stale root value (5): 100 + 20 = 120.
      expect(mgrOrderRepo.update).toHaveBeenCalledWith(
        'order-1',
        expect.objectContaining({ shippingAmount: 20, totalAmount: 120 }),
      );
      // Reconcile joined the same transaction.
      expect(reconcileSpy).toHaveBeenCalledWith('order-1', manager);
    });

    it('shipping-only edit reads existing items via the manager (locked), not the root repo', async () => {
      salesOrderRepository.findOne = jest.fn().mockResolvedValue({
        id: 'order-1', orderNumber: 'SO-1', status: 'DRAFT', paymentStatus: 'UNPAID', paidAmount: 0, customerId: 'c1',
      });
      const mgrOrderRepo = {
        findOne: jest.fn().mockResolvedValue({ id: 'order-1', orderNumber: 'SO-1', status: 'DRAFT', paymentStatus: 'UNPAID', paidAmount: 0, customerId: 'c1' }),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      const mgrItemRepo = { delete: jest.fn(), insert: jest.fn(), find: jest.fn().mockResolvedValue([{ totalAmount: 300 }]) };
      const manager = { getRepository: (e: any) => (e === SalesOrderItem ? mgrItemRepo : mgrOrderRepo) } as unknown as EntityManager;
      dataSource.transaction = jest.fn().mockImplementation(async (cb: any) => cb(manager));
      reconcileSpy.mockResolvedValue('UNPAID');

      await service.update('order-1', { shippingAmount: 50 } as any);

      expect(mgrItemRepo.find).toHaveBeenCalledWith({ where: { salesOrderId: 'order-1' } });
      expect(salesOrderItemRepository.find).not.toHaveBeenCalled();
      expect(mgrOrderRepo.update).toHaveBeenCalledWith(
        'order-1',
        expect.objectContaining({ subtotal: 300, totalAmount: 350 }),
      );
    });

    it('rolls back: when an item insert fails the transaction rejects and reconcile is not called', async () => {
      salesOrderRepository.findOne = jest.fn().mockResolvedValue({ id: 'order-1', orderNumber: 'SO-1', status: 'DRAFT', paymentStatus: 'UNPAID', paidAmount: 0, shippingAmount: 0, customerId: 'c1' });
      const mgrOrderRepo = { findOne: jest.fn().mockResolvedValue({ id: 'order-1', orderNumber: 'SO-1', status: 'DRAFT', paymentStatus: 'UNPAID', paidAmount: 0, shippingAmount: 0, customerId: 'c1' }), update: jest.fn() };
      const mgrItemRepo = { delete: jest.fn().mockResolvedValue(undefined), insert: jest.fn().mockRejectedValue(new Error('insert failed')), find: jest.fn() };
      const manager = { getRepository: (e: any) => (e === SalesOrderItem ? mgrItemRepo : mgrOrderRepo) } as unknown as EntityManager;
      dataSource.transaction = jest.fn().mockImplementation(async (cb: any) => cb(manager));
      productRepository.findOne = jest.fn().mockResolvedValue({ id: 'p1', sellingPrice: 10 });

      await expect(service.update('order-1', { items: [{ productId: 'p1', quantity: 1, unitPrice: 10 }] } as any)).rejects.toThrow('insert failed');
      expect(reconcileSpy).not.toHaveBeenCalled();
    });
  });

  describe('duplicateOrder', () => {
    it('preserves a fixed-amount (AMOUNT) line discount on the duplicate', async () => {
      const original = {
        id: 'order-1',
        customerId: 'customer-1',
        notes: 'orig notes',
        shippingAmount: 10,
        items: [
          {
            productId: 'product-1',
            quantity: 2,
            unitPrice: 100,
            discountType: DiscountType.AMOUNT,
            discountPercent: 0,
            discountAmount: 25,
            notes: 'line notes',
          },
        ],
      } as any;
      salesOrderRepository.findOne = jest.fn().mockResolvedValue(original);
      const createSpy = jest
        .spyOn(service, 'create')
        .mockResolvedValue({ id: 'order-2' } as any);

      await service.duplicateOrder('order-1', 'user-1');

      const passedDto = createSpy.mock.calls[0][0];
      expect(passedDto.items[0]).toMatchObject({
        productId: 'product-1',
        discountType: DiscountType.AMOUNT,
        discountPercent: 0,
        discountAmount: 25,
      });
    });

    it('preserves a percentage line discount on the duplicate', async () => {
      const original = {
        id: 'order-1',
        customerId: 'customer-1',
        shippingAmount: 0,
        items: [
          {
            productId: 'product-1',
            quantity: 1,
            unitPrice: 100,
            discountType: DiscountType.PERCENTAGE,
            discountPercent: 15,
            discountAmount: 15,
          },
        ],
      } as any;
      salesOrderRepository.findOne = jest.fn().mockResolvedValue(original);
      const createSpy = jest
        .spyOn(service, 'create')
        .mockResolvedValue({ id: 'order-2' } as any);

      await service.duplicateOrder('order-1', 'user-1');

      expect(createSpy.mock.calls[0][0].items[0]).toMatchObject({
        discountType: DiscountType.PERCENTAGE,
        discountPercent: 15,
      });
    });
  });
});
