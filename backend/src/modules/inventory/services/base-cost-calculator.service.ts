import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, EntityManager } from 'typeorm';
import { Product } from '../../../database/entities/product.entity';
import { PurchaseCostHistory } from '../../../database/entities/purchase-cost-history.entity';
import { CostingStrategyFactory } from './costing/costing-strategy-factory.service';

@Injectable()
export class BaseCostCalculatorService {
  private readonly logger = new Logger(BaseCostCalculatorService.name);

  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(PurchaseCostHistory)
    private costHistoryRepository: Repository<PurchaseCostHistory>,
    private costingStrategyFactory: CostingStrategyFactory,
  ) {}

  /**
   * Calculate base cost using configured costing strategy
   * Strategy is determined by settings (AVERAGE, FIFO, LIFO, STANDARD)
   */
  async calculateBaseCostFromCurrentStock(productId: string, manager?: EntityManager): Promise<number> {
    const productRepo = manager ? manager.getRepository(Product) : this.productRepository;
    const costHistoryRepo = manager ? manager.getRepository(PurchaseCostHistory) : this.costHistoryRepository;

    const product = await productRepo.findOne({
      where: { id: productId },
    });

    if (!product) {
      throw new Error(`Product ${productId} not found`);
    }

    // Get all batches with remaining stock
    const batches = await costHistoryRepo.find({
      where: {
        productId,
        remainingQuantity: MoreThan(0), // Only batches with stock
      },
      order: { receivedDate: 'ASC' },
    });

    // Get active costing strategy from settings
    const strategy = await this.costingStrategyFactory.getActiveStrategy();
    const costingMethod = await this.costingStrategyFactory.getCurrentCostingMethod();

    this.logger.debug(`Calculating base cost for product ${productId} using ${costingMethod} method`);

    // Use strategy to calculate base cost
    const baseCost = await strategy.calculateBaseCost(
      productId,
      batches,
      Number(product.baseCost || 0),
    );

    return baseCost;
  }

  /**
   * Update product base cost
   */
  async updateProductBaseCost(productId: string, manager?: EntityManager): Promise<number> {
    const productRepo = manager ? manager.getRepository(Product) : this.productRepository;
    const newBaseCost = await this.calculateBaseCostFromCurrentStock(productId, manager);

    await productRepo.update(productId, {
      baseCost: newBaseCost,
      updatedAt: new Date(),
    });

    this.logger.log(`Updated product ${productId} base cost to RM ${newBaseCost.toFixed(4)}`);

    return newBaseCost;
  }

  /**
   * Reduce stock when selling
   * Uses costing strategy to determine which batches to reduce from
   * Updates remainingQuantity in cost history and recalculates base cost
   */
  async reduceStock(productId: string, quantitySold: number, manager?: EntityManager): Promise<void> {
    const costHistoryRepo = manager ? manager.getRepository(PurchaseCostHistory) : this.costHistoryRepository;

    this.logger.log(`Reducing stock for product ${productId}: ${quantitySold} units`);

    const batches = await costHistoryRepo.find({
      where: {
        productId,
        remainingQuantity: MoreThan(0),
      },
      order: { receivedDate: 'ASC' },
    });

    if (batches.length === 0) {
      this.logger.warn(`No cost history batches found for product ${productId}, cannot reduce stock`);
      return;
    }

    // Get active costing strategy to determine batch reduction order
    const strategy = await this.costingStrategyFactory.getActiveStrategy();
    const reductions = strategy.determineBatchReduction(batches, quantitySold);

    // Apply reductions
    for (const reduction of reductions) {
      const batch = batches.find(b => b.id === reduction.batchId);
      if (!batch) continue;

      const batchRemaining = Number(batch.remainingQuantity);
      const newRemaining = batchRemaining - reduction.quantity;

      await costHistoryRepo.update(batch.id, {
        remainingQuantity: newRemaining,
        updatedAt: new Date(),
      });

      this.logger.debug(
        `Reduced batch ${batch.id}: ${batchRemaining} - ${reduction.quantity} = ${newRemaining} remaining`
      );
    }

    const totalReduced = reductions.reduce((sum, r) => sum + r.quantity, 0);
    if (totalReduced < quantitySold) {
      this.logger.warn(
        `Not enough stock to reduce for product ${productId}. Attempted to reduce ${quantitySold}, but only ${totalReduced} available`
      );
    }

    // Recalculate base cost after reduction
    await this.updateProductBaseCost(productId, manager);
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
   * Remove stock when returning goods to supplier
   * Validates that no stock has been sold from this batch, then deletes it
   */
  async removeStock(productId: string, grnId: string): Promise<void> {
    this.logger.log(`Removing stock for product ${productId} from GRN ${grnId}`);

    // Find the batch(es) created for this GRN
    const batches = await this.costHistoryRepository.find({
      where: {
        productId,
        grnId,
      },
    });

    if (batches.length === 0) {
      this.logger.warn(`No cost history batches found for product ${productId} and GRN ${grnId}`);
      return;
    }

    // Check if any stock has been sold from these batches
    for (const batch of batches) {
      const receivedQty = Number(batch.receivedQuantity);
      const remainingQty = Number(batch.remainingQuantity);

      if (remainingQty < receivedQty) {
        const soldQty = receivedQty - remainingQty;
        throw new Error(
          `Cannot return goods: ${soldQty} units from this batch have already been sold. ` +
          `Please ensure all goods are in stock before returning to supplier.`
        );
      }
    }

    // Delete all batches for this GRN (only if validation passed)
    for (const batch of batches) {
      this.logger.debug(
        `Deleting batch ${batch.id}: ${batch.receivedQuantity} units (${batch.remainingQuantity} remaining) @ RM ${Number(batch.landedCost).toFixed(4)}`
      );
      await this.costHistoryRepository.delete(batch.id);
    }

    this.logger.log(`Deleted ${batches.length} cost history batch(es) for GRN ${grnId}`);

    // Recalculate base cost after removal
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

  /**
   * Restore stock when unfulfilling a sales order
   * Adds quantities back to the cost history batches in FIFO order
   * This reverses the reduceStock operation during fulfillment
   */
  async restoreStock(productId: string, quantityToRestore: number, manager?: EntityManager): Promise<void> {
    const costHistoryRepo = manager ? manager.getRepository(PurchaseCostHistory) : this.costHistoryRepository;

    this.logger.log(`Restoring stock for product ${productId}: ${quantityToRestore} units`);

    // Get all batches for this product, including sold-out ones
    const batches = await costHistoryRepo.find({
      where: {
        productId,
      },
      order: { receivedDate: 'ASC' }, // FIFO order - oldest first
    });

    if (batches.length === 0) {
      this.logger.warn(`No cost history batches found for product ${productId}, cannot restore stock`);
      return;
    }

    let remainingToRestore = quantityToRestore;

    // Restore to oldest batches first (reverse of FIFO reduction)
    for (const batch of batches) {
      if (remainingToRestore <= 0) break;

      const receivedQty = Number(batch.receivedQuantity);
      const currentRemaining = Number(batch.remainingQuantity);
      const maxCanRestore = receivedQty - currentRemaining; // Can only restore up to what was originally received

      if (maxCanRestore <= 0) continue; // This batch is already full

      const toRestore = Math.min(maxCanRestore, remainingToRestore);

      await costHistoryRepo.update(batch.id, {
        remainingQuantity: currentRemaining + toRestore,
        updatedAt: new Date(),
      });

      this.logger.debug(
        `Restored batch ${batch.id}: ${currentRemaining} + ${toRestore} = ${currentRemaining + toRestore} remaining (max: ${receivedQty})`
      );

      remainingToRestore -= toRestore;
    }

    if (remainingToRestore > 0) {
      this.logger.warn(
        `Could not fully restore stock for product ${productId}. Attempted to restore ${quantityToRestore}, but only ${quantityToRestore - remainingToRestore} could be restored to existing batches.`
      );
    }

    // Recalculate base cost after restoration
    await this.updateProductBaseCost(productId, manager);
  }
}
