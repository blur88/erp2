import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';

import { SalesOrderFulfillmentService } from './sales-order-fulfillment.service';
import { InventoryIntegrationService } from './inventory-integration.service';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { Invoice } from '../../../database/entities/invoice.entity';
import { Product } from '../../../database/entities/product.entity';
import { SalesOrderItem } from '../../../database/entities/sales-order-item.entity';
import { Customer } from '../../../database/entities/customer.entity';
import { StockMovementService } from '../../../modules/inventory/services/stock-movement.service';
import { BaseCostCalculatorService } from '../../inventory/services/base-cost-calculator.service';
import { AccountingService } from '../../accounting/services/accounting.service';
import { AuditLogService } from '../../audit-logs/services';

describe('SalesOrderFulfillmentService', () => {
  let service: SalesOrderFulfillmentService;
  let salesOrderRepository: jest.Mocked<Repository<SalesOrder>>;
  let inventoryIntegrationService: jest.Mocked<InventoryIntegrationService>;
  let stockMovementService: jest.Mocked<StockMovementService>;
  let baseCostCalculator: jest.Mocked<BaseCostCalculatorService>;
  let accountingService: jest.Mocked<AccountingService>;
  let auditLogService: jest.Mocked<AuditLogService>;

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
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesOrderFulfillmentService,
        {
          provide: getRepositoryToken(SalesOrder),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Invoice),
          useValue: {},
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
          provide: AccountingService,
          useValue: {
            postSalesOrderEntry: jest.fn(),
            reverseSourceEntries: jest.fn(),
          },
        },
        {
          provide: AuditLogService,
          useValue: {
            log: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(SalesOrderFulfillmentService);
    salesOrderRepository = module.get(getRepositoryToken(SalesOrder));
    inventoryIntegrationService = module.get(InventoryIntegrationService);
    stockMovementService = module.get(StockMovementService);
    baseCostCalculator = module.get(BaseCostCalculatorService);
    accountingService = module.get(AccountingService);
    auditLogService = module.get(AuditLogService);
  });

  describe('fulfillOrder', () => {
    it('should post accounting entry successfully', async () => {
      const mockSalesOrder = createMockSalesOrder();
      const orderId = mockSalesOrder.id;
      const savedOrder = { ...mockSalesOrder, isFulfilled: true, fulfilledDate: new Date() };

      salesOrderRepository.findOne
        .mockResolvedValueOnce(mockSalesOrder as SalesOrder)
        .mockResolvedValueOnce(savedOrder as SalesOrder);
      salesOrderRepository.save.mockResolvedValue(savedOrder as SalesOrder);
      inventoryIntegrationService.adjustStock.mockResolvedValue(undefined);
      auditLogService.log.mockResolvedValue(undefined);
      accountingService.postSalesOrderEntry.mockResolvedValue({ id: 'journal-1' } as any);

      const result = await service.fulfillOrder(orderId);

      expect(accountingService.postSalesOrderEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          id: orderId,
          orderNumber: mockSalesOrder.orderNumber,
        }),
        'system',
        undefined,
      );
      expect(result).toEqual(savedOrder);
      expect(salesOrderRepository.save).toHaveBeenCalled();
    });

    it('should continue fulfillment when accounting post fails', async () => {
      const mockSalesOrder = createMockSalesOrder();
      const orderId = mockSalesOrder.id;
      const savedOrder = { ...mockSalesOrder, isFulfilled: true, fulfilledDate: new Date() };

      salesOrderRepository.findOne
        .mockResolvedValueOnce(mockSalesOrder as SalesOrder)
        .mockResolvedValueOnce(savedOrder as SalesOrder);
      salesOrderRepository.save.mockResolvedValue(savedOrder as SalesOrder);
      inventoryIntegrationService.adjustStock.mockResolvedValue(undefined);
      auditLogService.log.mockResolvedValue(undefined);
      accountingService.postSalesOrderEntry.mockRejectedValue(new Error('Account mappings not configured'));

      const result = await service.fulfillOrder(orderId);

      expect(accountingService.postSalesOrderEntry).toHaveBeenCalled();
      expect(result).toEqual(savedOrder);
      expect(salesOrderRepository.save).toHaveBeenCalled();
    });

    it('should load order with relations before posting to accounting', async () => {
      const mockSalesOrder = createMockSalesOrder();
      const orderId = mockSalesOrder.id;
      const savedOrder = { ...mockSalesOrder, isFulfilled: true, fulfilledDate: new Date() };

      salesOrderRepository.findOne
        .mockResolvedValueOnce(mockSalesOrder as SalesOrder)
        .mockResolvedValueOnce(savedOrder as SalesOrder);
      salesOrderRepository.save.mockResolvedValue(savedOrder as SalesOrder);
      inventoryIntegrationService.adjustStock.mockResolvedValue(undefined);
      auditLogService.log.mockResolvedValue(undefined);
      accountingService.postSalesOrderEntry.mockResolvedValue({ id: 'journal-1' } as any);

      await service.fulfillOrder(orderId);

      expect(salesOrderRepository.findOne).toHaveBeenNthCalledWith(1, {
        where: { id: orderId },
        relations: { customer: true, items: { product: true } },
      });
      expect(salesOrderRepository.findOne).toHaveBeenNthCalledWith(2, {
        where: { id: orderId },
        relations: { customer: true, items: { product: true } },
      });
    });

    it('should throw error when order not found', async () => {
      salesOrderRepository.findOne.mockResolvedValue(null);

      await expect(service.fulfillOrder('non-existent-id')).rejects.toThrow(NotFoundException);
    });

    it('should throw error when order is already fulfilled', async () => {
      const fulfilledOrder = { ...createMockSalesOrder(), isFulfilled: true };
      salesOrderRepository.findOne.mockResolvedValue(fulfilledOrder as SalesOrder);

      await expect(service.fulfillOrder(fulfilledOrder.id)).rejects.toThrow(ConflictException);
    });

    it('should throw error when order is not paid in full', async () => {
      const unpaidOrder = { ...createMockSalesOrder(), isPaidInFull: false, balanceDue: 500 };
      salesOrderRepository.findOne.mockResolvedValue(unpaidOrder as SalesOrder);

      await expect(service.fulfillOrder(unpaidOrder.id)).rejects.toThrow(ConflictException);
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
      baseCostCalculator.restoreStock.mockResolvedValue(undefined);
      stockMovementService.deleteByReference.mockResolvedValue({ deletedCount: 1 } as any);
      auditLogService.log.mockResolvedValue(undefined);
      accountingService.reverseSourceEntries.mockRejectedValue(new Error('No open period'));

      await expect(service.unfulfillOrder('so-123')).resolves.toBeDefined();
    });
  });
});
