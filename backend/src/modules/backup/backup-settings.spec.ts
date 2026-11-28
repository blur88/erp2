import { validateBackupSettings, BACKUP_SETTINGS_DEFAULTS, nextScheduledRun } from './backup-settings';

const VALID = {
  intervalMinutes: 30,
  retentionWindowHours: 24,
  retentionDailyCount: 7,
  retentionWeeklyCount: 4,
  retentionMonthlyCount: 12,
};

describe('validateBackupSettings (#2112)', () => {
  it('accepts the defaults and reports the spec values', () => {
    expect(BACKUP_SETTINGS_DEFAULTS).toEqual(VALID);
    expect(validateBackupSettings(VALID)).toEqual({ ok: true, settings: VALID });
  });

  it.each([15, 30])('accepts the interval %i', (intervalMinutes) => {
    expect(validateBackupSettings({ ...VALID, intervalMinutes }).ok).toBe(true);
  });

  it.each([0, 10, 14, 16, 20, 45, 60, 29.5, -15, null, '30', undefined])(
    'rejects the interval %p with a field error',
    (intervalMinutes) => {
      const result = validateBackupSettings({ ...VALID, intervalMinutes });
      expect(result.ok).toBe(false);
      expect(result.errors).toEqual([expect.objectContaining({ field: 'intervalMinutes' })]);
    },
  );

  it.each([
    ['retentionWindowHours', 1, true],
    ['retentionWindowHours', 168, true],
    ['retentionWindowHours', 0, false],
    ['retentionWindowHours', 169, false],
    ['retentionDailyCount', 1, true],
    ['retentionDailyCount', 365, true],
    ['retentionDailyCount', 0, false],
    ['retentionDailyCount', 366, false],
    ['retentionWeeklyCount', 1, true],
    ['retentionWeeklyCount', 104, true],
    ['retentionWeeklyCount', 105, false],
    ['retentionMonthlyCount', 120, true],
    ['retentionMonthlyCount', 121, false],
    ['retentionMonthlyCount', 0, false],
    ['retentionMonthlyCount', 1.5, false],
    ['retentionMonthlyCount', NaN, false],
  ] as const)('%s = %p is valid: %p', (field, value, valid) => {
    const result = validateBackupSettings({ ...VALID, [field]: value });
    expect(result.ok).toBe(valid);
    if (!valid) expect(result.errors).toEqual([expect.objectContaining({ field })]);
  });

  it('reports every invalid field at once', () => {
    const result = validateBackupSettings({
      intervalMinutes: 5,
      retentionWindowHours: 0,
      retentionDailyCount: 7,
      retentionWeeklyCount: 4,
      retentionMonthlyCount: 999,
    });
    expect(result.ok).toBe(false);
    expect(result.errors?.map((error) => error.field)).toEqual([
      'intervalMinutes',
      'retentionWindowHours',
      'retentionMonthlyCount',
    ]);
  });

  it('rejects a missing body, and unknown keys are errors rather than ignored', () => {
    expect(validateBackupSettings(undefined).ok).toBe(false);
    const result = validateBackupSettings({ ...VALID, backupPath: '/tmp' });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([expect.objectContaining({ field: 'backupPath' })]);
  });
});

describe('nextScheduledRun (#2112)', () => {
  it('runs on the next wall-clock boundary of the interval, in UTC', () => {
    expect(nextScheduledRun(new Date('2026-11-28T10:07:00Z'), 30).toISOString()).toBe('2026-11-28T10:30:00.000Z');
    expect(nextScheduledRun(new Date('2026-11-28T10:31:00Z'), 30).toISOString()).toBe('2026-11-28T11:00:00.000Z');
    expect(nextScheduledRun(new Date('2026-11-28T10:07:00Z'), 15).toISOString()).toBe('2026-11-28T10:15:00.000Z');
  });

  it('moves strictly forward when the clock is exactly on a boundary', () => {
    expect(nextScheduledRun(new Date('2026-11-28T10:30:00.000Z'), 30).toISOString()).toBe('2026-11-28T11:00:00.000Z');
  });
});
