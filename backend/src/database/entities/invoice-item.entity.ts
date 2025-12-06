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
  IsEnum,
  MaxLength,
  IsDecimal,
  Min,
  IsInt,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import { Invoice } from './invoice.entity';
import { Product } from './product.entity';

export enum DiscountType {
  PERCENTAGE = 'percentage',
  AMOUNT = 'amount',
}

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

  // Product Information is retrieved from product relationship
  // No need to store product description separately as it's available via product.description

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
    type: 'enum',
    enum: DiscountType,
    default: DiscountType.PERCENTAGE,
    nullable: true,
    comment: 'Type of discount: percentage or fixed amount',
  })
  @IsOptional()
  @IsEnum(DiscountType)
  discountType?: DiscountType;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
    nullable: true,
    comment: 'Line item discount percentage (0-100)',
  })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  @Min(0)
  discountPercent?: number;

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
    eager: true, // Eager load product relationship to get product name
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
    priceScheme: string = 'retail'
  ): Partial<InvoiceItem> {
    const unitPrice = product.getPriceByScheme(priceScheme);

    return {
      productId: product.id,
      quantity,
      unitPrice,
      discount: 0,
    };
  }
}
