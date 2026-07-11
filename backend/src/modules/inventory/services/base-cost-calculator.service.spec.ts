import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BaseCostCalculatorService } from './base-cost-calculator.service';
import { Product } from '../../../database/entities/product.entity';
import { PurchaseCostHistory } from '../../../database/entities/purchase-cost-history.entity';
import { CostingStrategyFactory } from './costing/costing-strategy-factory.service';

describe('BaseCostCalculatorService', () => {
  let service: BaseCostCalculatorService;
  let costHistoryRepository: {
    find: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    costHistoryRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BaseCostCalculatorService,
        { provide: getRepositoryToken(Product), useValue: { findOne: jest.fn(), update: jest.fn() } },
        { provide: getRepositoryToken(PurchaseCostHistory), useValue: costHistoryRepository },
        {
          provide: CostingStrategyFactory,
          useValue: {
            getActiveStrategy: jest.fn().mockResolvedValue({ determineBatchReduction: jest.fn().mockReturnValue([]), calculateBaseCost: jest.fn().mockResolvedValue(0) }),
            getCurrentCostingMethod: jest.fn().mockResolvedValue('FIFO'),
          },
        },
      ],
    }).compile();
    service = module.get(BaseCostCalculatorService);
  });

  it('reduceStock reads cost-history batches through the supplied manager', async () => {
    const find = jest.fn().mockResolvedValue([]); // empty → early return after find
    const manager = { getRepository: jest.fn().mockReturnValue({ find, update: jest.fn() }) } as any;

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
    const find = jest.fn().mockResolvedValue([
      {
        id: 'batch-1',
        productId: 'product-1',
        purchaseOrderId: 'po-1',
        receivedQuantity: 10,
        remainingQuantity: 10,
        landedCost: 6,
      },
    ]);
    const deleteFn = jest.fn().mockResolvedValue({ affected: 1 });
    const manager = { getRepository: jest.fn().mockReturnValue({ find, delete: deleteFn, update: jest.fn() }) } as any;

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
});
