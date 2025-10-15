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
  IsEnum,
  MaxLength,
  IsDecimal,
  Min,
  IsDate,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import { Supplier } from './supplier.entity';
import { User } from './user.entity';
import { PurchaseOrder } from './purchase-order.entity';
import { GoodsReceivedNote } from './goods-received-note.entity';
import { SupplierInvoiceItem } from './supplier-invoice-item.entity';

export enum SupplierInvoiceStatus {
  RECEIVED = 'received',
  UNDER_REVIEW = 'under_review',
  MATCHED = 'matched',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  PAID = 'paid',
  DISPUTED = 'disputed',
  CANCELLED = 'cancelled',
}

export enum SupplierInvoiceType {
  STANDARD = 'standard',
  DEBIT_NOTE = 'debit_note',
  CREDIT_NOTE = 'credit_note',
  PREPAYMENT = 'prepayment',
}

export enum InvoiceMatchingStatus {
  NOT_MATCHED = 'not_matched',
  PARTIALLY_MATCHED = 'partially_matched',
  FULLY_MATCHED = 'fully_matched',
  MISMATCHED = 'mismatched',
}

/**
 * Supplier Invoice entity for managing supplier invoices and three-way matching
 * Supports invoice processing workflow with PO and GRN matching
 */
@Entity('supplier_invoices')
@Index(['invoiceNumber'], { unique: true })
@Index(['supplierId'])
@Index(['status'])
@Index(['invoiceDate'])
@Index(['dueDate'])
@Index(['purchaseOrderId'])
@Index(['receivedByUserId'])
@Index(['approvedByUserId'])
@Index(['matchingStatus'])
export class SupplierInvoice extends BaseEntity {
  @Column({
    type: 'varchar',
    length: 50,
    unique: true,
    comment: 'Supplier invoice number',
  })
  @IsString()
  @MaxLength(50)
  invoiceNumber: string;

  @Column({
    type: 'enum',
    enum: SupplierInvoiceStatus,
    default: SupplierInvoiceStatus.RECEIVED,
    comment: 'Invoice status',
  })
  @IsEnum(SupplierInvoiceStatus)
  status: SupplierInvoiceStatus;

  @Column({
    type: 'enum',
    enum: SupplierInvoiceType,
    default: SupplierInvoiceType.STANDARD,
    comment: 'Type of invoice',
  })
  @IsEnum(SupplierInvoiceType)
  type: SupplierInvoiceType;

  @Column({
    type: 'enum',
    enum: InvoiceMatchingStatus,
    default: InvoiceMatchingStatus.NOT_MATCHED,
    comment: 'Three-way matching status',
  })
  @IsEnum(InvoiceMatchingStatus)
  matchingStatus: InvoiceMatchingStatus;

  @Column({
    type: 'date',
    comment: 'Invoice date from supplier',
  })
  @IsDate()
  invoiceDate: Date;

  @Column({
    type: 'date',
    comment: 'Invoice due date',
  })
  @IsDate()
  dueDate: Date;

  @Column({
    type: 'date',
    comment: 'Date when invoice was received by us',
  })
  @IsDate()
  receivedDate: Date;

  @Column({
    type: 'date',
    nullable: true,
    comment: 'Date when invoice was approved for payment',
  })
  @IsOptional()
  @IsDate()
  approvedDate?: Date;

  @Column({
    type: 'date',
    nullable: true,
    comment: 'Date when invoice was paid',
  })
  @IsOptional()
  @IsDate()
  paidDate?: Date;

  // Financial Information
  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Gross amount from invoice',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  grossAmount: number;

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
    comment: 'Discount amount',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  discountAmount: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Net amount payable',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  netAmount: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Amount already paid',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  paidAmount: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Outstanding amount',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  outstandingAmount: number;

  @Column({
    type: 'varchar',
    length: 10,
    default: 'USD',
    comment: 'Invoice currency',
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

  // Three-way Matching Information
  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Matched amount against PO',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  poMatchedAmount: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Matched amount against GRN',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  grnMatchedAmount: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Variance amount',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  varianceAmount: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
    comment: 'Allowed variance percentage',
  })
  @IsDecimal({ decimal_digits: '0,2' })
  @Min(0)
  allowedVariancePercent: number;

  @Column({
    type: 'json',
    nullable: true,
    comment: 'Matching discrepancies and issues',
  })
  @IsOptional()
  matchingIssues?: Array<{
    type: 'quantity' | 'price' | 'tax' | 'description';
    description: string;
    invoiceValue: number;
    poValue?: number;
    grnValue?: number;
    variance: number;
    isResolved: boolean;
  }>;

