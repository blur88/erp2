# Inventory Dashboard Filters (Issue #219) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Stock Status, Category, and Supplier filters to the Inventory Overview dashboard, applying to all dashboard components.

**Architecture:** Extend `useDashboardFilters` with `categoryId` and `stockStatus` fields (URL-persisted), inject `PurchaseOrderItem` repository into `InventoryAnalyticsService` to resolve supplier→productIds, and thread a `filters` object through all five private dashboard sub-methods.

**Tech Stack:** NestJS 11, TypeORM, class-validator, React 19, MUI v7, RTK Query, Vitest, Jest

---

## File Map

| File | Change |
|---|---|
| `backend/src/modules/inventory/dto/inventory-analytics.dto.ts` | Add `categoryId`, `supplierId`, `stockStatus` to `InventoryAnalyticsQueryDto` |
| `backend/src/modules/inventory/services/inventory-analytics.service.ts` | Inject `PurchaseOrderItem` repo; add `InventoryDashboardFilters` interface; thread filters through all 5 sub-methods |
| `backend/src/modules/inventory/services/inventory-analytics-dashboard.service.spec.ts` | Add filter test cases |
| `frontend/src/hooks/useDashboardFilters.ts` | Add `categoryId`, `stockStatus`, `StockStatusFilter` type, `VALID_STOCK_STATUSES` |
| `frontend/src/hooks/useDashboardFilters.test.ts` | Add `categoryId` and `stockStatus` test cases |
| `frontend/src/components/filters/DashboardFilterBar.tsx` | Add `categories`, `categoryId`, `onCategoryChange`, `stockStatus`, `onStockStatusChange` props and dropdowns |
| `frontend/src/components/filters/__tests__/DashboardFilterBar.test.tsx` | Add Category and Stock Status render/interaction tests |
| `frontend/src/pages/inventory/hooks/useInventoryAnalytics.ts` | Add `categoryId`, `supplierId`, `stockStatus` to `InventoryAnalyticsParams` |
| `frontend/src/pages/inventory/InventoryPage.tsx` | Fetch suppliers/categories; wire new filter props |
| `frontend/src/pages/inventory/__tests__/InventoryPage.filters.test.tsx` | New smoke test file |

---

## Task 1: Extend backend DTO

**Files:**
- Modify: `backend/src/modules/inventory/dto/inventory-analytics.dto.ts`

- [ ] **Step 1: Add the three new fields**

Open `backend/src/modules/inventory/dto/inventory-analytics.dto.ts` and add after the existing `groupBy` field:

```ts
import { IsOptional, IsEnum, IsIn, IsDate, IsUUID } from 'class-validator';
```

(update the existing import line to add `IsUUID`)

Then add at the end of `InventoryAnalyticsQueryDto`:

```ts
  @ApiPropertyOptional({ description: 'Filter by category ID' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Filter by supplier ID' })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional({ enum: ['in_stock', 'low_stock', 'out_of_stock'] })
  @IsOptional()
  @IsIn(['in_stock', 'low_stock', 'out_of_stock'])
  stockStatus?: 'in_stock' | 'low_stock' | 'out_of_stock';
```

- [ ] **Step 2: Run the backend tests to confirm no regression**

```bash
cd backend && npx jest src/modules/inventory/services/inventory-analytics-dashboard.service.spec.ts --no-coverage
```

Expected: all existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/inventory/dto/inventory-analytics.dto.ts
git commit -m "feat(inventory): add categoryId, supplierId, stockStatus to InventoryAnalyticsQueryDto (#219)"
```

---

## Task 2: Thread filters through inventory analytics service

**Files:**
- Modify: `backend/src/modules/inventory/services/inventory-analytics.service.ts`

- [ ] **Step 1: Write failing tests for filter behavior**

Add the following describe block at the end of `backend/src/modules/inventory/services/inventory-analytics-dashboard.service.spec.ts`:

```ts
import { PurchaseOrderItem } from '../../../database/entities/purchase-order-item.entity';
```

Add to the `providers` array in `beforeEach`:
```ts
{ provide: getRepositoryToken(PurchaseOrderItem), useValue: mockRepo() },
```

Also add `let purchaseOrderItemRepo: any;` in the outer scope and `purchaseOrderItemRepo = mockRepo();` in `beforeEach`, then:

```ts
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && npx jest src/modules/inventory/services/inventory-analytics-dashboard.service.spec.ts --no-coverage
```

Expected: new tests FAIL (service doesn't accept filters yet).

- [ ] **Step 3: Inject PurchaseOrderItem repo and add filters interface**

At the top of `inventory-analytics.service.ts`, add to imports:

```ts
import { PurchaseOrderItem } from '../../../database/entities/purchase-order-item.entity';
```

Add to the existing `import { Repository, Between, MoreThan, In } from 'typeorm';` line (no change needed, `In` already imported).

Add the interface just before the `@Injectable()` decorator:

```ts
interface InventoryDashboardFilters {
  categoryId?: string;
  productIds?: string[];
  stockStatus?: 'in_stock' | 'low_stock' | 'out_of_stock';
}
```

Add the injection to the constructor (after existing repos):

```ts
    @InjectRepository(PurchaseOrderItem)
    private readonly purchaseOrderItemRepository: Repository<PurchaseOrderItem>,
