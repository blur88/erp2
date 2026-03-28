# Inventory Overview Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `DashboardFilterBar` to the Inventory Overview page, backed by a new `GET /inventory/analytics/dashboard` endpoint that returns period-filtered movement metrics alongside snapshot inventory health data.

**Architecture:** New `InventoryAnalyticsQueryDto` / `InventoryAnalyticsResponseDto` DTOs → `getInventoryDashboardAnalytics` method added to the existing `InventoryAnalyticsService` → new `GET dashboard` endpoint prepended to `InventoryAnalyticsController` → new `useInventoryAnalytics` hook → `InventoryPage` refactored to use filter bar and hook.

**Tech Stack:** NestJS 11, TypeORM (PostgreSQL raw queries via QueryBuilder), React 19, MUI v7, Chart.js, date-fns, abort-controller fetch pattern.

---

## File Map

| File | Action |
|---|---|
| `backend/src/modules/inventory/dto/inventory-analytics.dto.ts` | **Create** — all DTOs |
| `backend/src/modules/inventory/services/inventory-analytics.service.ts` | **Modify** — add `getInventoryDashboardAnalytics` + 5 private helpers + new repo injections |
| `backend/src/modules/inventory/controllers/inventory-analytics.controller.ts` | **Modify** — prepend `GET dashboard` endpoint |
| `frontend/src/pages/inventory/hooks/useInventoryAnalytics.ts` | **Create** — data-fetching hook |
| `frontend/src/pages/inventory/InventoryPage.tsx` | **Modify** — wire filter bar + new hook, replace charts/table/panel |

---

## Task 1: Create backend DTOs

**Files:**
- Create: `backend/src/modules/inventory/dto/inventory-analytics.dto.ts`

- [ ] **Step 1: Create the DTO file**

```typescript
// backend/src/modules/inventory/dto/inventory-analytics.dto.ts
import { IsOptional, IsEnum, IsIn, IsDate } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { DateRange, GroupByPeriod } from '@/common/dto/analytics.dto';

export { DateRange, GroupByPeriod };

export class InventoryAnalyticsQueryDto {
  @ApiPropertyOptional({ enum: DateRange, example: DateRange.THIS_MONTH })
  @IsOptional()
  @IsEnum(DateRange)
  dateRange?: DateRange;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDate()
  @Transform(({ value }) => (value ? new Date(value) : value))
  startDate?: Date;

  @ApiPropertyOptional({ example: '2026-03-31' })
  @IsOptional()
  @IsDate()
  @Transform(({ value }) => (value ? new Date(value) : value))
  endDate?: Date;

  @ApiPropertyOptional({ enum: ['previous_period', 'last_month', 'last_year'] })
  @IsOptional()
  @IsIn(['previous_period', 'last_month', 'last_year'])
  compareWith?: 'previous_period' | 'last_month' | 'last_year';

  @ApiPropertyOptional({ enum: GroupByPeriod, example: GroupByPeriod.DAY })
  @IsOptional()
  @IsEnum(GroupByPeriod)
  groupBy?: GroupByPeriod;
}

export class InventoryMetricsDto {
  @ApiProperty({ example: 120 })
  totalProducts!: number;

  @ApiProperty({ example: 8 })
  totalCategories!: number;

  @ApiProperty({ example: 45000 })
  inventoryValue!: number;

  @ApiProperty({ example: 5 })
  lowStockCount!: number;

  @ApiProperty({ example: 2 })
  outOfStockCount!: number;

  @ApiProperty({ example: 340 })
  stockMovementsIn!: number;

  @ApiProperty({ example: 210 })
  stockMovementsOut!: number;
}

export class InventoryPeriodDataDto {
  @ApiProperty({ example: '2026-03-01' })
  period!: string;

  @ApiProperty({ example: 45 })
  movementsIn!: number;

  @ApiProperty({ example: 28 })
  movementsOut!: number;
}

export class InventoryPeriodBlockDto {
  @ApiProperty({ type: InventoryMetricsDto })
  metrics!: InventoryMetricsDto;

  @ApiProperty({ type: [InventoryPeriodDataDto] })
  periodData!: InventoryPeriodDataDto[];

  @ApiProperty({ example: '2026-03-01' })
  periodStart!: string;

  @ApiProperty({ example: '2026-03-31' })
  periodEnd!: string;
}

export class LowStockAlertDto {
  @ApiProperty({ example: 'uuid' })
  productId!: string;

  @ApiProperty({ example: 'Widget A' })
  productName!: string;

  @ApiProperty({ example: 'Electronics' })
  categoryName!: string;

  @ApiProperty({ example: 3 })
  stockQuantity!: number;

  @ApiProperty({ enum: ['low_stock', 'out_of_stock'] })
  status!: 'low_stock' | 'out_of_stock';
}

export class RecentMovementDto {
  @ApiProperty({ example: '2026-03-15' })
  movementDate!: string;

  @ApiProperty({ example: 'Widget A' })
  productName!: string;

  @ApiProperty({ example: 'purchase_receipt' })
  movementType!: string;

  @ApiProperty({ example: 50 })
  quantity!: number;

  @ApiProperty({ example: 'PO-0042' })
  referenceNumber!: string;
}

export class InventoryAnalyticsResponseDto {
  @ApiProperty({ type: InventoryPeriodBlockDto })
  current!: InventoryPeriodBlockDto;

  @ApiPropertyOptional({ type: InventoryPeriodBlockDto })
  comparison?: InventoryPeriodBlockDto;

  @ApiProperty({ type: [LowStockAlertDto] })
  lowStockAlerts!: LowStockAlertDto[];

  @ApiProperty({ type: [RecentMovementDto] })
  recentMovements!: RecentMovementDto[];
}
```

