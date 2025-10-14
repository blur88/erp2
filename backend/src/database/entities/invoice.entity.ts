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
  PARTIAL_PAID = 'partial_paid',
  PAID = 'paid',
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
    comment: 'Subtotal amount (sum of line items)',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  subtotal: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Total invoice amount (same as subtotal - discounts tracked at line item level)',
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
    productId: string;
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
    if (this.status === InvoiceStatus.PAID) {
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
    // Simplified: totalAmount is set from subtotal (line items already include discounts)
    // Just calculate balance due
    this.balanceDue = Number(this.totalAmount) - Number(this.paidAmount);
  }

  updateStatus(): void {
    if (this.isFullyPaid) {
      this.status = InvoiceStatus.PAID;
      if (!this.paidDate) {
        this.paidDate = new Date();
      }
    } else if (this.isPartiallyPaid) {
      this.status = InvoiceStatus.PARTIAL_PAID;
    } else {
      this.status = InvoiceStatus.DRAFT;
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
    // Just mark the sent date, status is determined by payment state
    if (!this.sentDate) {
      this.sentDate = new Date();
    }
  }

  cancel(): void {
    // Mark as cancelled in internal notes, status remains as-is (DRAFT, PARTIAL_PAID, or PAID)
    this.internalNotes = `${this.internalNotes || ''}\nCancelled on ${new Date().toISOString()}`;
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
      subtotal: totalAmount, // Line items already include discounts
      totalAmount: totalAmount, // Same as subtotal
      paidAmount: paidAmount, // Transfer payment information from sales order
      balanceDue: balanceDue, // Calculate correct balance due
      invoiceDate: new Date(),
      billingAddress: salesOrder.customer?.name || '',
      paymentTermsDays: 30,
    };
  }
}