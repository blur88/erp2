import { Queue as QueueV5 } from 'bullmq-v5';
import { IRedisClient, Queue as QueueV6, Worker, Job } from 'bullmq';
import { Repository } from 'typeorm';
import { BackupSchedule } from '@database/entities/backup-schedule.entity';
import { BackupSchedulerService } from '@modules/backup/backup-scheduler.service';
import { BackupService } from '@modules/backup/backup.service';
import {
  OrphanedSchedulerReconciler,
  ReconcileExecutionError,
  EmptyResultGuardError,
} from '@modules/backup/orphaned-scheduler-reconciler.service';

const connection = {
  host: process.env.REDIS_TEST_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_TEST_PORT || '6399'),
};

const QUEUE = 'backup-queue';

/**
 * BullMQ's IRedisClient declares del/zrange/zcard/zscore/hexists but omits
 * keys/exists/zadd, which this test needs. Extend narrowly rather than
 * casting the whole client to any.
 */
type TestRedisClient = IRedisClient & {
  keys(pattern: string): Promise<string[]>;
  exists(key: string): Promise<number>;
  zadd(key: string, score: number, member: string): Promise<number>;
};

const testClient = async (q: QueueV6): Promise<TestRedisClient> =>
  (await q.getBackend().client) as TestRedisClient;