- [ ] **Step 2: Verify TypeScript compiles (no test yet)**

```bash
cd backend && npx tsc --noEmit 2>&1 | grep -i "inventory-analytics.dto"
```

Expected: no output (no errors in the new file).

- [ ] **Step 3: Commit**

```bash
cd backend
git add src/modules/inventory/dto/inventory-analytics.dto.ts
git commit -m "feat(inventory): add InventoryAnalytics DTOs"
```

---

## Task 2: Add `getInventoryDashboardAnalytics` to service

**Files:**
- Modify: `backend/src/modules/inventory/services/inventory-analytics.service.ts`

**Context:** The service currently injects `Product`, `Category`, `StockMovement`, `PurchaseCostHistory`, `PriceListItem`. We need to add `SalesOrder`, `PurchaseOrder`, and `StockAdjustment` repositories for resolving reference numbers in recent movements. All three entities are already registered in `InventoryModule`'s `TypeOrmModule.forFeature([...])`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/modules/inventory/services/inventory-analytics-dashboard.service.spec.ts`:

```typescript
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
    // Snapshot: 5 products, 2 categories, inventoryValue=1000, lowStock=1, outOfStock=1
    productRepo.createQueryBuilder.mockImplementation(() =>
      makeQb(
        { totalProducts: '5', totalCategories: '2', inventoryValue: '1000', lowStockCount: '1', outOfStockCount: '1' },
        [],
      ),
    );
    // movements in/out
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
      makeQb({ totalProducts: '5', totalCategories: '2', inventoryValue: '500', lowStockCount: '0', outOfStockCount: '0' }, []),
    );
    stockMovementRepo.createQueryBuilder.mockImplementation(() =>
      makeQb({ movementsIn: '10', movementsOut: '5' }, []),
    );

    const result = await service.getInventoryDashboardAnalytics({ compareWith: 'previous_period' });

    expect(result.comparison).toBeDefined();
    expect(result.comparison!.periodStart).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npx jest src/modules/inventory/services/inventory-analytics-dashboard.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `getInventoryDashboardAnalytics is not a function` or similar.

- [ ] **Step 3: Add new repository injections to the service constructor**

Open `backend/src/modules/inventory/services/inventory-analytics.service.ts`. Add these imports at the top (after existing imports):

```typescript
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { PurchaseOrder } from '../../../database/entities/purchase-order.entity';
import { StockAdjustment } from '../../../database/entities/stock-adjustment.entity';
import { differenceInCalendarDays, subDays, subMonths, subYears } from 'date-fns';
import {
  InventoryAnalyticsQueryDto,
  InventoryAnalyticsResponseDto,
  InventoryMetricsDto,
  InventoryPeriodDataDto,
  InventoryPeriodBlockDto,
  LowStockAlertDto,
  RecentMovementDto,
} from '../dto/inventory-analytics.dto';
import { DateRange, GroupByPeriod } from '@/common/dto/analytics.dto';
```

Then add three new `@InjectRepository` parameters to the constructor (after the existing `priceListItemRepository`):

```typescript
  @InjectRepository(SalesOrder)
  private readonly salesOrderRepository: Repository<SalesOrder>,
  @InjectRepository(PurchaseOrder)
  private readonly purchaseOrderRepository: Repository<PurchaseOrder>,
  @InjectRepository(StockAdjustment)
  private readonly stockAdjustmentRepository: Repository<StockAdjustment>,
