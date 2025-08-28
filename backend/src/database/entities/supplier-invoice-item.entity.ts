import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import {
  IsString,
  IsOptional,
  MaxLength,
  IsDecimal,
  Min,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import { SupplierInvoice } from './supplier-invoice.entity';
import { Product } from './product.entity';
import { PurchaseOrderItem } from './purchase-order-item.entity';

/**
 * Supplier Invoice Item entity for individual line items in supplier invoices
 */
@Entity('supplier_invoice_items')
@Index(['supplierInvoiceId'])
@Index(['productId'])
@Index(['purchaseOrderItemId'])
export class SupplierInvoiceItem extends BaseEntity {
  @Column({
    type: 'int',
    comment: 'Line number in the invoice',
  })
  lineNumber: number;

  @Column({
    type: 'varchar',
    length: 500,
    comment: 'Item description from invoice',
  })
  @IsString()
  @MaxLength(500)
  description: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 4,
    comment: 'Invoiced quantity',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  quantity: number;

  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    comment: 'Unit of measurement',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  unit?: string;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Unit price from invoice',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  unitPrice: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Line total amount',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  lineTotal: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
    comment: 'Discount percentage for this line',
  })
  @IsDecimal({ decimal_digits: '0,2' })
  @Min(0)
  discountPercent: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Discount amount for this line',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  discountAmount: number;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
    comment: 'Tax percentage for this line',
  })
  @IsDecimal({ decimal_digits: '0,2' })
  @Min(0)
  taxPercent: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Tax amount for this line',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  taxAmount: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Net amount for this line',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  netAmount: number;

  // Matching Information
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 4,
    default: 0,
    comment: 'Quantity from matching PO item',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  poQuantity: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Unit price from matching PO item',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  poUnitPrice: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 4,
    default: 0,
    comment: 'Quantity from matching GRN',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  grnQuantity: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Price variance from PO',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  priceVariance: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 4,
    default: 0,
    comment: 'Quantity variance from GRN',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  quantityVariance: number;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Whether this line is matched',
  })
  isMatched: boolean;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Matching notes or issues',
  })
  @IsOptional()
  @IsString()
  matchingNotes?: string;

  // Additional Information
  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Product code from invoice',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  supplierProductCode?: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Batch or lot number',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  batchNumber?: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Additional notes for this line item',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @Column({
    type: 'json',
    nullable: true,
    comment: 'Additional line item metadata',
  })
  @IsOptional()
  metadata?: Record<string, any>;

  // Foreign Keys
  @Column({
    type: 'uuid',
    comment: 'Supplier invoice ID',
  })
  supplierInvoiceId: string;

  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'Product ID if matched to catalog',
  })
  @IsOptional()
  productId?: string;

  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'Related purchase order item ID',
  })
  @IsOptional()
  purchaseOrderItemId?: string;

  // Relationships
  @ManyToOne(() => SupplierInvoice, (invoice) => invoice.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'supplierInvoiceId' })
  supplierInvoice: SupplierInvoice;

  @ManyToOne(() => Product, {
    onDelete: 'SET NULL',
    nullable: true,
    eager: true,
  })
  @JoinColumn({ name: 'productId' })
  product?: Product;

  @ManyToOne(() => PurchaseOrderItem, {
    onDelete: 'SET NULL',
    nullable: true,
    eager: true,
  })
  @JoinColumn({ name: 'purchaseOrderItemId' })
  purchaseOrderItem?: PurchaseOrderItem;

  // Computed properties
  get hasVariance(): boolean {
    return Math.abs(Number(this.priceVariance)) > 0 || 
           Math.abs(Number(this.quantityVariance)) > 0;
  }

  get priceVariancePercent(): number {
    if (this.poUnitPrice === 0) return 0;
    return (Number(this.priceVariance) / Number(this.poUnitPrice)) * 100;
  }

  get quantityVariancePercent(): number {
    if (this.grnQuantity === 0) return 0;
    return (Number(this.quantityVariance) / Number(this.grnQuantity)) * 100;
  }

  get effectiveUnitPrice(): number {
    const gross = Number(this.unitPrice);
    const discount = Number(this.discountAmount) / Number(this.quantity);
    return gross - discount;
  }

  // Helper methods
  calculateAmounts(): void {
    // Calculate discount amount if percentage is provided
    if (this.discountPercent > 0 && this.discountAmount === 0) {
      this.discountAmount = (Number(this.quantity) * Number(this.unitPrice) * Number(this.discountPercent)) / 100;
    }

    // Calculate line total
    this.lineTotal = Number(this.quantity) * Number(this.unitPrice);
    
    // Calculate tax amount
    const taxableAmount = this.lineTotal - Number(this.discountAmount);
    if (this.taxPercent > 0) {
      this.taxAmount = (taxableAmount * Number(this.taxPercent)) / 100;
    }

    // Calculate net amount
    this.netAmount = taxableAmount + Number(this.taxAmount);
  }

  matchWithPOItem(poItem: PurchaseOrderItem): void {
    this.purchaseOrderItemId = poItem.id;
    this.poQuantity = Number(poItem.quantity);
    this.poUnitPrice = Number(poItem.unitCost);
    
    // Calculate variances
    this.priceVariance = Number(this.unitPrice) - Number(this.poUnitPrice);
    this.quantityVariance = Number(this.quantity) - Number(this.poQuantity);

    // Check if matched within acceptable tolerance
    const priceTolerancePercent = 5; // 5% tolerance
    const quantityTolerancePercent = 2; // 2% tolerance

    const priceWithinTolerance = Math.abs(this.priceVariancePercent) <= priceTolerancePercent;
    const quantityWithinTolerance = Math.abs(this.quantityVariancePercent) <= quantityTolerancePercent;

    this.isMatched = priceWithinTolerance && quantityWithinTolerance;

    if (!this.isMatched) {
      const issues = [];
      if (!priceWithinTolerance) {
        issues.push(`Price variance: ${this.priceVariancePercent.toFixed(2)}%`);
      }
      if (!quantityWithinTolerance) {
        issues.push(`Quantity variance: ${this.quantityVariancePercent.toFixed(2)}%`);
      }
      this.matchingNotes = `Matching issues: ${issues.join(', ')}`;
    }
  }

  matchWithGRN(grnQuantity: number): void {
    this.grnQuantity = grnQuantity;
    this.quantityVariance = Number(this.quantity) - grnQuantity;

    // Update matching status considering GRN
    const quantityTolerancePercent = 2;
    const quantityWithinTolerance = Math.abs(this.quantityVariancePercent) <= quantityTolerancePercent;

    if (!quantityWithinTolerance) {
      this.isMatched = false;
      const note = `GRN quantity variance: ${this.quantityVariancePercent.toFixed(2)}%`;
      this.matchingNotes = this.matchingNotes ? 
        `${this.matchingNotes}; ${note}` : note;
    }
  }

  resolveVariance(notes: string): void {
    this.isMatched = true;
    this.matchingNotes = `Variance resolved: ${notes}`;
  }

  // Get matching status summary
  getMatchingStatus(): {
    isMatched: boolean;
    issues: string[];
    variances: {
      price: number;
      quantity: number;
      pricePercent: number;
      quantityPercent: number;
    };
  } {
    const issues = [];
    
    if (Math.abs(this.priceVariancePercent) > 5) {
      issues.push(`Price variance: ${this.priceVariancePercent.toFixed(2)}%`);
    }
    
    if (Math.abs(this.quantityVariancePercent) > 2) {
      issues.push(`Quantity variance: ${this.quantityVariancePercent.toFixed(2)}%`);
    }

    return {
      isMatched: this.isMatched,
      issues,
      variances: {
        price: Number(this.priceVariance),
        quantity: Number(this.quantityVariance),
        pricePercent: this.priceVariancePercent,
        quantityPercent: this.quantityVariancePercent,
      },
    };
  }
}