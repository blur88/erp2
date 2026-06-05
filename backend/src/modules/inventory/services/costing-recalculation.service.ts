import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { Product } from "../../../database/entities/product.entity";
import { BaseCostCalculatorService } from "./base-cost-calculator.service";
import { CostingStrategyFactory } from "./costing/costing-strategy-factory.service";

/**
 * Service to recalculate all product costs when costing method changes
 */
@Injectable()
export class CostingRecalculationService {
  private readonly logger = new Logger(CostingRecalculationService.name);

  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    private baseCostCalculator: BaseCostCalculatorService,
    private costingStrategyFactory: CostingStrategyFactory,
  ) {}

  /**
   * Recalculate base costs for all products using current costing method
   * This should be called when costing method is changed in settings
   */
  async recalculateAllProductCosts(): Promise<{
    totalProducts: number;
    updated: number;
    errors: number;
    costingMethod: string;
    results: Array<{
      productId: string;
      productName: string;
      oldCost: number;
      newCost: number;
      success: boolean;
      error?: string;
    }>;
  }> {
    const startTime = Date.now();
    const costingMethod =
      await this.costingStrategyFactory.getCurrentCostingMethod();

    this.logger.log(
      `Starting cost recalculation for all products using ${costingMethod} method`,
    );

    // Get all active products
    const products = await this.productRepository.find({
      where: { isActive: true, deletedAt: IsNull() },
    });

    const results: Array<{
      productId: string;
      productName: string;
      oldCost: number;
      newCost: number;
      success: boolean;
      error?: string;
    }> = [];

    let updated = 0;
    let errors = 0;

    for (const product of products) {
      try {
        const oldCost = Number(product.baseCost || 0);
        const newCost = await this.baseCostCalculator.updateProductBaseCost(
          product.id,
        );

        results.push({
          productId: product.id,
          productName: product.name,
          oldCost,
          newCost,
          success: true,
        });

        updated++;

        this.logger.debug(
          `Updated ${product.name}: RM ${oldCost.toFixed(4)} → RM ${newCost.toFixed(4)}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to update cost for ${product.name}: ${error.message}`,
          error.stack,
        );

        results.push({
          productId: product.id,
          productName: product.name,
          oldCost: Number(product.baseCost || 0),
          newCost: Number(product.baseCost || 0),
          success: false,
          error: error.message,
        });

        errors++;
      }
    }

    const duration = Date.now() - startTime;

    this.logger.log(
      `Cost recalculation completed in ${duration}ms: ${updated} updated, ${errors} errors using ${costingMethod} method`,
    );

    return {
      totalProducts: products.length,
      updated,
      errors,
      costingMethod,
      results,
    };
  }

  /**
   * Recalculate base cost for a specific product
   */
  async recalculateProductCost(productId: string): Promise<{
    productId: string;
    productName: string;
    oldCost: number;
    newCost: number;
    costingMethod: string;
  }> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
    });

    if (!product) {
      throw new Error(`Product ${productId} not found`);
    }

    const costingMethod =
      await this.costingStrategyFactory.getCurrentCostingMethod();
    const oldCost = Number(product.baseCost || 0);
    const newCost =
      await this.baseCostCalculator.updateProductBaseCost(productId);

    this.logger.log(
      `Recalculated cost for ${product.name} using ${costingMethod}: RM ${oldCost.toFixed(4)} → RM ${newCost.toFixed(4)}`,
    );

    return {
      productId: product.id,
      productName: product.name,
      oldCost,
      newCost,
      costingMethod,
    };
  }
}