```

- [ ] **Step 4: Add the `getInventoryDashboardAnalytics` public method and 5 private helpers**

Append these methods to the `InventoryAnalyticsService` class (before the closing `}`):

```typescript
  // ─── Dashboard Analytics ────────────────────────────────────────────────────

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

    const [snapshotMetrics, movementTotals, periodData, lowStockAlerts, recentMovements] =
      await Promise.all([
        this.getInventorySnapshotMetrics(),
        this.getInventoryMovementTotals(startDate, endDate),
        this.getInventoryPeriodData(startDate, endDate, groupBy),
        this.getLowStockAlerts(10),
        this.getRecentMovements(startDate, endDate, 5),
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
        this.getInventoryMovementTotals(comparePeriod.compareStart, comparePeriod.compareEnd),
        this.getInventoryPeriodData(comparePeriod.compareStart, comparePeriod.compareEnd, groupBy),
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

  private async getInventorySnapshotMetrics(): Promise<Omit<InventoryMetricsDto, 'stockMovementsIn' | 'stockMovementsOut'>> {
    const products = await this.productRepository
      .createQueryBuilder('product')
      .leftJoin('product.category', 'category')
      .where('product.deletedAt IS NULL')
      .select([
        'COUNT(*) as "totalProducts"',
        'COALESCE(SUM(product.baseCost * product.stockQuantity), 0) as "inventoryValue"',
        `SUM(CASE WHEN product.stockQuantity <= 0 THEN 1 ELSE 0 END) as "outOfStockCount"`,
        `SUM(CASE WHEN product.stockQuantity > 0 AND product.stockQuantity <= 10 THEN 1 ELSE 0 END) as "lowStockCount"`,
      ])
      .getRawOne();

    const totalCategories = await this.categoryRepository
      .createQueryBuilder('category')
      .where('category.isActive = :isActive', { isActive: true })
      .select('COUNT(*) as "totalCategories"')
      .getRawOne();

    return {
      totalProducts: parseInt(products.totalProducts) || 0,
      totalCategories: parseInt(totalCategories.totalCategories) || 0,
      inventoryValue: parseFloat(products.inventoryValue) || 0,
      lowStockCount: parseInt(products.lowStockCount) || 0,
      outOfStockCount: parseInt(products.outOfStockCount) || 0,
    };
  }

  private async getInventoryMovementTotals(
    startDate: Date,
    endDate: Date,
  ): Promise<Pick<InventoryMetricsDto, 'stockMovementsIn' | 'stockMovementsOut'>> {
    const result = await this.stockMovementRepository
      .createQueryBuilder('movement')
      .where('movement.movementDate BETWEEN :startDate AND :endDate', { startDate, endDate })
      .select([
        'COALESCE(SUM(CASE WHEN movement.quantity > 0 THEN movement.quantity ELSE 0 END), 0) as "movementsIn"',
        'COALESCE(SUM(CASE WHEN movement.quantity < 0 THEN ABS(movement.quantity) ELSE 0 END), 0) as "movementsOut"',
      ])
      .getRawOne();

    return {
      stockMovementsIn: parseFloat(result.movementsIn) || 0,
      stockMovementsOut: parseFloat(result.movementsOut) || 0,
    };
  }

  private async getInventoryPeriodData(
    startDate: Date,
    endDate: Date,
    groupBy: string,
  ): Promise<InventoryPeriodDataDto[]> {
    let dateFormat: string;
    switch (groupBy) {
      case 'day':
        dateFormat = 'YYYY-MM-DD';
        break;
      case 'week':
        dateFormat = 'IYYY-IW';
        break;
      case 'quarter':
        dateFormat = 'YYYY-"Q"Q';
        break;
      case 'year':
        dateFormat = 'YYYY';
        break;
      default: // month
        dateFormat = 'YYYY-MM';
        break;
    }

    const data = await this.stockMovementRepository
      .createQueryBuilder('movement')
      .where('movement.movementDate BETWEEN :startDate AND :endDate', { startDate, endDate })
      .select([
        `TO_CHAR(movement.movementDate, '${dateFormat}') as period`,
        'COALESCE(SUM(CASE WHEN movement.quantity > 0 THEN movement.quantity ELSE 0 END), 0) as "movementsIn"',
        'COALESCE(SUM(CASE WHEN movement.quantity < 0 THEN ABS(movement.quantity) ELSE 0 END), 0) as "movementsOut"',
      ])
      .groupBy(`TO_CHAR(movement.movementDate, '${dateFormat}')`)
      .orderBy(`TO_CHAR(movement.movementDate, '${dateFormat}')`, 'ASC')
      .getRawMany();

    return data.map((item) => ({
      period: item.period,
      movementsIn: parseFloat(item.movementsIn) || 0,
      movementsOut: parseFloat(item.movementsOut) || 0,
    }));
  }

  private async getLowStockAlerts(limit: number): Promise<LowStockAlertDto[]> {
    const products = await this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .where('product.deletedAt IS NULL')
      .andWhere('product.stockQuantity <= :threshold', { threshold: 10 })
      .orderBy('product.stockQuantity', 'ASC')
      .limit(limit)
      .getMany();

    return products.map((p) => ({
      productId: p.id,
      productName: p.name,
      categoryName: p.category?.name || 'Uncategorized',
      stockQuantity: parseFloat(p.stockQuantity?.toString() || '0'),
      status: parseFloat(p.stockQuantity?.toString() || '0') <= 0 ? 'out_of_stock' : 'low_stock',
    }));
  }

  private async getRecentMovements(
    startDate: Date,
    endDate: Date,
    limit: number,
  ): Promise<RecentMovementDto[]> {
    const { entities: movements, raw: rawResults } = await this.stockMovementRepository
      .createQueryBuilder('movement')
      .leftJoinAndSelect('movement.product', 'product')
      .leftJoin('sales_orders', 'so', "movement.referenceType = 'sales_order' AND movement.referenceId = so.id")
      .leftJoin('purchase_orders', 'po', "movement.referenceType = 'purchase_order' AND movement.referenceId = po.id")
      .leftJoin('stock_adjustments', 'sa', "movement.referenceType = 'stock_adjustment' AND movement.referenceId = sa.id")
      .addSelect("COALESCE(so.orderNumber, po.orderNumber, sa.adjustmentNumber, '-')", 'orderNumberResolved')
      .where('movement.movementDate BETWEEN :startDate AND :endDate', { startDate, endDate })
      .orderBy('movement.movementDate', 'DESC')
      .limit(limit)
      .getRawAndEntities();

    const orderNumberMap = new Map<string, string>();
    rawResults.forEach((raw: any) => {
      orderNumberMap.set(raw.movement_id, raw.orderNumberResolved || '-');
    });

    return movements.map((m) => {
      const date = m.movementDate instanceof Date ? m.movementDate : new Date(m.movementDate);
      return {
        movementDate: date.toISOString().split('T')[0],
        productName: m.product?.name || 'Unknown',
        movementType: m.movementType || '',
        quantity: parseFloat(m.quantity?.toString() || '0'),
        referenceNumber: orderNumberMap.get(m.id) || '-',
      };
    });
  }

  private resolveInventoryDateRange(
    dateRange?: DateRange,
    customStartDate?: Date,
    customEndDate?: Date,
  ): { startDate: Date; endDate: Date } {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = new Date(new Date().setHours(23, 59, 59, 999));

    if (customStartDate && customEndDate) {
      const normalizedStart = new Date(customStartDate);
      normalizedStart.setUTCHours(0, 0, 0, 0);
      const normalizedEnd = new Date(customEndDate);
      normalizedEnd.setUTCHours(23, 59, 59, 999);
      return { startDate: normalizedStart, endDate: normalizedEnd };
    }

    switch (dateRange) {
      case DateRange.TODAY:
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case DateRange.THIS_WEEK:
        startDate = new Date(now.setDate(now.getDate() - now.getDay()));
        startDate.setHours(0, 0, 0, 0);
        break;
      case DateRange.THIS_MONTH:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case DateRange.THIS_QUARTER: {
        const quarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), quarter * 3, 1);
        break;
      }
      case DateRange.THIS_YEAR:
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case DateRange.LAST_WEEK:
        startDate = new Date(now.setDate(now.getDate() - now.getDay() - 7));
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now.setDate(now.getDate() - now.getDay() - 1));
        endDate.setHours(23, 59, 59, 999);
        break;
      case DateRange.LAST_MONTH:
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        break;
      case DateRange.LAST_QUARTER: {
        const lastQuarter = Math.floor(now.getMonth() / 3) - 1;
        const year = lastQuarter < 0 ? now.getFullYear() - 1 : now.getFullYear();
        const quarterStart = lastQuarter < 0 ? 3 : lastQuarter;
        startDate = new Date(year, quarterStart * 3, 1);
        endDate = new Date(year, quarterStart * 3 + 3, 0, 23, 59, 59, 999);
        break;
      }
      case DateRange.LAST_YEAR:
        startDate = new Date(now.getFullYear() - 1, 0, 1);
        endDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
        break;
      default: // THIS_MONTH
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
    }

    return { startDate, endDate };
  }

  private computeInventoryComparePeriod(
    start: Date,
    end: Date,
    compareWith: 'previous_period' | 'last_month' | 'last_year',
  ): { compareStart: Date; compareEnd: Date } {
    if (compareWith === 'previous_period') {
      const dayCount = differenceInCalendarDays(end, start) + 1;
      const compareEnd = subDays(start, 1);
      const compareStart = subDays(compareEnd, dayCount - 1);
      return { compareStart, compareEnd };
    }
    if (compareWith === 'last_month') {
      return { compareStart: subMonths(start, 1), compareEnd: subMonths(end, 1) };
    }
    return { compareStart: subYears(start, 1), compareEnd: subYears(end, 1) };
  }
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd backend && npx jest src/modules/inventory/services/inventory-analytics-dashboard.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: PASS — 2 tests pass.