describe('Orphaned scheduler reconciliation (real Redis)', () => {
  let prefix: string;
  let v5: QueueV5;
  let v6: QueueV6;
  let service: BackupSchedulerService;
  let schedule: BackupSchedule;
  // Declared here so afterEach can always close it — an assertion that throws
  // mid-test would otherwise leak the worker and hang Jest.
  let worker: Worker | undefined;

  beforeEach(async () => {
    worker = undefined;
    // Unique prefix per test — never the persistent dev queue.
    prefix = `test-bullmq-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    v5 = new QueueV5(QUEUE, { connection, prefix });
    v6 = new QueueV6(QUEUE, { connection, prefix });
    await v5.waitUntilReady();
    await v6.waitUntilReady();

    schedule = {
      id: 'schedule-1',
      name: 'Nightly',
      enabled: true,
      frequency: 'daily',
      time: '02:30',
      databases: ['erp'],
      includeSettings: true,
    } as BackupSchedule;

    const repo = {
      find: jest.fn().mockResolvedValue([schedule]),
    } as unknown as Repository<BackupSchedule>;

    service = new BackupSchedulerService(
      repo,
      v6 as any,
      {} as BackupService,
      new OrphanedSchedulerReconciler(repo, v6 as any),
    );
  });

  afterEach(async () => {
    // Close the worker FIRST — it holds a blocking connection.
    if (worker) await worker.close();
    const client = await testClient(v6);
    const keys = await client.keys(`${prefix}:*`);
    if (keys.length) await client.del(...keys);
    await v5.close();
    await v6.close();
  });

  /**
   * Issue #1045 contract (was the #1044 probe). v6 does not reconcile an
   * orphaned v5 scheduler-format entry on its own — #1044 established that —
   * so removal is the reconciler's job. This is the execute-removal contract:
   * member, metadata hash, delayed occurrence, and delayed job hash all gone.
   */
  it('reconciliation fully removes an orphaned v5 scheduler-format entry', async () => {
    const ORPHAN_MEMBER = '60f88ec415a02b45f5c02094f3aca23d';
    const ORPHAN_SCHEDULE_ID = 'a556cb35-6161-4033-8779-880b60cda72a';

    const client = await testClient(v6);
    const repeatKey = `${prefix}:${QUEUE}:repeat`;
    const delayedKey = `${prefix}:${QUEUE}:delayed`;

    // A genuinely UNRELATED live schedule, so the orphan is never the thing
    // being upserted — and so the empty-result guard is not what protects it.
    schedule.id = 'live-unrelated-1';
    schedule.name = 'Live Unrelated';

    await v5.upsertJobScheduler(
      ORPHAN_MEMBER,
      { pattern: '00 02 * * *' },
      {
        name: 'create-backup',
        data: { scheduleId: ORPHAN_SCHEDULE_ID, type: 'full' },
      },
    );

    // Preconditions: the fixture reproduces the observed production shape.
    expect(await client.zrange(repeatKey, 0, -1)).toContain(ORPHAN_MEMBER);
    expect(await client.hexists(`${repeatKey}:${ORPHAN_MEMBER}`, 'ic')).toBe(1);
    expect(ORPHAN_MEMBER).toMatch(/^[0-9a-f]{32}$/);
    const delayedBefore = (await client.zrange(delayedKey, 0, -1)).filter((d) =>
      d.startsWith(`repeat:${ORPHAN_MEMBER}:`),
    );
    expect(delayedBefore).toHaveLength(1);
    expect(await client.exists(`${prefix}:${QUEUE}:${delayedBefore[0]}`)).toBe(1);

    const repo = {
      find: jest.fn().mockResolvedValue([schedule]),
    } as unknown as Repository<BackupSchedule>;
    const reconciler = new OrphanedSchedulerReconciler(repo, v6 as any);

    await service.onModuleInit(); // registers the live scheduler
    const result = await reconciler.reconcileOrphanedSchedulers({
      dryRun: false,
      allowEmpty: false,
    });

    expect(result.removals).toEqual([
      { member: ORPHAN_MEMBER, scheduleId: ORPHAN_SCHEDULE_ID, removed: true },
    ]);

    // Fully gone: member, metadata, delayed occurrence, delayed job hash.
    expect(await client.zrange(repeatKey, 0, -1)).not.toContain(ORPHAN_MEMBER);
    expect(await client.exists(`${repeatKey}:${ORPHAN_MEMBER}`)).toBe(0);
    expect(await client.zscore(delayedKey, delayedBefore[0])).toBeNull();
    expect(await client.exists(`${prefix}:${QUEUE}:${delayedBefore[0]}`)).toBe(0);

    // The live scheduler is untouched.
    expect(await client.zrange(repeatKey, 0, -1)).toContain(
      'schedule-live-unrelated-1',
    );
  });

  /**
   * Issue #1045 contract (was the #1044 probe). Key removal is not enough —
   * #1044 proved the orphan actively fires a deleted schedule's backup. A
   * due-now pattern puts the occurrence inside the test window, so this fails
   * if removal leaves anything runnable behind.
   */
  it('a reconciled orphan never fires', async () => {
    const ORPHAN_MEMBER = '60f88ec415a02b45f5c02094f3aca23d';
    const ORPHAN_SCHEDULE_ID = 'a556cb35-6161-4033-8779-880b60cda72a';

    schedule.id = 'live-unrelated-1';
    schedule.name = 'Live Unrelated';

    await v5.upsertJobScheduler(
      ORPHAN_MEMBER,
      { pattern: '* * * * * *' }, // every second — due inside the window
      {
        name: 'create-backup',
        data: { scheduleId: ORPHAN_SCHEDULE_ID, type: 'full' },
      },
    );

    const repo = {
      find: jest.fn().mockResolvedValue([schedule]),
    } as unknown as Repository<BackupSchedule>;
    const reconciler = new OrphanedSchedulerReconciler(repo, v6 as any);

    // Reconcile BEFORE the worker starts, so nothing can fire in the gap.
    await service.onModuleInit();
    await reconciler.reconcileOrphanedSchedulers({
      dryRun: false,
      allowEmpty: false,
    });

    const fired: string[] = [];
    worker = new Worker(
      QUEUE,
      async (job: Job) => {
        fired.push(String((job.data as { scheduleId?: string }).scheduleId));
      },
      { connection, prefix },
    );
    await worker.waitUntilReady();

    await new Promise((resolve) => setTimeout(resolve, 4000));

    // The deleted schedule's backup must never run again. The pre-fix
    // behavior fired ~4x in this window.
    expect(fired).not.toContain(ORPHAN_SCHEDULE_ID);
  });

  describe('OrphanedSchedulerReconciler (issue #1045)', () => {
    const ORPHAN_MEMBER = '60f88ec415a02b45f5c02094f3aca23d';
    const ORPHAN_SCHEDULE_ID = 'a556cb35-6161-4033-8779-880b60cda72a';
    const LIVE_ID = 'live-unrelated-1';

    let repo: Repository<BackupSchedule>;
    let reconciler: OrphanedSchedulerReconciler;
    let repeatKey: string;
    let delayedKey: string;

    /** Seeds a genuine v5 scheduler-format entry (ic present, bare-hex member). */
    const seedOrphan = async (pattern = '00 02 * * *', member = ORPHAN_MEMBER) => {
      await v5.upsertJobScheduler(
        member,
        { pattern },
        {
          name: 'create-backup',
          data: { scheduleId: ORPHAN_SCHEDULE_ID, type: 'full' },
        },
      );
    };

    /** Registers a live v6 scheduler so scans have a confirmed-live row. */
    const seedLive = async () => {
      await v6.upsertJobScheduler(
        `schedule-${LIVE_ID}`,
        { pattern: '00 03 * * *' },
        { name: 'create-backup', data: { scheduleId: LIVE_ID } },
      );
    };

    /** True when member, metadata hash, and a delayed occurrence all exist. */
    const orphanIntact = async (member = ORPHAN_MEMBER) => {
      const client = await testClient(v6);
      const members = await client.zrange(repeatKey, 0, -1);
      const delayed = await client.zrange(delayedKey, 0, -1);
      return {
        member: members.includes(member),
        meta: await client.exists(`${repeatKey}:${member}`),
        delayed: delayed.filter((d) => d.startsWith(`repeat:${member}:`)).length,
      };
    };

    beforeEach(() => {
      repeatKey = `${prefix}:${QUEUE}:repeat`;
      delayedKey = `${prefix}:${QUEUE}:delayed`;
      schedule.id = LIVE_ID;
      schedule.name = 'Live Unrelated';
      repo = {
        find: jest.fn().mockResolvedValue([schedule]),
      } as unknown as Repository<BackupSchedule>;
      reconciler = new OrphanedSchedulerReconciler(repo, v6 as any);
    });

    // In afterEach, not at the end of the test that spies: an assertion that
    // throws would otherwise skip the restore and leak the spy into siblings.
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('dry-run reports the orphan without mutating', async () => {
      await seedLive();
      await seedOrphan();

      const result = await reconciler.reconcileOrphanedSchedulers({
        dryRun: true,
        allowEmpty: false,
      });

      expect(result.mode).toBe('dry-run');
      expect(result.candidates).toEqual([
        { member: ORPHAN_MEMBER, scheduleId: ORPHAN_SCHEDULE_ID },
      ]);
      expect(result.removals).toEqual([]);
      expect(result.emptyGuard).toBe('not-triggered');
      expect(await orphanIntact()).toEqual({ member: true, meta: 1, delayed: 1 });
    });

    // NOTE: execute-removal is NOT tested here. It is the inverted probe in
    // this same task (Step 6), which asserts the full four-way teardown —
    // member, metadata, delayed occurrence, delayed job hash. Duplicating it
    // here would give two tests one job.

    it('never removes a live scheduler when no orphan exists', async () => {
      await seedLive();

      const result = await reconciler.reconcileOrphanedSchedulers({
        dryRun: false,
        allowEmpty: false,
      });

      expect(result.candidates).toEqual([]);
      expect(result.removals).toEqual([]);
      const client = await testClient(v6);
      expect(await client.zrange(repeatKey, 0, -1)).toEqual([
        `schedule-${LIVE_ID}`,
      ]);
    });

    it('aborts without mutating when the DB read throws', async () => {
      await seedLive();
      await seedOrphan();
      (repo.find as jest.Mock).mockRejectedValue(new Error('connection refused'));

      await expect(
        reconciler.reconcileOrphanedSchedulers({
          dryRun: false,
          allowEmpty: false,
        }),
      ).rejects.toThrow('connection refused');

      expect(await orphanIntact()).toEqual({ member: true, meta: 1, delayed: 1 });
    });

    it('blocks execution when every candidate looks orphaned', async () => {
      await seedOrphan();
      (repo.find as jest.Mock).mockResolvedValue([]);

      await expect(
        reconciler.reconcileOrphanedSchedulers({
          dryRun: false,
          allowEmpty: false,
        }),
      ).rejects.toBeInstanceOf(EmptyResultGuardError);

      expect(await orphanIntact()).toEqual({ member: true, meta: 1, delayed: 1 });
    });

    it('dry-run reports an all-orphan scan instead of aborting', async () => {
      await seedOrphan();
      (repo.find as jest.Mock).mockResolvedValue([]);

      const result = await reconciler.reconcileOrphanedSchedulers({
        dryRun: true,
        allowEmpty: false,
      });

      expect(result.emptyGuard).toBe('reported');
      expect(result.candidates).toEqual([
        { member: ORPHAN_MEMBER, scheduleId: ORPHAN_SCHEDULE_ID },
      ]);
      expect(await orphanIntact()).toEqual({ member: true, meta: 1, delayed: 1 });
    });

    it('allowEmpty permits the all-orphan execution', async () => {
      await seedOrphan();
      (repo.find as jest.Mock).mockResolvedValue([]);

      const result = await reconciler.reconcileOrphanedSchedulers({
        dryRun: false,
        allowEmpty: true,
      });

      expect(result.emptyGuard).toBe('overridden');
      expect(result.removals).toEqual([
        { member: ORPHAN_MEMBER, scheduleId: ORPHAN_SCHEDULE_ID, removed: true },
      ]);
      expect(await orphanIntact()).toEqual({ member: false, meta: 0, delayed: 0 });
    });

    it('never removes a non-ic legacy entry, even with allowEmpty', async () => {
      // The legacy API: hashed member, NO ic field, but data carries a
      // scheduleId — the exact shape an unfiltered scan would misclassify.
      await v5.add(
        'create-backup',
        { scheduleId: ORPHAN_SCHEDULE_ID },
        { repeat: { pattern: '00 02 * * *' }, jobId: 'legacy-1' },
      );
      (repo.find as jest.Mock).mockResolvedValue([]);

      const client = await testClient(v6);
      const [legacyMember] = await client.zrange(repeatKey, 0, -1);
      expect(await client.hexists(`${repeatKey}:${legacyMember}`, 'ic')).toBe(0);

      const result = await reconciler.reconcileOrphanedSchedulers({
        dryRun: false,
        allowEmpty: true,
      });

      expect(result.scan.legacySkipped).toEqual([legacyMember]);
      expect(result.candidates).toEqual([]);
      expect(result.removals).toEqual([]);
      expect(await orphanIntact(legacyMember)).toEqual({
        member: true,
        meta: 1,
        delayed: 1,
      });
    });

    it('reports prior successes when a removal fails mid-loop', async () => {
      const SECOND_MEMBER = '70f88ec415a02b45f5c02094f3aca23e';
      await seedLive();
      await seedOrphan('00 02 * * *', ORPHAN_MEMBER);
      await seedOrphan('00 04 * * *', SECOND_MEMBER);

      // ZSCAN order is not guaranteed, so which orphan is reached first is not
      // knowable in advance. Fail on the SECOND removal attempt whatever its
      // member, then read the identities back off the error. Asserting a fixed
      // member order here would be a flaky test dressed as a strict one.
      const real = v6.removeJobScheduler.bind(v6);
      let attempts = 0;
      jest
        .spyOn(v6, 'removeJobScheduler')
        .mockImplementation(async (member: string) => {
          attempts++;
          if (attempts === 2) throw new Error('redis unavailable');
          return real(member);
        });

      const error = await reconciler
        .reconcileOrphanedSchedulers({ dryRun: false, allowEmpty: false })
        .catch((e) => e);

      expect(error).toBeInstanceOf(ReconcileExecutionError);
      expect(error.completed).toHaveLength(1);
      expect(error.completed[0].removed).toBe(true);
      expect(error.remaining).toEqual([]);
      expect((error.cause as Error).message).toBe('redis unavailable');

      // Both orphans belong to the same deleted schedule.
      expect(error.failed.scheduleId).toBe(ORPHAN_SCHEDULE_ID);
      expect(error.completed[0].scheduleId).toBe(ORPHAN_SCHEDULE_ID);

      // The two members are the seeded pair, in whichever order was scanned.
      expect([error.completed[0].member, error.failed.member].sort()).toEqual(
        [ORPHAN_MEMBER, SECOND_MEMBER].sort(),
      );

      // The error's report must match the actual store, not just its own
      // bookkeeping: the one it claims to have removed is gone, the one it
      // claims failed is fully intact.
      expect(await orphanIntact(error.completed[0].member)).toEqual({
        member: false,
        meta: 0,
        delayed: 0,
      });
      expect(await orphanIntact(error.failed.member)).toEqual({
        member: true,
        meta: 1,
        delayed: 1,
      });
    });

    it('ordinary boot stays report-only and never deletes the orphan', async () => {
      await seedOrphan();

      const bootRepo = {
        find: jest.fn().mockResolvedValue([schedule]),
      } as unknown as Repository<BackupSchedule>;
      const bootService = new BackupSchedulerService(
        bootRepo,
        v6 as any,
        {} as BackupService,
        new OrphanedSchedulerReconciler(bootRepo, v6 as any),
      );

      await bootService.onModuleInit();

      // Diagnostic only: the orphan is warned about, never removed.
      expect(await orphanIntact()).toEqual({ member: true, meta: 1, delayed: 1 });
    });
  });
});
