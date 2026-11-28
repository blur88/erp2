import { createHash } from 'node:crypto';

export const MANIFEST_FORMAT_VERSION = 1;
export const ARCHIVE_NAME = 'backup.tar.age';
export const MANIFEST_NAME = 'manifest.json';
export const BACKUPS_PREFIX = 'backups/';
export const UNRELEASED = 'unreleased';

/**
 * The plaintext manifest published last. It holds only what the spec lists:
 * no credentials, password hashes, keys, or heartbeat URLs.
 */
export interface BackupManifest {
  format_version: number;
  recovery_point: string;
  release: string;
  postgres: { server_major: number; client_major: number };
  archive: { name: string; size: number; sha256: string };
  age_recipient_fingerprint: string;
  checks: {
    uploads_references: 'passed';
    dump_readable: 'passed';
    application_role_in_globals: 'passed';
    decryption: 'not verified';
  };
}

const RECOVERY_POINT = /^\d{8}T\d{9}Z$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const RELEASE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$|^unreleased$/;

/**
 * Recovery point: the UTC time an attempt starts, as `YYYYMMDDTHHMMSSmmmZ`.
 * Fixed width, so lexical order is time order.
 */
export function formatRecoveryPoint(date: Date): string {
  const iso = date.toISOString(); // 2026-11-28T10:15:00.123Z
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}${iso.slice(20, 23)}Z`;
}

export function isRecoveryPoint(value: string): boolean {
  return RECOVERY_POINT.test(value);
}

export function prefixFor(recoveryPoint: string): string {
  return `${BACKUPS_PREFIX}${recoveryPoint}/`;
}

export function archiveKeyFor(recoveryPoint: string): string {
  return `${prefixFor(recoveryPoint)}${ARCHIVE_NAME}`;
}

export function manifestKeyFor(recoveryPoint: string): string {
  return `${prefixFor(recoveryPoint)}${MANIFEST_NAME}`;
}

/** SHA-256 of the recipient string, so the manifest identifies the key without holding it. */
export function fingerprintOf(ageRecipient: string): string {
  return createHash('sha256').update(ageRecipient, 'utf8').digest('hex');
}

export interface ManifestInput {
  recoveryPoint: string;
  release: string;
  serverMajor: number;
  clientMajor: number;
  archiveSize: number;
  archiveSha256: string;
  ageRecipient: string;
}

export function buildManifest(input: ManifestInput): BackupManifest {
  return {
    format_version: MANIFEST_FORMAT_VERSION,
    recovery_point: input.recoveryPoint,
    release: input.release,
    postgres: { server_major: input.serverMajor, client_major: input.clientMajor },
    archive: { name: ARCHIVE_NAME, size: input.archiveSize, sha256: input.archiveSha256 },
    age_recipient_fingerprint: fingerprintOf(input.ageRecipient),
    checks: {
      uploads_references: 'passed',
      dump_readable: 'passed',
      application_role_in_globals: 'passed',
      decryption: 'not verified',
    },
  };
}

/** Exactly one of the two fields is set. */
export interface ManifestParseResult {
  manifest: BackupManifest | null;
  reason: string | null;
}

const isNonNegativeInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/**
 * Validates manifest text read back from storage. Anything that is not exactly
 * the shape this module writes is malformed, and it is reported as such rather
 * than treated as a missing Backup.
 */
export function parseManifest(text: string, expectedRecoveryPoint: string): ManifestParseResult {
  let raw: any;
  try {
    raw = JSON.parse(text);
  } catch {
    return { manifest: null, reason: 'manifest is not valid JSON' };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { manifest: null, reason: 'manifest is not an object' };
  }
  if (raw.format_version !== MANIFEST_FORMAT_VERSION) {
    return { manifest: null, reason: 'unsupported manifest format version' };
  }
  if (raw.recovery_point !== expectedRecoveryPoint) {
    return { manifest: null, reason: 'recovery point does not match its prefix' };
  }
  if (typeof raw.release !== 'string' || !RELEASE.test(raw.release)) {
    return { manifest: null, reason: 'release is not a version or unreleased' };
  }
  if (!isNonNegativeInteger(raw.postgres?.server_major) || !isNonNegativeInteger(raw.postgres?.client_major)) {
    return { manifest: null, reason: 'PostgreSQL versions are missing' };
  }
  if (
    raw.archive?.name !== ARCHIVE_NAME ||
    !isNonNegativeInteger(raw.archive?.size) ||
    typeof raw.archive?.sha256 !== 'string' ||
    !SHA256_HEX.test(raw.archive.sha256)
  ) {
    return { manifest: null, reason: 'archive description is invalid' };
  }
  if (typeof raw.age_recipient_fingerprint !== 'string' || !SHA256_HEX.test(raw.age_recipient_fingerprint)) {
    return { manifest: null, reason: 'age recipient fingerprint is invalid' };
  }
  const checks = raw.checks;
  if (
    !checks ||
    checks.uploads_references !== 'passed' ||
    checks.dump_readable !== 'passed' ||
    checks.application_role_in_globals !== 'passed' ||
    checks.decryption !== 'not verified'
  ) {
    return { manifest: null, reason: 'check results are invalid' };
  }
  return { manifest: raw as BackupManifest, reason: null };
}
