import { ConfigService } from '@nestjs/config';
import {
  RECONCILE_QUEUE_OPTIONS,
  ReconcileCliDatabaseConfig,
  ReconcileSchedulersCliModule,
} from './reconcile-schedulers.module';

describe('ReconcileCliDatabaseConfig', () => {
  const configWith = (values: Record<string, string>) =>
    ({
      get: (key: string, fallback?: string) => values[key] ?? fallback,
    }) as unknown as ConfigService;

  const baseEnv = {
    NODE_ENV: 'development',
    DB_HOST: 'localhost',
    DB_PORT: '5432',
    DB_USERNAME: 'erp',
    DB_PASSWORD: 'erp-password',
    DB_DATABASE: 'erp',
  };

  it('forces synchronize off even when DB_SYNCHRONIZE=true', () => {
    // The whole point: a default environment already yields false, so this
    // must set the variable to distinguish "forced" from "inherited".
    const options = new ReconcileCliDatabaseConfig(
      configWith({ ...baseEnv, DB_SYNCHRONIZE: 'true' }),
    ).createTypeOrmOptions();

    expect(options.synchronize).toBe(false);
    expect(options.migrationsRun).toBe(false);
  });

  it('preserves the shared connection settings', () => {
    const options = new ReconcileCliDatabaseConfig(
      configWith({ ...baseEnv, DB_HOST: 'db-host', DB_PORT: '5544' }),
    ).createTypeOrmOptions() as any;

    // Proves it went through createDatabaseConfig rather than returning a
    // bare literal that silently drops SSL/pool configuration.
    expect(options.host).toBe('db-host');
    expect(options.port).toBe(5544);
    expect(options.entities.length).toBeGreaterThan(0);
  });
});

describe('ReconcileSchedulersCliModule', () => {
  it('registers no provider with an onModuleInit hook', () => {
    const providers: any[] =
      Reflect.getMetadata('providers', ReconcileSchedulersCliModule) ?? [];

    // A seeder-carrying import would otherwise mutate during --dry-run.
    for (const provider of providers) {
      const target = provider?.useClass ?? provider;
      expect(typeof target?.prototype?.onModuleInit).toBe('undefined');
    }
    expect(providers.length).toBeGreaterThan(0);
  });

  it('registers the backup queue with metas updates suppressed', () => {
    // Asserted against the exported options object, not serialized module
    // metadata: a substring check would pass for `skipMetasUpdate: false` or
    // for the flag landing on the wrong queue.
    expect(RECONCILE_QUEUE_OPTIONS.name).toBe('backup-queue');
    expect(RECONCILE_QUEUE_OPTIONS.skipMetasUpdate).toBe(true);
  });
});