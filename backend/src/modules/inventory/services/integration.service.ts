import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Product } from '../../../database/entities/product.entity';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { SalesOrderItem } from '../../../database/entities/sales-order-item.entity';
import { StockMovementService } from './stock-movement.service';
import { ProductService } from './product.service';
import { PricingService } from './pricing.service';
import { SettingsService } from '../../settings/settings.service';

export interface SalesOrderIntegration {
  orderId: string;
  customerId?: string;
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
  }>;
  reserveStock?: boolean;
}

// PurchaseOrderIntegration interface removed - purchasing module disabled

export interface StockReservationResult {
  success: boolean;
  reservedItems: Array<{
    productId: string;
    requestedQuantity: number;
    reservedQuantity: number;
    availableQuantity: number;
  }>;
  failedItems: Array<{
    productId: string;
    requestedQuantity: number;
    availableQuantity: number;
    reason: string;
  }>;
}

export interface StockAvailabilityCheck {
  productId: string;
  sku: string;
  name: string;
  requestedQuantity: number;
  availableQuantity: number;
  reservedQuantity: number;
  stockQuantity: number;
  isAvailable: boolean;
  shortfallQuantity?: number;
}

@Injectable()
export class IntegrationService {
  private readonly logger = new Logger(IntegrationService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(SalesOrder)
    private readonly salesOrderRepository: Repository<SalesOrder>,
    @Inject(forwardRef(() => StockMovementService))
    private readonly stockMovementService: StockMovementService,
    @Inject(forwardRef(() => ProductService))
    private readonly productService: ProductService,
    private readonly pricingService: PricingService,
    private readonly settingsService: SettingsService,
  ) {}

  /**
   * Process sales order - reserve stock and calculate pricing
   */
  async processSalesOrder(
    salesOrderData: SalesOrderIntegration,
    userId?: string,
  ): Promise<{
    stockReservation: StockReservationResult;
    pricing: Map<string, any>;
    totalValue: number;
  }> {
    this.logger.log(`Processing sales order: ${salesOrderData.orderId}`);

    // Check stock availability first
    const availabilityChecks = await this.checkStockAvailability(
      salesOrderData.items.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    );

    const unavailableItems = availabilityChecks.filter(check => !check.isAvailable);
    
    if (unavailableItems.length > 0 && salesOrderData.reserveStock) {
      this.logger.warn(
        `Some items not available for sales order ${salesOrderData.orderId}:`,
        unavailableItems.map(item => `${item.sku}: ${item.shortfallQuantity} short`),
      );
    }

    // Calculate pricing for all items
    const pricingResults = new Map<string, any>();
    let totalValue = 0;

    for (const item of salesOrderData.items) {
      const pricing = await this.pricingService.calculatePrice(item.productId, {
        customerId: salesOrderData.customerId,
        quantity: item.quantity,
        includeDiscounts: true,
      });

      pricingResults.set(item.productId, pricing);
      totalValue += pricing.finalPrice * item.quantity;
    }

    // Reserve stock if requested and possible
    let stockReservation: StockReservationResult = {
      success: true,
      reservedItems: [],
      failedItems: [],
    };

    if (salesOrderData.reserveStock) {
      stockReservation = await this.reserveStockForOrder(
        salesOrderData.items.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
        `Sales Order ${salesOrderData.orderId}`,
        userId,
      );
    }

    // Audit logging removed with authentication system

    this.logger.log(`Sales order processed: ${salesOrderData.orderId}, Total: ${totalValue}`);

    return {
      stockReservation,
      pricing: pricingResults,
      totalValue,
    };
  }

  /**
   * Fulfill sales order - create stock movements for sold items
   */
  async fulfillSalesOrder(
    orderId: string,
    orderNumber: string,
    items: Array<{
      productId: string;
      quantity: number;
      unitPrice: number;
    }>,
    userId?: string,
  ): Promise<void> {
    this.logger.log(`Fulfilling sales order: ${orderId}`);

    // Create stock movements for each sold item
    const movementPromises = items.map(item =>
      this.stockMovementService.recordSale(
        item.productId,
        item.quantity,
        item.unitPrice,
        orderId, // referenceId
        userId,
      ),
    );

    await Promise.all(movementPromises);

    // Release any remaining reservations for this order
    await this.releaseOrderReservations(orderId, userId);

    // Audit logging removed with authentication system

    this.logger.log(`Sales order fulfilled successfully: ${orderId}`);
  }

