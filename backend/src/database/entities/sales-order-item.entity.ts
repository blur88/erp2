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
import { SalesOrder } from './sales-order.entity';
import { Product } from './product.entity';

export enum SalesOrderItemStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  SHIPPED = 'shipped',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
}

export enum DiscountType {
  PERCENTAGE = 'percentage',
  AMOUNT = 'amount',
}

/**
 * Sales Order Item entity for individual line items in sales orders
 * Tracks detailed product information and pricing at time of order
 */
@Entity('sales_order_items')
@Index(['salesOrderId'])
@Index(['productId'])
@Index(['status'])
export class SalesOrderItem extends BaseEntity {
  @Column({
    type: 'int',
    comment: 'Line item sequence number within the order',
  })
  @IsInt()
  @Min(1)
  lineNumber: number;

  @Column({
    type: 'enum',
    enum: SalesOrderItemStatus,
    default: SalesOrderItemStatus.PENDING,
    comment: 'Item status',
  })
  @IsEnum(SalesOrderItemStatus)
  status: SalesOrderItemStatus;

  // Product Information (captured at time of order)
  @Column({
    type: 'varchar',
    length: 50,
    comment: 'Product SKU at time of order',
  })
  @IsString()
  @MaxLength(50)
  productSku: string;

  @Column({
    type: 'varchar',
    length: 200,
    comment: 'Product name at time of order',
  })
  @IsString()
  @MaxLength(200)
  productName: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Product description at time of order',
  })
  @IsOptional()
  @IsString()
  productDescription?: string;

  @Column({
    type: 'varchar',
    length: 20,
    comment: 'Unit of measurement',
  })
  @IsString()
  @MaxLength(20)
  unit: string;

  // Quantity and Pricing
  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Ordered quantity',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  quantity: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Shipped quantity',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  shippedQuantity: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Delivered quantity',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  deliveredQuantity: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Unit price at time of order',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  unitPrice: number;

  @Column({
    type: 'enum',
    enum: DiscountType,
    default: DiscountType.PERCENTAGE,
    comment: 'Type of discount: percentage or fixed amount',
  })
  @IsEnum(DiscountType)
  discountType: DiscountType;

  @Column({
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 0,
    comment: 'Line item discount percentage (0-100)',
  })
  @IsDecimal({ decimal_digits: '0,2' })
  @Min(0)
  discountPercent: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Line item discount amount (fixed amount or calculated from percentage)',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  discountAmount: number;

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

  // Cost Information (for profit analysis)
  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Product cost at time of order',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  unitCost: number;

  // Additional Information
  @Column({
    type: 'text',
    nullable: true,
    comment: 'Special instructions for this item',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @Column({
    type: 'json',
    nullable: true,
    comment: 'Item-specific attributes or customizations',
  })
  @IsOptional()
  attributes?: Record<string, any>;

  // Foreign Keys
  @Column({
    type: 'uuid',
    comment: 'Sales order ID',
  })
  salesOrderId: string;

  @Column({
    type: 'uuid',
    comment: 'Product ID',
  })
  productId: string;

  // Relationships
  @ManyToOne(() => SalesOrder, (salesOrder) => salesOrder.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'salesOrderId' })
  salesOrder: SalesOrder;

  @ManyToOne(() => Product, { // Removed back-reference to avoid circular relation issues
    onDelete: 'RESTRICT',
    eager: false, // Disabled eager loading to prevent automatic relation resolution
  })
  @JoinColumn({ name: 'productId' })
  product: Product;

  // Computed properties
  get remainingQuantity(): number {
    return Number(this.quantity) - Number(this.shippedQuantity);
  }

  get isFullyShipped(): boolean {
    return Number(this.shippedQuantity) >= Number(this.quantity);
  }

  get isFullyDelivered(): boolean {
    return Number(this.deliveredQuantity) >= Number(this.quantity);
  }

  get lineTotal(): number {
    return Number(this.quantity) * Number(this.unitPrice);
  }

  get grossProfit(): number {
    const revenue = Number(this.totalAmount);
    const cost = Number(this.quantity) * Number(this.unitCost);
    return revenue - cost;
  }

  get grossMargin(): number {
    const revenue = Number(this.totalAmount);
    return revenue > 0 ? (this.grossProfit / revenue) * 100 : 0;
  }

  // Hooks
  @BeforeInsert()
  @BeforeUpdate()
  calculateTotals() {
    const lineTotal = this.lineTotal;
    
    // Calculate discount amount based on discount type
    if (this.discountType === DiscountType.PERCENTAGE && this.discountPercent > 0) {
      this.discountAmount = (lineTotal * Number(this.discountPercent)) / 100;
    } else if (this.discountType === DiscountType.AMOUNT) {
      // For fixed amount, use the discountAmount as is
      // Ensure discount doesn't exceed line total
      this.discountAmount = Math.min(Number(this.discountAmount), lineTotal);
    }
    
    // Calculate total amount
    this.totalAmount = lineTotal - Number(this.discountAmount);
  }

  // Helper methods
  updateShippedQuantity(quantity: number): void {
    this.shippedQuantity = Math.min(Number(quantity), Number(this.quantity));
    
    if (this.isFullyShipped) {
      this.status = SalesOrderItemStatus.SHIPPED;
    }
  }

  updateDeliveredQuantity(quantity: number): void {
    this.deliveredQuantity = Math.min(Number(quantity), Number(this.shippedQuantity));
    
    if (this.isFullyDelivered) {
      this.status = SalesOrderItemStatus.DELIVERED;
    }
  }

  cancel(): void {
    this.status = SalesOrderItemStatus.CANCELLED;
  }

  confirm(): void {
    if (this.status === SalesOrderItemStatus.PENDING) {
      this.status = SalesOrderItemStatus.CONFIRMED;
    }
  }

  // Static method to create from product
  static fromProduct(
    product: Product, 
    quantity: number, 
    priceType: 'retail' | 'wholesale' | 'special' = 'retail'
  ): Partial<SalesOrderItem> {
    const unitPrice = product.getPriceByType(priceType);
    
    return {
      productId: product.id,
      productSku: product.barcode,
      productName: product.name,
      productDescription: product.description,
      unit: 'pcs',
      quantity,
      unitPrice,
      unitCost: Number(product.baseCost),
      discountType: DiscountType.PERCENTAGE,
      discountPercent: 0,
      discountAmount: 0,
    };
  }
}