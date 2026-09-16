import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';
import {
  IsString,
  IsOptional,
  IsEnum,
  MaxLength,
  IsDecimal,
  Min,
  IsInt,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import type { SalesOrder } from './sales-order.entity';
import type { Product } from './product.entity';
import { toMinorUnits, quantizeToCents, formatScale4 } from '@common/utils/money';

export enum DiscountType {
  PERCENTAGE = 'percentage',
  AMOUNT = 'amount',
}

/**
 * Sales Order Item entity for individual line items in sales orders
 * Tracks detailed product information and pricing at time of order
 */
@Entity('sales_order_items')
@Index(['salesOrderId'])
@Index(['productId'])
export class SalesOrderItem extends BaseEntity {
  @Column({
    type: 'int',
    comment: 'Line item sequence number within the order',
  })
  @IsInt()
  @Min(1)
  lineNumber: number;

  // Quantity and Pricing
  @Column({
    type: 'int',
    comment: 'Ordered quantity',
  })
  @IsInt()
  @Min(1)
  quantity: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Unit price at time of order',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  unitPrice: number;

  @Column({
    type: 'enum',
    enum: DiscountType,
    default: DiscountType.PERCENTAGE,
    comment: 'Type of discount: percentage or fixed amount',
  })
  @IsEnum(DiscountType)
  discountType: DiscountType;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
    comment: 'Line item discount percentage (0-100)',
  })
  @IsDecimal({ decimal_digits: '0,2' })
  @Min(0)
  discountPercent: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Line item discount amount (fixed amount or calculated from percentage)',
  })
  @IsDecimal({ decimal_digits: '0,2' })
  @Min(0)
  discountAmount: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Line item total amount (after discount)',
  })
  @IsDecimal({ decimal_digits: '0,2' })
  @Min(0)
  totalAmount: number;

  // Cost Information (for profit analysis)
  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Product cost at time of order',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  unitCost: number;

  // Additional Information
  @Column({
    type: 'text',
    nullable: true,
    comment: 'Special instructions for this item',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  // Foreign Keys
  @Column({
    type: 'uuid',
    comment: 'Sales order ID',
  })
  salesOrderId: string;

  @Column({
    type: 'uuid',
    comment: 'Product ID',
  })
  productId: string;

  // Relationships
  @ManyToOne('SalesOrder', 'items', {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'salesOrderId' })
  salesOrder: SalesOrder;

  @ManyToOne('Product', { // Removed back-reference to avoid circular relation issues
    onDelete: 'RESTRICT',
    eager: true, // Eager load product relationship to get product name
  })
  @JoinColumn({ name: 'productId' })
  product: Product;

  // Computed properties
  get lineTotal(): number {
    return Number(this.quantity) * Number(this.unitPrice);
  }

  get grossProfit(): number {
    const revenue = Number(this.totalAmount);
    const cost = Number(this.quantity) * Number(this.unitCost);
    return revenue - cost;
  }

  get grossMargin(): number {
    const revenue = Number(this.totalAmount);
    return revenue > 0 ? (this.grossProfit / revenue) * 100 : 0;
  }

  // Hooks
  @BeforeInsert()
  @BeforeUpdate()
  calculateTotals() {
    const qtyMinor = toMinorUnits(String(this.quantity ?? 0));
    const priceMinor = toMinorUnits(String(this.unitPrice ?? 0));
    // quantity is a whole count, so scale it back out of minor units.
    const lineTotalMinor = (qtyMinor * priceMinor) / 10000n;

    let discountMinor = 0n;
    if (this.discountType === DiscountType.PERCENTAGE && this.discountPercent > 0) {
      const pctMinor = toMinorUnits(String(this.discountPercent));
      discountMinor = (lineTotalMinor * pctMinor) / 1000000n; // /100 at scale 4
    } else if (this.discountType === DiscountType.AMOUNT && this.discountAmount > 0) {
      // SO fixed discount is per LINE (PO's is per unit) and is capped at the
      // line total — preserve both properties.
      const raw = toMinorUnits(String(this.discountAmount));
      discountMinor = raw > lineTotalMinor ? lineTotalMinor : raw;
    }

    discountMinor = quantizeToCents(discountMinor);
    this.discountAmount = Number(formatScale4(discountMinor)) as any;
    this.totalAmount = Number(
      formatScale4(quantizeToCents(lineTotalMinor - discountMinor)),
    ) as any;
  }

  // Static method to create from product
  // Note: unitPrice must come from the price-list system; there is no cost fallback.
  static fromProduct(
    product: Product,
    quantity: number,
    unitPrice?: number
  ): Partial<SalesOrderItem> {
    return {
      productId: product.id,
      quantity,
      unitPrice: unitPrice ?? 0,
      unitCost: Number(product.baseCost),
      discountType: DiscountType.PERCENTAGE,
      discountPercent: 0,
      discountAmount: 0,
    };
  }
}