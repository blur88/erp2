import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThan, In } from 'typeorm';
import { Product, Category, StockMovement, PriceListItem as PriceListItemEntity } from '../../../database/entities';
import { PurchaseCostHistory } from '../../../database/entities/purchase-cost-history.entity';
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

export interface InventorySummaryQuery {
  productIds?: string[];
  categoryId?: string;
  priceListId?: string;
}

export interface InventorySummaryItem {
  productId: string;
  productName: string;
  categoryName: string;
  type: string;
  baseCost: number;
  unitPrice: number;
  stockQuantity: number;
  inventoryValue: number;
  salesValue: number;
  potentialProfit: number;
  status: string;
}

export interface HistoricalInventoryQuery {
  productIds?: string[];
  categoryId?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface HistoricalInventoryItem {
  productName: string;
  categoryName: string;
  movementDate: Date;
  movementType: string;
  movementDescription: string;
  quantity: number;
  previousBalance: number;
  newBalance: number;
  unitValue: number;
  totalValue: number;
  orderNumber: string; // Resolved from joins
  referenceType: string;
  reason: string;
  notes: string;
}

export interface MovementSummaryQuery {
  productIds?: string[];
  categoryId?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface MovementSummaryItem {
  productName: string;
  categoryName: string;
  quantityIn: number;
  quantityOut: number;
  quantityOnHand: number;
}

export interface PriceListQuery {
  productIds?: string[];
  categoryId?: string;
  priceListId?: string;
  discountPercent?: number;
}

export interface PriceListReportItem {
  productName: string;
  categoryName: string;
  price: number;
  discountedPrice: number;
  salesCost: number;
}

export interface ProductCostQuery {
  productIds?: string[];
  startDate?: Date;
  endDate?: Date;
}

export interface ProductCostItem {
  productName: string;
  categoryName: string;
  transactionType: string;
  orderNumber: string;
  orderDate: Date;
  quantityChange: number;
  quantityAfter: number;
  costChange: number;
  totalCost: number;
  averageCost: number;
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
    @InjectRepository(PurchaseCostHistory)
    private readonly purchaseCostHistoryRepository: Repository<PurchaseCostHistory>,
    @InjectRepository(PriceListItemEntity)
    private readonly priceListItemRepository: Repository<PriceListItemEntity>,
  ) {}

  async getInventorySummary(
    query: InventorySummaryQuery,
  ): Promise<{ data: InventorySummaryItem[] }> {
    const queryBuilder = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .where('product.isActive = :isActive', { isActive: true })
      .andWhere('product.deletedAt IS NULL');

    // Product IDs filter
    if (query.productIds && query.productIds.length > 0) {
      queryBuilder.andWhere('product.id IN (:...productIds)', {
        productIds: query.productIds,
      });
    }

    // Category filter
    if (query.categoryId) {
      queryBuilder.andWhere('product.categoryId = :categoryId', {
        categoryId: query.categoryId,
      });
    }

    // Order by product name
    queryBuilder.orderBy('product.name', 'ASC');

    const products = await queryBuilder.getMany();

    // Fetch prices from price list if priceListId is provided
    let priceMap: Map<string, number> = new Map();
    if (query.priceListId) {
      const priceListItems = await this.priceListItemRepository.find({
        where: {
          priceListId: query.priceListId,
          productId: In(products.map(p => p.id)),
        },
      });
      priceListItems.forEach(item => {
        priceMap.set(item.productId, parseFloat(item.price?.toString() || '0'));
      });
    }

    const data: InventorySummaryItem[] = products.map((product) => {
      const baseCost = parseFloat(product.baseCost?.toString() || '0');
      const stockQuantity = parseFloat(product.stockQuantity?.toString() || '0');

      // Get unit price from price list, fallback to base cost if not found
      const unitPrice = query.priceListId
        ? (priceMap.get(product.id) || baseCost)
        : baseCost;

      // Calculate inventory value (cost * quantity)
      const inventoryValue = baseCost * stockQuantity;

      // Calculate sales value (unit price * quantity)
      const salesValue = unitPrice * stockQuantity;

      // Calculate potential profit (sales value - inventory value)
      const potentialProfit = salesValue - inventoryValue;

      return {
        productId: product.id,
        productName: product.name,
        categoryName: product.category?.name || 'Uncategorized',
        type: product.type || 'product',
        baseCost,
        unitPrice,
        stockQuantity,
        inventoryValue,
        salesValue,
        potentialProfit,
        status: 'active',
      };
    });

    return { data };
  }

