import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Product, PriceList, PriceListItem } from '../../../database/entities';
import { Category } from '../../../database/entities/category.entity';
import { Customer } from '../../../database/entities/customer.entity';
import { BulkUpdatePricesDto, ProductPriceUpdateDto } from '../dto/product.dto';
import { SettingsService } from '../../settings/settings.service';

export interface PriceCalculationOptions {
  customerType?: string; // Dynamic price type from settings (e.g., 'Retail', 'Wholesale', 'VIP')
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
  priceType: string; // Dynamic price type from settings
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

interface PricingRule {
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
    @InjectRepository(PriceList)
    private readonly priceListRepository: Repository<PriceList>,
    @InjectRepository(PriceListItem)
    private readonly priceListItemRepository: Repository<PriceListItem>,
    private readonly settingsService: SettingsService,
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
      relations: { category: true },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID '${productId}' not found`);
    }

    // Determine base price type and price list
    let priceType = 'Retail'; // Default to Retail
    let basePrice = 0;
    let priceListId: string | null = null;

    // Determine price type and price list based on customer
    if (options.customerId) {
      const customer = await this.customerRepository.findOne({
        where: { id: options.customerId },
        relations: { priceList: true },
      });
      if (customer) {
        // Use price list system
        if (customer.priceList && customer.priceList.isActive) {
          priceListId = customer.priceList.id;
          priceType = customer.priceList.name;
          this.logger.log(`Using price list: ${priceType} for customer ${options.customerId}`);
        }
      }
    } else if (options.customerType) {
      priceType = options.customerType;
    }

    // Get price from price list items
    if (priceListId) {
      const priceListItem = await this.priceListItemRepository.findOne({
        where: { priceListId, productId },
      });

      if (priceListItem) {
        basePrice = Number(priceListItem.price);
        this.logger.log(`Found price ${basePrice} from price list item`);
      } else {
        this.logger.warn(`No price found in price list ${priceListId} for product ${productId}`);
        // Fallback to baseCost
        basePrice = Number(product.baseCost || 0);
        this.logger.log(`Using baseCost as fallback: ${basePrice}`);
      }
    } else {
      // No price list assigned, use baseCost
      basePrice = Number(product.baseCost || 0);
      this.logger.log(`No price list assigned, using baseCost: ${basePrice}`);
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
   * Analyze product margins across all price lists
   */
  async analyzeMargins(productId: string): Promise<MarginAnalysis> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
      relations: { priceListItems: { priceList: true } },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID '${productId}' not found`);
    }

    const baseCost = Number(product.baseCost);

    // Get prices from price list items
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
    const competitorPricing = await this.analyzeCompetitorPricing(productId, retailPrice, wholesalePrice);

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
   * @deprecated This method is deprecated. Use PriceListsService.bulkUpdatePrices() instead.
   * Kept for backward compatibility during migration.
   */
  async updatePricesWithValidation(
    productId: string,
    priceUpdate: ProductPriceUpdateDto,
    _userId?: string,
  ): Promise<void> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID '${productId}' not found`);
    }

    // This method is deprecated - prices should now be updated via PriceListsService
    // Update baseCost only if provided
    if (priceUpdate.baseCost !== undefined) {
      await this.productRepository.update(productId, { baseCost: priceUpdate.baseCost });
      this.logger.log(`Updated baseCost for product ${productId}`);
    }

    this.logger.warn(`updatePricesWithValidation is deprecated. Please use PriceListsService.bulkUpdatePrices() instead.`);
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
      relations: { priceListItems: { priceList: true } },
    });

    const recommendations = [];

    for (const product of products) {
      const marginAnalysis = await this.analyzeMargins(product.id);

      // Get current prices from price list items
      let currentRetail = 0;
      let currentWholesale = 0;
      let currentSpecial = 0;

      for (const item of product.priceListItems || []) {
        const priceListName = item.priceList?.name.toLowerCase();
        const price = Number(item.price);

        if (priceListName?.includes('retail')) {
          currentRetail = price;
        } else if (priceListName?.includes('wholesale')) {
          currentWholesale = price;
        } else if (priceListName?.includes('special')) {
          currentSpecial = price;
        }
      }

      recommendations.push({
        productId: product.id,
        productName: product.name,
        currentPricing: {
          retail: currentRetail,
          wholesale: currentWholesale,
          special: currentSpecial,
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
      relations: { priceList: true },
    });

    if (!customer || !customer.priceList) {
      return { amount: 0, percentage: 0 };
    }

    // Implementation based on customer price list
    let discountPercentage = 0;
    const priceListName = customer.priceList.name?.toLowerCase() || '';
    if (priceListName.includes('special')) {
      discountPercentage = 0.1; // 10% special price discount
    } else if (priceListName.includes('wholesale')) {
      discountPercentage = 0.05; // 5% wholesale discount
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
  private async analyzeCompetitorPricing(
    productId: string,
    retailPrice: number,
    wholesalePrice: number,
  ): Promise<{
    averageRetailPrice: number;
    averageWholesalePrice: number;
    pricePosition: 'below' | 'competitive' | 'above';
  }> {
    // Mock competitor analysis
    const mockAverageRetail = retailPrice * (0.9 + Math.random() * 0.2);
    const mockAverageWholesale = wholesalePrice * (0.9 + Math.random() * 0.2);

    let pricePosition: 'below' | 'competitive' | 'above' = 'competitive';
    const retailDifference = retailPrice - mockAverageRetail;

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
    const stockRatio = Number(product.stockQuantity) / Math.max(100, 1); // Use default optimal level of 100
    
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
