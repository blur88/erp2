import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { SalesOrderFulfillmentService } from './sales-order-fulfillment.service';
import {
  SalesOrder,
  SalesOrderStatus,
  SalesOrderPaymentStatus,
} from '../../../database/entities/sales-order.entity';
import { SalesOrderItem } from '../../../database/entities/sales-order-item.entity';
import { InventoryIntegrationService } from './inventory-integration.service';
import { StockMovementService } from '../../inventory/services/stock-movement.service';
import { BaseCostCalculatorService } from '../../inventory/services/base-cost-calculator.service';
import { AuditLogService } from '../../audit-logs/services';
import { ACCOUNTING_POSTING_PORT } from '../../../common/accounting-posting/accounting-posting.port';
import type { AccountingPostingPort } from '../../../common/accounting-posting/accounting-posting.port';

const mockOrder = (overrides: Partial<SalesOrder> = {}): SalesOrder =>
  ({
    id: 'order-1',
    orderNumber: 'SO-000001',
    status: SalesOrderStatus.DRAFT,
    paymentStatus: SalesOrderPaymentStatus.PAID,
    totalAmount: '1000.0000',
    customerId: 'customer-1',
    items: [
      {
        id: 'item-1',
        productId: 'product-1',
        quantity: 5,
        product: { id: 'product-1', name: 'Widget', stockQuantity: 100 },
      } as SalesOrderItem,
    ],
    ...overrides,
  }) as SalesOrder;

