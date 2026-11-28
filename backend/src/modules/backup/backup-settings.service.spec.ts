import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { BackupSettingsService } from './backup-settings.service';
import { BACKUP_SETTINGS_DEFAULTS, BackupSettingsValues } from './backup-settings';

const actor = { userId: 'admin-1', username: 'admin' };
const CHANGED = { ...BACKUP_SETTINGS_DEFAULTS, intervalMinutes: 15, retentionMonthlyCount: 6 };

/**
 * In-memory stand-in for the singleton row. A transaction works on a copy and
 * commits only when its callback resolves, like PostgreSQL does.
 */
function makeHarness(initial: Record<string, unknown> | null = { id: true, ...BACKUP_SETTINGS_DEFAULTS }) {
  const state = { row: initial ? { ...initial } : null };
  let failNextSave = false;
  const dataSource = {
    transaction: async <T>(work: (manager: unknown) => Promise<T>): Promise<T> => {
      const staged = { row: state.row ? { ...state.row } : null };
      const repo = {
        findOne: async () => (staged.row ? { ...staged.row } : null),
        save: async (values: Record<string, unknown>) => {
          if (failNextSave) {
            failNextSave = false;
            throw new Error('connection reset');
          }
          staged.row = { ...(staged.row ?? {}), ...values };
          return staged.row;
        },
      };
      const result = await work({ getRepository: () => repo });
      state.row = staged.row;
      return result;
    },
    getRepository: () => ({
      findOne: async () => (state.row ? { ...state.row } : null),
    }),
  };
  const auditLog = { log: jest.fn<(...args: unknown[]) => Promise<void>>(async () => undefined) };
  const service = new BackupSettingsService(dataSource as any, auditLog as any);
  return {
    service,
    state,
    auditLog,
    failNextSave: () => {
      failNextSave = true;
    },
  };
}

function stripped(row: Record<string, unknown> | null): BackupSettingsValues | null {
  if (!row) return null;
  const { id: _id, ...values } = row;
  return values as unknown as BackupSettingsValues;
}

describe('BackupSettingsService (#2112)', () => {
  describe('reading stored settings', () => {
    it('reads a valid row as valid', async () => {
      const h = makeHarness();
      await expect(h.service.readStored()).resolves.toEqual({ state: 'valid', settings: BACKUP_SETTINGS_DEFAULTS });
    });

    it('reports a missing row as missing, and never invents defaults', async () => {
      const h = makeHarness(null);
      await expect(h.service.readStored()).resolves.toEqual({ state: 'missing' });
      expect(h.state.row).toBeNull();
    });

    it('reports stored values that fail validation as invalid, with the failing fields', async () => {
      const h = makeHarness({ id: true, ...BACKUP_SETTINGS_DEFAULTS, intervalMinutes: 5 });
      const result = await h.service.readStored();
      expect(result.state).toBe('invalid');
      expect(result.state === 'invalid' && result.errors.map((error) => error.field)).toEqual(['intervalMinutes']);
    });
  });

  describe('updating', () => {
    it('saves a valid update and audits the old and new values with the administrator', async () => {
      const h = makeHarness();
      const saved = await h.service.update(CHANGED, actor);

      expect(saved).toEqual(CHANGED);
      expect(stripped(h.state.row)).toEqual(CHANGED);
      expect(h.auditLog.log).toHaveBeenCalledTimes(1);
      expect(h.auditLog.log).toHaveBeenCalledWith(
        'BACKUP_SETTINGS_UPDATED',
        'BackupSettings',
        expect.any(String),
        expect.objectContaining({
          userId: 'admin-1',
          username: 'admin',
          oldValues: BACKUP_SETTINGS_DEFAULTS,
          newValues: CHANGED,
        }),
      );
      // The singleton has no uuid, so the audit row carries no entityId.
      const options = h.auditLog.log.mock.calls[0][3] as Record<string, unknown>;
      expect(options).not.toHaveProperty('entityId');
    });

    it('rejects an invalid update with 400, keeps the previous row and writes no audit entry', async () => {
      const h = makeHarness();
      const before = { ...h.state.row };

      await expect(h.service.update({ ...CHANGED, intervalMinutes: 20 }, actor)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(h.service.update({ ...CHANGED, intervalMinutes: 20 }, actor)).rejects.toMatchObject({
        response: {
          code: 'BACKUP_SETTINGS_INVALID',
          message: [expect.objectContaining({ field: 'intervalMinutes' })],
        },
      });
      expect(h.state.row).toEqual(before);
      expect(h.auditLog.log).not.toHaveBeenCalled();
    });

    it('keeps the previous row when the write fails, and does not audit', async () => {
      const h = makeHarness();
      const before = { ...h.state.row };
      h.failNextSave();

      await expect(h.service.update(CHANGED, actor)).rejects.toThrow('connection reset');
      expect(h.state.row).toEqual(before);
      expect(h.auditLog.log).not.toHaveBeenCalled();
    });

    it('does not audit a save that changes nothing', async () => {
      const h = makeHarness();
      await h.service.update({ ...BACKUP_SETTINGS_DEFAULTS }, actor);
      expect(h.auditLog.log).not.toHaveBeenCalled();
    });

    it('creates the singleton row when an administrator saves valid settings over a missing row', async () => {
      const h = makeHarness(null);
      await h.service.update(CHANGED, actor);
      expect(stripped(h.state.row)).toEqual(CHANGED);
      expect(h.auditLog.log).toHaveBeenCalledWith(
        'BACKUP_SETTINGS_UPDATED',
        'BackupSettings',
        expect.any(String),
        expect.objectContaining({ oldValues: null, newValues: CHANGED }),
      );
    });
  });
});
