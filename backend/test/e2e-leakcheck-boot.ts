/**
 * Seed-materializing boot for the leak-check gate (#1204).
 *
 * The bootstrap `admin` user and the `RETAIL` price list do NOT come from the
 * InitialSchema migration — they come from OnModuleInit runtime seeders
 * (users-seeder.service.ts, price-lists-seeder.service.ts) that fire when a
 * suite boots the Nest app. Measured on a real database: after
 * `migration:run` both `users` and `price_lists` are EMPTY; after one app boot
 * they hold exactly one row each.
 *
 * So a baseline captured straight after migrations would report both tables as
 * leaks on pass 1 — the two tables issue #1204 names as must-be-preserved.
 * This entry boots the app once so the baseline is "migrated schema plus
 * whatever the app seeds on boot", derived from a real boot rather than a
 * hand-maintained allow-list that would go stale when a seeder is added.
 *
 * Suites use Test.createTestingModule({ imports: [AppModule] }), so an
 * application context runs the same seeders.
 *
 * Lives in test/ deliberately: tsconfig.cli.json includes everything under
 * src/database/cli/, and an entry there would drag AppModule into the
 * plain-tsc pass that overwrites nest build's dist/ output (see CLAUDE.md).
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  // Any failure here must abort before a baseline is recorded, so it
  // propagates rather than being swallowed.
  await app.close();
  console.log('SEED_BOOT_OK');
}

main().catch((err: Error) => {
  console.error(`SEED_BOOT_FAIL: ${err.message}`);
  process.exit(1);
});
