import { Injectable, Logger } from '@nestjs/common';
import { IBaseCostingStrategy } from './base-costing-strategy.interface';
import { PurchaseCostHistory } from '../../../../database/entities/purchase-cost-history.entity';

/**
 * Moving Average Costing Strategy
 * Formula: SUM(receivedQty × landedCost) / SUM(receivedQty)
 *
 * This method calculates base cost from original purchase quantities,
 * not current stock levels. Base cost only changes when receiving or
 * returning goods, NOT when selling goods.
 */
@Injectable()
export class AverageCostingStrategy implements IBaseCostingStrategy {
  private readonly logger = new Logger(AverageCostingStrategy.name);

  getMethodName(): string {
    return 'AVERAGE';
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

    // Calculate weighted average from RECEIVED quantities (not remaining)
    let totalCost = 0;
    let totalQuantity = 0;

    for (const batch of batches) {
      const qtyReceived = Number(batch.receivedQuantity);
      const costPerUnit = Number(batch.landedCost);

      totalCost += qtyReceived * costPerUnit;
      totalQuantity += qtyReceived;

      this.logger.debug(
        `Batch ${batch.id}: ${qtyReceived} units received @ RM ${costPerUnit.toFixed(4)} = RM ${(qtyReceived * costPerUnit).toFixed(2)}`,
      );
    }

    // Return weighted average
    const weightedAvg =
      totalQuantity > 0 ? totalCost / totalQuantity : Number(currentBaseCost || 0);

    this.logger.log(
      `[AVERAGE] Product ${productId}: RM ${totalCost.toFixed(2)} / ${totalQuantity} units = RM ${weightedAvg.toFixed(4)}`,
    );

    return weightedAvg;
  }

  determineBatchReduction(
    batches: PurchaseCostHistory[],
    quantityToReduce: number,
  ): Array<{ batchId: string; quantity: number }> {
    // Moving Average uses FIFO for stock reduction
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