```

- [ ] **Step 4: Update `getInventoryDashboardAnalytics` to resolve filters**

Replace the existing `getInventoryDashboardAnalytics` method body:

```ts
  async getInventoryDashboardAnalytics(
    query: InventoryAnalyticsQueryDto,
  ): Promise<InventoryAnalyticsResponseDto> {
    const { startDate, endDate } = this.resolveInventoryDateRange(
      query.dateRange,
      query.startDate,
      query.endDate,
    );
    const groupBy = query.groupBy ?? GroupByPeriod.DAY;
    const comparePeriod = query.compareWith
      ? this.computeInventoryComparePeriod(startDate, endDate, query.compareWith)
      : null;

    // Resolve supplier filter to product IDs upfront
    const filters: InventoryDashboardFilters = {
      categoryId: query.categoryId,
      stockStatus: query.stockStatus,
    };

    if (query.supplierId) {
      const items = await this.purchaseOrderItemRepository
        .createQueryBuilder('poi')
        .innerJoin('poi.purchaseOrder', 'po')
        .where('po.supplierId = :supplierId', { supplierId: query.supplierId })
        .select('DISTINCT poi.productId', 'productId')
        .getRawMany();
      filters.productIds = items.map((r: any) => r.productId as string);
    }

    const [snapshotMetrics, movementTotals, periodData, lowStockAlerts, recentMovements] =
      await Promise.all([
        this.getInventorySnapshotMetrics(filters),
        this.getInventoryMovementTotals(startDate, endDate, filters),
        this.getInventoryPeriodData(startDate, endDate, groupBy, filters),
        this.getLowStockAlerts(10, filters),
        this.getRecentMovements(startDate, endDate, 5, filters),
      ]);

    const currentMetrics: InventoryMetricsDto = { ...snapshotMetrics, ...movementTotals };

    const current: InventoryPeriodBlockDto = {
      metrics: currentMetrics,
      periodData,
      periodStart: startDate.toISOString().split('T')[0],
      periodEnd: endDate.toISOString().split('T')[0],
    };

    let comparison: InventoryPeriodBlockDto | undefined;
    if (comparePeriod) {
      const [compareMovementTotals, comparePeriodData] = await Promise.all([
        this.getInventoryMovementTotals(comparePeriod.compareStart, comparePeriod.compareEnd, filters),
        this.getInventoryPeriodData(comparePeriod.compareStart, comparePeriod.compareEnd, groupBy, filters),
      ]);
      const compareMetrics: InventoryMetricsDto = { ...snapshotMetrics, ...compareMovementTotals };
      comparison = {
        metrics: compareMetrics,
        periodData: comparePeriodData,
        periodStart: comparePeriod.compareStart.toISOString().split('T')[0],
        periodEnd: comparePeriod.compareEnd.toISOString().split('T')[0],
      };
    }

    return { current, comparison, lowStockAlerts, recentMovements };
  }
```

- [ ] **Step 5: Add `applyProductFilters` helper and update all five sub-methods**

Add this private helper before `resolveInventoryDateRange`:

```ts
  private applyProductFilters(
    qb: import('typeorm').SelectQueryBuilder<any>,
    filters: InventoryDashboardFilters,
    productAlias: string = 'product',
  ): void {
    if (filters.categoryId) {
      qb.andWhere(`${productAlias}.categoryId = :categoryId`, { categoryId: filters.categoryId });
    }
    if (filters.productIds !== undefined) {
      if (filters.productIds.length === 0) {
        qb.andWhere('1 = 0');
      } else {
        qb.andWhere(`${productAlias}.id IN (:...productIds)`, { productIds: filters.productIds });
      }
    }
    if (filters.stockStatus === 'in_stock') {
      qb.andWhere(`${productAlias}.stockQuantity > :inStockThreshold`, { inStockThreshold: 10 });
    } else if (filters.stockStatus === 'low_stock') {
      qb.andWhere(
        `${productAlias}.stockQuantity > :lowStockMin AND ${productAlias}.stockQuantity <= :lowStockMax`,
        { lowStockMin: 0, lowStockMax: 10 },
      );
    } else if (filters.stockStatus === 'out_of_stock') {
      qb.andWhere(`${productAlias}.stockQuantity <= :outOfStockThreshold`, { outOfStockThreshold: 0 });
    }
  }