- [ ] **Step 6: Run full backend test suite to check for regressions**

```bash
cd backend && npm run test 2>&1 | tail -20
```

Expected: all tests pass (or same count of failures as before this change).

- [ ] **Step 7: Commit**

```bash
cd backend
git add src/modules/inventory/services/inventory-analytics.service.ts \
        src/modules/inventory/services/inventory-analytics-dashboard.service.spec.ts
git commit -m "feat(inventory): add getInventoryDashboardAnalytics to InventoryAnalyticsService"
```

---

## Task 3: Add `GET /inventory/analytics/dashboard` endpoint

**Files:**
- Modify: `backend/src/modules/inventory/controllers/inventory-analytics.controller.ts`

**Context:** NestJS matches routes top-down. The new `dashboard` endpoint must come before any parameterized routes to avoid collisions. The current first route is `inventory-summary` (a static path), so order is fine — just prepend.

- [ ] **Step 1: Add import and endpoint to the controller**

Open `backend/src/modules/inventory/controllers/inventory-analytics.controller.ts`.

Add to the import from `@nestjs/common`:
```typescript
import { Controller, Get, Query } from '@nestjs/common';
```
(already present — no change needed)

Add new imports at the top after existing imports:
```typescript
import {
  InventoryAnalyticsQueryDto,
  InventoryAnalyticsResponseDto,
} from '../dto/inventory-analytics.dto';
```

