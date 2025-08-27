import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Product } from '../../../database/entities/product.entity';
import { Category } from '../../../database/entities/category.entity';
import { Customer } from '../../../database/entities/customer.entity';
import { BulkUpdatePricesDto, ProductPriceUpdateDto } from '../dto/product.dto';
import { AuditService } from './audit.service';

export interface PriceCalculationOptions {
  customerType?: 'retail' | 'wholesale' | 'special';
  customerId?: string;
  quantity?: number;
  categoryId?: string;
  promotionCode?: string;
  includeDiscounts?: boolean;
}

export interface PriceBreakdown {
  basePrice: number;
  discountAmount: number;
  discountPercentage: number;
  finalPrice: number;
  priceType: 'retail' | 'wholesale' | 'special';
  appliedDiscounts: Array<{
    type: string;
    description: string;
    amount: number;
    percentage: number;
  }>;
}

export interface MarginAnalysis {
  retailMarginAmount: number;
  retailMarginPercentage: number;
  wholesaleMarginAmount: number;
  wholesaleMarginPercentage: number;
  specialMarginAmount: number;
  specialMarginPercentage: number;
  recommendedRetailPrice: number;
  recommendedWholesalePrice: number;
  competitorPricing?: {
    averageRetailPrice: number;
    averageWholesalePrice: number;
    pricePosition: 'below' | 'competitive' | 'above';
  };
}

export interface PricingRule {
  id: string;
  name: string;
  type: 'category' | 'customer' | 'quantity' | 'product';
  categoryIds?: string[];
  customerIds?: string[];
  productIds?: string[];
  minQuantity?: number;
  maxQuantity?: number;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  startDate?: Date;
  endDate?: Date;
  isActive: boolean;
  priority: number;
}

