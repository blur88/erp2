import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildManifest, archiveKeyFor, manifestKeyFor } from './backup-manifest';
import { listStoredBackups } from './backup-listing';
import { RetentionPassDeps, localCopyPathFor, runRetentionPass } from './backup-retention-pass';
import type { StoredBackupSettings } from './backup-settings.service';
import { AGE_RECIPIENT } from './backup-test-fixtures';
import { S3BackupStorage } from './backup-storage';
import { InMemoryS3Client } from './in-memory-s3-client';

const NOW = new Date('2026-11-28T12:00:00.000Z');
const HOUR_MS = 60 * 60 * 1000;
/** Newest Backup is outside the 1-hour window below, so only the tiers and the newest-Verified rule can keep it. */
const NEWEST = '20261127T100000000Z';
const OLD = '20261101T000000000Z';

interface Env {
  root: string;
  localCopyDir: string;
  client: InMemoryS3Client;
  storage: S3BackupStorage;
  cleanup: () => void;
}

function makeEnv(): Env {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'retention-pass-'));
  const localCopyDir = path.join(root, 'local-copy');
  fs.mkdirSync(localCopyDir, { recursive: true });
  const client = new InMemoryS3Client();
  return {
    root,
    localCopyDir,
    client,
    storage: new S3BackupStorage(client, 'test-bucket'),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

function validSettings(overrides: Partial<Record<string, number>> = {}): StoredBackupSettings {
  return {
    state: 'valid',
    settings: {
      intervalMinutes: 30,
      retentionWindowHours: 1,
      retentionDailyCount: 1,
      retentionWeeklyCount: 1,
      retentionMonthlyCount: 1,
      ...overrides,
    },
  } as StoredBackupSettings;
}

function depsFor(env: Env, settings: StoredBackupSettings = validSettings()): RetentionPassDeps {
  return {
    storage: env.storage,
    localCopyDir: env.localCopyDir,
    readSettings: async () => settings,
    now: () => NOW,
  };
}

interface SeedOptions {
  release?: string;
  lastModified?: Date;
  manifest?: boolean;
  archive?: boolean;
  manifestText?: string;
}

/** Seeds a Backup prefix directly in the in-memory bucket, with controlled LastModified times. */
function seed(env: Env, recoveryPoint: string, options: SeedOptions = {}): void {
  const { release = '1.0.0', lastModified = new Date(NOW.getTime() - HOUR_MS), manifest = true, archive = true } = options;
  const bytes = Buffer.from(`ciphertext-${recoveryPoint}`);
  if (archive) {
    env.client.objects.set(archiveKeyFor(recoveryPoint), bytes);
    env.client.lastModified.set(archiveKeyFor(recoveryPoint), lastModified);
  }
  if (manifest) {
    const text =
      options.manifestText ??
      JSON.stringify(
        buildManifest({
          recoveryPoint,
          release,
          serverMajor: 19,
          clientMajor: 19,
          archiveSize: bytes.length,
          archiveSha256: createHash('sha256').update(bytes).digest('hex'),
          ageRecipient: AGE_RECIPIENT,
        }),
      );
    env.client.objects.set(manifestKeyFor(recoveryPoint), Buffer.from(text));
    env.client.lastModified.set(manifestKeyFor(recoveryPoint), lastModified);
  }
}

function makeLocalCopy(env: Env, name: string): string {
  const dir = path.join(env.localCopyDir, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'backup.tar.age'), 'local ciphertext');
  return dir;
}

const hoursAgo = (hours: number): Date => new Date(NOW.getTime() - hours * HOUR_MS);

