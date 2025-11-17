import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product, Category } from '../../../database/entities';

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

@Injectable()
export class InventoryAnalyticsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
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
}