Prepend this method **before** `getInventorySummary`:
```typescript
  @Get('dashboard')
  @ApiOperation({ summary: 'Get inventory analytics for the overview dashboard' })
  @ApiResponse({ status: 200, type: InventoryAnalyticsResponseDto })
  async getDashboardAnalytics(
    @Query() query: InventoryAnalyticsQueryDto,
  ): Promise<InventoryAnalyticsResponseDto> {
    return this.inventoryAnalyticsService.getInventoryDashboardAnalytics(query);
  }
```

- [ ] **Step 2: TypeScript check**

```bash
cd backend && npx tsc --noEmit 2>&1 | grep -i "inventory-analytics"
```

Expected: no output.

- [ ] **Step 3: Smoke test the endpoint manually**

```bash
cd backend && npm run start:dev &
sleep 8
curl -s "http://localhost:3000/api/inventory/analytics/dashboard?dateRange=this_month" | python3 -m json.tool | head -40
kill %1
```

Expected: JSON response with `current`, `lowStockAlerts`, `recentMovements` keys.

- [ ] **Step 4: Commit**

```bash
cd backend
git add src/modules/inventory/controllers/inventory-analytics.controller.ts
git commit -m "feat(inventory): add GET /inventory/analytics/dashboard endpoint"
```

---

## Task 4: Create `useInventoryAnalytics` hook

**Files:**
- Create: `frontend/src/pages/inventory/hooks/useInventoryAnalytics.ts`

- [ ] **Step 1: Create the hook file**

```typescript
// frontend/src/pages/inventory/hooks/useInventoryAnalytics.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import api from '@/services/api'

export interface InventoryMetrics {
  totalProducts: number
  totalCategories: number
  inventoryValue: number
  lowStockCount: number
  outOfStockCount: number
  stockMovementsIn: number
  stockMovementsOut: number
}

export interface InventoryPeriodDataPoint {
  period: string
  movementsIn: number
  movementsOut: number
}

export interface InventoryPeriodBlock {
  metrics: InventoryMetrics
  periodData: InventoryPeriodDataPoint[]
  periodStart: string
  periodEnd: string
}

export interface LowStockAlert {
  productId: string
  productName: string
  categoryName: string
  stockQuantity: number
  status: 'low_stock' | 'out_of_stock'
}

export interface RecentMovement {
  movementDate: string
  productName: string
  movementType: string
  quantity: number
  referenceNumber: string
}

export interface InventoryAnalyticsData {
  current: InventoryPeriodBlock
  comparison?: InventoryPeriodBlock
  lowStockAlerts: LowStockAlert[]
  recentMovements: RecentMovement[]
}

export interface InventoryAnalyticsParams {
  dateRange?: string
  startDate?: string
  endDate?: string
  groupBy?: string
  compareWith?: string
}

export function useInventoryAnalytics(params: InventoryAnalyticsParams) {
  const [data, setData] = useState<InventoryAnalyticsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isFetching, setIsFetching] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetchAnalytics = useCallback(async (nextParams: InventoryAnalyticsParams) => {
    abortRef.current?.abort()

    const controller = new AbortController()
    abortRef.current = controller

    setIsFetching(true)
    setError(null)

    try {
      const response = await api.get('/inventory/analytics/dashboard', {
        params: Object.fromEntries(Object.entries(nextParams).filter(([, value]) => value !== undefined)),
        signal: controller.signal,
      })
      setData(response.data)
      setIsLoading(false)
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'AbortError' || (err as { name?: string }).name === 'CanceledError') {
        return
      }
      setError(err instanceof Error ? err : new Error(String(err)))
      setIsLoading(false)
    } finally {
      setIsFetching(false)
    }
  }, [])

  const serializedParams = useMemo(() => JSON.stringify(params), [params])

  useEffect(() => {
    fetchAnalytics(params)
    return () => {
      abortRef.current?.abort()
    }
  }, [fetchAnalytics, params, serializedParams])

  return { data, isLoading, isFetching, error }
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "useInventoryAnalytics"
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd frontend
git add src/pages/inventory/hooks/useInventoryAnalytics.ts
git commit -m "feat(inventory): add useInventoryAnalytics hook"
```

