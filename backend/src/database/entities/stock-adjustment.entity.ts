import {
  Entity,
  Column,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import {
  IsString,
  IsOptional,
  IsEnum,
  MaxLength,
  IsUUID,
  IsDecimal,
  Min,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import { User } from './user.entity';
import { Product } from './product.entity';

export enum StockAdjustmentStatus {
  DRAFT = 'draft',
  COMPLETED = 'completed',
  REVERTED = 'reverted',
}

/**
 * Stock Adjustment Header entity
 * Represents a stock adjustment document
 */
@Entity('stock_adjustments')
@Index(['adjustmentNumber'])
@Index(['status'])
@Index(['adjustmentDate'])
export class StockAdjustment extends BaseEntity {
  @Column({
    type: 'varchar',
    length: 50,
    unique: true,
    comment: 'Stock adjustment number (SA-XXXXXX)',
  })
  @IsString()
  @MaxLength(50)
  adjustmentNumber: string;

  @Column({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
    comment: 'Date and time of adjustment',
  })
  adjustmentDate: Date;

  @Column({
    type: 'enum',
    enum: StockAdjustmentStatus,
    default: StockAdjustmentStatus.DRAFT,
    comment: 'Adjustment status',
  })
  @IsEnum(StockAdjustmentStatus)
  status: StockAdjustmentStatus;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Adjustment notes/reason',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @Column({
    type: 'int',
    default: 0,
    comment: 'Number of line items',
  })
  itemCount: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Total adjustment value (absolute sum)',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  totalValue: number;

  // Relationships
  @OneToMany(() => StockAdjustmentItem, (item) => item.stockAdjustment, {
    cascade: true,
  })
  items: StockAdjustmentItem[];

  // Helper methods
  isEditable(): boolean {
    return this.status === StockAdjustmentStatus.DRAFT;
  }

  canComplete(): boolean {
    return this.status === StockAdjustmentStatus.DRAFT;
  }
}

/**
 * Stock Adjustment Line Item entity
 * Represents individual product adjustments within a stock adjustment document
 */
@Entity('stock_adjustment_items')
@Index(['stockAdjustmentId'])
@Index(['productId'])
export class StockAdjustmentItem extends BaseEntity {
  @Column({
    type: 'uuid',
    comment: 'Stock adjustment header ID',
  })
  @IsUUID(4)
  stockAdjustmentId: string;

  @Column({
    type: 'uuid',
    comment: 'Product ID',
  })
  @IsUUID(4)
  productId: string;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Quantity before adjustment',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  oldQuantity: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Quantity after adjustment',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  newQuantity: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Difference (newQuantity - oldQuantity)',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  difference: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    nullable: true,
    comment: 'Unit cost at time of adjustment',
  })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  unitCost?: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    nullable: true,
    comment: 'Total value of this line (absolute difference * unit cost)',
  })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  totalValue?: number;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Reason for this specific item adjustment',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  // Relationships
  @ManyToOne(() => StockAdjustment, (adjustment) => adjustment.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'stockAdjustmentId' })
  stockAdjustment: StockAdjustment;

  @ManyToOne(() => Product, {
    onDelete: 'RESTRICT',
    eager: true,
  })
  @JoinColumn({ name: 'productId' })
  product: Product;

  // Computed properties
  get isIncrease(): boolean {
    return Number(this.difference) > 0;
  }

  get isDecrease(): boolean {
    return Number(this.difference) < 0;
  }

  get absoluteDifference(): number {
    return Math.abs(Number(this.difference));
  }
}
