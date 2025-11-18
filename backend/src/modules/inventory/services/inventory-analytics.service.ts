import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Product, Category, StockMovement } from '../../../database/entities';

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

@Injectable()
export class InventoryAnalyticsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(StockMovement)
    private readonly stockMovementRepository: Repository<StockMovement>,
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

    productQueryBuilder.orderBy('product.name', 'ASC');
    const products = await productQueryBuilder.getMany();

    // Now get stock movements for these products
    const movementQueryBuilder = this.stockMovementRepository
      .createQueryBuilder('movement')
      .leftJoinAndSelect('movement.product', 'product')
      .where('movement.status = :status', { status: 'completed' });

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

    const movements = await movementQueryBuilder.getMany();

    // Initialize product map with all products (including those with no movements)
    const productMap = new Map<string, {
      productName: string;
      categoryName: string;
      quantity: number;
      totalValue: number;
      runningAvgCost: number; // Track average cost for outward movements
    }>();

    // Add all products to the map first
    products.forEach((product) => {
      productMap.set(product.id, {
        productName: product.name,
        categoryName: product.category?.name || 'Uncategorized',
        quantity: 0,
        totalValue: 0,
        runningAvgCost: 0,
      });
    });

    // Define inward movement types (increase stock)
    const inwardMovements = [
      'purchase_receipt',
      'sales_return',
      'sale_reversal',
      'production_receipt',
      'transfer_in',
      'adjustment_increase',
      'initial_stock',
    ];

    // Define outward movement types (decrease stock)
    const outwardMovements = [
      'sale',
      'purchase_return',
      'production_consumption',
      'transfer_out',
      'adjustment_decrease',
      'damage',
      'expiry',
      'theft',
      'loss',
    ];

    // Now process movements for products that have them
    movements.forEach((movement) => {
      const productId = movement.productId;
      const quantity = parseFloat(movement.quantity?.toString() || '0');
      const totalValue = parseFloat(movement.totalValue?.toString() || '0');
      const unitValue = parseFloat(movement.unitValue?.toString() || '0');

      // Product should already be in map, but check just in case
      if (!productMap.has(productId)) {
        productMap.set(productId, {
          productName: movement.product?.name || 'Unknown Product',
          categoryName: movement.product?.category?.name || 'Uncategorized',
          quantity: 0,
          totalValue: 0,
          runningAvgCost: 0,
        });
      }

      const productData = productMap.get(productId);

      // For inward movements, add to quantity and update running average
      if (inwardMovements.includes(movement.movementType)) {
        const inQty = Math.abs(quantity);
        const inValue = Math.abs(totalValue);

        productData.quantity += inQty;
        productData.totalValue += inValue;

        // Update running average cost
        if (productData.quantity > 0) {
          productData.runningAvgCost = productData.totalValue / productData.quantity;
        }
      }
      // For outward movements, subtract quantity using running average cost
      else if (outwardMovements.includes(movement.movementType)) {
        const outQty = Math.abs(quantity);

        // Use movement's totalValue if available, otherwise use running average
        let outValue = Math.abs(totalValue);
        if (!outValue && unitValue) {
          outValue = outQty * unitValue;
        } else if (!outValue && productData.runningAvgCost > 0) {
          outValue = outQty * productData.runningAvgCost;
        }

        productData.quantity -= outQty;
        productData.totalValue -= outValue;

        // Update running average cost (should remain stable for FIFO/weighted avg)
        if (productData.quantity > 0 && productData.totalValue > 0) {
          productData.runningAvgCost = productData.totalValue / productData.quantity;
        }
      }
    });

    // Calculate weighted average unit value and convert to array
    const data: HistoricalInventoryItem[] = Array.from(productMap.values()).map((item) => {
      // Calculate average unit value (avoid division by zero)
      const unitValue = item.quantity !== 0 ? item.totalValue / item.quantity : 0;

      return {
        productName: item.productName,
        categoryName: item.categoryName,
        movementDate: null, // Not applicable for summary
        movementType: '', // Not applicable for summary
        movementDescription: '', // Not applicable for summary
        quantity: item.quantity,
        previousBalance: 0, // Not applicable for summary
        newBalance: item.quantity, // Same as quantity for summary
        unitValue: Math.abs(unitValue),
        totalValue: Math.abs(item.totalValue),
        referenceNumber: '', // Not applicable for summary
        referenceType: '', // Not applicable for summary
        reason: '', // Not applicable for summary
        notes: '', // Not applicable for summary
      };
    });

    return { data };
  }
}