---

## Task 5: Refactor `InventoryPage.tsx`

**Files:**
- Modify: `frontend/src/pages/inventory/InventoryPage.tsx`

**Context:** The current page uses three RTK Query hooks. We replace them with `useDashboardFilters` + `useInventoryAnalytics`. The 4 stat cards change (Stock In / Stock Out replace Categories and Low Stock). The Bar chart (category breakdown) becomes a Line chart (movements in/out). The Doughnut (stock health) stays but sourced from snapshot metrics. The "Out of Stock Items" panel becomes "Low Stock Alerts".

- [ ] **Step 1: Replace the full file content**

```tsx
// frontend/src/pages/inventory/InventoryPage.tsx
import React, { useMemo } from 'react'
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  useTheme,
  CircularProgress,
  Alert,
} from '@mui/material'
import {
  Inventory2 as InventoryIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Warning as WarningIcon,
  ErrorOutline as OutOfStockIcon,
  Add as AddIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon,
} from '@mui/icons-material'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js'
import { Line, Doughnut } from 'react-chartjs-2'
import { format } from 'date-fns'
import PageHeader from '@/components/common/PageHeader'
import { DashboardFilterBar } from '@/components/dashboard/DashboardFilterBar'
import { formatCurrency } from '@/utils/formatters'
import { TYPOGRAPHY_STYLES, TABLE_STYLES } from '@/constants/typography'
import { useNavigate } from 'react-router-dom'
import { useDashboardFilters } from '@/hooks/useDashboardFilters'
import { useInventoryAnalytics } from './hooks/useInventoryAnalytics'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
)

function deltaPercent(current: number | undefined, comparison: number | undefined): string | null {
  if (current === undefined || comparison === undefined || comparison === 0) return null
  const pct = ((current - comparison) / comparison) * 100
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
}

const InventoryPage: React.FC = () => {
  const theme = useTheme()
  const navigate = useNavigate()

  const {
    period,
    compareWith,
    customFrom,
    customTo,
    setPeriod,
    setCompare,
    setCustomRange,
    setCustomFrom,
    setCustomTo,
    reset,
    isDefault,
    resolvedApiParams,
  } = useDashboardFilters('inventory')

  const { data, isLoading, isFetching, error } = useInventoryAnalytics(resolvedApiParams)

  const current = data?.current
  const comparison = data?.comparison

  const stats = [
    {
      title: 'Total Products',
      value: String(current?.metrics.totalProducts ?? 0),
      icon: InventoryIcon,
      color: 'primary',
      delta: null,
    },
    {
      title: 'Inventory Value',
      value: formatCurrency(current?.metrics.inventoryValue ?? 0),
      icon: TrendingUpIcon,
      color: 'success',
      delta: null,
      subtitle: 'current',
    },
    {
      title: 'Stock In',
      value: String(current?.metrics.stockMovementsIn ?? 0),
      icon: ArrowUpwardIcon,
      color: 'info',
      delta: deltaPercent(current?.metrics.stockMovementsIn, comparison?.metrics.stockMovementsIn),
      deltaPositiveIsGood: true,
    },
    {
      title: 'Stock Out',
      value: String(current?.metrics.stockMovementsOut ?? 0),
      icon: ArrowDownwardIcon,
      color: 'warning',
      delta: deltaPercent(current?.metrics.stockMovementsOut, comparison?.metrics.stockMovementsOut),
      deltaPositiveIsGood: false,
    },
  ]

  const movementTrendData = {
    labels: current?.periodData.map((d) => d.period) ?? [],
    datasets: [
      {
        label: 'Stock In',
        data: current?.periodData.map((d) => d.movementsIn) ?? [],
        borderColor: theme.palette.success.main,
        backgroundColor: `${theme.palette.success.main}20`,
        tension: 0.4,
      },
      {
        label: 'Stock Out',
        data: current?.periodData.map((d) => d.movementsOut) ?? [],
        borderColor: theme.palette.error.main,
        backgroundColor: `${theme.palette.error.main}20`,
        tension: 0.4,
      },
      ...(comparison
        ? [
            {
              label: 'Stock In (comparison)',
              data: comparison.periodData.map((d) => d.movementsIn),
              borderColor: theme.palette.grey[400],
              backgroundColor: 'transparent',
              borderDash: [4, 4],
              tension: 0.4,
            },
          ]
        : []),
    ],
  }

  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'top' as const } },
    scales: { y: { beginAtZero: true } },
  }

  const stockHealthData = {
    labels: ['In Stock', 'Out of Stock'],
    datasets: [
      {
        data: [
          current?.metrics.totalProducts
            ? current.metrics.totalProducts - (current.metrics.outOfStockCount ?? 0)
            : 0,
          current?.metrics.outOfStockCount ?? 0,
        ],
        backgroundColor: [theme.palette.success.main, theme.palette.error.main],
        borderWidth: 2,
        borderColor: theme.palette.background.paper,
      },
    ],
  }

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' as const },
      tooltip: {
        callbacks: {
          label: function (context: any) {
            return `${context.label}: ${context.parsed}`
          },
        },
      },
    },
  }

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <CircularProgress size={60} />
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Inventory Overview"
        subtitle="Monitor stock levels, track movements, and manage inventory health"
        secondaryAction={{ label: 'Manage Categories', onClick: () => navigate('/inventory/categories') }}
        primaryAction={{ label: 'Add Product', onClick: () => navigate('/inventory/products') }}
      />

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
      />

      {error && (
        <Alert severity="error" sx={{ mb: 4 }}>
          Failed to load inventory data
        </Alert>
      )}

      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        {stats.map((stat, index) => (
          <Grid key={index} size={{ xs: 12, sm: 6, lg: 3 }}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Box
                    sx={{
                      p: 1.5,
                      borderRadius: 2,
                      bgcolor: `${stat.color}.light`,
                      color: `${stat.color}.contrastText`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <stat.icon />
                  </Box>
                  {stat.delta && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      {stat.delta.startsWith('+') ? (
                        <TrendingUpIcon sx={{ fontSize: 16, color: stat.deltaPositiveIsGood ? 'success.main' : 'error.main' }} />
                      ) : (
                        <TrendingDownIcon sx={{ fontSize: 16, color: stat.deltaPositiveIsGood ? 'error.main' : 'success.main' }} />
                      )}
                      <Typography
                        variant={TYPOGRAPHY_STYLES.tableCell.caption.variant}
                        sx={{
                          color: stat.delta.startsWith('+')
                            ? stat.deltaPositiveIsGood ? 'success.main' : 'error.main'
                            : stat.deltaPositiveIsGood ? 'error.main' : 'success.main',
                          fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight,
                          fontSize: TYPOGRAPHY_STYLES.tableCell.caption.fontSize,
                        }}
                      >
                        {stat.delta}
                      </Typography>
                    </Box>
                  )}
                </Box>
                <Typography variant={TYPOGRAPHY_STYLES.pageHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight, mb: 0.5 }}>
                  {stat.value}
                </Typography>
                <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} color="text.secondary">
                  {stat.title}
                  {'subtitle' in stat && stat.subtitle && (
                    <Typography component="span" variant="caption" color="text.disabled" sx={{ ml: 0.5 }}>
                      ({stat.subtitle})
                    </Typography>
                  )}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Charts */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper sx={{ p: 3, height: 400 }}>
            <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, mb: 3 }}>
              Stock Movement Trend
            </Typography>
            <Box sx={{ height: 300 }}>
              {current?.periodData && current.periodData.length > 0 ? (
                <Line data={movementTrendData} options={lineChartOptions} />
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} color="text.secondary">
                    No movement data for this period
                  </Typography>
                </Box>
              )}
            </Box>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 6 }}>
          <Paper sx={{ p: 3, height: 400 }}>
            <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, mb: 3 }}>
              Stock Health Status
            </Typography>
            <Box sx={{ height: 300 }}>
              <Doughnut data={stockHealthData} options={doughnutOptions} />
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Recent Movements + Low Stock Alerts */}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Paper sx={{ overflow: 'hidden' }}>
            <Box sx={{ p: 3, borderBottom: 1, borderColor: 'divider', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight }}>
                Recent Stock Movements
              </Typography>
              <Chip label={`${current?.metrics.stockMovementsIn ?? 0} in / ${current?.metrics.stockMovementsOut ?? 0} out`} color="info" size="small" />
            </Box>
            <TableContainer>
              <Table size={TABLE_STYLES.size}>
                <TableHead>
                  <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, backgroundColor: TABLE_STYLES.header.backgroundColor, py: TABLE_STYLES.header.padding.py } }}>
                    {['Date', 'Product', 'Type', 'Quantity', 'Reference'].map((col) => (
                      <TableCell key={col} align={col === 'Quantity' ? 'right' : 'left'}>
                        <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, color: TYPOGRAPHY_STYLES.tableHeader.color, fontSize: TYPOGRAPHY_STYLES.tableHeader.fontSize }}>
                          {col}
                        </Typography>
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data?.recentMovements && data.recentMovements.length > 0 ? (
                    data.recentMovements.map((movement, idx) => (
                      <TableRow
                        key={idx}
                        hover
                        sx={{ '& .MuiTableCell-root': { borderBottom: TABLE_STYLES.cell.border, py: TABLE_STYLES.cell.padding.py, px: TABLE_STYLES.cell.padding.px }, height: TABLE_STYLES.row.height }}
                      >
                        <TableCell>
                          <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.secondary.fontSize }}>
                            {movement.movementDate ? format(new Date(movement.movementDate), 'MMM dd, yyyy') : 'N/A'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                            {movement.productName}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={movement.movementType.replace(/_/g, ' ')}
                            color="default"
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: TYPOGRAPHY_STYLES.chip.small.fontSize, fontWeight: TYPOGRAPHY_STYLES.chip.small.fontWeight, height: TYPOGRAPHY_STYLES.chip.small.height }}
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            variant={TYPOGRAPHY_STYLES.tableCell.primary.variant}
                            sx={{ fontWeight: TYPOGRAPHY_STYLES.tableCell.primary.fontWeight, fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize, color: movement.quantity > 0 ? 'success.main' : 'error.main' }}
                          >
                            {movement.quantity > 0 ? '+' : ''}{movement.quantity}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.secondary.fontSize }}>
                            {movement.referenceNumber}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} align="center">
                        <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} color="text.secondary">
                          No movements in this period
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Paper sx={{ p: 3 }}>
            <Typography variant={TYPOGRAPHY_STYLES.tableHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.tableHeader.fontWeight, mb: 3 }}>
              Low Stock Alerts
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {data?.lowStockAlerts && data.lowStockAlerts.length > 0 ? (
                data.lowStockAlerts.map((alert) => (
                  <Box key={alert.productId} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        sx={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          bgcolor: alert.status === 'out_of_stock' ? 'error.main' : 'warning.main',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {alert.status === 'out_of_stock' ? (
                          <OutOfStockIcon sx={{ fontSize: 14 }} />
                        ) : (
                          <WarningIcon sx={{ fontSize: 14 }} />
                        )}
                      </Box>
                      <Box>
                        <Typography variant={TYPOGRAPHY_STYLES.tableCell.primary.variant} sx={{ fontSize: TYPOGRAPHY_STYLES.tableCell.primary.fontSize }}>
                          {alert.productName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {alert.stockQuantity} units
                        </Typography>
                      </Box>
                    </Box>
                    <Chip
                      label={alert.status === 'out_of_stock' ? 'Out' : 'Low'}
                      color={alert.status === 'out_of_stock' ? 'error' : 'warning'}
                      size="small"
                      sx={{ fontSize: TYPOGRAPHY_STYLES.chip.small.fontSize, fontWeight: TYPOGRAPHY_STYLES.chip.small.fontWeight, height: TYPOGRAPHY_STYLES.chip.small.height }}
                    />
                  </Box>
                ))
              ) : (
                <Typography variant={TYPOGRAPHY_STYLES.tableCell.secondary.variant} color="text.secondary" align="center">
                  All products well stocked
                </Typography>
              )}
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  )
}

export default InventoryPage
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -i "InventoryPage\|useInventoryAnalytics\|useDashboardFilters"
```

