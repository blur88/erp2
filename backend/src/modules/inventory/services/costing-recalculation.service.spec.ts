import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { CostingRecalculationService } from './costing-recalculation.service';
import { Product } from '../../../database/entities/product.entity';
import { BaseCostCalculatorService } from './base-cost-calculator.service';
import { CostingStrategyFactory } from './costing/costing-strategy-factory.service';

describe('CostingRecalculationService', () => {
  let service: CostingRecalculationService;
  let productRepository: jest.Mocked<Repository<Product>>;
  let baseCostCalculator: jest.Mocked<BaseCostCalculatorService>;
  let costingStrategyFactory: jest.Mocked<CostingStrategyFactory>;

  const makeProduct = (overrides: Partial<Product> = {}): Product =>
    ({
      id: 'prod-1',
      name: 'Product A',
      baseCost: 10,
      isActive: true,
      deletedAt: null,
      ...overrides,
    }) as Product;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CostingRecalculationService,
        {
          provide: getRepositoryToken(Product),
          useValue: { find: jest.fn(), findOne: jest.fn() },
        },
        {
          provide: BaseCostCalculatorService,
          useValue: { updateProductBaseCost: jest.fn() },
        },
        {
          provide: CostingStrategyFactory,
          useValue: { getCurrentCostingMethod: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(CostingRecalculationService);
    productRepository = module.get(getRepositoryToken(Product));
    baseCostCalculator = module.get(BaseCostCalculatorService);
    costingStrategyFactory = module.get(CostingStrategyFactory);
  });

  describe('recalculateAllProductCosts', () => {
    it('queries only active non-deleted products using IsNull()', async () => {
      costingStrategyFactory.getCurrentCostingMethod.mockResolvedValue('FIFO');
      productRepository.find.mockResolvedValue([]);

      await service.recalculateAllProductCosts();

      expect(productRepository.find).toHaveBeenCalledWith({
        where: { isActive: true, deletedAt: IsNull() },
      });
    });

    it('returns correct totals when all updates succeed', async () => {
      const products = [makeProduct({ id: 'p1', baseCost: 10 }), makeProduct({ id: 'p2', baseCost: 20 })];
      costingStrategyFactory.getCurrentCostingMethod.mockResolvedValue('FIFO');
      productRepository.find.mockResolvedValue(products);
      baseCostCalculator.updateProductBaseCost
        .mockResolvedValueOnce(12)
        .mockResolvedValueOnce(22);

      const result = await service.recalculateAllProductCosts();

      expect(result.totalProducts).toBe(2);
      expect(result.updated).toBe(2);
      expect(result.errors).toBe(0);
      expect(result.costingMethod).toBe('FIFO');
      expect(result.results[0]).toMatchObject({ productId: 'p1', oldCost: 10, newCost: 12, success: true });
      expect(result.results[1]).toMatchObject({ productId: 'p2', oldCost: 20, newCost: 22, success: true });
    });

    it('counts errors and keeps going when a product update fails', async () => {
      const products = [makeProduct({ id: 'p1' }), makeProduct({ id: 'p2', name: 'Product B' })];
      costingStrategyFactory.getCurrentCostingMethod.mockResolvedValue('FIFO');
      productRepository.find.mockResolvedValue(products);
      baseCostCalculator.updateProductBaseCost
        .mockRejectedValueOnce(new Error('calc failed'))
        .mockResolvedValueOnce(15);

      const result = await service.recalculateAllProductCosts();

      expect(result.updated).toBe(1);
      expect(result.errors).toBe(1);
      expect(result.results[0]).toMatchObject({ success: false, error: 'calc failed' });
      expect(result.results[1]).toMatchObject({ success: true, newCost: 15 });
    });

    it('returns empty results when no active products exist', async () => {
      costingStrategyFactory.getCurrentCostingMethod.mockResolvedValue('WAC');
      productRepository.find.mockResolvedValue([]);

      const result = await service.recalculateAllProductCosts();

      expect(result.totalProducts).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.errors).toBe(0);
      expect(result.results).toEqual([]);
    });
  });

  describe('recalculateProductCost', () => {
    it('throws when product is not found', async () => {
      productRepository.findOne.mockResolvedValue(null);

      await expect(service.recalculateProductCost('missing-id')).rejects.toThrow(
        'Product missing-id not found',
      );
    });

    it('returns old and new cost with costing method', async () => {
      const product = makeProduct({ id: 'p1', baseCost: 10 });
      productRepository.findOne.mockResolvedValue(product);
      costingStrategyFactory.getCurrentCostingMethod.mockResolvedValue('FIFO');
      baseCostCalculator.updateProductBaseCost.mockResolvedValue(18);

      const result = await service.recalculateProductCost('p1');

      expect(result).toEqual({
        productId: 'p1',
        productName: 'Product A',
        oldCost: 10,
        newCost: 18,
        costingMethod: 'FIFO',
      });
    });
  });
});
