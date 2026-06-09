import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  OneToMany,
  BeforeInsert,
} from 'typeorm';
import {
  IsString,
  IsBoolean,
  IsOptional,
  IsEnum,
  MaxLength,
  IsDecimal,
  Min,
  IsDate,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import { Supplier } from './supplier.entity';
import { PurchaseOrderItem } from './purchase-order-item.entity';
import { VendorPayment } from './vendor-payment.entity';

export enum PurchaseOrderStatus {
  DRAFT = 'DRAFT',
  READY = 'READY',
  RECEIVED = 'RECEIVED',
  CANCELLED = 'CANCELLED',
}

export enum PurchaseOrderPaymentStatus {
  UNPAID = 'UNPAID',
  PARTIAL = 'PARTIAL',
  PAID = 'PAID',
  OVERPAID = 'OVERPAID',
}

/**
 * Purchase Order entity for managing supplier orders
 * Supports comprehensive order tracking and procurement management
 */
@Entity('purchase_orders')
@Index(['orderNumber'], { unique: true })
@Index(['supplierId'])
@Index(['orderDate'])
@Index(['status'])
@Index(['paymentStatus'])
export class PurchaseOrder extends BaseEntity {
  @Column({
    type: 'varchar',
    length: 30,
    unique: true,
    comment: 'Unique purchase order number',
  })
  @IsString()
  @MaxLength(30)
  orderNumber: string;

  @Column({
    type: 'date',
    comment: 'Purchase order date',
  })
  @IsDate()
  orderDate: Date;

  // Financial Information
  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Subtotal amount (before tax and discounts)',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  subtotal: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
    comment: 'Discount percentage',
  })
  @IsDecimal({ decimal_digits: '0,2' })
  @Min(0)
  discountPercent: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Discount amount',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  discountAmount: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Shipping/freight charges',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  shippingAmount: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Total order amount',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  totalAmount: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Total amount paid',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  paidAmount: number;

  @Column({
    type: 'enum',
    enum: PurchaseOrderStatus,
    default: PurchaseOrderStatus.DRAFT,
    comment: 'Purchase order lifecycle status',
  })
  @IsEnum(PurchaseOrderStatus)
  status: PurchaseOrderStatus;

  @Column({
    type: 'enum',
    enum: PurchaseOrderPaymentStatus,
    default: PurchaseOrderPaymentStatus.UNPAID,
    comment: 'Derived payment status',
  })
  @IsEnum(PurchaseOrderPaymentStatus)
  paymentStatus: PurchaseOrderPaymentStatus;

  // Additional Information
  @Column({
    type: 'text',
    nullable: true,
    comment: 'Special instructions or notes',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  // Foreign Keys
  @Column({
    type: 'uuid',
    comment: 'Supplier ID',
  })
  supplierId: string;

  // Relationships
  @ManyToOne(() => Supplier, (supplier) => supplier.purchaseOrders, {
    onDelete: 'RESTRICT',
    eager: true,
  })
  @JoinColumn({ name: 'supplierId' })
  supplier: Supplier;

  @OneToMany(() => PurchaseOrderItem, (item) => item.purchaseOrder, {
    cascade: true,
    eager: false,
  })
  items: PurchaseOrderItem[];

  @OneToMany(() => VendorPayment, (payment) => payment.purchaseOrder, {
    cascade: false,
  })
  vendorPayments: VendorPayment[];

  // Computed properties - removed fullDeliveryAddress and isOverdue as related fields were removed

  // Hooks
  @BeforeInsert()
  generateOrderNumber() {
    // Order number will be set by the service using sequential numbering
    // This hook is kept for backward compatibility but does nothing
    // if orderNumber is already set by the service
  }

  // Helper methods
  calculateTotals(): void {
    // Initialize default values
    if (!this.subtotal) {
      this.subtotal = 0;
    }
    if (!this.discountAmount) {
      this.discountAmount = 0;
    }
    if (!this.shippingAmount) {
      this.shippingAmount = 0;
    }

    // Only recalculate subtotal from items if items have totalAmount already set
    // (i.e., items were loaded from database, not newly created)
    if (this.items && this.items.length > 0 && this.items[0].totalAmount !== undefined && this.items[0].totalAmount !== 0) {
      this.subtotal = this.items.reduce((sum, item) =>
        sum + Number(item.totalAmount || 0), 0);
    }
    // Otherwise, trust the subtotal value that was set by the service

    // Calculate discount amount
    if (this.discountPercent > 0) {
      this.discountAmount = (Number(this.subtotal || 0) * Number(this.discountPercent)) / 100;
    }

    // Calculate total (subtotal - discount + shipping)
    const subtotalAfterDiscount = Number(this.subtotal || 0) - Number(this.discountAmount || 0);
    this.totalAmount = subtotalAfterDiscount + Number(this.shippingAmount || 0);
  }


  // Get total received quantities for all items
  getTotalReceivedQuantity(): number {
    if (!this.items) return 0;
    return this.items.reduce((sum, item) => sum + Number(item.receivedQuantity), 0);
  }

  // Get total ordered quantities for all items
  getTotalOrderedQuantity(): number {
    if (!this.items) return 0;
    return this.items.reduce((sum, item) => sum + Number(item.quantity), 0);
  }

  // Check if all items are fully received
  isFullyReceived(): boolean {
    if (!this.items || this.items.length === 0) return false;
    return this.items.every(item => item.isFullyReceived);
  }
}
