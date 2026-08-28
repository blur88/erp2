import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from './base.entity';
import type { BackupMetadata } from '../../modules/backup/interfaces/backup-metadata.interface';

@Entity('backup_logs')
@Index(['status'])
@Index(['createdAt'])
export class BackupLog extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  filename: string;

  @Column({ type: 'varchar', length: 500 })
  filepath: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'manual',
  })
  backupType: 'manual' | 'scheduled';

  @Column({
    type: 'varchar',
    length: 20,
    default: 'in_progress',
  })
  status: 'in_progress' | 'completed' | 'failed';

  @Column({ type: 'bigint', nullable: true })
  size: number;

  @Column({ type: 'simple-array', default: '' })
  databases: string[];

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @Column({ type: 'varchar', length: 100, default: 'system' })
  createdBy: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: BackupMetadata;

  @Column({ type: 'text', nullable: true })
  error: string;
}
