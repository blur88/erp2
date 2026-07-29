/**
 * Baseline guard for the #950 migration transition.
 *
 * Databases whose schema was built by TypeORM `schema:sync` (the old
 * entrypoint fell back to it whenever the broken migration chain failed) have
 * tables but no rows in `migrations`. Running `migration:run` against one makes
 * TypeORM believe no migration has ever been applied, so the InitialSchema
 * genesis migration re-creates the schema and the existing data is lost.
 *
 * Prints exactly one token on stdout for the entrypoint to branch on:
 *   FRESH      — no user tables; migrations may run and build the schema.
 *   BASELINED  — migration history present; migration:run applies only pending.
 *   NEEDS_FAKE — schema exists but history is empty; requires migration:run --fake.
 *
 * Any failure to determine the state exits non-zero so the entrypoint stops
 * rather than guessing.
 */
import dataSource from '../config/cli-datasource';

async function main(): Promise<void> {
  // This guard must never write. The shared CLI DataSource honours
  // DB_SYNCHRONIZE, so initialize() would ALTER the very schema we are about
  // to judge — exactly the damage this check exists to prevent.
  dataSource.setOptions({ synchronize: false, migrationsRun: false });

  await dataSource.initialize();

  try {
    const queryRunner = dataSource.createQueryRunner();

    try {
      // Count application tables, ignoring TypeORM's own bookkeeping table.
      const tableRows = await queryRunner.query(
        `SELECT count(*)::int AS count
           FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_type = 'BASE TABLE'
            AND table_name <> 'migrations'`,
      );
      const tableCount: number = tableRows[0].count;

      if (tableCount === 0) {
        // Empty database — genesis migration is expected to build everything.
        process.stdout.write('FRESH');
        return;
      }

      const hasMigrationsTable = await queryRunner.hasTable('migrations');

      if (!hasMigrationsTable) {
        // Schema present, TypeORM has never recorded anything here.
        process.stdout.write('NEEDS_FAKE');
        return;
      }

      const migrationRows = await queryRunner.query(
        `SELECT count(*)::int AS count FROM migrations`,
      );
      const migrationCount: number = migrationRows[0].count;

      process.stdout.write(migrationCount === 0 ? 'NEEDS_FAKE' : 'BASELINED');
    } finally {
      await queryRunner.release();
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error('[check-baseline] Failed to determine migration baseline state.');
  console.error(error);
  process.exit(1);
});
