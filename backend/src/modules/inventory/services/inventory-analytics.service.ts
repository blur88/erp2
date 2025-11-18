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
    const queryBuilder = this.stockMovementRepository
      .createQueryBuilder('movement')
      .leftJoinAndSelect('movement.product', 'product')
      .leftJoinAndSelect('product.category', 'category')
      .where('movement.status = :status', { status: 'completed' });

    // Date range filter
    if (query.startDate && query.endDate) {
      queryBuilder.andWhere('movement.movementDate BETWEEN :startDate AND :endDate', {
        startDate: query.startDate,
        endDate: query.endDate,
      });
    } else if (query.startDate) {
      queryBuilder.andWhere('movement.movementDate >= :startDate', {
        startDate: query.startDate,
      });
    } else if (query.endDate) {
      queryBuilder.andWhere('movement.movementDate <= :endDate', {
        endDate: query.endDate,
      });
    }

    // Product IDs filter
    if (query.productIds && query.productIds.length > 0) {
      queryBuilder.andWhere('movement.productId IN (:...productIds)', {
        productIds: query.productIds,
      });
    }

    // Category filter
    if (query.categoryId) {
      queryBuilder.andWhere('product.categoryId = :categoryId', {
        categoryId: query.categoryId,
      });
    }

    // Order by movement date descending (most recent first)
    queryBuilder.orderBy('movement.movementDate', 'DESC');

    const movements = await queryBuilder.getMany();

    const data: HistoricalInventoryItem[] = movements.map((movement) => {
      const quantity = parseFloat(movement.quantity?.toString() || '0');
      const previousBalance = parseFloat(movement.previousBalance?.toString() || '0');
      const newBalance = parseFloat(movement.newBalance?.toString() || '0');
      const unitValue = parseFloat(movement.unitValue?.toString() || '0');
      const totalValue = parseFloat(movement.totalValue?.toString() || '0');

      return {
        productName: movement.product?.name || 'Unknown Product',
        categoryName: movement.product?.category?.name || 'Uncategorized',
        movementDate: movement.movementDate,
        movementType: movement.movementType,
        movementDescription: movement.getDescription(),
        quantity,
        previousBalance,
        newBalance,
        unitValue,
        totalValue,
        referenceNumber: movement.referenceNumber || '',
        referenceType: movement.referenceType || '',
        reason: movement.reason || '',
        notes: movement.notes || '',
      };
    });

    return { data };
  }
}
