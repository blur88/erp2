import { archiveKeyFor, ARCHIVE_NAME, BACKUPS_PREFIX, isRecoveryPoint, manifestKeyFor, parseManifest } from './backup-manifest';
import { BackupStorage, readText, StoredObject } from './backup-storage';
import { BackupListItem, MalformedBackupItem } from './backup.types';

export interface StorageListing {
  /** Complete Backups: manifest parses and the archive size matches it. Newest first. */
  backups: BackupListItem[];
  /** Prefixes with a manifest that cannot be trusted. Never counted as missing, and never deleted. */
  malformed: MalformedBackupItem[];
  /** Every object under the Backup prefix, as listed. */
  objects: StoredObject[];
}

/**
 * Reads the bucket's Backup prefix and classifies it. A prefix counts only when its
 * manifest and archive both exist and the manifest parses. Storage errors are thrown
 * (BackupStorageUnavailableError), never turned into an empty listing.
 */
export async function listStoredBackups(storage: BackupStorage, signal?: AbortSignal): Promise<StorageListing> {
  const objects = await storage.listAll(BACKUPS_PREFIX, signal);
  const sizes = new Map<string, number>();
  const recoveryPoints = new Set<string>();
  for (const object of objects) {
    sizes.set(object.key, object.size);
    const rest = object.key.slice(BACKUPS_PREFIX.length);
    const [segment] = rest.split('/');
    if (segment) recoveryPoints.add(segment);
  }

  const backups: BackupListItem[] = [];
  const malformed: MalformedBackupItem[] = [];
  for (const recoveryPoint of [...recoveryPoints].sort().reverse()) {
    const manifestKey = manifestKeyFor(recoveryPoint);
    if (!sizes.has(manifestKey)) continue; // incomplete attempt: never listed

    if (!isRecoveryPoint(recoveryPoint)) {
      malformed.push({ recoveryPoint, reason: 'prefix is not a recovery point' });
      continue;
    }
    const parsed = parseManifest(await readText(storage, manifestKey, signal), recoveryPoint);
    if (!parsed.manifest) {
      malformed.push({ recoveryPoint, reason: parsed.reason ?? 'manifest is invalid' });
      continue;
    }
    const manifest = parsed.manifest;
    const archiveSize = sizes.get(archiveKeyFor(recoveryPoint));
    if (archiveSize === undefined) {
      malformed.push({ recoveryPoint, reason: `${ARCHIVE_NAME} is missing` });
      continue;
    }
    if (archiveSize !== manifest.archive.size) {
      malformed.push({ recoveryPoint, reason: 'archive size does not match the manifest' });
      continue;
    }
    backups.push({
      recoveryPoint,
      release: manifest.release,
      archiveSize,
      postgres: {
        serverMajor: manifest.postgres.server_major,
        clientMajor: manifest.postgres.client_major,
      },
    });
  }
  return { backups, malformed, objects };
}
