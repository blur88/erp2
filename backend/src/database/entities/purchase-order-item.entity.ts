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
import { PurchaseOrder } from './purchase-order.entity';
import { Product } from './product.entity';

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
  @Column({
    type: 'varchar',
    length: 50,
    comment: 'Product SKU at time of order',
  })
  @IsString()
  @MaxLength(50)
  productSku: string;

  @Column({
    type: 'varchar',
    length: 200,
    comment: 'Product name at time of order',
  })
  @IsString()
  @MaxLength(200)
  productName: string;

  // Product description is retrieved from product relationship
  // No need to store product description separately as it's available via product.description

  @Column({
    type: 'varchar',
    length: 20,
    comment: 'Unit of measurement',
  })
  @IsString()
  @MaxLength(20)
  unit: string;

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
  @Column({
    type: 'date',
    nullable: true,
    comment: 'Required delivery date for this item',
  })
  @IsOptional()
  @IsDate()
  requiredDate?: Date;

  @Column({
    type: 'date',
    nullable: true,
    comment: 'Expected delivery date from supplier',
  })
  @IsOptional()
  @IsDate()
  expectedDeliveryDate?: Date;

  @Column({
    type: 'date',
    nullable: true,
    comment: 'Actual delivery date',
  })
  @IsOptional()
  @IsDate()
  deliveredDate?: Date;

  // Quality Information
  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Quantity accepted (passed quality check)',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  acceptedQuantity: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Quantity rejected (failed quality check)',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  rejectedQuantity: number;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Quality inspection notes',
  })
  @IsOptional()
  @IsString()
  qualityNotes?: string;

  // Additional Information
  @Column({
    type: 'text',
    nullable: true,
    comment: 'Special instructions for this item',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Supplier part number or reference',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  supplierPartNumber?: string;

  @Column({
    type: 'json',
    nullable: true,
    comment: 'Item-specific attributes or specifications',
  })
  @IsOptional()
  attributes?: Record<string, any>;

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
  @ManyToOne(() => PurchaseOrder, (purchaseOrder) => purchaseOrder.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'purchaseOrderId' })
  purchaseOrder: PurchaseOrder;

  @ManyToOne(() => Product, { // Removed back-reference to avoid circular relation issues
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

  get qualityAcceptanceRate(): number {
    const totalInspected = Number(this.acceptedQuantity) + Number(this.rejectedQuantity);
    return totalInspected > 0 ? (Number(this.acceptedQuantity) / totalInspected) * 100 : 0;
  }

  get isOverdue(): boolean {
    if (!this.requiredDate) return false;
    return new Date() > this.requiredDate && !this.isFullyReceived;
  }

  get deliveryPerformance(): 'on_time' | 'late' | 'early' | 'pending' {
    if (!this.deliveredDate) return 'pending';
    if (!this.expectedDeliveryDate) return 'on_time'; // No expectation set
    
    const delivered = this.deliveredDate.getTime();
    const expected = this.expectedDeliveryDate.getTime();
    
    if (delivered === expected) return 'on_time';
    return delivered > expected ? 'late' : 'early';
  }

  // Hooks
  @BeforeInsert()
  @BeforeUpdate()
  calculateTotals() {
    // Ensure discountType has a default
    if (!this.discountType) {
      this.discountType = 'percentage';
    }

    let unitDiscount = 0;
    let totalDiscountAmount = 0;

    console.log('[calculateTotals] discountType:', this.discountType);
    console.log('[calculateTotals] discountAmount:', this.discountAmount);
    console.log('[calculateTotals] discountPercent:', this.discountPercent);
    console.log('[calculateTotals] unitCost:', this.unitCost);
    console.log('[calculateTotals] quantity:', this.quantity);

    if (this.discountType === 'percentage') {
      // Percentage discount: apply to unit price
      unitDiscount = this.discountPercent > 0
        ? (Number(this.unitCost) * Number(this.discountPercent)) / 100
        : 0;
      totalDiscountAmount = unitDiscount * Number(this.quantity);
    } else if (this.discountType === 'fixed_amount') {
      // Fixed amount discount: discountAmount is per unit
      unitDiscount = Number(this.discountAmount) || 0;
      totalDiscountAmount = unitDiscount * Number(this.quantity);
    }

    console.log('[calculateTotals] unitDiscount:', unitDiscount);
    console.log('[calculateTotals] totalDiscountAmount:', totalDiscountAmount);

    // Discounted unit price
    const discountedUnitPrice = Number(this.unitCost) - unitDiscount;

    // Store total discount amount
    if (this.discountType === 'percentage') {
      this.discountAmount = totalDiscountAmount;
    }

    // Calculate total amount: discounted unit price × quantity
    this.totalAmount = discountedUnitPrice * Number(this.quantity);

    console.log('[calculateTotals] totalAmount:', this.totalAmount);
  }

  @BeforeInsert()
  @BeforeUpdate()
  updateStatus() {
    if (this.isFullyReceived) {
      this.status = PurchaseOrderItemStatus.RECEIVED;
      if (!this.deliveredDate) {
        this.deliveredDate = new Date();
      }
    } else if (this.isPartiallyReceived) {
      this.status = PurchaseOrderItemStatus.PARTIALLY_RECEIVED;
    }
  }

  // Helper methods
  receiveQuantity(quantity: number, acceptedQty?: number, rejectedQty?: number): void {
    const receiveQty = Math.min(Number(quantity), this.remainingQuantity);
    this.receivedQuantity = Number(this.receivedQuantity) + receiveQty;
    
    // Update quality metrics if provided
    if (acceptedQty !== undefined) {
      this.acceptedQuantity = Number(this.acceptedQuantity) + Number(acceptedQty);
    }
    if (rejectedQty !== undefined) {
      this.rejectedQuantity = Number(this.rejectedQuantity) + Number(rejectedQty);
    }
    
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

  setExpectedDeliveryDate(date: Date): void {
    this.expectedDeliveryDate = date;
  }

  // Quality control methods
  inspectReceived(acceptedQty: number, rejectedQty: number, notes?: string): void {
    const totalInspected = Number(acceptedQty) + Number(rejectedQty);
    if (totalInspected > Number(this.receivedQuantity)) {
      throw new Error('Cannot inspect more than received quantity');
    }
    
    this.acceptedQuantity = Number(acceptedQty);
    this.rejectedQuantity = Number(rejectedQty);
    
    if (notes) {
      this.qualityNotes = notes;
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
      productSku: product.barcode,
      productName: product.name,
      unit: 'pcs',
      quantity,
      unitCost: unitCost || Number(product.baseCost),
    };
  }

  // Calculate delivery performance metrics for reporting
  getDeliveryPerformanceMetrics(): {
    daysLate: number;
    isOnTime: boolean;
    isLate: boolean;
    isEarly: boolean;
  } {
    if (!this.deliveredDate || !this.expectedDeliveryDate) {
      return {
        daysLate: 0,
        isOnTime: false,
        isLate: false,
        isEarly: false,
      };
    }

    const deliveredTime = this.deliveredDate.getTime();
    const expectedTime = this.expectedDeliveryDate.getTime();
    const diffDays = Math.ceil((deliveredTime - expectedTime) / (1000 * 60 * 60 * 24));

    return {
      daysLate: Math.max(0, diffDays),
      isOnTime: diffDays === 0,
      isLate: diffDays > 0,
      isEarly: diffDays < 0,
    };
  }
}