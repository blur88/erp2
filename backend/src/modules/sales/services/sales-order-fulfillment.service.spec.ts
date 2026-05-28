import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { SalesOrderFulfillmentService } from './sales-order-fulfillment.service';
import { SalesOrder, SalesOrderStatus, SalesOrderPaymentStatus } from '../../../database/entities/sales-order.entity';
import { SalesOrderItem } from '../../../database/entities/sales-order-item.entity';
import { InventoryIntegrationService } from './inventory-integration.service';
import { StockMovementService } from '../../inventory/services/stock-movement.service';
import { BaseCostCalculatorService } from '../../inventory/services/base-cost-calculator.service';
import { AuditLogService } from '../../audit-logs/services';
import { AccountingService } from '../../accounting/services/accounting.service';

const mockOrder = (overrides: Partial<SalesOrder> = {}): SalesOrder => ({
  id: 'order-1',
  orderNumber: 'SO-000001',
  status: SalesOrderStatus.DRAFT,
  paymentStatus: SalesOrderPaymentStatus.PAID,
  totalAmount: 1000,
  customerId: 'customer-1',
  items: [{ id: 'item-1', productId: 'product-1', quantity: 5, product: { id: 'product-1' } } as SalesOrderItem],
  ...overrides,
} as SalesOrder);

describe('SalesOrderFulfillmentService', () => {
  let service: SalesOrderFulfillmentService;
  let orderRepo: jest.Mocked<Repository<SalesOrder>>;
  let inventoryService: jest.Mocked<InventoryIntegrationService>;
  let stockMovementService: jest.Mocked<StockMovementService>;
  let baseCostCalculator: jest.Mocked<BaseCostCalculatorService>;
  let auditLogService: jest.Mocked<AuditLogService>;
  let accountingService: jest.Mocked<AccountingService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesOrderFulfillmentService,
        { provide: getRepositoryToken(SalesOrder), useValue: { findOne: jest.fn(), save: jest.fn() } },
        { provide: InventoryIntegrationService, useValue: { adjustStock: jest.fn() } },
        { provide: StockMovementService, useValue: { deleteByReference: jest.fn().mockResolvedValue({ deletedCount: 1 }) } },
        { provide: BaseCostCalculatorService, useValue: { restoreStock: jest.fn() } },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
        { provide: AccountingService, useValue: { postSalesOrderEntry: jest.fn().mockResolvedValue(undefined), reverseSourceEntries: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get(SalesOrderFulfillmentService);
    orderRepo = module.get(getRepositoryToken(SalesOrder));
    inventoryService = module.get(InventoryIntegrationService);
    stockMovementService = module.get(StockMovementService);
    baseCostCalculator = module.get(BaseCostCalculatorService);
    auditLogService = module.get(AuditLogService);
    accountingService = module.get(AccountingService);
  });

  describe('fulfillOrder', () => {
    it('throws NotFoundException when order not found', async () => {
      orderRepo.findOne.mockResolvedValue(null);
      await expect(service.fulfillOrder('order-1')).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when already FULFILLED', async () => {
      orderRepo.findOne.mockResolvedValue(mockOrder({ status: SalesOrderStatus.FULFILLED }));
      await expect(service.fulfillOrder('order-1')).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when paymentStatus is not PAID', async () => {
      orderRepo.findOne.mockResolvedValue(mockOrder({ paymentStatus: SalesOrderPaymentStatus.PARTIAL }));
      await expect(service.fulfillOrder('order-1')).rejects.toThrow(ConflictException);
    });

    it('deducts inventory and sets status FULFILLED', async () => {
      const order = mockOrder();
      orderRepo.findOne.mockResolvedValue(order); // handles both the guard load and the accounting reload
      orderRepo.save.mockResolvedValue({ ...order, status: SalesOrderStatus.FULFILLED } as SalesOrder);

      await service.fulfillOrder('order-1');

      expect(inventoryService.adjustStock).toHaveBeenCalledWith('product-1', -5, expect.any(String), 'order-1');
      expect(orderRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: SalesOrderStatus.FULFILLED }));
    });
  });

  describe('unfulfillOrder', () => {
    it('throws ConflictException when order is not FULFILLED', async () => {
      orderRepo.findOne.mockResolvedValue(mockOrder({ status: SalesOrderStatus.DRAFT }));
      await expect(service.unfulfillOrder('order-1')).rejects.toThrow(ConflictException);
    });

    it('reverses inventory and sets status DRAFT', async () => {
      const order = mockOrder({ status: SalesOrderStatus.FULFILLED });
      orderRepo.findOne.mockResolvedValue(order);
      orderRepo.save.mockResolvedValue({ ...order, status: SalesOrderStatus.DRAFT } as SalesOrder);

      await service.unfulfillOrder('order-1');

      expect(baseCostCalculator.restoreStock).toHaveBeenCalledWith('product-1', 5);
      expect(stockMovementService.deleteByReference).toHaveBeenCalledWith('sales_order', 'order-1');
      expect(orderRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: SalesOrderStatus.DRAFT }));
    });

    it('reverses the sales_order journal entry on unfulfill', async () => {
      const order = mockOrder({ status: SalesOrderStatus.FULFILLED });
      orderRepo.findOne.mockResolvedValue(order);
      orderRepo.save.mockResolvedValue({ ...order, status: SalesOrderStatus.DRAFT } as SalesOrder);

      await service.unfulfillOrder('order-1', 'user-99', 'admin');

      expect(accountingService.reverseSourceEntries).toHaveBeenCalledWith(
        'sales_order',
        'order-1',
        'user-99',
      );
    });

    it('does not throw if journal entry reversal fails (non-critical path)', async () => {
      const order = mockOrder({ status: SalesOrderStatus.FULFILLED });
      orderRepo.findOne.mockResolvedValue(order);
      orderRepo.save.mockResolvedValue({ ...order, status: SalesOrderStatus.DRAFT } as SalesOrder);
      accountingService.reverseSourceEntries.mockRejectedValue(new Error('No open fiscal period'));

      // Should not throw — accounting failure must not block unfulfill
      await expect(service.unfulfillOrder('order-1')).resolves.toBeDefined();
    });
  });
});
