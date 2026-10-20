import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { DataSource, MigrationExecutor, MigrationInterface } from 'typeorm';
import { createDatabaseConfig } from '../src/config/database-config.factory';
import { RestoreMissingStockConstraints1792517391166 } from '../src/database/migrations/1792517391166-RestoreMissingStockConstraints';

const migrationName = 'RestoreMissingStockConstraints1792517391166';
dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });
const expectedNames = [
  'FK_stock_occurrences_legacy_journal',
  'CHK_stock_occurrence_reversal_reason_length',
  'CHK_stock_batch_consumptions_quantity_positive',
  'FK_purchase_cost_history_occurrence',
];
const database = `erp_1414_atomic_${process.pid}`;
let dataSource: DataSource;

async function maintenanceClient(): Promise<Client> {
  const options = createDatabaseConfig(new ConfigService(process.env), false);
  if (options.type !== 'postgres') throw new Error('Atomicity test requires PostgreSQL');
  const client = new Client({
    host: options.host,
    port: options.port,
    user: options.username,
    password: options.password,
    database: 'postgres',
  });
  await client.connect();
  return client;
}

async function committedSnapshot() {
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  try {
    const constraints = await runner.query(
      `SELECT conname, convalidated FROM pg_constraint
       WHERE connamespace = 'public'::regnamespace AND conname = ANY($1::text[])
       ORDER BY conname`,
      [expectedNames],
    );
    const migrations = await runner.query(
      'SELECT name FROM migrations WHERE name = $1',
      [migrationName],
    );
    return { constraints, migrations };
  } finally {
    await runner.release();
  }
}

beforeAll(async () => {
  const options = createDatabaseConfig(new ConfigService(process.env), false);
  if (options.type !== 'postgres') throw new Error('Atomicity test requires PostgreSQL');
  const admin = await maintenanceClient();
  try {
    await admin.query(`CREATE DATABASE "${database}"`);
  } finally {
    await admin.end();
  }
  dataSource = new DataSource({
    ...options,
    database,
    migrationsTransactionMode: 'each',
  });
  await dataSource.initialize();
  await dataSource.runMigrations({ transaction: 'each' });
});

beforeEach(async () => {
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  try {
    for (const [table, name] of [
      ['stock_occurrences', expectedNames[0]],
      ['stock_occurrences', expectedNames[1]],
      ['stock_batch_consumptions', expectedNames[2]],
      ['purchase_cost_history', expectedNames[3]],
    ]) {
      await runner.query(
        `ALTER TABLE public."${table}" DROP CONSTRAINT IF EXISTS "${name}"`,
      );
    }
    await runner.query('DELETE FROM migrations WHERE name = $1', [migrationName]);
  } finally {
    await runner.release();
  }
});

afterAll(async () => {
  try {
    if (dataSource?.isInitialized) await dataSource.destroy();
  } finally {
    const admin = await maintenanceClient();
    try {
      await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  }
});

describe('restore stock constraints migration atomicity', () => {
  it("the executor's transaction rolls back earlier additions when a later one fails", async () => {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    const query = runner.query.bind(runner);
    runner.query = async (sql: string, parameters?: unknown[], useStructuredResult?: boolean) => {
      if (sql.includes('ADD CONSTRAINT "FK_purchase_cost_history_occurrence"')) {
        throw new Error('injected final constraint failure');
      }
      return query(sql, parameters, useStructuredResult);
    };
    try {
      const executor = new MigrationExecutor(dataSource, runner);
      executor.transaction = 'each';
      await expect(executor.executePendingMigrations()).rejects.toThrow(
        'injected final constraint failure',
      );
    } finally {
      await runner.release();
    }
    expect(await committedSnapshot()).toEqual({ constraints: [], migrations: [] });
  });

  it("the executor commits all four when nothing fails", async () => {
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    try {
      const executor = new MigrationExecutor(dataSource, runner);
      executor.transaction = 'each';
      await executor.executePendingMigrations();
    } finally {
      await runner.release();
    }
    const snapshot = await committedSnapshot();
    expect(snapshot.constraints).toHaveLength(4);
    expect(snapshot.constraints.every((row: { convalidated: boolean }) => row.convalidated)).toBe(true);
    expect(snapshot.migrations).toEqual([{ name: migrationName }]);
  });

  it("keeps TypeORM's per-migration transaction", () => {
    const instance: MigrationInterface = new RestoreMissingStockConstraints1792517391166();
    expect(instance.transaction).not.toBe(false);
    expect(createDatabaseConfig(new ConfigService(process.env), false).migrationsTransactionMode).toBe('each');
  });
});
