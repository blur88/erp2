import { buildPostgresToolEnv, loadBackupConfig, loadHeartbeatConfig } from './backup.config';
import { AGE_RECIPIENT } from './backup-test-fixtures';

const complete = {
  BACKUP_LOCAL_COPY_DIR: '/var/lib/erp/backups',
  BACKUP_S3_REGION: 'ap-southeast-5',
  BACKUP_S3_BUCKET: 'erp-backups',
  BACKUP_S3_ACCESS_KEY_ID: 'AKIA-SECRET-ID',
  BACKUP_S3_SECRET_ACCESS_KEY: 'super-secret-key',
  BACKUP_AGE_RECIPIENT: AGE_RECIPIENT,
};

describe('loadBackupConfig (#2111)', () => {
  it('reads a complete configuration', () => {
    const result = loadBackupConfig(complete);
    expect(result.configured).toBe(true);
    expect(result.config?.s3).toMatchObject({ region: 'ap-southeast-5', bucket: 'erp-backups', forcePathStyle: false });
  });

  it('names missing variables without echoing any value', () => {
    const { BACKUP_S3_SECRET_ACCESS_KEY: _omit, ...partial } = complete;
    const result = loadBackupConfig(partial);
    expect(result).toMatchObject({ configured: false, config: null, missing: ['BACKUP_S3_SECRET_ACCESS_KEY'] });
    expect(JSON.stringify(result)).not.toContain('AKIA-SECRET-ID');
  });

  it('rejects a relative Local copy path and a malformed age recipient', () => {
    const result = loadBackupConfig({
      ...complete,
      BACKUP_LOCAL_COPY_DIR: 'relative/dir',
      BACKUP_AGE_RECIPIENT: 'not-a-recipient',
    });
    expect(result.configured).toBe(false);
    expect(result.invalid).toEqual(['BACKUP_LOCAL_COPY_DIR', 'BACKUP_AGE_RECIPIENT']);
  });
});

describe('buildPostgresToolEnv (#2111)', () => {
  it('passes only the database settings to pg_dump, never S3 credentials', () => {
    const env = buildPostgresToolEnv({
      ...complete,
      PATH: '/usr/bin',
      DB_HOST: 'postgres',
      DB_PORT: '5432',
      DB_USERNAME: 'erp_app',
      DB_PASSWORD: 'db-pass',
      DB_DATABASE: 'erp',
      DB_SSL: 'false',
    });
    expect(env).toMatchObject({ PGHOST: 'postgres', PGUSER: 'erp_app', PGPASSWORD: 'db-pass', PGSSLMODE: 'disable' });
    expect(JSON.stringify(env)).not.toContain('super-secret-key');
    expect(JSON.stringify(env)).not.toContain('AKIA-SECRET-ID');
  });
});

describe('loadHeartbeatConfig (#2115)', () => {
  const primary = 'https://hc-ping.com/aaaaaaaa-0000-4000-8000-000000000001';
  const secondary = 'https://hc-ping.com/bbbbbbbb-0000-4000-8000-000000000002';

  it('reads both URLs with their variable names', () => {
    const result = loadHeartbeatConfig({
      BACKUP_HEARTBEAT_URL_PRIMARY: primary,
      BACKUP_HEARTBEAT_URL_SECONDARY: secondary,
    });
    expect(result.urls).toEqual([
      { name: 'BACKUP_HEARTBEAT_URL_PRIMARY', url: primary },
      { name: 'BACKUP_HEARTBEAT_URL_SECONDARY', url: secondary },
    ]);
    expect(result.missing).toEqual([]);
    expect(result.invalid).toEqual([]);
  });

  it('names a missing URL and keeps the other one', () => {
    const result = loadHeartbeatConfig({ BACKUP_HEARTBEAT_URL_PRIMARY: primary });
    expect(result.urls.map((u) => u.name)).toEqual(['BACKUP_HEARTBEAT_URL_PRIMARY']);
    expect(result.missing).toEqual(['BACKUP_HEARTBEAT_URL_SECONDARY']);
  });

  it('names an invalid URL without echoing it', () => {
    const result = loadHeartbeatConfig({
      BACKUP_HEARTBEAT_URL_PRIMARY: 'ftp://hc-ping.com/secret-token-value',
      BACKUP_HEARTBEAT_URL_SECONDARY: secondary,
    });
    expect(result.invalid).toEqual(['BACKUP_HEARTBEAT_URL_PRIMARY']);
    expect(result.urls.map((u) => u.name)).toEqual(['BACKUP_HEARTBEAT_URL_SECONDARY']);
    expect(JSON.stringify(result)).not.toContain('secret-token-value');
  });
});
