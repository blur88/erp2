import { Entity, Column } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('price_costing_settings')
export class PriceCostingSettings extends BaseEntity {
  @Column({ type: 'varchar', length: 10, default: 'MYR' })
  currency: string;

  @Column({ type: 'varchar', length: 50, default: 'AVERAGE' })
  costingMethod: string; // AVERAGE, FIFO, LIFO, STANDARD

  @Column({ type: 'varchar', length: 20, default: 'DD/MM/YYYY' })
  dateFormat: string;

  @Column({ type: 'varchar', length: 10, default: '24h' })
  timeFormat: string;

  @Column({ type: 'varchar', length: 20, default: '1,234.56' })
  numberFormat: string;
}
