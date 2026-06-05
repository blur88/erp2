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
import { InvoiceItem } from './invoice-item.entity';

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

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Invoice notes (synced from sales order)',
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

  @ManyToOne(() => SalesOrder, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'salesOrderId' })
  salesOrder?: SalesOrder;

  @OneToMany(() => InvoiceItem, (item) => item.invoice, {
    cascade: true,
    eager: false,
  })
  items: InvoiceItem[];

  // Computed properties
  // Note: isOverdue and daysPastDue properties removed as they depend on dueDate

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

  // Note: markAsSent method removed as sentDate field is no longer available

  cancel(): void {
    // Invoice cancelled - status remains as-is (DRAFT, PARTIAL_PAID, or PAID)
    // Cancellation tracking removed as internalNotes field is no longer available
  }

  // Static factory method
  static fromSalesOrder(salesOrder: SalesOrder): Partial<Invoice> {
    const paidAmount = 0;
    const totalAmount = Number(salesOrder.totalAmount);
    const shippingAmount = Number(salesOrder.shippingAmount || 0);
    const balanceDue = Math.max(0, totalAmount - paidAmount);

    return {
      customerId: salesOrder.customerId,
      salesOrderId: salesOrder.id,
      shippingAmount: shippingAmount, // Copy shipping from sales order
      totalAmount: totalAmount, // Calculate from sales order total
      paidAmount: paidAmount, // Transfer payment information from sales order
      balanceDue: balanceDue, // Calculate correct balance due
      invoiceDate: new Date(),
      notes: salesOrder.notes, // Copy notes from sales order
    };
  }
}
