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
import { User } from '../../../database/entities/user.entity';
import { PriceListItem } from '../../../database/entities/price-list-item.entity';
import { Payment } from '../../../database/entities/payment.entity';
import { InventoryIntegrationService } from './inventory-integration.service';
import { StockMovementService } from '../../../modules/inventory/services/stock-movement.service';
import { BaseCostCalculatorService } from '../../inventory/services/base-cost-calculator.service';
import { SettingsService } from '../../settings/settings.service';
import { AuditLogService } from '../../audit-logs/services';
import { AccountingService } from '../../accounting/services/accounting.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

describe('SalesOrderService', () => {
  let service: SalesOrderService;
  let salesOrderRepository: jest.Mocked<Repository<SalesOrder>>;
  let accountingService: jest.Mocked<AccountingService>;
  let inventoryIntegrationService: jest.Mocked<InventoryIntegrationService>;
  let stockMovementService: jest.Mocked<StockMovementService>;
  let baseCostCalculator: jest.Mocked<BaseCostCalculatorService>;
  let auditLogService: jest.Mocked<AuditLogService>;
  let dataSource: jest.Mocked<DataSource>;

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
    // Mock DataSource for findById method
    const mockPaymentRepository = {
      find: jest.fn().mockResolvedValue([]),
    };

    dataSource = {
      getRepository: jest.fn().mockReturnValue(mockPaymentRepository),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesOrderService,
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
            reverseSourceEntries: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SalesOrderService>(SalesOrderService);
    salesOrderRepository = module.get(getRepositoryToken(SalesOrder));
    accountingService = module.get(AccountingService);
    inventoryIntegrationService = module.get(InventoryIntegrationService);
    stockMovementService = module.get(StockMovementService);
    baseCostCalculator = module.get(BaseCostCalculatorService);
    auditLogService = module.get(AuditLogService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
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
        relations: ['customer', 'items', 'items.product'],
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

  describe('unfulfillOrder', () => {
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
});