  /**
   * Check stock availability for multiple items
   */
  async checkStockAvailability(
    items: Array<{ productId: string; quantity: number }>,
  ): Promise<StockAvailabilityCheck[]> {
    const productIds = items.map(item => item.productId);
    const products = await this.productRepository.findBy({ id: In(productIds) });

    const availabilityChecks: StockAvailabilityCheck[] = [];

    for (const item of items) {
      const product = products.find(p => p.id === item.productId);
      
      if (!product) {
        throw new NotFoundException(`Product with ID '${item.productId}' not found`);
      }

      const availableQuantity = product.stockQuantity;
      const isAvailable = availableQuantity >= item.quantity;
      const shortfallQuantity = isAvailable ? 0 : item.quantity - availableQuantity;

      availabilityChecks.push({
        productId: product.id,
        sku: product.barcode,
        name: product.name,
        requestedQuantity: item.quantity,
        availableQuantity,
        reservedQuantity: Number(0),
        stockQuantity: Number(product.stockQuantity),
        isAvailable,
        shortfallQuantity: shortfallQuantity > 0 ? shortfallQuantity : undefined,
      });
    }

    return availabilityChecks;
  }

  /**
   * Reserve stock for an order
   */
  async reserveStockForOrder(
    items: Array<{ productId: string; quantity: number }>,
    reason: string,
    userId?: string,
  ): Promise<StockReservationResult> {
    const reservedItems: StockReservationResult['reservedItems'] = [];
    const failedItems: StockReservationResult['failedItems'] = [];

    for (const item of items) {
      try {
        const product = await this.productRepository.findOne({
          where: { id: item.productId },
        });

        if (!product) {
          failedItems.push({
            productId: item.productId,
            requestedQuantity: item.quantity,
            availableQuantity: 0,
            reason: 'Product not found',
          });
          continue;
        }

        const availableQuantity = product.stockQuantity;
        const reserveQuantity = Math.min(item.quantity, availableQuantity);

        if (reserveQuantity > 0) {
          const success = await this.productService.reserveStock(
            item.productId,
            reserveQuantity,
          );

          if (success) {
            reservedItems.push({
              productId: item.productId,
              requestedQuantity: item.quantity,
              reservedQuantity: reserveQuantity,
              availableQuantity,
            });

            // If partial reservation
            if (reserveQuantity < item.quantity) {
              failedItems.push({
                productId: item.productId,
                requestedQuantity: item.quantity - reserveQuantity,
                availableQuantity: 0,
                reason: 'Partial stock available',
              });
            }
          } else {
            failedItems.push({
              productId: item.productId,
              requestedQuantity: item.quantity,
              availableQuantity,
              reason: 'Failed to reserve stock',
            });
          }
        } else {
          failedItems.push({
            productId: item.productId,
            requestedQuantity: item.quantity,
            availableQuantity,
            reason: 'Insufficient stock available',
          });
        }
      } catch (error) {
        this.logger.error(`Failed to reserve stock for product ${item.productId}: ${error.message}`);
        failedItems.push({
          productId: item.productId,
          requestedQuantity: item.quantity,
          availableQuantity: 0,
          reason: error.message,
        });
      }
    }

    const success = failedItems.length === 0;

    return {
      success,
      reservedItems,
      failedItems,
    };
  }

  /**
   * Release stock reservations for an order
   */
  async releaseOrderReservations(
    orderId: string,
    userId?: string,
  ): Promise<void> {
    // In a complete implementation, you would track reservations by order ID
    // For now, this is a placeholder for the logic
    this.logger.log(`Released reservations for order: ${orderId}`);
    
    // Audit logging removed with authentication system
  }

  /**
   * Get products that need reordering based on current stock levels
   */
  async getProductsNeedingReorder(): Promise<Array<{
    productId: string;
    sku: string;
    name: string;
    currentStock: number;
    reorderLevel: number;
    optimalStockLevel: number;
    recommendedOrderQuantity: number;
    averageDailyUsage: number;
    leadTimeDays: number;
  }>> {
    const { lowStockThreshold } = await this.settingsService.getRegionalSettings();
    // Get products below reorder level
    const products = await this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.category', 'category')
      .where('product.stockQuantity <= :lowStockThreshold', { lowStockThreshold })
      .andWhere('product.isActive = true')
      .getMany();

    const reorderRecommendations = [];

    for (const product of products) {
      // Calculate average daily usage (mock calculation)
      const averageDailyUsage = await this.calculateAverageDailyUsage(product.id);
      
      // Estimate lead time (mock - would come from supplier data)
      const leadTimeDays = 7; // Default 7 days

      // Calculate recommended order quantity
      const safetyStock = averageDailyUsage * leadTimeDays;
      const recommendedOrderQuantity = Math.max(
        Number(product.stockQuantity) - Number(product.stockQuantity),
        safetyStock,
      );

      reorderRecommendations.push({
        productId: product.id,
        sku: product.barcode,
        name: product.name,
        currentStock: Number(product.stockQuantity),
        reorderLevel: lowStockThreshold,
        optimalStockLevel: Number(product.stockQuantity),
        recommendedOrderQuantity,
        averageDailyUsage,
        leadTimeDays,
      });
    }

    return reorderRecommendations.sort(
      (a, b) => (a.currentStock / a.reorderLevel) - (b.currentStock / b.reorderLevel),
    );
  }

