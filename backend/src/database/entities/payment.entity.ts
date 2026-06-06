import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { IsString, IsOptional, IsEnum, MaxLength, IsDecimal, Min, IsDate } from 'class-validator';
import { BaseEntity } from './base.entity';
import { Customer } from './customer.entity';
import { SalesOrder } from './sales-order.entity';
import { PaymentMethodEntity } from './payment-method.entity';
import { Settlement } from './settlement.entity';

export enum PaymentStatus {
  COMPLETED = 'completed',
  PENDING = 'pending',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

export enum SettlementStatusEnum {
  NOT_APPLICABLE = 'not_applicable',
  PENDING = 'pending',
  SETTLED = 'settled',
}

/**
 * Payment entity for recording customer payments against invoices
 * Simplified cash-based payment system
 */
@Entity('payments')
@Index(['paymentNumber'], { unique: true })
@Index(['customerId'])
@Index(['salesOrderId'])
@Index(['status'])
@Index(['paymentDate'])
@Index(['paymentMethodId'])
@Index(['settlementId'])
@Index(['settlementStatus'])
export class Payment extends BaseEntity {
  @Column({
    type: 'varchar',
    length: 50,
    unique: true,
    comment: 'Unique payment reference number',
  })
  @IsString()
  @MaxLength(50)
  paymentNumber: string;

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
    type: 'enum',
    enum: SettlementStatusEnum,
    default: SettlementStatusEnum.NOT_APPLICABLE,
    comment: 'Settlement status for third-party payments',
  })
  @IsEnum(SettlementStatusEnum)
  settlementStatus: SettlementStatusEnum;

  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'Settlement ID when payment is settled',
  })
  @IsOptional()
  settlementId?: string;

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
  @Min(0)
  amount: number;

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

  @ManyToOne(() => Settlement, {
    onDelete: 'SET NULL',
    nullable: true,
    eager: false,
  })
  @JoinColumn({ name: 'settlementId' })
  settlement?: Settlement;

  // Computed properties
  get isCompleted(): boolean {
    return this.status === PaymentStatus.COMPLETED;
  }
}
