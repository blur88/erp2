import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';
import {
  IsString,
  IsOptional,
  MaxLength,
  IsDecimal,
  Min,
  IsInt,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import { Invoice } from './invoice.entity';
import { Product } from './product.entity';

/**
 * Invoice Item entity for individual line items in invoices
 * Tracks detailed product information and pricing at time of invoice
 */
@Entity('invoice_items')
@Index(['invoiceId'])
@Index(['productId'])
export class InvoiceItem extends BaseEntity {
  @Column({
    type: 'int',
    comment: 'Line item sequence number within the invoice',
  })
  @IsInt()
  @Min(1)
  lineNumber: number;

  // Product Information (captured at time of invoice)
  @Column({
    type: 'varchar',
    length: 200,
    comment: 'Product name at time of invoice',
  })
  @IsString()
  @MaxLength(200)
  productName: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Product description at time of invoice',
  })
  @IsOptional()
  @IsString()
  productDescription?: string;

  // Quantity and Pricing
  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Invoiced quantity',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  quantity: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Unit price at time of invoice',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  unitPrice: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Line item discount amount',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  discount: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Line item total amount (after discount)',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  totalAmount: number;

  // Additional Information
  @Column({
    type: 'text',
    nullable: true,
    comment: 'Special notes for this item',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  // Foreign Keys
  @Column({
    type: 'uuid',
    comment: 'Invoice ID',
  })
  invoiceId: string;

  @Column({
    type: 'uuid',
    comment: 'Product ID',
  })
  productId: string;

  // Relationships
  @ManyToOne(() => Invoice, (invoice) => invoice.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'invoiceId' })
  invoice: Invoice;

  @ManyToOne(() => Product, {
    onDelete: 'RESTRICT',
    eager: false,
  })
  @JoinColumn({ name: 'productId' })
  product: Product;

  // Computed properties
  get lineTotal(): number {
    return Number(this.quantity) * Number(this.unitPrice);
  }

  // Hooks
  @BeforeInsert()
  @BeforeUpdate()
  calculateTotals() {
    const lineTotal = this.lineTotal;

    // Ensure discount doesn't exceed line total
    this.discount = Math.min(Number(this.discount), lineTotal);

    // Calculate total amount
    this.totalAmount = lineTotal - Number(this.discount);
  }

  // Static method to create from product
  static fromProduct(
    product: Product,
    quantity: number,
    priceType: 'retail' | 'wholesale' | 'special' = 'retail'
  ): Partial<InvoiceItem> {
    const unitPrice = product.getPriceByType(priceType);

    return {
      productId: product.id,
      productName: product.name,
      productDescription: product.description,
      quantity,
      unitPrice,
      discount: 0,
    };
  }
}