```

Update `getInventorySnapshotMetrics` signature and body:

```ts
  private async getInventorySnapshotMetrics(
    filters: InventoryDashboardFilters = {},
  ): Promise<Omit<InventoryMetricsDto, 'stockMovementsIn' | 'stockMovementsOut'>> {
    const qb = this.productRepository
      .createQueryBuilder('product')
      .leftJoin('product.category', 'category')
      .where('product.deletedAt IS NULL')
      .andWhere('product.isActive = :isActive', { isActive: true })
      .select([
        'COUNT(*) as "totalProducts"',
        'COALESCE(SUM(product.baseCost * product.stockQuantity), 0) as "inventoryValue"',
        'SUM(CASE WHEN product.stockQuantity <= 0 THEN 1 ELSE 0 END) as "outOfStockCount"',
        'SUM(CASE WHEN product.stockQuantity > 0 AND product.stockQuantity <= 10 THEN 1 ELSE 0 END) as "lowStockCount"',
      ]);

    this.applyProductFilters(qb, filters);
    const products = await qb.getRawOne();

    const totalCategories = await this.categoryRepository
      .createQueryBuilder('category')
      .where('category.isActive = :isActive', { isActive: true })
      .select('COUNT(*) as "totalCategories"')
      .getRawOne();

    return {
      totalProducts: parseInt(products?.totalProducts, 10) || 0,
      totalCategories: parseInt(totalCategories?.totalCategories, 10) || 0,
      inventoryValue: parseFloat(products?.inventoryValue) || 0,
      lowStockCount: parseInt(products?.lowStockCount, 10) || 0,
      outOfStockCount: parseInt(products?.outOfStockCount, 10) || 0,
    };
  }
```

Update `getInventoryMovementTotals` signature and body:

```ts
  private async getInventoryMovementTotals(
    startDate: Date,
    endDate: Date,
    filters: InventoryDashboardFilters = {},
  ): Promise<Pick<InventoryMetricsDto, 'stockMovementsIn' | 'stockMovementsOut'>> {
    const qb = this.stockMovementRepository
      .createQueryBuilder('movement')
      .where('movement.movementDate BETWEEN :startDate AND :endDate', { startDate, endDate });

    if (filters.categoryId || filters.productIds !== undefined || filters.stockStatus) {
      qb.innerJoin('movement.product', 'product');
      this.applyProductFilters(qb, filters);
    }

    qb.select([
      'COALESCE(SUM(CASE WHEN movement.quantity > 0 THEN movement.quantity ELSE 0 END), 0) as "movementsIn"',
      'COALESCE(SUM(CASE WHEN movement.quantity < 0 THEN ABS(movement.quantity) ELSE 0 END), 0) as "movementsOut"',
    ]);

    const result = await qb.getRawOne();

    return {
      stockMovementsIn: parseFloat(result?.movementsIn) || 0,
      stockMovementsOut: parseFloat(result?.movementsOut) || 0,
    };
  }
```

Update `getInventoryPeriodData` signature and body:

```ts
  private async getInventoryPeriodData(
    startDate: Date,
    endDate: Date,
    groupBy: GroupByPeriod,
    filters: InventoryDashboardFilters = {},
  ): Promise<InventoryPeriodDataDto[]> {
    let dateFormat: string;

    switch (groupBy) {
      case GroupByPeriod.DAY:
        dateFormat = 'YYYY-MM-DD';
        break;
      case GroupByPeriod.WEEK:
        dateFormat = 'IYYY-IW';
        break;
      case GroupByPeriod.QUARTER:
        dateFormat = 'YYYY-"Q"Q';
        break;
      case GroupByPeriod.YEAR:
        dateFormat = 'YYYY';
        break;
      default:
        dateFormat = 'YYYY-MM';
        break;
    }

    const qb = this.stockMovementRepository
      .createQueryBuilder('movement')
      .where('movement.movementDate BETWEEN :startDate AND :endDate', { startDate, endDate });

    if (filters.categoryId || filters.productIds !== undefined || filters.stockStatus) {
      qb.innerJoin('movement.product', 'product');
      this.applyProductFilters(qb, filters);
    }

    qb.select([
        `TO_CHAR(movement.movementDate, '${dateFormat}') as period`,
        'COALESCE(SUM(CASE WHEN movement.quantity > 0 THEN movement.quantity ELSE 0 END), 0) as "movementsIn"',
        'COALESCE(SUM(CASE WHEN movement.quantity < 0 THEN ABS(movement.quantity) ELSE 0 END), 0) as "movementsOut"',
      ])
      .groupBy(`TO_CHAR(movement.movementDate, '${dateFormat}')`)
      .orderBy(`TO_CHAR(movement.movementDate, '${dateFormat}')`, 'ASC');

    const data = await qb.getRawMany();

    return data.map((item) => ({
      period: item.period,
      movementsIn: parseFloat(item.movementsIn) || 0,
      movementsOut: parseFloat(item.movementsOut) || 0,
    }));
  }