Expected: no output.

- [ ] **Step 3: Run frontend tests**

```bash
cd frontend && npm run test 2>&1 | tail -20
```

Expected: all pass (no tests exist for InventoryPage currently).

- [ ] **Step 4: Commit**

```bash
cd frontend
git add src/pages/inventory/InventoryPage.tsx
git commit -m "feat(inventory): wire DashboardFilterBar and useInventoryAnalytics into InventoryPage"
```

---

## Task 6: End-to-end verification

- [ ] **Step 1: Build and start the full stack**

```bash
cd /home/blur/erp2 && docker compose up -d
sleep 15
```

- [ ] **Step 2: Verify the endpoint returns valid data**

```bash
curl -s "http://localhost/api/inventory/analytics/dashboard?dateRange=this_month" | python3 -m json.tool | head -50
```

Expected: JSON with `current.metrics.totalProducts`, `current.periodData`, `lowStockAlerts`, `recentMovements`.

- [ ] **Step 3: Verify with comparison**

```bash
curl -s "http://localhost/api/inventory/analytics/dashboard?dateRange=this_month&compareWith=previous_period" | python3 -m json.tool | grep -E "comparison|periodStart|periodEnd"
```

Expected: `comparison` block present with its own `periodStart`/`periodEnd`.

- [ ] **Step 4: Manual UI check**

Open `http://localhost` in a browser, navigate to Inventory Overview, confirm:
- `DashboardFilterBar` is visible below the page header
- Changing Period updates the Stock In / Stock Out cards
- Selecting a Comparison period shows delta percentages on Stock In / Stock Out
- Trend chart renders two lines (in/out)
- Low Stock Alerts panel shows items with correct chip colors

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
cd /home/blur/erp2
git add -p
git commit -m "fix(inventory): e2e verification fixes"
```

(Skip if no fixes needed.)
