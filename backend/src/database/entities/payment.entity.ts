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
import { User } from './user.entity';

export enum PaymentMethod {
  CASH = 'cash',
  CHECK = 'check',
  CREDIT_CARD = 'credit_card',
  DEBIT_CARD = 'debit_card',
  BANK_TRANSFER = 'bank_transfer',
  ONLINE_PAYMENT = 'online_payment',
  MOBILE_PAYMENT = 'mobile_payment',
  OTHER = 'other',
}

export enum PaymentStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

export enum PaymentType {
  PAYMENT = 'payment',
  REFUND = 'refund',
  PARTIAL_REFUND = 'partial_refund',
}

/**
 * Payment entity for recording customer payments against invoices
 * Supports various payment methods and comprehensive payment tracking
 */
@Entity('payments')
@Index(['paymentNumber'], { unique: true })
@Index(['customerId'])
@Index(['invoiceId'])
@Index(['recordedByUserId'])
@Index(['status'])
@Index(['paymentDate'])
@Index(['paymentMethod'])
@Index(['type'])
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
    enum: PaymentType,
    default: PaymentType.PAYMENT,
    comment: 'Payment type',
  })
  @IsEnum(PaymentType)
  type: PaymentType;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
    comment: 'Payment status',
  })
  @IsEnum(PaymentStatus)
  status: PaymentStatus;

  @Column({
    type: 'enum',
    enum: PaymentMethod,
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

  // Payment Method Specific Information
  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Reference number (check number, transaction ID, etc.)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceNumber?: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Bank name for checks or transfers',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: 'Account number (last 4 digits for cards)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  accountNumber?: string;

  @Column({
    type: 'date',
    nullable: true,
    comment: 'Check date or transaction date',
  })
  @IsOptional()
  @IsDate()
  transactionDate?: Date;

  @Column({
    type: 'date',
    nullable: true,
    comment: 'Date when payment was cleared/processed',
  })
  @IsOptional()
  @IsDate()
  clearedDate?: Date;

  // Exchange Rate Information (for multi-currency)
  @Column({
    type: 'varchar',
    length: 10,
    default: 'USD',
    comment: 'Payment currency',
  })
  @IsString()
  @MaxLength(10)
  currency: string;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 6,
    default: 1,
    comment: 'Exchange rate to base currency',
  })
  @IsDecimal({ decimal_digits: '0,6' })
  @Min(0)
  exchangeRate: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    nullable: true,
    comment: 'Amount in base currency',
  })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,4' })
  baseCurrencyAmount?: number;

  // Processing Information
  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Payment processor (Stripe, PayPal, etc.)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  processor?: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Processor transaction ID',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  processorTransactionId?: string;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Processing fees charged',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  processingFee: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    nullable: true,
    comment: 'Net amount received after fees',
  })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,4' })
  netAmount?: number;

  // Additional Information
  @Column({
    type: 'text',
    nullable: true,
    comment: 'Payment notes or description',
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
    comment: 'Additional payment metadata',
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
    comment: 'Related invoice ID',
  })
  @IsOptional()
  invoiceId?: string;

  @Column({
    type: 'uuid',
    comment: 'User who recorded the payment',
  })
  recordedByUserId: string;

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

  @ManyToOne(() => User, (user) => user.payments, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'recordedByUserId' })
  recordedByUser: User;

  // Computed properties
  get isCompleted(): boolean {
    return this.status === PaymentStatus.COMPLETED;
  }

  get isPending(): boolean {
    return this.status === PaymentStatus.PENDING;
  }

  get isFailed(): boolean {
    return this.status === PaymentStatus.FAILED;
  }

  get isRefund(): boolean {
    return this.type === PaymentType.REFUND || this.type === PaymentType.PARTIAL_REFUND;
  }

  get effectiveAmount(): number {
    // For refunds, the effective amount is negative
    return this.isRefund ? -Number(this.amount) : Number(this.amount);
  }

  // Hooks
  @BeforeInsert()
  generatePaymentNumber() {
    if (!this.paymentNumber) {
      const timestamp = Date.now().toString(36).toUpperCase();
      const prefix = this.isRefund ? 'REF' : 'PAY';
      this.paymentNumber = `${prefix}-${timestamp}`;
    }
  }

  @BeforeInsert()
  calculateBaseCurrencyAmount() {
    if (this.currency !== 'USD' && this.exchangeRate) {
      this.baseCurrencyAmount = Number(this.amount) * Number(this.exchangeRate);
    } else {
      this.baseCurrencyAmount = Number(this.amount);
    }
  }

  @BeforeInsert()
  calculateNetAmount() {
    if (!this.netAmount) {
      this.netAmount = Number(this.amount) - Number(this.processingFee);
    }
  }

  // Helper methods
  complete(): void {
    if (this.status === PaymentStatus.PENDING) {
      this.status = PaymentStatus.COMPLETED;
      this.clearedDate = new Date();
    }
  }

  fail(reason?: string): void {
    if (this.status === PaymentStatus.PENDING) {
      this.status = PaymentStatus.FAILED;
      if (reason) {
        this.internalNotes = `Failed: ${reason}`;
      }
    }
  }

  cancel(reason?: string): void {
    if ([PaymentStatus.PENDING, PaymentStatus.FAILED].includes(this.status)) {
      this.status = PaymentStatus.CANCELLED;
      if (reason) {
        this.internalNotes = `Cancelled: ${reason}`;
      }
    }
  }

  refund(amount?: number): Payment {
    if (this.status !== PaymentStatus.COMPLETED) {
      throw new Error('Can only refund completed payments');
    }

    const refundAmount = amount || Number(this.amount);
    if (refundAmount > Number(this.amount)) {
      throw new Error('Refund amount cannot exceed original payment amount');
    }

    // Create a new payment record for the refund
    const refund = new Payment();
    refund.type = refundAmount === Number(this.amount) ? PaymentType.REFUND : PaymentType.PARTIAL_REFUND;
    refund.status = PaymentStatus.COMPLETED;
    refund.paymentMethod = this.paymentMethod;
    refund.paymentDate = new Date();
    refund.amount = refundAmount;
    refund.currency = this.currency;
    refund.exchangeRate = this.exchangeRate;
    refund.customerId = this.customerId;
    refund.invoiceId = this.invoiceId;
    refund.recordedByUserId = this.recordedByUserId;
    refund.referenceNumber = `REFUND-${this.paymentNumber}`;
    refund.notes = `Refund of payment ${this.paymentNumber}`;

    return refund;
  }

  // Validation methods
  canComplete(): boolean {
    return this.status === PaymentStatus.PENDING;
  }

  canFail(): boolean {
    return this.status === PaymentStatus.PENDING;
  }

  canCancel(): boolean {
    return [PaymentStatus.PENDING, PaymentStatus.FAILED].includes(this.status);
  }

  canRefund(): boolean {
    return this.status === PaymentStatus.COMPLETED && !this.isRefund;
  }
}