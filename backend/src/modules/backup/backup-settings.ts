/**
 * Backup settings (#2112). The only values an administrator can change from the
 * Backup & Restore page. Credentials and paths stay in deployment configuration
 * (backup.config.ts).
 *
 * One validation function guards startup, updates, and stored settings that come
 * back with a restored database. Nothing here reads or writes the database.
 */
export const BACKUP_INTERVAL_OPTIONS = [15, 30] as const;

export interface BackupSettingsValues {
  intervalMinutes: number;
  retentionWindowHours: number;
  retentionDailyCount: number;
  retentionWeeklyCount: number;
  retentionMonthlyCount: number;
}

export const BACKUP_SETTINGS_FIELDS = [
  'intervalMinutes',
  'retentionWindowHours',
  'retentionDailyCount',
  'retentionWeeklyCount',
  'retentionMonthlyCount',
] as const satisfies readonly (keyof BackupSettingsValues)[];

export const BACKUP_SETTINGS_DEFAULTS: Readonly<BackupSettingsValues> = Object.freeze({
  intervalMinutes: 30,
  retentionWindowHours: 24,
  retentionDailyCount: 7,
  retentionWeeklyCount: 4,
  retentionMonthlyCount: 12,
});

/** Inclusive bounds for the retention counts. The interval is limited to BACKUP_INTERVAL_OPTIONS. */
export const BACKUP_RETENTION_BOUNDS: Readonly<Record<Exclude<keyof BackupSettingsValues, 'intervalMinutes'>, { min: number; max: number; label: string }>> = {
  retentionWindowHours: { min: 1, max: 168, label: 'The 24-hour window' },
  retentionDailyCount: { min: 1, max: 365, label: 'Daily count' },
  retentionWeeklyCount: { min: 1, max: 104, label: 'Weekly count' },
  retentionMonthlyCount: { min: 1, max: 120, label: 'Monthly count' },
};

export interface BackupSettingsFieldError {
  field: string;
  message: string;
}

export interface BackupSettingsValidation {
  ok: boolean;
  settings?: BackupSettingsValues;
  errors?: BackupSettingsFieldError[];
}

/**
 * Validates a complete settings value. Missing fields, unknown keys, non-integers
 * and out-of-range numbers are all errors; nothing is coerced or defaulted.
 */
export function validateBackupSettings(input: unknown): BackupSettingsValidation {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: [{ field: 'body', message: 'Backup settings must be an object' }] };
  }
  const record = input as Record<string, unknown>;
  const errors: BackupSettingsFieldError[] = [];

  for (const key of Object.keys(record)) {
    if (!(BACKUP_SETTINGS_FIELDS as readonly string[]).includes(key)) {
      errors.push({ field: key, message: 'Unknown setting' });
    }
  }

  const intervalMinutes = record.intervalMinutes;
  if (!(BACKUP_INTERVAL_OPTIONS as readonly unknown[]).includes(intervalMinutes)) {
    errors.push({ field: 'intervalMinutes', message: 'Interval must be 15 or 30 minutes' });
  }

  for (const field of Object.keys(BACKUP_RETENTION_BOUNDS) as (keyof typeof BACKUP_RETENTION_BOUNDS)[]) {
    const { min, max, label } = BACKUP_RETENTION_BOUNDS[field];
    const value = record[field];
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      errors.push({ field, message: `${label} must be a whole number` });
    } else if (value < min || value > max) {
      errors.push({ field, message: `${label} must be between ${min} and ${max}` });
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    settings: {
      intervalMinutes: record.intervalMinutes as number,
      retentionWindowHours: record.retentionWindowHours as number,
      retentionDailyCount: record.retentionDailyCount as number,
      retentionWeeklyCount: record.retentionWeeklyCount as number,
      retentionMonthlyCount: record.retentionMonthlyCount as number,
    },
  };
}

/**
 * The next scheduled run: the first wall-clock boundary of the interval, in UTC,
 * strictly after `now`. Every allowed interval divides an hour, so the boundaries
 * are whole quarter-hours in any timezone the server uses.
 */
export function nextScheduledRun(now: Date, intervalMinutes: number): Date {
  const step = intervalMinutes * 60_000;
  return new Date(Math.floor(now.getTime() / step) * step + step);
}
