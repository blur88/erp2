import { resolveReconcileOptions, runCli } from './reconcile-schedulers';
import {
  EmptyResultGuardError,
  ReconcileExecutionError,
} from '../../modules/backup/orphaned-scheduler-reconciler.service';

// Keep the CLI's own output out of the test log.
beforeEach(() => {
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('resolveReconcileOptions', () => {
  it('defaults to dry-run', () => {
    expect(resolveReconcileOptions([])).toEqual({
      dryRun: true,
      allowEmpty: false,
    });
  });

  it('--execute switches to the mutating mode', () => {
    expect(resolveReconcileOptions(['--execute'])).toEqual({
      dryRun: false,
      allowEmpty: false,
    });
  });

  it('--allow-empty with --execute suppresses the guard', () => {
    expect(resolveReconcileOptions(['--execute', '--allow-empty'])).toEqual({
      dryRun: false,
      allowEmpty: true,
    });
  });

  it('rejects --allow-empty without --execute', () => {
    // The flag authorizes a mutation; pairing it with a mode that mutates
    // nothing signals a misunderstanding worth surfacing.
    expect(() => resolveReconcileOptions(['--allow-empty'])).toThrow(
      '--allow-empty requires --execute',
    );
  });

  it('rejects unknown flags', () => {
    // A mistyped --exectue must not silently read as a dry-run the operator
    // believes executed.
    expect(() => resolveReconcileOptions(['--exectue'])).toThrow(
      'Unknown argument: --exectue',
    );
  });
});

describe('runCli exit codes', () => {
  const scan = {
    orphans: [],
    unclassifiable: [],
    legacySkipped: [],
    scanned: 0,
    classified: 0,
    liveCount: 0,
  };
  const candidate = { member: 'abc', scheduleId: 'sched-1' };

  const reconcilerReturning = (result: any) => ({
    reconcileOrphanedSchedulers: jest.fn().mockResolvedValue(result),
  });
  const reconcilerRejecting = (error: unknown) => ({
    reconcileOrphanedSchedulers: jest.fn().mockRejectedValue(error),
  });

  it('exits 0 on a clean dry-run', async () => {
    const code = await runCli(
      [],
      reconcilerReturning({
        mode: 'dry-run',
        scan,
        candidates: [],
        removals: [],
        emptyGuard: 'not-triggered',
      }) as any,
    );
    expect(code).toBe(0);
  });

  it('exits 0 on a dry-run that reports the all-orphan condition', async () => {
    // Reporting is a successful run, not a failure.
    const code = await runCli(
      [],
      reconcilerReturning({
        mode: 'dry-run',
        scan,
        candidates: [candidate],
        removals: [],
        emptyGuard: 'reported',
      }) as any,
    );
    expect(code).toBe(0);
  });

  it('exits 1 when the scan fails', async () => {
    const code = await runCli(
      ['--execute'],
      reconcilerRejecting(new Error('connection refused')) as any,
    );
    expect(code).toBe(1);
  });

  it('exits 1 when the empty-result guard blocks execution', async () => {
    const code = await runCli(
      ['--execute'],
      reconcilerRejecting(new EmptyResultGuardError([candidate])) as any,
    );
    expect(code).toBe(1);
  });

  it('exits 1 on a partial execution failure', async () => {
    const code = await runCli(
      ['--execute'],
      reconcilerRejecting(
        new ReconcileExecutionError(
          candidate,
          [{ ...candidate, member: 'done', removed: true }],
          [],
          new Error('redis unavailable'),
        ),
      ) as any,
    );
    expect(code).toBe(1);
  });

  it('exits 1 on a usage error before touching the reconciler', async () => {
    const reconciler = reconcilerReturning(null);
    const code = await runCli(['--allow-empty'], reconciler as any);

    expect(code).toBe(1);
    expect(reconciler.reconcileOrphanedSchedulers).not.toHaveBeenCalled();
  });
});