```

Update `getLowStockAlerts` signature and body:

```ts
  private async getLowStockAlerts(
    limit: number,
    filters: InventoryDashboardFilters = {},
  ): Promise<LowStockAlertDto[]> {
    const qb = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .where('product.deletedAt IS NULL')
      .andWhere('product.isActive = :isActive', { isActive: true })
      .andWhere('product.stockQuantity <= :threshold', { threshold: 10 });

    if (filters.categoryId) {
      qb.andWhere('product.categoryId = :categoryId', { categoryId: filters.categoryId });
    }
    if (filters.productIds !== undefined) {
      if (filters.productIds.length === 0) {
        qb.andWhere('1 = 0');
      } else {
        qb.andWhere('product.id IN (:...productIds)', { productIds: filters.productIds });
      }
    }
    // stockStatus not applied here: this method is already scoped to low/out-of-stock

    qb.orderBy('product.stockQuantity', 'ASC').limit(limit);

    const products = await qb.getMany();

    return products.map((product) => ({
      productId: product.id,
      productName: product.name,
      categoryName: product.category?.name || 'Uncategorized',
      stockQuantity: parseFloat(product.stockQuantity?.toString() || '0'),
      status:
        parseFloat(product.stockQuantity?.toString() || '0') <= 0
          ? 'out_of_stock'
          : 'low_stock',
    }));
  }
```

Update `getRecentMovements` signature and body:

```ts
  private async getRecentMovements(
    startDate: Date,
    endDate: Date,
    limit: number,
    filters: InventoryDashboardFilters = {},
  ): Promise<RecentMovementDto[]> {
    const qb = this.stockMovementRepository
      .createQueryBuilder('movement')
      .leftJoinAndSelect('movement.product', 'product')
      .leftJoin('sales_orders', 'so', 'movement.referenceType = \'sales_order\' AND movement.referenceId = so.id')
      .leftJoin('purchase_orders', 'po', 'movement.referenceType = \'purchase_order\' AND movement.referenceId = po.id')
      .leftJoin('stock_adjustments', 'sa', 'movement.referenceType = \'stock_adjustment\' AND movement.referenceId = sa.id')
      .addSelect('COALESCE(so.orderNumber, po.orderNumber, sa.adjustmentNumber, \'-\')', 'orderNumberResolved')
      .where('movement.movementDate BETWEEN :startDate AND :endDate', { startDate, endDate });

    if (filters.categoryId || filters.productIds !== undefined || filters.stockStatus) {
      this.applyProductFilters(qb, filters);
    }

    qb.orderBy('movement.movementDate', 'DESC').limit(limit);

    const { entities: movements, raw: rawResults } = await qb.getRawAndEntities();

    const orderNumberMap = new Map<string, string>();
    rawResults.forEach((raw: any) => {
      orderNumberMap.set(raw.movement_id, raw.orderNumberResolved || '-');
    });

    return movements.map((movement) => {
      const date = movement.movementDate instanceof Date
        ? movement.movementDate
        : new Date(movement.movementDate);

      return {
        movementDate: date.toISOString().split('T')[0],
        productName: movement.product?.name || 'Unknown',
        movementType: movement.movementType || '',
        quantity: parseFloat(movement.quantity?.toString() || '0'),
        referenceNumber: orderNumberMap.get(movement.id) || '-',
      };
    });
  }
```

- [ ] **Step 6: Run all service tests**

```bash
cd backend && npx jest src/modules/inventory/services/inventory-analytics-dashboard.service.spec.ts --no-coverage
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/inventory/services/inventory-analytics.service.ts \
        backend/src/modules/inventory/services/inventory-analytics-dashboard.service.spec.ts
