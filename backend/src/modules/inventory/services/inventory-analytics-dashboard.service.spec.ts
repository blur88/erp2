import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InventoryAnalyticsService } from './inventory-analytics.service';
import { Product } from '../../../database/entities/product.entity';
import { Category } from '../../../database/entities/category.entity';
import { StockMovement } from '../../../database/entities/stock-movement.entity';
import { PurchaseCostHistory } from '../../../database/entities/purchase-cost-history.entity';
import { PriceListItem } from '../../../database/entities/price-list-item.entity';
import { PurchaseOrderItem } from '../../../database/entities/purchase-order-item.entity';
import { SettingsService } from '../../settings/settings.service';

const mockRepo = () => ({ find: jest.fn(), count: jest.fn(), createQueryBuilder: jest.fn() });

function makeQb(rawResult: any = {}, manyResult: any[] = []) {
  const qb: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue(rawResult),
    getRawMany: jest.fn().mockResolvedValue(manyResult),
    getMany: jest.fn().mockResolvedValue(manyResult),
    getRawAndEntities: jest.fn().mockResolvedValue({ entities: manyResult, raw: [] }),
  };
  return qb;
}

describe('InventoryAnalyticsService.getInventoryDashboardAnalytics', () => {
  let service: InventoryAnalyticsService;
  let productRepo: any;
  let categoryRepo: any;
  let stockMovementRepo: any;
  let purchaseOrderItemRepo: any;
  let settingsService: { getRegionalSettings: jest.Mock };

  beforeEach(async () => {
    productRepo = mockRepo();
    categoryRepo = mockRepo();
    stockMovementRepo = mockRepo();
    purchaseOrderItemRepo = mockRepo();
    settingsService = {
      getRegionalSettings: jest.fn().mockResolvedValue({ lowStockThreshold: 10, timezone: 'UTC' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryAnalyticsService,
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: getRepositoryToken(Category), useValue: categoryRepo },
        { provide: getRepositoryToken(StockMovement), useValue: stockMovementRepo },
        { provide: getRepositoryToken(PurchaseCostHistory), useValue: mockRepo() },
        { provide: getRepositoryToken(PriceListItem), useValue: mockRepo() },
        { provide: getRepositoryToken(PurchaseOrderItem), useValue: purchaseOrderItemRepo },
        { provide: SettingsService, useValue: settingsService },
      ],
    }).compile();

    service = module.get<InventoryAnalyticsService>(InventoryAnalyticsService);
  });

  function setupDefaultMocks() {
    productRepo.createQueryBuilder.mockImplementation(() =>
      makeQb({ totalProducts: '5', inventoryValue: '1000', lowStockCount: '1', outOfStockCount: '1' }, []),
    );
    categoryRepo.createQueryBuilder.mockImplementation(() =>
      makeQb({ totalCategories: '2' }, []),
    );
    stockMovementRepo.createQueryBuilder.mockImplementation(() =>
      makeQb({ movementsIn: '0', movementsOut: '0' }, []),
    );
  }

  it('returns current block with correct parsed snapshot metrics', async () => {
    setupDefaultMocks();

    const result = await service.getInventoryDashboardAnalytics({});

    expect(result.current.metrics.totalProducts).toBe(5);
    expect(result.current.metrics.totalCategories).toBe(2);
    expect(result.current.metrics.inventoryValue).toBe(1000);
    expect(result.current.metrics.lowStockCount).toBe(1);
    expect(result.current.metrics.outOfStockCount).toBe(1);
    expect(result.current.metrics.stockMovementsIn).toBe(0);
    expect(result.current.metrics.stockMovementsOut).toBe(0);
    expect(result.current.periodData).toEqual([]);
    expect(result.comparison).toBeUndefined();
    expect(result.lowStockAlerts).toEqual([]);
    expect(result.recentMovements).toEqual([]);
  });

  it('returns comparison block with periodStart before current periodStart for previous_period', async () => {
    setupDefaultMocks();

    const result = await service.getInventoryDashboardAnalytics({ compareWith: 'previous_period' });

    expect(result.comparison).toBeDefined();
    expect(result.comparison!.periodStart < result.current.periodStart).toBe(true);
    expect(result.comparison!.periodEnd < result.current.periodStart).toBe(true);
  });

  it('classifies out_of_stock and low_stock correctly in getLowStockAlerts', async () => {
    productRepo.createQueryBuilder.mockImplementation(() =>
      makeQb(
        { totalProducts: '10', inventoryValue: '5000', lowStockCount: '2', outOfStockCount: '1' },
        [
          { id: 'uuid-1', name: 'Product A', stockQuantity: 0, category: { name: 'Electronics' } },
          { id: 'uuid-2', name: 'Product B', stockQuantity: 3, category: { name: 'Parts' } },
        ],
      ),
    );
    categoryRepo.createQueryBuilder.mockImplementation(() =>
      makeQb({ totalCategories: '3' }, []),
    );
    stockMovementRepo.createQueryBuilder.mockImplementation(() =>
      makeQb({ movementsIn: '5', movementsOut: '2' }, []),
    );

    const result = await service.getInventoryDashboardAnalytics({});

    expect(result.lowStockAlerts).toHaveLength(2);
    expect(result.lowStockAlerts[0].status).toBe('out_of_stock');
    expect(result.lowStockAlerts[0].productName).toBe('Product A');
    expect(result.lowStockAlerts[1].status).toBe('low_stock');
    expect(result.lowStockAlerts[1].stockQuantity).toBe(3);
  });

  it('parses movement totals as numbers (not strings)', async () => {
    productRepo.createQueryBuilder.mockImplementation(() =>
      makeQb({ totalProducts: '3', inventoryValue: '300', lowStockCount: '0', outOfStockCount: '0' }, []),
    );
    categoryRepo.createQueryBuilder.mockImplementation(() =>
      makeQb({ totalCategories: '1' }, []),
    );
    stockMovementRepo.createQueryBuilder.mockImplementation(() =>
      makeQb({ movementsIn: '42', movementsOut: '18' }, []),
    );

    const result = await service.getInventoryDashboardAnalytics({});

    expect(typeof result.current.metrics.stockMovementsIn).toBe('number');
    expect(result.current.metrics.stockMovementsIn).toBe(42);
    expect(result.current.metrics.stockMovementsOut).toBe(18);
  });

  describe('dashboard filters', () => {
    function setupDefaultMocksWithFilters() {
      purchaseOrderItemRepo.createQueryBuilder = jest.fn().mockImplementation(() =>
        makeQb({}, []),
      );
      productRepo.createQueryBuilder.mockImplementation(() =>
        makeQb({ totalProducts: '3', inventoryValue: '600', lowStockCount: '0', outOfStockCount: '0' }, []),
      );
      categoryRepo.createQueryBuilder.mockImplementation(() =>
        makeQb({ totalCategories: '1' }, []),
      );
      stockMovementRepo.createQueryBuilder.mockImplementation(() =>
        makeQb({ movementsIn: '0', movementsOut: '0' }, []),
      );
    }

    it('passes categoryId andWhere to productRepo query builders', async () => {
      setupDefaultMocksWithFilters();
      const categoryId = '550e8400-e29b-41d4-a716-446655440010';

      await service.getInventoryDashboardAnalytics({ categoryId });

      const productQbCalls = productRepo.createQueryBuilder.mock.results;
      expect(productQbCalls.length).toBeGreaterThan(0);
      const firstQb = productQbCalls[0].value;
      expect(firstQb.andWhere).toHaveBeenCalledWith(
        'product.categoryId = :categoryId',
        { categoryId },
      );
    });

    it('returns zeroed metrics when supplierId resolves to no products', async () => {
      purchaseOrderItemRepo.createQueryBuilder = jest.fn().mockImplementation(() =>
        makeQb({}, []),
      );
      productRepo.createQueryBuilder.mockImplementation(() =>
        makeQb({ totalProducts: '0', inventoryValue: '0', lowStockCount: '0', outOfStockCount: '0' }, []),
      );
      categoryRepo.createQueryBuilder.mockImplementation(() =>
        makeQb({ totalCategories: '0' }, []),
      );
      stockMovementRepo.createQueryBuilder.mockImplementation(() =>
        makeQb({ movementsIn: '0', movementsOut: '0' }, []),
      );

      const result = await service.getInventoryDashboardAnalytics({
        supplierId: '550e8400-e29b-41d4-a716-446655440020',
      });

      expect(result.current.metrics.totalProducts).toBe(0);
      expect(result.lowStockAlerts).toEqual([]);
      expect(result.recentMovements).toEqual([]);
    });

    it('passes stockStatus in_stock andWhere to productRepo with stockQuantity > 10', async () => {
      setupDefaultMocksWithFilters();

      await service.getInventoryDashboardAnalytics({ stockStatus: 'in_stock' });

      const productQbCalls = productRepo.createQueryBuilder.mock.results;
      const firstQb = productQbCalls[0].value;
      expect(firstQb.andWhere).toHaveBeenCalledWith(
        'product.stockQuantity > :inStockThreshold',
        { inStockThreshold: 10 },
      );
    });

    it('passes stockStatus low_stock andWhere to productRepo with 0 < stockQuantity <= 10', async () => {
      setupDefaultMocksWithFilters();

      await service.getInventoryDashboardAnalytics({ stockStatus: 'low_stock' });

      const productQbCalls = productRepo.createQueryBuilder.mock.results;
      const firstQb = productQbCalls[0].value;
      expect(firstQb.andWhere).toHaveBeenCalledWith(
        'product.stockQuantity > :lowStockMin AND product.stockQuantity <= :lowStockMax',
        { lowStockMin: 0, lowStockMax: 10 },
      );
    });

    it('passes stockStatus out_of_stock andWhere to productRepo with stockQuantity <= 0', async () => {
      setupDefaultMocksWithFilters();

      await service.getInventoryDashboardAnalytics({ stockStatus: 'out_of_stock' });

      const productQbCalls = productRepo.createQueryBuilder.mock.results;
      const firstQb = productQbCalls[0].value;
      expect(firstQb.andWhere).toHaveBeenCalledWith(
        'product.stockQuantity <= :outOfStockThreshold',
        { outOfStockThreshold: 0 },
      );
    });

    it('applies both categoryId and stockStatus together', async () => {
      setupDefaultMocksWithFilters();
      const categoryId = '550e8400-e29b-41d4-a716-446655440010';

      await service.getInventoryDashboardAnalytics({ categoryId, stockStatus: 'in_stock' });

      const firstQb = productRepo.createQueryBuilder.mock.results[0].value;
      expect(firstQb.andWhere).toHaveBeenCalledWith(
        'product.categoryId = :categoryId',
        { categoryId },
      );
      expect(firstQb.andWhere).toHaveBeenCalledWith(
        'product.stockQuantity > :inStockThreshold',
        { inStockThreshold: 10 },
      );
    });
  });
});
