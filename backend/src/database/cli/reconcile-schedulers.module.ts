import { Injectable, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  TypeOrmModule,
  TypeOrmModuleOptions,
  TypeOrmOptionsFactory,
} from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { createDatabaseConfig } from '../../config/database-config.factory';
import { createBullOptions } from '../../config/bull-options.factory';
import { BackupSchedule } from '../entities/backup-schedule.entity';
import { OrphanedSchedulerReconciler } from '../../modules/backup/orphaned-scheduler-reconciler.service';

/**
 * TypeORM options for the reconcile CLI.
 *
 * Calls the exported createDatabaseConfig() directly rather than injecting
 * DatabaseConfig: that class is provided by AppModule's wiring, not this
 * module, so injecting it would fail dependency resolution at context
 * creation.
 *
 * Unlike DatabaseConfig this does NOT wrap the call in a try/catch that
 * replaces the message — that exists to avoid leaking configuration details
 * over HTTP, and a CLI operator needs the real error.
 */
@Injectable()
export class ReconcileCliDatabaseConfig implements TypeOrmOptionsFactory {
  constructor(private readonly configService: ConfigService) {}

  createTypeOrmOptions(): TypeOrmModuleOptions {
    return {
      ...createDatabaseConfig(this.configService, false),
      // Never inherit DB_SYNCHRONIZE (#964): a dev box with it set would have
      // the CLI alter schema during datasource initialization.
      synchronize: false,
      // The CLI never migrates.
      migrationsRun: false,
    };
  }
}

/**
 * Exported so the wiring test can assert the exact values rather than a
 * substring of serialized module metadata.
 */
export const RECONCILE_QUEUE_OPTIONS = {
  name: 'backup-queue',
  // The Queue constructor writes queue metadata unless this is set
  // (bullmq queue.js:45). Safe here because the CLI never produces jobs.
  skipMetasUpdate: true,
} as const;

/**
 * Minimal context for `npm run backup:reconcile-schedulers`.
 *
 * Deliberately NOT AppModule: booting that runs four onModuleInit hooks —
 * BackupSchedulerService.initializeSchedules() (removes and upserts Redis
 * entries) plus the users, price-lists, and accounting seeders (write to
 * Postgres). A --dry-run that seeds a chart of accounts is not a dry run.
 *
 * INVARIANT: no provider here may implement OnModuleInit, and no import may
 * bring one in. Booting this context must write nothing.
 */
@Module({
  imports: [
    // Same envFilePath contract as app.module.ts:40-48 — Docker injects
    // DB_*/REDIS_* directly; on a host, .env.local (or .env.test) is the
    // fallback. Earlier entries win.
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath:
        process.env.NODE_ENV === 'test' ? ['.env.test'] : ['.env.local'],
    }),
    TypeOrmModule.forRootAsync({ useClass: ReconcileCliDatabaseConfig }),
    TypeOrmModule.forFeature([BackupSchedule]),
    BullModule.forRootAsync(createBullOptions()),
    BullModule.registerQueue({ ...RECONCILE_QUEUE_OPTIONS }),
  ],
  providers: [OrphanedSchedulerReconciler],
})
export class ReconcileSchedulersCliModule {}
