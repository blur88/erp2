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
  });

  it('fires exactly one job after migration', async () => {
    // A fully-specified six-field cron matches ONE instant; its next match is
    // a year later. So within the test window a correct migration fires
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