import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { BadRequestException, Logger } from '@nestjs/common';
import { PurchaseOrderService } from './purchase-order.service';
import {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderPaymentStatus,
  PurchaseOrderStatus,
  Supplier,
  Product,
  VendorPayment,
  PaymentMethodEntity,
} from '../../../database/entities';
import { UserRole } from '../../../database/entities/user.entity';
import { SupplierService } from './supplier.service';

import { VendorPaymentService } from './vendor-payment.service';
import { BaseCostCalculatorService } from '../../inventory/services/base-cost-calculator.service';
import { StockMovementService } from '../../inventory/services/stock-movement.service';
import { SettingsService } from '../../settings/settings.service';
import { AuditLogService } from '../../audit-logs/services';
import { PurchaseOrderLifecycleService } from './purchase-order-lifecycle.service';
import { ACCOUNTING_POSTING_PORT } from '../../../common/accounting-posting/accounting-posting.port';
import type { AccountingPostingPort } from '../../../common/accounting-posting/accounting-posting.port';
import { quantizeToCents, formatMoney, toMinorUnits } from '@common/utils/money';

describe('PurchaseOrderService', () => {
  let module: TestingModule;
  let service: PurchaseOrderService;
  let purchaseOrderRepository: any;
  let purchaseOrderItemRepository: any;
  let productRepository: any;
  let vendorPaymentRepository: any;
  let auditLogService: any;
  let stockMovementService: any;
  let vendorPaymentService: any;
  let paymentMethodRepository: any;
  let dataSource: any
  let appTimezone: string;
  const adminUser = { role: UserRole.ADMIN } as any;

  const mockPurchaseOrder = {
    id: 'po-1',
    orderNumber: 'PO-000001',
    items: [
      {
        id: 'po-item-1',
        productId: 'product-1',
        quantity: 10,
        unitCost: 20,
        receivedQuantity: 0,
      },
    ],
    supplier: {
      id: 'supplier-1',
      slug: 'supplier-a',
      companyName: 'Supplier A',
    },
  } as unknown as PurchaseOrder;

  const mockReturnDto = {
    id: 'po-1',
    orderNumber: 'PO-000001',
  } as any;

  function mockTxManager(opts: { lockedPO?: any; existing?: any[]; conditionalUpdateAffected?: number } = {}) {
    const { lockedPO, existing } = opts
    const saved = []
    const vpRepo = {
      find: (jest.fn as unknown as any)().mockResolvedValue(existing ?? []),
      findOne: (jest.fn as unknown as any)().mockResolvedValue(undefined),
      create: (jest.fn as unknown as any)((row) => row),
      restore: (jest.fn as unknown as any)().mockResolvedValue(undefined),
      update: (jest.fn as unknown as any)().mockResolvedValue({ affected: 1 }),
      save: (jest.fn as unknown as any)(async (row) => {
        const persisted = { id: `refund-${saved.length + 1}`, ...row }
        saved.push(persisted)
        return persisted
      }),
    }
    const poRepo = {
      findOne: (jest.fn as unknown as any)().mockResolvedValue(lockedPO),
      save: (jest.fn as unknown as any)(async (row) => row),
    }
    const manager = {
      getRepository: (jest.fn as unknown as any)((entity) => (entity === PurchaseOrder ? poRepo : vpRepo)),
    }
    return { manager, vpRepo, poRepo, saved }
  }

  function wireTx(opts: { lockedPO: any; existing?: any[] }) {
    const { lockedPO, existing } = opts
    const ctx = mockTxManager({ lockedPO, existing: existing ?? [{ id: 'vp-1', amount: '100.0000', paymentMethodId: 'pm-1', status: 'completed', isActive: true }] })
    ;(dataSource.transaction as any).mockImplementation(async (cb) => cb(ctx.manager))
    return ctx
  }

  beforeEach(async () => {
    appTimezone = 'Asia/Kuala_Lumpur';
    dataSource = { transaction: (jest.fn as unknown as any)() } as any
    module = await Test.createTestingModule({
      providers: [
        PurchaseOrderService,
        {
          provide: getRepositoryToken(PurchaseOrder),
          useValue: {
            findOne: (jest.fn as unknown as any)(),
            update: (jest.fn as unknown as any)(),
            save: (jest.fn as unknown as any)(),
            remove: (jest.fn as unknown as any)(),
            createQueryBuilder: (jest.fn as unknown as any)(),
          },
        },
        {
          provide: getRepositoryToken(PurchaseOrderItem),
          useValue: {
            save: (jest.fn as unknown as any)(),
            delete: (jest.fn as unknown as any)(),
          },
        },
        {
          provide: getRepositoryToken(Supplier),
          useValue: {},
        },
        {
          provide: getRepositoryToken(Product),
          useValue: {
            findOne: (jest.fn as unknown as any)(),
          },
        },
        {
          provide: getRepositoryToken(VendorPayment),
          useValue: {
            find: (jest.fn as unknown as any)(),
            findOne: (jest.fn as unknown as any)(),
            save: (jest.fn as unknown as any)(),
            update: (jest.fn as unknown as any)(),
            restore: (jest.fn as unknown as any)(),
            remove: (jest.fn as unknown as any)(),
          },
        },
        {
          provide: getRepositoryToken(PaymentMethodEntity),
          useValue: {
            findOne: (jest.fn as unknown as any)(),
          },
        },
        {
          provide: SupplierService,
          useValue: {},
        },
        {
          provide: VendorPaymentService,
          useValue: {
            findAllByPurchaseOrder: (jest.fn as unknown as any)(),
            softDeleteForUnpay: (jest.fn as unknown as any)(),
            create: (jest.fn as unknown as any)(),
            findOne: (jest.fn as unknown as any)(),
          },
        },
        {
          provide: BaseCostCalculatorService,
          useValue: {},
        },
        {
          provide: StockMovementService,
          useValue: {
            create: (jest.fn as unknown as any)(),
            deleteByReference: (jest.fn as unknown as any)(),
          },
        },
        {
          provide: SettingsService,
          useValue: {
            getRegionalSettings: (jest.fn as unknown as any)(async () => ({ timezone: appTimezone })),
          },
        },
        {
          provide: AuditLogService,
          useValue: {
            log: (jest.fn as unknown as any)(),
          },
        },
        {
          provide: PurchaseOrderLifecycleService,
          useValue: {
            cancel: (jest.fn as unknown as any)(),
            uncancel: (jest.fn as unknown as any)(),
            receive: (jest.fn as unknown as any)(),
            return: (jest.fn as unknown as any)(),
          },
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: ACCOUNTING_POSTING_PORT,
          useValue: { postPurchasePayment: (jest.fn as unknown as any)(), postPurchaseRefund: (jest.fn as unknown as any)(), reverseEntriesForDocument: (jest.fn as unknown as any)() },
        },
      ],
    }).compile();

    service = module.get<PurchaseOrderService>(PurchaseOrderService);
    purchaseOrderRepository = module.get(getRepositoryToken(PurchaseOrder));
    purchaseOrderItemRepository = module.get(getRepositoryToken(PurchaseOrderItem));
    productRepository = module.get(getRepositoryToken(Product));
    vendorPaymentRepository = module.get(getRepositoryToken(VendorPayment));
    paymentMethodRepository = module.get(getRepositoryToken(PaymentMethodEntity));
    auditLogService = module.get(AuditLogService);
    stockMovementService = module.get(StockMovementService);
    vendorPaymentService = module.get(VendorPaymentService);
    dataSource = module.get(DataSource)
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});

    jest.spyOn(service, 'findOne').mockResolvedValue(mockReturnDto);

    purchaseOrderRepository.findOne.mockResolvedValue(mockPurchaseOrder);
    purchaseOrderRepository.update.mockResolvedValue({} as any);
    purchaseOrderRepository.save.mockResolvedValue(mockPurchaseOrder);
    productRepository.findOne.mockResolvedValue({ id: 'product-1' } as Product);
    stockMovementService.create.mockResolvedValue({} as any);
    stockMovementService.deleteByReference.mockResolvedValue({ deletedCount: 1 } as any);
    purchaseOrderItemRepository.save.mockResolvedValue({} as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('searchGlobal', () => {
    function mockPOQuery(order: {
      id: string;
      orderNumber: string;
      supplier: { companyName: string };
    }) {
      purchaseOrderRepository.createQueryBuilder = (jest.fn as unknown as any)().mockReturnValue({
        leftJoinAndSelect: (jest.fn as unknown as any)().mockReturnThis(),
        where: (jest.fn as unknown as any)().mockReturnThis(),
        andWhere: (jest.fn as unknown as any)().mockReturnThis(),
        take: (jest.fn as unknown as any)().mockReturnThis(),
        getMany: (jest.fn as unknown as any)().mockResolvedValue([order]),
      } as any);
    }

    it('returns matching purchase orders as GlobalSearchResultDto', async () => {
      const order = {
        id: 'po-uuid-1',
        orderNumber: 'PO-000001',
        supplier: { companyName: 'Acme Supplies' },
        deletedAt: null,
      };
      purchaseOrderRepository.createQueryBuilder = (jest.fn as unknown as any)().mockReturnValue({
        leftJoinAndSelect: (jest.fn as unknown as any)().mockReturnThis(),
        where: (jest.fn as unknown as any)().mockReturnThis(),
        andWhere: (jest.fn as unknown as any)().mockReturnThis(),
        take: (jest.fn as unknown as any)().mockReturnThis(),
        getMany: (jest.fn as unknown as any)().mockResolvedValue([order]),
      } as any);

      const results = await service.searchGlobal('PO-000001', {
        role: UserRole.PROCUREMENT_STAFF,
      } as any);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        type: 'transaction',
        id: 'po-uuid-1',
        label: 'PO-000001',
        description: 'Acme Supplies',
        route: '/purchasing/orders/po-uuid-1/edit',
      });
    });

    it('exact orderNumber match scores SCORE_EXACT_CODE + BOOST_TRANSACTION + BOOST_EXACT_MATCH', async () => {
      mockPOQuery({
        id: 'po1',
        orderNumber: 'PO-001',
        supplier: { companyName: 'Vendor' },
      });

      const results = await service.searchGlobal('PO-001', adminUser);

      expect(results[0].score).toBe(150);
    });

    it('orderNumber startsWith scores SCORE_STARTSWITH_CODE + BOOST_TRANSACTION', async () => {
      mockPOQuery({
        id: 'po1',
        orderNumber: 'PO-001',
        supplier: { companyName: 'Vendor' },
      });

      const results = await service.searchGlobal('PO-', adminUser);

      expect(results[0].score).toBe(110);
    });

    it('contains match scores SCORE_CONTAINS + BOOST_TRANSACTION', async () => {
      mockPOQuery({
        id: 'po1',
        orderNumber: 'PO-001',
        supplier: { companyName: 'Global Vendor' },
      });

      const results = await service.searchGlobal('Vendor', adminUser);

      expect(results[0].score).toBe(70);
    });
  });

  describe('update workflow', () => {
    // Wire the transaction so every in-callback getRepository(...) returns a
    // manager-bound mock, and the locked row is a REAL PurchaseOrder instance (so
    // calculateTotals() — a method on the entity — is callable).
    function setupTxMocks(opts: {
      lockedStatus: PurchaseOrderStatus;
      lockedOverrides?: Partial<PurchaseOrder>;
      payments?: { amount: string }[];
    }) {
      const savedOrders: PurchaseOrder[] = [];
      const poManagerRepo = {
        findOne: (jest.fn as unknown as any)(),
        save: (jest.fn as unknown as any)().mockImplementation((o: PurchaseOrder) => {
          savedOrders.push(Object.assign(new PurchaseOrder(), o));
          return Promise.resolve(o);
        }),
      };
      const itemManagerRepo = {
        delete: (jest.fn as unknown as any)().mockResolvedValue(undefined),
        save: (jest.fn as unknown as any)().mockResolvedValue([]),
      };
      const productManagerRepo = {
        findOne: (jest.fn as unknown as any)().mockResolvedValue({ id: 'product-1' }),
      };

      const lockedOrder = Object.assign(new PurchaseOrder(), {
        id: 'po-1',
        orderNumber: 'PO-000001',
        status: opts.lockedStatus,
        subtotal: 100,
        discountPercent: 0,
        discountAmount: 0,
        shippingAmount: 0,
        totalAmount: '100.0000',
        paidAmount: '0.0000',
        paymentStatus: PurchaseOrderPaymentStatus.UNPAID,
        orderDate: new Date('2024-01-01'),
        ...opts.lockedOverrides,
      });
      // lockRowForUpdate -> manager.getRepository(PurchaseOrder).findOne(...)
      poManagerRepo.findOne.mockResolvedValue(lockedOrder);

      const manager = {
        getRepository: (jest.fn as unknown as any)().mockImplementation((entity: any) => {
          if (entity === PurchaseOrder) return poManagerRepo;
          if (entity === PurchaseOrderItem) return itemManagerRepo;
          if (entity === Product) return productManagerRepo;
          return { save: (jest.fn as unknown as any)(), findOne: (jest.fn as unknown as any)(), delete: (jest.fn as unknown as any)() };
        }),
      };

      dataSource.transaction.mockImplementation(async (cb: any) => cb(manager));
      vendorPaymentService.findAllByPurchaseOrder.mockResolvedValue(
        (opts.payments ?? []) as any,
      );

      return { manager, poManagerRepo, itemManagerRepo, productManagerRepo, savedOrders };
    }

    it('all in-transaction data access uses the manager, not injected repos', async () => {
      const { poManagerRepo, itemManagerRepo, productManagerRepo } = setupTxMocks({
        lockedStatus: PurchaseOrderStatus.DRAFT,
      });
      // After transaction entry there must be no injected-repo data access.
      purchaseOrderRepository.save.mockClear();
      purchaseOrderItemRepository.delete.mockClear();
      purchaseOrderItemRepository.save.mockClear();
      productRepository.findOne.mockClear();

      await service.update('po-1', {
        items: [{ productId: 'product-1', quantity: 1, unitPrice: 50 } as any],
      } as any);

      expect(productManagerRepo.findOne).toHaveBeenCalled();
      expect(itemManagerRepo.delete).toHaveBeenCalledWith({ purchaseOrderId: 'po-1' });
      expect(itemManagerRepo.save).toHaveBeenCalled();
      expect(poManagerRepo.save).toHaveBeenCalled();

      expect(purchaseOrderRepository.save).not.toHaveBeenCalled();
      expect(purchaseOrderItemRepository.delete).not.toHaveBeenCalled();
      expect(purchaseOrderItemRepository.save).not.toHaveBeenCalled();
      expect(productRepository.findOne).not.toHaveBeenCalled();
    });

    it('re-asserts editability against the locked row and rejects a RECEIVED order', async () => {
      setupTxMocks({ lockedStatus: PurchaseOrderStatus.RECEIVED });

      await expect(
        service.update('po-1', { shippingAmount: 10 } as any),
      ).rejects.toThrow('Return the goods first.');
    });

    it('recomputes totals and reconciles on a shipping-only update (no items)', async () => {
      const { savedOrders } = setupTxMocks({
        lockedStatus: PurchaseOrderStatus.READY,
        payments: [{ amount: '100.0000' }], // fully paid against old total of 100
      });

      await service.update('po-1', { shippingAmount: 20 } as any);

      // total recomputed to 120, paid is only 100 -> PARTIAL, demoted to DRAFT
      const finalSave = savedOrders[savedOrders.length - 1];
      expect(finalSave.totalAmount).toBe('120.0000');
      expect(finalSave.paymentStatus).toBe(PurchaseOrderPaymentStatus.PARTIAL);
      expect(finalSave.status).toBe(PurchaseOrderStatus.DRAFT);
    });

    it('promotes a partially-paid DRAFT to READY when a lower total makes it fully paid', async () => {
      // DRAFT, subtotal 100, paid 80 (PARTIAL). Apply 20% discount -> total 80,
      // now fully paid -> PAID + promoted to READY.
      const { savedOrders } = setupTxMocks({
        lockedStatus: PurchaseOrderStatus.DRAFT,
        payments: [{ amount: '80.0000' }],
      });

      await service.update('po-1', { discountPercent: 20 } as any);

      const finalSave = savedOrders[savedOrders.length - 1];
      expect(finalSave.totalAmount).toBe('80.0000');
      expect(finalSave.paymentStatus).toBe(PurchaseOrderPaymentStatus.PAID);
      expect(finalSave.status).toBe(PurchaseOrderStatus.READY);
    });

    it('clears the discount on a discount-removal update (10% -> 0%)', async () => {
      // Locked DRAFT carrying a stale 10% discount (subtotal 100, discountAmount 10,
      // total 90). Removing the discount restores total to 100.
      const { savedOrders } = setupTxMocks({
        lockedStatus: PurchaseOrderStatus.DRAFT,
        lockedOverrides: {
          discountPercent: 10,
          discountAmount: 10,
          totalAmount: '90.0000',
        },
      });

      await service.update('po-1', { discountPercent: 0 } as any);

      const finalSave = savedOrders[savedOrders.length - 1];
      expect(finalSave.discountAmount).toBe(0);
      expect(finalSave.totalAmount).toBe('100.0000');
    });
  });

  describe('findByOrderNumber', () => {
    it('maps the supplier slug so the detail page can link to the supplier', async () => {
      const entityLike = {
        ...mockPurchaseOrder,
        isFullyReceived: () => false,
        getTotalReceivedQuantity: () => 0,
        getTotalOrderedQuantity: () => 10,
      } as unknown as PurchaseOrder;
      purchaseOrderRepository.createQueryBuilder = (jest.fn as unknown as any)().mockReturnValue({
        leftJoinAndSelect: (jest.fn as unknown as any)().mockReturnThis(),
        where: (jest.fn as unknown as any)().mockReturnThis(),
        getOne: (jest.fn as unknown as any)().mockResolvedValue(entityLike),
      } as any);

      const dto = await service.findByOrderNumber('PO-000001');

      expect(dto.supplier?.slug).toBe('supplier-a');
      expect(dto.supplier?.companyName).toBe('Supplier A');
    });
  });

  describe('findAll', () => {
    function createFindAllQueryBuilder(orders: PurchaseOrder[] = []) {
      return {
        leftJoinAndSelect: (jest.fn as unknown as any)().mockReturnThis(),
        andWhere: (jest.fn as unknown as any)().mockReturnThis(),
        orderBy: (jest.fn as unknown as any)().mockReturnThis(),
        addOrderBy: (jest.fn as unknown as any)().mockReturnThis(),
        skip: (jest.fn as unknown as any)().mockReturnThis(),
        take: (jest.fn as unknown as any)().mockReturnThis(),
        getCount: (jest.fn as unknown as any)().mockResolvedValue(orders.length),
        getMany: (jest.fn as unknown as any)().mockResolvedValue(orders),
      };
    }

    function createFindAllOrder(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
      return {
        id: 'po-findall-1',
        orderNumber: 'PO-000101',
        orderDate: new Date('2026-04-01'),
        subtotal: 100,
        discountPercent: 0,
        discountAmount: 0,
        shippingAmount: 0,
        totalAmount: '100.0000',
        paidAmount: '0.0000',
        status: PurchaseOrderStatus.DRAFT,
        paymentStatus: PurchaseOrderPaymentStatus.UNPAID,
        notes: '',
        supplier: {
          id: 'supplier-1',
          companyName: 'Supplier A',
        },
        items: [],
        vendorPayments: [],
        isFullyReceived: (jest.fn as unknown as any)().mockReturnValue(false),
        getTotalReceivedQuantity: (jest.fn as unknown as any)().mockReturnValue(0),
        getTotalOrderedQuantity: (jest.fn as unknown as any)().mockReturnValue(0),
        ...overrides,
      } as unknown as PurchaseOrder;
    }

    it('adds unpaid paymentStatus filter', async () => {
      const queryBuilder = createFindAllQueryBuilder([
        createFindAllOrder({ paidAmount: '0.0000', totalAmount: '100.0000' }),
      ]);
      purchaseOrderRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);

      const result = await service.findAll({ paymentStatus: PurchaseOrderPaymentStatus.UNPAID });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        '(po.paidAmount = 0 OR po.paidAmount IS NULL)',
      );
      result.orders.forEach((order) => {
        expect(Number(order.paidAmount)).toBe(0);
      });
    });

    it('adds partial paymentStatus filter', async () => {
      const queryBuilder = createFindAllQueryBuilder([
        createFindAllOrder({ paidAmount: '40.0000', totalAmount: '100.0000' }),
      ]);
      purchaseOrderRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);

      const result = await service.findAll({ paymentStatus: PurchaseOrderPaymentStatus.PARTIAL });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'po.paidAmount > 0 AND po.paidAmount < po.totalAmount',
      );
      result.orders.forEach((order) => {
        expect(Number(order.paidAmount)).toBeGreaterThan(0);
        expect(Number(order.paidAmount)).toBeLessThan(Number(order.totalAmount));
      });
    });

    it('adds paid paymentStatus filter', async () => {
      const queryBuilder = createFindAllQueryBuilder([
        createFindAllOrder({ paidAmount: '100.0000', totalAmount: '100.0000' }),
      ]);
      purchaseOrderRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);

      const result = await service.findAll({ paymentStatus: PurchaseOrderPaymentStatus.PAID });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'po.paidAmount >= po.totalAmount AND po.paidAmount > 0',
      );
      result.orders.forEach((order) => {
        expect(Number(order.paidAmount)).toBeGreaterThanOrEqual(Number(order.totalAmount));
      });
    });

    it('adds overpaid paymentStatus filter', async () => {
      const queryBuilder = createFindAllQueryBuilder([
        createFindAllOrder({ paidAmount: '120.0000', totalAmount: '100.0000' }),
      ]);
      purchaseOrderRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);

      const result = await service.findAll({ paymentStatus: PurchaseOrderPaymentStatus.OVERPAID });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith('po.paidAmount > po.totalAmount');
      result.orders.forEach((order) => {
        expect(Number(order.paidAmount)).toBeGreaterThan(Number(order.totalAmount));
      });
    });

    it('adds draft status filter', async () => {
      const queryBuilder = createFindAllQueryBuilder([
        createFindAllOrder({ status: PurchaseOrderStatus.DRAFT }),
      ]);
      purchaseOrderRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);

      const result = await service.findAll({ status: PurchaseOrderStatus.DRAFT });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith('po.status = :status', {
        status: PurchaseOrderStatus.DRAFT,
      });
      result.orders.forEach((order) => {
        expect(order.status).toBe(PurchaseOrderStatus.DRAFT);
      });
    });

    it('adds received status filter', async () => {
      const queryBuilder = createFindAllQueryBuilder([
        createFindAllOrder({ status: PurchaseOrderStatus.RECEIVED }),
      ]);
      purchaseOrderRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);

      const result = await service.findAll({ status: PurchaseOrderStatus.RECEIVED });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith('po.status = :status', {
        status: PurchaseOrderStatus.RECEIVED,
      });
      result.orders.forEach((order) => {
        expect(order.status).toBe(PurchaseOrderStatus.RECEIVED);
      });
    });

    it('defaults to ordering by orderNumber DESC when no sort is supplied', async () => {
      const queryBuilder = createFindAllQueryBuilder([createFindAllOrder()]);
      purchaseOrderRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);

      await service.findAll({});

      expect(queryBuilder.orderBy).toHaveBeenCalledWith('po.orderNumber', 'DESC');
      // sortField === 'orderNumber' so the secondary orderNumber tiebreaker is skipped
      expect(queryBuilder.addOrderBy).not.toHaveBeenCalled();
    });

    it('maps receivedDate through to the response dto', async () => {
      const received = new Date('2026-06-10');
      const queryBuilder = createFindAllQueryBuilder([
        createFindAllOrder({ receivedDate: received } as any),
      ]);
      purchaseOrderRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);

      const result = await service.findAll({});

      expect(result.orders[0].receivedDate).toEqual(received);
    });

    it('maps a null receivedDate as null', async () => {
      const queryBuilder = createFindAllQueryBuilder([
        createFindAllOrder({ receivedDate: null } as any),
      ]);
      purchaseOrderRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);

      const result = await service.findAll({});

      expect(result.orders[0].receivedDate).toBeNull();
    });
  });


  describe('recordOrderPayments', () => {
    const mockDeletedPayment = {
      id: 'vp-old-1',
      purchaseOrderId: 'po-1',
      deletedAt: new Date('2026-02-19'),
      isActive: false,
      paymentMethodId: 'pm-bank',
      amount: '100.0000',
    } as unknown as VendorPayment;

    const mockRestoredPayment = {
      ...mockDeletedPayment,
      deletedAt: null,
      isActive: true,
    } as unknown as VendorPayment;

    const mockPurchaseOrderForPayment = {
      ...mockPurchaseOrder,
      supplierId: 'supplier-1',
      totalAmount: '100.0000',
      paidAmount: '0.0000',
    } as unknown as PurchaseOrder;

    beforeEach(() => {
      purchaseOrderRepository.findOne.mockResolvedValue(mockPurchaseOrderForPayment);
      purchaseOrderRepository.save.mockResolvedValue(mockPurchaseOrderForPayment);
      vendorPaymentService.findOne.mockResolvedValue(mockRestoredPayment);
      paymentMethodRepository.findOne.mockResolvedValue({ id: 'pm-cash', isActive: true, accountingChannel: 'BANK' });
      // Fresh order: no persisted active payments. Tests that assert the
      // reconcile-derived state queue the guard's pre-write read back-to-back
      // with the reconcile's post-write read (mockResolvedValueOnce).
      vendorPaymentService.findAllByPurchaseOrder.mockResolvedValue([]);
      const vpFind = (jest.fn as unknown as any)().mockResolvedValue([]);
      const vpFindOne = (jest.fn as unknown as any)().mockImplementation((...args) => (vendorPaymentRepository.findOne as any)(...args));
      const vpRestore = (jest.fn as unknown as any)((...args) => (vendorPaymentRepository.restore as any)(...args));
      const vpUpdate = (jest.fn as unknown as any)((...args) => (vendorPaymentRepository.update as any)(...args));
      const vpCreate = (jest.fn as unknown as any)((r) => r);
      const vpSave = (jest.fn as unknown as any)(async (r) => r);
      const manager = {
        getRepository: (jest.fn as unknown as any)((entity) => {
          if (entity === PurchaseOrder) return {
            findOne: (jest.fn as unknown as any)((...args) => (purchaseOrderRepository.findOne as any)(...args)),
            save: (jest.fn as unknown as any)(async (row) => { await purchaseOrderRepository.save(row); return row; }),
          };
          return { find: vpFind, findOne: vpFindOne, restore: vpRestore, update: vpUpdate, create: vpCreate, save: vpSave };
        }),
      } as unknown as EntityManager;
      (dataSource.transaction as any).mockImplementation(async (cb: any) => cb(manager));
    });

    it('derives paidAmount from the persisted active payments, not the in-memory total', async () => {
      vendorPaymentRepository.findOne.mockResolvedValue(null);
      vendorPaymentService.create.mockResolvedValue({ id: 'vp-new' } as VendorPayment);
      // DB reports two active payments (120 + 80 = 200) after the write, while
      // the single line written by this call is only 40 — paidAmount must
      // reflect the DB sum. The first read is the #1245 guard's pre-write
      // snapshot; the second is reconcilePaymentState reading the post-write state.
      vendorPaymentService.findAllByPurchaseOrder
        .mockResolvedValueOnce([])
        .mockResolvedValue([
          { id: 'vp-a', amount: '120.0000' } as unknown as VendorPayment,
          { id: 'vp-b', amount: '80.0000' } as unknown as VendorPayment,
        ]);

      await service.recordOrderPayments('po-1', [{ paymentMethodId: 'pm-cash', amount: '40.0000', paymentDate: '2026-01-15' }]);

      const saved = purchaseOrderRepository.save.mock.calls.at(-1)?.[0];
      expect(Number(saved.paidAmount)).toBe(200);
    });

    it('threads the acting user into payment creation and accounting', async () => {
      vendorPaymentRepository.findOne.mockResolvedValue(null);
      vendorPaymentService.create.mockResolvedValue({ id: 'vp-new' } as VendorPayment);

      await service.recordOrderPayments(
        'po-1',
        [{ paymentMethodId: 'pm-cash', amount: '40.0000', paymentDate: '2026-01-15' }],
        'user-42',
        'alice',
      );

      expect(vendorPaymentService.create).toHaveBeenCalledWith(
        expect.objectContaining({ purchaseOrderId: 'po-1' }),
        'user-42',
        'alice',
        expect.anything(),
      );
    });

    it('persists the supplied paymentDate instead of today', async () => {
      vendorPaymentRepository.findOne.mockResolvedValue(null);
      vendorPaymentService.create.mockResolvedValue({ id: 'vp-new' } as VendorPayment);

      await service.recordOrderPayments(
        'po-1',
        [{ paymentMethodId: 'pm-cash', amount: '30.0000', paymentDate: '2026-01-15' }],
        'user-1',
        'admin',
      );

      expect(vendorPaymentService.create).toHaveBeenCalledWith(
        expect.objectContaining({ paymentDate: '2026-01-15' }),
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });

    it('posts the journal entry on the supplied paymentDate', async () => {
      vendorPaymentRepository.findOne.mockResolvedValue(null);
      vendorPaymentService.create.mockResolvedValue({ id: 'vp-new' } as VendorPayment);
      const accounting = module.get<{ postPurchasePayment: any }>(ACCOUNTING_POSTING_PORT);

      await service.recordOrderPayments(
        'po-1',
        [{ paymentMethodId: 'pm-cash', amount: '30.0000', paymentDate: '2026-01-15' }],
        'user-1',
        'admin',
      );

      expect(accounting.postPurchasePayment).toHaveBeenCalledWith(
        expect.objectContaining({ entryDate: '2026-01-15' }),
        expect.anything(),
      );
    });

    it('creates a new vendor payment when no previous soft-deleted payment exists', async () => {
      vendorPaymentRepository.findOne.mockResolvedValue(null);
      vendorPaymentService.create.mockResolvedValue({ id: 'vp-new' } as VendorPayment);

      await service.recordOrderPayments('po-1', [{ paymentMethodId: 'pm-cash', amount: '40.0000', paymentDate: '2026-01-15' }]);

      expect(vendorPaymentService.create).toHaveBeenCalled();
      expect(vendorPaymentRepository.restore).not.toHaveBeenCalled();
    });

    it('restores the previous soft-deleted payment on re-pay', async () => {
      vendorPaymentRepository.findOne
        .mockResolvedValueOnce(mockDeletedPayment)
        .mockResolvedValueOnce(mockRestoredPayment);
      vendorPaymentRepository.restore.mockResolvedValue({} as any);
      vendorPaymentRepository.update.mockResolvedValue({} as any);

      await service.recordOrderPayments('po-1', [{ paymentMethodId: 'pm-cash', amount: '40.0000', paymentDate: '2026-01-15' }]);

      expect(vendorPaymentRepository.restore).toHaveBeenCalledWith('vp-old-1');
    });

    it('updates payment method and amount when restoring', async () => {
      vendorPaymentRepository.findOne
        .mockResolvedValueOnce(mockDeletedPayment)
        .mockResolvedValueOnce(mockRestoredPayment);
      vendorPaymentRepository.restore.mockResolvedValue({} as any);
      vendorPaymentRepository.update.mockResolvedValue({} as any);

      await service.recordOrderPayments('po-1', [{ paymentMethodId: 'pm-cash', amount: '40.0000', paymentDate: '2026-01-15' }]);

      expect(vendorPaymentRepository.update).toHaveBeenCalledWith(
        'vp-old-1',
        expect.objectContaining({ paymentMethodId: 'pm-cash', amount: '40.0000', isActive: true }),
      );
    });

    it('rejects payments for a CANCELLED purchase order', async () => {
      purchaseOrderRepository.findOne.mockResolvedValue({
        ...mockPurchaseOrderForPayment,
        status: PurchaseOrderStatus.CANCELLED,
      } as unknown as PurchaseOrder);

      await expect(
        service.recordOrderPayments('po-1', [{ paymentMethodId: 'pm-cash', amount: '200.0000', paymentDate: '2026-01-15' }]),
      ).rejects.toThrow(/CANCELLED/);
      expect(vendorPaymentService.create).not.toHaveBeenCalled();
    });

    it('rejects payments for a RECEIVED purchase order', async () => {
      purchaseOrderRepository.findOne.mockResolvedValue({
        ...mockPurchaseOrderForPayment,
        status: PurchaseOrderStatus.RECEIVED,
      } as unknown as PurchaseOrder);

      await expect(
        service.recordOrderPayments('po-1', [{ paymentMethodId: 'pm-cash', amount: '200.0000', paymentDate: '2026-01-15' }]),
      ).rejects.toThrow(/RECEIVED/);
    });

    it('rejects a non-positive payment line amount', async () => {
      vendorPaymentRepository.findOne.mockResolvedValue(null);

      await expect(
        service.recordOrderPayments('po-1', [{ paymentMethodId: 'pm-cash', amount: '0.0000', paymentDate: '2026-01-15' }]),
      ).rejects.toThrow(/greater than zero/);
    });

    it('keeps an overpaid DRAFT order in DRAFT (does not promote to READY)', async () => {
      // #1245: a new payment can no longer create OVERPAID — the guard rejects
      // it. OVERPAID stays reachable by reconciling after a total reduction, so
      // this drives reconcilePaymentState directly (the same shape the
      // reduce-to-exact companion below already uses for the PAID direction).
      const order = {
        ...mockPurchaseOrderForPayment,
        totalAmount: '100.0000',
        status: PurchaseOrderStatus.DRAFT,
      } as unknown as PurchaseOrder;
      // Persisted active payments sum to 120 against a 100 total => OVERPAID.
      vendorPaymentService.findAllByPurchaseOrder.mockResolvedValue([
        { id: 'vp-over', amount: '120.0000' } as unknown as VendorPayment,
      ]);

      await (service as any).reconcilePaymentState(order);

      const saved = purchaseOrderRepository.save.mock.calls.at(-1)?.[0];
      expect(saved.paymentStatus).toBe(PurchaseOrderPaymentStatus.OVERPAID);
      expect(saved.status).toBe(PurchaseOrderStatus.DRAFT);
    });

    it('reverts a READY order to DRAFT when a total reduction makes it overpaid', async () => {
      // Retained route: the total drops below what was already paid, so
      // reconciliation derives OVERPAID and READY is no longer valid.
      const order = {
        ...mockPurchaseOrderForPayment,
        totalAmount: '50.0000',
        status: PurchaseOrderStatus.READY,
      } as unknown as PurchaseOrder;
      vendorPaymentService.findAllByPurchaseOrder.mockResolvedValue([
        { id: 'vp-paid', amount: '100.0000' } as unknown as VendorPayment,
      ]);

      await (service as any).reconcilePaymentState(order);

      const saved = purchaseOrderRepository.save.mock.calls.at(-1)?.[0];
      expect(saved.paymentStatus).toBe(PurchaseOrderPaymentStatus.OVERPAID);
      expect(saved.status).toBe(PurchaseOrderStatus.DRAFT);
    });

    it('promotes a DRAFT order to READY on exact full payment', async () => {
      purchaseOrderRepository.findOne.mockResolvedValue({
        ...mockPurchaseOrderForPayment,
        totalAmount: '100.0000',
        status: PurchaseOrderStatus.DRAFT,
      } as unknown as PurchaseOrder);
      vendorPaymentRepository.findOne.mockResolvedValue(null);
      vendorPaymentService.create.mockResolvedValue({ id: 'vp-new' } as VendorPayment);
      // First read is the guard's pre-write snapshot (empty), the second is
      // reconcile reading a persisted set that sums to exactly 100 => PAID.
      vendorPaymentService.findAllByPurchaseOrder
        .mockResolvedValueOnce([])
        .mockResolvedValue([
          { id: 'vp-exact', amount: '100.0000' } as unknown as VendorPayment,
        ]);

      await service.recordOrderPayments('po-1', [{ paymentMethodId: 'pm-cash', amount: '100.0000', paymentDate: '2026-01-15' }]);

      const saved = purchaseOrderRepository.save.mock.calls.at(-1)?.[0];
      expect(saved.paymentStatus).toBe(PurchaseOrderPaymentStatus.PAID);
      expect(saved.status).toBe(PurchaseOrderStatus.READY);
    });

    it('promotes a DRAFT order to READY via reconcilePaymentState when an overpaid sum is reduced to exact PAID', async () => {
      // Spec test case 4: drive the private method directly. There is no public
      // flow that reduces overpaid to exact PAID (markAsUnpaid removes ALL
      // payments and resets to DRAFT, bypassing reconcilePaymentState), so this
      // guards the reverse-direction parity claim against the private method.
      const order = {
        ...mockPurchaseOrderForPayment,
        id: 'po-1',
        totalAmount: '100.0000',
        status: PurchaseOrderStatus.DRAFT,
      } as unknown as PurchaseOrder;
      // Active payment set sums to exactly 100 against a 100 total => PAID.
      vendorPaymentService.findAllByPurchaseOrder.mockResolvedValue([
        { id: 'vp-exact', amount: '100.0000' } as unknown as VendorPayment,
      ]);

      await (service as any).reconcilePaymentState(order);

      const saved = purchaseOrderRepository.save.mock.calls.at(-1)?.[0];
      expect(saved.paymentStatus).toBe(PurchaseOrderPaymentStatus.PAID);
      expect(saved.status).toBe(PurchaseOrderStatus.READY);
    });
  });

  describe('recordOrderPayments — overpayment guard (#1245)', () => {
    const lockedPO = {
      id: 'po-1',
      orderNumber: 'PO-001',
      status: PurchaseOrderStatus.DRAFT,
      supplierId: 'sup-1',
      totalAmount: '100.0000',
    } as unknown as PurchaseOrder;

    let accountingPort: any;

    beforeEach(() => {
      accountingPort = module.get(ACCOUNTING_POSTING_PORT);
      paymentMethodRepository.findOne.mockResolvedValue({
        id: 'pm-cash',
        isActive: true,
        accountingChannel: 'BANK',
      } as any);
      vendorPaymentService.create.mockResolvedValue({ id: 'vp-new' } as VendorPayment);
    });

    it('rejects a payment one minor unit over the remaining balance', async () => {
      // Persisted 40.00 against a 100.00 total => remaining 60.00.
      vendorPaymentService.findAllByPurchaseOrder.mockResolvedValue([
        { amount: '40.0000' },
      ] as any);
      wireTx({ lockedPO });

      await expect(
        service.recordOrderPayments('po-1', [
          { paymentMethodId: 'pm-cash', amount: '60.0001', paymentDate: '2026-09-17' },
        ]),
        // Pin both figures, not just the phrase: the reported "remaining
        // balance" is what the user acts on. 100.0000 total - 40.0000 persisted.
      ).rejects.toThrow('Payment amount (60.0001) exceeds remaining balance (60.0000)');

      expect(accountingPort.postPurchasePayment).not.toHaveBeenCalled();
      expect(vendorPaymentService.create).not.toHaveBeenCalled();
    });

    it('names the state when the order is already fully paid', async () => {
      // Remaining is exactly zero: a negative "remaining balance" figure would
      // not be actionable, so the message names the state instead.
      vendorPaymentService.findAllByPurchaseOrder.mockResolvedValue([
        { amount: '100.0000' },
      ] as any);
      wireTx({ lockedPO });

      await expect(
        service.recordOrderPayments('po-1', [
          { paymentMethodId: 'pm-cash', amount: '0.0001', paymentDate: '2026-09-17' },
        ]),
      ).rejects.toThrow('This order is already fully paid. No additional payment can be recorded.');

      expect(accountingPort.postPurchasePayment).not.toHaveBeenCalled();
      expect(vendorPaymentService.create).not.toHaveBeenCalled();
    });

    it('reports the overage when the order is already overpaid', async () => {
      // Reachable via the RETAINED route: a total reduced to 100.00 after
      // 170.00 was paid. The overage is reported as a positive figure; the
      // internal remaining balance keeps its sign.
      vendorPaymentService.findAllByPurchaseOrder.mockResolvedValue([
        { amount: '170.0000' },
      ] as any);
      wireTx({ lockedPO });

      await expect(
        service.recordOrderPayments('po-1', [
          { paymentMethodId: 'pm-cash', amount: '10.0000', paymentDate: '2026-09-17' },
        ]),
      ).rejects.toThrow('This order is already overpaid by 70.0000. No additional payment can be recorded.');

      expect(accountingPort.postPurchasePayment).not.toHaveBeenCalled();
      expect(vendorPaymentService.create).not.toHaveBeenCalled();
    });

    it('accepts a payment exactly equal to the remaining balance', async () => {
      vendorPaymentService.findAllByPurchaseOrder.mockResolvedValue([
        { amount: '40.0000' },
      ] as any);
      wireTx({ lockedPO });

      await service.recordOrderPayments('po-1', [
        { paymentMethodId: 'pm-cash', amount: '60.0000', paymentDate: '2026-09-17' },
      ]);

      expect(vendorPaymentService.create).toHaveBeenCalled();
    });

    it('rejects a batch whose lines individually fit but jointly exceed the total', async () => {
      vendorPaymentService.findAllByPurchaseOrder.mockResolvedValue([] as any);
      wireTx({ lockedPO });

      await expect(
        service.recordOrderPayments('po-1', [
          { paymentMethodId: 'pm-cash', amount: '60.0000', paymentDate: '2026-09-17' },
          { paymentMethodId: 'pm-cash', amount: '60.0000', paymentDate: '2026-09-17' },
        ]),
        // The reported amount is the SUMMED incoming (120.0000), not a single
        // line — proof the batch is guarded as one unit rather than per-line.
      ).rejects.toThrow('Payment amount (120.0000) exceeds remaining balance (100.0000)');

      expect(accountingPort.postPurchasePayment).not.toHaveBeenCalled();
      expect(vendorPaymentService.create).not.toHaveBeenCalled();
    });

    it('counts every submitted line exactly once on the restore branch', async () => {
      // A soft-deleted prior payment of 30.00 exists. findAllByPurchaseOrder
      // EXCLUDES it (isActive: true, plus TypeORM's default withDeleted: false),
      // so it contributes nothing to persisted net. The branch revives it with
      // payments[0]'s amount and creates the rest as new rows: projected net is
      // persisted + sum(ALL lines). Subtracting the restored row's OLD amount
      // would be wrong. Total 100.00, lines sum to 100.00 => must be accepted.
      vendorPaymentService.findAllByPurchaseOrder.mockResolvedValue([] as any);
      const ctx = wireTx({ lockedPO });
      ctx.vpRepo.findOne
        .mockResolvedValueOnce({
          id: 'vp-old',
          deletedAt: new Date('2026-09-01'),
          referenceNumber: 'OLD-REF',
        })
        .mockResolvedValue({ id: 'vp-old' });

      await service.recordOrderPayments('po-1', [
        { paymentMethodId: 'pm-cash', amount: '70.0000', paymentDate: '2026-09-17' },
        { paymentMethodId: 'pm-cash', amount: '30.0000', paymentDate: '2026-09-17' },
      ]);

      // payments[0] via restoration, payments.slice(1) as new rows: 2 rows, 100.00.
      expect(ctx.vpRepo.restore).toHaveBeenCalledWith('vp-old');
      expect(vendorPaymentService.create).toHaveBeenCalledTimes(1);
      const posted = accountingPort.postPurchasePayment.mock.calls.map((c: any[]) => c[0].amount);
      expect(posted).toHaveLength(2);
      expect(posted.map((a: string) => Number(a)).reduce((x: number, y: number) => x + y, 0)).toBe(100);
    });
  });

  describe('useForPurchases eligibility (#1246)', () => {
    const lockedPO = {
      id: 'po-1',
      orderNumber: 'PO-001',
      status: PurchaseOrderStatus.DRAFT,
      supplierId: 'sup-1',
      totalAmount: '100.0000',
    } as unknown as PurchaseOrder;

    it('rejects a new PO payment using an active method with useForPurchases=false', async () => {
      // The lookup filters on useForPurchases: true, so an ineligible method
      // yields null and is indistinguishable from "not found" at this layer.
      paymentMethodRepository.findOne.mockResolvedValue(null);
      const accountingPort = module.get(ACCOUNTING_POSTING_PORT);

      await expect(
        service.recordOrderPayments('po-1', [
          { paymentMethodId: 'method-no-purchase', amount: '25.0000', paymentDate: '2026-09-17' },
        ]),
      ).rejects.toThrow(/not found, inactive, or not enabled for purchases/i);

      // Preflight rejection: nothing was written and no transaction was opened.
      expect(accountingPort.postPurchasePayment).not.toHaveBeenCalled();
      expect(vendorPaymentService.create).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('queries the new-payment lookup with useForPurchases: true', async () => {
      paymentMethodRepository.findOne.mockResolvedValue(null);

      await expect(
        service.recordOrderPayments('po-1', [
          { paymentMethodId: 'method-1', amount: '25.0000', paymentDate: '2026-09-17' },
        ]),
      ).rejects.toThrow();

      expect(paymentMethodRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'method-1',
            isActive: true,
            useForPurchases: true,
          }),
        }),
      );
    });

    it('still accepts a refund using that same ineligible method (#1096)', async () => {
      // A method whose flag was cleared AFTER a payment was recorded must remain
      // usable to unwind that payment. The refund lookup must NOT filter on
      // useForPurchases, so an active-but-ineligible method resolves here.
      paymentMethodRepository.findOne.mockResolvedValue({
        id: 'method-no-purchase',
        isActive: true,
        useForPurchases: false,
        accountingChannel: 'BANK',
      } as any);
      wireTx({ lockedPO });
      vendorPaymentService.findAllByPurchaseOrder.mockResolvedValue([] as any);
      jest.spyOn(service as any, 'findOne').mockResolvedValue({ id: 'po-1' } as any);
      const accountingPort = module.get(ACCOUNTING_POSTING_PORT);

      await service.recordRefunds('po-1', [
        { paymentMethodId: 'method-no-purchase', amount: '10.0000', paymentDate: '2026-09-17' },
      ] as any);

      expect(paymentMethodRepository.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.not.objectContaining({ useForPurchases: expect.anything() }),
        }),
      );
      expect(accountingPort.postPurchaseRefund).toHaveBeenCalled();
    });
  });

  describe('duplicateOrder', () => {
    it('builds a CreatePurchaseOrderDto copying supplier, notes, and full item discount shape, then calls create', async () => {
      const original = {
        id: 'po-1',
        supplierId: 'sup-1',
        notes: 'hello',
        shippingAmount: '5',
        items: [
          {
            productId: 'p-1',
            quantity: '2',
            unitCost: '10',
            discountType: 'fixed_amount',
            discountPercent: '0',
            discountAmount: '1.5',
          },
        ],
      }
      purchaseOrderRepository.findOne.mockResolvedValueOnce(original as any)
      const createSpy = jest
        .spyOn(service, 'create')
        .mockResolvedValue(mockReturnDto as any)

      await service.duplicateOrder('po-1', 'user-1')

      expect(createSpy).toHaveBeenCalledTimes(1)
      const dto = createSpy.mock.calls[0][0]
      expect(dto.supplierId).toBe('sup-1')
      expect(dto.notes).toBe('hello')
      expect(dto.items[0]).toMatchObject({
        productId: 'p-1',
        quantity: 2,
        unitPrice: 10,
        discountType: 'fixed_amount',
        discountPercent: 0,
        discountAmount: 1.5,
      })
    })

    it('throws NotFoundException when the original does not exist', async () => {
      purchaseOrderRepository.findOne.mockResolvedValueOnce(null as any)
      await expect(service.duplicateOrder('missing', 'user-1')).rejects.toThrow('Purchase order not found')
    })
  })

  describe('markAsUnpaid business-calendar entryDate (issue #1134)', () => {
    // 16:30Z is past the UTC+8 rollover (16:00Z): UTC says the 24th,
    // Asia/Kuala_Lumpur says the 25th.
    const FROZEN_INSTANT = new Date('2026-08-24T16:30:00.000Z');

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(FROZEN_INSTANT);
      vendorPaymentService.findAllByPurchaseOrder.mockResolvedValue([
        { id: 'vp-1' },
      ] as any);
      vendorPaymentService.softDeleteForUnpay.mockResolvedValue(undefined as any);
      jest.spyOn(service as any, 'findOne').mockResolvedValue({ id: 'po-1' } as any);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it.each([
      ['Asia/Kuala_Lumpur', '2026-08-25'],
      ['UTC', '2026-08-24'],
    ])('dates the reversal in %s as %s', async (timezone, expected) => {
      appTimezone = timezone;
      wireTx({ lockedPO: { id: 'po-1', orderNumber: 'PO-001', status: 'DRAFT' } });
      const accounting = module.get<{ reverseEntriesForDocument: any }>(
        ACCOUNTING_POSTING_PORT,
      );

      await service.markAsUnpaid('po-1', 'user-1', 'admin');

      const [, , , entryDate] = accounting.reverseEntriesForDocument.mock.calls[0];
      expect(entryDate).toBe(expected);
    });
  });

  describe('recordRefunds', () => {
    const lockedPO = {
      id: 'po-1',
      orderNumber: 'PO-001',
      status: 'DRAFT',
      supplierId: 'sup-1',
      totalAmount: '100.0000',
    }
    let generateSpy: any;

    beforeEach(() => {
      paymentMethodRepository.findOne.mockResolvedValue({ id: 'pm-1', isActive: true, accountingChannel: 'BANK' })
      generateSpy = (jest.fn as unknown as any)();
      ;(service as any).settingsService = {
        generateDocumentNumber: generateSpy,
        getRegionalSettings: (jest.fn as unknown as any)(async () => ({ timezone: appTimezone })),
      }
      vendorPaymentRepository.findOne.mockResolvedValue({
        id: 'refund-1',
        amount: '-40.0000',
        supplier: { companyName: 'Acme' },
        paymentMethodEntity: { code: 'CASH' },
      } as any)
      jest.spyOn(service as any, 'findOne').mockResolvedValue({ id: 'po-1' } as any)
    })

    it('inserts a negative VP row (status completed) with paymentMethodId and reference->referenceNumber', async () => {
      const ctx = wireTx({ lockedPO })
      jest.spyOn(service as any, 'reconcilePaymentState').mockResolvedValue(undefined)

      await service.recordRefunds('po-1', [{ paymentMethodId: 'pm-1', amount: '40.0000', reference: 'damaged goods' }], 'user-1', 'admin')

      expect(ctx.saved).toHaveLength(1)
      expect(ctx.saved[0]).toMatchObject({
        supplierId: 'sup-1',
        purchaseOrderId: 'po-1',
        paymentMethodId: 'pm-1',
        amount: '-40.0000',
        status: 'completed',
        referenceNumber: 'damaged goods',
      })
      expect(ctx.saved[0].paymentDate).toBeDefined()
      expect(generateSpy).not.toHaveBeenCalled()
    })

    describe('business-calendar entryDate (issue #1134)', () => {
      // 16:30Z is past the UTC+8 rollover (16:00Z): UTC says the 24th,
      // Asia/Kuala_Lumpur says the 25th.
      const FROZEN_INSTANT = new Date('2026-08-24T16:30:00.000Z');

      beforeEach(() => {
        jest.useFakeTimers().setSystemTime(FROZEN_INSTANT);
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it.each([
        ['Asia/Kuala_Lumpur', '2026-08-25'],
        ['UTC', '2026-08-24'],
      ])('dates the refund JE in %s as %s', async (timezone, expected) => {
        appTimezone = timezone
        ;(service as any).settingsService.getRegionalSettings = (jest.fn as unknown as any)(async () => ({
          timezone,
        }))
        wireTx({ lockedPO })
        jest.spyOn(service as any, 'reconcilePaymentState').mockResolvedValue(undefined)
        const accounting = module.get<{ postPurchaseRefund: any }>(ACCOUNTING_POSTING_PORT)

        await service.recordRefunds('po-1', [{ paymentMethodId: 'pm-1', amount: '40.0000' }], 'u', 'admin')

        expect(accounting.postPurchaseRefund).toHaveBeenCalledWith(
          expect.objectContaining({ entryDate: expected }),
          expect.anything(),
        )
      })
    })

    it('rejects total refund exceeding net paid across ACTIVE rows (aggregate guard)', async () => {
      wireTx({ lockedPO, existing: [{ amount: '100.0000', isActive: true }] })
      await expect(
        service.recordRefunds('po-1', [{ paymentMethodId: 'pm-1', amount: '150.0000' }], 'u'),
      ).rejects.toThrow(/exceeds net paid/i)
    })

    it('computes netPaid from ACTIVE rows only (guard query filters isActive: true)', async () => {
      const ctx = wireTx({ lockedPO })
      jest.spyOn(service as any, 'reconcilePaymentState').mockResolvedValue(undefined)

      await service.recordRefunds('po-1', [{ paymentMethodId: 'pm-1', amount: '40.0000' }], 'u')

      expect(ctx.vpRepo.find).toHaveBeenCalledWith({
        where: { purchaseOrderId: 'po-1', isActive: true },
      })
    })

    it('reconciles payment state INSIDE the transaction with the manager', async () => {
      wireTx({ lockedPO })
      const reconcileSpy = jest.spyOn(service as any, 'reconcilePaymentState').mockResolvedValue(undefined)

      await service.recordRefunds('po-1', [{ paymentMethodId: 'pm-1', amount: '40.0000' }], 'u')

      expect(reconcileSpy).toHaveBeenCalledWith(lockedPO, expect.anything())
    })

    it('audit-logs each refund row with its id and paymentMethodId', async () => {
      wireTx({ lockedPO })
      jest.spyOn(service as any, 'reconcilePaymentState').mockResolvedValue(undefined)

      await service.recordRefunds('po-1', [{ paymentMethodId: 'pm-1', amount: '40.0000' }], 'u')

      expect(auditLogService.log).toHaveBeenCalledWith(
        'CREATE',
        'VendorPayment',
        expect.any(String),
        expect.objectContaining({
          newValues: expect.objectContaining({ paymentMethodId: 'pm-1' }),
        }),
      )
    })

    it('rejects refund on a RECEIVED purchase order', async () => {
      const ctx = mockTxManager({ lockedPO: { ...lockedPO, status: 'RECEIVED' } })
      ;(dataSource.transaction as any).mockImplementation(async (cb) => cb(ctx.manager))
      await expect(
        service.recordRefunds('po-1', [{ paymentMethodId: 'pm-1', amount: '10.0000' }], 'u'),
      ).rejects.toThrow('Cannot refund a RECEIVED purchase order.')
    })

    it('rejects refund on a CANCELLED purchase order', async () => {
      const ctx = mockTxManager({ lockedPO: { ...lockedPO, status: 'CANCELLED' } })
      ;(dataSource.transaction as any).mockImplementation(async (cb) => cb(ctx.manager))
      await expect(
        service.recordRefunds('po-1', [{ paymentMethodId: 'pm-1', amount: '10.0000' }], 'u'),
      ).rejects.toThrow('Cannot refund a CANCELLED purchase order.')
    })

    it('rejects a non-positive amount', async () => {
      await expect(
        service.recordRefunds('po-1', [{ paymentMethodId: 'pm-1', amount: '0.0000' }], 'u'),
      ).rejects.toThrow('greater than zero')
    })

    it('rejects an inactive / unknown payment method', async () => {
      paymentMethodRepository.findOne.mockResolvedValue(null)
      await expect(
        service.recordRefunds('po-1', [{ paymentMethodId: 'bad', amount: '10.0000' }], 'u'),
      ).rejects.toThrow(/not found or inactive/i)
    })
  })

  describe('money exactness (scale-4 string amounts)', () => {
    const lockedPO = {
      id: 'po-1',
      orderNumber: 'PO-001',
      status: 'DRAFT',
      supplierId: 'sup-1',
      totalAmount: '100.0000',
    }
    const mockPOForPayment = {
      ...mockPurchaseOrder,
      supplierId: 'supplier-1',
      paidAmount: '0.0000',
    } as unknown as PurchaseOrder;

    beforeEach(() => {
      purchaseOrderRepository.findOne.mockResolvedValue(mockPOForPayment);
      purchaseOrderRepository.save.mockResolvedValue(mockPOForPayment);
      vendorPaymentService.findOne.mockResolvedValue({ id: 'vp-old-1' } as VendorPayment);
      paymentMethodRepository.findOne.mockResolvedValue({ id: 'pm-cash', isActive: true, accountingChannel: 'BANK' });
      // Fresh order: no persisted active payments. Guard-passing tests queue
      // their pre-write and post-write reads explicitly.
      vendorPaymentService.findAllByPurchaseOrder.mockResolvedValue([]);
      const vpFind = (jest.fn as unknown as any)().mockResolvedValue([]);
      const vpFindOne = (jest.fn as unknown as any)().mockImplementation((...args) => (vendorPaymentRepository.findOne as any)(...args));
      const vpRestore = (jest.fn as unknown as any)((...args) => (vendorPaymentRepository.restore as any)(...args));
      const vpUpdate = (jest.fn as unknown as any)((...args) => (vendorPaymentRepository.update as any)(...args));
      const vpCreate = (jest.fn as unknown as any)((r) => r);
      const vpSave = (jest.fn as unknown as any)(async (r) => r);
      const manager = {
        getRepository: (jest.fn as unknown as any)((entity) => {
          if (entity === PurchaseOrder) return {
            findOne: (jest.fn as unknown as any)((...args) => (purchaseOrderRepository.findOne as any)(...args)),
            save: (jest.fn as unknown as any)(async (row) => { await purchaseOrderRepository.save(row); return row; }),
          };
          return { find: vpFind, findOne: vpFindOne, restore: vpRestore, update: vpUpdate, create: vpCreate, save: vpSave };
        }),
      } as unknown as EntityManager;
      (dataSource.transaction as any).mockImplementation(async (cb: any) => cb(manager));
      jest.spyOn(service as any, 'findOne').mockResolvedValue({ id: 'po-1' } as any);
    });

    it('allows a refund exactly equal to net paid and resets the order to UNPAID', async () => {
      paymentMethodRepository.findOne.mockResolvedValue({ id: 'pm-1', isActive: true, accountingChannel: 'BANK' });
      const ctx = wireTx({ lockedPO, existing: [{ id: 'vp-paid', amount: '100.0000', isActive: true }] });
      // Net paid after the refund = 100.0000 - 100.0000 = 0.
      vendorPaymentService.findAllByPurchaseOrder.mockResolvedValue([
        { id: 'vp-paid', amount: '100.0000' } as unknown as VendorPayment,
        { id: 'vp-refund', amount: '-100.0000' } as unknown as VendorPayment,
      ]);

      await service.recordRefunds('po-1', [{ paymentMethodId: 'pm-1', amount: '100.0000' }], 'u');

      expect(ctx.saved[0]).toMatchObject({ amount: '-100.0000' });
      const saved = ctx.poRepo.save.mock.calls.at(-1)?.[0] as PurchaseOrder;
      expect(saved.paymentStatus).toBe(PurchaseOrderPaymentStatus.UNPAID);
      expect(saved.paidAmount).toBe('0.0000');
    });

    it('rejects a refund that exceeds net paid by one minor unit', async () => {
      paymentMethodRepository.findOne.mockResolvedValue({ id: 'pm-1', isActive: true, accountingChannel: 'BANK' });
      wireTx({ lockedPO, existing: [{ id: 'vp-paid', amount: '100.0000', isActive: true }] });

      await expect(
        service.recordRefunds('po-1', [{ paymentMethodId: 'pm-1', amount: '100.0001' }], 'u'),
      ).rejects.toThrow(BadRequestException);
    });

    it('marks the order PAID and promotes DRAFT to READY when payments equal the total', async () => {
      purchaseOrderRepository.findOne.mockResolvedValue({
        ...mockPOForPayment,
        totalAmount: '100.0000',
        status: PurchaseOrderStatus.DRAFT,
      } as unknown as PurchaseOrder);
      vendorPaymentRepository.findOne.mockResolvedValue(null);
      vendorPaymentService.create.mockResolvedValue({ id: 'vp-new' } as VendorPayment);
      // Pre-write empty (guard passes), post-write exactly 100 => PAID.
      vendorPaymentService.findAllByPurchaseOrder
        .mockResolvedValueOnce([])
        .mockResolvedValue([
          { id: 'vp-exact', amount: '100.0000' } as unknown as VendorPayment,
        ]);

      await service.recordOrderPayments('po-1', [{ paymentMethodId: 'pm-cash', amount: '100.0000', paymentDate: '2026-01-15' }]);

      const saved = purchaseOrderRepository.save.mock.calls.at(-1)?.[0];
      expect(saved.paymentStatus).toBe(PurchaseOrderPaymentStatus.PAID);
      expect(saved.status).toBe(PurchaseOrderStatus.READY);
    });

    it('derives OVERPAID and keeps DRAFT when reconciliation sees payments above the total', async () => {
      // #1245: an overpayment can no longer arrive via a new payment; the
      // retained route is reconciliation after a total reduction.
      const order = {
        ...mockPOForPayment,
        totalAmount: '100.0000',
        status: PurchaseOrderStatus.DRAFT,
      } as unknown as PurchaseOrder;
      vendorPaymentService.findAllByPurchaseOrder.mockResolvedValue([
        { id: 'vp-over', amount: '120.0000' } as unknown as VendorPayment,
      ]);

      await (service as any).reconcilePaymentState(order);

      const saved = purchaseOrderRepository.save.mock.calls.at(-1)?.[0];
      expect(saved.paymentStatus).toBe(PurchaseOrderPaymentStatus.OVERPAID);
      expect(saved.status).toBe(PurchaseOrderStatus.DRAFT);
    });
  })

  describe('payment reference persistence', () => {
    const lockedPO = {
      id: 'po-1',
      orderNumber: 'PO-001',
      status: 'DRAFT',
      supplierId: 'sup-1',
      totalAmount: '100.0000',
    }

    beforeEach(() => {
      paymentMethodRepository.findOne.mockResolvedValue({
        id: 'pm-1',
        isActive: true,
        accountingChannel: 'BANK',
      } as any)
      ;(vendorPaymentService.create as any).mockResolvedValue({ id: 'vp-new' })
      vendorPaymentService.findAllByPurchaseOrder.mockResolvedValue([])
      jest.spyOn(service as any, 'reconcilePaymentState').mockResolvedValue(undefined)
      jest.spyOn(service as any, 'findOne').mockResolvedValue({ id: 'po-1' } as any)
    })

    it('records a refund reference into referenceNumber, not notes (line 798)', async () => {
      const ctx = wireTx({ lockedPO })

      await service.recordRefunds(
        'po-1',
        [{ paymentMethodId: 'pm-1', amount: '40.0000', reference: 'RFND-77' }],
        'user-1',
        'admin',
      )

      expect(ctx.saved).toHaveLength(1)
      expect(ctx.saved[0]).toMatchObject({ referenceNumber: 'RFND-77' })
      expect(ctx.saved[0].notes).toBeUndefined()
    })

    it('records a fresh payment reference into referenceNumber (line 958)', async () => {
      const ctx = wireTx({ lockedPO, existing: [] })

      await service.recordOrderPayments(
        'po-1',
        [{ paymentMethodId: 'pm-1', amount: '100.0000', paymentDate: '2026-01-15', reference: 'WIRE-001' }],
        'user-1',
        'admin',
      )

      expect(vendorPaymentService.create).toHaveBeenCalledWith(
        expect.objectContaining({ referenceNumber: 'WIRE-001' }),
        'user-1',
        'admin',
        ctx.manager,
      )
    })

    it('records remaining-line references into referenceNumber (line 930)', async () => {
      const ctx = wireTx({ lockedPO, existing: [] })
      ctx.vpRepo.findOne
        .mockResolvedValueOnce({
          id: 'vp-old',
          deletedAt: new Date(),
          referenceNumber: null,
          notes: null,
        })
        .mockResolvedValue({ id: 'vp-old' })

      await service.recordOrderPayments(
        'po-1',
        [
          { paymentMethodId: 'pm-1', amount: '60.0000', paymentDate: '2026-01-15', reference: 'FIRST-1' },
          { paymentMethodId: 'pm-1', amount: '40.0000', paymentDate: '2026-01-15', reference: 'SECOND-2' },
        ],
        'user-1',
        'admin',
      )

      expect(vendorPaymentService.create).toHaveBeenCalledWith(
        expect.objectContaining({ referenceNumber: 'SECOND-2' }),
        'user-1',
        'admin',
        ctx.manager,
      )
    })

    it('restores a payment writing referenceNumber (line 901)', async () => {
      const ctx = wireTx({ lockedPO, existing: [] })
      ctx.vpRepo.findOne
        .mockResolvedValueOnce({
          id: 'vp-old',
          deletedAt: new Date(),
          referenceNumber: null,
          notes: null,
        })
        .mockResolvedValue({ id: 'vp-old' })

      await service.recordOrderPayments(
        'po-1',
        [{ paymentMethodId: 'pm-1', amount: '60.0000', paymentDate: '2026-01-15', reference: 'RESTORED-1' }],
        'user-1',
        'admin',
      )

      expect(ctx.vpRepo.restore).toHaveBeenCalledWith('vp-old')
      expect(ctx.vpRepo.update).toHaveBeenCalledWith(
        'vp-old',
        expect.objectContaining({ referenceNumber: 'RESTORED-1' }),
      )
    })

    it('preserves the prior referenceNumber when a restore supplies none (line 901)', async () => {
      const ctx = wireTx({ lockedPO, existing: [] })
      ctx.vpRepo.findOne
        .mockResolvedValueOnce({
          id: 'vp-old',
          deletedAt: new Date(),
          referenceNumber: 'OLD-REF',
          notes: 'some note',
        })
        .mockResolvedValue({ id: 'vp-old' })

      await service.recordOrderPayments(
        'po-1',
        [{ paymentMethodId: 'pm-1', amount: '60.0000', paymentDate: '2026-01-15' }],
        'user-1',
        'admin',
      )

      expect(ctx.vpRepo.update).toHaveBeenCalledWith(
        'vp-old',
        expect.objectContaining({ referenceNumber: 'OLD-REF' }),
      )
    })
  })

  // derivePaymentStatus decides PAID by exact equality. Under Number() a fully
  // paid order could miss that equality and stay PARTIAL, silently failing to
  // promote DRAFT -> READY. These pin the exact bigint comparison.
  describe('exact payment reconciliation', () => {
    const reconcile = (order: any) =>
      (service as any).reconcilePaymentState(order as PurchaseOrder);

    beforeEach(() => {
      purchaseOrderRepository.save.mockImplementation((v: any) => Promise.resolve(v));
    });

    it('sums split payments exactly and promotes DRAFT to READY when fully paid', async () => {
      // Number('0.1') + Number('0.2') === 0.30000000000000004 !== 0.3
      vendorPaymentService.findAllByPurchaseOrder.mockResolvedValue([
        { amount: '0.1000' },
        { amount: '0.2000' },
      ] as any);
      const order: any = {
        id: 'po-1',
        totalAmount: '0.3000',
        paidAmount: '0.0000',
        status: PurchaseOrderStatus.DRAFT,
      };

      await reconcile(order);

      expect(order.paidAmount).toBe('0.3000');
      expect(order.paymentStatus).toBe(PurchaseOrderPaymentStatus.PAID);
      expect(order.status).toBe(PurchaseOrderStatus.READY);
    });

    it('derives PARTIAL one minor unit below the total and stays DRAFT', async () => {
      vendorPaymentService.findAllByPurchaseOrder.mockResolvedValue([
        { amount: '99.9999' },
      ] as any);
      const order: any = {
        id: 'po-1',
        totalAmount: '100.0000',
        paidAmount: '0.0000',
        status: PurchaseOrderStatus.DRAFT,
      };

      await reconcile(order);

      expect(order.paymentStatus).toBe(PurchaseOrderPaymentStatus.PARTIAL);
      expect(order.status).toBe(PurchaseOrderStatus.DRAFT);
    });

    it('derives OVERPAID one minor unit above the total and does not promote', async () => {
      vendorPaymentService.findAllByPurchaseOrder.mockResolvedValue([
        { amount: '100.0001' },
      ] as any);
      const order: any = {
        id: 'po-1',
        totalAmount: '100.0000',
        paidAmount: '0.0000',
        status: PurchaseOrderStatus.DRAFT,
      };

      await reconcile(order);

      // OVERPAID is a supported state and is not fulfillable.
      expect(order.paymentStatus).toBe(PurchaseOrderPaymentStatus.OVERPAID);
      expect(order.status).toBe(PurchaseOrderStatus.DRAFT);
    });

    it('derives UNPAID with no payments and reverts READY to DRAFT', async () => {
      vendorPaymentService.findAllByPurchaseOrder.mockResolvedValue([] as any);
      const order: any = {
        id: 'po-1',
        totalAmount: '100.0000',
        paidAmount: '100.0000',
        status: PurchaseOrderStatus.READY,
      };

      await reconcile(order);

      expect(order.paidAmount).toBe('0.0000');
      expect(order.paymentStatus).toBe(PurchaseOrderPaymentStatus.UNPAID);
      expect(order.status).toBe(PurchaseOrderStatus.DRAFT);
    });

    it('stays exact at the maximum decimal(15,4) magnitude', async () => {
      vendorPaymentService.findAllByPurchaseOrder.mockResolvedValue([
        { amount: '99999999999.9900' },
      ] as any);
      const order: any = {
        id: 'po-1',
        totalAmount: '99999999999.9900',
        paidAmount: '0.0000',
        status: PurchaseOrderStatus.DRAFT,
      };

      await reconcile(order);

      expect(order.paidAmount).toBe('99999999999.9900');
      expect(order.paymentStatus).toBe(PurchaseOrderPaymentStatus.PAID);
    });
  });
});