  async getHistoricalInventory(
    query: HistoricalInventoryQuery,
  ): Promise<{ data: HistoricalInventoryItem[] }> {
    // First, get all products that match the filters
    const productQueryBuilder = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .where('product.isActive = :isActive', { isActive: true })
      .andWhere('product.deletedAt IS NULL');

    // Product IDs filter
    if (query.productIds && query.productIds.length > 0) {
      productQueryBuilder.andWhere('product.id IN (:...productIds)', {
        productIds: query.productIds,
      });
    }

    // Category filter
    if (query.categoryId) {
      productQueryBuilder.andWhere('product.categoryId = :categoryId', {
        categoryId: query.categoryId,
      });
    }

    // If target date (endDate) is specified, only include products created on or before that date
    if (query.endDate) {
      productQueryBuilder.andWhere('product.createdAt <= :endDate', {
        endDate: query.endDate,
      });
    }

    productQueryBuilder.orderBy('product.name', 'ASC');
    const products = await productQueryBuilder.getMany();

    // Now get stock movements for these products
    const movementQueryBuilder = this.stockMovementRepository
      .createQueryBuilder('movement')
      .leftJoinAndSelect('movement.product', 'product')
      .where('1=1');

    // Only get movements for the filtered products
    if (products.length > 0) {
      const productIds = products.map(p => p.id);
      movementQueryBuilder.andWhere('movement.productId IN (:...productIds)', {
        productIds,
      });
    } else {
      // No products match filters, return empty
      return { data: [] };
    }

    // Date range filter
    if (query.startDate && query.endDate) {
      movementQueryBuilder.andWhere('movement.movementDate BETWEEN :startDate AND :endDate', {
        startDate: query.startDate,
        endDate: query.endDate,
      });
    } else if (query.startDate) {
      movementQueryBuilder.andWhere('movement.movementDate >= :startDate', {
        startDate: query.startDate,
      });
    } else if (query.endDate) {
      movementQueryBuilder.andWhere('movement.movementDate <= :endDate', {
        endDate: query.endDate,
      });
    }

    // Get all purchase cost history batches for the filtered products
    const productIds = products.map(p => p.id);

    // Calculate cost and quantity for each product using purchase_cost_history
    // This matches the BaseCostCalculatorService method
    const data: HistoricalInventoryItem[] = await Promise.all(
      products.map(async (product) => {
        // Get batches with remaining stock for this product
        const batches = await this.purchaseCostHistoryRepository.find({
          where: {
            productId: product.id,
            remainingQuantity: MoreThan(0),
          },
          order: { receivedDate: 'ASC' },
        });

        // Apply date filter if endDate is specified
        const filteredBatches = query.endDate
          ? batches.filter(batch => batch.receivedDate <= query.endDate)
          : batches;

        // Calculate using Moving Average from RECEIVED quantities
        // Formula: SUM(receivedQty × landedCost) / SUM(receivedQty)
        let totalCost = 0;
        let totalReceivedQty = 0;
        let totalRemainingQty = 0;

        for (const batch of filteredBatches) {
          const receivedQty = parseFloat(batch.receivedQuantity?.toString() || '0');
          const remainingQty = parseFloat(batch.remainingQuantity?.toString() || '0');
          const landedCost = parseFloat(batch.landedCost?.toString() || '0');

          totalReceivedQty += receivedQty;
          totalRemainingQty += remainingQty;
          totalCost += receivedQty * landedCost;
        }

        // Calculate weighted average unit cost
        const unitValue = totalReceivedQty > 0 ? totalCost / totalReceivedQty : 0;

        // Total value is based on REMAINING quantity, not received quantity
        const totalValue = totalRemainingQty * unitValue;

        return {
          productName: product.name,
          categoryName: product.category?.name || 'Uncategorized',
          movementDate: null, // Not applicable for summary
          movementType: '', // Not applicable for summary
          movementDescription: '', // Not applicable for summary
          quantity: totalRemainingQty,
          previousBalance: 0, // Not applicable for summary
          newBalance: totalRemainingQty, // Same as quantity for summary
          unitValue,
          totalValue,
          orderNumber: '', // Not applicable for summary
          referenceType: '', // Not applicable for summary
          reason: '', // Not applicable for summary
          notes: '', // Not applicable for summary
        };
      })
    );

    return { data };
  }

