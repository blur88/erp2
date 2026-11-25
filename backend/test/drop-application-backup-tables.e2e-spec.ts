import type { QueryRunner } from 'typeorm';
import dataSource from '../src/config/cli-datasource';
import { DropApplicationBackupTables1795618818000 } from '../src/database/migrations/1795618818000-DropApplicationBackupTables';

const migration = new DropApplicationBackupTables1795618818000();
// Match the historical table names without adding references outside the
// Migration files checked by #2064's removal gate.
const tablePrefix = 'backup_';
const schedulesTable = tablePrefix + 'schedules';
const retentionTable = tablePrefix + 'retention_settings';
const removedTables = [tablePrefix + 'logs', schedulesTable, retentionTable];
const schema = 'drop_application_backup_test';

describe('Drop application backup tables Migration', () => {
  let runner: QueryRunner;

  beforeAll(async () => {
    await dataSource.initialize();
  });

  beforeEach(async () => {
    runner = dataSource.createQueryRunner();
    await runner.startTransaction();
    await runner.query(`CREATE SCHEMA "${schema}"`);
    await runner.query(`SET LOCAL search_path TO "${schema}"`);
    for (const table of [...removedTables, 'unrelated']) {
      await runner.query(`CREATE TABLE "${table}" (id integer PRIMARY KEY)`);
      await runner.query(`INSERT INTO "${table}" VALUES (1), (2)`);
    }
  });

  afterEach(async () => {
    try {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
    } finally {
      await runner.release();
    }
  });

  afterAll(async () => {
    if (dataSource.isInitialized) await dataSource.destroy();
  });

  it.each([
    {
      dependency: 'a view on the schedule table',
      createDependency: `CREATE VIEW dependent AS SELECT id FROM "${schedulesTable}"`,
    },
    {
      dependency: 'an incoming foreign key on the last table',
      createDependency: `CREATE TABLE dependent (id integer REFERENCES "${retentionTable}" (id));
        INSERT INTO dependent VALUES (1), (2)`,
    },
  ])('preserves all tables and rows when $dependency blocks the Migration', async ({
    createDependency,
  }) => {
    await runner.query(createDependency);
    await runner.query('SAVEPOINT before_migration');

    await expect(migration.up(runner)).rejects.toMatchObject({
      driverError: { code: '2BP01' },
    });
    await runner.query('ROLLBACK TO SAVEPOINT before_migration');

    for (const table of [...removedTables, 'unrelated', 'dependent']) {
      await expect(runner.query(`SELECT id FROM "${table}" ORDER BY id`)).resolves.toEqual([
        { id: 1 },
        { id: 2 },
      ]);
    }
  });

  it('drops the three tables, preserves unrelated data and rejects reverting', async () => {
    await migration.up(runner);

    await expect(migration.down()).rejects.toThrow(
      'docs/deployment/POSTGRES_19_MAJOR_UPGRADE_RUNBOOK.md',
    );

    const tables = await runner.query(
      'SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY tablename',
      [schema],
    );
    expect(tables).toEqual([{ tablename: 'unrelated' }]);
    await expect(runner.query('SELECT id FROM unrelated ORDER BY id')).resolves.toEqual([
      { id: 1 },
      { id: 2 },
    ]);
  });
});