git commit -m "feat(inventory): thread categoryId/supplierId/stockStatus filters through dashboard analytics service (#219)"
```

---

## Task 3: Extend `useDashboardFilters` with `categoryId` and `stockStatus`

**Files:**
- Modify: `frontend/src/hooks/useDashboardFilters.ts`
- Modify: `frontend/src/hooks/useDashboardFilters.test.ts`

- [ ] **Step 1: Write failing tests**

Add the following describe block at the end of `frontend/src/hooks/useDashboardFilters.test.ts` (inside the outer `describe`):

```ts
  describe('new filters: categoryId, stockStatus', () => {
    it('returns null for categoryId and stockStatus when URL is empty', () => {
      setUrl('')
      const { result } = renderHook(() => useDashboardFilters('inventory'))
      expect(result.current.categoryId).toBeNull()
      expect(result.current.stockStatus).toBeNull()
    })

    it('reads valid UUID categoryId from URL on mount', () => {
      setUrl('?inventory_category=550e8400-e29b-41d4-a716-446655440010')
      const { result } = renderHook(() => useDashboardFilters('inventory'))
      expect(result.current.categoryId).toBe('550e8400-e29b-41d4-a716-446655440010')
    })

    it('ignores non-UUID categoryId from URL', () => {
      setUrl('?inventory_category=not-a-uuid')
      const { result } = renderHook(() => useDashboardFilters('inventory'))
      expect(result.current.categoryId).toBeNull()
    })

    it('reads valid stockStatus from URL on mount', () => {
      setUrl('?inventory_stock_status=low_stock')
      const { result } = renderHook(() => useDashboardFilters('inventory'))
      expect(result.current.stockStatus).toBe('low_stock')
    })

    it('ignores invalid stockStatus value from URL', () => {
      setUrl('?inventory_stock_status=garbage')
      const { result } = renderHook(() => useDashboardFilters('inventory'))
      expect(result.current.stockStatus).toBeNull()
    })

    it('setCategoryId updates state and writes to URL', () => {
      setUrl('')
      const replaceState = vi.fn()
      vi.stubGlobal('history', { replaceState })
      const { result } = renderHook(() => useDashboardFilters('inventory'))
      act(() => { result.current.setCategoryId('550e8400-e29b-41d4-a716-446655440010') })
      expect(result.current.categoryId).toBe('550e8400-e29b-41d4-a716-446655440010')
      expect(replaceState).toHaveBeenCalled()
    })

    it('setStockStatus updates state and writes to URL', () => {
      setUrl('')
      const replaceState = vi.fn()
      vi.stubGlobal('history', { replaceState })
      const { result } = renderHook(() => useDashboardFilters('inventory'))
      act(() => { result.current.setStockStatus('in_stock') })
      expect(result.current.stockStatus).toBe('in_stock')
      expect(replaceState).toHaveBeenCalled()
    })

    it('reset clears categoryId and stockStatus', () => {
      setUrl('?inventory_category=550e8400-e29b-41d4-a716-446655440010&inventory_stock_status=in_stock')
      const { result } = renderHook(() => useDashboardFilters('inventory'))
      act(() => { result.current.reset() })
      expect(result.current.categoryId).toBeNull()
      expect(result.current.stockStatus).toBeNull()
    })

    it('isDefault is false when categoryId is set', () => {
      setUrl('?inventory_category=550e8400-e29b-41d4-a716-446655440010')
      const { result } = renderHook(() => useDashboardFilters('inventory'))
      expect(result.current.isDefault).toBe(false)
    })

    it('isDefault is false when stockStatus is set', () => {
      setUrl('?inventory_stock_status=out_of_stock')
      const { result } = renderHook(() => useDashboardFilters('inventory'))
      expect(result.current.isDefault).toBe(false)
    })

    it('resolvedApiParams includes categoryId when set', () => {
      setUrl('?inventory_category=550e8400-e29b-41d4-a716-446655440010')
      const { result } = renderHook(() => useDashboardFilters('inventory'))
      expect(result.current.resolvedApiParams.categoryId).toBe('550e8400-e29b-41d4-a716-446655440010')
    })

    it('resolvedApiParams includes stockStatus when set', () => {
      setUrl('?inventory_stock_status=low_stock')
      const { result } = renderHook(() => useDashboardFilters('inventory'))
      expect(result.current.resolvedApiParams.stockStatus).toBe('low_stock')
    })
  })
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npx vitest run src/hooks/useDashboardFilters.test.ts
```

Expected: new tests FAIL (`categoryId` and `stockStatus` not on result).

- [ ] **Step 3: Implement `categoryId` and `stockStatus` in `useDashboardFilters`**

In `frontend/src/hooks/useDashboardFilters.ts`, make the following changes:

**Add type exports after `PaymentStatusFilter`:**
```ts
export type StockStatusFilter = 'in_stock' | 'low_stock' | 'out_of_stock'
```

**Add constant after `VALID_PAYMENT_STATUSES`:**
```ts
const VALID_STOCK_STATUSES: StockStatusFilter[] = ['in_stock', 'low_stock', 'out_of_stock']
```

**Add `categoryId` and `stockStatus` to `DashboardResolvedApiParams`:**
```ts
  categoryId?: string
  stockStatus?: string
```

**Add `categoryId` and `stockStatus` to the `parseUrl` return type annotation and implementation:**

In the return type of `parseUrl`, add:
```ts
  categoryId: string | null
  stockStatus: StockStatusFilter | null
```

In the function body, add after `rawPayment`:
```ts
  const rawCategory = params.get(`${namespace}_category`) ?? null
  const rawStockStatus = params.get(`${namespace}_stock_status`) ?? null
```

Add parsing:
```ts
  const categoryId = rawCategory && UUID_RE.test(rawCategory) ? rawCategory : null
  const stockStatus: StockStatusFilter | null =
    rawStockStatus && VALID_STOCK_STATUSES.includes(rawStockStatus as StockStatusFilter)
      ? (rawStockStatus as StockStatusFilter)
      : null
```

Add both to all return statements inside `parseUrl`:
```ts
  categoryId,
  stockStatus,
```

**Add to `writeUrl` signature** (after `paymentStatus` param):
```ts
  categoryId: string | null,
  stockStatus: StockStatusFilter | null,
```

Add to `writeUrl` body (after paymentStatus block):
```ts
  if (categoryId) {
    params.set(`${namespace}_category`, categoryId)
  }
  if (stockStatus) {
    params.set(`${namespace}_stock_status`, stockStatus)
  }
