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
import { User } from './user.entity';
import { PurchaseOrderItem } from './purchase-order-item.entity';
import { GoodsReceivedNote } from './goods-received-note.entity';


/**
 * Purchase Order entity for managing supplier orders
 * Supports comprehensive order tracking and procurement management
 */
@Entity('purchase_orders')
@Index(['orderNumber'], { unique: true })
@Index(['supplierId'])
@Index(['orderDate'])
@Index(['requiredDate'])
@Index(['createdByUserId'])
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

  @Column({
    type: 'date',
    nullable: true,
    comment: 'Required/expected delivery date',
  })
  @IsOptional()
  @IsDate()
  requiredDate?: Date;

  @Column({
    type: 'date',
    nullable: true,
    comment: 'Date when order was sent to supplier',
  })
  @IsOptional()
  @IsDate()
  sentDate?: Date;

  @Column({
    type: 'date',
    nullable: true,
    comment: 'Date when supplier acknowledged the order',
  })
  @IsOptional()
  @IsDate()
  acknowledgedDate?: Date;

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
    comment: 'Actual delivery completion date',
  })
  @IsOptional()
  @IsDate()
  deliveredDate?: Date;

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

  // Delivery Information
  @Column({
    type: 'text',
    nullable: true,
    comment: 'Delivery address',
  })
  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Delivery city',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deliveryCity?: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Delivery state/province',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deliveryState?: string;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    comment: 'Delivery postal code',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  deliveryPostalCode?: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Delivery country',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deliveryCountry?: string;

  @Column({
    type: 'varchar',
    length: 200,
    nullable: true,
    comment: 'Contact person for delivery',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  deliveryContact?: string;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    comment: 'Contact phone for delivery',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  deliveryPhone?: string;

  // Terms and Conditions
  @Column({
    type: 'int',
    default: 30,
    comment: 'Payment terms in days',
  })
  paymentTermsDays: number;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Payment terms description',
  })
  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Delivery terms (FOB, CIF, etc.)',
  })
  @IsOptional()
  @IsString()
  deliveryTerms?: string;

  // Additional Information
  @Column({
    type: 'text',
    nullable: true,
    comment: 'Special instructions or notes',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Internal notes',
  })
  @IsOptional()
  @IsString()
  internalNotes?: string;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: 'Supplier quotation reference',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  supplierQuoteRef?: string;

  @Column({
    type: 'json',
    nullable: true,
    comment: 'Additional order metadata',
  })
  @IsOptional()
  metadata?: Record<string, any>;

  // Foreign Keys
  @Column({
    type: 'uuid',
    comment: 'Supplier ID',
  })
  supplierId: string;

  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'User who created the order',
  })
  @IsOptional()
  createdByUserId?: string;

  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'User who approved the order',
  })
  @IsOptional()
  approvedByUserId?: string;

  // Relationships
  @ManyToOne(() => Supplier, (supplier) => supplier.purchaseOrders, {
    onDelete: 'RESTRICT',
    eager: true,
  })
  @JoinColumn({ name: 'supplierId' })
  supplier: Supplier;

  @ManyToOne(() => User, (user) => user.purchaseOrders, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'createdByUserId' })
  createdByUser?: User;

  @ManyToOne(() => User, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'approvedByUserId' })
  approvedByUser?: User;

  @OneToMany(() => PurchaseOrderItem, (item) => item.purchaseOrder, {
    cascade: true,
    eager: false,
  })
  items: PurchaseOrderItem[];

  @OneToMany(() => GoodsReceivedNote, (grn) => grn.purchaseOrder, {
    cascade: false,
  })
  goodsReceivedNotes: GoodsReceivedNote[];

  // Computed properties
  get fullDeliveryAddress(): string {
    const parts = [
      this.deliveryAddress,
      this.deliveryCity,
      this.deliveryState,
      this.deliveryPostalCode,
      this.deliveryCountry,
    ].filter(Boolean);
    return parts.join(', ');
  }

  get isOverdue(): boolean {
    if (!this.requiredDate) return false;
    return new Date() > this.requiredDate;
  }

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

    // This should be called after items are loaded
    if (this.items && this.items.length > 0) {
      this.subtotal = this.items.reduce((sum, item) =>
        sum + Number(item.totalAmount || 0), 0);
    }

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