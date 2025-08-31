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
  IsEnum,
  MaxLength,
  IsDecimal,
  Min,
  IsInt,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import { PurchaseRequisition } from './purchase-requisition.entity';
import { Product } from './product.entity';

export enum PurchaseRequisitionItemStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CONVERTED = 'converted',
}

/**
 * Purchase Requisition Item entity for individual line items in requisitions
 */
@Entity('purchase_requisition_items')
@Index(['purchaseRequisitionId'])
@Index(['productId'])
@Index(['status'])
export class PurchaseRequisitionItem extends BaseEntity {
  @Column({
    type: 'varchar',
    length: 500,
    comment: 'Item description',
  })
  @IsString()
  @MaxLength(500)
  description: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 4,
    comment: 'Requested quantity',
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
    default: 0,
    comment: 'Estimated unit price',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  estimatedUnitPrice: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Estimated total amount for this item',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  estimatedTotal: number;

  @Column({
    type: 'enum',
    enum: PurchaseRequisitionItemStatus,
    default: PurchaseRequisitionItemStatus.PENDING,
    comment: 'Item status',
  })
  @IsEnum(PurchaseRequisitionItemStatus)
  status: PurchaseRequisitionItemStatus;

  @Column({
    type: 'varchar',
    length: 200,
    nullable: true,
    comment: 'Suggested supplier name',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  suggestedSupplier?: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Brand or manufacturer preference',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  preferredBrand?: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Technical specifications',
  })
  @IsOptional()
  @IsString()
  specifications?: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Item-specific notes',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Category or classification',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @Column({
    type: 'int',
    default: 1,
    comment: 'Item priority (1=highest, 5=lowest)',
  })
  @IsInt()
  @Min(1)
  priority: number;

  @Column({
    type: 'json',
    nullable: true,
    comment: 'Additional item metadata',
  })
  @IsOptional()
  metadata?: Record<string, any>;

  // Foreign Keys
  @Column({
    type: 'uuid',
    comment: 'Purchase requisition ID',
  })
  purchaseRequisitionId: string;

  @Column({
    type: 'uuid',
    nullable: true,
    comment: 'Product ID if item is from catalog',
  })
  @IsOptional()
  productId?: string;

  // Relationships
  @ManyToOne(() => PurchaseRequisition, (requisition) => requisition.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'purchaseRequisitionId' })
  purchaseRequisition: PurchaseRequisition;

  @ManyToOne(() => Product, {
    onDelete: 'SET NULL',
    nullable: true,
    eager: true,
  })
  @JoinColumn({ name: 'productId' })
  product?: Product;

  // Computed properties
  get isFromCatalog(): boolean {
    return !!this.productId;
  }

  get formattedDescription(): string {
    if (this.product) {
      return `${this.product.name} (${this.product.sku})`;
    }
    return this.description;
  }

  get unitOfMeasurement(): string {
    if (this.product && this.product.unit) {
      return this.product.unit;
    }
    return this.unit || 'EA';
  }

  // Helper methods
  calculateEstimatedTotal(): void {
    this.estimatedTotal = Number(this.quantity) * Number(this.estimatedUnitPrice);
  }

  approve(): void {
    if (this.status === PurchaseRequisitionItemStatus.PENDING) {
      this.status = PurchaseRequisitionItemStatus.APPROVED;
    }
  }

  reject(): void {
    if (this.status === PurchaseRequisitionItemStatus.PENDING) {
      this.status = PurchaseRequisitionItemStatus.REJECTED;
    }
  }

  convertToPOItem(): void {
    if (this.status === PurchaseRequisitionItemStatus.APPROVED) {
      this.status = PurchaseRequisitionItemStatus.CONVERTED;
    }
  }

  // Update from product catalog
  updateFromProduct(): void {
    if (this.product) {
      this.description = this.product.description || this.product.name;
      this.unit = this.product.unit;
      if (this.estimatedUnitPrice === 0) {
        this.estimatedUnitPrice = Number(this.product.baseCost) || Number(this.product.retailPrice);
      }
      this.calculateEstimatedTotal();
    }
  }
}