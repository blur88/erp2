import { jest } from '@jest/globals';
import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AGE_RECIPIENT, DB_PASSWORD, Harness, makeHarness, makeReadyHarness, S3_SECRET, waitForIdle } from './backup-test-fixtures';
import { buildManifest, archiveKeyFor, manifestKeyFor } from './backup-manifest';
import { BACKUP_TIMEOUT_MS } from './backup.types';

const actor = { userId: 'admin-1', username: 'admin' };

describe('BackupService (#2111)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await makeReadyHarness();
  });

  afterEach(() => {
    h.cleanup();
    jest.restoreAllMocks();
  });

  /** Seeds a complete Backup directly in the in-memory bucket. */
  async function seedBackup(recoveryPoint: string, archive = Buffer.from('ciphertext')): Promise<void> {
    const { createHash } = await import('node:crypto');
    const manifest = buildManifest({
      recoveryPoint,
      release: '1.2.3',
      serverMajor: 19,
      clientMajor: 19,
      archiveSize: archive.length,
      archiveSha256: createHash('sha256').update(archive).digest('hex'),
      ageRecipient: AGE_RECIPIENT,
    });
    h.client.objects.set(archiveKeyFor(recoveryPoint), archive);
    h.client.objects.set(manifestKeyFor(recoveryPoint), Buffer.from(JSON.stringify(manifest)));
  }

  describe('start and lock', () => {
    it('rejects an overlapping start with 409 and does not audit the rejected request', async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      h.postgresClient.check.mockImplementation(async () => {
        await gate;
        return { state: 'compatible', clientMajor: 19, serverMajor: 19 };
      });
      await h.service.start(actor);
      await expect(h.service.start(actor)).rejects.toBeInstanceOf(ConflictException);
      expect(h.auditLog.log).toHaveBeenCalledTimes(1);
      expect(h.auditLog.log).toHaveBeenCalledWith(
        'BACKUP_INITIATED',
        'Backup',
        expect.any(String),
        expect.objectContaining({ userId: 'admin-1' }),
      );
      release();
      await waitForIdle(h.service);
    });

    it('does not let an audit failure block an accepted Backup', async () => {
      h.auditLog.log.mockRejectedValueOnce(new Error('audit table unavailable'));
      await expect(h.service.start(actor)).resolves.toMatchObject({ recoveryPoint: expect.any(String) });
      await waitForIdle(h.service);
      expect(h.service.getStatus().lastAttempt?.result).toBe('succeeded');
    });

    it('refuses to start when the deployment configuration is incomplete', async () => {
      h.options.config = { configured: false, config: null, missing: ['BACKUP_S3_BUCKET'], invalid: [] };
      await expect(h.service.start(actor)).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(h.service.getStatus().missingSettings).toEqual(['BACKUP_S3_BUCKET']);
    });
  });

  describe('a successful Backup', () => {
    it('publishes exactly two objects, with the manifest uploaded last, and lists it', async () => {
      await h.service.start(actor);
      await waitForIdle(h.service);

      expect(h.service.getStatus().lastAttempt).toMatchObject({ result: 'succeeded', failedStep: null });
      const keys = [...h.client.objects.keys()].sort();
      expect(keys).toHaveLength(2);
      expect(keys[0]).toMatch(/^backups\/\d{8}T\d{9}Z\/backup\.tar\.age$/);
      expect(keys[1]).toMatch(/^backups\/\d{8}T\d{9}Z\/manifest\.json$/);
      expect(h.client.putOrder[h.client.putOrder.length - 1]).toMatch(/manifest\.json$/);

      const manifestKey = keys.find((key) => key.endsWith('manifest.json'))!;
      const manifest = JSON.parse(h.client.objects.get(manifestKey)!.toString('utf8'));
      expect(Object.keys(manifest).sort()).toEqual(
        ['age_recipient_fingerprint', 'archive', 'checks', 'format_version', 'postgres', 'recovery_point', 'release'].sort(),
      );
      expect(manifest).toMatchObject({
        format_version: 1,
        release: '1.2.3',
        postgres: { server_major: 19, client_major: 19 },
        checks: { decryption: 'not verified' },
      });
      const archiveKey = keys.find((key) => key.endsWith('backup.tar.age'))!;
      expect(manifest.archive.size).toBe(h.client.objects.get(archiveKey)!.length);

      const manifestText = h.client.objects.get(manifestKey)!.toString('utf8');
      expect(manifestText).not.toContain(S3_SECRET);
      expect(manifestText).not.toContain(DB_PASSWORD);

      const listing = await h.service.listBackups();
      expect(listing).toMatchObject({ state: 'ok', malformed: [] });
      expect(listing.state === 'ok' && listing.backups).toHaveLength(1);
    });

    it('checks the version once per attempt, through the shared PostgreSQL client check', async () => {
      await h.service.start(actor);
      await waitForIdle(h.service);
      expect(h.postgresClient.check).toHaveBeenCalledTimes(1);
    });

    it('records an unreleased Backup and keeps it', async () => {
      h = await makeReadyHarness({ release: { version: 'unreleased', status: 'development', configurationError: null } });
      await h.service.start(actor);
      await waitForIdle(h.service);
      expect(h.service.getStatus().lastAttempt?.result).toBe('succeeded');
      const listing = await h.service.listBackups();
      expect(listing.state === 'ok' && listing.backups[0].release).toBe('unreleased');
    });

    it('never overwrites an existing prefix', async () => {
      h = await makeReadyHarness({ now: () => new Date('2026-11-28T10:15:00.123Z') });
      await h.service.start(actor);
      await waitForIdle(h.service);
      const first = new Map(h.client.objects);

      await h.service.start(actor);
      await waitForIdle(h.service);
      expect(h.service.getStatus().lastAttempt).toMatchObject({ result: 'failed', failedStep: 'upload' });
      expect([...h.client.objects.entries()]).toEqual([...first.entries()]);
    });
  });

  describe('failures publish nothing', () => {
    const failures: Array<{
      name: string;
      step: string;
      arrange: (h: Harness) => void;
    }> = [
      {
        name: 'a version mismatch',
        step: 'version-check',
        arrange: () => {
          h.postgresClient.check.mockResolvedValue({ state: 'mismatch', clientMajor: 18, serverMajor: 19 });
        },
      },
      {
        name: 'a pg_dump failure',
        step: 'dump',
        arrange: (x) => x.runner.fail('pg_dump', 1),
      },
      {
        name: 'a missing upload reference',
        step: 'checks',
        arrange: (x) => {
          x.runner.listing = 'logos/\n';
        },
      },
      {
        name: 'a pg_restore read failure',
        step: 'checks',
        arrange: (x) => x.runner.fail('pg_restore', 1),
      },
      {
        name: 'an application role missing from the globals',
        step: 'checks',
        arrange: (x) => {
          x.runner.on('pg_dumpall', (spec) => {
            fs.writeFileSync(spec.stdoutPath!, 'CREATE ROLE someone_else;\n', { mode: 0o600 });
            return { stdout: '' };
          });
        },
      },
      {
        name: 'an encryption failure',
        step: 'encrypt',
        arrange: (x) => x.runner.fail('age', 1),
      },
      {
        name: 'a checksum mismatch on read-back',
        step: 'read-back',
        arrange: (x) => {
          x.client.corruptReads = true;
        },
      },
      {
        name: 'an upload failure',
        step: 'upload',
        arrange: (x) => {
          x.client.hook = (operation, key) => {
            if (operation === 'put' && key.endsWith('backup.tar.age')) throw new Error('network reset');
          };
        },
      },
      {
        name: 'an interrupted publish after the archive is uploaded',
        step: 'manifest',
        arrange: (x) => {
          x.client.hook = (operation, key) => {
            if (operation === 'put' && key.endsWith('manifest.json')) throw new Error('connection dropped');
          };
        },
      },
    ];

    it.each(failures)('$name fails at $step, publishes no manifest, and lists nothing', async ({ step, arrange }) => {
      arrange(h);
      await h.service.start(actor);
      await waitForIdle(h.service);

      const attempt = h.service.getStatus().lastAttempt;
      expect(attempt).toMatchObject({ result: 'failed', failedStep: step });
      expect([...h.client.objects.keys()].some((key) => key.endsWith('manifest.json'))).toBe(false);

      const listing = await h.service.listBackups();
      expect(listing).toEqual({ state: 'ok', backups: [], malformed: [] });

      const localEntries = fs.existsSync(h.localCopyDir)
        ? fs.readdirSync(h.localCopyDir).filter((entry) => entry !== '.tmp')
        : [];
      expect(localEntries).toEqual([]);
    });

    it('reports the failing step and a fixed, sanitised error without secrets', async () => {
      h.runner.fail('pg_dump', 1);
      await h.service.start(actor);
      await waitForIdle(h.service);
      const status = h.service.getStatus();
      expect(status.lastAttempt?.error).toBe('pg_dump failed');
      expect(JSON.stringify(status)).not.toContain(DB_PASSWORD);
      expect(JSON.stringify(status)).not.toContain(S3_SECRET);
    });
  });

  describe('timeout and cancellation ordering', () => {
    it('kills the child and only releases the lock after it has closed', async () => {
      h = await makeReadyHarness({ timeoutMs: 50 });
      let closed = false;
      let lockHeldWhileKilling = false;
      h.runner.on('pg_dump', (_spec, signal) => {
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            // Simulate a slow kill: the child only closes after 30ms.
            setTimeout(() => {
              lockHeldWhileKilling = h.service.getStatus().running !== null;
              closed = true;
              reject(signal.reason);
            }, 30);
          });
        });
      });

      await h.service.start(actor);
      await waitForIdle(h.service);

      expect(closed).toBe(true);
      expect(lockHeldWhileKilling).toBe(true);
      expect(h.service.getStatus().lastAttempt).toMatchObject({ result: 'failed', failedStep: 'dump' });
      expect(h.service.getStatus().running).toBeNull();
    });

    it('aborts an in-flight storage request at the timeout, then releases the lock', async () => {
      h = await makeReadyHarness({ timeoutMs: 50 });
      h.client.hook = (operation, key) => {
        if (operation === 'put' && key.endsWith('backup.tar.age')) return new Promise(() => undefined);
      };
      await h.service.start(actor);
      await waitForIdle(h.service, 3000);
      expect(h.service.getStatus().lastAttempt).toMatchObject({ result: 'failed', failedStep: 'upload' });
      expect(h.service.getStatus().running).toBeNull();
      expect([...h.client.objects.keys()]).toEqual([]);
    });

    it('uses the 20-minute hard timeout', () => {
      expect(BACKUP_TIMEOUT_MS).toBe(20 * 60 * 1000);
    });
  });

  describe('restart, startup cleanup and status', () => {
    it('reads "no attempt since restart" for a new service instance', () => {
      const status = h.service.getStatus();
      expect(status.noAttemptSinceRestart).toBe(true);
      expect(status.lastAttempt).toBeNull();
    });

    it('clears only .tmp at startup and keeps completed Backups', async () => {
      const tmp = path.join(h.localCopyDir, '.tmp', 'stale-attempt');
      const completed = path.join(h.localCopyDir, '20260101T000000000Z');
      fs.mkdirSync(tmp, { recursive: true });
      fs.writeFileSync(path.join(tmp, 'erp_db.dump'), 'plaintext');
      fs.mkdirSync(completed, { recursive: true });
      fs.writeFileSync(path.join(completed, 'backup.tar.age'), 'ciphertext');

      await h.service.prepareStartup();

      expect(fs.existsSync(path.join(h.localCopyDir, '.tmp'))).toBe(false);
      expect(fs.readFileSync(path.join(completed, 'backup.tar.age'), 'utf8')).toBe('ciphertext');
      expect(h.service.getStatus().startup).toBe('ready');
    });

    // A read-only directory makes removal fail for a non-root user.
    const notRoot = process.getuid?.() !== 0;
    (notRoot ? it : it.skip)('does not start Backups when startup cleanup fails', async () => {
      const locked = path.join(h.localCopyDir, '.tmp', 'locked');
      fs.mkdirSync(locked, { recursive: true });
      fs.writeFileSync(path.join(locked, 'erp_db.dump'), 'plaintext');
      fs.chmodSync(locked, 0o500);
      try {
        await h.service.prepareStartup();
        expect(h.service.getStatus().startup).toBe('failed');
        await expect(h.service.start(actor)).rejects.toBeInstanceOf(ServiceUnavailableException);
      } finally {
        fs.chmodSync(locked, 0o700);
      }
    });
  });

  describe('listing', () => {
    it('excludes prefixes without a manifest and reports malformed manifests separately', async () => {
      await seedBackup('20260101T000000000Z');
      h.client.objects.set(archiveKeyFor('20260102T000000000Z'), Buffer.from('orphan archive'));
      h.client.objects.set(manifestKeyFor('20260103T000000000Z'), Buffer.from('{not json'));
      h.client.objects.set(manifestKeyFor('20260104T000000000Z'), Buffer.from(JSON.stringify(buildManifest({
        recoveryPoint: '20260104T000000000Z',
        release: '1.2.3',
        serverMajor: 19,
        clientMajor: 19,
        archiveSize: 1,
        archiveSha256: 'a'.repeat(64),
        ageRecipient: AGE_RECIPIENT,
      }))));

      const listing = await h.service.listBackups();
      expect(listing.state).toBe('ok');
      if (listing.state !== 'ok') return;
      expect(listing.backups.map((b) => b.recoveryPoint)).toEqual(['20260101T000000000Z']);
      expect(listing.malformed).toEqual([
        { recoveryPoint: '20260104T000000000Z', reason: 'backup.tar.age is missing' },
        { recoveryPoint: '20260103T000000000Z', reason: 'manifest is not valid JSON' },
      ]);
    });

    it('paginates through every page of the bucket', async () => {
      h.client.pageSize = 2;
      await seedBackup('20260101T000000000Z');
      await seedBackup('20260102T000000000Z');
      await seedBackup('20260103T000000000Z');
      const listing = await h.service.listBackups();
      expect(listing.state === 'ok' && listing.backups.map((b) => b.recoveryPoint)).toEqual([
        '20260103T000000000Z',
        '20260102T000000000Z',
        '20260101T000000000Z',
      ]);
    });

    it('reports unreachable storage as unavailable, never as an empty list', async () => {
      h.client.hook = (operation) => {
        if (operation === 'list') throw new Error('connect ECONNREFUSED 10.0.0.5:9000');
      };
      const listing = await h.service.listBackups();
      expect(listing).toEqual({ state: 'unavailable', reason: 'Backup storage is unavailable' });
      expect(JSON.stringify(listing)).not.toContain('10.0.0.5');
    });

    it('status polling never lists the bucket', async () => {
      const listSpy = jest.fn();
      h.client.hook = (operation) => {
        if (operation === 'list') listSpy();
      };
      h.service.getStatus();
      h.service.getStatus();
      expect(listSpy).not.toHaveBeenCalled();
    });
  });

});
