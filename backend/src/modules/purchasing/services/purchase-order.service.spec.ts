import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { Logger } from '@nestjs/common';
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

describe('PurchaseOrderService', () => {
  let module: TestingModule;
  let service: PurchaseOrderService;
  let purchaseOrderRepository: jest.Mocked<Repository<PurchaseOrder>>;
  let purchaseOrderItemRepository: jest.Mocked<Repository<PurchaseOrderItem>>;
  let productRepository: jest.Mocked<Repository<Product>>;
  let vendorPaymentRepository: jest.Mocked<Repository<VendorPayment>>;
  let auditLogService: jest.Mocked<AuditLogService>;
  let stockMovementService: jest.Mocked<StockMovementService>;
  let vendorPaymentService: jest.Mocked<VendorPaymentService>;
  let paymentMethodRepository: any;
  let dataSource: jest.Mocked<DataSource>
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
      find: jest.fn().mockResolvedValue(existing ?? []),
      findOne: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((row) => row),
      save: jest.fn(async (row) => {
        const persisted = { id: `refund-${saved.length + 1}`, ...row }
        saved.push(persisted)
        return persisted
      }),
    }
    const poRepo = {
      findOne: jest.fn().mockResolvedValue(lockedPO),
      save: jest.fn(async (row) => row),
    }
    const manager = {
      getRepository: jest.fn((entity) => (entity === PurchaseOrder ? poRepo : vpRepo)),
    }
    return { manager, vpRepo, poRepo, saved }
  }

  beforeEach(async () => {
    dataSource = { transaction: jest.fn() } as any
    module = await Test.createTestingModule({
      providers: [
        PurchaseOrderService,
        {
          provide: getRepositoryToken(PurchaseOrder),
          useValue: {
            findOne: jest.fn(),
            update: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PurchaseOrderItem),
          useValue: {
            save: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Supplier),
          useValue: {},
        },
        {
          provide: getRepositoryToken(Product),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(VendorPayment),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
            restore: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PaymentMethodEntity),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: SupplierService,
          useValue: {},
        },
        {
          provide: VendorPaymentService,
          useValue: {
            findAllByPurchaseOrder: jest.fn(),
            softDeleteForUnpay: jest.fn(),
            create: jest.fn(),
            findOne: jest.fn(),
            findByPurchaseOrder: jest.fn(),
            createForPurchaseOrder: jest.fn(),
          },
        },
        {
          provide: BaseCostCalculatorService,
          useValue: {},
        },
        {
          provide: StockMovementService,
          useValue: {
            create: jest.fn(),
            deleteByReference: jest.fn(),
          },
        },
        {
          provide: SettingsService,
          useValue: {},
        },
        {
          provide: AuditLogService,
          useValue: {
            log: jest.fn(),
          },
        },
        {
          provide: PurchaseOrderLifecycleService,
          useValue: {
            cancel: jest.fn(),
            uncancel: jest.fn(),
            receive: jest.fn(),
            return: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: ACCOUNTING_POSTING_PORT,
          useValue: { postPurchasePayment: jest.fn(), postPurchaseRefund: jest.fn(), reverseEntriesForDocument: jest.fn() },
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
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();

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
      purchaseOrderRepository.createQueryBuilder = jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([order]),
      } as any);
    }

    it('returns matching purchase orders as GlobalSearchResultDto', async () => {
      const order = {
        id: 'po-uuid-1',
        orderNumber: 'PO-000001',
        supplier: { companyName: 'Acme Supplies' },
        deletedAt: null,
      };
      purchaseOrderRepository.createQueryBuilder = jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([order]),
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
      payments?: { amount: number }[];
    }) {
      const savedOrders: PurchaseOrder[] = [];
      const poManagerRepo = {
        findOne: jest.fn(),
        save: jest.fn().mockImplementation((o: PurchaseOrder) => {
          savedOrders.push(Object.assign(new PurchaseOrder(), o));
          return Promise.resolve(o);
        }),
      };
      const itemManagerRepo = {
        delete: jest.fn().mockResolvedValue(undefined),
        save: jest.fn().mockResolvedValue([]),
      };
      const productManagerRepo = {
        findOne: jest.fn().mockResolvedValue({ id: 'product-1' }),
      };

      const lockedOrder = Object.assign(new PurchaseOrder(), {
        id: 'po-1',
        orderNumber: 'PO-000001',
        status: opts.lockedStatus,
        subtotal: 100,
        discountPercent: 0,
        discountAmount: 0,
        shippingAmount: 0,
        totalAmount: 100,
        paidAmount: 0,
        paymentStatus: PurchaseOrderPaymentStatus.UNPAID,
        orderDate: new Date('2024-01-01'),
        ...opts.lockedOverrides,
      });
      // lockRowForUpdate -> manager.getRepository(PurchaseOrder).findOne(...)
      poManagerRepo.findOne.mockResolvedValue(lockedOrder);

      const manager = {
        getRepository: jest.fn().mockImplementation((entity: any) => {
          if (entity === PurchaseOrder) return poManagerRepo;
          if (entity === PurchaseOrderItem) return itemManagerRepo;
          if (entity === Product) return productManagerRepo;
          return { save: jest.fn(), findOne: jest.fn(), delete: jest.fn() };
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
        payments: [{ amount: 100 }], // fully paid against old total of 100
      });

      await service.update('po-1', { shippingAmount: 20 } as any);

      // total recomputed to 120, paid is only 100 -> PARTIAL, demoted to DRAFT
      const finalSave = savedOrders[savedOrders.length - 1];
      expect(finalSave.totalAmount).toBe(120);
      expect(finalSave.paymentStatus).toBe(PurchaseOrderPaymentStatus.PARTIAL);
      expect(finalSave.status).toBe(PurchaseOrderStatus.DRAFT);
    });

    it('promotes a partially-paid DRAFT to READY when a lower total makes it fully paid', async () => {
      // DRAFT, subtotal 100, paid 80 (PARTIAL). Apply 20% discount -> total 80,
      // now fully paid -> PAID + promoted to READY.
      const { savedOrders } = setupTxMocks({
        lockedStatus: PurchaseOrderStatus.DRAFT,
        payments: [{ amount: 80 }],
      });

      await service.update('po-1', { discountPercent: 20 } as any);

      const finalSave = savedOrders[savedOrders.length - 1];
      expect(finalSave.totalAmount).toBe(80);
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
          totalAmount: 90,
        },
      });

      await service.update('po-1', { discountPercent: 0 } as any);

      const finalSave = savedOrders[savedOrders.length - 1];
      expect(finalSave.discountAmount).toBe(0);
      expect(finalSave.totalAmount).toBe(100);
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
      purchaseOrderRepository.createQueryBuilder = jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(entityLike),
      } as any);

      const dto = await service.findByOrderNumber('PO-000001');

      expect(dto.supplier?.slug).toBe('supplier-a');
      expect(dto.supplier?.companyName).toBe('Supplier A');
    });
  });

  describe('findAll', () => {
    function createFindAllQueryBuilder(orders: PurchaseOrder[] = []) {
      return {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(orders.length),
        getMany: jest.fn().mockResolvedValue(orders),
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
        totalAmount: 100,
        paidAmount: 0,
        status: PurchaseOrderStatus.DRAFT,
        paymentStatus: PurchaseOrderPaymentStatus.UNPAID,
        notes: '',
        supplier: {
          id: 'supplier-1',
          companyName: 'Supplier A',
        },
        items: [],
        vendorPayments: [],
        isFullyReceived: jest.fn().mockReturnValue(false),
        getTotalReceivedQuantity: jest.fn().mockReturnValue(0),
        getTotalOrderedQuantity: jest.fn().mockReturnValue(0),
        ...overrides,
      } as unknown as PurchaseOrder;
    }

    it('adds unpaid paymentStatus filter', async () => {
      const queryBuilder = createFindAllQueryBuilder([
        createFindAllOrder({ paidAmount: 0, totalAmount: 100 }),
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
        createFindAllOrder({ paidAmount: 40, totalAmount: 100 }),
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
        createFindAllOrder({ paidAmount: 100, totalAmount: 100 }),
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
        createFindAllOrder({ paidAmount: 120, totalAmount: 100 }),
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
      amount: 100,
    } as unknown as VendorPayment;

    const mockRestoredPayment = {
      ...mockDeletedPayment,
      deletedAt: null,
      isActive: true,
    } as unknown as VendorPayment;

    const mockPurchaseOrderForPayment = {
      ...mockPurchaseOrder,
      supplierId: 'supplier-1',
      paidAmount: 0,
    } as unknown as PurchaseOrder;

    beforeEach(() => {
      purchaseOrderRepository.findOne.mockResolvedValue(mockPurchaseOrderForPayment);
      purchaseOrderRepository.save.mockResolvedValue(mockPurchaseOrderForPayment);
      vendorPaymentService.findOne.mockResolvedValue(mockRestoredPayment);
      paymentMethodRepository.findOne.mockResolvedValue({ id: 'pm-cash', isActive: true, accountingChannel: 'BANK' });
      vendorPaymentService.findAllByPurchaseOrder.mockResolvedValue([
        { id: 'vp-active', amount: 200 } as unknown as VendorPayment,
      ]);
      const vpFind = jest.fn().mockResolvedValue([]);
      const vpFindOne = jest.fn().mockImplementation((...args) => (vendorPaymentRepository.findOne as any)(...args));
      const vpRestore = jest.fn((...args) => (vendorPaymentRepository.restore as any)(...args));
      const vpUpdate = jest.fn((...args) => (vendorPaymentRepository.update as any)(...args));
      const vpCreate = jest.fn((r) => r);
      const vpSave = jest.fn(async (r) => r);
      const manager = {
        getRepository: jest.fn((entity) => {
          if (entity === PurchaseOrder) return {
            findOne: jest.fn((...args) => (purchaseOrderRepository.findOne as any)(...args)),
            save: jest.fn(async (row) => { await purchaseOrderRepository.save(row); return row; }),
          };
          return { find: vpFind, findOne: vpFindOne, restore: vpRestore, update: vpUpdate, create: vpCreate, save: vpSave };
        }),
      } as unknown as EntityManager;
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb: any) => cb(manager));
    });

    it('derives paidAmount from the persisted active payments, not the in-memory total', async () => {
      vendorPaymentRepository.findOne.mockResolvedValue(null);
      vendorPaymentService.create.mockResolvedValue({ id: 'vp-new' } as VendorPayment);
      // DB reports two active payments (120 + 80 = 200) regardless of the single
      // line passed in — paidAmount must reflect the DB sum.
      vendorPaymentService.findAllByPurchaseOrder.mockResolvedValue([
        { id: 'vp-a', amount: 120 } as unknown as VendorPayment,
        { id: 'vp-b', amount: 80 } as unknown as VendorPayment,
      ]);

      await service.recordOrderPayments('po-1', [{ paymentMethodId: 'pm-cash', amount: 200 }]);

      const saved = purchaseOrderRepository.save.mock.calls.at(-1)?.[0];
      expect(Number(saved.paidAmount)).toBe(200);
    });

    it('threads the acting user into payment creation and accounting', async () => {
      vendorPaymentRepository.findOne.mockResolvedValue(null);
      vendorPaymentService.create.mockResolvedValue({ id: 'vp-new' } as VendorPayment);

      await service.recordOrderPayments(
        'po-1',
        [{ paymentMethodId: 'pm-cash', amount: 200 }],
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

    it('creates a new vendor payment when no previous soft-deleted payment exists', async () => {
      vendorPaymentRepository.findOne.mockResolvedValue(null);
      vendorPaymentService.create.mockResolvedValue({ id: 'vp-new' } as VendorPayment);

      await service.recordOrderPayments('po-1', [{ paymentMethodId: 'pm-cash', amount: 200 }]);

      expect(vendorPaymentService.create).toHaveBeenCalled();
      expect(vendorPaymentRepository.restore).not.toHaveBeenCalled();
    });

    it('restores the previous soft-deleted payment on re-pay', async () => {
      vendorPaymentRepository.findOne
        .mockResolvedValueOnce(mockDeletedPayment)
        .mockResolvedValueOnce(mockRestoredPayment);
      vendorPaymentRepository.restore.mockResolvedValue({} as any);
      vendorPaymentRepository.update.mockResolvedValue({} as any);

      await service.recordOrderPayments('po-1', [{ paymentMethodId: 'pm-cash', amount: 200 }]);

      expect(vendorPaymentRepository.restore).toHaveBeenCalledWith('vp-old-1');
    });

    it('updates payment method and amount when restoring', async () => {
      vendorPaymentRepository.findOne
        .mockResolvedValueOnce(mockDeletedPayment)
        .mockResolvedValueOnce(mockRestoredPayment);
      vendorPaymentRepository.restore.mockResolvedValue({} as any);
      vendorPaymentRepository.update.mockResolvedValue({} as any);

      await service.recordOrderPayments('po-1', [{ paymentMethodId: 'pm-cash', amount: 300 }]);

      expect(vendorPaymentRepository.update).toHaveBeenCalledWith(
        'vp-old-1',
        expect.objectContaining({ paymentMethodId: 'pm-cash', amount: 300, isActive: true }),
      );
    });

    it('rejects payments for a CANCELLED purchase order', async () => {
      purchaseOrderRepository.findOne.mockResolvedValue({
        ...mockPurchaseOrderForPayment,
        status: PurchaseOrderStatus.CANCELLED,
      } as unknown as PurchaseOrder);

      await expect(
        service.recordOrderPayments('po-1', [{ paymentMethodId: 'pm-cash', amount: 200 }]),
      ).rejects.toThrow(/CANCELLED/);
      expect(vendorPaymentService.create).not.toHaveBeenCalled();
    });

    it('rejects payments for a RECEIVED purchase order', async () => {
      purchaseOrderRepository.findOne.mockResolvedValue({
        ...mockPurchaseOrderForPayment,
        status: PurchaseOrderStatus.RECEIVED,
      } as unknown as PurchaseOrder);

      await expect(
        service.recordOrderPayments('po-1', [{ paymentMethodId: 'pm-cash', amount: 200 }]),
      ).rejects.toThrow(/RECEIVED/);
    });

    it('rejects a non-positive payment line amount', async () => {
      vendorPaymentRepository.findOne.mockResolvedValue(null);

      await expect(
        service.recordOrderPayments('po-1', [{ paymentMethodId: 'pm-cash', amount: 0 }]),
      ).rejects.toThrow(/greater than zero/);
    });

    it('keeps an overpaid DRAFT order in DRAFT (does not promote to READY)', async () => {
      purchaseOrderRepository.findOne.mockResolvedValue({
        ...mockPurchaseOrderForPayment,
        totalAmount: 100,
        status: PurchaseOrderStatus.DRAFT,
      } as unknown as PurchaseOrder);
      vendorPaymentRepository.findOne.mockResolvedValue(null);
      vendorPaymentService.create.mockResolvedValue({ id: 'vp-new' } as VendorPayment);
      // Persisted active payments sum to 120 against a 100 total => OVERPAID.
      vendorPaymentService.findAllByPurchaseOrder.mockResolvedValue([
        { id: 'vp-over', amount: 120 } as unknown as VendorPayment,
      ]);

      await service.recordOrderPayments('po-1', [{ paymentMethodId: 'pm-cash', amount: 120 }]);

      const saved = purchaseOrderRepository.save.mock.calls.at(-1)?.[0];
      expect(saved.paymentStatus).toBe(PurchaseOrderPaymentStatus.OVERPAID);
      expect(saved.status).toBe(PurchaseOrderStatus.DRAFT);
    });

    it('reverts a READY order to DRAFT when it becomes overpaid', async () => {
      purchaseOrderRepository.findOne.mockResolvedValue({
        ...mockPurchaseOrderForPayment,
        totalAmount: 100,
        status: PurchaseOrderStatus.READY,
      } as unknown as PurchaseOrder);
      vendorPaymentRepository.findOne.mockResolvedValue(null);
      vendorPaymentService.create.mockResolvedValue({ id: 'vp-new' } as VendorPayment);
      // Already-fully-paid READY order receives an extra payment => 150 vs 100 total => OVERPAID.
      vendorPaymentService.findAllByPurchaseOrder.mockResolvedValue([
        { id: 'vp-a', amount: 100 } as unknown as VendorPayment,
        { id: 'vp-b', amount: 50 } as unknown as VendorPayment,
      ]);

      await service.recordOrderPayments('po-1', [{ paymentMethodId: 'pm-cash', amount: 50 }]);

      const saved = purchaseOrderRepository.save.mock.calls.at(-1)?.[0];
      expect(saved.paymentStatus).toBe(PurchaseOrderPaymentStatus.OVERPAID);
      expect(saved.status).toBe(PurchaseOrderStatus.DRAFT);
    });

    it('promotes a DRAFT order to READY on exact full payment', async () => {
      purchaseOrderRepository.findOne.mockResolvedValue({
        ...mockPurchaseOrderForPayment,
        totalAmount: 100,
        status: PurchaseOrderStatus.DRAFT,
      } as unknown as PurchaseOrder);
      vendorPaymentRepository.findOne.mockResolvedValue(null);
      vendorPaymentService.create.mockResolvedValue({ id: 'vp-new' } as VendorPayment);
      // Persisted active payments sum to exactly 100 => PAID.
      vendorPaymentService.findAllByPurchaseOrder.mockResolvedValue([
        { id: 'vp-exact', amount: 100 } as unknown as VendorPayment,
      ]);

      await service.recordOrderPayments('po-1', [{ paymentMethodId: 'pm-cash', amount: 100 }]);

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
        totalAmount: 100,
        status: PurchaseOrderStatus.DRAFT,
      } as unknown as PurchaseOrder;
      // Active payment set sums to exactly 100 against a 100 total => PAID.
      vendorPaymentService.findAllByPurchaseOrder.mockResolvedValue([
        { id: 'vp-exact', amount: 100 } as unknown as VendorPayment,
      ]);

      await (service as any).reconcilePaymentState(order);

      const saved = purchaseOrderRepository.save.mock.calls.at(-1)?.[0];
      expect(saved.paymentStatus).toBe(PurchaseOrderPaymentStatus.PAID);
      expect(saved.status).toBe(PurchaseOrderStatus.READY);
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

  describe('recordRefunds', () => {
    const lockedPO = {
      id: 'po-1',
      orderNumber: 'PO-001',
      status: 'DRAFT',
      supplierId: 'sup-1',
      totalAmount: '100',
    }
    let generateSpy: jest.Mock;

    beforeEach(() => {
      paymentMethodRepository.findOne.mockResolvedValue({ id: 'pm-1', isActive: true, accountingChannel: 'BANK' })
      generateSpy = jest.fn();
      ;(service as any).settingsService = { generateDocumentNumber: generateSpy }
      vendorPaymentRepository.findOne.mockResolvedValue({
        id: 'refund-1',
        amount: -40,
        supplier: { companyName: 'Acme' },
        paymentMethodEntity: { code: 'CASH' },
      } as any)
      jest.spyOn(service as any, 'findOne').mockResolvedValue({ id: 'po-1' } as any)
    })

    function wireTx(opts: { existing?: any[] } = {}) {
      const { existing } = opts
      const ctx = mockTxManager({ lockedPO, existing: existing ?? [{ id: 'vp-1', amount: '100', paymentMethodId: 'pm-1', status: 'completed', isActive: true }] })
      ;(dataSource.transaction as jest.Mock).mockImplementation(async (cb) => cb(ctx.manager))
      return ctx
    }

    it('inserts a negative VP row (status completed) with paymentMethodId and reference->notes', async () => {
      const ctx = wireTx()
      jest.spyOn(service as any, 'reconcilePaymentState').mockResolvedValue(undefined)

      await service.recordRefunds('po-1', [{ paymentMethodId: 'pm-1', amount: 40, reference: 'damaged goods' }], 'user-1', 'admin')

      expect(ctx.saved).toHaveLength(1)
      expect(ctx.saved[0]).toMatchObject({
        supplierId: 'sup-1',
        purchaseOrderId: 'po-1',
        paymentMethodId: 'pm-1',
        amount: -40,
        status: 'completed',
        notes: 'damaged goods',
      })
      expect(ctx.saved[0].paymentDate).toBeDefined()
      expect(generateSpy).not.toHaveBeenCalled()
    })

    it('rejects total refund exceeding net paid across ACTIVE rows (aggregate guard)', async () => {
      wireTx({ existing: [{ amount: '100', isActive: true }] })
      await expect(
        service.recordRefunds('po-1', [{ paymentMethodId: 'pm-1', amount: 150 }], 'u'),
      ).rejects.toThrow(/exceeds net paid/i)
    })

    it('computes netPaid from ACTIVE rows only (guard query filters isActive: true)', async () => {
      const ctx = wireTx()
      jest.spyOn(service as any, 'reconcilePaymentState').mockResolvedValue(undefined)

      await service.recordRefunds('po-1', [{ paymentMethodId: 'pm-1', amount: 40 }], 'u')

      expect(ctx.vpRepo.find).toHaveBeenCalledWith({
        where: { purchaseOrderId: 'po-1', isActive: true },
      })
    })

    it('reconciles payment state INSIDE the transaction with the manager', async () => {
      wireTx()
      const reconcileSpy = jest.spyOn(service as any, 'reconcilePaymentState').mockResolvedValue(undefined)

      await service.recordRefunds('po-1', [{ paymentMethodId: 'pm-1', amount: 40 }], 'u')

      expect(reconcileSpy).toHaveBeenCalledWith(lockedPO, expect.anything())
    })

    it('audit-logs each refund row with its id and paymentMethodId', async () => {
      wireTx()
      jest.spyOn(service as any, 'reconcilePaymentState').mockResolvedValue(undefined)

      await service.recordRefunds('po-1', [{ paymentMethodId: 'pm-1', amount: 40 }], 'u')

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
      ;(dataSource.transaction as jest.Mock).mockImplementation(async (cb) => cb(ctx.manager))
      await expect(
        service.recordRefunds('po-1', [{ paymentMethodId: 'pm-1', amount: 10 }], 'u'),
      ).rejects.toThrow('Cannot refund a RECEIVED purchase order.')
    })

    it('rejects refund on a CANCELLED purchase order', async () => {
      const ctx = mockTxManager({ lockedPO: { ...lockedPO, status: 'CANCELLED' } })
      ;(dataSource.transaction as jest.Mock).mockImplementation(async (cb) => cb(ctx.manager))
      await expect(
        service.recordRefunds('po-1', [{ paymentMethodId: 'pm-1', amount: 10 }], 'u'),
      ).rejects.toThrow('Cannot refund a CANCELLED purchase order.')
    })

    it('rejects a non-positive amount', async () => {
      await expect(
        service.recordRefunds('po-1', [{ paymentMethodId: 'pm-1', amount: 0 }], 'u'),
      ).rejects.toThrow('greater than zero')
    })

    it('rejects an inactive / unknown payment method', async () => {
      paymentMethodRepository.findOne.mockResolvedValue(null)
      await expect(
        service.recordRefunds('po-1', [{ paymentMethodId: 'bad', amount: 10 }], 'u'),
      ).rejects.toThrow(/not found or inactive/i)
    })
  })
});
