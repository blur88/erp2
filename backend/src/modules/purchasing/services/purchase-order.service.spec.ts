import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
      companyName: 'Supplier A',
    },
  } as unknown as PurchaseOrder;

  const mockReturnDto = {
    id: 'po-1',
    orderNumber: 'PO-000001',
  } as any;

  beforeEach(async () => {
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
      );
    });
  });
});
