import { Entity, Column } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('regional_settings')
export class RegionalSettings extends BaseEntity {
  @Column({ type: 'varchar', length: 10, default: 'MYR' })
  currency: string;

  @Column({ type: 'varchar', length: 50, default: 'AVERAGE' })
  costingMethod: string;

  @Column({ type: 'varchar', length: 20, default: 'DD/MM/YYYY' })
  dateFormat: string;

  @Column({ type: 'varchar', length: 10, default: '24h' })
  timeFormat: string;

  @Column({ type: 'varchar', length: 20, default: '1,234.56' })
  numberFormat: string;

  @Column({ type: 'varchar', length: 100, default: 'Asia/Kuala_Lumpur' })
  timezone: string;

  @Column({ type: 'int', default: 10 })
  lowStockThreshold: number;

  @Column({ type: 'int', default: 1 })
  startOfWeek: number;
}
