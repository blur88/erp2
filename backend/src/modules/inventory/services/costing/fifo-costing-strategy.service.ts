import { Injectable, Logger } from '@nestjs/common';
import { IBaseCostingStrategy } from './base-costing-strategy.interface';
import { PurchaseCostHistory } from '../../../../database/entities/purchase-cost-history.entity';

/**
 * FIFO (First-In-First-Out) Costing Strategy
 * Base cost is calculated from the oldest batches still in stock
 *
 * Under FIFO:
 * - Oldest inventory is assumed to be sold first
 * - Base cost represents the weighted average of remaining (newest) inventory
 * - When selling, reduce from oldest batches first
 */
@Injectable()
export class FifoCostingStrategy implements IBaseCostingStrategy {
  private readonly logger = new Logger(FifoCostingStrategy.name);

  getMethodName(): string {
    return 'FIFO';
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
      `[FIFO] Product ${productId}: RM ${totalCost.toFixed(2)} / ${totalQuantity} units remaining = RM ${weightedAvg.toFixed(4)}`,
    );

    return weightedAvg;
  }

  determineBatchReduction(
    batches: PurchaseCostHistory[],
    quantityToReduce: number,
  ): Array<{ batchId: string; quantity: number }> {
    // FIFO: Reduce from oldest batches first
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
