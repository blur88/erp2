import { jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BaseCostCalculatorService } from './base-cost-calculator.service';
import { Product } from '../../../database/entities/product.entity';
import { PurchaseCostHistory } from '../../../database/entities/purchase-cost-history.entity';
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

  beforeEach(async () => {
    costHistoryRepository = {
      find: (jest.fn as unknown as any)(),
      findOne: (jest.fn as unknown as any)(),
      update: (jest.fn as unknown as any)(),
      create: (jest.fn as unknown as any)(),
      save: (jest.fn as unknown as any)(),
      delete: (jest.fn as unknown as any)(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BaseCostCalculatorService,
        { provide: getRepositoryToken(Product), useValue: { findOne: (jest.fn as unknown as any)(), update: (jest.fn as unknown as any)() } },
        { provide: getRepositoryToken(PurchaseCostHistory), useValue: costHistoryRepository },
        {
          provide: CostingStrategyFactory,
          useValue: {
            getActiveStrategy: (jest.fn as unknown as any)().mockResolvedValue({ determineBatchReduction: (jest.fn as unknown as any)().mockReturnValue([]), calculateBaseCost: (jest.fn as unknown as any)().mockResolvedValue(0) }),
            getCurrentCostingMethod: (jest.fn as unknown as any)().mockResolvedValue('FIFO'),
          },
        },
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
    expect(result).toEqual({ landedCost: 6, receivedQuantity: 10 });
  });

  it('removes stock batches through the supplied manager using purchaseOrderId', async () => {
    jest.spyOn(service as any, 'updateProductBaseCost').mockResolvedValue(undefined);
    const find = (jest.fn as unknown as any)().mockResolvedValue([
      {
        id: 'batch-1',
        productId: 'product-1',
        purchaseOrderId: 'po-1',
        receivedQuantity: 10,
        remainingQuantity: 10,
        landedCost: 6,
      },
    ]);
    const deleteFn = (jest.fn as unknown as any)().mockResolvedValue({ affected: 1 });
    const manager = { getRepository: (jest.fn as unknown as any)().mockReturnValue({ find, delete: deleteFn, update: (jest.fn as unknown as any)() }) } as any;

    await service.removeStock('product-1', 'po-1', manager);

    expect(manager.getRepository).toHaveBeenCalled();
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          productId: 'product-1',
          purchaseOrderId: 'po-1',
        },
      }),
    );
    expect(deleteFn).toHaveBeenCalled();
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
