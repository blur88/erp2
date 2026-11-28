import { jest } from '@jest/globals';
import { Logger } from '@nestjs/common';
import { completeHeartbeat, HEARTBEAT_PRIMARY_URL, HEARTBEAT_SECONDARY_URL, Harness, makeHarness, makeReadyHarness, waitForIdle } from './backup-test-fixtures';

const actor = { kind: 'manual' as const, userId: 'admin-1', username: 'admin' };
const PRIMARY_NAME = 'BACKUP_HEARTBEAT_URL_PRIMARY';
const SECONDARY_NAME = 'BACKUP_HEARTBEAT_URL_SECONDARY';
const invalidSettings = {
  state: 'invalid' as const,
  errors: [{ field: 'intervalMinutes', message: 'Interval must be 15 or 30 minutes' }],
  values: { intervalMinutes: 20 },
};

describe('Backup heartbeats (#2115)', () => {
  let h: Harness;

  afterEach(() => {
    h?.cleanup();
    jest.restoreAllMocks();
  });

  describe('when a ping is sent', () => {
    beforeEach(async () => {
      h = await makeReadyHarness();
    });

    it('pings each configured URL exactly once per new Verified Backup, and nothing else', async () => {
      await h.service.start(actor);
      await waitForIdle(h.service);

      expect(h.service.getStatus().lastAttempt?.result).toBe('succeeded');
      expect(h.pings).toHaveBeenCalledTimes(2);
      const urls = h.pings.mock.calls.map((call) => call[0]);
      expect(urls.sort()).toEqual([HEARTBEAT_PRIMARY_URL, HEARTBEAT_SECONDARY_URL].sort());
    });

    it('pings only after the manifest is confirmed in storage', async () => {
      const manifestVisibleAtPing: boolean[] = [];
      h.pings.mockImplementation(async () => {
        manifestVisibleAtPing.push([...h.client.objects.keys()].some((key) => key.endsWith('manifest.json')));
        return 200;
      });
      await h.service.start(actor);
      await waitForIdle(h.service);
      expect(manifestVisibleAtPing).toEqual([true, true]);
    });

    it('sends no /start or /fail signal: each request is the bare configured URL', async () => {
      await h.service.start(actor);
      await waitForIdle(h.service);
      for (const [url] of h.pings.mock.calls) {
        expect(url).toMatch(/^https:\/\/hc\.test\/(primary|secondary)-check-uuid$/);
      }
    });

    it('records the sent heartbeat against its Recovery point, without the URL', async () => {
      await h.service.start(actor);
      await waitForIdle(h.service);
      const status = h.service.getStatus();
      expect(status.heartbeat.lastPing).toMatchObject({
        recoveryPoint: status.lastAttempt?.recoveryPoint,
        result: 'sent',
        message: null,
      });
      expect(JSON.stringify(status)).not.toContain('hc.test');
    });
  });

  describe('when no ping is sent', () => {
    const failures: Array<{ step: string; arrange: (x: Harness) => void }> = [
      {
        step: 'version-check',
        arrange: (x) => x.postgresClient.check.mockResolvedValue({ state: 'mismatch', clientMajor: 18, serverMajor: 19 } as any),
      },
      { step: 'dump', arrange: (x) => x.runner.fail('pg_dump', 1) },
      { step: 'globals', arrange: (x) => x.runner.fail('pg_dumpall', 1) },
      { step: 'uploads-archive', arrange: (x) => x.runner.fail('tar-uploads', 2) },
      { step: 'checks', arrange: (x) => x.runner.fail('pg_restore', 1) },
      { step: 'encrypt', arrange: (x) => x.runner.fail('age', 1) },
      {
        step: 'upload',
        arrange: (x) => {
          x.client.hook = (operation, key) => {
            if (operation === 'put' && key.endsWith('backup.tar.age')) throw new Error('network reset');
          };
        },
      },
      { step: 'read-back', arrange: (x) => { x.client.corruptReads = true; } },
      {
        step: 'manifest',
        arrange: (x) => {
          x.client.hook = (operation, key) => {
            if (operation === 'put' && key.endsWith('manifest.json')) throw new Error('connection dropped');
          };
        },
      },
    ];

    it.each(failures)('does not ping a Backup that fails at $step', async ({ step, arrange }) => {
      h = await makeReadyHarness();
      arrange(h);
      await h.service.start(actor);
      await waitForIdle(h.service);
      expect(h.service.getStatus().lastAttempt).toMatchObject({ result: 'failed', failedStep: step });
      expect(h.pings).not.toHaveBeenCalled();
    });

    it('does not ping a repeated Recovery point, which fails at upload and publishes nothing new', async () => {
      h = await makeReadyHarness({ now: () => new Date('2026-11-28T10:15:00.123Z') });
      await h.service.start(actor);
      await waitForIdle(h.service);
      expect(h.pings).toHaveBeenCalledTimes(2);

      await h.service.start(actor);
      await waitForIdle(h.service);
      expect(h.service.getStatus().lastAttempt).toMatchObject({ result: 'failed', failedStep: 'upload' });
      expect(h.pings).toHaveBeenCalledTimes(2);
    });

    it('does not ping a PostgreSQL version mismatch', async () => {
      h = await makeReadyHarness({ versionState: 'mismatch' });
      await h.service.start(actor);
      await waitForIdle(h.service);
      expect(h.service.getStatus().lastAttempt).toMatchObject({ result: 'failed', failedStep: 'version-check' });
      expect(h.pings).not.toHaveBeenCalled();
    });

    it('does not ping an unreleased Backup in production, which still succeeds', async () => {
      h = await makeReadyHarness({ release: { version: 'unreleased', status: 'misconfigured', configurationError: 'APP_VERSION missing' } });
      await h.service.start(actor);
      await waitForIdle(h.service);
      expect(h.service.getStatus().lastAttempt?.result).toBe('succeeded');
      expect(h.pings).not.toHaveBeenCalled();
      expect(h.service.getStatus().heartbeat.lastPing).toBeNull();
    });

    it('pings an unreleased Backup outside production', async () => {
      h = await makeReadyHarness({ release: { version: 'unreleased', status: 'development', configurationError: null } });
      await h.service.start(actor);
      await waitForIdle(h.service);
      expect(h.pings).toHaveBeenCalledTimes(2);
    });

    it('does not ping a manual Backup while stored settings are invalid, and the Backup still succeeds', async () => {
      h = await makeReadyHarness({ stored: invalidSettings as any });
      await h.service.start(actor);
      await waitForIdle(h.service);
      expect(h.service.getStatus().lastAttempt?.result).toBe('succeeded');
      expect(h.pings).not.toHaveBeenCalled();
    });

    it('does not ping when stored settings are missing', async () => {
      h = await makeReadyHarness({ stored: { state: 'missing' } });
      await h.service.start(actor);
      await waitForIdle(h.service);
      expect(h.service.getStatus().lastAttempt?.result).toBe('succeeded');
      expect(h.pings).not.toHaveBeenCalled();
    });

    it('does not ping when the stored settings cannot be read', async () => {
      h = await makeReadyHarness();
      h.settings.readStored.mockRejectedValueOnce(new Error('connection lost'));
      await h.service.start(actor);
      await waitForIdle(h.service);
      expect(h.service.getStatus().lastAttempt?.result).toBe('succeeded');
      expect(h.pings).not.toHaveBeenCalled();
    });

    it('does not ping when no heartbeat URL is configured, and reports the names', async () => {
      h = await makeReadyHarness({
        heartbeat: { urls: [], missing: [PRIMARY_NAME, SECONDARY_NAME], invalid: [] },
      });
      await h.service.start(actor);
      await waitForIdle(h.service);
      expect(h.service.getStatus().lastAttempt?.result).toBe('succeeded');
      expect(h.pings).not.toHaveBeenCalled();
      expect(h.service.getStatus().heartbeat).toMatchObject({
        urlCount: 0,
        missingSettings: [PRIMARY_NAME, SECONDARY_NAME],
        lastPing: null,
      });
    });
  });

  describe('a failed ping', () => {
    beforeEach(async () => {
      h = await makeReadyHarness();
    });

    it('is a monitoring problem, not a failed Backup', async () => {
      h.pings.mockResolvedValue(500);
      await h.service.start(actor);
      await waitForIdle(h.service);

      const status = h.service.getStatus();
      expect(status.lastAttempt).toMatchObject({ result: 'succeeded', failedStep: null });
      expect(status.heartbeat.lastPing).toMatchObject({ result: 'failed' });
      const listing = await h.service.listBackups();
      expect(listing.state === 'ok' && listing.backups).toHaveLength(1);
    });

    it('names the failing heartbeat by its variable and the HTTP status, never by URL', async () => {
      h.pings.mockResolvedValue(503);
      await h.service.start(actor);
      await waitForIdle(h.service);
      const message = h.service.getStatus().heartbeat.lastPing?.message ?? '';
      expect(message).toContain(PRIMARY_NAME);
      expect(message).toContain('HTTP 503');
      expect(JSON.stringify(h.service.getStatus())).not.toContain('hc.test');
      expect(message).not.toContain('hc.test');
    });

    it('reports a network error by its error name only', async () => {
      h.pings.mockRejectedValue(Object.assign(new TypeError('fetch failed'), { name: 'TypeError' }));
      await h.service.start(actor);
      await waitForIdle(h.service);
      const lastPing = h.service.getStatus().heartbeat.lastPing;
      expect(lastPing?.result).toBe('failed');
      expect(lastPing?.message).toContain('TypeError');
      expect(lastPing?.message).not.toContain('fetch failed');
    });

    it('lists only the heartbeat that failed when the other succeeded', async () => {
      h.pings.mockImplementation(async (url: unknown) => (url === HEARTBEAT_SECONDARY_URL ? 500 : 200));
      await h.service.start(actor);
      await waitForIdle(h.service);
      const lastPing = h.service.getStatus().heartbeat.lastPing;
      expect(lastPing?.result).toBe('failed');
      expect(lastPing?.message).toContain(SECONDARY_NAME);
      expect(lastPing?.message).not.toContain(PRIMARY_NAME);
    });

    it('is written to the log as a warning, without the URL', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      h.pings.mockResolvedValue(500);
      await h.service.start(actor);
      await waitForIdle(h.service);
      const messages = warn.mock.calls.map((call) => String(call[0]));
      expect(messages.some((m) => m.includes(PRIMARY_NAME) && m.includes('HTTP 500'))).toBe(true);
      expect(messages.join('\n')).not.toContain('hc.test');
    });

    it('times out a ping that never answers, without holding the lock', async () => {
      h.pings.mockImplementation((_url: unknown, signal: unknown) => new Promise((_resolve, reject) => {
        (signal as AbortSignal).addEventListener('abort', () => reject(new Error('aborted')));
      }));
      h.options.heartbeatTimeoutMs = 30;
      h.service = new (h.service.constructor as any)(
        h.options,
        h.service['dataSource'],
        h.postgresClient as any,
        h.auditLog as any,
        h.settings as any,
      );
      await h.service.prepareStartup();
      await h.service.start(actor);
      await waitForIdle(h.service, 3000);
      expect(h.service.getStatus().lastAttempt?.result).toBe('succeeded');
      expect(h.service.getStatus().heartbeat.lastPing?.result).toBe('failed');
      expect(h.service.getStatus().running).toBeNull();
    });
  });

  describe('a Backup with a complete configuration', () => {
    it('has no configuration warning when both URLs are set', async () => {
      h = await makeReadyHarness({ heartbeat: completeHeartbeat() });
      expect(h.service.getStatus().heartbeat).toMatchObject({ urlCount: 2, missingSettings: [], lastPing: null });
    });
  });
});

