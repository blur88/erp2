import { Injectable, Logger } from '@nestjs/common';
import { IBaseCostingStrategy } from './base-costing-strategy.interface';
import { PurchaseCostHistory } from '../../../../database/entities/purchase-cost-history.entity';

/**
 * Standard Costing Strategy
 * Uses a predetermined standard cost that doesn't change with purchases
 *
 * Under Standard Costing:
 * - Base cost is set manually and remains constant
 * - Actual purchase costs are compared against standard cost (variance analysis)
 * - Base cost only changes when management updates the standard
 * - Stock reduction still tracked for inventory management
 */
@Injectable()
export class StandardCostingStrategy implements IBaseCostingStrategy {
  private readonly logger = new Logger(StandardCostingStrategy.name);

  getMethodName(): string {
    return 'STANDARD';
  }

  async calculateBaseCost(
    productId: string,
    batches: PurchaseCostHistory[],
    currentBaseCost: number,
  ): Promise<number> {
    // Standard costing keeps the existing base cost unchanged
    // Management must manually update standard costs
    this.logger.log(
      `[STANDARD] Product ${productId}: Using standard cost RM ${Number(currentBaseCost || 0).toFixed(4)}`,
    );

    // If there's a current base cost, use it (the standard)
    // Otherwise, calculate from first batch as initial standard
    if (currentBaseCost && currentBaseCost > 0) {
      return Number(currentBaseCost);
    }

    // Initialize standard cost from first batch if none exists
    if (batches.length > 0) {
      const firstBatch = batches[0];
      const initialStandard = Number(firstBatch.landedCost);
      this.logger.log(
        `[STANDARD] Initializing standard cost for product ${productId}: RM ${initialStandard.toFixed(4)}`,
      );
      return initialStandard;
    }

    // No batches and no current cost - default to 0
    return 0;
  }

  determineBatchReduction(
    batches: PurchaseCostHistory[],
    quantityToReduce: number,
  ): Array<{ batchId: string; quantity: number }> {
    // Standard costing uses FIFO for stock reduction (industry standard)
    const reductions: Array<{ batchId: string; quantity: number }> = [];
    let remainingToReduce = quantityToReduce;

    // Sort by received date (oldest first)
    const sortedBatches = [...batches].sort(
      (a, b) => new Date(a.receivedDate).getTime() - new Date(b.receivedDate).getTime(),
    );

    for (const batch of sortedBatches) {
      if (remainingToReduce <= 0) break;

      const batchRemaining = Number(batch.remainingQuantity);
      const toReduce = Math.min(batchRemaining, remainingToReduce);

      if (toReduce > 0) {
        reductions.push({
          batchId: batch.id,
          quantity: toReduce,
        });
        remainingToReduce -= toReduce;
      }
    }

    return reductions;
  }
}