  async getMovementSummary(
    query: MovementSummaryQuery,
  ): Promise<{ data: MovementSummaryItem[] }> {
    // First, get all products that match the filters
    const productQueryBuilder = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .where('product.isActive = :isActive', { isActive: true })
      .andWhere('product.deletedAt IS NULL');

    // Product IDs filter
    if (query.productIds && query.productIds.length > 0) {
      productQueryBuilder.andWhere('product.id IN (:...productIds)', {
        productIds: query.productIds,
      });
    }

    // Category filter
    if (query.categoryId) {
      productQueryBuilder.andWhere('product.categoryId = :categoryId', {
        categoryId: query.categoryId,
      });
    }

    productQueryBuilder.orderBy('product.name', 'ASC');
    const products = await productQueryBuilder.getMany();

    if (products.length === 0) {
      return { data: [] };
    }

    // Get stock movements for these products
    const movementQueryBuilder = this.stockMovementRepository
      .createQueryBuilder('movement')
      .where('movement.productId IN (:...productIds)', {
        productIds: products.map(p => p.id),
      });

    // Date range filter
    if (query.startDate && query.endDate) {
      movementQueryBuilder.andWhere('movement.movementDate BETWEEN :startDate AND :endDate', {
        startDate: query.startDate,
        endDate: query.endDate,
      });
    } else if (query.startDate) {
      movementQueryBuilder.andWhere('movement.movementDate >= :startDate', {
        startDate: query.startDate,
      });
    } else if (query.endDate) {
      movementQueryBuilder.andWhere('movement.movementDate <= :endDate', {
        endDate: query.endDate,
      });
    }

    const movements = await movementQueryBuilder.getMany();

    // Calculate summary for each product
    const data: MovementSummaryItem[] = products.map((product) => {
      const productMovements = movements.filter(m => m.productId === product.id);

      let quantityIn = 0;
      let quantityOut = 0;

      productMovements.forEach(movement => {
        const qty = parseFloat(movement.quantity?.toString() || '0');
        if (qty > 0) {
          quantityIn += qty;
        } else {
          quantityOut += Math.abs(qty);
        }
      });

      // Quantity on hand is current stock quantity
      const quantityOnHand = parseFloat(product.stockQuantity?.toString() || '0');

      return {
        productName: product.name,
        categoryName: product.category?.name || 'Uncategorized',
        quantityIn,
        quantityOut,
        quantityOnHand,
      };
    });

    return { data };
  }

  async getPriceList(
    query: PriceListQuery,
  ): Promise<{ data: PriceListReportItem[] }> {
    // Get all products that match the filters
    const productQueryBuilder = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .where('product.isActive = :isActive', { isActive: true })
      .andWhere('product.deletedAt IS NULL');

    // Product IDs filter
    if (query.productIds && query.productIds.length > 0) {
      productQueryBuilder.andWhere('product.id IN (:...productIds)', {
        productIds: query.productIds,
      });
    }

    // Category filter
    if (query.categoryId) {
      productQueryBuilder.andWhere('product.categoryId = :categoryId', {
        categoryId: query.categoryId,
      });
    }

    productQueryBuilder.orderBy('product.name', 'ASC');
    const products = await productQueryBuilder.getMany();

    // Default discount
    const discountPercent = query.discountPercent || 0;

    // Fetch prices from price list if priceListId is provided
    let priceMap: Map<string, number> = new Map();
    if (query.priceListId) {
      const priceListItems = await this.priceListItemRepository.find({
        where: {
          priceListId: query.priceListId,
          productId: In(products.map(p => p.id)),
        },
      });
      priceListItems.forEach(item => {
        priceMap.set(item.productId, parseFloat(item.price?.toString() || '0'));
      });
    }

    // Calculate price list for each product
    const data: PriceListReportItem[] = products.map((product) => {
      // Get price from price list or fallback to base cost
      const baseCost = parseFloat(product.baseCost?.toString() || '0');
      const price = query.priceListId
        ? (priceMap.get(product.id) || baseCost)
        : baseCost;

      // Calculate discounted price
      const discountedPrice = price * (1 - discountPercent / 100);

      // Sales cost is the base cost
      const salesCost = baseCost;

      return {
        productName: product.name,
        categoryName: product.category?.name || 'Uncategorized',
        price,
        discountedPrice,
        salesCost,
      };
    });

    return { data };
  }

