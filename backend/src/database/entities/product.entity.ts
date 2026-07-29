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
import { PriceListItem } from './price-list-item.entity';

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
// Trigram indexes for fuzzy search (#960), created by migration 1785500000000.
// synchronize:false keeps them in metadata so the schema builder won't drop them;
// IndexOptions omits the field, but the decorator and IndexMetadata both honour it.
// Do NOT replace this with @Index({ type: 'GIN' }): TypeORM can express the index
// type but not the gin_trgm_ops operator class, so it would emit USING gin ("name")
// and silently stop accelerating the % operator.
@Index('idx_products_name_trgm', ['name'], { synchronize: false } as any)
@Index('idx_products_barcode_trgm', ['barcode'], { synchronize: false } as any)
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
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: 'URL-friendly identifier derived from name',
  })
  @Index({ unique: true })
  slug: string;

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
  declare isActive: boolean;


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

  // Price list relationships (new normalized pricing model)
  @OneToMany(() => PriceListItem, (item) => item.product, {
    cascade: false,
  })
  priceListItems: PriceListItem[];

  // Computed properties
  get isOutOfStock(): boolean {
    return Number(this.stockQuantity) <= 0;
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

}
