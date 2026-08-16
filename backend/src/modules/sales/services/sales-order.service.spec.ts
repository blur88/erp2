import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { SalesOrderService } from './sales-order.service';
import {
  SalesOrder,
  SalesOrderPaymentStatus,
  SalesOrderStatus,
} from '../../../database/entities/sales-order.entity';
import { SalesOrderItem, DiscountType } from '../../../database/entities/sales-order-item.entity';
import { Customer } from '../../../database/entities/customer.entity';
import { Product } from '../../../database/entities/product.entity';
import { User } from '../../../database/entities/user.entity';
import { PriceListItem } from '../../../database/entities/price-list-item.entity';
import { InventoryIntegrationService } from './inventory-integration.service';
import { StockMovementService } from '../../../modules/inventory/services/stock-movement.service';
import { BaseCostCalculatorService } from '../../inventory/services/base-cost-calculator.service';
import { SettingsService } from '../../settings/settings.service';
import { AuditLogService } from '../../audit-logs/services';
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
  let auditLogService: jest.Mocked<AuditLogService>;

  beforeEach(async () => {
    dataSource = { transaction: jest.fn() } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesOrderService,
        {
          provide: getRepositoryToken(SalesOrder),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(SalesOrderItem),
          useValue: {
            save: jest.fn(),
            delete: jest.fn(),
            insert: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Customer),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(Product),
          useValue: { findOne: jest.fn(), find: jest.fn() },
        },
        { provide: getRepositoryToken(User), useValue: {} },
        {
          provide: getRepositoryToken(PriceListItem),
          useValue: { findOne: jest.fn(), find: jest.fn() },
        },
        {
          provide: CustomerService,
          useValue: { updateCustomerMetrics: jest.fn() },
        },
        {
          provide: InventoryIntegrationService,
          useValue: {
            reserveStock: jest.fn(),
            getOrderFulfillmentStatus: jest.fn(),
          },
        },
        { provide: StockMovementService, useValue: {} },
        { provide: BaseCostCalculatorService, useValue: {} },
        {
          provide: SettingsService,
          useValue: { generateDocumentNumber: jest.fn() },
        },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
        {
          provide: SalesOrderFulfillmentService,
          useValue: { fulfillOrder: jest.fn(), unfulfillOrder: jest.fn() },
        },
        {
          provide: SalesOrderLifecycleService,
          useValue: {
            assertEditAllowed: jest.fn(),
            cancel: jest.fn(),
            uncancel: jest.fn(),
          },
        },
        {
          provide: SalesOrderPaymentService,
          useValue: {
            recordPayment: jest.fn(),
            recordRefund: jest.fn(),
            listPayments: jest.fn(),
            reconcileOrderState: jest.fn(),
          },
        },
        {
          provide: SalesOrderQueryService,
          useValue: {
            findById: jest.fn(),
            findAll: jest.fn(),
            findSummaries: jest.fn(),
            getDashboardStats: jest.fn(),
            findByOrderNumber: jest.fn(),
            findOrdersByCustomer: jest.fn(),
          },
        },
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
    auditLogService = module.get(AuditLogService);
    reconcileSpy = jest.spyOn(salesOrderPaymentService, 'reconcileOrderState');
    dataSource.transaction.mockImplementation(async (cb: any) =>
      cb({
        getRepository: (entity: any) =>
          entity === SalesOrderItem ? salesOrderItemRepository : salesOrderRepository,
      }),
    );
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
    const dto = {
      paymentMethodId: 'method-1',
      amount: '100.0000',
      paymentDate: '2026-05-26',
    };

    await service.recordPayment('order-1', dto, 'user-1', 'admin');

    expect(salesOrderPaymentService.recordPayment).toHaveBeenCalledWith(
      'order-1',
      dto,
      'user-1',
      'admin',
    );
    expect(salesOrderQueryService.findById).toHaveBeenCalledWith('order-1');
  });

  it('delegates recordRefund then reloads the response', async () => {
    const dto = {
      paymentMethodId: 'method-1',
      amount: '100.0000',
      paymentDate: '2026-05-26',
    };

    await service.recordRefund('order-1', dto, 'user-1', 'admin');

    expect(salesOrderPaymentService.recordRefund).toHaveBeenCalledWith(
      'order-1',
      dto,
      'user-1',
      'admin',
    );
    expect(salesOrderQueryService.findById).toHaveBeenCalledWith('order-1');
  });

  it('delegates fulfillOrder then reloads the response', async () => {
    await service.fulfillOrder('order-1', 'user-1', 'admin');

    expect(salesOrderFulfillmentService.fulfillOrder).toHaveBeenCalledWith(
      'order-1',
      'user-1',
      'admin',
    );
    expect(salesOrderQueryService.findById).toHaveBeenCalledWith('order-1');
  });

  it('delegates unfulfillOrder then reloads the response', async () => {
    await service.unfulfillOrder('order-1', 'user-1', 'admin');

    expect(salesOrderFulfillmentService.unfulfillOrder).toHaveBeenCalledWith(
      'order-1',
      'user-1',
      'admin',
    );
    expect(salesOrderQueryService.findById).toHaveBeenCalledWith('order-1');
  });

  it('uses status/paymentStatus enum fields in mock orders', () => {
    const order = {
      status: SalesOrderStatus.DRAFT,
      paymentStatus: SalesOrderPaymentStatus.PAID,
      subtotal: 1000,
      totalAmount: '1000.0000',
    } as Partial<SalesOrder>;

    expect(order.status).toBe(SalesOrderStatus.DRAFT);
    expect(order.paymentStatus).toBe(SalesOrderPaymentStatus.PAID);
  });

  describe('update - shipping only', () => {
    it('should recalculate totalAmount from DB items when only shippingAmount changes', async () => {
      const mockOrder = {
        id: 'order-1',
        customerId: 'customer-1',
        status: SalesOrderStatus.DRAFT,
        shippingAmount: 0,
        subtotal: 100,
        totalAmount: '100.0000',
        items: undefined,
      };

      const mockItems = [{ totalAmount: 60 }, { totalAmount: 40 }];

      salesOrderRepository.findOne = jest.fn().mockResolvedValue(mockOrder);
      salesOrderItemRepository.find = jest.fn().mockResolvedValue(mockItems);
      salesOrderRepository.update = jest.fn().mockResolvedValue({ affected: 1 });
      salesOrderQueryService.findById.mockResolvedValue({
        ...mockOrder,
        shippingAmount: 15,
        totalAmount: '115.0000',
      } as any);
      salesOrderLifecycleService.assertEditAllowed.mockResolvedValue(undefined);

      await service.update('order-1', { shippingAmount: 15 } as any, 'user-1', 'admin');

      expect(salesOrderItemRepository.find).toHaveBeenCalledWith({
        where: { salesOrderId: 'order-1' },
      });
      expect(salesOrderRepository.update).toHaveBeenCalledWith(
        'order-1',
        expect.objectContaining({
          shippingAmount: 15,
          subtotal: 100,
          totalAmount: '115.0000',
        }),
      );
    });

    it('reconciles payment state when an edit changes the total', async () => {
      const existing = {
        id: 'order-1',
        orderNumber: 'SO-1',
        customerId: 'customer-1',
        status: SalesOrderStatus.DRAFT,
        paidAmount: '400.0000',
        totalAmount: '1000.0000',
        shippingAmount: 0,
      } as any;

      salesOrderRepository.findOne = jest.fn().mockResolvedValue(existing);
      salesOrderItemRepository.find = jest.fn().mockResolvedValue([{ totalAmount: 1100 }] as any);
      salesOrderRepository.update = jest.fn().mockResolvedValue({ affected: 1 });
      salesOrderQueryService.findById.mockResolvedValue({
        ...existing,
        totalAmount: '1100.0000',
        balanceDue: '700.0000',
      } as any);
      salesOrderLifecycleService.assertEditAllowed.mockResolvedValue(undefined);

      await service.update('order-1', { shippingAmount: 0 } as any);

      expect(salesOrderRepository.update).toHaveBeenCalledWith(
        'order-1',
        expect.objectContaining({
          totalAmount: '1100.0000',
        }),
      );
      expect(salesOrderPaymentService.reconcileOrderState).toHaveBeenCalledWith(
        'order-1',
        expect.any(Object),
      );
    });
  });

  describe('update — atomicity', () => {
    it('throws Customer not found for a customer-only edit with an invalid customerId (no items)', async () => {
      salesOrderRepository.findOne = jest.fn().mockResolvedValue({
        id: 'order-1',
        orderNumber: 'SO-1',
        status: 'DRAFT',
        paymentStatus: 'UNPAID',
        paidAmount: '0.0000',
        shippingAmount: 0,
        subtotal: 100,
        totalAmount: '100.0000',
        balanceDue: '100.0000',
        notes: null,
        customerId: 'c1',
      });
      const mgrCustomerRepo = { findOne: jest.fn().mockResolvedValue(null) }; // supplied customer does not exist
      const mgrOrderRepo = {
        findOne: jest.fn().mockResolvedValue({
          id: 'order-1',
          orderNumber: 'SO-1',
          status: 'DRAFT',
          paymentStatus: 'UNPAID',
          paidAmount: '0.0000',
          shippingAmount: 0,
          subtotal: 100,
          totalAmount: '100.0000',
          balanceDue: '100.0000',
          notes: null,
          customerId: 'c1',
        }),
        update: jest.fn(),
      };
      const mgrItemRepo = {
        delete: jest.fn(),
        insert: jest.fn(),
        find: jest.fn(),
      };
      const manager = {
        getRepository: (e: any) => {
          if (e === SalesOrderItem) return mgrItemRepo;
          if (e === Customer) return mgrCustomerRepo;
          return mgrOrderRepo;
        },
      } as unknown as EntityManager;
      dataSource.transaction = jest.fn().mockImplementation(async (cb: any) => cb(manager));

      // No items — only a customer change to a non-existent id.
      await expect(service.update('order-1', { customerId: 'nope' } as any)).rejects.toThrow(
        'Customer not found',
      );
      // The bad customerId must NOT be written.
      expect(mgrOrderRepo.update).not.toHaveBeenCalled();
    });

    it('re-asserts editability against the LOCKED row: rejects an order fulfilled after the pre-check', async () => {
      // Pre-lock read passes the editable check (DRAFT)...
      salesOrderRepository.findOne = jest.fn().mockResolvedValue({
        id: 'order-1',
        orderNumber: 'SO-1',
        status: 'DRAFT',
        paymentStatus: 'UNPAID',
        paidAmount: '0.0000',
        shippingAmount: 0,
        subtotal: 100,
        totalAmount: '100.0000',
        balanceDue: '100.0000',
        notes: null,
        customerId: 'c1',
      });
      // ...but a concurrent fulfill committed first, so the LOCKED row is FULFILLED.
      const mgrOrderRepo = {
        findOne: jest.fn().mockResolvedValue({
          id: 'order-1',
          orderNumber: 'SO-1',
          status: SalesOrderStatus.FULFILLED,
          paymentStatus: 'PAID',
          paidAmount: '100.0000',
          shippingAmount: 0,
          subtotal: 100,
          totalAmount: '100.0000',
          balanceDue: '0.0000',
          notes: null,
          customerId: 'c1',
        }),
        update: jest.fn(),
      };
      const mgrItemRepo = {
        delete: jest.fn(),
        insert: jest.fn(),
        find: jest.fn(),
      };
      const manager = {
        getRepository: (e: any) => (e === SalesOrderItem ? mgrItemRepo : mgrOrderRepo),
      } as unknown as EntityManager;
      dataSource.transaction = jest.fn().mockImplementation(async (cb: any) => cb(manager));

      await expect(
        service.update('order-1', {
          items: [{ productId: 'p1', quantity: 1 }],
        } as any),
      ).rejects.toThrow(/Cannot edit sales order in FULFILLED status/);
      // Nothing was mutated and reconcile never ran.
      expect(mgrItemRepo.delete).not.toHaveBeenCalled();
      expect(mgrOrderRepo.update).not.toHaveBeenCalled();
      expect(reconcileSpy).not.toHaveBeenCalled();
    });

    it('re-prices existing items at the new customer prices on a customer-only edit', async () => {
      // Customer changes (c1 -> cust-NEW) with NO items in the DTO; existing line must be re-priced.
      salesOrderRepository.findOne = jest.fn().mockResolvedValue({
        id: 'order-1',
        orderNumber: 'SO-1',
        status: 'DRAFT',
        paymentStatus: 'UNPAID',
        paidAmount: '0.0000',
        shippingAmount: 0,
        subtotal: 100,
        totalAmount: '100.0000',
        balanceDue: '100.0000',
        notes: null,
        customerId: 'c1',
      });
      const mgrCustomerRepo = {
        findOne: jest.fn().mockResolvedValue({ id: 'cust-NEW', priceListId: 'PL-NEW' }),
      };
      const mgrProductRepo = {
        find: jest.fn().mockResolvedValue([{ id: 'p1', baseCost: 1 }]),
      };
      const mgrPriceListItemRepo = {
        find: jest.fn().mockResolvedValue([
          { id: 'pli-new', productId: 'p1', priceListId: 'PL-NEW', price: 70,
            isActive: true, priceList: { isDefault: false, isActive: true, priority: 1 } },
        ]),
      };
      const mgrOrderRepo = {
        findOne: jest.fn().mockResolvedValue({
          id: 'order-1',
          orderNumber: 'SO-1',
          status: 'DRAFT',
          paymentStatus: 'UNPAID',
          paidAmount: '0.0000',
          shippingAmount: 0,
          subtotal: 100,
          totalAmount: '100.0000',
          balanceDue: '100.0000',
          notes: null,
          customerId: 'c1',
        }),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      // Existing line on the order (qty 2) — re-priced from the new customer's price list (70 each).
      const mgrItemRepo = {
        delete: jest.fn().mockResolvedValue(undefined),
        insert: jest.fn().mockResolvedValue(undefined),
        find: jest.fn().mockResolvedValue([
          {
            productId: 'p1',
            quantity: 2,
            discountType: DiscountType.PERCENTAGE,
            discountPercent: 0,
            discountAmount: 0,
            notes: null,
          },
        ]),
      };
      const manager = {
        getRepository: (e: any) => {
          if (e === SalesOrderItem) return mgrItemRepo;
          if (e === Customer) return mgrCustomerRepo;
          if (e === Product) return mgrProductRepo;
          if (e === PriceListItem) return mgrPriceListItemRepo;
          return mgrOrderRepo;
        },
      } as unknown as EntityManager;
      dataSource.transaction = jest.fn().mockImplementation(async (cb: any) => cb(manager));
      reconcileSpy.mockResolvedValue({
        id: 'order-1',
        orderNumber: 'SO-1',
        status: 'DRAFT',
        paymentStatus: 'UNPAID',
        paidAmount: '0.0000',
        shippingAmount: 0,
        subtotal: 140,
        totalAmount: '140.0000',
        balanceDue: '140.0000',
        notes: null,
        customerId: 'cust-NEW',
      });

      await service.update('order-1', { customerId: 'cust-NEW' } as any);

      // Existing items were re-priced (70 * 2 = 140) and the total recomputed + reconciled.
      expect(mgrItemRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ unitPrice: 70, totalAmount: 140 }),
      );
      expect(mgrOrderRepo.update).toHaveBeenCalledWith(
        'order-1',
        expect.objectContaining({
          customerId: 'cust-NEW',
          subtotal: 140,
          totalAmount: '140.0000',
        }),
      );
      expect(reconcileSpy).toHaveBeenCalledWith('order-1', manager);
    });

    it('reuses the validated supplied customer for pricing (single customer lookup) when items exist', async () => {
      salesOrderRepository.findOne = jest.fn().mockResolvedValue({
        id: 'order-1',
        orderNumber: 'SO-1',
        status: 'DRAFT',
        paymentStatus: 'UNPAID',
        paidAmount: '0.0000',
        shippingAmount: 0,
        subtotal: 0,
        totalAmount: '0.0000',
        balanceDue: '0.0000',
        notes: null,
        customerId: 'old',
      });
      const mgrCustomerRepo = {
        findOne: jest.fn().mockResolvedValue({ id: 'cust-DTO', priceListId: 'PL-DTO' }),
      };
      const mgrProductRepo = {
        find: jest.fn().mockResolvedValue([{ id: 'p1', baseCost: 1 }]),
      };
      const mgrPriceListItemRepo = {
        find: jest.fn().mockResolvedValue([
          { id: 'pli-dto', productId: 'p1', priceListId: 'PL-DTO', price: 55,
            isActive: true, priceList: { isDefault: false, isActive: true, priority: 1 } },
        ]),
      };
      const reconciledOrder = {
        id: 'order-1',
        orderNumber: 'SO-1',
        status: 'DRAFT',
        paymentStatus: 'UNPAID',
        paidAmount: '0.0000',
        shippingAmount: 0,
        subtotal: 55,
        totalAmount: '55.0000',
        balanceDue: '55.0000',
        notes: null,
        customerId: 'cust-DTO',
      };
      const mgrOrderRepo = {
        findOne: jest.fn().mockResolvedValue({
          id: 'order-1',
          orderNumber: 'SO-1',
          status: 'DRAFT',
          paymentStatus: 'UNPAID',
          paidAmount: '0.0000',
          shippingAmount: 0,
          subtotal: 0,
          totalAmount: '0.0000',
          balanceDue: '0.0000',
          notes: null,
          customerId: 'cust-DTO',
        }),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      const mgrItemRepo = {
        delete: jest.fn().mockResolvedValue(undefined),
        insert: jest.fn().mockResolvedValue(undefined),
        find: jest.fn().mockResolvedValue([]),
      };
      const manager = {
        getRepository: (e: any) => {
          if (e === SalesOrderItem) return mgrItemRepo;
          if (e === Customer) return mgrCustomerRepo;
          if (e === Product) return mgrProductRepo;
          if (e === PriceListItem) return mgrPriceListItemRepo;
          return mgrOrderRepo;
        },
      } as unknown as EntityManager;
      dataSource.transaction = jest.fn().mockImplementation(async (cb: any) => cb(manager));
      reconcileSpy.mockResolvedValue(reconciledOrder);

      await service.update('order-1', {
        customerId: 'cust-DTO',
        items: [{ productId: 'p1', quantity: 1 }],
      } as any);

      // Customer resolved exactly once, then reused for pricing (not looked up again).
      expect(mgrCustomerRepo.findOne).toHaveBeenCalledTimes(1);
      expect(mgrItemRepo.insert).toHaveBeenCalledWith(expect.objectContaining({ unitPrice: 55 }));
    });

    it('prices a DTO-supplied customer through the manager repos (under the lock)', async () => {
      salesOrderRepository.findOne = jest.fn().mockResolvedValue({
        id: 'order-1',
        orderNumber: 'SO-1',
        status: 'DRAFT',
        paymentStatus: 'UNPAID',
        paidAmount: '0.0000',
        shippingAmount: 0,
        subtotal: 0,
        totalAmount: '0.0000',
        balanceDue: '0.0000',
        notes: null,
        customerId: 'old',
      });
      const mgrCustomerRepo = {
        findOne: jest.fn().mockResolvedValue({ id: 'cust-DTO', priceListId: 'PL-DTO' }),
      };
      const mgrProductRepo = {
        find: jest.fn().mockResolvedValue([{ id: 'p1', baseCost: 1 }]),
      };
      const mgrPriceListItemRepo = {
        find: jest.fn().mockResolvedValue([
          { id: 'pli-dto', productId: 'p1', priceListId: 'PL-DTO', price: 55,
            isActive: true, priceList: { isDefault: false, isActive: true, priority: 1 } },
        ]),
      };
      const reconciledOrder = {
        id: 'order-1',
        orderNumber: 'SO-1',
        status: 'DRAFT',
        paymentStatus: 'UNPAID',
        paidAmount: '0.0000',
        shippingAmount: 0,
        subtotal: 55,
        totalAmount: '55.0000',
        balanceDue: '55.0000',
        notes: null,
        customerId: 'cust-DTO',
      };
      const mgrOrderRepo = {
        findOne: jest.fn().mockResolvedValue({
          id: 'order-1',
          orderNumber: 'SO-1',
          status: 'DRAFT',
          paymentStatus: 'UNPAID',
          paidAmount: '0.0000',
          shippingAmount: 0,
          subtotal: 0,
          totalAmount: '0.0000',
          balanceDue: '0.0000',
          notes: null,
          customerId: 'cust-DTO',
        }),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      const mgrItemRepo = {
        delete: jest.fn().mockResolvedValue(undefined),
        insert: jest.fn().mockResolvedValue(undefined),
        find: jest.fn().mockResolvedValue([]),
      };
      const manager = {
        getRepository: (e: any) => {
          if (e === SalesOrderItem) return mgrItemRepo;
          if (e === Customer) return mgrCustomerRepo;
          if (e === Product) return mgrProductRepo;
          if (e === PriceListItem) return mgrPriceListItemRepo;
          return mgrOrderRepo;
        },
      } as unknown as EntityManager;
      dataSource.transaction = jest.fn().mockImplementation(async (cb: any) => cb(manager));
      reconcileSpy.mockResolvedValue(reconciledOrder);

      await service.update('order-1', {
        customerId: 'cust-DTO',
        items: [{ productId: 'p1', quantity: 1 }],
      } as any);

      // Supplied-customer pricing went through the MANAGER repos, not the root repos.
      expect(mgrCustomerRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'cust-DTO' } }),
      );
      expect(mgrProductRepo.find).toHaveBeenCalled();
      expect(mgrPriceListItemRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
          relations: { priceList: true },
        }),
      );
      expect(customerRepository.findOne).not.toHaveBeenCalled();
      expect(productRepository.findOne).not.toHaveBeenCalled();
      expect(priceListItemRepository.findOne).not.toHaveBeenCalled();
      expect(mgrItemRepo.insert).toHaveBeenCalledWith(expect.objectContaining({ unitPrice: 55 }));
    });

    it('audit records a notes change with distinct before/after notes', async () => {
      const lockedBefore = {
        id: 'order-1',
        orderNumber: 'SO-1',
        status: 'DRAFT',
        paymentStatus: 'UNPAID',
        paidAmount: '0.0000',
        shippingAmount: 0,
        subtotal: 100,
        totalAmount: '100.0000',
        balanceDue: '100.0000',
        notes: 'old note',
        customerId: 'c1',
      };
      const reconciledAfter = { ...lockedBefore, notes: 'new note' };
      salesOrderRepository.findOne = jest.fn().mockResolvedValue(lockedBefore);
      const mgrOrderRepo = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(lockedBefore)
          .mockResolvedValueOnce(reconciledAfter),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      const mgrItemRepo = {
        delete: jest.fn(),
        insert: jest.fn(),
        find: jest.fn().mockResolvedValue([]),
      };
      const manager = {
        getRepository: (e: any) => (e === SalesOrderItem ? mgrItemRepo : mgrOrderRepo),
      } as unknown as EntityManager;
      dataSource.transaction = jest.fn().mockImplementation(async (cb: any) => cb(manager));

      await service.update('order-1', { notes: 'new note' } as any);

      const payload = (auditLogService.log as jest.Mock).mock.calls.at(-1)[3];
      expect(payload.oldValues.notes).toBe('old note');
      expect(payload.newValues.notes).toBe('new note');
      // Audit "after" was read via the manager (inside the tx), not the root repo post-commit.
      expect(mgrOrderRepo.findOne).toHaveBeenCalledTimes(2);
    });

    it('prices fallback-customer items from the LOCKED order customer, not the pre-lock read', async () => {
      // Pre-lock read returns the STALE customer; the locked read returns the FRESH one.
      salesOrderRepository.findOne = jest.fn().mockResolvedValue({
        id: 'order-1',
        orderNumber: 'SO-1',
        status: 'DRAFT',
        paymentStatus: 'UNPAID',
        paidAmount: '0.0000',
        shippingAmount: 0,
        customerId: 'cust-STALE',
      });
      const mgrOrderRepo = {
        findOne: jest.fn().mockResolvedValue({
          id: 'order-1',
          orderNumber: 'SO-1',
          status: 'DRAFT',
          paymentStatus: 'UNPAID',
          paidAmount: '0.0000',
          shippingAmount: 0,
          customerId: 'cust-FRESH',
        }),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      const mgrItemRepo = {
        delete: jest.fn().mockResolvedValue(undefined),
        insert: jest.fn().mockResolvedValue(undefined),
        find: jest.fn().mockResolvedValue([]),
      };
      const mgrCustomerRepo = {
        findOne: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve({
            id: where.id,
            priceListId: where.id === 'cust-FRESH' ? 'PL-FRESH' : 'PL-STALE',
          }),
        ),
      };
      const mgrProductRepo = {
        find: jest.fn().mockResolvedValue([{ id: 'p1', baseCost: 1 }]),
      };
      const mgrPriceListItemRepo = {
        find: jest.fn().mockResolvedValue([
          { id: 'fresh', productId: 'p1', priceListId: 'PL-FRESH', price: 70,
            isActive: true, priceList: { isDefault: false, isActive: true, priority: 9 } },
          { id: 'stale', productId: 'p1', priceListId: 'PL-STALE', price: 999,
            isActive: true, priceList: { isDefault: false, isActive: true, priority: 1 } },
        ]),
      };
      const manager = {
        getRepository: (e: any) => {
          if (e === SalesOrderItem) return mgrItemRepo;
          if (e === Customer) return mgrCustomerRepo;
          if (e === Product) return mgrProductRepo;
          if (e === PriceListItem) return mgrPriceListItemRepo;
          return mgrOrderRepo;
        },
      } as unknown as EntityManager;
      dataSource.transaction = jest.fn().mockImplementation(async (cb: any) => cb(manager));
      reconcileSpy.mockResolvedValue({
        id: 'order-1',
        orderNumber: 'SO-1',
        status: 'DRAFT',
        paymentStatus: 'UNPAID',
        paidAmount: '0.0000',
        shippingAmount: 0,
        subtotal: 70,
        totalAmount: '70.0000',
        balanceDue: '70.0000',
        notes: null,
        customerId: 'cust-FRESH',
      });

      customerRepository.findOne = jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve({
          id: where.id,
          priceListId: where.id === 'cust-FRESH' ? 'PL-FRESH' : 'PL-STALE',
        }),
      );
      productRepository.find = jest.fn().mockResolvedValue([{ id: 'p1', baseCost: 1 }]);
      priceListItemRepository.find = jest
        .fn()
        .mockImplementation(({ where }: any) =>
          Promise.resolve(
            where.priceListId === 'PL-FRESH'
              ? [{ productId: 'p1', price: 70 }]
              : [{ productId: 'p1', price: 999 }],
          ),
        );

      await service.update('order-1', {
        items: [{ productId: 'p1', quantity: 1 }],
      } as any);

      expect(priceListItemRepository.find).not.toHaveBeenCalled();
      expect(mgrItemRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ unitPrice: 70, totalAmount: 70 }),
      );
      expect(mgrOrderRepo.update).toHaveBeenCalledWith(
        'order-1',
        expect.objectContaining({ subtotal: 70, totalAmount: '70.0000' }),
      );
    });

    it('fallback pricing reads product + price-list through the manager (under the lock)', async () => {
      salesOrderRepository.findOne = jest.fn().mockResolvedValue({
        id: 'order-1',
        orderNumber: 'SO-1',
        status: 'DRAFT',
        paymentStatus: 'UNPAID',
        paidAmount: '0.0000',
        shippingAmount: 0,
        customerId: 'cust-FRESH',
      });
      const mgrCustomerRepo = {
        findOne: jest.fn().mockResolvedValue({ id: 'cust-FRESH', priceListId: 'PL-FRESH' }),
      };
      const mgrProductRepo = {
        find: jest.fn().mockResolvedValue([{ id: 'p1', baseCost: 1 }]),
      };
      const mgrPriceListItemRepo = {
        find: jest.fn().mockResolvedValue([
          { id: 'pli-fresh', productId: 'p1', priceListId: 'PL-FRESH', price: 70,
            isActive: true, priceList: { isDefault: false, isActive: true, priority: 1 } },
        ]),
      };
      const mgrOrderRepo = {
        findOne: jest.fn().mockResolvedValue({
          id: 'order-1',
          orderNumber: 'SO-1',
          status: 'DRAFT',
          paymentStatus: 'UNPAID',
          paidAmount: '0.0000',
          shippingAmount: 0,
          customerId: 'cust-FRESH',
        }),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      const mgrItemRepo = {
        delete: jest.fn().mockResolvedValue(undefined),
        insert: jest.fn().mockResolvedValue(undefined),
        find: jest.fn().mockResolvedValue([]),
      };
      const manager = {
        getRepository: (e: any) => {
          if (e === SalesOrderItem) return mgrItemRepo;
          if (e === Customer) return mgrCustomerRepo;
          if (e === Product) return mgrProductRepo;
          if (e === PriceListItem) return mgrPriceListItemRepo;
          return mgrOrderRepo;
        },
      } as unknown as EntityManager;
      dataSource.transaction = jest.fn().mockImplementation(async (cb: any) => cb(manager));
      reconcileSpy.mockResolvedValue({
        id: 'order-1',
        orderNumber: 'SO-1',
        status: 'DRAFT',
        paymentStatus: 'UNPAID',
        paidAmount: '0.0000',
        shippingAmount: 0,
        subtotal: 70,
        totalAmount: '70.0000',
        balanceDue: '70.0000',
        notes: null,
        customerId: 'cust-FRESH',
      });

      await service.update('order-1', {
        items: [{ productId: 'p1', quantity: 1 }],
      } as any);

      expect(mgrProductRepo.find).toHaveBeenCalled();
      expect(mgrPriceListItemRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
          relations: { priceList: true },
        }),
      );
      expect(productRepository.find).not.toHaveBeenCalled();
      expect(priceListItemRepository.find).not.toHaveBeenCalled();
      expect(mgrItemRepo.insert).toHaveBeenCalledWith(expect.objectContaining({ unitPrice: 70 }));
    });

    it('throws Customer not found when the locked fallback customer is missing', async () => {
      salesOrderRepository.findOne = jest.fn().mockResolvedValue({
        id: 'order-1',
        orderNumber: 'SO-1',
        status: 'DRAFT',
        paymentStatus: 'UNPAID',
        paidAmount: '0.0000',
        shippingAmount: 0,
        customerId: 'gone',
      });
      const mgrCustomerRepo = { findOne: jest.fn().mockResolvedValue(null) };
      const mgrOrderRepo = {
        findOne: jest.fn().mockResolvedValue({
          id: 'order-1',
          orderNumber: 'SO-1',
          status: 'DRAFT',
          paymentStatus: 'UNPAID',
          paidAmount: '0.0000',
          shippingAmount: 0,
          customerId: 'gone',
        }),
        update: jest.fn(),
      };
      const mgrItemRepo = {
        delete: jest.fn(),
        insert: jest.fn(),
        find: jest.fn(),
      };
      const manager = {
        getRepository: (e: any) => {
          if (e === SalesOrderItem) return mgrItemRepo;
          if (e === Customer) return mgrCustomerRepo;
          return mgrOrderRepo;
        },
      } as unknown as EntityManager;
      dataSource.transaction = jest.fn().mockImplementation(async (cb: any) => cb(manager));

      await expect(
        service.update('order-1', {
          items: [{ productId: 'p1', quantity: 1 }],
        } as any),
      ).rejects.toThrow('Customer not found');
      expect(mgrItemRepo.insert).not.toHaveBeenCalled();
    });

    it('records distinct before/after audit values including reconciled fields', async () => {
      const lockedBefore = {
        id: 'order-1',
        orderNumber: 'SO-1',
        status: 'DRAFT',
        paymentStatus: 'UNPAID',
        paidAmount: '0.0000',
        shippingAmount: 20,
        subtotal: 80,
        totalAmount: '100.0000',
        balanceDue: '100.0000',
        customerId: 'c1',
      };
      const reconciledAfter = {
        id: 'order-1',
        orderNumber: 'SO-1',
        status: 'READY',
        paymentStatus: 'PAID',
        paidAmount: '120.0000',
        shippingAmount: 20,
        subtotal: 100,
        totalAmount: '120.0000',
        balanceDue: '0.0000',
        customerId: 'c1',
      };
      salesOrderRepository.findOne = jest.fn().mockResolvedValue(lockedBefore);
      const mgrOrderRepo = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(lockedBefore)
          .mockResolvedValueOnce(reconciledAfter),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      const mgrItemRepo = {
        delete: jest.fn().mockResolvedValue(undefined),
        insert: jest.fn().mockResolvedValue(undefined),
        find: jest.fn(),
      };
      const mgrCustomerRepo = {
        findOne: jest.fn().mockResolvedValue({ id: 'c1' }),
      };
      const mgrProductRepo = {
        find: jest.fn().mockResolvedValue([{ id: 'p1', baseCost: 1 }]),
      };
      const mgrPriceListItemRepo = { find: jest.fn().mockResolvedValue([]) };
      const manager = {
        getRepository: (e: any) => {
          if (e === SalesOrderItem) return mgrItemRepo;
          if (e === Customer) return mgrCustomerRepo;
          if (e === Product) return mgrProductRepo;
          if (e === PriceListItem) return mgrPriceListItemRepo;
          return mgrOrderRepo;
        },
      } as unknown as EntityManager;
      dataSource.transaction = jest.fn().mockImplementation(async (cb: any) => cb(manager));
      // Reconcile returns the reconciled order; update() snapshots it for the audit "after".
      reconcileSpy.mockResolvedValue(reconciledAfter);

      await service.update('order-1', {
        customerId: 'c1',
        items: [{ productId: 'p1', quantity: 1, unitPrice: 100 }],
      } as any);

      const auditCall = (auditLogService.log as jest.Mock).mock.calls.at(-1);
      const payload = auditCall[3];
      expect(payload.oldValues.totalAmount).not.toBe(payload.newValues.totalAmount);
      expect(payload.newValues.paymentStatus).toBe('PAID');
      expect(payload.newValues.status).toBe('READY');
    });

    it('derives shipping fallback from the LOCKED order and writes via the manager', async () => {
      // Root repos return a STALE order (old shipping=5); the locked read returns fresh shipping=20.
      salesOrderRepository.findOne = jest.fn().mockResolvedValue({
        id: 'order-1',
        orderNumber: 'SO-1',
        status: 'DRAFT',
        paymentStatus: 'UNPAID',
        paidAmount: '0.0000',
        shippingAmount: 5,
        customerId: 'c1',
      });
      // Distinct manager-scoped repos so we can prove writes use them, not the root repos.
      const mgrOrderRepo = {
        findOne: jest.fn().mockResolvedValue({
          id: 'order-1',
          orderNumber: 'SO-1',
          status: 'DRAFT',
          paymentStatus: 'UNPAID',
          paidAmount: '0.0000',
          shippingAmount: 20,
          customerId: 'c1',
        }),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      const mgrItemRepo = {
        delete: jest.fn().mockResolvedValue(undefined),
        insert: jest.fn().mockResolvedValue(undefined),
        find: jest.fn().mockResolvedValue([]),
      };
      const mgrCustomerRepo = {
        findOne: jest.fn().mockResolvedValue({ id: 'c1' }),
      };
      const mgrProductRepo = {
        find: jest.fn().mockResolvedValue([{ id: 'p1', sellingPrice: 100 }]),
      };
      const mgrPriceListItemRepo = { find: jest.fn().mockResolvedValue([]) };
      const manager = {
        getRepository: (e: any) => {
          if (e === SalesOrderItem) return mgrItemRepo;
          if (e === Customer) return mgrCustomerRepo;
          if (e === Product) return mgrProductRepo;
          if (e === PriceListItem) return mgrPriceListItemRepo;
          return mgrOrderRepo;
        },
      } as unknown as EntityManager;
      dataSource.transaction = jest.fn().mockImplementation(async (cb: any) => cb(manager));
      reconcileSpy.mockResolvedValue({
        id: 'order-1',
        orderNumber: 'SO-1',
        status: 'DRAFT',
        paymentStatus: 'UNPAID',
        paidAmount: '0.0000',
        shippingAmount: 20,
        subtotal: 100,
        totalAmount: '120.0000',
        balanceDue: '120.0000',
        notes: null,
        customerId: 'c1',
      });
      // One product priced at 100, no shippingAmount in the DTO -> fallback must use shipping=20.

      await service.update('order-1', {
        items: [{ productId: 'p1', quantity: 1, unitPrice: 100 }],
      } as any);

      // Writes go through the MANAGER repos, never the root repos.
      expect(mgrItemRepo.insert).toHaveBeenCalled();
      expect(salesOrderItemRepository.insert).not.toHaveBeenCalled();
      // The order read used a write lock.
      expect(mgrOrderRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'order-1' },
          lock: { mode: 'pessimistic_write' },
        }),
      );
      // Total used the LOCKED shipping (20), not the stale root value (5): 100 + 20 = 120.
      expect(mgrOrderRepo.update).toHaveBeenCalledWith(
        'order-1',
        expect.objectContaining({ shippingAmount: 20, totalAmount: '120.0000' }),
      );
      // Reconcile joined the same transaction.
      expect(reconcileSpy).toHaveBeenCalledWith('order-1', manager);
    });

    it('shipping-only edit reads existing items via the manager (locked), not the root repo', async () => {
      salesOrderRepository.findOne = jest.fn().mockResolvedValue({
        id: 'order-1',
        orderNumber: 'SO-1',
        status: 'DRAFT',
        paymentStatus: 'UNPAID',
        paidAmount: '0.0000',
        customerId: 'c1',
      });
      const mgrOrderRepo = {
        findOne: jest.fn().mockResolvedValue({
          id: 'order-1',
          orderNumber: 'SO-1',
          status: 'DRAFT',
          paymentStatus: 'UNPAID',
          paidAmount: '0.0000',
          customerId: 'c1',
        }),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      const mgrItemRepo = {
        delete: jest.fn(),
        insert: jest.fn(),
        find: jest.fn().mockResolvedValue([{ totalAmount: 300 }]),
      };
      const manager = {
        getRepository: (e: any) => (e === SalesOrderItem ? mgrItemRepo : mgrOrderRepo),
      } as unknown as EntityManager;
      dataSource.transaction = jest.fn().mockImplementation(async (cb: any) => cb(manager));
      reconcileSpy.mockResolvedValue({
        id: 'order-1',
        orderNumber: 'SO-1',
        status: 'DRAFT',
        paymentStatus: 'UNPAID',
        paidAmount: '0.0000',
        shippingAmount: 50,
        subtotal: 300,
        totalAmount: '350.0000',
        balanceDue: '350.0000',
        notes: null,
        customerId: 'c1',
      });

      await service.update('order-1', { shippingAmount: 50 } as any);

      expect(mgrItemRepo.find).toHaveBeenCalledWith({
        where: { salesOrderId: 'order-1' },
      });
      expect(salesOrderItemRepository.find).not.toHaveBeenCalled();
      expect(mgrOrderRepo.update).toHaveBeenCalledWith(
        'order-1',
        expect.objectContaining({ subtotal: 300, totalAmount: '350.0000' }),
      );
    });

    it('rolls back: when an item insert fails the transaction rejects and reconcile is not called', async () => {
      salesOrderRepository.findOne = jest.fn().mockResolvedValue({
        id: 'order-1',
        orderNumber: 'SO-1',
        status: 'DRAFT',
        paymentStatus: 'UNPAID',
        paidAmount: '0.0000',
        shippingAmount: 0,
        customerId: 'c1',
      });
      const mgrOrderRepo = {
        findOne: jest.fn().mockResolvedValue({
          id: 'order-1',
          orderNumber: 'SO-1',
          status: 'DRAFT',
          paymentStatus: 'UNPAID',
          paidAmount: '0.0000',
          shippingAmount: 0,
          customerId: 'c1',
        }),
        update: jest.fn(),
      };
      const mgrItemRepo = {
        delete: jest.fn().mockResolvedValue(undefined),
        insert: jest.fn().mockRejectedValue(new Error('insert failed')),
        find: jest.fn(),
      };
      const mgrCustomerRepo = {
        findOne: jest.fn().mockResolvedValue({ id: 'c1' }),
      };
      const mgrProductRepo = {
        find: jest.fn().mockResolvedValue([{ id: 'p1', sellingPrice: 10 }]),
      };
      const mgrPriceListItemRepo = { find: jest.fn().mockResolvedValue([]) };
      const manager = {
        getRepository: (e: any) => {
          if (e === SalesOrderItem) return mgrItemRepo;
          if (e === Customer) return mgrCustomerRepo;
          if (e === Product) return mgrProductRepo;
          if (e === PriceListItem) return mgrPriceListItemRepo;
          return mgrOrderRepo;
        },
      } as unknown as EntityManager;
      dataSource.transaction = jest.fn().mockImplementation(async (cb: any) => cb(manager));

      await expect(
        service.update('order-1', {
          items: [{ productId: 'p1', quantity: 1, unitPrice: 10 }],
        } as any),
      ).rejects.toThrow('insert failed');
      expect(reconcileSpy).not.toHaveBeenCalled();
    });
  });

  describe('validateAndProcessItems price resolution (via update re-pricing)', () => {
    const buildManager = (opts: {
      customerPriceListId?: string;
      product?: any;
      priceListItems: any[];
      existingItem: any;
    }) => {
      const mgrCustomerRepo = {
        findOne: jest.fn().mockResolvedValue({ id: 'cust-X', priceListId: opts.customerPriceListId }),
      };
      const mgrProductRepo = {
        find: jest.fn().mockResolvedValue([opts.product ?? { id: 'p1', baseCost: 7 }]),
      };
      const mgrPriceListItemRepo = { find: jest.fn().mockResolvedValue(opts.priceListItems) };
      const mgrOrderRepo = {
        findOne: jest.fn().mockResolvedValue({
          id: 'order-1', orderNumber: 'SO-1', status: 'DRAFT', paymentStatus: 'UNPAID',
          paidAmount: '0.0000', shippingAmount: 0, subtotal: 0, totalAmount: '0.0000', balanceDue: '0.0000',
          notes: null, customerId: 'old',
        }),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      const mgrItemRepo = {
        delete: jest.fn().mockResolvedValue(undefined),
        insert: jest.fn().mockResolvedValue(undefined),
        find: jest.fn().mockResolvedValue([opts.existingItem]),
      };
      const manager = {
        getRepository: (e: any) => {
          if (e === SalesOrderItem) return mgrItemRepo;
          if (e === Customer) return mgrCustomerRepo;
          if (e === Product) return mgrProductRepo;
          if (e === PriceListItem) return mgrPriceListItemRepo;
          return mgrOrderRepo;
        },
      } as unknown as EntityManager;
      return { manager, mgrItemRepo };
    };

    const activeDefaultItem = (price: number) => ({
      id: 'pli-1', productId: 'p1', priceListId: 'PL-DEF', price,
      isActive: true, priceList: { isDefault: true, isActive: true, priority: 1 },
    });

    const runReprice = async (manager: EntityManager) => {
      salesOrderRepository.findOne = jest.fn().mockResolvedValue({
        id: 'order-1', status: 'DRAFT', customerId: 'old',
      });
      salesOrderLifecycleService.assertEditAllowed.mockResolvedValue(undefined);
      dataSource.transaction = jest.fn().mockImplementation(async (cb: any) => cb(manager));
      reconcileSpy.mockResolvedValue({ id: 'order-1' } as any);
      await service.update('order-1', { customerId: 'cust-X' } as any);
    };

    const runWithItems = async (manager: EntityManager, items: any[]) => {
      salesOrderRepository.findOne = jest.fn().mockResolvedValue({
        id: 'order-1', status: 'DRAFT', customerId: 'old',
      });
      salesOrderLifecycleService.assertEditAllowed.mockResolvedValue(undefined);
      dataSource.transaction = jest.fn().mockImplementation(async (cb: any) => cb(manager));
      reconcileSpy.mockResolvedValue({ id: 'order-1' } as any);
      await service.update('order-1', { customerId: 'cust-X', items } as any);
    };

    const existingLine = {
      productId: 'p1', quantity: 1, discountType: DiscountType.PERCENTAGE,
      discountPercent: 0, discountAmount: 0, notes: null,
    };

    it('resolves the active default-list price when the line has no override', async () => {
      const { manager, mgrItemRepo } = buildManager({
        priceListItems: [activeDefaultItem(30)], existingItem: existingLine,
      });
      await runReprice(manager);
      expect(mgrItemRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ unitPrice: 30, unitCost: 7 }),
      );
    });

    it('prefers the customer price-list match over the default', async () => {
      const { manager, mgrItemRepo } = buildManager({
        customerPriceListId: 'PL-VIP',
        priceListItems: [
          activeDefaultItem(30),
          { id: 'vip', productId: 'p1', priceListId: 'PL-VIP', price: 22,
            isActive: true, priceList: { isDefault: false, isActive: true, priority: 9 } },
        ],
        existingItem: existingLine,
      });
      await runReprice(manager);
      expect(mgrItemRepo.insert).toHaveBeenCalledWith(expect.objectContaining({ unitPrice: 22 }));
    });

    it('selects the lowest-priority item when there is no customer or default match', async () => {
      const { manager, mgrItemRepo } = buildManager({
        priceListItems: [
          { id: 'hi', productId: 'p1', priceListId: 'PL-HI', price: 40,
            isActive: true, priceList: { isDefault: false, isActive: true, priority: 8 } },
          { id: 'lo', productId: 'p1', priceListId: 'PL-LO', price: 15,
            isActive: true, priceList: { isDefault: false, isActive: true, priority: 3 } },
        ],
        existingItem: existingLine,
      });
      await runReprice(manager);
      expect(mgrItemRepo.insert).toHaveBeenCalledWith(expect.objectContaining({ unitPrice: 15 }));
    });

    it('breaks equal-priority ties by ascending item id', async () => {
      const { manager, mgrItemRepo } = buildManager({
        priceListItems: [
          { id: 'b', productId: 'p1', priceListId: 'PL-B', price: 40,
            isActive: true, priceList: { isDefault: false, isActive: true, priority: 5 } },
          { id: 'a', productId: 'p1', priceListId: 'PL-A', price: 15,
            isActive: true, priceList: { isDefault: false, isActive: true, priority: 5 } },
        ],
        existingItem: existingLine,
      });
      await runReprice(manager);
      expect(mgrItemRepo.insert).toHaveBeenCalledWith(expect.objectContaining({ unitPrice: 15 }));
    });

    it('excludes an item whose own isActive flag is false → 0', async () => {
      const { manager, mgrItemRepo } = buildManager({
        priceListItems: [{ ...activeDefaultItem(99), isActive: false }],
        existingItem: existingLine,
      });
      await runReprice(manager);
      expect(mgrItemRepo.insert).toHaveBeenCalledWith(expect.objectContaining({ unitPrice: 0 }));
    });

    it('ignores items whose price list is inactive → 0', async () => {
      const { manager, mgrItemRepo } = buildManager({
        priceListItems: [{ ...activeDefaultItem(99), priceList: { isDefault: true, isActive: false, priority: 1 } }],
        existingItem: existingLine,
      });
      await runReprice(manager);
      expect(mgrItemRepo.insert).toHaveBeenCalledWith(expect.objectContaining({ unitPrice: 0 }));
    });

    it('with no eligible price-list items, unitPrice is 0 and unitCost is baseCost', async () => {
      const { manager, mgrItemRepo } = buildManager({
        priceListItems: [], existingItem: existingLine,
      });
      await runReprice(manager);
      expect(mgrItemRepo.insert).toHaveBeenCalledWith(
        expect.objectContaining({ unitPrice: 0, unitCost: 7 }),
      );
    });

    it('preserves an explicit unitPrice of 0 even when an eligible price exists', async () => {
      const { manager, mgrItemRepo } = buildManager({
        customerPriceListId: 'PL-DEF',
        priceListItems: [activeDefaultItem(30)], existingItem: existingLine,
      });
      await runWithItems(manager, [{ productId: 'p1', quantity: 1, unitPrice: 0 }]);
      expect(mgrItemRepo.insert).toHaveBeenCalledWith(expect.objectContaining({ unitPrice: 0 }));
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
      const createSpy = jest.spyOn(service, 'create').mockResolvedValue({ id: 'order-2' } as any);

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
      const createSpy = jest.spyOn(service, 'create').mockResolvedValue({ id: 'order-2' } as any);

      await service.duplicateOrder('order-1', 'user-1');

      expect(createSpy.mock.calls[0][0].items[0]).toMatchObject({
        discountType: DiscountType.PERCENTAGE,
        discountPercent: 15,
      });
    });
  });
});
