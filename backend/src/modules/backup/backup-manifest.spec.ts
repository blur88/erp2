import { createHash } from 'node:crypto';
import {
  archiveKeyFor,
  buildManifest,
  fingerprintOf,
  formatRecoveryPoint,
  manifestKeyFor,
  parseManifest,
} from './backup-manifest';

const RP = '20261128T101500123Z';
const RECIPIENT = `age1${'q'.repeat(58)}`;
const SHA = 'a'.repeat(64);

describe('backup manifest (#2111)', () => {
  it('formats the recovery point as fixed-width UTC that sorts by time', () => {
    expect(formatRecoveryPoint(new Date('2026-11-28T10:15:00.123Z'))).toBe(RP);
    expect(formatRecoveryPoint(new Date('2026-11-28T10:15:00.124Z')) > RP).toBe(true);
  });

  it('builds the two object keys under the recovery point prefix', () => {
    expect(archiveKeyFor(RP)).toBe(`backups/${RP}/backup.tar.age`);
    expect(manifestKeyFor(RP)).toBe(`backups/${RP}/manifest.json`);
  });

  it('holds only the spec fields and fingerprints the recipient rather than including it', () => {
    const manifest = buildManifest({
      recoveryPoint: RP,
      release: 'unreleased',
      serverMajor: 19,
      clientMajor: 19,
      archiveSize: 42,
      archiveSha256: SHA,
      ageRecipient: RECIPIENT,
    });
    expect(Object.keys(manifest).sort()).toEqual(
      ['age_recipient_fingerprint', 'archive', 'checks', 'format_version', 'postgres', 'recovery_point', 'release'].sort(),
    );
    expect(manifest.age_recipient_fingerprint).toBe(createHash('sha256').update(RECIPIENT).digest('hex'));
    expect(JSON.stringify(manifest)).not.toContain(RECIPIENT);
    expect(fingerprintOf(RECIPIENT)).toHaveLength(64);
  });

  it('round-trips a manifest it wrote', () => {
    const manifest = buildManifest({
      recoveryPoint: RP,
      release: '1.2.3',
      serverMajor: 19,
      clientMajor: 19,
      archiveSize: 42,
      archiveSha256: SHA,
      ageRecipient: RECIPIENT,
    });
    expect(parseManifest(JSON.stringify(manifest), RP)).toEqual({ manifest, reason: null });
  });

  it.each([
    ['not JSON', '{', 'manifest is not valid JSON'],
    ['an array', '[]', 'manifest is not an object'],
    ['the wrong format version', JSON.stringify({ format_version: 2 }), 'unsupported manifest format version'],
  ])('rejects %s as malformed', (_label, text, reason) => {
    expect(parseManifest(text, RP)).toEqual({ manifest: null, reason });
  });

  it('rejects a manifest whose recovery point does not match its prefix', () => {
    const manifest = buildManifest({
      recoveryPoint: '20260101T000000000Z',
      release: '1.2.3',
      serverMajor: 19,
      clientMajor: 19,
      archiveSize: 1,
      archiveSha256: SHA,
      ageRecipient: RECIPIENT,
    });
    expect(parseManifest(JSON.stringify(manifest), RP).reason).toBe('recovery point does not match its prefix');
  });

  it('rejects a manifest whose checks do not say decryption is not verified', () => {
    const manifest: any = buildManifest({
      recoveryPoint: RP,
      release: '1.2.3',
      serverMajor: 19,
      clientMajor: 19,
      archiveSize: 1,
      archiveSha256: SHA,
      ageRecipient: RECIPIENT,
    });
    manifest.checks.decryption = 'verified';
    expect(parseManifest(JSON.stringify(manifest), RP).reason).toBe('check results are invalid');
  });
});
