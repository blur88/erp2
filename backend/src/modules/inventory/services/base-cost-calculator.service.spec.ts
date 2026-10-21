import { jest } from '@jest/globals';
import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BaseCostCalculatorService } from './base-cost-calculator.service';
import { Product } from '../../../database/entities/product.entity';
import { PurchaseCostHistory } from '../../../database/entities/purchase-cost-history.entity';
import { StockBatchConsumption } from '../../../database/entities/stock-batch-consumption.entity';
import { CostingStrategyFactory } from './costing/costing-strategy-factory.service';
import { reconcileToCents, toMinorUnits } from '@common/utils/money';

describe('BaseCostCalculatorService', () => {
  let service: BaseCostCalculatorService;
  let costHistoryRepository: {
    find: any;
    findOne: any;
    update: any;
    create: any;
    save: any;
    delete: any;
  };
  let costingFactory: { getActiveStrategy: any; getCurrentCostingMethod: any };

  beforeEach(async () => {
    costHistoryRepository = {
      find: (jest.fn as unknown as any)(),
      findOne: (jest.fn as unknown as any)(),
      update: (jest.fn as unknown as any)(),
      create: (jest.fn as unknown as any)(),
      save: (jest.fn as unknown as any)(),
      delete: (jest.fn as unknown as any)(),
    };
    costingFactory = {
      getActiveStrategy: (jest.fn as unknown as any)().mockResolvedValue({
        determineBatchReduction: (jest.fn as unknown as any)().mockReturnValue([]),
        calculateBaseCost: (jest.fn as unknown as any)().mockResolvedValue(0),
      }),
      getCurrentCostingMethod: (jest.fn as unknown as any)().mockResolvedValue('FIFO'),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BaseCostCalculatorService,
        { provide: getRepositoryToken(Product), useValue: { findOne: (jest.fn as unknown as any)(), update: (jest.fn as unknown as any)() } },
        { provide: getRepositoryToken(PurchaseCostHistory), useValue: costHistoryRepository },
        { provide: CostingStrategyFactory, useValue: costingFactory },
      ],
    }).compile();
    service = module.get(BaseCostCalculatorService);
  });

  it('reduceStock reads cost-history batches through the supplied manager', async () => {
    const find = (jest.fn as unknown as any)().mockResolvedValue([]); // empty → early return after find
    const manager = { getRepository: (jest.fn as unknown as any)().mockReturnValue({ find, update: (jest.fn as unknown as any)() }) } as any;

    await service.reduceStock('product-1', 5, manager);

    expect(manager.getRepository).toHaveBeenCalled();
    expect(find).toHaveBeenCalled();
  });

  it('planConsumption separates actual batch coverage from uncovered quantity', async () => {
    const batch = {
      id: 'b1',
      productId: 'product-1',
      remainingQuantity: '2.0000',
      landedCost: '5.0000',
    };
    const find = (jest.fn as unknown as any)().mockResolvedValue([batch]);
    const manager = {
      getRepository: (jest.fn as unknown as any)().mockReturnValue({ find, update: (jest.fn as unknown as any)() }),
    } as any;
    costingFactory.getActiveStrategy.mockResolvedValue({
      determineBatchReduction: (jest.fn as unknown as any)().mockReturnValue([{ batchId: 'b1', quantity: 2 }]),
      calculateBaseCost: (jest.fn as unknown as any)(),
    });

    const plans = await service.planConsumption(manager, [{ productId: 'product-1', quantity: 5 }]);

    expect(plans[0]).toEqual(
      expect.objectContaining({
        requestedQuantityMinor: 50000n,
        coveredQuantityMinor: 20000n,
        uncoveredQuantityMinor: 30000n,
        totalScale8: 1000000000n,
      }),
    );
    expect(plans[0].consumptions).toEqual([
      expect.objectContaining({ batchId: 'b1', quantityMinor: 20000n }),
    ]);
  });

  it('reports 5 actually covered units and 3 uncovered when fulfilling 8 units', async () => {
    const batch = {
      id: 'b1',
      productId: 'product-1',
      remainingQuantity: '5.0000',
      landedCost: '5.0000',
    };
    const find = (jest.fn as unknown as any)().mockResolvedValue([batch]);
    const manager = {
      getRepository: (jest.fn as unknown as any)().mockReturnValue({ find, update: (jest.fn as unknown as any)() }),
    } as any;
    costingFactory.getActiveStrategy.mockResolvedValue({
      determineBatchReduction: (jest.fn as unknown as any)().mockReturnValue([{ batchId: 'b1', quantity: 5 }]),
      calculateBaseCost: (jest.fn as unknown as any)(),
    });

    const [plan] = await service.planConsumption(manager, [{ productId: 'product-1', quantity: 8 }]);

    expect(plan.consumptions.map((row) => row.quantityMinor)).toEqual([50000n]);
    expect(plan.coveredQuantityMinor).toBe(50000n);
    expect(plan.uncoveredQuantityMinor).toBe(30000n);
    expect(plan.totalScale8).toBe(2500000000n);
  });

  it('planConsumption treats 8 units with no batches as zero-cost but uncovered (#1406)', async () => {
    const find = (jest.fn as unknown as any)().mockResolvedValue([]);
    const manager = {
      getRepository: (jest.fn as unknown as any)().mockReturnValue({ find, update: (jest.fn as unknown as any)() }),
    } as any;

    const plans = await service.planConsumption(manager, [{ productId: 'svc-1', quantity: 8 }]);

    expect(plans).toHaveLength(1);
    expect(plans[0].totalScale8).toBe(0n);
    expect(plans[0].consumptions).toEqual([]);
    expect(plans[0]).toEqual(
      expect.objectContaining({
        requestedQuantityMinor: 80000n,
        coveredQuantityMinor: 0n,
        uncoveredQuantityMinor: 80000n,
      }),
    );
  });

  describe('physical batch consumption', () => {
    it('consumes batches by received date even when ids sort in the opposite order', async () => {
      const older = {
        id: 'z-old',
        productId: 'p1',
        receivedDate: new Date('2025-01-01'),
        remainingQuantity: '3.0000',
        landedCost: '10.0000',
      };
      const newer = {
        id: 'a-new',
        productId: 'p1',
        receivedDate: new Date('2025-02-01'),
        remainingQuantity: '3.0000',
        landedCost: '20.0000',
      };
      const find = jest.fn(async () => [older, newer]);
      const manager = { getRepository: jest.fn(() => ({ find })) } as any;
      const [plan] = await service.planPhysicalConsumption(manager, [
        { productId: 'p1', quantity: 4 },
      ]);
      expect(find).toHaveBeenCalledWith(
        expect.objectContaining({
          order: { receivedDate: 'ASC', id: 'ASC' },
          lock: { mode: 'pessimistic_write' },
        }),
      );
      expect(
        plan.consumptions.map((row) => [row.batchId, row.quantityMinor]),
      ).toEqual([
        ['z-old', 30000n],
        ['a-new', 10000n],
      ]);
      expect(plan.totalScale8).toBe(5000000000n);
    });

    it('refuses physical consumption when batches do not cover the requested quantity', async () => {
      const find = jest.fn(async () => [
        {
          id: 'b1',
          productId: 'p1',
          receivedDate: new Date(),
          remainingQuantity: '2.0000',
          landedCost: '5.0000',
        },
      ]);
      const manager = { getRepository: jest.fn(() => ({ find })) } as any;
      await expect(
        service.planPhysicalConsumption(manager, [
          { productId: 'p1', quantity: 3 },
        ]),
      ).rejects.toThrow('Stock batches do not cover 1.0000 of p1');
    });

    it('refuses to restore batch provenance beyond the received quantity', async () => {
      const batchRepo = {
        findOne: jest.fn(async () => ({
          id: 'b1',
          productId: 'p1',
          remainingQuantity: '4.0000',
          receivedQuantity: '5.0000',
        })),
        update: jest.fn(),
      };
      const consumptionRepo = {
        find: jest.fn(async () => [{ batchId: 'b1', quantity: '2.0000' }]),
      };
      const manager = {
        getRepository: jest.fn((entity: any) =>
          entity === PurchaseCostHistory ? batchRepo : consumptionRepo,
        ),
        findOne: jest.fn(async () => ({ id: 'movement-1', productId: 'p1', quantity: '-2.0000' })),
      } as any;
      await expect(
        service.restoreConsumptions(manager, 'movement-1'),
      ).rejects.toThrow(
        "This order's recorded stock consumption is incomplete",
      );
      expect(batchRepo.update).not.toHaveBeenCalled();
    });

    it('records exact batch provenance and decrements the physical batch', async () => {
      const batchRepo = {
        findOne: jest.fn(async () => ({ id: 'b1', productId: 'p1', remainingQuantity: '2.0000' })),
        update: jest.fn(),
      };
      const consumptionRepo = {
        create: jest.fn((row) => row),
        save: jest.fn(),
      };
      const manager = {
        getRepository: jest.fn((entity: any) => entity === PurchaseCostHistory ? batchRepo : consumptionRepo),
      } as any;
      jest.spyOn(service as any, 'updateProductBaseCost').mockResolvedValue(0);
      await service.recordConsumptions(manager, 'movement-1', [{ batchId: 'b1', quantityMinor: 10000n, unitCostMinor: 50000n, valueScale8: 500000000n }]);
      expect(batchRepo.update).toHaveBeenCalledWith('b1', expect.objectContaining({ remainingQuantity: '1.0000' }));
      expect(consumptionRepo.create).toHaveBeenCalledWith(expect.objectContaining({ movementId: 'movement-1', batchId: 'b1', quantity: '1.0000', unitCost: '5.0000', valueScale8: '5.00000000' }));
      expect(consumptionRepo.save).toHaveBeenCalled();
    });

    it('restores recorded quantities to their source batches', async () => {
      const batchRepo = {
        findOne: jest.fn(async () => ({
          id: 'b1',
          productId: 'p1',
          remainingQuantity: '3.0000',
          receivedQuantity: '5.0000',
        })),
        update: jest.fn(),
      };
      const consumptionRepo = {
        find: jest.fn(async () => [{ batchId: 'b1', quantity: '2.0000' }]),
      };
      const manager = {
        getRepository: jest.fn((entity: any) =>
          entity === PurchaseCostHistory ? batchRepo : consumptionRepo,
        ),
        findOne: jest.fn(async () => ({
          id: 'movement-1',
          productId: 'p1',
          quantity: '-2.0000',
        })),
      } as any;
      jest.spyOn(service as any, 'updateProductBaseCost').mockResolvedValue(0);
      await expect(service.restoreConsumptions(manager, 'movement-1')).resolves.toEqual(
        new Map([['b1', 20000n]]),
      );
      expect(batchRepo.update).toHaveBeenCalledWith(
        'b1',
        expect.objectContaining({ remainingQuantity: '5.0000' }),
      );
    });
  });

  it('keys addStock batches by purchaseOrderId and returns persisted values', async () => {
    jest.spyOn(service as any, 'updateProductBaseCost').mockResolvedValue(undefined);
    costHistoryRepository.create.mockReturnValue({ id: 'batch-1' });
    costHistoryRepository.save.mockResolvedValue({ id: 'batch-1' });
    costHistoryRepository.findOne.mockResolvedValue({ id: 'batch-1', landedCost: 6, receivedQuantity: 10 });

    const result = await service.addStock('product-1', 'po-1', 10, 5, 1, new Date('2026-06-10'));

    expect(costHistoryRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'product-1',
        purchaseOrderId: 'po-1',
      }),
    );
    expect(result).toEqual({ landedCost: 6, receivedQuantity: 10, batchId: 'batch-1' });
  });

  describe('landed-cost allocation (#1241)', () => {
    it('conserves the PO shipping total across items that do not divide evenly', () => {
      // RM10 shipping across 3 equally-valued items
      const shares = service.allocateShippingByValue(toMinorUnits('10.0000'), [1n, 1n, 1n]);
      expect(shares.reduce((a, b) => a + b, 0n)).toBe(toMinorUnits('10.0000'));
    });

    it('keeps four internal decimals for per-unit allocation', () => {
      const shares = service.allocateShippingByValue(toMinorUnits('10.0000'), [1n, 1n, 1n]);
      expect(shares[0]).toBe(33333n); // 3.3333, not 3.33
    });

    it('conserves the total again after cent reconciliation for posting', () => {
      const shares = service.allocateShippingByValue(toMinorUnits('10.0000'), [1n, 1n, 1n]);
      const cents = reconcileToCents(shares, toMinorUnits('10.0000'));
      expect(cents.reduce((a, b) => a + b, 0n)).toBe(toMinorUnits('10.0000'));
      for (const c of cents) expect(c % 100n).toBe(0n);
    });

    it('allocates proportionally to item value, not unit count', () => {
      const shares = service.allocateShippingByValue(toMinorUnits('100.0000'), [
        toMinorUnits('1000.0000'),
        toMinorUnits('3000.0000'),
      ]);
      expect(shares).toEqual([toMinorUnits('25.0000'), toMinorUnits('75.0000')]);
    });
  });
});
