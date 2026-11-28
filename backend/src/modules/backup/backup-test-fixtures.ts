import { jest } from '@jest/globals';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { CompanySettings } from '../../database/entities/company-settings.entity';
import { PrintSettings } from '../../database/entities/print-settings.entity';
import { BackupConfig } from './backup.config';
import { S3BackupStorage } from './backup-storage';
import { BackupService, BackupServiceOptions } from './backup.service';
import { BACKUP_SETTINGS_DEFAULTS } from './backup-settings';
import type { StoredBackupSettings } from './backup-settings.service';
import { InMemoryS3Client } from './in-memory-s3-client';
import { ScriptedProcessRunner } from './scripted-process-runner';

/** A syntactically valid age recipient. The private half is never needed in tests. */
export const AGE_RECIPIENT = `age1${'q'.repeat(58)}`;
export const APP_ROLE = 'erp_app';
export const DB_PASSWORD = 'db-password-never-in-output';
export const S3_SECRET = 's3-secret-never-in-output';

type AnyFn = (...args: any[]) => any;

export interface Harness {
  root: string;
  localCopyDir: string;
  uploadsDir: string;
  client: InMemoryS3Client;
  storage: S3BackupStorage;
  runner: ScriptedProcessRunner;
  postgresClient: { getStatus: jest.Mock<AnyFn>; check: jest.Mock<AnyFn> };
  auditLog: { log: jest.Mock<AnyFn> };
  /** The stored settings read by retention and scheduling. Defaults to valid settings. */
  settings: { readStored: jest.Mock<AnyFn> };
  service: BackupService;
  options: BackupServiceOptions;
  cleanup: () => void;
}

export function makeConfig(localCopyDir: string): BackupConfig {
  return {
    localCopyDir,
    s3: {
      region: 'ap-southeast-5',
      bucket: 'test-bucket',
      accessKeyId: 'AKIATESTONLY',
      secretAccessKey: S3_SECRET,
      forcePathStyle: true,
    },
    ageRecipient: AGE_RECIPIENT,
  };
}

/** Just enough of DataSource for the snapshot transaction and the logo reads. */
export function fakeDataSource(
  companyRows: Array<{ logoUrl: string | null }> = [{ logoUrl: '/uploads/logos/logo.png' }],
  printRows: Array<{ logoUrl: string | null }> = [{ logoUrl: null }],
) {
  const queryRunner = {
    isTransactionActive: false,
    connect: async () => undefined,
    startTransaction: async () => {
      queryRunner.isTransactionActive = true;
    },
    query: async (sql: string) => (sql.includes('pg_export_snapshot') ? [{ id: '00000003-0000001B-1' }] : []),
    commitTransaction: async () => {
      queryRunner.isTransactionActive = false;
    },
    rollbackTransaction: async () => {
      queryRunner.isTransactionActive = false;
    },
    release: async () => undefined,
    manager: {
      find: async (entity: unknown) => (entity === CompanySettings ? companyRows : entity === PrintSettings ? printRows : []),
    },
  };
  return { createQueryRunner: () => queryRunner } as any;
}

export function makeHarness(
  overrides: Partial<Pick<BackupServiceOptions, 'timeoutMs' | 'now'>> & {
    release?: BackupServiceOptions['release'];
    versionState?: 'compatible' | 'mismatch' | 'unavailable';
    dataSource?: unknown;
    stored?: StoredBackupSettings;
    retentionTimeoutMs?: number;
  } = {},
): Harness {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-test-'));
  const localCopyDir = path.join(root, 'local-copy');
  const uploadsDir = path.join(root, 'uploads');
  const client = new InMemoryS3Client();
  const storage = new S3BackupStorage(client, 'test-bucket');
  const runner = new ScriptedProcessRunner();
  const versionStatus =
    overrides.versionState === 'mismatch'
      ? { state: 'mismatch' as const, clientMajor: 18, serverMajor: 19 }
      : overrides.versionState === 'unavailable'
        ? { state: 'unavailable' as const, reason: 'pg_dump could not run' }
        : { state: 'compatible' as const, clientMajor: 19, serverMajor: 19 };
  const postgresClient = {
    getStatus: jest.fn<AnyFn>(() => versionStatus),
    check: jest.fn<AnyFn>(async () => versionStatus),
  };
  const auditLog = { log: jest.fn<AnyFn>(async () => undefined) };
  const stored: StoredBackupSettings = overrides.stored ?? { state: 'valid', settings: { ...BACKUP_SETTINGS_DEFAULTS } };
  const settings = { readStored: jest.fn<AnyFn>(async () => stored) };
  const options: BackupServiceOptions = {
    config: { configured: true, config: makeConfig(localCopyDir), missing: [], invalid: [] },
    storage,
    runner,
    toolEnv: { PATH: process.env.PATH },
    appRole: APP_ROLE,
    uploadsDir,
    release: overrides.release ?? { version: '1.2.3', status: 'released', configurationError: null },
    timeoutMs: overrides.timeoutMs,
    retentionTimeoutMs: overrides.retentionTimeoutMs,
    now: overrides.now,
  };
  const service = new BackupService(
    options,
    (overrides.dataSource ?? fakeDataSource()) as any,
    postgresClient as any,
    auditLog as any,
    settings as any,
  );
  return {
    root,
    localCopyDir,
    uploadsDir,
    client,
    storage,
    runner,
    postgresClient,
    auditLog,
    settings,
    service,
    options,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

/** Polls until the single Backup lock is free. */
export async function waitForIdle(service: BackupService, maxMs = 5000): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (service.getStatus().running && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** Polls until a condition holds. */
export async function waitFor(condition: () => boolean, maxMs = 5000): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (!condition() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** A harness whose startup preparation has completed, as after onApplicationBootstrap. */
export async function makeReadyHarness(
  overrides: Parameters<typeof makeHarness>[0] = {},
): Promise<Harness> {
  const harness = makeHarness(overrides);
  await harness.service.prepareStartup();
  return harness;
}
