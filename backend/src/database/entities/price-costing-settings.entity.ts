import { Entity, Column } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('price_costing_settings')
export class PriceCostingSettings extends BaseEntity {
  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @Column({ type: 'varchar', length: 50, default: 'AVERAGE' })
  costingMethod: string; // AVERAGE, FIFO, LIFO, STANDARD

  @Column({ type: 'jsonb', nullable: true })
  customerPricingSchemes: any; // JSON object containing pricing scheme configuration
}