```

**Update ALL calls to `writeUrl`** inside the hook (there are ~9 calls) to pass `categoryId` and `stockStatus` as the last two arguments. For example:
```ts
writeUrl(namespace, next, compareWith, nextFrom, nextTo, customerId, supplierId, isFulfilled, status, paymentStatus, categoryId, stockStatus)
```

**Add state variables** after `paymentStatus` state:
```ts
  const [categoryId, setCategoryIdState] = useState<string | null>(initial.categoryId)
  const [stockStatus, setStockStatusState] = useState<StockStatusFilter | null>(initial.stockStatus)
```

**Add setter callbacks** after `setPaymentStatus`:
```ts
  const setCategoryId = useCallback((next: string | null) => {
    setCategoryIdState(next)
    writeUrl(namespace, period, compareWith, customFrom, customTo, customerId, supplierId, isFulfilled, status, paymentStatus, next, stockStatus)
  }, [namespace, period, compareWith, customFrom, customTo, customerId, supplierId, isFulfilled, status, paymentStatus, stockStatus])

  const setStockStatus = useCallback((next: StockStatusFilter | null) => {
    setStockStatusState(next)
    writeUrl(namespace, period, compareWith, customFrom, customTo, customerId, supplierId, isFulfilled, status, paymentStatus, categoryId, next)
  }, [namespace, period, compareWith, customFrom, customTo, customerId, supplierId, isFulfilled, status, paymentStatus, categoryId])
```

**Update `reset`** to clear new fields:
```ts
    setCategoryIdState(null)
    setStockStatusState(null)
    writeUrl(namespace, 'this_month', null, null, null, null, null, null, null, null, null, null)
```

**Update `isDefault`** to include new fields:
```ts
  const isDefault = period === 'this_month'
    && compareWith === null
    && customerId === null
    && supplierId === null
    && isFulfilled === null
    && status === null
    && paymentStatus === null
    && categoryId === null
    && stockStatus === null
```

**Update `resolvedApiParams`** to include new fields:
```ts
      ...(categoryId ? { categoryId } : {}),
      ...(stockStatus ? { stockStatus } : {}),
```

**Update the return object** to expose new fields and setters:
```ts
    categoryId,
    stockStatus,
    setCategoryId,
    setStockStatus,
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && npx vitest run src/hooks/useDashboardFilters.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useDashboardFilters.ts \
        frontend/src/hooks/useDashboardFilters.test.ts
