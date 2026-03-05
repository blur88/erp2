import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('backup_schedules')
@Index(['isActive'])
export class BackupSchedule extends BaseEntity {
  @Column({ type: 'varchar', length: 100, unique: true })
  name: string;

  @Column({ type: 'varchar', length: 20, default: 'daily' })
  frequency: 'hourly' | 'daily' | 'weekly' | 'monthly';

  @Column({ type: 'varchar', length: 20, nullable: true })
  cronExpression: string;

  @Column({ type: 'varchar', length: 5, default: '02:00' })
  time: string; // HH:MM format

  @Column({ type: 'int', nullable: true })
  dayOfWeek: number; // 0-6 for weekly backups

  @Column({ type: 'int', nullable: true })
  dayOfMonth: number; // 1-31 for monthly backups

  @Column({ type: 'simple-array', default: 'postgresql,redis' })
  databases: string[];

  @Column({ type: 'boolean', default: true })
  includeSettings: boolean;

  @Column({ type: 'int', default: 30 })
  retentionDays: number;

  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastRunAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  nextRunAt: Date;

  @Column({ type: 'varchar', length: 100, default: 'system' })
  createdBy: string;

  @Column({ type: 'jsonb', nullable: true })
  notifications: {
    enabled: boolean;
    email?: string;
    onSuccess?: boolean;
    onFailure?: boolean;
  };
}
