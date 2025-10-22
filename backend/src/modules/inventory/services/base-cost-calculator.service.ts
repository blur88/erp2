import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Product } from '../../../database/entities/product.entity';
import { PurchaseCostHistory } from '../../../database/entities/purchase-cost-history.entity';

@Injectable()
export class BaseCostCalculatorService {
  private readonly logger = new Logger(BaseCostCalculatorService.name);

  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(PurchaseCostHistory)
    private costHistoryRepository: Repository<PurchaseCostHistory>,
  ) {}

  /**
   * Calculate base cost from CURRENT STOCK ONLY
   * Formula: SUM(remainingQty × landedCost) / SUM(remainingQty)
   *
   * Example: 30 units @ RM 10 + 50 units @ RM 12 = (300 + 600) / 80 = RM 11.25
   */
  async calculateBaseCostFromCurrentStock(productId: string): Promise<number> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
    });

    if (!product) {
      throw new Error(`Product ${productId} not found`);
    }

    // Get all batches with remaining stock
    const batches = await this.costHistoryRepository.find({
      where: {
        productId,
        remainingQuantity: MoreThan(0), // Only batches with stock
      },
      order: { receivedDate: 'ASC' },
    });

    // If no batches, return current base cost
    if (batches.length === 0) {
      this.logger.warn(`No cost history found for product ${productId}, using current base cost`);
      return Number(product.baseCost || 0);
    }

    // Calculate weighted average from remaining stock
    let totalCost = 0;
    let totalQuantity = 0;

    for (const batch of batches) {
      const qtyRemaining = Number(batch.remainingQuantity);
      const costPerUnit = Number(batch.landedCost);

      totalCost += qtyRemaining * costPerUnit;
      totalQuantity += qtyRemaining;

      this.logger.debug(
        `Batch ${batch.id}: ${qtyRemaining} units @ RM ${costPerUnit.toFixed(4)} = RM ${(qtyRemaining * costPerUnit).toFixed(2)}`
      );
    }

    // Return weighted average
    const weightedAvg = totalQuantity > 0
      ? totalCost / totalQuantity
      : Number(product.baseCost || 0);

    this.logger.log(
      `Product ${product.name}: Weighted Average = RM ${totalCost.toFixed(2)} / ${totalQuantity} units = RM ${weightedAvg.toFixed(4)}`
    );

    return weightedAvg;
  }

  /**
   * Update product base cost
   */
  async updateProductBaseCost(productId: string): Promise<number> {
    const newBaseCost = await this.calculateBaseCostFromCurrentStock(productId);

    await this.productRepository.update(productId, {
      baseCost: newBaseCost,
      updatedAt: new Date(),
    });

    this.logger.log(`Updated product ${productId} base cost to RM ${newBaseCost.toFixed(4)}`);

    return newBaseCost;
  }

  /**
   * Reduce stock when selling (FIFO - oldest first)
   * Updates remainingQuantity in cost history and recalculates base cost
   */
  async reduceStock(productId: string, quantitySold: number): Promise<void> {
    this.logger.log(`Reducing stock for product ${productId}: ${quantitySold} units`);

    const batches = await this.costHistoryRepository.find({
      where: {
        productId,
        remainingQuantity: MoreThan(0),
      },
      order: { receivedDate: 'ASC' }, // FIFO order - oldest first
    });

    if (batches.length === 0) {
      this.logger.warn(`No cost history batches found for product ${productId}, cannot reduce stock`);
      return;
    }

    let remainingToReduce = quantitySold;

    // Reduce from oldest batches first (FIFO)
    for (const batch of batches) {
      if (remainingToReduce <= 0) break;

      const batchRemaining = Number(batch.remainingQuantity);
      const toReduce = Math.min(batchRemaining, remainingToReduce);

      await this.costHistoryRepository.update(batch.id, {
        remainingQuantity: batchRemaining - toReduce,
        updatedAt: new Date(),
      });

      this.logger.debug(
        `Reduced batch ${batch.id}: ${batchRemaining} - ${toReduce} = ${batchRemaining - toReduce} remaining`
      );

      remainingToReduce -= toReduce;
    }

    if (remainingToReduce > 0) {
      this.logger.warn(
        `Not enough stock to reduce for product ${productId}. Attempted to reduce ${quantitySold}, but only ${quantitySold - remainingToReduce} available`
      );
    }

    // Recalculate base cost after reduction
    await this.updateProductBaseCost(productId);
  }

  /**
   * Add stock when receiving GRN
   * Creates new batch in cost history and recalculates base cost
   */
  async addStock(
    productId: string,
    grnId: string,
    quantity: number,
    unitCost: number,
    shippingPerUnit: number,
    receivedDate: Date,
  ): Promise<void> {
    const landedCost = Number(unitCost) + Number(shippingPerUnit);

    this.logger.log(
      `Adding stock for product ${productId}: ${quantity} units @ RM ${unitCost.toFixed(4)} + RM ${shippingPerUnit.toFixed(4)} shipping = RM ${landedCost.toFixed(4)} landed cost`
    );

    // Create new batch in history
    const newBatch = this.costHistoryRepository.create({
      productId,
      grnId,
      unitCost,
      shippingPerUnit,
      landedCost,
      receivedQuantity: quantity,
      remainingQuantity: quantity, // All stock is remaining
      receivedDate,
    });

    await this.costHistoryRepository.save(newBatch);

    this.logger.log(`Created cost history batch ${newBatch.id}`);

    // Recalculate base cost
    await this.updateProductBaseCost(productId);
  }

  /**
   * Calculate shipping allocation BY VALUE
   * Formula: (itemTotal / poSubtotal) × totalShipping / itemQuantity
   *
   * Example:
   * - Item: 100 units @ RM 10 = RM 1,000
   * - PO Subtotal: RM 2,000
   * - PO Shipping: RM 200
   * - Allocation: (1,000 / 2,000) × 200 = RM 100
   * - Per Unit: 100 / 100 = RM 1.00/unit
   */
  calculateShippingByValue(
    itemUnitCost: number,
    itemQuantity: number,
    poSubtotal: number,
    poShipping: number,
  ): number {
    if (!poShipping || poShipping === 0 || !poSubtotal || poSubtotal === 0) {
      return 0;
    }

    const itemTotal = Number(itemUnitCost) * Number(itemQuantity);
    const itemShare = itemTotal / Number(poSubtotal);
    const itemShippingTotal = itemShare * Number(poShipping);
    const shippingPerUnit = itemShippingTotal / Number(itemQuantity);

    this.logger.debug(
      `Shipping BY VALUE: Item RM ${itemTotal.toFixed(2)} / PO RM ${poSubtotal} = ${(itemShare * 100).toFixed(2)}% × RM ${poShipping} = RM ${itemShippingTotal.toFixed(2)} (RM ${shippingPerUnit.toFixed(4)}/unit)`
    );

    return shippingPerUnit;
  }

  /**
   * Get cost history for a product
   */
  async getCostHistory(productId: string): Promise<PurchaseCostHistory[]> {
    return await this.costHistoryRepository.find({
      where: { productId },
      order: { receivedDate: 'DESC' },
    });
  }

  /**
   * Get current stock batches (with remaining quantity > 0)
   */
  async getCurrentStockBatches(productId: string): Promise<PurchaseCostHistory[]> {
    return await this.costHistoryRepository.find({
      where: {
        productId,
        remainingQuantity: MoreThan(0),
      },
      order: { receivedDate: 'ASC' },
    });
  }
}