describe('runRetentionPass (#2114)', () => {
  let env: Env;

  beforeEach(() => {
    env = makeEnv();
  });

  afterEach(() => {
    env.cleanup();
  });

  describe('Backup expiry', () => {
    it('keeps the newest Verified Backup and expires an unverified one outside the window', async () => {
      seed(env, OLD, { release: '1.0.0', lastModified: hoursAgo(700) });
      seed(env, '20261105T000000000Z', { release: 'unreleased', lastModified: hoursAgo(600) });

      const record = await runRetentionPass(depsFor(env), new AbortController().signal);

      expect(record).toMatchObject({ result: 'succeeded', expiredBackups: 1 });
      expect(env.client.objects.has(manifestKeyFor(OLD))).toBe(true);
      expect(env.client.objects.has(archiveKeyFor(OLD))).toBe(true);
      expect(env.client.objects.has(manifestKeyFor('20261105T000000000Z'))).toBe(false);
      expect(env.client.objects.has(archiveKeyFor('20261105T000000000Z'))).toBe(false);
    });

    it('deletes an expired Backup manifest before its archive, with DeleteObject and no version ID', async () => {
      seed(env, OLD);
      seed(env, NEWEST);

      const record = await runRetentionPass(depsFor(env), new AbortController().signal);

      expect(record).toMatchObject({ result: 'succeeded', expiredBackups: 1 });
      expect(env.client.deleteOrder).toEqual([manifestKeyFor(OLD), archiveKeyFor(OLD)]);
      expect(env.client.deleteInputs.every((input) => input.VersionId === undefined)).toBe(true);
      expect(env.client.objects.has(manifestKeyFor(NEWEST))).toBe(true);
      expect(env.client.objects.has(archiveKeyFor(NEWEST))).toBe(true);
    });

    it('stops at a partial deletion, reports it, and never leaves a listed Backup without its archive', async () => {
      const OLDER = '20261102T000000000Z';
      seed(env, OLD);
      seed(env, OLDER);
      seed(env, NEWEST);
      env.client.hook = (operation, key) => {
        if (operation === 'delete' && key === archiveKeyFor(OLD)) throw new Error('connection reset');
      };

      const record = await runRetentionPass(depsFor(env), new AbortController().signal);

      expect(record).toMatchObject({ result: 'failed', failedStep: 'expire', expiredBackups: 0 });
      expect(env.client.deleteOrder).toEqual([manifestKeyFor(OLD)]);
      expect(env.client.objects.has(archiveKeyFor(OLD))).toBe(true);
      expect(env.client.objects.has(manifestKeyFor(OLDER))).toBe(true);
      expect(env.client.objects.has(archiveKeyFor(OLDER))).toBe(true);

      const listing = await listStoredBackups(env.storage);
      expect(listing.backups.map((b) => b.recoveryPoint).sort()).toEqual([OLDER, NEWEST]);
      expect(listing.malformed).toEqual([]);
    });
  });

  describe('orphan archives', () => {
    it('deletes an orphan archive only once its LastModified is more than 24 hours old', async () => {
      const EXACT = '20261101T000000000Z';
      const JUST_OVER = '20261102T000000000Z';
      const YOUNG = '20261127T000000000Z';
      seed(env, EXACT, { manifest: false, lastModified: hoursAgo(24) });
      seed(env, JUST_OVER, { manifest: false, lastModified: new Date(NOW.getTime() - 24 * HOUR_MS - 1) });
      seed(env, YOUNG, { manifest: false, lastModified: hoursAgo(1) });

      const record = await runRetentionPass(depsFor(env), new AbortController().signal);

      expect(record).toMatchObject({ result: 'succeeded', orphanArchives: 1 });
      expect(env.client.objects.has(archiveKeyFor(EXACT))).toBe(true);
      expect(env.client.objects.has(archiveKeyFor(JUST_OVER))).toBe(false);
      expect(env.client.objects.has(archiveKeyFor(YOUNG))).toBe(true);
    });

    it('does not delete an orphan archive when its manifest check fails', async () => {
      seed(env, OLD, { manifest: false, lastModified: hoursAgo(72) });
      env.client.hook = (operation, key) => {
        if (operation === 'head' && key === manifestKeyFor(OLD)) throw new Error('connection reset');
      };

      const record = await runRetentionPass(depsFor(env), new AbortController().signal);

      expect(record).toMatchObject({ result: 'failed', failedStep: 'orphans', orphanArchives: 0 });
      expect(env.client.deleteInputs).toEqual([]);
      expect(env.client.objects.has(archiveKeyFor(OLD))).toBe(true);
    });

    it('never treats a malformed manifest as missing, so its archive is kept', async () => {
      seed(env, OLD, { lastModified: hoursAgo(72), manifestText: '{not json' });

      const record = await runRetentionPass(depsFor(env), new AbortController().signal);

      expect(record).toMatchObject({ result: 'succeeded', orphanArchives: 0, expiredBackups: 0 });
      expect(env.client.deleteInputs).toEqual([]);
      expect(env.client.objects.has(archiveKeyFor(OLD))).toBe(true);
      expect(env.client.objects.has(manifestKeyFor(OLD))).toBe(true);
    });
  });

  describe('storage errors', () => {
    it('treats a failed manifest read as unavailable, not as a missing manifest, and deletes nothing', async () => {
      seed(env, OLD, { lastModified: hoursAgo(72) });
      seed(env, NEWEST);
      env.client.hook = (operation, key) => {
        if (operation === 'get' && key === manifestKeyFor(OLD)) throw new Error('connection reset');
      };

      const record = await runRetentionPass(depsFor(env), new AbortController().signal);

      expect(record).toMatchObject({ result: 'failed', failedStep: 'list', expiredBackups: 0, orphanArchives: 0 });
      expect(env.client.deleteInputs).toEqual([]);
      expect(env.client.objects.has(archiveKeyFor(OLD))).toBe(true);
    });

    it('deletes nothing when the listing fails, but still prunes old local copies', async () => {
      seed(env, OLD, { lastModified: hoursAgo(72) });
      makeLocalCopy(env, '20261101T000000000Z');
      env.client.hook = (operation) => {
        if (operation === 'list') throw new Error('connect ECONNREFUSED');
      };

      const record = await runRetentionPass(depsFor(env), new AbortController().signal);

      expect(record).toMatchObject({ result: 'failed', failedStep: 'list', prunedLocalCopies: 1 });
      expect(env.client.deleteInputs).toEqual([]);
      expect(fs.existsSync(path.join(env.localCopyDir, '20261101T000000000Z'))).toBe(false);
    });

    it('records a settings read failure and deletes nothing', async () => {
      seed(env, OLD);
      const deps: RetentionPassDeps = {
        ...depsFor(env),
        readSettings: async () => {
          throw new Error('database unavailable');
        },
      };

      const record = await runRetentionPass(deps, new AbortController().signal);

      expect(record).toMatchObject({ result: 'failed', failedStep: 'settings' });
      expect(env.client.deleteInputs).toEqual([]);
    });
  });

  describe('invalid settings', () => {
    it('is skipped entirely: no storage request, no deletion and no local pruning', async () => {
      seed(env, OLD, { lastModified: hoursAgo(72) });
      makeLocalCopy(env, '20261101T000000000Z');
      let operations = 0;
      env.client.hook = () => {
        operations += 1;
      };
      const invalid = { state: 'invalid', errors: [{ field: 'intervalMinutes', message: 'Interval must be 15 or 30 minutes' }], values: {} } as StoredBackupSettings;

      const record = await runRetentionPass(depsFor(env, invalid), new AbortController().signal);

      expect(record).toMatchObject({ result: 'skipped', expiredBackups: 0, orphanArchives: 0, prunedLocalCopies: 0 });
      expect(operations).toBe(0);
      expect(env.client.deleteInputs).toEqual([]);
      expect(fs.existsSync(path.join(env.localCopyDir, '20261101T000000000Z'))).toBe(true);
    });

    it('is skipped when the settings row is missing', async () => {
      seed(env, OLD, { lastModified: hoursAgo(72) });

      const record = await runRetentionPass(depsFor(env, { state: 'missing' }), new AbortController().signal);

      expect(record.result).toBe('skipped');
      expect(env.client.deleteInputs).toEqual([]);
    });
  });

  describe('local copies', () => {
    it('prunes local copies older than 24 hours, keeping one exactly 24 hours old', async () => {
      makeLocalCopy(env, '20261127T120000000Z'); // exactly 24 hours old: kept
      makeLocalCopy(env, '20261127T115959999Z'); // one millisecond older: pruned
      makeLocalCopy(env, '20261128T090000000Z');

      const record = await runRetentionPass(depsFor(env), new AbortController().signal);

      expect(record).toMatchObject({ result: 'succeeded', prunedLocalCopies: 1 });
      expect(fs.existsSync(path.join(env.localCopyDir, '20261127T120000000Z'))).toBe(true);
      expect(fs.existsSync(path.join(env.localCopyDir, '20261127T115959999Z'))).toBe(false);
      expect(fs.existsSync(path.join(env.localCopyDir, '20261128T090000000Z'))).toBe(true);
    });

    it('never touches .tmp, names that are not recovery points, files, or symlinks', async () => {
      const outside = path.join(env.root, 'outside');
      fs.mkdirSync(outside);
      fs.writeFileSync(path.join(outside, 'keep.txt'), 'untouched');
      fs.symlinkSync(outside, path.join(env.localCopyDir, '20261101T000000000Z'));
      const tmp = path.join(env.localCopyDir, '.tmp');
      fs.mkdirSync(path.join(tmp, '20261101T000000000Z'), { recursive: true });
      makeLocalCopy(env, 'not-a-recovery-point');
      fs.writeFileSync(path.join(env.localCopyDir, '20261101T000000001Z'), 'a file, not a directory');

      const record = await runRetentionPass(depsFor(env), new AbortController().signal);

      expect(record).toMatchObject({ result: 'succeeded', prunedLocalCopies: 0 });
      expect(fs.readFileSync(path.join(outside, 'keep.txt'), 'utf8')).toBe('untouched');
      expect(fs.lstatSync(path.join(env.localCopyDir, '20261101T000000000Z')).isSymbolicLink()).toBe(true);
      expect(fs.existsSync(path.join(tmp, '20261101T000000000Z'))).toBe(true);
      expect(fs.existsSync(path.join(env.localCopyDir, 'not-a-recovery-point'))).toBe(true);
    });
  });

  describe('localCopyPathFor', () => {
    it('resolves only a direct recovery-point child of the local copy directory', () => {
      const dir = path.join(os.tmpdir(), 'local-copy-root');
      expect(localCopyPathFor(dir, '20261101T000000000Z')).toBe(path.join(dir, '20261101T000000000Z'));
      for (const name of ['', '.', '..', '.tmp', '../20261101T000000000Z', '20261101T000000000Z/..', 'a/b']) {
        expect(() => localCopyPathFor(dir, name)).toThrow();
      }
    });
  });
});
