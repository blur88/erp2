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
} from '../../../database/entities';
import { UserRole } from '../../../database/entities/user.entity';
import { SupplierService } from './supplier.service';

import { VendorPaymentService } from './vendor-payment.service';
import { BaseCostCalculatorService } from '../../inventory/services/base-cost-calculator.service';
import { StockMovementService } from '../../inventory/services/stock-movement.service';
import { SettingsService } from '../../settings/settings.service';
import { AuditLogService } from '../../audit-logs/services';
import { AccountingService } from '../../accounting/services/accounting.service';
import { PurchaseOrderLifecycleService } from './purchase-order-lifecycle.service';

describe('PurchaseOrderService', () => {
  let module: TestingModule;
  let service: PurchaseOrderService;
  let purchaseOrderRepository: jest.Mocked<Repository<PurchaseOrder>>;
  let purchaseOrderItemRepository: jest.Mocked<Repository<PurchaseOrderItem>>;
  let productRepository: jest.Mocked<Repository<Product>>;
  let vendorPaymentRepository: jest.Mocked<Repository<VendorPayment>>;
  let auditLogService: jest.Mocked<AuditLogService>;
  let accountingService: jest.Mocked<AccountingService>;
  let stockMovementService: jest.Mocked<StockMovementService>;
  let vendorPaymentService: jest.Mocked<VendorPaymentService>;
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

  // Builds a fake EntityManager whose VendorPayment repo is controllable.
  function mockTxManager(opts) {
    const saved = []
    const vpRepo = {
      findOne: jest.fn().mockResolvedValue(opts.original),
      // atomic conditional flip: UPDATE ... WHERE id AND status='completed'
      update: jest.fn().mockResolvedValue({ affected: opts.conditionalUpdateAffected ?? 1 }),
      create: jest.fn((row) => row),
      save: jest.fn(async (row) => {
        const persisted = { id: 'refund-row', ...row }
        saved.push(persisted)
        return persisted
      }),
    }
    const manager = {
      getRepository: jest.fn().mockReturnValue(vpRepo),
    }
    return { manager, vpRepo, saved }
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
          provide: AccountingService,
          useValue: {
            postPurchaseReceiptEntry: jest.fn(),
            reverseSourceEntries: jest.fn(),
            postVendorPaymentEntry: jest.fn(),
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
      ],
    }).compile();

    service = module.get<PurchaseOrderService>(PurchaseOrderService);
    purchaseOrderRepository = module.get(getRepositoryToken(PurchaseOrder));
    purchaseOrderItemRepository = module.get(getRepositoryToken(PurchaseOrderItem));
    productRepository = module.get(getRepositoryToken(Product));
    vendorPaymentRepository = module.get(getRepositoryToken(VendorPayment));
    auditLogService = module.get(AuditLogService);
    accountingService = module.get(AccountingService);
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
  });


  describe('recordOrderPayments', () => {
    const mockDeletedPayment = {
      id: 'vp-old-1',
      paymentNumber: 'VP-000001',
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
      accountingService.postVendorPaymentEntry.mockResolvedValue(undefined);
      // reconcilePaymentState() reads the persisted active payments to recompute
      // paidAmount; default to a single 200 payment for these cases.
      vendorPaymentService.findAllByPurchaseOrder.mockResolvedValue([
        { id: 'vp-active', amount: 200 } as unknown as VendorPayment,
      ]);
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

    it('re-posts accounting entry after restoring', async () => {
      vendorPaymentRepository.findOne
        .mockResolvedValueOnce(mockDeletedPayment)
        .mockResolvedValueOnce(mockRestoredPayment);
      vendorPaymentRepository.restore.mockResolvedValue({} as any);
      vendorPaymentRepository.update.mockResolvedValue({} as any);

      await service.recordOrderPayments('po-1', [{ paymentMethodId: 'pm-cash', amount: 200 }]);

      expect(accountingService.postVendorPaymentEntry).toHaveBeenCalledWith(
        mockRestoredPayment,
        'system',
        undefined,
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
      // Active payment set now sums to exactly 100 (down from a prior overpaid sum).
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
    const draftPaidPO = {
      id: 'po-1',
      orderNumber: 'PO-001',
      status: 'READY',
      supplierId: 'sup-1',
      totalAmount: '0',
    }

    it('inserts a negative refunded row via the manager repo (NOT VendorPaymentService.create) and reverses the original GL', async () => {
      purchaseOrderRepository.findOne.mockResolvedValueOnce(draftPaidPO as any)
      const original = {
        id: 'vp-1',
        purchaseOrderId: 'po-1',
        supplierId: 'sup-1',
        paymentMethodId: 'pm-1',
        amount: '100',
        status: 'completed',
      }
      const { manager, saved } = mockTxManager({ original })
      ;(dataSource.transaction as jest.Mock).mockImplementation(async (cb) => cb(manager))
      ;(service as any).settingsService.generateDocumentNumber = jest.fn().mockResolvedValue('VP-REF-1')
      jest.spyOn(service as any, 'reconcilePaymentState').mockResolvedValue(undefined)

      await service.recordRefunds(
        'po-1',
        [{ vendorPaymentId: 'vp-1', amount: 100, reason: 'overpaid' }],
        'user-1',
        'admin',
      )

      // Negative row persisted with all non-null columns + refunded status.
      expect(saved).toHaveLength(1)
      expect(saved[0]).toMatchObject({
        supplierId: 'sup-1',
        purchaseOrderId: 'po-1',
        paymentMethodId: 'pm-1',
        paymentNumber: 'VP-REF-1',
        amount: -100,
        status: 'refunded',
        notes: 'overpaid',
      })
      expect(saved[0].paymentDate).toBeDefined()

      // Refund row NOT routed through the auto-posting service.create (would double-post GL).
      expect(vendorPaymentService.create).not.toHaveBeenCalled()
      // Original entry reversed (not the refund row).
      expect(accountingService.reverseSourceEntries).toHaveBeenCalledWith(
        'vendor_payment',
        'vp-1',
        'user-1',
      )
      // postVendorPaymentEntry never called for the refund row.
      expect(accountingService.postVendorPaymentEntry).not.toHaveBeenCalled()
    })

    it('rejects refund on a RECEIVED purchase order', async () => {
      purchaseOrderRepository.findOne.mockResolvedValueOnce({ ...draftPaidPO, status: 'RECEIVED' } as any)
      await expect(
        service.recordRefunds('po-1', [{ vendorPaymentId: 'vp-1', amount: 10 }], 'u'),
      ).rejects.toThrow('Cannot refund a RECEIVED purchase order.')
    })

    it('rejects refund on a CANCELLED purchase order', async () => {
      purchaseOrderRepository.findOne.mockResolvedValueOnce({ ...draftPaidPO, status: 'CANCELLED' } as any)
      await expect(
        service.recordRefunds('po-1', [{ vendorPaymentId: 'vp-1', amount: 10 }], 'u'),
      ).rejects.toThrow('Cannot refund a CANCELLED purchase order.')
    })

    it('rejects a non-positive amount', async () => {
      purchaseOrderRepository.findOne.mockResolvedValueOnce(draftPaidPO as any)
      await expect(
        service.recordRefunds('po-1', [{ vendorPaymentId: 'vp-1', amount: 0 }], 'u'),
      ).rejects.toThrow('greater than zero')
    })

    it('rejects re-refunding an already-refunded original (conditional update affected 0)', async () => {
      purchaseOrderRepository.findOne.mockResolvedValueOnce(draftPaidPO as any)
      const { manager } = mockTxManager({ original: { id: 'vp-1' }, conditionalUpdateAffected: 0 })
      ;(dataSource.transaction as jest.Mock).mockImplementation(async (cb) => cb(manager))
      await expect(
        service.recordRefunds('po-1', [{ vendorPaymentId: 'vp-1', amount: 10 }], 'u'),
      ).rejects.toThrow('not refundable')
    })

    it('rejects a refund amount greater than the original payment', async () => {
      purchaseOrderRepository.findOne.mockResolvedValueOnce(draftPaidPO as any)
      const original = { id: 'vp-1', purchaseOrderId: 'po-1', supplierId: 'sup-1', amount: '50', status: 'completed' }
      const { manager } = mockTxManager({ original })
      ;(dataSource.transaction as jest.Mock).mockImplementation(async (cb) => cb(manager))
      ;(service as any).settingsService.generateDocumentNumber = jest.fn().mockResolvedValue('VP-REF-1')
      await expect(
        service.recordRefunds('po-1', [{ vendorPaymentId: 'vp-1', amount: 100 }], 'u'),
      ).rejects.toThrow('exceeds original payment amount')
    })
  })
});
