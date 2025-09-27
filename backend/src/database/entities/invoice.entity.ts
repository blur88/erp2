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
import { Customer } from './customer.entity';
import { SalesOrder } from './sales-order.entity';
import { Payment } from './payment.entity';

export enum InvoiceStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  PARTIALLY_PAID = 'partially_paid',
  PAID = 'paid',
  OVERDUE = 'overdue',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

export enum InvoiceType {
  STANDARD = 'standard',
  PROFORMA = 'proforma',
  CREDIT_NOTE = 'credit_note',
  DEBIT_NOTE = 'debit_note',
}

/**
 * Invoice entity for billing customers
 * Can be generated from sales orders or created independently
 */
@Entity('invoices')
@Index(['invoiceNumber'], { unique: true })
@Index(['customerId'])
@Index(['salesOrderId'])
@Index(['status'])
@Index(['invoiceDate'])
@Index(['dueDate'])
@Index(['type'])
export class Invoice extends BaseEntity {
  @Column({
    type: 'varchar',
    length: 30,
    unique: true,
    comment: 'Unique invoice number',
  })
  @IsString()
  @MaxLength(30)
  invoiceNumber: string;

  @Column({
    type: 'enum',
    enum: InvoiceType,
    default: InvoiceType.STANDARD,
    comment: 'Invoice type',
  })
  @IsEnum(InvoiceType)
  type: InvoiceType;

  @Column({
    type: 'enum',
    enum: InvoiceStatus,
    default: InvoiceStatus.DRAFT,
    comment: 'Invoice status',
  })
  @IsEnum(InvoiceStatus)
  status: InvoiceStatus;

  @Column({
    type: 'date',
    comment: 'Invoice date',
  })
  @IsDate()
  invoiceDate: Date;

  @Column({
    type: 'date',
    comment: 'Payment due date',
  })
  @IsDate()
  dueDate: Date;

  @Column({
    type: 'date',
    nullable: true,
    comment: 'Date when invoice was sent to customer',
  })
  @IsOptional()
  @IsDate()
  sentDate?: Date;

