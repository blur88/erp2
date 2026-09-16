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
  IsDate,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import type { PurchaseOrder } from './purchase-order.entity';
import type { Product } from './product.entity';
import { toMinorUnits, quantizeToCents, formatScale4 } from '@common/utils/money';

export enum PurchaseOrderItemStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  ORDERED = 'ordered',
  PARTIALLY_RECEIVED = 'partially_received',
  RECEIVED = 'received',
  CANCELLED = 'cancelled',
}

/**
 * Purchase Order Item entity for individual line items in purchase orders
 * Tracks detailed product information and pricing at time of order
 */
@Entity('purchase_order_items')
@Index(['purchaseOrderId'])
@Index(['productId'])
@Index(['status'])
export class PurchaseOrderItem extends BaseEntity {
  @Column({
    type: 'int',
    comment: 'Line item sequence number within the order',
  })
  @IsInt()
  @Min(1)
  lineNumber: number;

  @Column({
    type: 'enum',
    enum: PurchaseOrderItemStatus,
    default: PurchaseOrderItemStatus.PENDING,
    comment: 'Item status',
  })
  @IsEnum(PurchaseOrderItemStatus)
  status: PurchaseOrderItemStatus;

  // Product Information (captured at time of order)
  // Note: productName and productSku fields removed - available via product relationship

  // Product description is retrieved from product relationship
  // No need to store product description separately as it's available via product.description

  // Quantity and Pricing
  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Ordered quantity',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  quantity: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Received quantity so far',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  receivedQuantity: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Unit cost price',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  unitCost: number;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'percentage',
    comment: 'Discount type: percentage or fixed_amount',
  })
  @IsString()
  discountType: 'percentage' | 'fixed_amount' = 'percentage';

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
    comment: 'Line item discount percentage',
  })
  @IsDecimal({ decimal_digits: '0,2' })
  @Min(0)
  discountPercent: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Line item discount amount (total for all units or per-unit based on discountType)',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  discountAmount: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Line item total amount (after discount)',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  totalAmount: number;

  // Delivery Information
  // Note: deliveredDate removed - delivery tracking now handled at purchase order level

  // Quality Information removed - quality acceptance now tracked via receivedQuantity only

  
  // Foreign Keys
  @Column({
    type: 'uuid',
    comment: 'Purchase order ID',
  })
  purchaseOrderId: string;

  @Column({
    type: 'uuid',
    comment: 'Product ID',
  })
  productId: string;

  // Relationships
  @ManyToOne('PurchaseOrder', 'items', {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'purchaseOrderId' })
  purchaseOrder: PurchaseOrder;

  @ManyToOne('Product', { // Removed back-reference to avoid circular relation issues
    onDelete: 'RESTRICT',
    eager: false, // Disabled eager loading to prevent automatic relation resolution
  })
  @JoinColumn({ name: 'productId' })
  product: Product;

  // Computed properties
  get remainingQuantity(): number {
    return Number(this.quantity) - Number(this.receivedQuantity);
  }

  get isFullyReceived(): boolean {
    return Number(this.receivedQuantity) >= Number(this.quantity);
  }

  get isPartiallyReceived(): boolean {
    return Number(this.receivedQuantity) > 0 && !this.isFullyReceived;
  }

  get lineTotal(): number {
    return Number(this.quantity) * Number(this.unitCost);
  }

  
  
  // Delivery performance tracking moved to purchase order level
  // Individual item delivery performance is no longer tracked
  get deliveryPerformance(): 'on_time' | 'late' | 'early' | 'pending' {
    // Always return pending since item-level delivery tracking is removed
    return 'pending';
  }

  // Hooks
  @BeforeInsert()
  @BeforeUpdate()
  calculateTotals() {
    // Ensure discountType has a default
    if (!this.discountType) {
      this.discountType = 'percentage';
    }

    const qtyMinor = toMinorUnits(String(this.quantity ?? 0));
    const costMinor = toMinorUnits(String(this.unitCost ?? 0));

    let unitDiscountMinor = 0n;
    if (this.discountType === 'percentage') {
      const pctMinor = toMinorUnits(String(this.discountPercent ?? 0));
      unitDiscountMinor = (costMinor * pctMinor) / 1000000n;
    } else if (this.discountType === 'fixed_amount') {
      // PO fixed discount is PER UNIT and uncapped (SO's is per line, capped).
      unitDiscountMinor = toMinorUnits(String(this.discountAmount ?? 0));
    }

    const totalDiscountMinor = quantizeToCents((qtyMinor * unitDiscountMinor) / 10000n);
    const discountedLineMinor = (qtyMinor * (costMinor - unitDiscountMinor)) / 10000n;

    this.discountAmount = Number(formatScale4(totalDiscountMinor)) as any;
    this.totalAmount = Number(formatScale4(quantizeToCents(discountedLineMinor))) as any;
  }

  @BeforeInsert()
  @BeforeUpdate()
  updateStatus() {
    if (this.isFullyReceived) {
      this.status = PurchaseOrderItemStatus.RECEIVED;
      // deliveredDate tracking removed - delivery date now tracked at purchase order level
    } else if (this.isPartiallyReceived) {
      this.status = PurchaseOrderItemStatus.PARTIALLY_RECEIVED;
    }
  }

  // Helper methods
  receiveQuantity(quantity: number): void {
    const receiveQty = Math.min(Number(quantity), this.remainingQuantity);
    this.receivedQuantity = Number(this.receivedQuantity) + receiveQty;
    this.updateStatus();
  }

  approve(): void {
    if (this.status === PurchaseOrderItemStatus.PENDING) {
      this.status = PurchaseOrderItemStatus.APPROVED;
    }
  }

  markAsOrdered(): void {
    if (this.status === PurchaseOrderItemStatus.APPROVED) {
      this.status = PurchaseOrderItemStatus.ORDERED;
    }
  }

  cancel(): void {
    if (this.status !== PurchaseOrderItemStatus.RECEIVED) {
      this.status = PurchaseOrderItemStatus.CANCELLED;
    }
  }

  
  
  // Static method to create from product
  static fromProduct(
    product: Product,
    quantity: number,
    unitCost?: number
  ): Partial<PurchaseOrderItem> {
    return {
      productId: product.id,
      quantity,
      unitCost: unitCost || Number(product.baseCost),
    };
  }

  // Item-level delivery performance metrics removed
  // Delivery performance is now tracked at purchase order level only
  getDeliveryPerformanceMetrics(): {
    daysLate: number;
    isOnTime: boolean;
    isLate: boolean;
    isEarly: boolean;
  } {
    // Return neutral values since item-level delivery tracking is removed
    return {
      daysLate: 0,
      isOnTime: false,
      isLate: false,
      isEarly: false,
    };
  }
}