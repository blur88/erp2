import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { BaseEntity } from './base.entity';
import { PriceList } from './price-list.entity';
import { Product } from './product.entity';

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
  priceListId: string;

  @Column({ type: 'uuid' })
  productId: string;

  @Column({ type: 'decimal', precision: 12, scale: 4 })
  price: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  costBasis: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  marginPercent: number;

  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  minimumPrice: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  effectiveFrom: Date;

  @Column({ type: 'timestamp', nullable: true })
  effectiveTo: Date;

  // Relationships
  @ManyToOne(() => PriceList, (priceList) => priceList.items, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'priceListId' })
  priceList: PriceList;

  @ManyToOne(() => Product, (product) => product.priceListItems, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'productId' })
  product: Product;
}