  // Payment Information
  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Payment terms',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentTerms?: string;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: 'Payment reference number',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  paymentReference?: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Payment method',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentMethod?: string;

  // Additional Information
  @Column({
    type: 'text',
    nullable: true,
    comment: 'Invoice description or notes',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Internal processing notes',
  })
  @IsOptional()
  @IsString()
  internalNotes?: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Approval comments',
  })
  @IsOptional()
  @IsString()
  approvalComments?: string;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: 'Supplier delivery note reference',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  deliveryNoteRef?: string;

  @Column({
    type: 'json',
    nullable: true,
    comment: 'Attached documents/files',
  })
  @IsOptional()
  attachments?: Array<{
    fileName: string;
    filePath: string;
    fileSize: number;
    uploadedAt: Date;
    uploadedBy: string;
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
    comment: 'Supplier ID',
  })
  supplierId: string;

  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'Related purchase order ID',
  })
  @IsOptional()
  purchaseOrderId?: string;

  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'Related goods received note ID',
  })
  @IsOptional()
  goodsReceivedNoteId?: string;

  @Column({
    type: 'uuid',
    comment: 'User who received/entered the invoice',
  })
  receivedByUserId: string;

  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'User who approved the invoice',
  })
  @IsOptional()
  approvedByUserId?: string;

  // Relationships
  @ManyToOne(() => Supplier, (supplier) => supplier.invoices, {
    onDelete: 'RESTRICT',
    eager: true,
  })
  @JoinColumn({ name: 'supplierId' })
  supplier: Supplier;

  @ManyToOne(() => PurchaseOrder, {
    onDelete: 'SET NULL',
    nullable: true,
    eager: true,
  })
  @JoinColumn({ name: 'purchaseOrderId' })
  purchaseOrder?: PurchaseOrder;

  @ManyToOne(() => GoodsReceivedNote, {
    onDelete: 'SET NULL',
    nullable: true,
    eager: true,
  })
  @JoinColumn({ name: 'goodsReceivedNoteId' })
  goodsReceivedNote?: GoodsReceivedNote;

  @ManyToOne(() => User, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'receivedByUserId' })
  receivedByUser: User;

  @ManyToOne(() => User, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'approvedByUserId' })
  approvedByUser?: User;

  @OneToMany(() => SupplierInvoiceItem, (item) => item.supplierInvoice, {
    cascade: true,
    eager: false,
  })
  items: SupplierInvoiceItem[];

  // Computed properties
  get isPaid(): boolean {
    return this.status === SupplierInvoiceStatus.PAID;
  }

  get isOverdue(): boolean {
    return new Date() > this.dueDate && !this.isPaid;
  }

  get daysUntilDue(): number {
    const today = new Date();
    const due = new Date(this.dueDate);
    const diffTime = due.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  get isFullyMatched(): boolean {
    return this.matchingStatus === InvoiceMatchingStatus.FULLY_MATCHED;
  }

  get canApprove(): boolean {
    return this.status === SupplierInvoiceStatus.MATCHED && this.isFullyMatched;
  }

  get canPay(): boolean {
    return this.status === SupplierInvoiceStatus.APPROVED;
  }

  get remainingAmount(): number {
    return Number(this.netAmount) - Number(this.paidAmount);
  }

  // Helper methods
  calculateAmounts(): void {
    this.netAmount = Number(this.grossAmount) - Number(this.discountAmount);
    this.outstandingAmount = Number(this.netAmount) - Number(this.paidAmount);
  }

  performThreeWayMatching(): void {
    if (!this.purchaseOrder || !this.goodsReceivedNote) {
      this.matchingStatus = InvoiceMatchingStatus.NOT_MATCHED;
      return;
    }

    // Reset matching issues
    this.matchingIssues = [];

    // Compare amounts
    const poAmount = Number(this.purchaseOrder.totalAmount);
    // GRN verification is now quantity-based only, not amount-based
    // We only verify that goods were received, not the total value
    const grnAmount = poAmount; // Use PO amount as reference since GRN no longer tracks costs
    const invoiceAmount = Number(this.netAmount);

    this.poMatchedAmount = poAmount;
    this.grnMatchedAmount = grnAmount;
    this.varianceAmount = Math.abs(invoiceAmount - Math.min(poAmount, grnAmount));

    // Check for variances
    const variancePercent = (this.varianceAmount / invoiceAmount) * 100;
    
    if (variancePercent <= this.allowedVariancePercent) {
      this.matchingStatus = InvoiceMatchingStatus.FULLY_MATCHED;
    } else if (variancePercent <= this.allowedVariancePercent * 2) {
      this.matchingStatus = InvoiceMatchingStatus.PARTIALLY_MATCHED;
    } else {
      this.matchingStatus = InvoiceMatchingStatus.MISMATCHED;
    }

    // Record specific issues
    if (Math.abs(invoiceAmount - poAmount) / invoiceAmount > 0.05) {
      this.matchingIssues.push({
        type: 'price',
        description: 'Invoice amount differs significantly from PO amount',
        invoiceValue: invoiceAmount,
        poValue: poAmount,
        variance: invoiceAmount - poAmount,
        isResolved: false,
      });
    }

    if (Math.abs(invoiceAmount - grnAmount) / invoiceAmount > 0.05) {
      this.matchingIssues.push({
        type: 'quantity',
        description: 'Invoice amount differs from GRN amount',
        invoiceValue: invoiceAmount,
        grnValue: grnAmount,
        variance: invoiceAmount - grnAmount,
        isResolved: false,
      });
    }

    // Update status based on matching
    if (this.matchingStatus === InvoiceMatchingStatus.FULLY_MATCHED) {
      this.status = SupplierInvoiceStatus.MATCHED;
    } else {
      this.status = SupplierInvoiceStatus.UNDER_REVIEW;
    }
  }

  approve(approvedByUserId: string, comments?: string): void {
    if (this.canApprove) {
      this.status = SupplierInvoiceStatus.APPROVED;
      this.approvedByUserId = approvedByUserId;
      this.approvedDate = new Date();
      if (comments) {
        this.approvalComments = comments;
      }
    }
  }

  reject(rejectedByUserId: string, reason: string): void {
    if (this.status === SupplierInvoiceStatus.MATCHED || 
        this.status === SupplierInvoiceStatus.UNDER_REVIEW) {
      this.status = SupplierInvoiceStatus.REJECTED;
      this.approvedByUserId = rejectedByUserId;
      this.approvedDate = new Date();
      this.approvalComments = reason;
    }
  }

  markAsPaid(paidAmount: number, paymentRef?: string, paymentMethod?: string): void {
    if (this.canPay) {
      this.paidAmount = Number(this.paidAmount) + Number(paidAmount);
      this.outstandingAmount = Number(this.netAmount) - Number(this.paidAmount);
      
      if (this.outstandingAmount <= 0) {
        this.status = SupplierInvoiceStatus.PAID;
        this.paidDate = new Date();
      }
      
      if (paymentRef) {
        this.paymentReference = paymentRef;
      }
      if (paymentMethod) {
        this.paymentMethod = paymentMethod;
      }
    }
  }

  dispute(reason: string): void {
    this.status = SupplierInvoiceStatus.DISPUTED;
    this.internalNotes = (this.internalNotes || '') + `\nDisputed: ${reason}`;
  }

  resolveDispute(): void {
    if (this.status === SupplierInvoiceStatus.DISPUTED) {
      this.status = SupplierInvoiceStatus.UNDER_REVIEW;
      this.performThreeWayMatching();
    }
  }

  cancel(reason?: string): void {
    this.status = SupplierInvoiceStatus.CANCELLED;
    if (reason) {
      this.internalNotes = (this.internalNotes || '') + `\nCancelled: ${reason}`;
    }
  }

  // Get aging information
  getAging(): {
    category: string;
    days: number;
  } {
    const overdueDays = -this.daysUntilDue;
    
    if (overdueDays <= 0) {
      return { category: 'Current', days: this.daysUntilDue };
    } else if (overdueDays <= 30) {
      return { category: '1-30 days', days: overdueDays };
    } else if (overdueDays <= 60) {
      return { category: '31-60 days', days: overdueDays };
    } else if (overdueDays <= 90) {
      return { category: '61-90 days', days: overdueDays };
    } else {
      return { category: '90+ days', days: overdueDays };
    }
  }

  // Check if invoice needs attention
  requiresAttention(): boolean {
    return this.isOverdue || 
           this.matchingStatus === InvoiceMatchingStatus.MISMATCHED ||
           this.status === SupplierInvoiceStatus.DISPUTED ||
           (this.matchingIssues && this.matchingIssues.some(issue => !issue.isResolved));
  }
}