  /**
   * Update product pricing based on cost changes
   */
  async updatePricingFromCosts(
    productId: string,
    newBaseCost: number,
    maintainMargins = true,
    userId?: string,
  ): Promise<{
    oldPricing: { retail: number; wholesale: number; special: number };
    newPricing: { retail: number; wholesale: number; special: number };
  }> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
      relations: { priceListItems: { priceList: true } },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID '${productId}' not found`);
    }

    // Get old pricing from price list items
    let retailPrice = 0;
    let wholesalePrice = 0;
    let specialPrice = 0;

    for (const item of product.priceListItems || []) {
      const priceListName = item.priceList?.name.toLowerCase();
      const price = Number(item.price);

      if (priceListName?.includes('retail')) {
        retailPrice = price;
      } else if (priceListName?.includes('wholesale')) {
        wholesalePrice = price;
      } else if (priceListName?.includes('special')) {
        specialPrice = price;
      }
    }

    const oldPricing = {
      retail: retailPrice,
      wholesale: wholesalePrice,
      special: specialPrice,
    };

    let newPricing = oldPricing;

    if (maintainMargins && Number(product.baseCost) > 0) {
      // Calculate current margins
      const retailMargin = oldPricing.retail > 0 ? (oldPricing.retail - Number(product.baseCost)) / oldPricing.retail : 0;
      const wholesaleMargin = oldPricing.wholesale > 0 ? (oldPricing.wholesale - Number(product.baseCost)) / oldPricing.wholesale : 0;
      const specialMargin = oldPricing.special > 0 ? (oldPricing.special - Number(product.baseCost)) / oldPricing.special : 0;

      // Apply same margins to new cost
      newPricing = {
        retail: retailMargin > 0 ? newBaseCost / (1 - retailMargin) : 0,
        wholesale: wholesaleMargin > 0 ? newBaseCost / (1 - wholesaleMargin) : 0,
        special: specialMargin > 0 ? newBaseCost / (1 - specialMargin) : 0,
      };

      // Update product baseCost only
      await this.productRepository.update(productId, {
        baseCost: newBaseCost,
      });

      // Note: Prices should now be updated via PriceListsService.bulkUpdatePrices()
      // This method only provides the calculated new prices for reference
    }

    return { oldPricing, newPricing };
  }

  /**
   * Calculate average daily usage for a product (simplified implementation)
   */
  private async calculateAverageDailyUsage(productId: string): Promise<number> {
    // This would typically analyze stock movements over a period
    // For now, return a mock value
    return 2.5; // 2.5 units per day average
  }

  /**
   * Validate order items before processing
   */
  async validateOrderItems(
    items: Array<{ productId: string; quantity: number }>,
  ): Promise<{
    validItems: Array<{ productId: string; quantity: number; product: Product }>;
    invalidItems: Array<{ productId: string; reason: string }>;
  }> {
    const validItems: Array<{ productId: string; quantity: number; product: Product }> = [];
    const invalidItems: Array<{ productId: string; reason: string }> = [];

    for (const item of items) {
      try {
        const product = await this.productRepository.findOne({
          where: { id: item.productId },
        });

        if (!product) {
          invalidItems.push({
            productId: item.productId,
            reason: 'Product not found',
          });
          continue;
        }

        if (!product.isActive) {
          invalidItems.push({
            productId: item.productId,
            reason: 'Product is not active',
          });
          continue;
        }

        if (item.quantity <= 0) {
          invalidItems.push({
            productId: item.productId,
            reason: 'Quantity must be greater than zero',
          });
          continue;
        }

        validItems.push({
          productId: item.productId,
          quantity: item.quantity,
          product,
        });
      } catch (error) {
        invalidItems.push({
          productId: item.productId,
          reason: `Validation error: ${error.message}`,
        });
      }
    }

    return { validItems, invalidItems };
  }
}
