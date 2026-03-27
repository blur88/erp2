import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { InventoryAnalyticsService } from './inventory-analytics.service';
import { Product } from '../../../database/entities/product.entity';
import { Category } from '../../../database/entities/category.entity';
import { StockMovement } from '../../../database/entities/stock-movement.entity';
import { PurchaseCostHistory } from '../../../database/entities/purchase-cost-history.entity';
import { PriceListItem } from '../../../database/entities/price-list-item.entity';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { PurchaseOrder } from '../../../database/entities/purchase-order.entity';
import { StockAdjustment } from '../../../database/entities/stock-adjustment.entity';

const mockRepo = () => ({ find: jest.fn(), count: jest.fn(), createQueryBuilder: jest.fn() });

function makeQb(rawResult: any = [], manyResult: any[] = []) {
  const qb: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
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

  beforeEach(async () => {
    productRepo = mockRepo();
    categoryRepo = mockRepo();
    stockMovementRepo = mockRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryAnalyticsService,
        { provide: getRepositoryToken(Product), useValue: productRepo },
        { provide: getRepositoryToken(Category), useValue: categoryRepo },
        { provide: getRepositoryToken(StockMovement), useValue: stockMovementRepo },
        { provide: getRepositoryToken(PurchaseCostHistory), useValue: mockRepo() },
        { provide: getRepositoryToken(PriceListItem), useValue: mockRepo() },
        { provide: getRepositoryToken(SalesOrder), useValue: mockRepo() },
        { provide: getRepositoryToken(PurchaseOrder), useValue: mockRepo() },
        { provide: getRepositoryToken(StockAdjustment), useValue: mockRepo() },
      ],
    }).compile();

    service = module.get<InventoryAnalyticsService>(InventoryAnalyticsService);
  });

  it('returns current block with snapshot metrics and empty period data when no movements', async () => {
    productRepo.createQueryBuilder.mockImplementation(() =>
      makeQb(
        {
          totalProducts: '5',
          inventoryValue: '1000',
          lowStockCount: '1',
          outOfStockCount: '1',
        },
        [],
      ),
    );
    categoryRepo.createQueryBuilder.mockImplementation(() =>
      makeQb({ totalCategories: '2' }, []),
    );
    stockMovementRepo.createQueryBuilder.mockImplementation(() =>
      makeQb({ movementsIn: '0', movementsOut: '0' }, []),
    );

    const result = await service.getInventoryDashboardAnalytics({});

    expect(result.current).toBeDefined();
    expect(result.current.metrics.totalProducts).toBe(5);
    expect(result.current.metrics.inventoryValue).toBe(1000);
    expect(result.current.periodData).toEqual([]);
    expect(result.comparison).toBeUndefined();
    expect(result.lowStockAlerts).toEqual([]);
    expect(result.recentMovements).toEqual([]);
  });

  it('returns comparison block when compareWith is set', async () => {
    productRepo.createQueryBuilder.mockImplementation(() =>
      makeQb(
        {
          totalProducts: '5',
          inventoryValue: '500',
          lowStockCount: '0',
          outOfStockCount: '0',
        },
        [],
      ),
    );
    categoryRepo.createQueryBuilder.mockImplementation(() =>
      makeQb({ totalCategories: '2' }, []),
    );
    stockMovementRepo.createQueryBuilder.mockImplementation(() =>
      makeQb({ movementsIn: '10', movementsOut: '5' }, []),
    );

    const result = await service.getInventoryDashboardAnalytics({ compareWith: 'previous_period' });

    expect(result.comparison).toBeDefined();
    expect(result.comparison!.periodStart).toBeDefined();
  });
});