@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Calculate price for a product based on various factors
   */
  async calculatePrice(
    productId: string,
    options: PriceCalculationOptions = {},
  ): Promise<PriceBreakdown> {
    this.logger.log(`Calculating price for product ${productId}`);

    const product = await this.productRepository.findOne({
      where: { id: productId },
      relations: ['category'],
    });

    if (!product) {
      throw new NotFoundException(`Product with ID '${productId}' not found`);
    }

    // Determine base price type
    let priceType: 'retail' | 'wholesale' | 'special' = 'retail';
    let basePrice = Number(product.retailPrice);

    // Determine price type based on customer or explicit type
    if (options.customerId) {
      const customer = await this.customerRepository.findOne({
        where: { id: options.customerId },
      });
      if (customer) {
        priceType = this.getCustomerPriceType(customer);
      }
    } else if (options.customerType) {
      priceType = options.customerType;
    }

    // Set base price based on type
    switch (priceType) {
      case 'wholesale':
        basePrice = Number(product.wholesalePrice);
        break;
      case 'special':
        basePrice = Number(product.specialPrice);
        break;
      default:
        basePrice = Number(product.retailPrice);
    }

    // Apply quantity-based pricing adjustments
    if (options.quantity && options.quantity > 1) {
      const quantityDiscount = this.calculateQuantityDiscount(options.quantity, basePrice);
      if (quantityDiscount > 0) {
        basePrice -= quantityDiscount;
      }
    }

    // Calculate discounts
    const appliedDiscounts: Array<{
      type: string;
      description: string;
      amount: number;
      percentage: number;
    }> = [];

    let totalDiscountAmount = 0;

    // Apply category-based discounts
    if (options.includeDiscounts !== false) {
      const categoryDiscount = await this.calculateCategoryDiscount(product.category.id, basePrice);
      if (categoryDiscount.amount > 0) {
        appliedDiscounts.push({
          type: 'category',
          description: `Category discount: ${product.category.name}`,
          amount: categoryDiscount.amount,
          percentage: categoryDiscount.percentage,
        });
        totalDiscountAmount += categoryDiscount.amount;
      }

      // Apply customer-specific discounts
      if (options.customerId) {
        const customerDiscount = await this.calculateCustomerDiscount(options.customerId, basePrice);
        if (customerDiscount.amount > 0) {
          appliedDiscounts.push({
            type: 'customer',
            description: 'Customer-specific discount',
            amount: customerDiscount.amount,
            percentage: customerDiscount.percentage,
          });
          totalDiscountAmount += customerDiscount.amount;
        }
      }

      // Apply promotion code discounts
      if (options.promotionCode) {
        const promotionDiscount = await this.calculatePromotionDiscount(
          options.promotionCode,
          productId,
          basePrice,
        );
        if (promotionDiscount.amount > 0) {
          appliedDiscounts.push({
            type: 'promotion',
            description: `Promotion: ${options.promotionCode}`,
            amount: promotionDiscount.amount,
            percentage: promotionDiscount.percentage,
          });
          totalDiscountAmount += promotionDiscount.amount;
        }
      }
    }

    const finalPrice = Math.max(0, basePrice - totalDiscountAmount);
    const discountPercentage = basePrice > 0 ? (totalDiscountAmount / basePrice) * 100 : 0;

    return {
      basePrice,
      discountAmount: totalDiscountAmount,
      discountPercentage,
      finalPrice,
      priceType,
      appliedDiscounts,
    };
  }

  /**
   * Calculate bulk price for multiple products
   */
  async calculateBulkPrices(
    productIds: string[],
    options: PriceCalculationOptions = {},
  ): Promise<Map<string, PriceBreakdown>> {
    const priceMap = new Map<string, PriceBreakdown>();

    for (const productId of productIds) {
      try {
        const priceBreakdown = await this.calculatePrice(productId, options);
        priceMap.set(productId, priceBreakdown);
      } catch (error) {
        this.logger.error(`Failed to calculate price for product ${productId}: ${error.message}`);
      }
    }

    return priceMap;
  }

  /**
   * Analyze product margins
   */
  async analyzeMargins(productId: string): Promise<MarginAnalysis> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID '${productId}' not found`);
    }

    const baseCost = Number(product.baseCost);
    const retailPrice = Number(product.retailPrice);
    const wholesalePrice = Number(product.wholesalePrice);
    const specialPrice = Number(product.specialPrice);

    // Calculate margins
    const retailMarginAmount = retailPrice - baseCost;
    const retailMarginPercentage = retailPrice > 0 ? (retailMarginAmount / retailPrice) * 100 : 0;

    const wholesaleMarginAmount = wholesalePrice - baseCost;
    const wholesaleMarginPercentage = wholesalePrice > 0 ? (wholesaleMarginAmount / wholesalePrice) * 100 : 0;

    const specialMarginAmount = specialPrice - baseCost;
    const specialMarginPercentage = specialPrice > 0 ? (specialMarginAmount / specialPrice) * 100 : 0;

    // Calculate recommended prices (targeting 30% and 20% margins)
    const recommendedRetailPrice = baseCost / 0.7; // 30% margin
    const recommendedWholesalePrice = baseCost / 0.8; // 20% margin

    // Analyze competitor pricing (mock implementation)
    const competitorPricing = await this.analyzeCompetitorPricing(product);

    return {
      retailMarginAmount,
      retailMarginPercentage,
      wholesaleMarginAmount,
      wholesaleMarginPercentage,
      specialMarginAmount,
      specialMarginPercentage,
      recommendedRetailPrice,
      recommendedWholesalePrice,
      competitorPricing,
    };
  }

  /**
   * Update prices with margin validation
   */
  async updatePricesWithValidation(
    productId: string,
    priceUpdate: ProductPriceUpdateDto,
    userId?: string,
  ): Promise<void> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID '${productId}' not found`);
    }

    // Validate minimum margins
    const updates: Partial<Product> = {};
    const warnings: string[] = [];

    if (priceUpdate.retailPrice !== undefined) {
      const margin = this.calculateMarginPercentage(Number(product.baseCost), priceUpdate.retailPrice);
      if (margin < 10) {
        warnings.push(`Retail price margin (${margin.toFixed(1)}%) is below recommended 10%`);
      }
      updates.retailPrice = priceUpdate.retailPrice;
    }

    if (priceUpdate.wholesalePrice !== undefined) {
      const margin = this.calculateMarginPercentage(Number(product.baseCost), priceUpdate.wholesalePrice);
      if (margin < 5) {
        warnings.push(`Wholesale price margin (${margin.toFixed(1)}%) is below recommended 5%`);
      }
      updates.wholesalePrice = priceUpdate.wholesalePrice;
    }

    if (priceUpdate.specialPrice !== undefined) {
      const margin = this.calculateMarginPercentage(Number(product.baseCost), priceUpdate.specialPrice);
      if (margin < 0) {
        throw new BadRequestException('Special price results in negative margin');
      }
      updates.specialPrice = priceUpdate.specialPrice;
    }

    if (priceUpdate.baseCost !== undefined) {
      updates.baseCost = priceUpdate.baseCost;
    }

    // Update product
    await this.productRepository.update(productId, updates);

    // Log audit event with warnings
    await this.auditService.logProductEvent(
      productId,
      'PRODUCT_PRICES_UPDATED',
      `Product prices updated${warnings.length > 0 ? ' with warnings' : ''}`,
      userId,
      { updates, warnings },
    );

    if (warnings.length > 0) {
      this.logger.warn(`Price update warnings for product ${productId}: ${warnings.join('; ')}`);
    }
  }

  /**
   * Generate pricing recommendations for a category
   */
  async generateCategoryPricingRecommendations(categoryId: string): Promise<Array<{
    productId: string;
    productName: string;
    currentPricing: {
      retail: number;
      wholesale: number;
      special: number;
    };
    recommendedPricing: {
      retail: number;
      wholesale: number;
      special: number;
    };
    marginAnalysis: {
      currentRetailMargin: number;
      recommendedRetailMargin: number;
      competitivePosition: string;
    };
  }>> {
    const products = await this.productRepository.find({
      where: { categoryId, isActive: true },
    });

    const recommendations = [];

    for (const product of products) {
      const marginAnalysis = await this.analyzeMargins(product.id);
      
      recommendations.push({
        productId: product.id,
        productName: product.name,
        currentPricing: {
          retail: Number(product.retailPrice),
          wholesale: Number(product.wholesalePrice),
          special: Number(product.specialPrice),
        },
        recommendedPricing: {
          retail: marginAnalysis.recommendedRetailPrice,
          wholesale: marginAnalysis.recommendedWholesalePrice,
          special: Number(product.baseCost) * 1.1, // 10% margin for special
        },
        marginAnalysis: {
          currentRetailMargin: marginAnalysis.retailMarginPercentage,
          recommendedRetailMargin: 30,
          competitivePosition: marginAnalysis.competitorPricing?.pricePosition || 'unknown',
        },
      });
    }

    return recommendations.sort((a, b) => 
      a.marginAnalysis.currentRetailMargin - b.marginAnalysis.currentRetailMargin
    );
  }

  /**
   * Apply dynamic pricing based on demand and inventory levels
   */
  async applyDynamicPricing(productId: string): Promise<{
    originalPrices: { retail: number; wholesale: number };
    adjustedPrices: { retail: number; wholesale: number };
    adjustmentFactors: {
      demandFactor: number;
      inventoryFactor: number;
      seasonalFactor: number;
      finalAdjustment: number;
    };
  }> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
      relations: ['stockMovements', 'salesOrderItems'],
    });

    if (!product) {
      throw new NotFoundException(`Product with ID '${productId}' not found`);
    }

    const originalRetailPrice = Number(product.retailPrice);
    const originalWholesalePrice = Number(product.wholesalePrice);

    // Calculate demand factor (based on recent sales)
    const demandFactor = await this.calculateDemandFactor(productId);

    // Calculate inventory factor (based on stock levels)
    const inventoryFactor = this.calculateInventoryFactor(product);

    // Calculate seasonal factor (mock implementation)
    const seasonalFactor = this.calculateSeasonalFactor(product);

    // Combine factors (weighted average)
    const finalAdjustment = (demandFactor * 0.4) + (inventoryFactor * 0.4) + (seasonalFactor * 0.2);

    // Apply adjustment (cap at ±20%)
    const cappedAdjustment = Math.max(-0.2, Math.min(0.2, finalAdjustment));

    const adjustedRetailPrice = originalRetailPrice * (1 + cappedAdjustment);
    const adjustedWholesalePrice = originalWholesalePrice * (1 + cappedAdjustment);

    return {
      originalPrices: {
        retail: originalRetailPrice,
        wholesale: originalWholesalePrice,
      },
      adjustedPrices: {
        retail: Math.round(adjustedRetailPrice * 100) / 100,
        wholesale: Math.round(adjustedWholesalePrice * 100) / 100,
      },
      adjustmentFactors: {
        demandFactor,
        inventoryFactor,
        seasonalFactor,
        finalAdjustment: cappedAdjustment,
      },
    };
  }

  /**
   * Get customer price type based on customer properties
   */
  private getCustomerPriceType(customer: Customer): 'retail' | 'wholesale' | 'special' {
    // Mock implementation - in reality, this would be based on customer type or tier
    if (customer.customerType === 'wholesale') {
      return 'wholesale';
    }
    if (customer.customerType === 'vip' || customer.customerType === 'special') {
      return 'special';
    }
    return 'retail';
  }

  /**
   * Calculate quantity-based discount
   */
  private calculateQuantityDiscount(quantity: number, basePrice: number): number {
    // Simple quantity discount tiers
    let discountPercentage = 0;
    
    if (quantity >= 100) {
      discountPercentage = 0.15; // 15% for 100+
    } else if (quantity >= 50) {
      discountPercentage = 0.10; // 10% for 50+
    } else if (quantity >= 20) {
      discountPercentage = 0.05; // 5% for 20+
    }

    return basePrice * discountPercentage;
  }

  /**
   * Calculate category-based discount
   */
  private async calculateCategoryDiscount(
    categoryId: string,
    basePrice: number,
  ): Promise<{ amount: number; percentage: number }> {
    // Mock implementation - would check category-specific discounts
    // For now, return no discount
    return { amount: 0, percentage: 0 };
  }

  /**
   * Calculate customer-specific discount
   */
  private async calculateCustomerDiscount(
    customerId: string,
    basePrice: number,
  ): Promise<{ amount: number; percentage: number }> {
    const customer = await this.customerRepository.findOne({
      where: { id: customerId },
    });

    if (!customer) {
      return { amount: 0, percentage: 0 };
    }

    // Mock implementation based on customer tier
    let discountPercentage = 0;
    if (customer.customerType === 'vip') {
      discountPercentage = 0.1; // 10% VIP discount
    } else if (customer.customerType === 'preferred') {
      discountPercentage = 0.05; // 5% preferred customer discount
    }

    const discountAmount = basePrice * discountPercentage;
    return { amount: discountAmount, percentage: discountPercentage * 100 };
  }

  /**
   * Calculate promotion code discount
   */
  private async calculatePromotionDiscount(
    promotionCode: string,
    productId: string,
    basePrice: number,
  ): Promise<{ amount: number; percentage: number }> {
    // Mock implementation - would check active promotions
    // For now, return no discount
    return { amount: 0, percentage: 0 };
  }

  /**
   * Calculate margin percentage
   */
  private calculateMarginPercentage(cost: number, sellingPrice: number): number {
    if (sellingPrice <= 0) return -100;
    return ((sellingPrice - cost) / sellingPrice) * 100;
  }

  /**
   * Analyze competitor pricing (mock implementation)
   */
  private async analyzeCompetitorPricing(product: Product): Promise<{
    averageRetailPrice: number;
    averageWholesalePrice: number;
    pricePosition: 'below' | 'competitive' | 'above';
  }> {
    // Mock competitor analysis
    const mockAverageRetail = Number(product.retailPrice) * (0.9 + Math.random() * 0.2);
    const mockAverageWholesale = Number(product.wholesalePrice) * (0.9 + Math.random() * 0.2);
    
    let pricePosition: 'below' | 'competitive' | 'above' = 'competitive';
    const retailDifference = Number(product.retailPrice) - mockAverageRetail;
    
    if (retailDifference < -mockAverageRetail * 0.05) {
      pricePosition = 'below';
    } else if (retailDifference > mockAverageRetail * 0.05) {
      pricePosition = 'above';
    }

    return {
      averageRetailPrice: Math.round(mockAverageRetail * 100) / 100,
      averageWholesalePrice: Math.round(mockAverageWholesale * 100) / 100,
      pricePosition,
    };
  }

  /**
   * Calculate demand factor based on recent sales
   */
  private async calculateDemandFactor(productId: string): Promise<number> {
    // Mock implementation - would analyze sales trends
    // Returns value between -0.5 and 0.5
    return (Math.random() - 0.5);
  }

  /**
   * Calculate inventory factor based on stock levels
   */
  private calculateInventoryFactor(product: Product): number {
    const stockRatio = Number(product.stockQuantity) / Math.max(Number(product.optimalStockLevel), 1);
    
    if (stockRatio < 0.2) {
      return 0.3; // Low stock, increase price
    } else if (stockRatio < 0.5) {
      return 0.1; // Moderate stock, slight increase
    } else if (stockRatio > 2) {
      return -0.2; // Excess stock, decrease price
    } else if (stockRatio > 1.5) {
      return -0.1; // High stock, slight decrease
    }
    
    return 0; // Optimal stock level, no adjustment
  }

  /**
   * Calculate seasonal factor (mock implementation)
   */
  private calculateSeasonalFactor(product: Product): number {
    // Mock seasonal adjustment based on current month
    const month = new Date().getMonth();
    
    // Simple seasonal pattern (would be category-specific in reality)
    if (month >= 10 || month <= 1) { // Nov-Jan (holiday season)
      return 0.1; // 10% increase
    } else if (month >= 6 && month <= 8) { // Jul-Sep (summer)
      return -0.05; // 5% decrease
    }
    
    return 0; // No seasonal adjustment
  }
}