import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, EntityManager } from 'typeorm';
import { Product } from '../../../database/entities/product.entity';
import { PurchaseCostHistory } from '../../../database/entities/purchase-cost-history.entity';
import { StockBatchConsumption } from '../../../database/entities/stock-batch-consumption.entity';
import { StockMovement } from '../../../database/entities/stock-movement.entity';
import { UNFULFILL_EVIDENCE_INCOMPLETE } from '../stock-undo-unavailable';
import { CostingStrategyFactory } from './costing/costing-strategy-factory.service';
import { repoFor } from '../../../common/db/tx-helpers';
import { toMinorUnits, formatScale4, allocate } from '@/common/utils/money';

/** One batch's share of a single line's consumption, in scale-4 minor units. */
export interface ConsumptionLine {
  batchId: string;
  quantityMinor: bigint;
  unitCostMinor: bigint;
  valueScale8: bigint;
}

/** A whole line's consumption plan, before any movement or batch is written. */
export interface ProductConsumptionPlan {
  productId: string;
  requestedQuantityMinor: bigint;
  coveredQuantityMinor: bigint;
  uncoveredQuantityMinor: bigint;
  consumptions: ConsumptionLine[];
  totalScale8: bigint;
}

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
   * Strategy is determined by settings (AVERAGE or FIFO)
   */
  async calculateBaseCostFromCurrentStock(productId: string, manager?: EntityManager): Promise<number> {
    const productRepo = repoFor(manager, Product, this.productRepository);
    const costHistoryRepo = repoFor(manager, PurchaseCostHistory, this.costHistoryRepository);

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
    const productRepo = repoFor(manager, Product, this.productRepository);
    const newBaseCost = await this.calculateBaseCostFromCurrentStock(productId, manager);

    await productRepo.update(productId, {
      baseCost: newBaseCost,
      updatedAt: new Date(),
    });

    this.logger.log(`Updated product ${productId} base cost to RM ${newBaseCost.toFixed(4)}`);

    return newBaseCost;
  }

  /**
   * Build a consumption plan for a set of lines WITHOUT mutating anything (#1406).
   *
   * All batches for every distinct product are locked FOR UPDATE first (batches in
   * ascending id order, products already locked by the caller in ascending id
   * order), then the lines are allocated in order against a SINGLE shared
   * in-memory map of batch balances. Sharing the map is what makes repeated
   * products safe: the second line for a product sees the first line's
   * consumption and cannot re-allocate the same batch quantity.
   *
   * The plan carries the unrounded scale-8 value so the caller can reconcile the
   * whole order's COGS before creating the occurrence and inserting any movement.
   *
   * Requires a transaction manager (FOR UPDATE requires an active txn).
   */
  async planConsumption(
    manager: EntityManager | undefined,
    lines: ReadonlyArray<{ productId: string; quantity: number }>,
  ): Promise<ProductConsumptionPlan[]> {
    if (!manager) {
      throw new Error('planConsumption requires a transaction manager for FOR UPDATE locking');
    }
    const costHistoryRepo = repoFor(manager, PurchaseCostHistory, this.costHistoryRepository);

    // Lock every distinct product's batches once, in ascending product id order.
    const productIds = [...new Set(lines.map((l) => l.productId))].sort();
    const batchesByProduct = new Map<string, PurchaseCostHistory[]>();
    const remainingMinor = new Map<string, bigint>();
    for (const productId of productIds) {
      const batches = await costHistoryRepo.find({
        where: { productId, remainingQuantity: MoreThan(0) },
        order: { id: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });
      batchesByProduct.set(productId, batches);
      for (const b of batches) {
        remainingMinor.set(b.id, toMinorUnits(String(b.remainingQuantity)));
      }
    }

    const strategy = await this.costingStrategyFactory.getActiveStrategy();
    const plans: ProductConsumptionPlan[] = [];

    for (const line of lines) {
      const batches = batchesByProduct.get(line.productId) ?? [];
      const requestedMinor = toMinorUnits(line.quantity.toFixed(4));

      // Strategy sees the CURRENT shared in-memory balances, not the DB snapshot.
      const view = batches.map(
        (b) =>
          ({
            ...b,
            remainingQuantity: Number(formatScale4(remainingMinor.get(b.id) ?? 0n)),
          }) as PurchaseCostHistory,
      );
      const reductions = strategy.determineBatchReduction(view, line.quantity);

      const consumptions: ConsumptionLine[] = [];
      let totalScale8 = 0n;
      let carryMinor = 0n;
      for (const reduction of reductions) {
        if (carryMinor === 0n && reduction.quantity <= 0) continue;
        const batch = batches.find((b) => b.id === reduction.batchId);
        if (!batch) continue;
        const availableMinor = remainingMinor.get(batch.id) ?? 0n;
        const requestedBatchMinor = toMinorUnits(reduction.quantity.toFixed(4)) + carryMinor;
        const consumedMinor =
          requestedBatchMinor > availableMinor ? availableMinor : requestedBatchMinor;
        carryMinor = requestedBatchMinor - consumedMinor;
        if (consumedMinor <= 0n) continue;
        remainingMinor.set(batch.id, availableMinor - consumedMinor);

        const landedCostMinor = toMinorUnits(String(batch.landedCost));
        const valueScale8 = consumedMinor * landedCostMinor;
        totalScale8 += valueScale8;
        consumptions.push({
          batchId: batch.id,
          quantityMinor: consumedMinor,
          unitCostMinor: landedCostMinor,
          valueScale8,
        });
      }

      const coveredMinor = consumptions.reduce((sum, c) => sum + c.quantityMinor, 0n);
      if (coveredMinor > requestedMinor) {
        throw new ConflictException(
          `Fulfilment consumption plan over-allocates product ${line.productId} ` +
            `(requested ${formatScale4(requestedMinor)}, covered ${formatScale4(coveredMinor)})`,
        );
      }

      plans.push({
        productId: line.productId,
        requestedQuantityMinor: requestedMinor,
        coveredQuantityMinor: coveredMinor,
        uncoveredQuantityMinor: requestedMinor - coveredMinor,
        consumptions,
        totalScale8,
      });
    }

    return plans;
  }

  /** Strategy-independent oldest-first planning for active valuation flows. */
  async planPhysicalConsumption(
    manager: EntityManager | undefined,
    lines: ReadonlyArray<{ productId: string; quantity: number }>,
  ): Promise<ProductConsumptionPlan[]> {
    if (!manager) {
      throw new Error(
        'planPhysicalConsumption requires a transaction manager for FOR UPDATE locking',
      );
    }
    const costHistoryRepo = repoFor(
      manager,
      PurchaseCostHistory,
      this.costHistoryRepository,
    );
    const productIds = [...new Set(lines.map((line) => line.productId))].sort();
    const batchesByProduct = new Map<string, PurchaseCostHistory[]>();
    const remainingMinor = new Map<string, bigint>();
    for (const productId of productIds) {
      const batches = await costHistoryRepo.find({
        where: { productId, remainingQuantity: MoreThan(0) },
        order: { receivedDate: 'ASC', id: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });
      batches.sort((left, right) => {
        const dateOrder =
          new Date(left.receivedDate).getTime() -
          new Date(right.receivedDate).getTime();
        return dateOrder || left.id.localeCompare(right.id);
      });
      batchesByProduct.set(productId, batches);
      for (const batch of batches)
        remainingMinor.set(
          batch.id,
          toMinorUnits(String(batch.remainingQuantity)),
        );
    }

    return lines.map((line) => {
      const requestedQuantityMinor = toMinorUnits(line.quantity.toFixed(4));
      const consumptions: ConsumptionLine[] = [];
      let remaining = requestedQuantityMinor;
      let totalScale8 = 0n;
      for (const batch of batchesByProduct.get(line.productId) ?? []) {
        if (remaining === 0n) break;
        const available = remainingMinor.get(batch.id) ?? 0n;
        if (available <= 0n) continue;
        const quantityMinor = available < remaining ? available : remaining;
        const unitCostMinor = toMinorUnits(String(batch.landedCost));
        const valueScale8 = quantityMinor * unitCostMinor;
        consumptions.push({
          batchId: batch.id,
          quantityMinor,
          unitCostMinor,
          valueScale8,
        });
        remainingMinor.set(batch.id, available - quantityMinor);
        remaining -= quantityMinor;
        totalScale8 += valueScale8;
      }
      if (remaining > 0n) {
        throw new ConflictException(
          `Stock batches do not cover ${formatScale4(remaining)} of ${line.productId}`,
        );
      }
      return {
        productId: line.productId,
        requestedQuantityMinor,
        coveredQuantityMinor: requestedQuantityMinor,
        uncoveredQuantityMinor: 0n,
        consumptions,
        totalScale8,
      };
    });
  }

  /** Apply physical quantities and save their immutable movement provenance. */
  async recordConsumptions(
    manager: EntityManager | undefined,
    movementId: string,
    consumptions: ConsumptionLine[],
  ): Promise<void> {
    if (!manager)
      throw new Error('recordConsumptions requires a transaction manager');
    const costHistoryRepo = repoFor(
      manager,
      PurchaseCostHistory,
      this.costHistoryRepository,
    );
    const consumptionRepo = manager.getRepository(StockBatchConsumption);
    const touchedProducts = new Set<string>();
    for (const consumption of consumptions) {
      const batch = await costHistoryRepo.findOne({
        where: { id: consumption.batchId } as any,
      });
      if (!batch) throw new ConflictException(UNFULFILL_EVIDENCE_INCOMPLETE);
      const remainingMinor = toMinorUnits(String(batch.remainingQuantity));
      if (
        consumption.quantityMinor <= 0n ||
        consumption.quantityMinor > remainingMinor
      ) {
        throw new ConflictException(UNFULFILL_EVIDENCE_INCOMPLETE);
      }
      await costHistoryRepo.update(batch.id, {
        remainingQuantity: formatScale4(
          remainingMinor - consumption.quantityMinor,
        ) as any,
        updatedAt: new Date(),
      });
      const row = consumptionRepo.create({
        movementId,
        batchId: batch.id,
        quantity: formatScale4(consumption.quantityMinor),
        unitCost: formatScale4(consumption.unitCostMinor),
        valueScale8: this.formatScale8(consumption.valueScale8),
      } as any);
      await consumptionRepo.save(row);
      touchedProducts.add(batch.productId);
    }
    for (const productId of touchedProducts)
      await this.updateProductBaseCost(productId, manager);
  }

  /** Restore exactly the batch rows recorded for a movement, with #1406 caps. */
  async restoreConsumptions(
    manager: EntityManager | undefined,
    movementId: string,
  ): Promise<Map<string, bigint>> {
    if (!manager)
      throw new Error('restoreConsumptions requires a transaction manager');
    const consumptionRepo = manager.getRepository(StockBatchConsumption);
    const costHistoryRepo = repoFor(
      manager,
      PurchaseCostHistory,
      this.costHistoryRepository,
    );
    const movement = await manager.findOne(StockMovement, {
      where: { id: movementId } as any,
    });
    const rows = await consumptionRepo.find({ where: { movementId } as any });
    if (!movement || rows.length === 0)
      throw new ConflictException(UNFULFILL_EVIDENCE_INCOMPLETE);
    const provenanceQuantityMinor = rows.reduce(
      (sum, row) => sum + toMinorUnits(String(row.quantity)),
      0n,
    );
    const movedQuantityMinor = toMinorUnits(
      String(movement.quantity).replace('-', ''),
    );
    if (provenanceQuantityMinor !== movedQuantityMinor)
      throw new ConflictException(UNFULFILL_EVIDENCE_INCOMPLETE);

    const restoreByBatch = new Map<string, bigint>();
    for (const row of rows) {
      const quantityMinor = toMinorUnits(String(row.quantity));
      restoreByBatch.set(
        row.batchId,
        (restoreByBatch.get(row.batchId) ?? 0n) + quantityMinor,
      );
    }
    const batches = new Map<string, PurchaseCostHistory>();
    for (const [batchId, quantityMinor] of [...restoreByBatch].sort(([a], [b]) => a.localeCompare(b))) {
      const batch = await costHistoryRepo.findOne({
        where: { id: batchId } as any,
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !batch ||
        batch.reversedAt ||
        batch.productId !== movement.productId
      ) {
        throw new ConflictException(UNFULFILL_EVIDENCE_INCOMPLETE);
      }
      const remainingMinor = toMinorUnits(String(batch.remainingQuantity));
      const receivedMinor = toMinorUnits(String(batch.receivedQuantity));
      if (remainingMinor + quantityMinor > receivedMinor) {
        throw new ConflictException(UNFULFILL_EVIDENCE_INCOMPLETE);
      }
      batches.set(batchId, batch);
    }
    for (const [batchId, quantityMinor] of [...restoreByBatch].sort(([a], [b]) => a.localeCompare(b))) {
      const batch = batches.get(batchId)!;
      const remainingMinor = toMinorUnits(String(batch.remainingQuantity));
      await costHistoryRepo.update(batchId, {
        remainingQuantity: formatScale4(remainingMinor + quantityMinor) as any,
        updatedAt: new Date(),
      });
    }
    await this.updateProductBaseCost(movement.productId, manager);
    return restoreByBatch;
  }

  private formatScale8(value: bigint): string {
    const negative = value < 0n;
    const magnitude = negative ? -value : value;
    const whole = magnitude / 100000000n;
    const fraction = (magnitude % 100000000n).toString().padStart(8, '0');
    return `${negative ? '-' : ''}${whole}.${fraction}`;
  }

  /**
   * Apply an already-decided consumption plan EXACTLY (#1406). No batch is
   * re-selected here — the batches were locked and chosen by planConsumption, and
   * a repeated product's later line relies on this being a straight subtraction.
   */
  async applyConsumptionPlan(
    manager: EntityManager | undefined,
    consumptions: ReadonlyArray<ConsumptionLine>,
  ): Promise<void> {
    if (!manager) {
      throw new Error('applyConsumptionPlan requires a transaction manager');
    }
    const costHistoryRepo = repoFor(manager, PurchaseCostHistory, this.costHistoryRepository);
    const touchedProducts = new Set<string>();

    for (const c of consumptions) {
      const batch = await costHistoryRepo.findOne({ where: { id: c.batchId } as any });
      if (!batch) {
        throw new Error(`Consumption plan references missing batch ${c.batchId}`);
      }
      const oldRemainingMinor = toMinorUnits(String(batch.remainingQuantity));
      if (c.quantityMinor > oldRemainingMinor) {
        throw new ConflictException(
          `Cannot fulfill — batch ${c.batchId} no longer holds the planned quantity ` +
            `(need ${formatScale4(c.quantityMinor)}, have ${formatScale4(oldRemainingMinor)})`,
        );
      }
      await costHistoryRepo.update(batch.id, {
        remainingQuantity: formatScale4(oldRemainingMinor - c.quantityMinor) as any,
        updatedAt: new Date(),
      });
      touchedProducts.add(batch.productId);
    }

    for (const productId of touchedProducts) {
      await this.updateProductBaseCost(productId, manager);
    }
  }

  /**
   * Convenience single-product plan-and-apply. Kept for callers that reduce one
   * product at a time; the fulfilment path uses planConsumption across all lines.
   */
  async reduceStock(
    productId: string,
    quantitySold: number,
    manager?: EntityManager,
  ): Promise<{ totalScale8: bigint; consumptions: ConsumptionLine[] }> {
    const plans = await this.planConsumption(manager, [
      { productId, quantity: quantitySold },
    ]);
    const plan = plans[0];
    await this.applyConsumptionPlan(manager, plan.consumptions);
    return { totalScale8: plan.totalScale8, consumptions: plan.consumptions };
  }

  /**
   * Add stock when receiving GRN
   * Creates new batch in cost history and recalculates base cost
   */
  async addStock(
    productId: string,
    purchaseOrderId: string | null,
    quantity: number,
    unitCost: number,
    shippingPerUnit: number,
    receivedDate: Date,
    manager?: EntityManager,
    occurrenceId?: string,
    purchaseOrderItemId?: string,
  ): Promise<{ landedCost: number; receivedQuantity: number; batchId: string }> {
    const costHistoryRepo = repoFor(manager, PurchaseCostHistory, this.costHistoryRepository);
    const landedCost = Number(unitCost) + Number(shippingPerUnit);

    this.logger.log(
      `Adding stock for product ${productId}: ${quantity} units @ RM ${unitCost.toFixed(4)} + RM ${shippingPerUnit.toFixed(4)} shipping = RM ${landedCost.toFixed(4)} landed cost`
    );

    // Create new batch in history
    const newBatch = costHistoryRepo.create({
      productId,
      purchaseOrderId: purchaseOrderId ?? undefined,
      occurrenceId,
      purchaseOrderItemId,
      unitCost,
      shippingPerUnit,
      landedCost,
      receivedQuantity: quantity,
      remainingQuantity: quantity, // All stock is remaining
      receivedDate,
    });

    await costHistoryRepo.save(newBatch);

    this.logger.log(`Created cost history batch ${newBatch.id}`);

    // Reload the persisted batch to get the DB-stored values (NUMERIC rounding).
    const persisted = await costHistoryRepo.findOne({
      where: { id: newBatch.id } as any,
    });

    // Recalculate base cost
    await this.updateProductBaseCost(productId, manager);

    return {
      landedCost: Number(persisted?.landedCost ?? landedCost),
      receivedQuantity: Number(persisted?.receivedQuantity ?? quantity),
      batchId: persisted?.id ?? newBatch.id,
    };
  }

  /**
   * Allocate a PO's shipping across its lines, proportional to line value (#1241).
   *
   * Replaces the previous per-item float calculation, which computed each item's
   * share independently and therefore could not guarantee the shares summed to
   * the PO shipping total — a cent could be lost or duplicated.
   *
   * Weights are line VALUES (quantity x unit cost), not unit counts. Allocation
   * stays at scale 4 so per-unit landed cost keeps four internal decimals;
   * callers that need cent-level values for posting or export must run
   * reconcileToCents against the same authoritative total.
   */
  allocateShippingByValue(
    poShippingMinor: bigint,
    itemValueWeightsMinor: readonly bigint[],
  ): bigint[] {
    if (poShippingMinor === 0n || itemValueWeightsMinor.length === 0) {
      return itemValueWeightsMinor.map(() => 0n);
    }
    return allocate(poShippingMinor, itemValueWeightsMinor);
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
