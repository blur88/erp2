import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import {
  IsDecimal,
  Min,
  IsDate,
  IsUUID,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import type { Product } from './product.entity';

/**
 * Purchase Cost History entity
 * Tracks cost and remaining quantity for each purchase batch
 * Used for stock-based weighted average base cost calculation
 */
@Entity('purchase_cost_history')
@Index(['productId', 'remainingQuantity'])
@Index(['productId', 'receivedDate'])
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
    onDelete: 'CASCADE',
    eager: false,
  })
  @JoinColumn({ name: 'productId' })
  product: Product;

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