  @Column({
    type: 'date',
    nullable: true,
    comment: 'Date when invoice was fully paid',
  })
  @IsOptional()
  @IsDate()
  paidDate?: Date;

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
    precision: 5,
    scale: 2,
    default: 0,
    comment: 'Tax percentage',
  })
  @IsDecimal({ decimal_digits: '0,2' })
  @Min(0)
  taxPercent: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Tax amount',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  taxAmount: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Additional charges (shipping, handling, etc.)',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  additionalCharges: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Total invoice amount',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  totalAmount: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Total amount paid so far',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  paidAmount: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Remaining balance due',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  balanceDue: number;

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
    comment: 'Additional notes for the customer',
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

  // Billing Address (captured at time of invoice)
  @Column({
    type: 'varchar',
    length: 200,
    comment: 'Customer name at time of invoice',
  })
  @IsString()
  @MaxLength(200)
  customerName: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Billing address',
  })
  @IsOptional()
  @IsString()
  billingAddress?: string;

  @Column({
    type: 'varchar',
    length: 30,
    nullable: true,
    comment: 'Customer tax ID',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  customerTaxId?: string;

  // Reference Information
  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: 'Customer purchase order number',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  customerPoNumber?: string;

  @Column({
    type: 'json',
    nullable: true,
    comment: 'Invoice line items (denormalized for performance)',
  })
  @IsOptional()
  lineItems?: Array<{
    productSku: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    totalAmount: number;
  }>;

  @Column({
    type: 'json',
    nullable: true,
    comment: 'Additional invoice metadata',
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
    comment: 'Related sales order ID (if applicable)',
  })
  @IsOptional()
  salesOrderId?: string;

  // Relationships
  @ManyToOne(() => Customer, (customer) => customer.invoices, {
    onDelete: 'RESTRICT',
    eager: true,
  })
  @JoinColumn({ name: 'customerId' })
  customer: Customer;

  @ManyToOne(() => SalesOrder, (salesOrder) => salesOrder.invoices, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'salesOrderId' })
  salesOrder?: SalesOrder;

  @OneToMany(() => Payment, (payment) => payment.invoice, {
    cascade: false,
  })
  payments: Payment[];

  // Computed properties
  get isOverdue(): boolean {
    if (this.status === InvoiceStatus.PAID || this.status === InvoiceStatus.CANCELLED) {
      return false;
    }
    return new Date() > this.dueDate;
  }

  get daysPastDue(): number {
    if (!this.isOverdue) return 0;
    const today = new Date();
    const diffTime = today.getTime() - this.dueDate.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  get isPartiallyPaid(): boolean {
    return Number(this.paidAmount) > 0 && Number(this.balanceDue) > 0;
  }

  get isFullyPaid(): boolean {
    return Number(this.balanceDue) <= 0.01; // Allow for rounding differences
  }

  get paymentProgress(): number {
    return Number(this.totalAmount) > 0 
      ? (Number(this.paidAmount) / Number(this.totalAmount)) * 100 
      : 0;
  }

  // Hooks
  @BeforeInsert()
  generateInvoiceNumber() {
    // Invoice number generation moved to service layer for better async handling
    // Similar to SalesOrder entity pattern
  }

  @BeforeInsert()
  setDueDate() {
    if (!this.dueDate && this.invoiceDate) {
      this.dueDate = new Date(this.invoiceDate);
      this.dueDate.setDate(this.dueDate.getDate() + this.paymentTermsDays);
    }
  }

  // Helper methods
  calculateTotals(): void {
    // Calculate discount amount
    if (this.discountPercent > 0) {
      this.discountAmount = (Number(this.subtotal) * Number(this.discountPercent)) / 100;
    }

    // Calculate tax amount (on subtotal after discount)
    const taxableAmount = Number(this.subtotal) - Number(this.discountAmount);
    if (this.taxPercent > 0) {
      this.taxAmount = (taxableAmount * Number(this.taxPercent)) / 100;
    }

    // Calculate total
    this.totalAmount = taxableAmount + Number(this.taxAmount) + Number(this.additionalCharges);
    
    // Calculate balance due
    this.balanceDue = Number(this.totalAmount) - Number(this.paidAmount);
  }

  updateStatus(): void {
    if (this.isFullyPaid) {
      this.status = InvoiceStatus.PAID;
      if (!this.paidDate) {
        this.paidDate = new Date();
      }
    } else if (this.isPartiallyPaid) {
      this.status = InvoiceStatus.PARTIALLY_PAID;
    } else if (this.isOverdue) {
      this.status = InvoiceStatus.OVERDUE;
    }
  }

  addPayment(amount: number): void {
    this.paidAmount = Number(this.paidAmount) + Number(amount);
    this.calculateTotals();
    this.updateStatus();
  }

  refund(amount: number): void {
    this.paidAmount = Math.max(0, Number(this.paidAmount) - Number(amount));
    this.calculateTotals();
    this.updateStatus();
  }

  markAsSent(): void {
    if (this.status === InvoiceStatus.DRAFT) {
      this.status = InvoiceStatus.SENT;
      this.sentDate = new Date();
    }
  }

  cancel(): void {
    if (this.status !== InvoiceStatus.PAID) {
      this.status = InvoiceStatus.CANCELLED;
    }
  }

  // Static factory method
  static fromSalesOrder(salesOrder: SalesOrder): Partial<Invoice> {
    const paidAmount = Number(salesOrder.paidAmount || 0);
    const totalAmount = Number(salesOrder.totalAmount);
    const balanceDue = Math.max(0, totalAmount - paidAmount);

    return {
      customerId: salesOrder.customerId,
      salesOrderId: salesOrder.id,
      customerName: salesOrder.customer?.name,
      customerPoNumber: salesOrder.customerPoNumber,
      subtotal: totalAmount, // Use totalAmount as subtotal
      discountPercent: 0, // Default to 0 since SalesOrder doesn't have discount fields
      discountAmount: 0,
      taxPercent: 0, // Default to 0 since SalesOrder doesn't have tax fields
      taxAmount: 0,
      additionalCharges: 0, // Default to 0 since SalesOrder doesn't have shipping amount
      totalAmount: totalAmount,
      paidAmount: paidAmount, // Transfer payment information from sales order
      balanceDue: balanceDue, // Calculate correct balance due
      invoiceDate: new Date(),
      billingAddress: salesOrder.customer?.name || '',
      customerTaxId: '',
      paymentTermsDays: 30,
    };
  }
}