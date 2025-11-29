import { Injectable, Logger } from '@nestjs/common';
import { IBaseCostingStrategy } from './base-costing-strategy.interface';
import { PurchaseCostHistory } from '../../../../database/entities/purchase-cost-history.entity';

/**
 * LIFO (Last-In-First-Out) Costing Strategy
 * Base cost is calculated from the newest batches still in stock
 *
 * Under LIFO:
 * - Newest inventory is assumed to be sold first
 * - Base cost represents the weighted average of remaining (oldest) inventory
 * - When selling, reduce from newest batches first
 */
@Injectable()
export class LifoCostingStrategy implements IBaseCostingStrategy {
  private readonly logger = new Logger(LifoCostingStrategy.name);

  getMethodName(): string {
    return 'LIFO';
  }

  async calculateBaseCost(
    productId: string,
    batches: PurchaseCostHistory[],
    currentBaseCost: number,
  ): Promise<number> {
    // If no batches, return current base cost
    if (batches.length === 0) {
      this.logger.warn(
        `No cost history found for product ${productId}, using current base cost`,
      );
      return Number(currentBaseCost || 0);
    }

    // Calculate weighted average from REMAINING quantities (what's left in stock)
    let totalCost = 0;
    let totalQuantity = 0;

    for (const batch of batches) {
      const qtyRemaining = Number(batch.remainingQuantity);
      const costPerUnit = Number(batch.landedCost);

      totalCost += qtyRemaining * costPerUnit;
      totalQuantity += qtyRemaining;

      this.logger.debug(
        `Batch ${batch.id}: ${qtyRemaining} units remaining @ RM ${costPerUnit.toFixed(4)} = RM ${(qtyRemaining * costPerUnit).toFixed(2)}`,
      );
    }

    // Return weighted average of remaining inventory
    const weightedAvg =
      totalQuantity > 0 ? totalCost / totalQuantity : Number(currentBaseCost || 0);

    this.logger.log(
      `[LIFO] Product ${productId}: RM ${totalCost.toFixed(2)} / ${totalQuantity} units remaining = RM ${weightedAvg.toFixed(4)}`,
    );

    return weightedAvg;
  }

  determineBatchReduction(
    batches: PurchaseCostHistory[],
    quantityToReduce: number,
  ): Array<{ batchId: string; quantity: number }> {
    // LIFO: Reduce from newest batches first
    const reductions: Array<{ batchId: string; quantity: number }> = [];
    let remainingToReduce = quantityToReduce;

    // Sort by received date (newest first)
    const sortedBatches = [...batches].sort(
      (a, b) => new Date(b.receivedDate).getTime() - new Date(a.receivedDate).getTime(),
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