git commit -m "feat(inventory): add categoryId and stockStatus to useDashboardFilters (#219)"
```

---

## Task 4: Add Category and Stock Status dropdowns to `DashboardFilterBar`

**Files:**
- Modify: `frontend/src/components/filters/DashboardFilterBar.tsx`
- Modify: `frontend/src/components/filters/__tests__/DashboardFilterBar.test.tsx`

- [ ] **Step 1: Write failing tests**

Add the following tests to the `describe('DashboardFilterBar')` block in `DashboardFilterBar.test.tsx`:

```ts
  it('does not render Category select when categories prop is absent', () => {
    wrap(<DashboardFilterBar {...baseProps()} />)
    expect(screen.queryByLabelText('Category')).toBeNull()
  })

  it('does not render Stock Status select when stockStatus prop is absent', () => {
    wrap(<DashboardFilterBar {...baseProps()} />)
    expect(screen.queryByLabelText('Stock Status')).toBeNull()
  })

  it('renders Category select when categories prop is provided', () => {
    wrap(
      <DashboardFilterBar
        {...baseProps()}
        categories={[{ id: 'cat1', name: 'Electronics' }]}
        categoryId={null}
        onCategoryChange={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Category')).toBeTruthy()
  })

  it('renders Stock Status select when stockStatus prop is provided', () => {
    wrap(
      <DashboardFilterBar
        {...baseProps()}
        stockStatus={null}
        onStockStatusChange={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('Stock Status')).toBeTruthy()
  })

  it('calls onCategoryChange with null when All Categories is selected', async () => {
    const onCategoryChange = vi.fn()
    wrap(
      <DashboardFilterBar
        {...baseProps()}
        categories={[{ id: 'cat1', name: 'Electronics' }]}
        categoryId="cat1"
        onCategoryChange={onCategoryChange}
      />,
    )
    await userEvent.click(screen.getByLabelText('Category'))
    await userEvent.click(screen.getByText('All Categories'))
    expect(onCategoryChange).toHaveBeenCalledWith(null)
  })

  it('calls onStockStatusChange with low_stock when Low Stock is selected', async () => {
    const onStockStatusChange = vi.fn()
    wrap(
      <DashboardFilterBar
        {...baseProps()}
        stockStatus={null}
        onStockStatusChange={onStockStatusChange}
      />,
    )
    await userEvent.click(screen.getByLabelText('Stock Status'))
    await userEvent.click(screen.getByText('Low Stock'))
    expect(onStockStatusChange).toHaveBeenCalledWith('low_stock')
  })
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/DashboardFilterBar.test.tsx
```

Expected: new tests FAIL.

- [ ] **Step 3: Add props and dropdowns to `DashboardFilterBar`**

Add to the `DashboardFilterBarProps` interface (after `paymentStatusOptions`):

```ts
  categories?: { id: string; name: string }[]
  categoryId?: string | null
  onCategoryChange?: (id: string | null) => void
  stockStatus?: string | null
  onStockStatusChange?: (value: string | null) => void
```

Add to the destructured props in the function signature:

```ts
  categories,
  categoryId,
  onCategoryChange,
  stockStatus,
  onStockStatusChange,
```

Add the Category dropdown after the existing Supplier block (before the `isFulfilled` block):

```tsx
      {categories !== undefined && onCategoryChange && (
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <InputLabel id="dashboard-category-label">Category</InputLabel>
          <Select
            labelId="dashboard-category-label"
            id="dashboard-category"
            value={categoryId ?? ''}
            label="Category"
            onChange={(e) => onCategoryChange(e.target.value || null)}
          >
            <MenuItem value="">All Categories</MenuItem>
            {categories.map((category) => (
              <MenuItem key={category.id} value={category.id}>{category.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      )}
```

Add the Stock Status dropdown after the Supplier block and Category block (before `isFulfilled`):

```tsx
      {stockStatus !== undefined && onStockStatusChange && (
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel id="dashboard-stock-status-label">Stock Status</InputLabel>
          <Select
            labelId="dashboard-stock-status-label"
            id="dashboard-stock-status"
            value={stockStatus ?? ''}
            label="Stock Status"
            onChange={(e) => onStockStatusChange(e.target.value || null)}
          >
            <MenuItem value="">All</MenuItem>
            <MenuItem value="in_stock">In Stock</MenuItem>
            <MenuItem value="low_stock">Low Stock</MenuItem>
            <MenuItem value="out_of_stock">Out of Stock</MenuItem>
          </Select>
        </FormControl>
      )}
```

- [ ] **Step 4: Run tests**

```bash
cd frontend && npx vitest run src/components/filters/__tests__/DashboardFilterBar.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/filters/DashboardFilterBar.tsx \
        frontend/src/components/filters/__tests__/DashboardFilterBar.test.tsx
git commit -m "feat(inventory): add Category and Stock Status dropdowns to DashboardFilterBar (#219)"
```

---

## Task 5: Extend `useInventoryAnalytics` hook

**Files:**
- Modify: `frontend/src/pages/inventory/hooks/useInventoryAnalytics.ts`

- [ ] **Step 1: Add new params to `InventoryAnalyticsParams`**

In `useInventoryAnalytics.ts`, update the `InventoryAnalyticsParams` interface:

```ts
export interface InventoryAnalyticsParams {
  dateRange?: string
  startDate?: string
  endDate?: string
  groupBy?: string
  compareWith?: string
  categoryId?: string
  supplierId?: string
  stockStatus?: string
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors. (The `fetchAnalytics` body already filters out `undefined`/`null` values via `Object.entries().filter()`, so no further changes needed.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/inventory/hooks/useInventoryAnalytics.ts
git commit -m "feat(inventory): add categoryId, supplierId, stockStatus to InventoryAnalyticsParams (#219)"
```

---

## Task 6: Wire filters into `InventoryPage` and add smoke test

**Files:**
- Modify: `frontend/src/pages/inventory/InventoryPage.tsx`
- Create: `frontend/src/pages/inventory/__tests__/InventoryPage.filters.test.tsx`

- [ ] **Step 1: Write the smoke test first**

Create `frontend/src/pages/inventory/__tests__/InventoryPage.filters.test.tsx`:

```tsx
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import InventoryPage from '../InventoryPage'

const mockUseGetSuppliersQuery = vi.fn()
const mockUseGetCategoriesQuery = vi.fn()
const mockUseInventoryAnalytics = vi.fn()
const dashboardFilterBarSpy = vi.fn()

vi.mock('@/store/api/purchasingApi', () => ({
  useGetSuppliersQuery: (...args: unknown[]) => mockUseGetSuppliersQuery(...args),
}))

vi.mock('@/store/api/inventoryApi', () => ({
  useGetCategoriesQuery: (...args: unknown[]) => mockUseGetCategoriesQuery(...args),
}))

vi.mock('../hooks/useInventoryAnalytics', () => ({
  useInventoryAnalytics: (...args: unknown[]) => mockUseInventoryAnalytics(...args),
}))

vi.mock('@/components/filters/DashboardFilterBar', () => ({
  DashboardFilterBar: (props: unknown) => {
    dashboardFilterBarSpy(props)
    return <div data-testid="dashboard-filter-bar" />
  },
}))

vi.mock('react-chartjs-2', () => ({
  Line: () => <div data-testid="inventory-line-chart" />,
  Doughnut: () => <div data-testid="inventory-doughnut-chart" />,
}))

describe('InventoryPage filters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseGetSuppliersQuery.mockReturnValue({
      data: {
        data: [
          { id: '550e8400-e29b-41d4-a716-446655440001', companyName: 'Acme Supplies' },
        ],
      },
    })
    mockUseGetCategoriesQuery.mockReturnValue({
      data: [
        { id: '550e8400-e29b-41d4-a716-446655440010', name: 'Electronics' },
      ],
    })
    mockUseInventoryAnalytics.mockReturnValue({
      data: {
        current: {
          metrics: {
            totalProducts: 0,
            totalCategories: 0,
            inventoryValue: 0,
            lowStockCount: 0,
            outOfStockCount: 0,
            stockMovementsIn: 0,
            stockMovementsOut: 0,
          },
          periodData: [],
          periodStart: '2026-03-01',
          periodEnd: '2026-03-31',
        },
        lowStockAlerts: [],
        recentMovements: [],
      },
      isLoading: false,
      isFetching: false,
      error: null,
    })
    window.history.replaceState(
      {},
      '',
      '/?inventory_supplier=550e8400-e29b-41d4-a716-446655440001&inventory_category=550e8400-e29b-41d4-a716-446655440010&inventory_stock_status=low_stock',
    )
  })

  it('passes inventory filter state into analytics and the shared filter bar', () => {
    render(
      <MemoryRouter>
        <InventoryPage />
      </MemoryRouter>,
    )

    expect(mockUseInventoryAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        supplierId: '550e8400-e29b-41d4-a716-446655440001',
        categoryId: '550e8400-e29b-41d4-a716-446655440010',
        stockStatus: 'low_stock',
      }),
    )

    expect(dashboardFilterBarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        suppliers: [{ id: '550e8400-e29b-41d4-a716-446655440001', name: 'Acme Supplies' }],
        supplierId: '550e8400-e29b-41d4-a716-446655440001',
        categories: [{ id: '550e8400-e29b-41d4-a716-446655440010', name: 'Electronics' }],
        categoryId: '550e8400-e29b-41d4-a716-446655440010',
        stockStatus: 'low_stock',
      }),
    )
  })

  it('renders the inventory overview heading', () => {
    render(
      <MemoryRouter>
        <InventoryPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('Inventory Overview')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd frontend && npx vitest run src/pages/inventory/__tests__/InventoryPage.filters.test.tsx
```

Expected: FAIL — `useGetSuppliersQuery`, `useGetCategoriesQuery`, and new filter props not yet wired.

- [ ] **Step 3: Update `InventoryPage.tsx`**

Add imports at the top of `InventoryPage.tsx`:

```ts
import { useGetSuppliersQuery } from '@/store/api/purchasingApi'
import { useGetCategoriesQuery } from '@/store/api/inventoryApi'
```

Update the `useDashboardFilters` destructure to include new fields:

```ts
  const {
    period,
    compareWith,
    customFrom,
    customTo,
    supplierId,
    categoryId,
    stockStatus,
    setPeriod,
    setCompare,
    setCustomRange,
    setCustomFrom,
    setCustomTo,
    setSupplierId,
    setCategoryId,
    setStockStatus,
    reset,
    isDefault,
    resolvedApiParams,
  } = useDashboardFilters('inventory')
```

Add data fetching after the `useDashboardFilters` call:

```ts
  const { data: suppliersData } = useGetSuppliersQuery({})
  const { data: categoriesData } = useGetCategoriesQuery({})

  const supplierOptions = suppliersData?.data?.map((s) => ({ id: s.id, name: s.companyName })) ?? []
  const categoryOptions = (categoriesData ?? []).map((c) => ({ id: c.id, name: c.name }))
```

Update `DashboardFilterBar` usage to pass new props:

```tsx
      <DashboardFilterBar
        period={period}
        compareWith={compareWith}
        customFrom={customFrom}
        customTo={customTo}
        isFetching={isFetching}
        isDefault={isDefault}
        onPeriodChange={setPeriod}
        onCompareChange={setCompare}
        onCustomRangeChange={setCustomRange}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
        onReset={reset}
        suppliers={supplierOptions}
        supplierId={supplierId}
        onSupplierChange={setSupplierId}
        categories={categoryOptions}
        categoryId={categoryId}
        onCategoryChange={setCategoryId}
        stockStatus={stockStatus}
        onStockStatusChange={setStockStatus}
      />
```

- [ ] **Step 4: Run the smoke test**

```bash
cd frontend && npx vitest run src/pages/inventory/__tests__/InventoryPage.filters.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/inventory/InventoryPage.tsx \
        frontend/src/pages/inventory/__tests__/InventoryPage.filters.test.tsx
git commit -m "feat(inventory): wire Supplier, Category, and Stock Status filters into InventoryPage (#219)"
```

---

## Task 7: Final verification

- [ ] **Step 1: Run all backend inventory analytics tests**

```bash
cd backend && npx jest src/modules/inventory --no-coverage
```

Expected: all pass.

- [ ] **Step 2: Run all affected frontend tests**

```bash
cd frontend && npx vitest run src/hooks/useDashboardFilters.test.ts src/components/filters/__tests__/DashboardFilterBar.test.tsx src/pages/inventory/__tests__/InventoryPage.filters.test.tsx
```

Expected: all pass.

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 4: Lint**

```bash
cd backend && npm run lint
cd frontend && npm run lint
```

Expected: no errors.
