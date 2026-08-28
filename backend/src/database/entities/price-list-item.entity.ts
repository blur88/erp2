import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import {
  IsUUID,
  IsNumber,
  IsBoolean,
  IsOptional,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import type { PriceList } from './price-list.entity';
import type { Product } from './product.entity';

/**
 * PriceListItem Entity
 * Product-specific prices per price list (replaces Product.pricingTiers JSONB)
 */
@Entity('price_list_items')
@Index(['priceListId'])
@Index(['productId'])
@Unique(['priceListId', 'productId'])
export class PriceListItem extends BaseEntity {
  @Column({ type: 'uuid' })
  @IsUUID()
  priceListId: string;

  @Column({ type: 'uuid' })
  @IsUUID()
  productId: string;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  @IsNumber()
  price: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  @IsNumber()
  @IsOptional()
  costBasis: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  @IsNumber()
  @IsOptional()
  marginPercent: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  @IsNumber()
  @IsOptional()
  minimumPrice: number;

  @Column({ type: 'boolean', default: true })
  @IsBoolean()
  @IsOptional()
  declare isActive: boolean;

  @Column({ type: 'date', nullable: true })
  @IsOptional()
  effectiveFrom: string;

  @Column({ type: 'date', nullable: true })
  @IsOptional()
  effectiveTo: string;

  // Relationships
  @ManyToOne('PriceList', 'items', {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'priceListId' })
  priceList: PriceList;

  @ManyToOne('Product', 'priceListItems', {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'productId' })
  product: Product;

  constructor() {
    super();
    this.isActive = true;
  }
}