describe('purchase order precision (#1241)', () => {
  it('applies a fixed line discount PER UNIT, unlike sales orders', () => {
    // 3 units @ 10.00 with a 1.00 per-unit discount -> 27.00, not 29.00
    const qty = 3n;
    const unit = toMinorUnits('10.0000');
    const perUnitDiscount = toMinorUnits('1.0000');
    const lineTotal = qty * (unit - perUnitDiscount);
    expect(formatMoney(quantizeToCents(lineTotal))).toBe('27.00');
  });

  it('reconciles subtotal - document discount + shipping = total', () => {
    const subtotal = quantizeToCents(toMinorUnits('100.0000'));
    const discount = quantizeToCents((subtotal * toMinorUnits('10')) / 1000000n);
    const shipping = quantizeToCents(toMinorUnits('5.0000'));
    expect(formatMoney(subtotal - discount + shipping)).toBe('95.00');
  });

  it('applies a percentage line discount to unit cost before quantity in the hook', () => {
    const item = Object.assign(new PurchaseOrderItem(), {
      quantity: 3,
      unitCost: 10,
      discountType: 'percentage',
      discountPercent: 10,
      discountAmount: 0,
    });
    item.calculateTotals();
    // 3 × (10 − 1) = 27.00; total discount 3.00
    expect(item.totalAmount).toBe(27);
    expect(item.discountAmount).toBe(3);
  });

  it('applies a fixed per-unit discount uncapped in the hook', () => {
    const item = Object.assign(new PurchaseOrderItem(), {
      quantity: 2,
      unitCost: 10,
      discountType: 'fixed_amount',
      discountPercent: 0,
      discountAmount: 12.5,
    });
    item.calculateTotals();
    // per-unit discount is uncapped: 2 × (10 − 12.5) = −5.00
    expect(item.totalAmount).toBe(-5);
    expect(item.discountAmount).toBe(25);
  });

  it('sums cent-quantized item totals and applies the document discount exactly', () => {
    const order = Object.assign(new PurchaseOrder(), {
      subtotal: 0,
      discountPercent: 10,
      shippingAmount: 0.05,
      items: [
        Object.assign(new PurchaseOrderItem(), { totalAmount: 0.335 }),
        Object.assign(new PurchaseOrderItem(), { totalAmount: 0.335 }),
        Object.assign(new PurchaseOrderItem(), { totalAmount: 0.33 }),
      ],
    });
    order.calculateTotals();
    // 0.34 + 0.34 + 0.33 = 1.01; 10% = 0.101 -> 0.10; + 0.05 shipping = 0.96
    expect(order.subtotal).toBe(1.01);
    expect(order.discountAmount).toBe(0.1);
    expect(order.totalAmount).toBe('0.9600');
  });
});
