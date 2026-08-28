import {
  Entity,
  Column,
  Index,
  OneToMany,
} from 'typeorm';
import {
  IsString,
  IsBoolean,
  IsOptional,
  IsNumber,
} from 'class-validator';
import { BaseEntity } from './base.entity';
import type { PriceListItem } from './price-list-item.entity';
import type { Customer } from './customer.entity';

/**
 * PriceList Entity
 * Master table for pricing schemes (replaces JSONB customerPricingSchemes)
 */
@Entity('price_lists')
@Index(['code'])
@Index(['isActive'])
@Index(['isDefault'])
export class PriceList extends BaseEntity {
  @Column({ type: 'varchar', length: 50, unique: true })
  @IsString()
  code: string;

  @Column({ type: 'varchar', length: 100 })
  @IsString()
  name: string;

  @Column({ type: 'text', nullable: true })
  @IsString()
  @IsOptional()
  description: string;

  @Column({ type: 'boolean', default: false })
  @IsBoolean()
  @IsOptional()
  isDefault: boolean;

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

  @Column({ type: 'int', default: 0 })
  @IsNumber()
  @IsOptional()
  priority: number;

  // Relationships
  @OneToMany('PriceListItem', 'priceList', {
    cascade: true,
  })
  items: PriceListItem[];

  @OneToMany('Customer', 'priceList')
  customers: Customer[];

  constructor() {
    super();
    this.isDefault = false;
    this.isActive = true;
  }
}
