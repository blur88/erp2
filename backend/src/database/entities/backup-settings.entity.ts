import { Check, Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Singleton Backup settings (#2112), following the accounting_settings pattern:
 * a boolean primary key that is always true, enforced by a CHECK constraint.
 * Holds only the interval and retention counts. Credentials and paths stay in
 * deployment configuration. Bounds are enforced by validateBackupSettings, not here.
 */
@Check('CHK_backup_settings_singleton', '"id" = true')
@Entity('backup_settings')
export class BackupSettings {
  @PrimaryColumn({ type: 'boolean', default: true })
  id: boolean;

  @Column({ type: 'integer', default: 30 })
  intervalMinutes: number;

  @Column({ type: 'integer', default: 24 })
  retentionWindowHours: number;

  @Column({ type: 'integer', default: 7 })
  retentionDailyCount: number;

  @Column({ type: 'integer', default: 4 })
  retentionWeeklyCount: number;

  @Column({ type: 'integer', default: 12 })
  retentionMonthlyCount: number;

  @UpdateDateColumn({ type: 'timestamptz', default: () => 'now()' })
  updatedAt: Date;
}
