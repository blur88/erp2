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
  IsNumber,
  IsBoolean,
  IsOptional,
  IsEnum,
  MaxLength,
  Min,
  IsDecimal,
  IsInt,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import { Category } from './category.entity';
import { SalesOrderItem } from './sales-order-item.entity';
import { PurchaseOrderItem } from './purchase-order-item.entity';
import { StockMovement } from './stock-movement.entity';
import { StockAdjustment } from './stock-adjustment.entity';

export enum ProductType {
  GOODS = 'goods',
  SERVICE = 'service',
}

export enum ProductStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  DISCONTINUED = 'discontinued',
}

export enum StockStatus {
  IN_STOCK = 'in_stock',
  LOW_STOCK = 'low_stock',
  OUT_OF_STOCK = 'out_of_stock',
}

/**
 * Product entity with multi-level pricing support
 * Supports inventory tracking and comprehensive product information
 * Optimized for ERP operations with proper indexing
 */
@Entity('products')
@Index(['barcode'], { unique: true })
@Index(['name'])
@Index(['categoryId'])
@Index(['status', 'isActive'])
@Index(['type'])
@Index(['stockStatus'])
@Index(['reorderLevel'])
export class Product extends BaseEntity {

  @Column({
    type: 'varchar',
    length: 200,
    comment: 'Product name',
  })
  @IsString()
  @MaxLength(200)
  name: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Detailed product description',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @Column({
    type: 'varchar',
    length: 100,
    unique: true,
    comment: 'Product barcode - unique product identifier',
  })
  @IsString()
  @MaxLength(100)
  barcode: string;

  @Column({
    type: 'enum',
    enum: ProductType,
    default: ProductType.GOODS,
    comment: 'Product type (goods/service)',
  })
  @IsEnum(ProductType)
  type: ProductType;

  @Column({
    type: 'enum',
    enum: ProductStatus,
    default: ProductStatus.ACTIVE,
    comment: 'Product status',
  })
  @IsEnum(ProductStatus)
  status: ProductStatus;

  @Column({
    type: 'boolean',
    default: true,
    comment: 'Whether the product is active for sales',
  })
  @IsBoolean()
  isActive: boolean;

  @Column({
    type: 'varchar',
    length: 20,
    comment: 'Unit of measurement (pcs, kg, liter, etc.)',
  })
  @IsString()
  @MaxLength(20)
  unit: string;

  // Pricing - Multi-level pricing support
  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Base cost price',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  baseCost: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Retail selling price',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  retailPrice: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Wholesale selling price',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  wholesalePrice: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    comment: 'Special/promotional selling price',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  specialPrice: number;

  // Inventory Management
  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Current stock quantity',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  stockQuantity: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Reserved stock quantity (pending orders)',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  reservedQuantity: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Minimum stock level for reorder alerts',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  reorderLevel: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Optimal stock quantity to maintain',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  optimalStockLevel: number;

  @Column({
    type: 'enum',
    enum: StockStatus,
    default: StockStatus.IN_STOCK,
    comment: 'Current stock status',
  })
  @IsEnum(StockStatus)
  stockStatus: StockStatus;

  // Physical Properties
  @Column({
    type: 'decimal',
    precision: 10,
    scale: 4,
    nullable: true,
    comment: 'Product weight in kg',
  })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  weight?: number;

  @Column({
    type: 'json',
    nullable: true,
    comment: 'Product dimensions (length, width, height in cm)',
  })
  @IsOptional()
  dimensions?: {
    length?: number;
    width?: number;
    height?: number;
  };

  // Additional Information
  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Product brand',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string;

  @Column({
    type: 'varchar',
    length: 100,
    nullable: true,
    comment: 'Product model',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  model?: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: 'Product image URL or path',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  imageUrl?: string;

  @Column({
    type: 'json',
    nullable: true,
    comment: 'Additional product images',
  })
  @IsOptional()
  additionalImages?: string[];

  @Column({
    type: 'json',
    nullable: true,
    comment: 'Custom product attributes/specifications',
  })
  @IsOptional()
  attributes?: Record<string, any>;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Internal notes about the product',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  // Category relationship
  @Column({
    type: 'uuid',
    comment: 'Product category ID',
  })
  categoryId: string;

  @ManyToOne(() => Category, (category) => category.products, {
    onDelete: 'RESTRICT',
    eager: true,
  })
  @JoinColumn({ name: 'categoryId' })
  category: Category;

  // Order relationships
  @OneToMany(() => SalesOrderItem, (salesOrderItem) => salesOrderItem.product, {
    cascade: false,
  })
  salesOrderItems: SalesOrderItem[];

  @OneToMany(() => PurchaseOrderItem, (purchaseOrderItem) => purchaseOrderItem.product, {
    cascade: false,
  })
  purchaseOrderItems: PurchaseOrderItem[];

  // Stock tracking relationships
  @OneToMany(() => StockMovement, (stockMovement) => stockMovement.product, {
    cascade: false,
  })
  stockMovements: StockMovement[];

  @OneToMany(() => StockAdjustment, (stockAdjustment) => stockAdjustment.product, {
    cascade: false,
  })
  stockAdjustments: StockAdjustment[];

  // Computed properties
  get availableQuantity(): number {
    return Number(this.stockQuantity) - Number(this.reservedQuantity);
  }

  get isLowStock(): boolean {
    return Number(this.stockQuantity) <= Number(this.reorderLevel);
  }

  get isOutOfStock(): boolean {
    return Number(this.availableQuantity) <= 0;
  }

  get grossMarginRetail(): number {
    const retail = Number(this.retailPrice);
    const cost = Number(this.baseCost);
    return cost > 0 ? ((retail - cost) / retail) * 100 : 0;
  }

  get grossMarginWholesale(): number {
    const wholesale = Number(this.wholesalePrice);
    const cost = Number(this.baseCost);
    return cost > 0 ? ((wholesale - cost) / wholesale) * 100 : 0;
  }

  get grossMarginSpecial(): number {
    const special = Number(this.specialPrice);
    const cost = Number(this.baseCost);
    return cost > 0 ? ((special - cost) / special) * 100 : 0;
  }

  // Helper methods
  updateStockStatus(): void {
    if (this.isOutOfStock) {
      this.stockStatus = StockStatus.OUT_OF_STOCK;
    } else if (this.isLowStock) {
      this.stockStatus = StockStatus.LOW_STOCK;
    } else {
      this.stockStatus = StockStatus.IN_STOCK;
    }
  }

  adjustStock(quantity: number, type: 'increase' | 'decrease' | 'set'): void {
    switch (type) {
      case 'increase':
        this.stockQuantity = Number(this.stockQuantity) + Number(quantity);
        break;
      case 'decrease':
        this.stockQuantity = Math.max(0, Number(this.stockQuantity) - Number(quantity));
        break;
      case 'set':
        this.stockQuantity = Math.max(0, Number(quantity));
        break;
    }
    this.updateStockStatus();
  }

  reserveStock(quantity: number): boolean {
    if (this.availableQuantity >= quantity) {
      this.reservedQuantity = Number(this.reservedQuantity) + Number(quantity);
      this.updateStockStatus();
      return true;
    }
    return false;
  }

  releaseReservedStock(quantity: number): void {
    this.reservedQuantity = Math.max(0, Number(this.reservedQuantity) - Number(quantity));
    this.updateStockStatus();
  }

  getPriceByType(priceType: 'retail' | 'wholesale' | 'special'): number {
    switch (priceType) {
      case 'retail':
        return Number(this.retailPrice);
      case 'wholesale':
        return Number(this.wholesalePrice);
      case 'special':
        return Number(this.specialPrice);
      default:
        return Number(this.retailPrice);
    }
  }
}