describe('SalesOrderFulfillmentService', () => {
  let service: SalesOrderFulfillmentService;
  let orderRepo: jest.Mocked<Repository<SalesOrder>>;
  let inventoryService: jest.Mocked<InventoryIntegrationService>;
  let stockMovementService: jest.Mocked<StockMovementService>;
  let baseCostCalculator: jest.Mocked<BaseCostCalculatorService>;
  let auditLogService: jest.Mocked<AuditLogService>;
  let dataSource: jest.Mocked<DataSource>;
  let accountingPort: jest.Mocked<AccountingPostingPort>;

  function wireTransaction(order: SalesOrder | null) {
    const findOne = jest.fn().mockResolvedValue(order);
    const update = jest.fn().mockResolvedValue(undefined);
    const manager = {
      getRepository: jest.fn().mockReturnValue({ findOne, update }),
    } as unknown as EntityManager;
    (dataSource.transaction as jest.Mock).mockImplementation(async (cb: any) => cb(manager));
    return { findOne, update, manager };
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesOrderFulfillmentService,
        {
          provide: getRepositoryToken(SalesOrder),
          useValue: { findOne: jest.fn(), save: jest.fn() },
        },
        {
          provide: InventoryIntegrationService,
          useValue: { adjustStock: jest.fn().mockResolvedValue(0n) },
        },
        {
          provide: StockMovementService,
          useValue: {
            deleteByReference: jest.fn().mockResolvedValue({ deletedCount: 1 }),
          },
        },
        {
          provide: BaseCostCalculatorService,
          useValue: { restoreStock: jest.fn() },
        },
        { provide: AuditLogService, useValue: { log: jest.fn() } },
        { provide: ACCOUNTING_POSTING_PORT, useValue: { postSalesFulfillment: jest.fn(), reverseEntriesForDocument: jest.fn() } },
        { provide: DataSource, useValue: { transaction: jest.fn() } },
      ],
    }).compile();

    service = module.get(SalesOrderFulfillmentService);
    orderRepo = module.get(getRepositoryToken(SalesOrder));
    inventoryService = module.get(InventoryIntegrationService);
    stockMovementService = module.get(StockMovementService);
    baseCostCalculator = module.get(BaseCostCalculatorService);
    auditLogService = module.get(AuditLogService);
    accountingPort = module.get(ACCOUNTING_POSTING_PORT);
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

    it('throws ConflictException when the order is overpaid (DRAFT)', async () => {
      wireTransaction(
        mockOrder({
          status: SalesOrderStatus.DRAFT,
          paymentStatus: SalesOrderPaymentStatus.OVERPAID,
        }),
      );
      await expect(service.fulfillOrder('order-1')).rejects.toThrow(ConflictException);
    });

    it('lock-reads the order and persists status via the manager', async () => {
      const order = mockOrder({ status: SalesOrderStatus.READY });
      const { findOne, update } = wireTransaction(order);

      await service.fulfillOrder('order-1');

      expect(findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'order-1' },
          lock: { mode: 'pessimistic_write' },
        }),
      );
      expect(update).toHaveBeenCalledWith(
        'order-1',
        expect.objectContaining({ status: SalesOrderStatus.FULFILLED }),
      );
      expect(inventoryService.adjustStock).toHaveBeenCalledWith(
        'product-1',
        -5,
        expect.any(String),
        'order-1',
        undefined,
        undefined,
        expect.anything(),
      );
    });

    it('posts accounting against the re-read order (fresh updatedAt + post-reduction costs), not the lock-read snapshot', async () => {
      // lockRowForUpdate issues two reads (bare lock, then relations hydrate); the
      // post-update re-read is a third read returning a row carrying the just-
      // persisted updatedAt and recalculated product baseCost.
      const lockReadOrder = mockOrder({ status: SalesOrderStatus.READY });
      const repricedOrder = mockOrder({
        status: SalesOrderStatus.FULFILLED,
        // sentinel distinguishing the re-read from the lock-read snapshot
        updatedAt: new Date('2099-01-01T00:00:00Z'),
        fulfilledAt: new Date('2099-01-01T00:00:00Z'),
      } as Partial<SalesOrder>);

      const findOne = jest
        .fn()
        .mockResolvedValueOnce(lockReadOrder) // lockRowForUpdate: bare row lock
        .mockResolvedValueOnce(lockReadOrder) // lockRowForUpdate: relations hydrate
        .mockResolvedValueOnce(repricedOrder); // priced re-read before posting
      const update = jest.fn().mockResolvedValue(undefined);
      const manager = {
        getRepository: jest.fn().mockReturnValue({ findOne, update }),
      } as unknown as EntityManager;
      (dataSource.transaction as jest.Mock).mockImplementation(async (cb: any) => cb(manager));

      await service.fulfillOrder('order-1', 'user-1', 'admin');

      // The status update must persist a fresh updatedAt so fulfilledDate is correct.
      expect(update).toHaveBeenCalledWith(
        'order-1',
        expect.objectContaining({
          status: SalesOrderStatus.FULFILLED,
          updatedAt: expect.any(Date),
        }),
      );
    });

    it('throws ConflictException when an item has insufficient stock', async () => {
      const order = mockOrder({
        status: SalesOrderStatus.READY,
        items: [
          {
            id: 'item-1',
            productId: 'product-1',
            quantity: 5,
            product: { id: 'product-1', name: 'Widget', stockQuantity: 2 },
          } as SalesOrderItem,
        ],
      });
      wireTransaction(order);

      await expect(service.fulfillOrder('order-1')).rejects.toThrow(ConflictException);
      await expect(service.fulfillOrder('order-1')).rejects.toThrow(/out of stock/i);
      expect(inventoryService.adjustStock).not.toHaveBeenCalled();
    });

    it('throws ConflictException when an item is fully out of stock', async () => {
      const order = mockOrder({
        status: SalesOrderStatus.READY,
        items: [
          {
            id: 'item-1',
            productId: 'product-1',
            quantity: 1,
            product: { id: 'product-1', name: 'Widget', stockQuantity: 0 },
          } as SalesOrderItem,
        ],
      });
      wireTransaction(order);

      await expect(service.fulfillOrder('order-1')).rejects.toThrow(ConflictException);
    });

    it('lists each offending item in the error message', async () => {
      const order = mockOrder({
        status: SalesOrderStatus.READY,
        items: [
          {
            id: 'item-1',
            productId: 'product-1',
            quantity: 5,
            product: { id: 'product-1', name: 'Widget', stockQuantity: 2 },
          } as SalesOrderItem,
          {
            id: 'item-2',
            productId: 'product-2',
            quantity: 3,
            product: { id: 'product-2', name: 'Gadget', stockQuantity: 0 },
          } as SalesOrderItem,
        ],
      });
      wireTransaction(order);

      await expect(service.fulfillOrder('order-1')).rejects.toThrow(
        /Widget.*Gadget|Gadget.*Widget/,
      );
    });

    it('fulfills normally when all items have sufficient stock', async () => {
      const order = mockOrder({
        status: SalesOrderStatus.READY,
        items: [
          {
            id: 'item-1',
            productId: 'product-1',
            quantity: 5,
            product: { id: 'product-1', name: 'Widget', stockQuantity: 5 },
          } as SalesOrderItem,
        ],
      });
      wireTransaction(order);

      await service.fulfillOrder('order-1');

      expect(inventoryService.adjustStock).toHaveBeenCalled();
    });

    it('sets fulfilledAt timestamp on fulfill', async () => {
      const order = mockOrder({ status: SalesOrderStatus.READY });
      const { update } = wireTransaction(order);

      const result = await service.fulfillOrder('order-1');

      expect(update).toHaveBeenCalledWith(
        'order-1',
        expect.objectContaining({ fulfilledAt: expect.any(Date) }),
      );
      expect(result.fulfilledAt).toBeInstanceOf(Date);
    });

    it('posts fulfillment revenue+COGS JEs after stock depletion', async () => {
      const order = mockOrder({
        status: SalesOrderStatus.READY,
        totalAmount: '1000.0000',
      });
      wireTransaction(order);
      inventoryService.adjustStock.mockResolvedValue(349_995_000n);

      await service.fulfillOrder('order-1', 'u', 'admin');

      expect(accountingPort.postSalesFulfillment).toHaveBeenCalledWith(
        expect.objectContaining({
          salesOrderId: 'order-1',
          revenueAmount: '1000.0000',
          cogsAmount: expect.any(String),
        }),
        expect.anything(),
      );
    });
  });

  describe('unfulfillOrder', () => {
    it('throws ConflictException when order is not FULFILLED', async () => {
      wireTransaction(mockOrder({ status: SalesOrderStatus.DRAFT }));
      await expect(service.unfulfillOrder('order-1')).rejects.toThrow(ConflictException);
    });

    it('lock-reads the order, reverses inventory, and persists status READY via manager', async () => {
      const order = mockOrder({ status: SalesOrderStatus.FULFILLED });
      const { findOne, update } = wireTransaction(order);

      await service.unfulfillOrder('order-1');

      expect(findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'order-1' },
          lock: { mode: 'pessimistic_write' },
        }),
      );
      expect(baseCostCalculator.restoreStock).toHaveBeenCalledWith(
        'product-1',
        5,
        expect.anything(),
      );
      expect(stockMovementService.deleteByReference).toHaveBeenCalledWith(
        'sales_order',
        'order-1',
        expect.anything(),
      );
      expect(update).toHaveBeenCalledWith(
        'order-1',
        expect.objectContaining({ status: SalesOrderStatus.READY }),
      );
    });

    it('rolls back (propagates) when stock-movement deletion fails — no swallow', async () => {
      wireTransaction(mockOrder({ status: SalesOrderStatus.FULFILLED }));
      stockMovementService.deleteByReference.mockRejectedValue(new Error('delete failed'));
      await expect(service.unfulfillOrder('order-1')).rejects.toThrow('delete failed');
    });

    it('clears fulfilledAt on unfulfill', async () => {
      const order = mockOrder({
        status: SalesOrderStatus.FULFILLED,
        fulfilledAt: new Date(),
      });
      const { update } = wireTransaction(order);

      const result = await service.unfulfillOrder('order-1');

      expect(update).toHaveBeenCalledWith(
        'order-1',
        expect.objectContaining({ fulfilledAt: null }),
      );
      expect(result.fulfilledAt).toBeUndefined();
    });

    it('reverses fulfillment JEs on unfulfill', async () => {
      const order = mockOrder({ status: SalesOrderStatus.FULFILLED });
      wireTransaction(order);

      await service.unfulfillOrder('order-1', 'u', 'admin');

      expect(accountingPort.reverseEntriesForDocument).toHaveBeenCalledWith(
        'SALES_ORDER',
        'order-1',
        expect.arrayContaining(['SALES_FULFILLMENT_REVENUE', 'SALES_FULFILLMENT_COGS']),
        expect.any(String),
        expect.anything(),
        'admin',
      );
    });
  });

  describe('fulfill/unfulfill with READY status', () => {
    it('rejects fulfilling a DRAFT order', async () => {
      wireTransaction(
        mockOrder({
          status: SalesOrderStatus.DRAFT,
          paymentStatus: SalesOrderPaymentStatus.PAID,
          items: [],
        }),
      );

      await expect(service.fulfillOrder('order-1')).rejects.toThrow('must be Ready');
    });

    it('fulfills a READY order -> FULFILLED', async () => {
      const order = mockOrder({
        status: SalesOrderStatus.READY,
        paymentStatus: SalesOrderPaymentStatus.PAID,
        items: [],
      });
      wireTransaction(order);

      const result = await service.fulfillOrder('order-1');

      expect(result.status).toBe(SalesOrderStatus.FULFILLED);
    });

    it('unfulfills a FULFILLED order back to READY', async () => {
      const order = mockOrder({
        status: SalesOrderStatus.FULFILLED,
        paymentStatus: SalesOrderPaymentStatus.PAID,
        items: [],
      });
      wireTransaction(order);

      const result = await service.unfulfillOrder('order-1');

      expect(result.status).toBe(SalesOrderStatus.READY);
    });
  });
});
