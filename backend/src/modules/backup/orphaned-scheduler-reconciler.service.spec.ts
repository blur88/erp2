import { Queue } from 'bullmq';
import { In, Repository } from 'typeorm';
import { BackupSchedule } from '@database/entities/backup-schedule.entity';
import { OrphanedSchedulerReconciler } from './orphaned-scheduler-reconciler.service';

describe('OrphanedSchedulerReconciler scan', () => {
  const MEMBER = '60f88ec415a02b45f5c02094f3aca23d';
  const OTHER = 'c'.repeat(32);

  let scheduleRepository: jest.Mocked<Repository<BackupSchedule>>;
  let backupQueue: jest.Mocked<Queue>;
  let redisClient: {
    zscan: jest.Mock;
    hexists: jest.Mock;
    hget: jest.Mock;
  };
  let reconciler: OrphanedSchedulerReconciler;

  /** Data payload as BullMQ stores it on the repeat metadata hash. */
  const dataFor = (scheduleId: unknown) =>
    JSON.stringify({
      scheduleId,
      backupDto: { backupType: 'scheduled', createdBy: 'scheduler' },
    });

  /** A single ZSCAN page containing the given members. */
  const primeScan = (members: string[]) => {
    redisClient.zscan.mockResolvedValueOnce([
      '0',
      members.flatMap((m, i) => [m, String(i)]),
    ]);
  };

  beforeEach(() => {
    scheduleRepository = {
      find: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<Repository<BackupSchedule>>;

    redisClient = {
      zscan: jest.fn().mockResolvedValue(['0', []]),
      hexists: jest.fn().mockResolvedValue(1), // 1 = ic present (scheduler)
      hget: jest.fn().mockResolvedValue(null),
    };

    backupQueue = {
      removeJobScheduler: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<Queue>;
    (backupQueue as any).getBackend = jest.fn().mockReturnValue({
      client: Promise.resolve(redisClient),
    });
    (backupQueue as any).toKey = jest.fn(
      (type: string) => `bull:backup-queue:${type}`,
    );

    reconciler = new OrphanedSchedulerReconciler(
      scheduleRepository,
      backupQueue,
    );
  });

  it('classifies a repeat entry with no backing schedule row as an orphan', async () => {
    primeScan([MEMBER]);
    redisClient.hget.mockResolvedValue(dataFor('a556cb35'));

    const scan = await reconciler.scanOrphanedSchedulers();

    expect(scheduleRepository.find).toHaveBeenCalledWith({
      where: { id: In(['a556cb35']) },
      select: { id: true },
    });
    expect(scan.orphans).toEqual([
      { member: MEMBER, scheduleId: 'a556cb35' },
    ]);
    expect(scan.liveCount).toBe(0);
  });

  it('does not classify an entry whose schedule row still exists', async () => {
    primeScan([MEMBER]);
    redisClient.hget.mockResolvedValue(dataFor('a556cb35'));
    scheduleRepository.find = jest
      .fn()
      .mockResolvedValue([{ id: 'a556cb35' } as BackupSchedule]);

    const scan = await reconciler.scanOrphanedSchedulers();

    expect(scan.orphans).toEqual([]);
    expect(scan.liveCount).toBe(1);
  });

  it.each([
    ['a missing data field', null],
    ['unparseable JSON', '{not json'],
    ['a non-object payload', '"just a string"'],
    ['a non-string scheduleId', dataFor(42)],
    ['an empty scheduleId', dataFor('')],
    ['an absent scheduleId', JSON.stringify({ backupDto: {} })],
  ])('treats %s as unclassifiable, not an orphan', async (_label, raw) => {
    primeScan([MEMBER]);
    redisClient.hget.mockResolvedValue(raw);

    const scan = await reconciler.scanOrphanedSchedulers();

    // No DB lookup at all: nothing was classifiable, so In([]) never runs.
    expect(scheduleRepository.find).not.toHaveBeenCalled();
    expect(scan.unclassifiable).toEqual([MEMBER]);
    expect(scan.orphans).toEqual([]);
  });

  it('deduplicates scheduleIds shared by several members', async () => {
    primeScan([MEMBER, OTHER]);
    redisClient.hget.mockResolvedValue(dataFor('a556cb35'));

    const scan = await reconciler.scanOrphanedSchedulers();

    // One DB row queried, two orphaned members reported.
    expect(scheduleRepository.find).toHaveBeenCalledWith({
      where: { id: In(['a556cb35']) },
      select: { id: true },
    });
    expect(scan.classified).toBe(1);
    expect(scan.orphans).toEqual([
      { member: MEMBER, scheduleId: 'a556cb35' },
      { member: OTHER, scheduleId: 'a556cb35' },
    ]);
  });

  it('counts a duplicate ZSCAN member once', async () => {
    // ZSCAN guarantees each member is seen at least once, not exactly once.
    redisClient.zscan
      .mockResolvedValueOnce(['7', [MEMBER, '0']])
      .mockResolvedValueOnce(['0', [MEMBER, '0']]);
    redisClient.hget.mockResolvedValue(dataFor('a556cb35'));

    const scan = await reconciler.scanOrphanedSchedulers();

    expect(scan.scanned).toBe(1);
    expect(scan.orphans).toEqual([
      { member: MEMBER, scheduleId: 'a556cb35' },
    ]);
  });

  it('skips non-ic legacy entries without reading their data', async () => {
    primeScan([MEMBER]);
    redisClient.hexists.mockResolvedValue(0); // no ic ⇒ legacy

    const scan = await reconciler.scanOrphanedSchedulers();

    expect(scan.legacySkipped).toEqual([MEMBER]);
    expect(scan.orphans).toEqual([]);
    // Never classified, so its data is never read.
    expect(redisClient.hget).not.toHaveBeenCalled();
  });

  it('propagates a failed DB lookup instead of reporting zero orphans', async () => {
    primeScan([MEMBER]);
    redisClient.hget.mockResolvedValue(dataFor('a556cb35'));
    scheduleRepository.find = jest
      .fn()
      .mockRejectedValue(new Error('connection terminated'));

    // Deliberately uncaught: a caller must never mistake "the query threw"
    // for "no rows matched" and delete on the strength of it.
    await expect(reconciler.scanOrphanedSchedulers()).rejects.toThrow(
      'connection terminated',
    );
    expect(backupQueue.removeJobScheduler).not.toHaveBeenCalled();
  });
});