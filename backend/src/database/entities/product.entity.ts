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
  IsOptional,
  IsEnum,
  MaxLength,
  Min,
  IsDecimal,
  IsBoolean,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import { Category } from './category.entity';
import { StockMovement } from './stock-movement.entity';

export enum ProductType {
  GOODS = 'Stocked Product',
  SERVICE = 'Service',
}

/**
 * Product entity - simplified model matching frontend form
 * Contains only essential fields: name, barcode, type, category, pricing, stock, description, notes
 */
@Entity('products')
@Index(['barcode'], { unique: true })
@Index(['name'])
@Index(['categoryId'])
@Index(['type'])
@Index(['isActive'])
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
    nullable: true,
    comment: 'Product barcode - unique product identifier',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcode?: string;

  @Column({
    type: 'enum',
    enum: ProductType,
    default: ProductType.GOODS,
    comment: 'Product type (goods/service)',
  })
  @IsEnum(ProductType)
  type: ProductType;

  @Column({
    type: 'boolean',
    default: true,
    comment: 'Whether the product is active for sales',
  })
  @IsBoolean()
  isActive: boolean;


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
    type: 'jsonb',
    nullable: true,
    default: '{}',
    comment: 'Dynamic pricing tiers from settings - { "Retail": 100.00, "Wholesale": 80.00, "VIP": 75.00 }',
  })
  pricingTiers?: Record<string, number>;

  // Current stock quantity
  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    default: 0,
    comment: 'Current stock quantity',
  })
  @IsDecimal({ decimal_digits: '0,4' })
  stockQuantity: number;

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

  // Order relationships removed to prevent TypeORM relation resolution issues

  // Stock tracking relationships
  @OneToMany(() => StockMovement, (stockMovement) => stockMovement.product, {
    cascade: false,
  })
  stockMovements: StockMovement[];

  // Computed properties
  get isOutOfStock(): boolean {
    return Number(this.stockQuantity) <= 0;
  }

  /**
   * Calculate gross margin for a specific pricing scheme
   */
  getGrossMargin(schemeName: string): number {
    const price = this.getPriceByScheme(schemeName);
    const cost = Number(this.baseCost);
    return cost > 0 && price > 0 ? ((price - cost) / price) * 100 : 0;
  }

  // Helper methods
  adjustStock(quantity: number, type: 'increase' | 'decrease' | 'set'): void {
    switch (type) {
      case 'increase':
        this.stockQuantity = Number(this.stockQuantity) + Number(quantity);
        break;
      case 'decrease':
        this.stockQuantity = Number(this.stockQuantity) - Number(quantity);
        break;
      case 'set':
        this.stockQuantity = Number(quantity);
        break;
    }
  }

  /**
   * Get price for a specific pricing scheme
   * Returns 0 if scheme not found
   */
  getPriceByScheme(schemeName: string): number {
    if (this.pricingTiers && this.pricingTiers[schemeName]) {
      return Number(this.pricingTiers[schemeName]);
    }
    return 0;
  }

  /**
   * Set price for a specific pricing scheme
   */
  setPriceForScheme(schemeName: string, price: number): void {
    if (!this.pricingTiers) {
      this.pricingTiers = {};
    }
    this.pricingTiers[schemeName] = price;
  }
}