import {
  Entity,
  Column,
  Index,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from './base.entity';
import { PriceListItem } from './price-list-item.entity';
import { Customer } from './customer.entity';

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
  code: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  effectiveFrom: Date;

  @Column({ type: 'timestamp', nullable: true })
  effectiveTo: Date;

  @Column({ type: 'int', default: 0 })
  priority: number;

  // Relationships
  @OneToMany(() => PriceListItem, (item) => item.priceList, {
    cascade: true,
  })
  items: PriceListItem[];

  @OneToMany(() => Customer, (customer) => customer.priceList)
  customers: Customer[];
}
