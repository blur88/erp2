import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThan } from 'typeorm';
import { Product, Category, StockMovement } from '../../../database/entities';
import { PurchaseCostHistory } from '../../../database/entities/purchase-cost-history.entity';

interface InventorySummaryQuery {
  productIds?: string[];
  categoryId?: string;
}

interface InventorySummaryItem {
  productName: string;
  categoryName: string;
  type: string;
  baseCost: number;
  retailPrice: number;
  wholesalePrice: number;
  specialPrice: number;
  stockQuantity: number;
  inventoryValue: number;
  retailValue: number;
  potentialProfit: number;
  status: string;
}

interface HistoricalInventoryQuery {
  productIds?: string[];
  categoryId?: string;
  startDate?: Date;
  endDate?: Date;
}

interface HistoricalInventoryItem {
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
  referenceNumber: string;
  referenceType: string;
  reason: string;
  notes: string;
}

interface MovementSummaryQuery {
  productIds?: string[];
  categoryId?: string;
  startDate?: Date;
  endDate?: Date;
}

interface MovementSummaryItem {
  productName: string;
  categoryName: string;
  quantityIn: number;
  quantityOut: number;
  quantityOnHand: number;
}

interface PriceListQuery {
  productIds?: string[];
  categoryId?: string;
  priceType?: string; // 'retail', 'wholesale', 'special'
  discountPercent?: number;
}

interface PriceListItem {
  productName: string;
  categoryName: string;
  price: number;
  discountedPrice: number;
  salesCost: number;
}

interface ProductCostQuery {
  productIds?: string[];
  startDate?: Date;
  endDate?: Date;
}

interface ProductCostItem {
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

    const data: InventorySummaryItem[] = products.map((product) => {
      const baseCost = parseFloat(product.baseCost?.toString() || '0');
      const retailPrice = parseFloat(product.retailPrice?.toString() || '0');
      const wholesalePrice = parseFloat(product.wholesalePrice?.toString() || '0');
      const specialPrice = parseFloat(product.specialPrice?.toString() || '0');
      const stockQuantity = parseFloat(product.stockQuantity?.toString() || '0');

      // Calculate inventory value (cost * quantity)
      const inventoryValue = baseCost * stockQuantity;

      // Calculate retail value (retail price * quantity)
      const retailValue = retailPrice * stockQuantity;

      // Calculate potential profit (retail value - inventory value)
      const potentialProfit = retailValue - inventoryValue;

      return {
        productName: product.name,
        categoryName: product.category?.name || 'Uncategorized',
        type: product.type || 'product',
        baseCost,
        retailPrice,
        wholesalePrice,
        specialPrice,
        stockQuantity,
        inventoryValue,
        retailValue,
        potentialProfit,
        status: product.status || 'active',
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
          referenceNumber: '', // Not applicable for summary
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
  ): Promise<{ data: PriceListItem[] }> {
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

    // Default price type and discount
    const priceType = query.priceType || 'retail';
    const discountPercent = query.discountPercent || 0;

    // Calculate price list for each product
    const data: PriceListItem[] = products.map((product) => {
      // Determine which price to use
      let price = 0;
      if (priceType === 'wholesale') {
        price = parseFloat(product.wholesalePrice?.toString() || '0');
      } else if (priceType === 'special') {
        price = parseFloat(product.specialPrice?.toString() || '0');
      } else {
        // Default to retail
        price = parseFloat(product.retailPrice?.toString() || '0');
      }

      // Calculate discounted price
      const discountedPrice = price * (1 - discountPercent / 100);

      // Sales cost is the base cost
      const salesCost = parseFloat(product.baseCost?.toString() || '0');

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
      .addSelect('COALESCE(so.orderNumber, po.orderNumber, sa.adjustmentNumber, movement.referenceNumber, \'-\')', 'orderNumberResolved')
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
        orderNumber: orderNumberMap.get(movement.id) || movement.referenceNumber || '-',
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
}
