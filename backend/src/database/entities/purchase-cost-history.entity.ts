import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  Check,
} from 'typeorm';
import {
  IsDecimal,
  Min,
  IsDate,
  IsUUID,
  IsOptional,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import type { Product } from './product.entity';
import type { PurchaseOrderItem } from './purchase-order-item.entity';

/**
 * Purchase Cost History entity
 * Tracks cost and remaining quantity for each purchase batch
 * Used for stock-based weighted average base cost calculation
 */
@Entity('purchase_cost_history')
@Index(['productId', 'remainingQuantity'])
@Index(['productId', 'receivedDate'])
@Index('UQ_purchase_cost_history_occurrence_item', ['occurrenceId', 'purchaseOrderItemId'], {
  unique: true,
  where: '"occurrenceId" IS NOT NULL AND "purchaseOrderItemId" IS NOT NULL',
})
@Check(
  'CHK_purchase_cost_history_reversed',
  '("reversedAt" IS NULL) = ("reversedByOccurrenceId" IS NULL)',
)
export class PurchaseCostHistory extends BaseEntity {
  @Column({
    type: 'uuid',
    comment: 'Product ID',
  })
  @IsUUID(4)
  productId: string;

  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'Purchase order ID or special UUID for opening balance',
  })
  @IsUUID(4)
  purchaseOrderId?: string;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Purchase unit cost (excluding shipping)',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  unitCost: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Allocated shipping cost per unit (BY VALUE)',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  shippingPerUnit: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Total landed cost per unit (unitCost + shippingPerUnit)',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  landedCost: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Original quantity received',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  receivedQuantity: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Current quantity remaining in stock (for weighted average)',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  remainingQuantity: number;

  @Column({
    type: 'timestamp',
    comment: 'Date goods were received',
  })
  @IsDate()
  receivedDate: Date;

  // Relationships
  @ManyToOne('Product', {
    onDelete: 'RESTRICT',
    eager: false,
  })
  @JoinColumn({ name: 'productId' })
  product: Product;

  // #1406 occurrence linkage
  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'Stock occurrence id',
  })
  @IsOptional()
  @IsUUID(4)
  occurrenceId?: string;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'When this batch was reversed',
  })
  @IsOptional()
  @IsDate()
  reversedAt?: Date;

  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'Reversal occurrence id',
  })
  @IsOptional()
  @IsUUID(4)
  reversedByOccurrenceId?: string;

  @ManyToOne('StockOccurrence', { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'reversedByOccurrenceId' })
  reversedByOccurrence?: any;

  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'Stable purchase-order item identity for the receipt cost batch',
  })
  @IsOptional()
  @IsUUID(4)
  purchaseOrderItemId?: string;

  @ManyToOne('PurchaseOrderItem', { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'purchaseOrderItemId' })
  purchaseOrderItem?: PurchaseOrderItem;

  // Computed properties
  get batchValue(): number {
    return Number(this.remainingQuantity) * Number(this.landedCost);
  }

  get soldQuantity(): number {
    return Number(this.receivedQuantity) - Number(this.remainingQuantity);
  }

  get isSoldOut(): boolean {
    return Number(this.remainingQuantity) <= 0;
  }

  // Helper methods
  reduceQuantity(qtyToReduce: number): void {
    const currentRemaining = Number(this.remainingQuantity);
    const reduction = Math.min(currentRemaining, Number(qtyToReduce));
    this.remainingQuantity = currentRemaining - reduction;
  }
}
