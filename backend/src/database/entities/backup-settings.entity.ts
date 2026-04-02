import { Entity, Column } from 'typeorm';
import { BaseEntity } from './base.entity';

/**
 * BackupRetentionSettings Entity
 * Stores system-wide backup retention and cleanup settings
 * Singleton pattern - only one active record should exist
 */
@Entity('backup_retention_settings')
export class BackupRetentionSettings extends BaseEntity {
  @Column({ type: 'int', default: 30, comment: 'Number of days to retain backups before auto-cleanup (max 365)' })
  retentionDays: number;

  @Column({ type: 'boolean', default: true, comment: 'Enable automatic backup cleanup' })
  autoCleanupEnabled: boolean;

  @Column({ type: 'varchar', length: 10, default: '02:00', comment: 'Time of day to run cleanup (HH:MM)' })
  cleanupTime: string;

  @Column({ type: 'int', nullable: true, comment: 'Maximum number of backups to keep (null for unlimited)' })
  maximumBackupsToKeep: number | null;

  @Column({ type: 'bigint', nullable: true, comment: 'Maximum total size of all backups in bytes (null for unlimited, max 104857600 bytes = 100MB)' })
  maximumTotalSize: number | null;

  @Column({ type: 'boolean', default: true, comment: 'Only one active settings record should exist' })
  declare isActive: boolean;
}
