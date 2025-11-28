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
} from 'class-validator';
import { BaseEntity } from './base.entity';
import { Customer } from './customer.entity';
import { SalesOrderItem } from './sales-order-item.entity';
import { Invoice } from './invoice.entity';


/**
 * Sales Order entity for managing customer orders
 * Supports comprehensive order tracking and fulfillment
 */
@Entity('sales_orders')
@Index(['orderNumber'], { unique: true })
@Index(['customerId'])
@Index(['orderDate'])
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
    type: 'varchar',
    length: 10,
    default: 'USD',
    comment: 'Transaction currency',
  })
  @IsString()
  @MaxLength(10)
  currency: string;

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
    comment: 'Customer ID',
  })
  customerId: string;

  // Relationships
  @ManyToOne(() => Customer, (customer) => customer.salesOrders, {
    onDelete: 'RESTRICT',
    eager: false,
  })
  @JoinColumn({ name: 'customerId' })
  customer: Customer;

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
}