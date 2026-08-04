import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { IsString, IsOptional, IsEnum, IsDecimal, IsDate } from 'class-validator';
import { BaseEntity } from './base.entity';
import { Customer } from './customer.entity';
import { SalesOrder } from './sales-order.entity';
import { PaymentMethodEntity } from './payment-method.entity';
export enum PaymentStatus {
  COMPLETED = 'completed',
  PENDING = 'pending',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

/**
 * Payment entity for recording customer payments against invoices
 * Simplified cash-based payment system
 */
@Entity('payments')
@Index(['customerId'])
@Index(['salesOrderId'])
@Index(['status'])
@Index(['paymentDate'])
@Index(['paymentMethodId'])
export class Payment extends BaseEntity {
  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.COMPLETED,
    comment: 'Payment status',
  })
  @IsEnum(PaymentStatus)
  status: PaymentStatus;

  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'Payment method entity ID',
  })
  @IsOptional()
  paymentMethodId?: string;

  @Column({
    type: 'date',
    comment: 'Payment date',
  })
  @IsDate()
  paymentDate: Date;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Payment amount',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  amount: string;

  // Additional Information
  @Column({
    type: 'text',
    nullable: true,
    comment: 'Payment notes or description',
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

  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'Related sales order ID',
  })
  @IsOptional()
  salesOrderId?: string;

  // Relationships
  @ManyToOne(() => Customer, (customer) => customer.payments, {
    onDelete: 'RESTRICT',
    eager: true,
  })
  @JoinColumn({ name: 'customerId' })
  customer: Customer;

  @ManyToOne(() => SalesOrder, (salesOrder) => salesOrder.payments, {
    onDelete: 'RESTRICT',
    nullable: true,
    eager: false,
  })
  @JoinColumn({ name: 'salesOrderId' })
  salesOrder?: SalesOrder;

  @ManyToOne(() => PaymentMethodEntity, {
    onDelete: 'RESTRICT',
    nullable: true,
    eager: true,
  })
  @JoinColumn({ name: 'paymentMethodId' })
  paymentMethodEntity?: PaymentMethodEntity;

  // Computed properties
  get isCompleted(): boolean {
    return this.status === PaymentStatus.COMPLETED;
  }
}
