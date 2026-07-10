import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product, Category, StockMovement } from '../../../database/entities';
import { PurchaseOrderItem } from '../../../database/entities/purchase-order-item.entity';
import { differenceInCalendarDays, subDays, subMonths, subYears } from 'date-fns';
import { SettingsService } from '../../settings/settings.service';
import { resolveDateRange } from '@/common/utils/date-range.util';
import {
  InventoryAnalyticsQueryDto,
  InventoryAnalyticsResponseDto,
  InventoryMetricsDto,
  InventoryPeriodDataDto,
  InventoryPeriodBlockDto,
  LowStockAlertDto,
  RecentMovementDto,
} from '../dto/inventory-analytics.dto';
import { GroupByPeriod } from '@/common/dto/analytics.dto';

interface InventoryDashboardFilters {
  categoryId?: string;
  productIds?: string[];
  stockStatus?: 'in_stock' | 'low_stock' | 'out_of_stock';
}

@Injectable()
export class InventoryAnalyticsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(StockMovement)
    private readonly stockMovementRepository: Repository<StockMovement>,
    @InjectRepository(PurchaseOrderItem)
    private readonly purchaseOrderItemRepository: Repository<PurchaseOrderItem>,
    private readonly settingsService: SettingsService,
  ) {}

  async getInventoryDashboardAnalytics(
    query: InventoryAnalyticsQueryDto,
  ): Promise<InventoryAnalyticsResponseDto> {
    const { timezone } = await this.settingsService.getRegionalSettings();
    const { startDate, endDate } = resolveDateRange(
      timezone,
      query.dateRange,
      query.startDate,
      query.endDate,
    );
    const groupBy = query.groupBy ?? GroupByPeriod.DAY;
    const comparePeriod = query.compareWith
      ? this.computeInventoryComparePeriod(startDate, endDate, query.compareWith)
      : null;

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
      // Pass empty array rather than early-returning — applyProductFilters uses
      // `1 = 0` to short-circuit all sub-queries, which PostgreSQL optimises away.
      filters.productIds = items.map((row: any) => row.productId as string);
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

  private async getInventorySnapshotMetrics(
    filters: InventoryDashboardFilters = {},
  ): Promise<Omit<InventoryMetricsDto, 'stockMovementsIn' | 'stockMovementsOut'>> {
    const threshold = await this.getLowStockThreshold();
    const safeThreshold = Math.floor(Number(threshold));
    const qb = this.productRepository
      .createQueryBuilder('product')
      .leftJoin('product.category', 'category')
      .where('product.deletedAt IS NULL')
      .andWhere('product.isActive = :isActive', { isActive: true })
      .select([
        'COUNT(*) as "totalProducts"',
        'COALESCE(SUM(product.baseCost * product.stockQuantity), 0) as "inventoryValue"',
        'SUM(CASE WHEN product.stockQuantity <= 0 THEN 1 ELSE 0 END) as "outOfStockCount"',
        `SUM(CASE WHEN product.stockQuantity > 0 AND product.stockQuantity <= ${safeThreshold} THEN 1 ELSE 0 END) as "lowStockCount"`,
      ]);

    this.applyProductFilters(qb, filters, 'product', threshold);
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

  private async getInventoryMovementTotals(
    startDate: Date,
    endDate: Date,
    filters: InventoryDashboardFilters = {},
  ): Promise<Pick<InventoryMetricsDto, 'stockMovementsIn' | 'stockMovementsOut'>> {
    const threshold = await this.getLowStockThreshold();
    const qb = this.stockMovementRepository
      .createQueryBuilder('movement')
      .where('movement.movementDate BETWEEN :startDate AND :endDate', { startDate, endDate });

    if (filters.categoryId || filters.productIds !== undefined || filters.stockStatus) {
      qb.innerJoin('movement.product', 'product');
      this.applyProductFilters(qb, filters, 'product', threshold);
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

  private async getInventoryPeriodData(
    startDate: Date,
    endDate: Date,
    groupBy: GroupByPeriod,
    filters: InventoryDashboardFilters = {},
  ): Promise<InventoryPeriodDataDto[]> {
    const threshold = await this.getLowStockThreshold();
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
      this.applyProductFilters(qb, filters, 'product', threshold);
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

  private async getLowStockAlerts(
    limit: number,
    filters: InventoryDashboardFilters = {},
  ): Promise<LowStockAlertDto[]> {
    const threshold = await this.getLowStockThreshold();
    const qb = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .where('product.deletedAt IS NULL')
      .andWhere('product.isActive = :isActive', { isActive: true })
      .andWhere('product.stockQuantity <= :threshold', { threshold });

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

  private async getRecentMovements(
    startDate: Date,
    endDate: Date,
    limit: number,
    filters: InventoryDashboardFilters = {},
  ): Promise<RecentMovementDto[]> {
    const threshold = await this.getLowStockThreshold();
    const qb = this.stockMovementRepository
      .createQueryBuilder('movement')
      .leftJoinAndSelect('movement.product', 'product')
      .leftJoin('sales_orders', 'so', 'movement.referenceType = \'sales_order\' AND movement.referenceId = so.id')
      .leftJoin('purchase_orders', 'po', 'movement.referenceType = \'purchase_order\' AND movement.referenceId = po.id')
      .leftJoin('stock_adjustments', 'sa', 'movement.referenceType = \'stock_adjustment\' AND movement.referenceId = sa.id')
      .addSelect('COALESCE(so.orderNumber, po.orderNumber, sa.adjustmentNumber, \'-\')', 'orderNumberResolved')
      .where('movement.movementDate BETWEEN :startDate AND :endDate', { startDate, endDate });

    if (filters.categoryId || filters.productIds !== undefined || filters.stockStatus) {
      // product is already joined unconditionally via leftJoinAndSelect above
      this.applyProductFilters(qb, filters, 'product', threshold);
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

  private applyProductFilters(
    qb: import('typeorm').SelectQueryBuilder<any>,
    filters: InventoryDashboardFilters,
    productAlias: string = 'product',
    lowStockThreshold: number = 10,
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
      qb.andWhere(`${productAlias}.stockQuantity > :inStockThreshold`, { inStockThreshold: lowStockThreshold });
    } else if (filters.stockStatus === 'low_stock') {
      qb.andWhere(
        `${productAlias}.stockQuantity > :lowStockMin AND ${productAlias}.stockQuantity <= :lowStockMax`,
        { lowStockMin: 0, lowStockMax: lowStockThreshold },
      );
    } else if (filters.stockStatus === 'out_of_stock') {
      qb.andWhere(`${productAlias}.stockQuantity <= :outOfStockThreshold`, { outOfStockThreshold: 0 });
    }
  }

  private async getLowStockThreshold(): Promise<number> {
    const settings = await this.settingsService.getRegionalSettings();
    return settings.lowStockThreshold ?? 10;
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
      return {
        compareStart: subMonths(start, 1),
        compareEnd: subMonths(end, 1),
      };
    }

    return {
      compareStart: subYears(start, 1),
      compareEnd: subYears(end, 1),
    };
  }
}
