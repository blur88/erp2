import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import {
  IsString,
  IsBoolean,
  IsOptional,
  MaxLength,
  IsDecimal,
  Min,
  IsDate,
  IsEnum,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import { Customer } from './customer.entity';
import { User } from './user.entity';
import { SalesOrderItem } from './sales-order-item.entity';
import { Invoice } from './invoice.entity';

export enum SalesOrderStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  PROCESSING = 'processing',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed'
}

export enum SalesOrderPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent'
}

/**
 * Sales Order entity for managing customer orders
 * Supports comprehensive order tracking and fulfillment
 */
@Entity('sales_orders')
@Index(['orderNumber'], { unique: true })
@Index(['customerId'])
@Index(['orderDate'])
@Index(['createdByUserId'])
export class SalesOrder extends BaseEntity {
  @Column({
    type: 'varchar',
    length: 30,
    unique: true,
    comment: 'Unique sales order number',
  })
  @IsString()
  @MaxLength(30)
  orderNumber: string;

  @Column({
    type: 'date',
    comment: 'Order date',
  })
  @IsDate()
  orderDate: Date;

  @Column({
    type: 'enum',
    enum: SalesOrderStatus,
    default: SalesOrderStatus.DRAFT,
    comment: 'Order status',
  })
  @IsEnum(SalesOrderStatus)
  status: SalesOrderStatus;

  @Column({
    type: 'enum',
    enum: SalesOrderPriority,
    default: SalesOrderPriority.NORMAL,
    comment: 'Order priority',
  })
  @IsEnum(SalesOrderPriority)
  priority: SalesOrderPriority;

  @Column({
    type: 'date',
    nullable: true,
    comment: 'Actual shipped date',
  })
  @IsOptional()
  @IsDate()
  shippedDate?: Date;

  @Column({
    type: 'date',
    nullable: true,
    comment: 'Actual delivered date',
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
    comment: 'Amount received from customer',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  paidAmount: number;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether order is fulfilled (inventory deducted)',
  })
  @IsBoolean()
  isFulfilled: boolean;

  @Column({
    type: 'timestamp',
    nullable: true,
    comment: 'Date when order was fulfilled',
  })
  @IsOptional()
  @IsDate()
  fulfilledDate?: Date;

  // Shipping Information
  @Column({
    type: 'text',
    nullable: true,
    comment: 'Shipping address',
  })
  @IsOptional()
  @IsString()
  shippingAddress?: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Shipping city',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  shippingCity?: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Shipping state/province',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  shippingState?: string;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    comment: 'Shipping postal code',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  shippingPostalCode?: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Shipping country',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  shippingCountry?: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Shipping method',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  shippingMethod?: string;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: 'Tracking number',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  trackingNumber?: string;

  // Additional Information
  @Column({
    type: 'text',
    nullable: true,
    comment: 'Customer purchase order number',
  })
  @IsOptional()
  @IsString()
  customerPoNumber?: string;

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
    type: 'json',
    nullable: true,
    comment: 'Additional order metadata',
  })
  @IsOptional()
  metadata?: Record<string, any>;

  // Foreign Keys
  @Column({
    type: 'uuid',
    comment: 'Customer ID',
  })
  customerId: string;

  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'User who created the order',
  })
  createdByUserId?: string;

  // Relationships
  @ManyToOne(() => Customer, (customer) => customer.salesOrders, {
    onDelete: 'RESTRICT',
    eager: false,
  })
  @JoinColumn({ name: 'customerId' })
  customer: Customer;

  @ManyToOne(() => User, (user) => user.salesOrders, {
    onDelete: 'RESTRICT',
    nullable: true,
  })
  @JoinColumn({ name: 'createdByUserId' })
  createdByUser?: User;

  @OneToMany(() => SalesOrderItem, (item) => item.salesOrder, {
    cascade: true,
    eager: false,
  })
  items: SalesOrderItem[];

  @OneToMany(() => Invoice, (invoice) => invoice.salesOrder, {
    cascade: false,
  })
  invoices: Invoice[];

  // Computed properties
  get fullShippingAddress(): string {
    const parts = [
      this.shippingAddress,
      this.shippingCity,
      this.shippingState,
      this.shippingPostalCode,
      this.shippingCountry,
    ].filter(Boolean);
    return parts.join(', ');
  }

  get isShippable(): boolean {
    return this.shippedDate === null;
  }

  get isCompleted(): boolean {
    return this.deliveredDate !== null;
  }

  get isPaidInFull(): boolean {
    return Number(this.paidAmount) >= Number(this.totalAmount);
  }

  get balanceDue(): number {
    return Math.max(0, Number(this.totalAmount) - Number(this.paidAmount));
  }

  get canFulfill(): boolean {
    return this.isPaidInFull && !this.isFulfilled;
  }

  get canUnfulfill(): boolean {
    return this.isFulfilled;
  }

  // Note: Order number generation moved to service layer for better async handling

  // Helper methods
  calculateTotals(): void {
    // This should be called after items are loaded
    if (this.items && this.items.length > 0) {
      this.totalAmount = this.items.reduce((sum, item) => 
        sum + Number(item.totalAmount), 0);
    }
  }

  canCancel(): boolean {
    return this.shippedDate === null;
  }

  canShip(): boolean {
    return this.shippedDate === null;
  }

  markAsShipped(trackingNumber?: string): void {
    if (this.canShip()) {
      this.shippedDate = new Date();
      if (trackingNumber) {
        this.trackingNumber = trackingNumber;
      }
    }
  }

  markAsDelivered(): void {
    if (this.shippedDate && !this.deliveredDate) {
      this.deliveredDate = new Date();
    }
  }
}