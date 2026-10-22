import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { negateRecordedValue, SalesOrderFulfillmentService } from './sales-order-fulfillment.service';
import {
  UNFULFILL_EVIDENCE_INCOMPLETE,
  UNFULFILL_PRE_RECORDING,
} from '../../inventory/stock-undo-unavailable';
import { StockMovementService } from '../../inventory/services/stock-movement.service';
import {
  SalesOrder,
  SalesOrderStatus,
  SalesOrderPaymentStatus,
} from '../../../database/entities/sales-order.entity';
import { SalesOrderItem } from '../../../database/entities/sales-order-item.entity';
import { StockOccurrence } from '../../../database/entities/stock-occurrence.entity';
import { StockMovement } from '../../../database/entities/stock-movement.entity';
import { StockBatchConsumption } from '../../../database/entities/stock-batch-consumption.entity';
import { StockMovementValuationGap } from '../../../database/entities/stock-movement-valuation-gap.entity';
import { Product } from '../../../database/entities/product.entity';
import { PurchaseCostHistory } from '../../../database/entities/purchase-cost-history.entity';
import { InventoryIntegrationService } from './inventory-integration.service';
import { BaseCostCalculatorService } from '../../inventory/services/base-cost-calculator.service';
import { AuditLogService } from '../../audit-logs/services';
import { ACCOUNTING_POSTING_PORT } from '../../../common/accounting-posting/accounting-posting.port';
import type { AccountingPostingPort } from '../../../common/accounting-posting/accounting-posting.port';
import { SettingsService } from '../../settings/settings.service';
import { InventoryValuationService } from '../../inventory/valuation/inventory-valuation.service';

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
  it('negates recorded currency values numerically, including negative inputs', () => {
    expect(negateRecordedValue('500.00')).toBe('-500.00');
    expect(negateRecordedValue('-500.00')).toBe('500.00');
  });

  let service: SalesOrderFulfillmentService;
  let orderRepo: any;
  let inventoryService: any;
  let baseCostCalculator: any;
  let auditLogService: any;
  let dataSource: any;
  let accountingPort: any;
  let inventoryValuation: any;
  let settingsService: { getRegionalSettings: any };
  let appTimezone: string;

  function wireTransaction(order: SalesOrder | null) {
    const findOne = (jest.fn as unknown as any)().mockResolvedValue(order);
    const update = (jest.fn as unknown as any)().mockResolvedValue(undefined);
    const query = (jest.fn as unknown as any)().mockResolvedValue([{}]);
    const occRepo = {
      create: (jest.fn as unknown as any)((d: any) => d),
      save: (jest.fn as unknown as any)(async (d: any) => ({ ...d, id: 'occ-1' })),
      find: (jest.fn as unknown as any)().mockResolvedValue([]),
      findOne: (jest.fn as unknown as any)().mockResolvedValue(null),
    };
    const getRepository = (jest.fn as unknown as any)().mockImplementation((entity: any) =>
      entity === StockOccurrence ? occRepo : { findOne, update },
    );
    const manager = {
      getRepository,
      query,
    } as unknown as EntityManager;
    (dataSource.transaction as any).mockImplementation(async (cb: any) => cb(manager));
    return { findOne, update, query, manager };
  }

  beforeEach(async () => {
    appTimezone = 'Asia/Kuala_Lumpur';
    settingsService = {
      getRegionalSettings: (jest.fn as unknown as any)(async () => ({ timezone: appTimezone })),
    };
    inventoryValuation = {
      isActive: (jest.fn as unknown as any)().mockResolvedValue(false),
      valueDecrease: (jest.fn as unknown as any)(),
      valueDecreaseReversal: (jest.fn as unknown as any)(),
      findEntryForMovement: (jest.fn as unknown as any)().mockResolvedValue(null),
      currentMethod: (jest.fn as unknown as any)().mockResolvedValue('AVERAGE'),
      commit: (jest.fn as unknown as any)().mockResolvedValue([]),
    };
    baseCostCalculator = {
      // One shared plan per line; default is zero-cost unless a test overrides.
      planConsumption: (jest.fn as unknown as any)().mockImplementation(async (_m: any, lines: any[]) =>
        lines.map((l) => {
          const requestedQuantityMinor = BigInt(Math.round(l.quantity * 10000));
          return {
            productId: l.productId,
            requestedQuantityMinor,
            coveredQuantityMinor: requestedQuantityMinor,
            uncoveredQuantityMinor: 0n,
            consumptions: [
              {
                batchId: `batch-${l.productId}`,
                quantityMinor: requestedQuantityMinor,
                unitCostMinor: 0n,
                valueScale8: 0n,
              },
            ],
            totalScale8: 0n,
          };
        }),
      ),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesOrderFulfillmentService,
        {
          provide: getRepositoryToken(SalesOrder),
          useValue: { findOne: (jest.fn as unknown as any)(), save: (jest.fn as unknown as any)() },
        },
        {
          provide: InventoryIntegrationService,
          useValue: {
            adjustStock: (jest.fn as unknown as any)().mockResolvedValue({
              movementId: 'm1',
              totalScale8: 0n,
            }),
          },
        },
        { provide: BaseCostCalculatorService, useValue: baseCostCalculator },
        { provide: StockMovementService, useValue: { create: (jest.fn as unknown as any)() } },
        { provide: AuditLogService, useValue: { log: (jest.fn as unknown as any)() } },
        {
          provide: ACCOUNTING_POSTING_PORT,
          useValue: {
            postSalesFulfillment: (jest.fn as unknown as any)().mockResolvedValue({}),
            reverseEntriesForDocument: (jest.fn as unknown as any)(),
          },
        },
        { provide: DataSource, useValue: { transaction: (jest.fn as unknown as any)() } },
        { provide: SettingsService, useValue: settingsService },
        { provide: InventoryValuationService, useValue: inventoryValuation },
      ],
    }).compile();

    service = module.get(SalesOrderFulfillmentService);
    orderRepo = module.get(getRepositoryToken(SalesOrder));
    inventoryService = module.get(InventoryIntegrationService);
    auditLogService = module.get(AuditLogService);
    accountingPort = module.get(ACCOUNTING_POSTING_PORT);
    dataSource = module.get(DataSource) as any;
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
        'occ-1',
        expect.objectContaining({ productId: 'product-1' }),
        expect.any(String),
      );
    });

    it('recalculates the customer metrics in the same transaction, after the status update (#1355)', async () => {
      const order = mockOrder({ status: SalesOrderStatus.READY, customerId: 'customer-1' });
      const { update, query } = wireTransaction(order);

      await service.fulfillOrder('order-1');

      expect(query.mock.calls.map((c: any[]) => c[1])).toEqual([
        ['customer-1'],
        ['customer-1', SalesOrderStatus.FULFILLED],
      ]);
      expect(update.mock.invocationCallOrder[0]).toBeLessThan(query.mock.invocationCallOrder[0]);
    });

    it('fails the fulfilment when the metrics cannot be written', async () => {
      const order = mockOrder({ status: SalesOrderStatus.READY, customerId: 'customer-1' });
      const { query } = wireTransaction(order);
      query.mockRejectedValue(new Error('metrics write failed'));

      await expect(service.fulfillOrder('order-1')).rejects.toThrow('metrics write failed');
      expect(auditLogService.log).not.toHaveBeenCalled();
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

      const findOne = (jest.fn as unknown as any)()
        .mockResolvedValueOnce(lockReadOrder) // lockRowForUpdate: bare row lock
        .mockResolvedValueOnce(lockReadOrder) // lockRowForUpdate: relations hydrate
        .mockResolvedValueOnce(repricedOrder); // priced re-read before posting
      const update = (jest.fn as unknown as any)().mockResolvedValue(undefined);
      const query = (jest.fn as unknown as any)().mockResolvedValue([{}]);
      const occRepo = {
        create: (jest.fn as unknown as any)((d: any) => d),
        save: (jest.fn as unknown as any)(async (d: any) => ({ ...d, id: 'occ-1' })),
      };
      const manager = {
        getRepository: (jest.fn as unknown as any)().mockImplementation((entity: any) =>
          entity === StockOccurrence ? occRepo : { findOne, update },
        ),
        query,
      } as unknown as EntityManager;
      (dataSource.transaction as any).mockImplementation(async (cb: any) => cb(manager));

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

    describe('business-calendar entryDate (issue #1134)', () => {
      // 16:30Z is past the UTC+8 rollover (16:00Z), so the UTC and
      // Asia/Kuala_Lumpur calendar dates differ. fulfilledAt is set from this
      // frozen instant inside the transaction; the JE must resolve THAT instant
      // in the configured timezone, not a fresh "today".
      const FROZEN_INSTANT = new Date('2026-08-24T16:30:00.000Z');

      beforeEach(() => {
        jest.useFakeTimers().setSystemTime(FROZEN_INSTANT);
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it("dates the JE by fulfilledAt in the configured timezone, not UTC", async () => {
        appTimezone = 'Asia/Kuala_Lumpur';
        wireTransaction(mockOrder({ status: SalesOrderStatus.READY }));

        const result = await service.fulfillOrder('order-1', 'u', 'admin');

        expect(accountingPort.postSalesFulfillment).toHaveBeenCalledWith(
          expect.objectContaining({ entryDate: '2026-08-25' }),
          expect.anything(),
        );
        // The instant itself is unchanged — only the calendar it resolves against.
        expect(result.fulfilledAt.toISOString()).toBe('2026-08-24T16:30:00.000Z');
      });

      it('dates the JE by UTC when UTC is the configured timezone', async () => {
        appTimezone = 'UTC';
        wireTransaction(mockOrder({ status: SalesOrderStatus.READY }));

        await service.fulfillOrder('order-1', 'u', 'admin');

        expect(accountingPort.postSalesFulfillment).toHaveBeenCalledWith(
          expect.objectContaining({ entryDate: '2026-08-24' }),
          expect.anything(),
        );
      });
    });

    it('posts fulfillment revenue+COGS JEs after stock depletion', async () => {
      const order = mockOrder({
        status: SalesOrderStatus.READY,
        totalAmount: '1000.0000',
      });
      wireTransaction(order);
      baseCostCalculator.planConsumption.mockResolvedValue([
        {
          productId: 'product-1',
          requestedQuantityMinor: 50000n,
          coveredQuantityMinor: 50000n,
          uncoveredQuantityMinor: 0n,
          consumptions: [
            {
              batchId: 'batch-product-1',
              quantityMinor: 50000n,
              unitCostMinor: 7000n,
              valueScale8: 350_000_000n,
            },
          ],
          totalScale8: 350_000_000n,
        },
      ]);
      accountingPort.postSalesFulfillment.mockResolvedValue({ cogsEntryId: 'cogs-1' });

      await service.fulfillOrder('order-1', 'u', 'admin');

      expect(accountingPort.postSalesFulfillment).toHaveBeenCalledWith(
        expect.objectContaining({
          salesOrderId: 'order-1',
          revenueAmount: '1000.00',
          cogsAmount: expect.any(String),
        }),
        expect.anything(),
      );
    });

    it('plans all lines once and consumes a repeated product exactly once (#1406)', async () => {
      const order = mockOrder({
        status: SalesOrderStatus.READY,
        items: [
          { id: 'item-1', productId: 'product-1', quantity: 3, product: { id: 'product-1', name: 'Widget', stockQuantity: 100 } },
          { id: 'item-2', productId: 'product-1', quantity: 4, product: { id: 'product-1', name: 'Widget', stockQuantity: 100 } },
        ] as SalesOrderItem[],
      });
      wireTransaction(order);

      await service.fulfillOrder('order-1');

      expect(baseCostCalculator.planConsumption).toHaveBeenCalledTimes(1);
      expect(baseCostCalculator.planConsumption).toHaveBeenCalledWith(expect.anything(), [
        { productId: 'product-1', quantity: 3 },
        { productId: 'product-1', quantity: 4 },
      ]);
      expect(inventoryService.adjustStock).toHaveBeenCalledTimes(2);
      expect(inventoryService.adjustStock.mock.calls[0][1]).toBe(-3);
      expect(inventoryService.adjustStock.mock.calls[1][1]).toBe(-4);
      expect(inventoryService.adjustStock.mock.calls[0][7]).toBe('occ-1');
      expect(inventoryService.adjustStock.mock.calls[1][7]).toBe('occ-1');
    });

    it('allocates the rounded posted COGS across lines and lets the last line absorb the residual (#1406)', async () => {
      const order = mockOrder({
        status: SalesOrderStatus.READY,
        items: [
          { id: 'item-1', productId: 'product-1', quantity: 1, product: { id: 'product-1', name: 'A', stockQuantity: 10 } },
          { id: 'item-2', productId: 'product-2', quantity: 1, product: { id: 'product-2', name: 'B', stockQuantity: 10 } },
          { id: 'item-3', productId: 'product-3', quantity: 1, product: { id: 'product-3', name: 'C', stockQuantity: 10 } },
        ] as SalesOrderItem[],
      });
      wireTransaction(order);
      baseCostCalculator.planConsumption.mockResolvedValue([
        { productId: 'product-1', requestedQuantityMinor: 10000n, coveredQuantityMinor: 10000n, uncoveredQuantityMinor: 0n, consumptions: [{ batchId: 'batch-1', quantityMinor: 10000n, unitCostMinor: 150n, valueScale8: 1_500_000n }], totalScale8: 1_500_000n },
        { productId: 'product-2', requestedQuantityMinor: 10000n, coveredQuantityMinor: 10000n, uncoveredQuantityMinor: 0n, consumptions: [{ batchId: 'batch-2', quantityMinor: 10000n, unitCostMinor: 150n, valueScale8: 1_500_000n }], totalScale8: 1_500_000n },
        { productId: 'product-3', requestedQuantityMinor: 10000n, coveredQuantityMinor: 10000n, uncoveredQuantityMinor: 0n, consumptions: [{ batchId: 'batch-3', quantityMinor: 10000n, unitCostMinor: 150n, valueScale8: 1_500_000n }], totalScale8: 1_500_000n },
      ]);
      accountingPort.postSalesFulfillment.mockResolvedValue({ cogsEntryId: 'cogs-1' });

      await service.fulfillOrder('order-1');

      // total 0.0450 rounds up to 0.0500 (500 scale-4); 5 cents over 3 equal
      // weights => [1,1,3] cents, so the last line carries the residual.
      const plannedValues = inventoryService.adjustStock.mock.calls.map((c: any[]) => c[9]);
      expect(plannedValues).toEqual(['0.0100', '0.0100', '0.0300']);
      expect(accountingPort.postSalesFulfillment).toHaveBeenCalledWith(
        expect.objectContaining({ cogsAmount: '0.05' }),
        expect.anything(),
      );
    });

    it('rolls back when the journal cannot be reconciled to a nonzero occurrence (#1406)', async () => {
      wireTransaction(mockOrder({ status: SalesOrderStatus.READY }));
      baseCostCalculator.planConsumption.mockResolvedValue([
        { productId: 'product-1', requestedQuantityMinor: 50000n, coveredQuantityMinor: 50000n, uncoveredQuantityMinor: 0n, consumptions: [{ batchId: 'batch-1', quantityMinor: 50000n, unitCostMinor: 20n, valueScale8: 1_000_000n }], totalScale8: 1_000_000n },
      ]);
      // Nonzero COGS recorded, but the posting reports no COGS entry.
      accountingPort.postSalesFulfillment.mockResolvedValue({});

      await expect(service.fulfillOrder('order-1', 'u', 'admin')).rejects.toThrow(
        /COGS entry missing/,
      );
    });

    it('rolls back when a zero-cost occurrence receives a COGS entry (#1406)', async () => {
      wireTransaction(mockOrder({ status: SalesOrderStatus.READY }));
      // Default plan is zero-cost; a COGS entry must not appear.
      accountingPort.postSalesFulfillment.mockResolvedValue({ cogsEntryId: 'cogs-1' });

      await expect(service.fulfillOrder('order-1', 'u', 'admin')).rejects.toThrow(
        /Unexpected COGS entry/,
      );
    });
  });

  describe('unfulfillOrder', () => {
    it('refuses an order that is not fulfilled', async () => {
      wireTransaction(mockOrder({ status: SalesOrderStatus.READY }));

      await expect(service.unfulfillOrder('order-1', 'a valid reason', 'u1', 'alice')).rejects.toThrow(
        'Order is not fulfilled',
      );
      expect(accountingPort.reverseEntriesForDocument).not.toHaveBeenCalled();
      expect(auditLogService.log).not.toHaveBeenCalled();
    });

    it('refuses a pre-recording fulfilment (no live occurrence)', async () => {
      // A FULFILLED order with no StockOccurrence rows: the fake occurrence repo
      // returns none, so no live fulfilment can be found.
      wireTransaction(mockOrder({ status: SalesOrderStatus.FULFILLED }));

      await expect(service.unfulfillOrder('order-1', 'a valid reason', 'u1', 'alice')).rejects.toThrow(
        UNFULFILL_PRE_RECORDING,
      );
    });

    it.each([
      ['gap without occurrence marker', false, true, 3],
      ['occurrence marker without gap row', true, false, 0],
      ['gap quantity that does not reconcile to movement quantity', true, true, 2],
    ])(
      'refuses inconsistent valuation-gap evidence: %s before writes',
      async (_label, marked, hasGap, gapQuantity) => {
      const order = mockOrder({ status: SalesOrderStatus.FULFILLED });
      const occurrence = { id: 'occ-1', hasValuationGap: marked, postedAmount: '0.00' };
      const movement = {
        id: 'movement-1',
        productId: 'product-1',
        quantity: -3,
        totalValue: '0.0000',
      };
      const consumptionRows = hasGap
        ? []
        : [{ movementId: movement.id, batchId: 'batch-1', quantity: 3 }];
      const gapRows = hasGap
        ? [{ movementId: movement.id, quantity: gapQuantity, valueScale8: '0.00000000', status: 'unvalued_gap' }]
        : [];
      const salesOrderRepo = {
        findOne: (jest.fn as unknown as any)().mockResolvedValue(order),
        update: (jest.fn as unknown as any)(),
      };
      const occurrenceRepo = {
        find: (jest.fn as unknown as any)().mockResolvedValue([occurrence]),
        findOne: (jest.fn as unknown as any)().mockImplementation(async (options: any) =>
          options.where.reversesOccurrenceId ? null : occurrence,
      )};
      const movementRepo = {
        find: (jest.fn as unknown as any)().mockResolvedValue([movement]),
      };
      const consumptionRepo = {
        find: (jest.fn as unknown as any)().mockResolvedValue(consumptionRows),
        update: (jest.fn as unknown as any)(),
        delete: (jest.fn as unknown as any)(),
      };
      const gapRepo = {
        find: (jest.fn as unknown as any)().mockResolvedValue(gapRows),
        update: (jest.fn as unknown as any)(),
        delete: (jest.fn as unknown as any)(),
      };
      const productRepo = {
        findOne: (jest.fn as unknown as any)().mockResolvedValue({ id: 'product-1' }),
        update: (jest.fn as unknown as any)(),
      };
      const batchRepo = {
        find: (jest.fn as unknown as any)().mockResolvedValue([]),
        update: (jest.fn as unknown as any)(),
      };
      const manager = {
        getRepository: (jest.fn as unknown as any)().mockImplementation((entity: any) => {
          if (entity === SalesOrder) return salesOrderRepo;
          if (entity === StockOccurrence) return occurrenceRepo;
          if (entity === StockMovement) return movementRepo;
          if (entity === StockBatchConsumption) return consumptionRepo;
          if (entity === StockMovementValuationGap) return gapRepo;
          if (entity === Product) return productRepo;
          if (entity === PurchaseCostHistory) return batchRepo;
          return { findOne: (jest.fn as unknown as any)(), update: (jest.fn as unknown as any)() };
        }),
      };
      dataSource.transaction.mockImplementation(async (callback: any) => callback(manager));

      await expect(
        service.unfulfillOrder('order-1', 'a valid reason', 'u1', 'alice'),
      ).rejects.toThrow(UNFULFILL_EVIDENCE_INCOMPLETE);

      expect(salesOrderRepo.update).not.toHaveBeenCalled();
      expect(productRepo.update).not.toHaveBeenCalled();
      expect(consumptionRepo.update).not.toHaveBeenCalled();
      expect(consumptionRepo.delete).not.toHaveBeenCalled();
      expect(gapRepo.update).not.toHaveBeenCalled();
      expect(gapRepo.delete).not.toHaveBeenCalled();
      expect(batchRepo.update).not.toHaveBeenCalled();
      expect(service['stockMovementService'].create).not.toHaveBeenCalled();
      expect(accountingPort.reverseEntriesForDocument).not.toHaveBeenCalled();
      expect(auditLogService.log).not.toHaveBeenCalled();
      },
    );
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

  });
});
