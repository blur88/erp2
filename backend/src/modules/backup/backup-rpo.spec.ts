import { jest } from '@jest/globals';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AGE_RECIPIENT, Harness, makeHarness, makeReadyHarness, waitForIdle } from './backup-test-fixtures';
import { archiveKeyFor, buildManifest, manifestKeyFor } from './backup-manifest';

/** Seeds a complete Backup directly in the in-memory bucket with the given release. */
async function seed(h: Harness, recoveryPoint: string, release = '1.2.3'): Promise<void> {
  const { createHash } = await import('node:crypto');
  const archive = Buffer.from(`ciphertext-${recoveryPoint}`);
  const manifest = buildManifest({
    recoveryPoint,
    release,
    serverMajor: 19,
    clientMajor: 19,
    archiveSize: archive.length,
    archiveSha256: createHash('sha256').update(archive).digest('hex'),
    ageRecipient: AGE_RECIPIENT,
  });
  h.client.objects.set(archiveKeyFor(recoveryPoint), archive);
  h.client.objects.set(manifestKeyFor(recoveryPoint), Buffer.from(JSON.stringify(manifest)));
}

describe('listBackups protection view (#2115)', () => {
  let h: Harness;
  afterEach(() => {
    h?.cleanup();
    jest.restoreAllMocks();
  });

  describe('RPO from the newest Verified Backup', () => {
    it('is healthy when the newest released Backup is under 45 minutes old', async () => {
      h = await makeReadyHarness({ now: () => new Date('2026-11-28T10:50:00.000Z') });
      await seed(h, '20261128T101500123Z');
      const listing = await h.service.listBackups();
      expect(listing.rpo).toMatchObject({ state: 'healthy', ageMinutes: 34, recoveryPoint: '20261128T101500123Z' });
    });

    it.each([
      ['2026-11-28T10:59:59.123Z', 'healthy', 44],
      ['2026-11-28T11:00:00.123Z', 'warning', 45],
      ['2026-11-28T11:14:59.123Z', 'warning', 59],
      ['2026-11-28T11:15:00.123Z', 'breach', 60],
    ])('at %s the state is %s with age %i minutes', async (now, state, ageMinutes) => {
      h = await makeReadyHarness({ now: () => new Date(now) });
      await seed(h, '20261128T101500123Z');
      expect((await h.service.listBackups()).rpo).toMatchObject({ state, ageMinutes });
    });

    it('measures from the newest Verified Backup, not from an older one', async () => {
      h = await makeReadyHarness({ now: () => new Date('2026-11-28T11:00:00.000Z') });
      await seed(h, '20261128T090000000Z');
      await seed(h, '20261128T103000000Z');
      expect((await h.service.listBackups()).rpo).toMatchObject({ state: 'healthy', recoveryPoint: '20261128T103000000Z' });
    });

    it('does not count an unreleased Backup towards the RPO, but still lists it', async () => {
      h = await makeReadyHarness({ now: () => new Date('2026-11-28T11:00:00.000Z') });
      await seed(h, '20261128T103000000Z', 'unreleased');
      await seed(h, '20261128T090000000Z', '1.2.3');
      const listing = await h.service.listBackups();
      expect(listing.state === 'ok' && listing.backups.map((b) => b.recoveryPoint)).toEqual([
        '20261128T103000000Z',
        '20261128T090000000Z',
      ]);
      expect(listing.rpo).toMatchObject({ state: 'breach', recoveryPoint: '20261128T090000000Z' });
      expect(listing.state === 'ok' && listing.unreleasedCount).toBe(1);
    });

    it('has no Verified Backup, and so is unknown, when only unreleased Backups exist', async () => {
      h = await makeReadyHarness({ now: () => new Date('2026-11-28T11:00:00.000Z') });
      await seed(h, '20261128T103000000Z', 'unreleased');
      expect((await h.service.listBackups()).rpo).toEqual({ state: 'unknown', ageMinutes: null, recoveryPoint: null });
    });

    it('is unknown when storage is unreachable, and never empty-looking', async () => {
      h = await makeReadyHarness();
      h.client.hook = (operation) => {
        if (operation === 'list') throw new Error('connect ECONNREFUSED 10.0.0.5:9000');
      };
      const listing = await h.service.listBackups();
      expect(listing.state).toBe('unavailable');
      expect(listing.rpo).toEqual({ state: 'unknown', ageMinutes: null, recoveryPoint: null });
    });
  });

  describe('Local copy status', () => {
    it('is present with the newest complete local copy', async () => {
      h = await makeReadyHarness();
      fs.mkdirSync(path.join(h.localCopyDir, '20261128T101500123Z'), { recursive: true });
      fs.writeFileSync(path.join(h.localCopyDir, '20261128T101500123Z', 'backup.tar.age'), 'x');
      expect((await h.service.listBackups()).localCopy).toEqual({ state: 'present', recoveryPoint: '20261128T101500123Z' });
    });

    it('is absent when no local copy exists', async () => {
      h = await makeReadyHarness();
      expect((await h.service.listBackups()).localCopy).toEqual({ state: 'absent', recoveryPoint: null });
    });

    it('is unconfigured when deployment configuration is incomplete, and the listing says so', async () => {
      h = await makeReadyHarness();
      h.options.config = { configured: false, config: null, missing: ['BACKUP_S3_BUCKET'], invalid: [] };
      const listing = await h.service.listBackups();
      expect(listing.state).toBe('unavailable');
      expect(listing.localCopy).toEqual({ state: 'unconfigured' });
    });

    it('is reported even when storage is unreachable', async () => {
      h = await makeReadyHarness();
      h.client.hook = (operation) => {
        if (operation === 'list') throw new Error('down');
      };
      expect((await h.service.listBackups()).localCopy).toEqual({ state: 'absent', recoveryPoint: null });
    });
  });
});
