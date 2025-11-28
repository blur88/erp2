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
    type: 'decimal',
    precision: 15,
    scale: 4,
    nullable: true,
    comment: 'Retail selling price (deprecated - use pricingTiers)',
  })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  retailPrice?: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    nullable: true,
    comment: 'Wholesale selling price (deprecated - use pricingTiers)',
  })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  wholesalePrice?: number;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 4,
    nullable: true,
    comment: 'Special/promotional selling price (deprecated - use pricingTiers)',
  })
  @IsOptional()
  @IsDecimal({ decimal_digits: '0,4' })
  @Min(0)
  specialPrice?: number;

  @Column({
    type: 'jsonb',
    nullable: true,
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

  get grossMarginRetail(): number {
    const retail = Number(this.retailPrice || 0);
    const cost = Number(this.baseCost);
    return cost > 0 && retail > 0 ? ((retail - cost) / retail) * 100 : 0;
  }

  get grossMarginWholesale(): number {
    const wholesale = Number(this.wholesalePrice || 0);
    const cost = Number(this.baseCost);
    return cost > 0 && wholesale > 0 ? ((wholesale - cost) / wholesale) * 100 : 0;
  }

  get grossMarginSpecial(): number {
    const special = Number(this.specialPrice || 0);
    const cost = Number(this.baseCost);
    return cost > 0 && special > 0 ? ((special - cost) / special) * 100 : 0;
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

  getPriceByType(priceType: 'retail' | 'wholesale' | 'special'): number {
    switch (priceType) {
      case 'retail':
        return Number(this.retailPrice || 0);
      case 'wholesale':
        return Number(this.wholesalePrice || 0);
      case 'special':
        return Number(this.specialPrice || 0);
      default:
        return Number(this.retailPrice || 0);
    }
  }

  /**
   * Get price for a specific pricing scheme (supports dynamic schemes)
   * Falls back to legacy fields if pricingTiers not available
   */
  getPriceByScheme(schemeName: string): number {
    // First try to get from dynamic pricing tiers
    if (this.pricingTiers && this.pricingTiers[schemeName]) {
      return Number(this.pricingTiers[schemeName]);
    }

    // Fallback to legacy fields for backward compatibility
    const lowerScheme = schemeName.toLowerCase();
    if (lowerScheme === 'retail') {
      return Number(this.retailPrice || 0);
    } else if (lowerScheme === 'wholesale') {
      return Number(this.wholesalePrice || 0);
    } else if (lowerScheme === 'special') {
      return Number(this.specialPrice || 0);
    }

    // Default to retail price if scheme not found
    return Number(this.retailPrice || 0);
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