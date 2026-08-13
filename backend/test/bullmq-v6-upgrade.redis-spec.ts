import { Queue as QueueV5 } from 'bullmq-v5';
import { IRedisClient, Queue as QueueV6, Worker, Job } from 'bullmq';
import { Repository } from 'typeorm';
import { BackupSchedule } from '@database/entities/backup-schedule.entity';
import { BackupSchedulerService } from '@modules/backup/backup-scheduler.service';
import { BackupService } from '@modules/backup/backup.service';

const connection = {
  host: process.env.REDIS_TEST_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_TEST_PORT || '6399'),
};

const QUEUE = 'backup-queue';
const PATTERN = '30 02 * * *';

/**
 * Issue #1044 probe expectation. Set from the FIRST observed run against Redis
 * 8.6.1 (CI/prod parity) and then held, so a later change in v6's behavior
 * surfaces as a failure rather than silently redefining the branch. Change this
 * only alongside a decision recorded on #1044.
 */
const PROBE_EXPECTATION = {
  orphanPresent: true,
  metaExists: 1,
  orphanDelayedCount: 1,
  runnableDelayedCount: 1,
};

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

describe('BullMQ v5 → v6 upgrade (real Redis)', () => {
  let prefix: string;
  let v5: QueueV5;
  let v6: QueueV6;
  let service: BackupSchedulerService;
  let schedule: BackupSchedule;
  // Declared here so afterEach can always close it — an assertion that throws
  // mid-test would otherwise leak the worker and hang Jest.
  let worker: Worker | undefined;
  let processed: string[];

  beforeEach(async () => {
    worker = undefined;
    processed = [];
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

    service = new BackupSchedulerService(repo, v6 as any, {} as BackupService);
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

  it('removes the v5 repeatable and its delayed occurrence, leaving one scheduler', async () => {
    // 1. Seed with the REAL v5 API so the entry is genuinely hashed.
    await v5.add(
      'create-backup',
      { scheduleId: 'schedule-1' },
      { repeat: { pattern: PATTERN }, jobId: 'schedule-schedule-1' },
    );

    const client = await testClient(v6);
    const repeatKey = `${prefix}:${QUEUE}:repeat`;
    const delayedKey = `${prefix}:${QUEUE}:delayed`;

    const [member] = await client.zrange(repeatKey, 0, -1);
    expect(member).toMatch(/^[0-9a-f]{32}$/); // hashed, not colon-shaped
    expect(await client.hexists(`${repeatKey}:${member}`, 'ic')).toBe(0);

    // 2. Capture the delayed occurrence before migrating.
    const delayedBefore = await client.zrange(delayedKey, 0, -1);
    expect(delayedBefore).toHaveLength(1);
    const delayedId = delayedBefore[0];
    const score = await client.zscore(repeatKey, member);
    expect(delayedId).toBe(`repeat:${member}:${score}`);

    // 3. Migrate via the REAL service entry point.
    await service.onModuleInit();

    // 4a. Old repeat member and its metadata are gone.
    const repeatMembers = await client.zrange(repeatKey, 0, -1);
    expect(repeatMembers).not.toContain(member);
    expect(await client.exists(`${repeatKey}:${member}`)).toBe(0);

    // 4b. THE ORPHAN CASE: the old delayed occurrence and its job hash are gone.
    expect(await client.zscore(delayedKey, delayedId)).toBeNull();
    expect(await client.exists(`${prefix}:${QUEUE}:${delayedId}`)).toBe(0);

    // 4c. Exactly one scheduler remains — no duplicate.
    expect(repeatMembers).toEqual(['schedule-schedule-1']);

    // 5. Idempotent: a second init must be a no-op against a genuinely
    // v6-written scheduler (real ic field, not a mocked hexists) — coverage
    // the unit tests cannot provide.
    //
    // On how an inverted ic check is caught: it is the HASHED_MEMBER guard
    // that fires, not the assertions below. Inverting the check stops
    // 'schedule-schedule-1' being skipped, it fails the 32-char-hex test, and
    // onModuleInit REJECTS on the line below. The zrange/hexists assertions
    // only do independent work if that guard is also weakened, and they add no
    // signal beyond step 4a/4c, which fails first if cleanup is deleted.
    //
    // Pin the precondition the second init depends on — ic present BEFORE
    // re-init — so the assertion after it is a genuine before/after pair.
    expect(
      await client.hexists(`${repeatKey}:schedule-schedule-1`, 'ic'),
    ).toBe(1);

    await service.onModuleInit();

    expect(await client.zrange(repeatKey, 0, -1)).toEqual([
      'schedule-schedule-1',
    ]);
    expect(
      await client.hexists(`${repeatKey}:schedule-schedule-1`, 'ic'),
    ).toBe(1);
  });

  it('fires exactly one job after migration', async () => {
    // A fully-specified six-field cron matches ONE instant; its next match is
    // a year later (four years, if this runs on Feb 29 — either way far
    // outside the window). So within the test window a correct migration fires
    // exactly once, and a second execution can only mean a duplicate
    // scheduler survived. (An every-second pattern would legitimately fire
    // 2-3 times in the same window and could not distinguish the two.)
    // ~20s headroom so a cold worker or slow init cannot miss the sole
    // occurrence — if it were missed, the annual next match would never
    // arrive in-window and the test would fail for the wrong reason.
    const target = new Date(Date.now() + 20000);
    const pattern = [
      target.getSeconds(),
      target.getMinutes(),
      target.getHours(),
      target.getDate(),
      target.getMonth() + 1,
      '*',
    ].join(' ');

    schedule.cronExpression = pattern;

    await v5.add(
      'create-backup',
      { scheduleId: 'schedule-1' },
      { repeat: { pattern }, jobId: 'schedule-schedule-1' },
    );

    // Worker ready BEFORE init so no execution can be missed.
    worker = new Worker(
      QUEUE,
      async (job: Job) => {
        processed.push(job.name);
      },
      { connection, prefix },
    );
    await worker.waitUntilReady();

    await service.onModuleInit();

    // Wait past the target instant plus margin, measured from now so setup
    // time is not double-counted.
    const waitMs = target.getTime() - Date.now() + 2000;
    await new Promise((resolve) => setTimeout(resolve, waitMs));

    expect(processed).toEqual(['create-backup']);
  });

  /**
   * PROBE (issue #1044) — provisional, not yet a behavioral contract.
   *
   * Determines what BullMQ v6 actually does with a v5 SCHEDULER-format repeat
   * entry (bare-hex member, `ic` present) whose backing `backup_schedules` row
   * is gone. No code path in this repo removes such an entry:
   * `removeLegacyRepeatables()` skips it on the `ic` hit, `initializeSchedules()`
   * never reaches it (no DB row), and `removeScheduleFromQueue()` needs a live
   * entity. The one production entry observed on 2026-08-13 vanished across a
   * restart by an UNCONFIRMED mechanism; this pins down whether v6 is
   * responsible.
   *
   * State is captured at three checkpoints and the orphan-only projections are
   * compared for equality, so "v6 initialization" is never conflated with this
   * service's own behavior:
   *   1. after the v5 scheduler-format entry is seeded
   *   2. after the v6 queue becomes ready (v6 init alone, no service code)
   *   3. after the real onModuleInit() sequence
   *
   * v5's `upsertJobScheduler` stores the jobSchedulerId VERBATIM as the ZSET
   * member (job-scheduler.js — no hashing on the scheduler path), so passing a
   * bare 32-char hex id reproduces the observed shape exactly.
   */
  it('PROBE #1044: v6 behavior on an orphaned v5 scheduler-format entry', async () => {
    const ORPHAN_MEMBER = '60f88ec415a02b45f5c02094f3aca23d';
    const ORPHAN_SCHEDULE_ID = 'a556cb35-6161-4033-8779-880b60cda72a';

    const client = await testClient(v6);
    const repeatKey = `${prefix}:${QUEUE}:repeat`;
    const delayedKey = `${prefix}:${QUEUE}:delayed`;

    /**
     * The ORPHAN-ONLY projection. Deliberately excludes members belonging to
     * other schedules: checkpoint 3 legitimately adds the unrelated live
     * scheduler, so a whole-ZSET comparison would differ for a reason that has
     * nothing to do with the orphan. This projection is therefore directly
     * comparable across all three checkpoints.
     */
    const snapshot = async (label: string) => {
      const repeatMembers = await client.zrange(repeatKey, 0, -1);
      const delayed = await client.zrange(delayedKey, 0, -1);
      const orphanDelayed = delayed.filter((d) =>
        d.startsWith(`repeat:${ORPHAN_MEMBER}:`),
      );
      const delayedJobHashes: Record<string, number> = {};
      for (const d of orphanDelayed) {
        delayedJobHashes[d] = await client.exists(`${prefix}:${QUEUE}:${d}`);
      }
      return {
        label,
        repeatMembers,
        orphan: {
          present: repeatMembers.includes(ORPHAN_MEMBER),
          metaExists: await client.exists(`${repeatKey}:${ORPHAN_MEMBER}`),
          ic: await client.hexists(`${repeatKey}:${ORPHAN_MEMBER}`, 'ic'),
          data: await client.hget(`${repeatKey}:${ORPHAN_MEMBER}`, 'data'),
          delayed: orphanDelayed,
          delayedJobHashes,
        },
      };
    };

    // The repository mock returns a genuinely UNRELATED live schedule, so the
    // orphan is never the thing being upserted.
    schedule.id = 'live-unrelated-1';
    schedule.name = 'Live Unrelated';

    // --- Checkpoint 1: seed the v5 scheduler-format entry -----------------
    await v5.upsertJobScheduler(
      ORPHAN_MEMBER,
      { pattern: '00 02 * * *' },
      {
        name: 'create-backup',
        data: { scheduleId: ORPHAN_SCHEDULE_ID, type: 'full' },
      },
    );

    const cp1 = await snapshot('checkpoint-1: after v5 seed');
    // Preconditions: the fixture genuinely reproduces the observed shape.
    expect(cp1.orphan.present).toBe(true);
    expect(cp1.orphan.ic).toBe(1); // scheduler-format ⇒ removeLegacyRepeatables skips it
    expect(ORPHAN_MEMBER).toMatch(/^[0-9a-f]{32}$/); // bare hex, as observed
    expect(JSON.parse(cp1.orphan.data as string).scheduleId).toBe(
      ORPHAN_SCHEDULE_ID,
    );
    // The seeded occurrence is runnable — otherwise "it survives" would be a
    // claim about inert leftovers.
    expect(cp1.orphan.delayed).toHaveLength(1);
    expect(Object.values(cp1.orphan.delayedJobHashes)).toEqual([1]);

    // --- Checkpoint 2: v6 queue ready, no service code run ----------------
    const v6Fresh = new QueueV6(QUEUE, { connection, prefix });
    await v6Fresh.waitUntilReady();
    const cp2 = await snapshot('checkpoint-2: after v6 waitUntilReady');
    await v6Fresh.close();

    // --- Checkpoint 3: the real service init sequence ---------------------
    // legacy cleanup -> unrelated scheduler upsert -> orphan diagnostic
    await service.onModuleInit();
    const cp3 = await snapshot('checkpoint-3: after onModuleInit');

    // The unrelated live schedule must be registered regardless of branch —
    // proves the orphan is not merely surviving a failed/no-op init.
    expect(cp3.repeatMembers).toContain('schedule-live-unrelated-1');

    // THE CENTRAL FINDING: the orphan's state is untouched at every stage.
    // Comparing the projections directly (rather than re-asserting fields at
    // cp3 alone) is what separates "v6 queue init did it" from "the service
    // sequence did it" — if either mutated the entry, one of these differs and
    // the failure names the responsible stage.
    expect(cp2.orphan).toEqual(cp1.orphan);
    expect(cp3.orphan).toEqual(cp1.orphan);

    // Branch criterion, evaluated at cp3:
    //   - entry OR a runnable delayed occurrence survives  => branch B
    //   - complete removal/reconciliation                  => branch A
    //   - PARTIAL mutation (meta gone, delayed alive)      => branch B, riskiest
    const runnableDelayed = cp3.orphan.delayed.filter(
      (d) => cp3.orphan.delayedJobHashes[d] === 1,
    );

    // Provisional pin: asserts the CURRENT observed behavior so the branch is
    // recorded, not assumed. Update deliberately once #1044 picks a policy.
    expect({
      orphanPresent: cp3.orphan.present,
      metaExists: cp3.orphan.metaExists,
      orphanDelayedCount: cp3.orphan.delayed.length,
      runnableDelayedCount: runnableDelayed.length,
    }).toEqual(PROBE_EXPECTATION);
  });

  /**
   * The branch-B companion (issue #1044). The probe above proves the orphan's
   * KEYS survive; it cannot prove they still RUN, because the seeded entry's
   * next occurrence is hours away. Survival of inert leftovers and survival of
   * a live scheduler have very different severities, so this pins the severity:
   * an orphaned v5 scheduler-format entry keeps enqueuing `create-backup`
   * against a schedule the operator already deleted.
   *
   * Uses a due-now pattern (every second) so the occurrence lands inside the
   * test window.
   */
  it('PROBE #1044: the orphaned entry still FIRES after v6 init', async () => {
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

    const fired: string[] = [];
    worker = new Worker(
      QUEUE,
      async (job: Job) => {
        fired.push(String((job.data as { scheduleId?: string }).scheduleId));
      },
      { connection, prefix },
    );
    await worker.waitUntilReady();

    await service.onModuleInit();

    await new Promise((resolve) => setTimeout(resolve, 4000));

    // The deleted schedule's backup ran anyway — this is the operator-visible
    // harm, and the reason branch B needs an explicit cleanup policy.
    //
    // toContain, not a count: the observed run fired 4x in 4s, but the exact
    // number depends on worker warm-up and cron edge alignment. One execution
    // is the whole finding; asserting a count would add flakiness and no signal.
    expect(fired).toContain(ORPHAN_SCHEDULE_ID);
  });

  it('does not touch other queue namespaces', async () => {
    const client = await testClient(v6);
    const sentinel = `${prefix}:other-queue:repeat`;
    await client.zadd(sentinel, 1, 'sentinel-member');

    // Seed a removable legacy entry so cleanup actually does work.
    await v5.add(
      'create-backup',
      { scheduleId: 'schedule-1' },
      { repeat: { pattern: PATTERN }, jobId: 'schedule-schedule-1' },
    );

    await service.onModuleInit();

    expect(await client.zscore(sentinel, 'sentinel-member')).toBe('1');
  });
});
