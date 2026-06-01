import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
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
  let dataSource: jest.Mocked<DataSource>;

  function wireTransaction(order: SalesOrder | null) {
    const findOne = jest.fn().mockResolvedValue(order);
    const update = jest.fn().mockResolvedValue(undefined);
    const manager = { getRepository: jest.fn().mockReturnValue({ findOne, update }) } as unknown as EntityManager;
    (dataSource.transaction as jest.Mock).mockImplementation(async (cb: any) => cb(manager));
    return { findOne, update, manager };
  }

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
        { provide: DataSource, useValue: { transaction: jest.fn() } },
      ],
    }).compile();

    service = module.get(SalesOrderFulfillmentService);
    orderRepo = module.get(getRepositoryToken(SalesOrder));
    inventoryService = module.get(InventoryIntegrationService);
    stockMovementService = module.get(StockMovementService);
    baseCostCalculator = module.get(BaseCostCalculatorService);
    auditLogService = module.get(AuditLogService);
    accountingService = module.get(AccountingService);
    dataSource = module.get(DataSource) as jest.Mocked<DataSource>;
  });

  describe('fulfillOrder', () => {
    it('throws NotFoundException when order not found', async () => {
      wireTransaction(null);
      await expect(service.fulfillOrder('order-1')).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when already FULFILLED', async () => {
      wireTransaction(mockOrder({ status: SalesOrderStatus.FULFILLED }));
      await expect(service.fulfillOrder('order-1')).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when not READY', async () => {
      wireTransaction(mockOrder({ status: SalesOrderStatus.DRAFT }));
      await expect(service.fulfillOrder('order-1')).rejects.toThrow(ConflictException);
    });

    it('lock-reads the order and persists status via the manager', async () => {
      const order = mockOrder({ status: SalesOrderStatus.READY });
      const { findOne, update } = wireTransaction(order);

      await service.fulfillOrder('order-1');

      expect(findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'order-1' }, lock: { mode: 'pessimistic_write' } }),
      );
      expect(update).toHaveBeenCalledWith('order-1', expect.objectContaining({ status: SalesOrderStatus.FULFILLED }));
      expect(inventoryService.adjustStock).toHaveBeenCalledWith('product-1', -5, expect.any(String), 'order-1', undefined, undefined, expect.anything());
    });

    it('rolls back (propagates) when accounting posting fails — no swallow', async () => {
      wireTransaction(mockOrder({ status: SalesOrderStatus.READY }));
      accountingService.postSalesOrderEntry.mockRejectedValue(new Error('period closed'));
      await expect(service.fulfillOrder('order-1')).rejects.toThrow('period closed');
    });
  });

  describe('unfulfillOrder', () => {
    it('throws ConflictException when order is not FULFILLED', async () => {
      orderRepo.findOne.mockResolvedValue(mockOrder({ status: SalesOrderStatus.DRAFT }));
      await expect(service.unfulfillOrder('order-1')).rejects.toThrow(ConflictException);
    });

    it('reverses inventory and sets status READY', async () => {
      const order = mockOrder({ status: SalesOrderStatus.FULFILLED });
      orderRepo.findOne.mockResolvedValue(order);
      orderRepo.save.mockResolvedValue({ ...order, status: SalesOrderStatus.READY } as SalesOrder);

      await service.unfulfillOrder('order-1');

      expect(baseCostCalculator.restoreStock).toHaveBeenCalledWith('product-1', 5);
      expect(stockMovementService.deleteByReference).toHaveBeenCalledWith('sales_order', 'order-1');
      expect(orderRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: SalesOrderStatus.READY }));
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

  describe('fulfill/unfulfill with READY status', () => {
    it('rejects fulfilling a DRAFT order', async () => {
      wireTransaction(
        mockOrder({ status: SalesOrderStatus.DRAFT, paymentStatus: SalesOrderPaymentStatus.PAID, items: [] }),
      );

      await expect(service.fulfillOrder('order-1')).rejects.toThrow('must be Ready');
    });

    it('fulfills a READY order -> FULFILLED', async () => {
      const order = mockOrder({ status: SalesOrderStatus.READY, paymentStatus: SalesOrderPaymentStatus.PAID, items: [] });
      wireTransaction(order);

      const result = await service.fulfillOrder('order-1');

      expect(result.status).toBe(SalesOrderStatus.FULFILLED);
    });

    it('unfulfills a FULFILLED order back to READY', async () => {
      const order = mockOrder({ status: SalesOrderStatus.FULFILLED, paymentStatus: SalesOrderPaymentStatus.PAID, items: [] });
      orderRepo.findOne.mockResolvedValue(order);
      orderRepo.save.mockImplementation(async (saved: any) => saved as SalesOrder);

      const result = await service.unfulfillOrder('order-1');

      expect(result.status).toBe(SalesOrderStatus.READY);
    });
  });
});
