import { NestFactory } from '@nestjs/core';
import { ReconcileSchedulersCliModule } from './reconcile-schedulers.module';
import {
  EmptyResultGuardError,
  OrphanedSchedulerReconciler,
  ReconcileExecutionError,
  ReconcileOptions,
} from '../../modules/backup/orphaned-scheduler-reconciler.service';

const KNOWN_FLAGS = ['--execute', '--allow-empty'];

/**
 * Dry-run is the default and mutation must be typed explicitly — inverting the
 * usual flag convention, because the destructive direction should be the one
 * you ask for.
 */
export function resolveReconcileOptions(argv: string[]): ReconcileOptions {
  for (const arg of argv) {
    if (!KNOWN_FLAGS.includes(arg)) {
      throw new Error(
        `Unknown argument: ${arg}. Usage: backup:reconcile-schedulers ` +
          `[--execute] [--allow-empty]`,
      );
    }
  }

  const dryRun = !argv.includes('--execute');
  const allowEmpty = argv.includes('--allow-empty');

  if (allowEmpty && dryRun) {
    throw new Error(
      '--allow-empty requires --execute. Dry-run already reports the ' +
        'all-orphan case without it.',
    );
  }

  return { dryRun, allowEmpty };
}

/**
 * The whole CLI body except process wiring, so exit-code mapping is testable
 * without booting Nest or touching process.exitCode. Returns the exit code
 * rather than calling process.exit().
 */
export async function runCli(
  argv: string[],
  reconciler: Pick<OrphanedSchedulerReconciler, 'reconcileOrphanedSchedulers'>,
): Promise<number> {
  let options: ReconcileOptions;
  try {
    options = resolveReconcileOptions(argv);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }

  try {
    const result = await reconciler.reconcileOrphanedSchedulers(options);

    console.log(
      `Scanned ${result.scan.scanned} repeat entries ` +
        `(${result.scan.classified} classified, ` +
        `${result.scan.liveCount} confirmed live, ` +
        `${result.scan.legacySkipped.length} legacy skipped, ` +
        `${result.scan.unclassifiable.length} unclassifiable).`,
    );

    if (!result.candidates.length) {
      console.log('No orphaned scheduler entries found.');
      return 0;
    }

    if (result.mode === 'dry-run') {
      console.log(`Would remove ${result.candidates.length} entries:`);
      for (const c of result.candidates) {
        console.log(`  ${c.member}  (scheduleId ${c.scheduleId})`);
      }
      if (result.emptyGuard === 'reported') {
        console.log(
          '\nWARNING: zero live schedules were confirmed, so every entry ' +
            'looks orphaned. This is indistinguishable from a failed ' +
            'database read. If you are certain, re-run with ' +
            '--execute --allow-empty.',
        );
      } else {
        console.log('\nRe-run with --execute to remove them.');
      }
      return 0;
    }

    for (const r of result.removals) {
      console.log(
        r.removed
          ? `Removed ${r.member} (scheduleId ${r.scheduleId})`
          : `Already absent: ${r.member} (concurrent removal — benign)`,
      );
    }
    console.log(
      `Removed ${result.removals.filter((r) => r.removed).length} entries.`,
    );
    return 0;
  } catch (error) {
    if (error instanceof ReconcileExecutionError) {
      console.error(`\n${error.message}`);
      console.error(`Cause: ${(error.cause as Error)?.message ?? error.cause}`);
      for (const r of error.completed) {
        console.error(`  already removed: ${r.member}`);
      }
      for (const c of error.remaining) {
        console.error(`  not attempted:   ${c.member}`);
      }
      console.error(
        '\nThe queue is partially reconciled. Nothing was rolled back — ' +
          're-run once the underlying failure is resolved.',
      );
    } else if (error instanceof EmptyResultGuardError) {
      console.error(`\n${error.message}`);
    } else {
      console.error(
        `reconcile-schedulers failed: ${(error as Error).message}`,
      );
    }
    return 1;
  }
}

/** Process wiring only — the sole place exit codes reach the process. */
async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(
    ReconcileSchedulersCliModule,
    { logger: ['error', 'warn', 'log'] },
  );

  try {
    process.exitCode = await runCli(
      process.argv.slice(2),
      app.get(OrphanedSchedulerReconciler),
    );
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    // Only reachable if the context itself failed to boot — runCli catches
    // everything downstream of it.
    console.error(`reconcile-schedulers failed to start: ${error.message}`);
    process.exitCode = 1;
  });
}