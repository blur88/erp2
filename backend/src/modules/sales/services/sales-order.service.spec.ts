import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SalesOrderService } from './sales-order.service';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { SalesOrderItem } from '../../../database/entities/sales-order-item.entity';
import { Customer } from '../../../database/entities/customer.entity';
import { Product } from '../../../database/entities/product.entity';
import { Invoice } from '../../../database/entities/invoice.entity';
import { InvoiceItem } from '../../../database/entities/invoice-item.entity';
import { User, UserRole } from '../../../database/entities/user.entity';
import { PriceListItem } from '../../../database/entities/price-list-item.entity';
import { Payment } from '../../../database/entities/payment.entity';
import { InventoryIntegrationService } from './inventory-integration.service';
import { StockMovementService } from '../../../modules/inventory/services/stock-movement.service';
import { BaseCostCalculatorService } from '../../inventory/services/base-cost-calculator.service';
import { SettingsService } from '../../settings/settings.service';
import { AuditLogService } from '../../audit-logs/services';
import { AccountingService } from '../../accounting/services/accounting.service';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { SalesOrderFulfillmentService } from './sales-order-fulfillment.service';
import { SalesOrderLifecycleService } from './sales-order-lifecycle.service';
import { SalesOrderPaymentService } from './sales-order-payment.service';
import { SalesOrderQueryService } from './sales-order-query.service';
import { CustomerService } from './customer.service';

