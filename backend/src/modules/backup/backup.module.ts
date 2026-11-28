import * as path from 'node:path';
import { Module } from '@nestjs/common';
import { resolveAppRelease } from '../../config/app-release.factory';
import { PostgresClientModule } from '../postgres-client/postgres-client.module';
import { BackupController } from './backup.controller';
import { buildPostgresToolEnv, loadBackupConfig } from './backup.config';
import { spawnProcessRunner } from './backup-process-runner';
import { S3BackupStorage } from './backup-storage';
import { BACKUP_OPTIONS, BackupService, BackupServiceOptions } from './backup.service';

/**
 * Reads deployment configuration once. Missing or invalid settings do not stop
 * the application: Backups report themselves as not configured.
 */
export function buildBackupServiceOptions(env: NodeJS.ProcessEnv = process.env): BackupServiceOptions {
  const config = loadBackupConfig(env);
  return {
    config,
    storage: config.configured ? S3BackupStorage.fromConfig(config.config.s3) : null,
    runner: spawnProcessRunner,
    toolEnv: buildPostgresToolEnv(env),
    appRole: env.DB_USERNAME ?? '',
    uploadsDir: path.resolve(process.cwd(), 'uploads'),
    release: resolveAppRelease(env),
  };
}

@Module({
  imports: [PostgresClientModule],
  controllers: [BackupController],
  providers: [
    { provide: BACKUP_OPTIONS, useFactory: () => buildBackupServiceOptions(process.env) },
    BackupService,
  ],
  exports: [BackupService],
})
export class BackupModule {}
