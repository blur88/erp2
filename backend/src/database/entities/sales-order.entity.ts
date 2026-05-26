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
  IsOptional,
  IsEnum,
  MaxLength,
  IsDecimal,
  Min,
  IsDate,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import { Customer } from './customer.entity';
import { SalesOrderItem } from './sales-order-item.entity';
import { SalesOrderPayment } from './sales-order-payment.entity';
import { Invoice } from './invoice.entity';

export enum SalesOrderStatus {
  DRAFT = 'DRAFT',
  FULFILLED = 'FULFILLED',
  CANCELLED = 'CANCELLED',
}

export enum SalesOrderPaymentStatus {
  UNPAID = 'UNPAID',
  PARTIAL = 'PARTIAL',
  PAID = 'PAID',
  OVERPAID = 'OVERPAID',
}

@Entity('sales_orders')
@Index(['orderNumber'], { unique: true })
@Index(['customerId'])
@Index(['orderDate'])
@Index(['status'])
@Index(['paymentStatus'])
export class SalesOrder extends BaseEntity {
  @Column({ type: 'varchar', length: 30, unique: true })
  @IsString()
  @MaxLength(30)
  orderNumber: string;

  @Column({ type: 'date' })
  @IsDate()
  orderDate: Date;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  @IsString()
  @MaxLength(10)
  currency: string;

  @Column({
    type: 'enum',
    enum: SalesOrderStatus,
    default: SalesOrderStatus.DRAFT,
  })
  @IsEnum(SalesOrderStatus)
  status: SalesOrderStatus;

  @Column({
    type: 'enum',
    enum: SalesOrderPaymentStatus,
    default: SalesOrderPaymentStatus.UNPAID,
  })
  @IsEnum(SalesOrderPaymentStatus)
  paymentStatus: SalesOrderPaymentStatus;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  subtotal: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  shippingAmount: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  totalAmount: number;

  @Column({ type: 'text', nullable: true })
  @IsOptional()
  @IsString()
  notes?: string;

  @Column({ type: 'uuid' })
  customerId: string;

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

  @OneToMany(() => SalesOrderPayment, (p) => p.salesOrder, {
    cascade: false,
    eager: false,
  })
  salesOrderPayments: SalesOrderPayment[];

  @OneToMany(() => Invoice, (invoice) => invoice.salesOrder, {
    cascade: false,
    eager: false,
  })
  invoices: Invoice[];

  /** @deprecated Use `status === SalesOrderStatus.FULFILLED` instead. Kept for analytics/invoice query compatibility. */
  get isFulfilled(): boolean {
    return this.status === SalesOrderStatus.FULFILLED;
  }

  /** @deprecated Approximation only — returns updatedAt when fulfilled. Kept for accounting.service compatibility. */
  get fulfilledDate(): Date | undefined {
    return this.status === SalesOrderStatus.FULFILLED ? this.updatedAt : undefined;
  }

  /** @deprecated Approximation only — does not reflect actual SalesOrderPayment records. Use paymentStatus enum instead. */
  get paidAmount(): number {
    if (this.paymentStatus === SalesOrderPaymentStatus.UNPAID) return 0;
    if (
      this.paymentStatus === SalesOrderPaymentStatus.PAID ||
      this.paymentStatus === SalesOrderPaymentStatus.OVERPAID
    ) {
      return Number(this.totalAmount);
    }
    return 0.01;
  }

  /** @deprecated Use `paymentStatus === PAID || paymentStatus === OVERPAID` instead. */
  get isPaidInFull(): boolean {
    return (
      this.paymentStatus === SalesOrderPaymentStatus.PAID ||
      this.paymentStatus === SalesOrderPaymentStatus.OVERPAID
    );
  }

  /** @deprecated Approximation only — returns 0 or totalAmount, not the real partial balance. */
  get balanceDue(): number {
    return this.isPaidInFull ? 0 : Number(this.totalAmount);
  }

  /** @deprecated Use status and paymentStatus enums directly. */
  get canFulfill(): boolean {
    return this.paymentStatus === SalesOrderPaymentStatus.PAID && this.status === SalesOrderStatus.DRAFT;
  }

  /** @deprecated Use `status === SalesOrderStatus.FULFILLED` instead. */
  get canUnfulfill(): boolean {
    return this.status === SalesOrderStatus.FULFILLED;
  }
}
