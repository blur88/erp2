import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  BeforeInsert,
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
import { Invoice } from './invoice.entity';

export enum PaymentMethod {
  CASH = 'cash',
}

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
@Index(['paymentNumber'], { unique: true })
@Index(['customerId'])
@Index(['invoiceId'])
@Index(['status'])
@Index(['paymentDate'])
export class Payment extends BaseEntity {
  @Column({
    type: 'varchar',
    length: 30,
    unique: true,
    comment: 'Unique payment reference number',
  })
  @IsString()
  @MaxLength(30)
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
    type: 'enum',
    enum: PaymentMethod,
    default: PaymentMethod.CASH,
    comment: 'Payment method',
  })
  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod;

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
    comment: 'Related invoice ID',
  })
  @IsOptional()
  invoiceId?: string;

  
  // Relationships
  @ManyToOne(() => Customer, (customer) => customer.payments, {
    onDelete: 'RESTRICT',
    eager: true,
  })
  @JoinColumn({ name: 'customerId' })
  customer: Customer;

  @ManyToOne(() => Invoice, (invoice) => invoice.payments, {
    onDelete: 'SET NULL',
    nullable: true,
    eager: true,
  })
  @JoinColumn({ name: 'invoiceId' })
  invoice?: Invoice;


  // Computed properties
  get isCompleted(): boolean {
    return this.status === PaymentStatus.COMPLETED;
  }

  // Hooks
  @BeforeInsert()
  generatePaymentNumber() {
    if (!this.paymentNumber) {
      const timestamp = Date.now().toString(36).toUpperCase();
      this.paymentNumber = `PAY-${timestamp}`;
    }
  }
}