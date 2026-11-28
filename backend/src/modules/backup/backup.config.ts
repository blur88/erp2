import * as path from 'node:path';

/**
 * Deployment configuration for Backups (#2111). Nothing here is read from the
 * database. Values are only ever used to talk to storage and tools; they are
 * never returned by the API, logged, or written to a manifest.
 */
export const BACKUP_ENV = {
  localCopyDir: 'BACKUP_LOCAL_COPY_DIR',
  s3Endpoint: 'BACKUP_S3_ENDPOINT',
  s3Region: 'BACKUP_S3_REGION',
  s3Bucket: 'BACKUP_S3_BUCKET',
  s3AccessKeyId: 'BACKUP_S3_ACCESS_KEY_ID',
  s3SecretAccessKey: 'BACKUP_S3_SECRET_ACCESS_KEY',
  s3ForcePathStyle: 'BACKUP_S3_FORCE_PATH_STYLE',
  ageRecipient: 'BACKUP_AGE_RECIPIENT',
} as const;

/** An age X25519 recipient: `age1` followed by 58 bech32 characters. */
const AGE_RECIPIENT = /^age1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]{58}$/;

export interface BackupConfig {
  localCopyDir: string;
  s3: {
    endpoint?: string;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle: boolean;
  };
  ageRecipient: string;
}

/** `config` is set exactly when `configured` is true; `missing` and `invalid` name variables only. */
export interface BackupConfigResult {
  configured: boolean;
  config: BackupConfig | null;
  missing: string[];
  invalid: string[];
}

/**
 * Reads Backup configuration from the environment. Pure: it reports the names
 * of missing or invalid variables, never their values.
 */
export function loadBackupConfig(env: NodeJS.ProcessEnv = process.env): BackupConfigResult {
  const missing: string[] = [];
  const invalid: string[] = [];
  const value = (name: string): string => (env[name] ?? '').trim();

  const localCopyDir = value(BACKUP_ENV.localCopyDir);
  if (!localCopyDir) missing.push(BACKUP_ENV.localCopyDir);
  else if (!path.isAbsolute(localCopyDir)) invalid.push(BACKUP_ENV.localCopyDir);

  const region = value(BACKUP_ENV.s3Region);
  const bucket = value(BACKUP_ENV.s3Bucket);
  const accessKeyId = value(BACKUP_ENV.s3AccessKeyId);
  const secretAccessKey = value(BACKUP_ENV.s3SecretAccessKey);
  for (const [name, present] of [
    [BACKUP_ENV.s3Region, region],
    [BACKUP_ENV.s3Bucket, bucket],
    [BACKUP_ENV.s3AccessKeyId, accessKeyId],
    [BACKUP_ENV.s3SecretAccessKey, secretAccessKey],
  ] as const) {
    if (!present) missing.push(name);
  }

  const ageRecipient = value(BACKUP_ENV.ageRecipient);
  if (!ageRecipient) missing.push(BACKUP_ENV.ageRecipient);
  else if (!AGE_RECIPIENT.test(ageRecipient)) invalid.push(BACKUP_ENV.ageRecipient);

  const endpoint = value(BACKUP_ENV.s3Endpoint) || undefined;
  if (endpoint && !/^https?:\/\//.test(endpoint)) invalid.push(BACKUP_ENV.s3Endpoint);

  if (missing.length > 0 || invalid.length > 0) {
    return { configured: false, config: null, missing, invalid };
  }

  return {
    configured: true,
    missing,
    invalid,
    config: {
      localCopyDir,
      s3: {
        endpoint,
        region,
        bucket,
        accessKeyId,
        secretAccessKey,
        forcePathStyle: value(BACKUP_ENV.s3ForcePathStyle) === 'true',
      },
      ageRecipient,
    },
  };
}

/** Deployment configuration for the Healthchecks.io heartbeats (#2115). Names are shown; values never are. */
export const HEARTBEAT_ENV = {
  primary: 'BACKUP_HEARTBEAT_URL_PRIMARY',
  secondary: 'BACKUP_HEARTBEAT_URL_SECONDARY',
} as const;

export interface HeartbeatUrl {
  /** The variable the URL came from. Only this name is ever shown. */
  name: string;
  /** Never logged, returned by the API, or written anywhere. */
  url: string;
}

export interface HeartbeatConfigResult {
  urls: HeartbeatUrl[];
  /** Variables that are not set. */
  missing: string[];
  /** Variables that are set but are not http or https URLs. */
  invalid: string[];
}

/**
 * Reads the two heartbeat URLs. Pure. A missing or invalid URL never stops
 * Backups; it is reported as a configuration warning instead.
 */
export function loadHeartbeatConfig(env: NodeJS.ProcessEnv = process.env): HeartbeatConfigResult {
  const result: HeartbeatConfigResult = { urls: [], missing: [], invalid: [] };
  for (const name of [HEARTBEAT_ENV.primary, HEARTBEAT_ENV.secondary]) {
    const value = (env[name] ?? '').trim();
    if (!value) {
      result.missing.push(name);
    } else if (!isHttpUrl(value)) {
      result.invalid.push(name);
    } else {
      result.urls.push({ name, url: value });
    }
  }
  return result;
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Environment for pg_dump, pg_dumpall and pg_restore. Only the variables the
 * PostgreSQL tools need: the S3 credentials never reach a child process.
 */
export function buildPostgresToolEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const sslEnabled = env.DB_SSL === 'true';
  const toolEnv: NodeJS.ProcessEnv = {
    PATH: env.PATH,
    PGHOST: env.DB_HOST,
    PGPORT: env.DB_PORT || '5432',
    PGUSER: env.DB_USERNAME,
    PGPASSWORD: env.DB_PASSWORD,
    PGDATABASE: env.DB_DATABASE,
    PGSSLMODE: sslEnabled ? 'verify-full' : 'disable',
  };
  if (sslEnabled && env.DB_SSL_CA) toolEnv.PGSSLROOTCERT = env.DB_SSL_CA;
  if (sslEnabled && env.DB_SSL_CERT) toolEnv.PGSSLCERT = env.DB_SSL_CERT;
  if (sslEnabled && env.DB_SSL_KEY) toolEnv.PGSSLKEY = env.DB_SSL_KEY;
  return toolEnv;
}
