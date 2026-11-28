import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BackupSettings } from '../../database/entities/backup-settings.entity';
import { AuditLogService } from '../audit-logs/services/audit-log.service';
import {
  BACKUP_SETTINGS_FIELDS,
  BackupSettingsFieldError,
  BackupSettingsValues,
  validateBackupSettings,
} from './backup-settings';

export type StoredBackupSettings =
  | { state: 'valid'; settings: BackupSettingsValues }
  | { state: 'missing' }
  | { state: 'invalid'; errors: BackupSettingsFieldError[] };

/**
 * Persists the singleton `backup_settings` row (#2112). Validation, the write and
 * the audit entry live here; scheduling lives in BackupScheduleService.
 */
@Injectable()
export class BackupSettingsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly auditLog: AuditLogService,
  ) {}

  /** Reads the stored row through the same validation as updates. Never resets anything. */
  async readStored(): Promise<StoredBackupSettings> {
    const row = await this.dataSource.getRepository(BackupSettings).findOne({ where: { id: true } });
    if (!row) return { state: 'missing' };
    const result = validateBackupSettings(pickSettings(row));
    if (!result.ok || !result.settings) return { state: 'invalid', errors: result.errors ?? [] };
    return { state: 'valid', settings: result.settings };
  }

  /**
   * Validates before anything is written. A rejected update throws 400 and leaves
   * the previous row alone. A successful update that changes a value is audited
   * with the old and new values. A failed write is not audited.
   */
  async update(input: unknown, actor: { userId: string; username?: string }): Promise<BackupSettingsValues> {
    const validation = validateBackupSettings(input);
    if (!validation.ok || !validation.settings) {
      // The global error filter keeps only `message` and `code`, so the field errors travel as `message`.
      throw new BadRequestException({
        code: 'BACKUP_SETTINGS_INVALID',
        message: validation.errors ?? [],
      });
    }
    const next = validation.settings;

    const { before, after } = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(BackupSettings);
      const existing = await repository.findOne({ where: { id: true }, lock: { mode: 'pessimistic_write' } });
      await repository.save({ id: true, ...next });
      return { before: existing ? pickSettings(existing) : null, after: next };
    });

    if (!sameSettings(before, after)) {
      await this.auditLog.log('BACKUP_SETTINGS_UPDATED', 'BackupSettings', 'Backup settings changed', {
        userId: actor.userId,
        username: actor.username,
        oldValues: before,
        newValues: after,
      });
    }
    return after;
  }
}

function pickSettings(row: Partial<BackupSettings>): Record<string, unknown> {
  const picked: Record<string, unknown> = {};
  for (const field of BACKUP_SETTINGS_FIELDS) picked[field] = row[field];
  return picked;
}

function sameSettings(before: Record<string, unknown> | null, after: BackupSettingsValues): boolean {
  if (!before) return false;
  return BACKUP_SETTINGS_FIELDS.every((field) => before[field] === after[field]);
}