  async getProductCost(
    query: ProductCostQuery,
  ): Promise<{ data: ProductCostItem[] }> {
    // Build query to get stock movements with related order information
    const movementQueryBuilder = this.stockMovementRepository
      .createQueryBuilder('movement')
      .leftJoinAndSelect('movement.product', 'product')
      .leftJoinAndSelect('product.category', 'category')
      .leftJoin('sales_orders', 'so', 'movement.referenceType = \'sales_order\' AND movement.referenceId = so.id')
      .leftJoin('purchase_orders', 'po', 'movement.referenceType = \'purchase_order\' AND movement.referenceId = po.id')
      .leftJoin('stock_adjustments', 'sa', 'movement.referenceType = \'stock_adjustment\' AND movement.referenceId = sa.id')
      .addSelect('COALESCE(so.orderNumber, po.orderNumber, sa.adjustmentNumber, \'-\')', 'orderNumberResolved')
      .where('product.isActive = :isActive', { isActive: true })
      .andWhere('product.deletedAt IS NULL');

    // Product IDs filter
    if (query.productIds && query.productIds.length > 0) {
      movementQueryBuilder.andWhere('movement.productId IN (:...productIds)', {
        productIds: query.productIds,
      });
    }

    // Date range filter
    if (query.startDate && query.endDate) {
      movementQueryBuilder.andWhere('movement.movementDate BETWEEN :startDate AND :endDate', {
        startDate: query.startDate,
        endDate: query.endDate,
      });
    } else if (query.startDate) {
      movementQueryBuilder.andWhere('movement.movementDate >= :startDate', {
        startDate: query.startDate,
      });
    } else if (query.endDate) {
      movementQueryBuilder.andWhere('movement.movementDate <= :endDate', {
        endDate: query.endDate,
      });
    }

    // Order by date and product
    movementQueryBuilder.orderBy('movement.movementDate', 'ASC')
      .addOrderBy('product.name', 'ASC');

    const { entities: movements, raw: rawResults } = await movementQueryBuilder.getRawAndEntities();

    // Create a map of movement IDs to resolved order numbers
    const orderNumberMap = new Map<string, string>();
    rawResults.forEach((raw: any) => {
      orderNumberMap.set(raw.movement_id, raw.orderNumberResolved || '-');
    });

    // Calculate running cost for each product movement
    const productRunningTotals = new Map<string, {
      totalQuantity: number;
      totalCost: number;
    }>();

    // Helper function to map movement type to transaction type label
    const getTransactionType = (movementType: string): string => {
      switch (movementType) {
        case 'purchase_receipt':
          return 'Purchase Order Receive';
        case 'sale':
          return 'Sales Order Fulfillment';
        case 'adjustment_increase':
        case 'adjustment_decrease':
          return 'Stock Adjustment';
        case 'sales_return':
          return 'Sales Return';
        case 'sale_reversal':
          return 'Sales Order Unfulfillment';
        case 'purchase_return':
          return 'Purchase Return';
        case 'initial_stock':
          return 'Initial Stock';
        case 'production_receipt':
          return 'Production Receipt';
        case 'production_consumption':
          return 'Production Consumption';
        case 'transfer_in':
          return 'Transfer In';
        case 'transfer_out':
          return 'Transfer Out';
        case 'damage':
          return 'Damage';
        case 'expiry':
          return 'Expiry';
        case 'theft':
          return 'Theft';
        case 'loss':
          return 'Loss';
        default:
          return 'Other';
      }
    };

    const data: ProductCostItem[] = movements.map((movement) => {
      const productId = movement.productId;
      const quantityChange = parseFloat(movement.quantity?.toString() || '0');
      const unitValue = parseFloat(movement.unitValue?.toString() || '0');
      const quantityAfter = parseFloat(movement.newBalance?.toString() || '0');

      // Get or initialize running totals for this product
      let productTotals = productRunningTotals.get(productId);
      if (!productTotals) {
        productTotals = { totalQuantity: 0, totalCost: 0 };
        productRunningTotals.set(productId, productTotals);
      }

      // Calculate cost change for this movement
      // For inward movements: positive cost change
      // For outward movements: negative cost change
      let costChange: number;

      // Update running totals based on movement type (inward vs outward)
      if (quantityChange > 0) {
        // Inward movement: add to totals
        costChange = quantityChange * unitValue;
        productTotals.totalQuantity += quantityChange;
        productTotals.totalCost += costChange;
      } else {
        // Outward movement: calculate cost based on average, then update totals
        const avgCostBefore = productTotals.totalQuantity > 0
          ? productTotals.totalCost / productTotals.totalQuantity
          : unitValue;

        const outwardCost = Math.abs(quantityChange) * avgCostBefore;
        costChange = -outwardCost; // Negative for outward movements
        productTotals.totalQuantity += quantityChange; // Will decrease
        productTotals.totalCost -= outwardCost; // Decrease cost proportionally
      }

      // Calculate average cost after this movement
      const averageCost = productTotals.totalQuantity > 0
        ? productTotals.totalCost / productTotals.totalQuantity
        : 0;

      // Total cost is the current accumulated cost for this product
      const totalCost = productTotals.totalCost;

      return {
        productName: movement.product?.name || 'Unknown',
        categoryName: movement.product?.category?.name || 'Uncategorized',
        transactionType: getTransactionType(movement.movementType),
        orderNumber: orderNumberMap.get(movement.id) || '-',
        orderDate: movement.movementDate,
        quantityChange,
        quantityAfter,
        costChange,
        totalCost,
        averageCost,
      };
    });

    return { data };
  }

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
        'SUM(CASE WHEN product.stockQuantity <= 0 THEN 1 ELSE 0 END) as "outOfStockCount"',
        'SUM(CASE WHEN product.stockQuantity > 0 AND product.stockQuantity <= 10 THEN 1 ELSE 0 END) as "lowStockCount"',
      ])
      .getRawOne();

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
      stockMovementsIn: parseFloat(result?.movementsIn) || 0,
      stockMovementsOut: parseFloat(result?.movementsOut) || 0,
    };
  }

  private async getInventoryPeriodData(
    startDate: Date,
    endDate: Date,
    groupBy: GroupByPeriod,
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
  ): Promise<RecentMovementDto[]> {
    const { entities: movements, raw: rawResults } = await this.stockMovementRepository
      .createQueryBuilder('movement')
      .leftJoinAndSelect('movement.product', 'product')
      .leftJoin('sales_orders', 'so', 'movement.referenceType = \'sales_order\' AND movement.referenceId = so.id')
      .leftJoin('purchase_orders', 'po', 'movement.referenceType = \'purchase_order\' AND movement.referenceId = po.id')
      .leftJoin('stock_adjustments', 'sa', 'movement.referenceType = \'stock_adjustment\' AND movement.referenceId = sa.id')
      .addSelect('COALESCE(so.orderNumber, po.orderNumber, sa.adjustmentNumber, \'-\')', 'orderNumberResolved')
      .where('movement.movementDate BETWEEN :startDate AND :endDate', { startDate, endDate })
      .orderBy('movement.movementDate', 'DESC')
      .limit(limit)
      .getRawAndEntities();

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

  private resolveInventoryDateRange(
    dateRange?: DateRange,
    customStartDate?: Date,
    customEndDate?: Date,
  ): { startDate: Date; endDate: Date } {
    const now = new Date();
    let startDate: Date;
    let endDate = new Date(new Date().setHours(23, 59, 59, 999));

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
      default:
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