describe('SalesOrderService', () => {
  let module: TestingModule;
  let service: SalesOrderService;
  let salesOrderRepository: jest.Mocked<Repository<SalesOrder>>;
  let accountingService: jest.Mocked<AccountingService>;
  let inventoryIntegrationService: jest.Mocked<InventoryIntegrationService>;
  let stockMovementService: jest.Mocked<StockMovementService>;
  let baseCostCalculator: jest.Mocked<BaseCostCalculatorService>;
  let settingsService: jest.Mocked<SettingsService>;
  let auditLogService: jest.Mocked<AuditLogService>;
  let dataSource: jest.Mocked<DataSource>;
  let salesOrderFulfillmentService: jest.Mocked<SalesOrderFulfillmentService>;
  let salesOrderLifecycleService: jest.Mocked<SalesOrderLifecycleService>;
  let salesOrderQueryService: jest.Mocked<SalesOrderQueryService>;
  const adminUser = { role: UserRole.ADMIN } as any;

  const createMockSalesOrder = (): Partial<SalesOrder> => ({
    id: '123e4567-e89b-12d3-a456-426614174000',
    orderNumber: 'SO-000001',
    isFulfilled: false,
    isPaidInFull: true,
    balanceDue: 0,
    paidAmount: 1000,
    totalAmount: 1000,
    fulfilledDate: null,
    items: [
      {
        id: 'item-1',
        productId: 'product-1',
        quantity: 10,
        product: {
          id: 'product-1',
          name: 'Test Product',
          baseCost: 50,
        } as Product,
      } as SalesOrderItem,
    ],
    customer: {
      id: 'customer-1',
      name: 'Test Customer',
    } as Customer,
  });

  beforeEach(async () => {
    dataSource = {
      transaction: jest.fn(),
    } as any;

    module = await Test.createTestingModule({
      providers: [
        SalesOrderService,
        SalesOrderFulfillmentService,
        SalesOrderLifecycleService,
        SalesOrderPaymentService,
        SalesOrderQueryService,
        {
          provide: getRepositoryToken(SalesOrder),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(SalesOrderItem),
          useValue: {
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Customer),
          useValue: {},
        },
        {
          provide: getRepositoryToken(Product),
          useValue: {},
        },
        {
          provide: getRepositoryToken(Invoice),
          useValue: {},
        },
        {
          provide: getRepositoryToken(InvoiceItem),
          useValue: {},
        },
        {
          provide: getRepositoryToken(User),
          useValue: {},
        },
        {
          provide: getRepositoryToken(PriceListItem),
          useValue: {},
        },
        {
          provide: getRepositoryToken(Payment),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: getDataSourceToken(),
          useValue: dataSource,
        },
        {
          provide: InventoryIntegrationService,
          useValue: {
            adjustStock: jest.fn(),
          },
        },
        {
          provide: StockMovementService,
          useValue: {
            deleteByReference: jest.fn(),
          },
        },
        {
          provide: BaseCostCalculatorService,
          useValue: {
            restoreStock: jest.fn(),
          },
        },
        {
          provide: SettingsService,
          useValue: {
            generateDocumentNumber: jest.fn(),
          },
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
            postSalesOrderEntry: jest.fn(),
            postCustomerPaymentEntry: jest.fn(),
            reverseSourceEntries: jest.fn(),
          },
        },
        {
          provide: CustomerService,
          useValue: { updateCustomerMetrics: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<SalesOrderService>(SalesOrderService);
    salesOrderRepository = module.get(getRepositoryToken(SalesOrder));
    accountingService = module.get(AccountingService);
    inventoryIntegrationService = module.get(InventoryIntegrationService);
    stockMovementService = module.get(StockMovementService);
    baseCostCalculator = module.get(BaseCostCalculatorService);
    settingsService = module.get(SettingsService);
    auditLogService = module.get(AuditLogService);
    salesOrderFulfillmentService = module.get(SalesOrderFulfillmentService);
    salesOrderLifecycleService = module.get(SalesOrderLifecycleService);
    salesOrderQueryService = module.get(SalesOrderQueryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('searchGlobal', () => {
    function mockSOQuery(order: {
      id: string;
      orderNumber: string;
      customer: { name: string };
    }) {
      salesOrderRepository.createQueryBuilder = jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([order]),
      } as any);
    }

    it('returns matching sales orders as GlobalSearchResultDto', async () => {
      const order = {
        id: 'so-uuid-1',
        orderNumber: 'SO-000001',
        customer: { name: 'ABC Trading' },
        deletedAt: null,
      };
      salesOrderRepository.createQueryBuilder = jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([order]),
      } as any);

      const results = await service.searchGlobal('SO-000001', {
        role: UserRole.SALES_STAFF,
      } as any);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        type: 'transaction',
        id: 'so-uuid-1',
        label: 'SO-000001',
        description: 'ABC Trading',
        route: '/sales/orders/so-uuid-1/edit',
      });
    });

    it('exact orderNumber match scores SCORE_EXACT_CODE + BOOST_TRANSACTION + BOOST_EXACT_MATCH', async () => {
      mockSOQuery({
        id: 'so1',
        orderNumber: 'SO-001',
        customer: { name: 'Acme' },
      });

      const results = await service.searchGlobal('SO-001', adminUser);

      expect(results[0].score).toBe(150);
    });

    it('orderNumber startsWith scores SCORE_STARTSWITH_CODE + BOOST_TRANSACTION', async () => {
      mockSOQuery({
        id: 'so1',
        orderNumber: 'SO-001',
        customer: { name: 'Acme' },
      });

      const results = await service.searchGlobal('SO-', adminUser);

      expect(results[0].score).toBe(110);
    });

    it('contains match scores SCORE_CONTAINS + BOOST_TRANSACTION', async () => {
      mockSOQuery({
        id: 'so1',
        orderNumber: 'SO-001',
        customer: { name: 'Acme Corp' },
      });

      const results = await service.searchGlobal('Acme', adminUser);

      expect(results[0].score).toBe(70);
    });
  });

  describe('fulfillOrder', () => {
    it('should post accounting entry successfully', async () => {
      // Arrange
      const mockSalesOrder = createMockSalesOrder();
      const orderId = mockSalesOrder.id;
      const savedOrder = { ...mockSalesOrder, isFulfilled: true, fulfilledDate: new Date() };

      // Mock the query builder for findById
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(savedOrder),
      };

      salesOrderRepository.findOne.mockResolvedValue(mockSalesOrder as SalesOrder);
      salesOrderRepository.save.mockResolvedValue(savedOrder as SalesOrder);
      salesOrderRepository.createQueryBuilder = jest.fn().mockReturnValue(mockQueryBuilder);

      inventoryIntegrationService.adjustStock.mockResolvedValue(undefined);
      auditLogService.log.mockResolvedValue(undefined);
      accountingService.postSalesOrderEntry.mockResolvedValue({
        id: 'journal-1',
        entryNumber: 'JE-000001',
      } as any);

      // Act
      const result = await service.fulfillOrder(orderId);

      // Assert
      expect(accountingService.postSalesOrderEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          id: orderId,
          orderNumber: mockSalesOrder.orderNumber,
        }),
        'system',
        undefined,
      );
      expect(result).toBeDefined();
      expect(salesOrderRepository.save).toHaveBeenCalled();
    });

    it('should continue fulfillment when accounting post fails', async () => {
      // Arrange
      const mockSalesOrder = createMockSalesOrder();
      const orderId = mockSalesOrder.id;
      const savedOrder = { ...mockSalesOrder, isFulfilled: true, fulfilledDate: new Date() };

      // Mock the query builder for findById
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(savedOrder),
      };

      salesOrderRepository.findOne.mockResolvedValue(mockSalesOrder as SalesOrder);
      salesOrderRepository.save.mockResolvedValue(savedOrder as SalesOrder);
      salesOrderRepository.createQueryBuilder = jest.fn().mockReturnValue(mockQueryBuilder);

      inventoryIntegrationService.adjustStock.mockResolvedValue(undefined);
      auditLogService.log.mockResolvedValue(undefined);
      accountingService.postSalesOrderEntry.mockRejectedValue(
        new Error('Account mappings not configured'),
      );

      // Act
      const result = await service.fulfillOrder(orderId);

      // Assert
      expect(accountingService.postSalesOrderEntry).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(salesOrderRepository.save).toHaveBeenCalled();
      // Should not throw error despite accounting failure
    });

    it('should load order with relations before posting to accounting', async () => {
      // Arrange
      const mockSalesOrder = createMockSalesOrder();
      const orderId = mockSalesOrder.id;
      const savedOrder = { ...mockSalesOrder, isFulfilled: true, fulfilledDate: new Date() };

      // Mock the query builder for findById
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(savedOrder),
      };

      salesOrderRepository.findOne.mockResolvedValue(mockSalesOrder as SalesOrder);
      salesOrderRepository.save.mockResolvedValue(savedOrder as SalesOrder);
      salesOrderRepository.createQueryBuilder = jest.fn().mockReturnValue(mockQueryBuilder);

      inventoryIntegrationService.adjustStock.mockResolvedValue(undefined);
      auditLogService.log.mockResolvedValue(undefined);
      accountingService.postSalesOrderEntry.mockResolvedValue({
        id: 'journal-1',
      } as any);

      // Act
      await service.fulfillOrder(orderId);

      // Assert
      // Verify findOne was called for the initial load with relations
      expect(salesOrderRepository.findOne).toHaveBeenCalledWith({
        where: { id: orderId },
        relations: { customer: true, items: { product: true } },
      });

      // Verify the accounting service received the order with customer and items
      const callArg = accountingService.postSalesOrderEntry.mock.calls[0][0];
      expect(callArg).toHaveProperty('customer');
      expect(callArg).toHaveProperty('items');
      expect(callArg.items).toHaveLength(1);
      expect(callArg.items[0]).toHaveProperty('product');
    });

    it('should throw error when order not found', async () => {
      // Arrange
      salesOrderRepository.findOne.mockResolvedValue(null);

      // Act & Assert
      await expect(service.fulfillOrder('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw error when order is already fulfilled', async () => {
      // Arrange
      const mockSalesOrder = createMockSalesOrder();
      const fulfilledOrder = { ...mockSalesOrder, isFulfilled: true };
      salesOrderRepository.findOne.mockResolvedValue(fulfilledOrder as SalesOrder);

      // Act & Assert
      await expect(service.fulfillOrder(mockSalesOrder.id)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw error when order is not paid in full', async () => {
      // Arrange
      const mockSalesOrder = createMockSalesOrder();
      const unpaidOrder = { ...mockSalesOrder, isPaidInFull: false, balanceDue: 500 };
      salesOrderRepository.findOne.mockResolvedValue(unpaidOrder as SalesOrder);

      // Act & Assert
      await expect(service.fulfillOrder(mockSalesOrder.id)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('unpayOrder', () => {
    it('should call reverseSourceEntries for each payment when unpaying', async () => {
      const mockOrder = { id: 'so-123', orderNumber: 'SO-000026', isFulfilled: false, paidAmount: 500 };
      const mockInvoice = {
        id: 'inv-123',
        salesOrderId: 'so-123',
        paidAmount: 500,
        calculateTotals: jest.fn(),
        updateStatus: jest.fn(),
      };
      const mockPayments = [
        { id: 'pay-1', paymentNumber: 'PAY-001', amount: 300, status: 'COMPLETED' },
        { id: 'pay-2', paymentNumber: 'PAY-002', amount: 200, status: 'COMPLETED' },
      ];

      const paymentRepository = {
        find: jest.fn().mockResolvedValue(mockPayments),
        softDelete: jest.fn().mockResolvedValue({}),
      };
      const invoiceRepository = {
        findOne: jest.fn().mockResolvedValue(mockInvoice),
        save: jest.fn().mockResolvedValue(mockInvoice),
      };

      (salesOrderRepository as any).manager = {
        getRepository: jest.fn()
          .mockReturnValueOnce(paymentRepository)
          .mockReturnValueOnce(invoiceRepository),
      };

      salesOrderRepository.findOne.mockResolvedValue(mockOrder as any);
      salesOrderRepository.save.mockResolvedValue({ ...mockOrder, paidAmount: 0 } as any);
      jest.spyOn(service, 'findById').mockResolvedValue({ id: 'so-123' } as any);
      auditLogService.log.mockResolvedValue(undefined);
      accountingService.reverseSourceEntries.mockResolvedValue(undefined);

      await service.unpayOrder('so-123');

      expect(accountingService.reverseSourceEntries).toHaveBeenCalledTimes(2);
      expect(accountingService.reverseSourceEntries).toHaveBeenCalledWith('payment', 'pay-1', 'system');
      expect(accountingService.reverseSourceEntries).toHaveBeenCalledWith('payment', 'pay-2', 'system');
      expect(paymentRepository.softDelete).toHaveBeenCalledWith(['pay-1', 'pay-2']);
    });

    it('should still succeed if accounting reversal fails', async () => {
      const mockOrder = { id: 'so-123', orderNumber: 'SO-000026', isFulfilled: false, paidAmount: 500 };
      const mockInvoice = {
        id: 'inv-123',
        salesOrderId: 'so-123',
        paidAmount: 500,
        calculateTotals: jest.fn(),
        updateStatus: jest.fn(),
      };
      const mockPayments = [
        { id: 'pay-1', paymentNumber: 'PAY-001', amount: 300, status: 'COMPLETED' },
      ];

      const paymentRepository = {
        find: jest.fn().mockResolvedValue(mockPayments),
        softDelete: jest.fn().mockResolvedValue({}),
      };
      const invoiceRepository = {
        findOne: jest.fn().mockResolvedValue(mockInvoice),
        save: jest.fn().mockResolvedValue(mockInvoice),
      };

      (salesOrderRepository as any).manager = {
        getRepository: jest.fn()
          .mockReturnValueOnce(paymentRepository)
          .mockReturnValueOnce(invoiceRepository),
      };

      salesOrderRepository.findOne.mockResolvedValue(mockOrder as any);
      salesOrderRepository.save.mockResolvedValue({ ...mockOrder, paidAmount: 0 } as any);
      jest.spyOn(service, 'findById').mockResolvedValue({ id: 'so-123' } as any);
      auditLogService.log.mockResolvedValue(undefined);
      accountingService.reverseSourceEntries.mockRejectedValue(new Error('No open period'));

      await expect(service.unpayOrder('so-123')).resolves.toBeDefined();
      expect(paymentRepository.softDelete).toHaveBeenCalled();
    });
  });

  describe('recordPayments - upsert on re-pay', () => {
    it('should restore soft-deleted payment instead of creating a new one', async () => {
      const invoiceId = 'invoice-uuid-1';
      const softDeletedPaymentId = 'payment-uuid-1';
      const existingPaymentNumber = 'PAY-000001';

      const mockOrder = {
        id: 'order-uuid-1',
        orderNumber: 'SO-000001',
        customerId: 'customer-uuid-1',
        paidAmount: 0,
        isFulfilled: false,
      };
      const mockInvoice = {
        id: invoiceId,
        salesOrderId: mockOrder.id,
        invoiceNumber: 'INV-000001',
        paidAmount: 0,
        calculateTotals: jest.fn(),
        updateStatus: jest.fn(),
      };
      const mockPaymentMethod = { id: 'pm-uuid-1', requiresSettlement: false, isActive: true };
      const softDeletedPayment = {
        id: softDeletedPaymentId,
        paymentNumber: existingPaymentNumber,
        deletedAt: new Date('2026-01-01'),
        amount: 100,
        paymentMethodId: 'pm-uuid-old',
        settlementStatus: 'NOT_APPLICABLE',
      };

      const paymentRepo = {
        find: jest.fn().mockResolvedValue([softDeletedPayment]),
        findOne: jest.fn().mockResolvedValue({ ...softDeletedPayment, deletedAt: null, isActive: true }),
        create: jest.fn().mockReturnValue({ id: 'new-payment-id' }),
        save: jest.fn().mockResolvedValue({ ...softDeletedPayment, amount: 150 }),
        restore: jest.fn().mockResolvedValue(undefined),
      };
      const invoiceRepo = {
        findOne: jest.fn().mockResolvedValue(mockInvoice),
        save: jest.fn().mockResolvedValue(mockInvoice),
      };
      const paymentMethodRepo = {
        findOne: jest.fn().mockResolvedValue(mockPaymentMethod),
      };
      const orderRepo = {
        update: jest.fn().mockResolvedValue(undefined),
      };

      dataSource.transaction = jest.fn().mockImplementation(async (cb) =>
        cb({
          getRepository: jest.fn((entity) => {
            if (entity?.name === 'Payment') return paymentRepo;
            if (entity?.name === 'Invoice') return invoiceRepo;
            if (entity?.name === 'PaymentMethodEntity') return paymentMethodRepo;
            if (entity?.name === 'SalesOrder') return orderRepo;
            return {};
          }),
        } as any),
      ) as any;

      salesOrderRepository.findOne.mockResolvedValue(mockOrder as any);
      settingsService.generateDocumentNumber.mockResolvedValue('PAY-000002');
      accountingService.postCustomerPaymentEntry.mockResolvedValue({ id: 'je-1' } as any);
      auditLogService.log.mockResolvedValue(undefined);
      jest.spyOn(service, 'findById').mockResolvedValue({ id: mockOrder.id } as any);

      await service.recordPayments(mockOrder.id, [{ paymentMethodId: 'pm-uuid-1', amount: 150 }]);

      expect(paymentRepo.restore).toHaveBeenCalledWith(softDeletedPaymentId);
      expect(paymentRepo.create).not.toHaveBeenCalled();
    });

    it('should create a new payment when no soft-deleted payments exist', async () => {
      const mockOrder = {
        id: 'order-uuid-1',
        orderNumber: 'SO-000001',
        customerId: 'customer-uuid-1',
        paidAmount: 0,
        isFulfilled: false,
      };
      const mockInvoice = {
        id: 'invoice-uuid-1',
        salesOrderId: mockOrder.id,
        invoiceNumber: 'INV-000001',
        paidAmount: 0,
        calculateTotals: jest.fn(),
        updateStatus: jest.fn(),
      };
      const mockPaymentMethod = { id: 'pm-uuid-1', requiresSettlement: false, isActive: true };

      const paymentRepo = {
        find: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValue({ id: 'new-payment' }),
        create: jest.fn().mockReturnValue({ id: 'new-payment', paymentNumber: 'PAY-000002' }),
        save: jest.fn().mockResolvedValue({ id: 'new-payment', paymentNumber: 'PAY-000002' }),
        restore: jest.fn().mockResolvedValue(undefined),
      };
      const invoiceRepo = {
        findOne: jest.fn().mockResolvedValue(mockInvoice),
        save: jest.fn().mockResolvedValue(mockInvoice),
      };
      const paymentMethodRepo = {
        findOne: jest.fn().mockResolvedValue(mockPaymentMethod),
      };
      const orderRepo = {
        update: jest.fn().mockResolvedValue(undefined),
      };

      dataSource.transaction = jest.fn().mockImplementation(async (cb) =>
        cb({
          getRepository: jest.fn((entity) => {
            if (entity?.name === 'Payment') return paymentRepo;
            if (entity?.name === 'Invoice') return invoiceRepo;
            if (entity?.name === 'PaymentMethodEntity') return paymentMethodRepo;
            if (entity?.name === 'SalesOrder') return orderRepo;
            return {};
          }),
        } as any),
      ) as any;

      salesOrderRepository.findOne.mockResolvedValue(mockOrder as any);
      settingsService.generateDocumentNumber.mockResolvedValue('PAY-000002');
      accountingService.postCustomerPaymentEntry.mockResolvedValue({ id: 'je-1' } as any);
      auditLogService.log.mockResolvedValue(undefined);
      jest.spyOn(service, 'findById').mockResolvedValue({ id: mockOrder.id } as any);

      await service.recordPayments(mockOrder.id, [{ paymentMethodId: 'pm-uuid-1', amount: 150 }]);

      expect(paymentRepo.create).toHaveBeenCalled();
      expect(paymentRepo.restore).not.toHaveBeenCalled();
    });
  });

  describe('unfulfillOrder', () => {
    it('calls updateCustomerMetrics with the order customerId after unfulfillment', async () => {
      const mockOrder = { id: 'o1', customerId: 'c1' } as SalesOrder;
      salesOrderFulfillmentService.unfulfillOrder = jest.fn().mockResolvedValue(mockOrder);
      salesOrderQueryService.findById = jest.fn().mockResolvedValue({ id: 'o1' } as any);
      const customerService = module.get(CustomerService);

      await service.unfulfillOrder('o1');

      expect(customerService.updateCustomerMetrics).toHaveBeenCalledWith('c1');
    });

    it('should call reverseSourceEntries with sales_order sourceType when unfulfilling', async () => {
      const mockOrder = {
        id: 'so-123',
        orderNumber: 'SO-000026',
        isFulfilled: true,
        items: [{ productId: 'prod-1', quantity: 5, product: { id: 'prod-1' } }],
      };

      salesOrderRepository.findOne.mockResolvedValue(mockOrder as any);
      salesOrderRepository.save.mockResolvedValue({ ...mockOrder, isFulfilled: false } as any);
      jest.spyOn(service, 'findById').mockResolvedValue({ id: 'so-123' } as any);
      baseCostCalculator.restoreStock.mockResolvedValue(undefined);
      stockMovementService.deleteByReference.mockResolvedValue({ deletedCount: 1 } as any);
      auditLogService.log.mockResolvedValue(undefined);
      accountingService.reverseSourceEntries.mockResolvedValue(undefined);

      await service.unfulfillOrder('so-123');

      expect(accountingService.reverseSourceEntries).toHaveBeenCalledWith(
        'sales_order',
        'so-123',
        'system',
      );
    });

    it('should still succeed if accounting reversal fails', async () => {
      const mockOrder = {
        id: 'so-123',
        orderNumber: 'SO-000026',
        isFulfilled: true,
        items: [{ productId: 'prod-1', quantity: 5, product: { id: 'prod-1' } }],
      };

      salesOrderRepository.findOne.mockResolvedValue(mockOrder as any);
      salesOrderRepository.save.mockResolvedValue({ ...mockOrder, isFulfilled: false } as any);
      jest.spyOn(service, 'findById').mockResolvedValue({ id: 'so-123' } as any);
      baseCostCalculator.restoreStock.mockResolvedValue(undefined);
      stockMovementService.deleteByReference.mockResolvedValue({ deletedCount: 1 } as any);
      auditLogService.log.mockResolvedValue(undefined);
      accountingService.reverseSourceEntries.mockRejectedValue(new Error('No open period'));

      await expect(service.unfulfillOrder('so-123')).resolves.toBeDefined();
    });
  });

  describe('fulfillOrder calls updateCustomerMetrics', () => {
    it('calls updateCustomerMetrics with the order customerId after fulfillment', async () => {
      const mockOrder = { id: 'o1', customerId: 'c1' } as SalesOrder;
      salesOrderFulfillmentService.fulfillOrder = jest.fn().mockResolvedValue(mockOrder);
      salesOrderQueryService.findById = jest.fn().mockResolvedValue({ id: 'o1' } as any);
      const customerService = module.get(CustomerService);

      await service.fulfillOrder('o1', 'user1', 'user1');

      expect(customerService.updateCustomerMetrics).toHaveBeenCalledWith('c1');
    });
  });

  describe('delete calls updateCustomerMetrics', () => {
    it('calls updateCustomerMetrics with the order customerId after delete', async () => {
      salesOrderRepository.findOne.mockResolvedValue({ id: 'o1', customerId: 'c1' } as SalesOrder);
      salesOrderLifecycleService.delete = jest.fn().mockResolvedValue({
        deletedOrderNumber: 'SO-000001',
        previousOrder: null,
      });
      const customerService = module.get(CustomerService);

      await service.delete('o1');

      expect(customerService.updateCustomerMetrics).toHaveBeenCalledWith('c1');
    });
  });

  describe('restore calls updateCustomerMetrics', () => {
    it('calls updateCustomerMetrics with the order customerId after restore', async () => {
      salesOrderLifecycleService.restore = jest.fn().mockResolvedValue({
        id: 'o1',
        customerId: 'c1',
      } as SalesOrder);
      const customerService = module.get(CustomerService);

      await service.restore('o1');

      expect(customerService.updateCustomerMetrics).toHaveBeenCalledWith('c1');
    });
  });

  describe('permanentDelete calls updateCustomerMetrics', () => {
    it('calls updateCustomerMetrics with the order customerId after permanent delete', async () => {
      salesOrderRepository.findOne.mockResolvedValue({ id: 'o1', customerId: 'c1' } as SalesOrder);
      salesOrderLifecycleService.permanentDelete = jest.fn().mockResolvedValue(undefined);
      const customerService = module.get(CustomerService);

      await service.permanentDelete('o1');

      expect(customerService.updateCustomerMetrics).toHaveBeenCalledWith('c1');
    });
  });

  describe('create does NOT call updateCustomerSalesMetrics', () => {
    it('does not update customer metrics when an order is created', async () => {
      const customerService = module.get(CustomerService);

      try {
        await service.create({ customerId: 'nonexistent', items: [], shippingAmount: 0 });
      } catch {}

      expect(customerService.updateCustomerMetrics).not.toHaveBeenCalled();
    });
  });

  describe('bulkRestore calls updateCustomerMetrics per unique customer', () => {
    it('calls updateCustomerMetrics for each unique customerId in the batch', async () => {
      salesOrderRepository.find = jest.fn().mockResolvedValue([
        { id: 'o1', customerId: 'c1' } as SalesOrder,
        { id: 'o2', customerId: 'c2' } as SalesOrder,
        { id: 'o3', customerId: 'c1' } as SalesOrder, // duplicate customer
      ]);
      salesOrderLifecycleService.bulkRestore = jest.fn().mockResolvedValue({
        success: 3, failed: [],
      });
      const customerService = module.get(CustomerService);

      await service.bulkRestore(['o1', 'o2', 'o3']);

      expect(customerService.updateCustomerMetrics).toHaveBeenCalledWith('c1');
      expect(customerService.updateCustomerMetrics).toHaveBeenCalledWith('c2');
      expect(customerService.updateCustomerMetrics).toHaveBeenCalledTimes(2); // deduplicated
    });
  });

  describe('bulkPermanentDelete calls updateCustomerMetrics per unique customer', () => {
    it('calls updateCustomerMetrics for each unique customerId in the batch', async () => {
      salesOrderRepository.find = jest.fn().mockResolvedValue([
        { id: 'o1', customerId: 'c1' } as SalesOrder,
        { id: 'o2', customerId: 'c2' } as SalesOrder,
      ]);
      salesOrderLifecycleService.bulkPermanentDelete = jest.fn().mockResolvedValue({
        success: 2, failed: [],
      });
      const customerService = module.get(CustomerService);

      await service.bulkPermanentDelete(['o1', 'o2']);

      expect(customerService.updateCustomerMetrics).toHaveBeenCalledWith('c1');
      expect(customerService.updateCustomerMetrics).toHaveBeenCalledWith('c2');
      expect(customerService.updateCustomerMetrics).toHaveBeenCalledTimes(2);
    });
  });
});
