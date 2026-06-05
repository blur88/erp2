import { PurchaseCostHistory } from "../../../../database/entities/purchase-cost-history.entity";

/**
 * Base interface for costing strategies
 * Each costing method (AVERAGE, FIFO, LIFO, STANDARD) implements this interface
 */
export interface IBaseCostingStrategy {
  /**
   * Calculate base cost for a product based on cost history
   * @param productId - Product ID
   * @param batches - Cost history batches with remaining stock
   * @param currentBaseCost - Current base cost (for fallback)
   * @returns Calculated base cost
   */
  calculateBaseCost(
    productId: string,
    batches: PurchaseCostHistory[],
    currentBaseCost: number,
  ): Promise<number>;

  /**
   * Get the name of the costing method
   */
  getMethodName(): string;

  /**
   * Determine which batches to reduce from when selling
   * @param batches - Available cost history batches
   * @param quantityToReduce - Quantity to reduce
   * @returns Array of batch IDs and quantities to reduce
   */
  determineBatchReduction(
    batches: PurchaseCostHistory[],
    quantityToReduce: number,
  ): Array<{ batchId: string; quantity: number }>;
}
