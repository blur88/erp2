import { Queue } from 'bullmq';
import { In, Repository } from 'typeorm';
import { BackupSchedule } from '@database/entities/backup-schedule.entity';
import { BackupSchedulerService } from './backup-scheduler.service';
import { BackupService } from './backup.service';

describe('BackupSchedulerService', () => {
  let schedule: BackupSchedule;
  let scheduleRepository: jest.Mocked<Repository<BackupSchedule>>;
  let backupQueue: jest.Mocked<Queue>;
  let redisClient: {
    zscan: jest.Mock;
    hexists: jest.Mock;
    // Assigned per-test. The cleanup path must never consult it (the
    // field-presence test primes it to prove that); the orphan diagnostic
    // reads the `data` field through it.
    hget?: jest.Mock;
  };
  let service: BackupSchedulerService;

  beforeEach(() => {
    schedule = {
      id: 'schedule-1',
      name: 'Nightly',
      enabled: true,
      frequency: 'daily',
      time: '02:30',
      databases: ['erp'],
      includeSettings: true,
    } as BackupSchedule;

    scheduleRepository = {
      create: jest.fn().mockReturnValue(schedule),
      save: jest.fn().mockResolvedValue(schedule),
    } as unknown as jest.Mocked<Repository<BackupSchedule>>;

    backupQueue = {
      add: jest.fn().mockResolvedValue(undefined),
      upsertJobScheduler: jest.fn().mockResolvedValue(undefined),
      removeJobScheduler: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<Queue>;

    redisClient = {
      zscan: jest.fn().mockResolvedValue(['0', []]),
      hexists: jest.fn().mockResolvedValue(0), // 0 = no ic field
    };
    (backupQueue as any).getBackend = jest.fn().mockReturnValue({
      client: Promise.resolve(redisClient),
    });
    (backupQueue as any).toKey = jest.fn((type: string) => `bull:backup-queue:${type}`);
    scheduleRepository.find = jest.fn().mockResolvedValue([]);

    service = new BackupSchedulerService(
      scheduleRepository,
      backupQueue,
      {} as BackupService,
    );
  });

  it('registers enabled schedules as a BullMQ job scheduler', async () => {
    await service.createSchedule({
      name: 'Nightly',
      enabled: true,
      frequency: 'daily',
      time: '02:30',
      databases: ['erp'],
      includeSettings: true,
    });

    expect(backupQueue.upsertJobScheduler).toHaveBeenCalledWith(
      'schedule-schedule-1',
      { pattern: '30 02 * * *' },
      expect.objectContaining({
        name: 'create-backup',
        data: expect.objectContaining({ scheduleId: 'schedule-1' }),
      }),
    );
  });

  it('removes a schedule using removeJobScheduler with the scheduler id', async () => {
    scheduleRepository.findOne = jest.fn().mockResolvedValue(schedule);
    scheduleRepository.remove = jest.fn().mockResolvedValue(undefined);

    await service.remove('schedule-1');

    expect(backupQueue.removeJobScheduler).toHaveBeenCalledWith(
      'schedule-schedule-1',
    );
  });

  describe('legacy repeatable cleanup', () => {
    const HASHED = 'a'.repeat(32);

    it('completes the full scan before removing any member', async () => {
      // The key assertion is inside the second zscan: if the implementation
      // removed page-one members before requesting page two, removeJobScheduler
      // would already have been called by this point. Asserting only that both
      // pages were visited would NOT catch mutate-while-scanning.
      redisClient.zscan
        .mockResolvedValueOnce(['42', [HASHED, '111']])
        .mockImplementationOnce(async () => {
          expect(backupQueue.removeJobScheduler).not.toHaveBeenCalled();
          return ['0', ['b'.repeat(32), '222']];
        });

      await service.onModuleInit();

      // Two cleanup pages, then a single-page scan from the orphan diagnostic
      // (issue #1035), which runs last and falls through to the default
      // empty-ZSET mock. Counting all three would silently absorb a lost
      // cleanup page, so assert the cleanup pages by their cursor arguments.
      expect(redisClient.zscan.mock.calls.slice(0, 2)).toEqual([
        ['bull:backup-queue:repeat', '0'],
        ['bull:backup-queue:repeat', '42'],
      ]);
      expect(redisClient.zscan).toHaveBeenCalledTimes(3);
      expect(backupQueue.removeJobScheduler).toHaveBeenCalledWith(HASHED);
      expect(backupQueue.removeJobScheduler).toHaveBeenCalledWith('b'.repeat(32));
      expect(backupQueue.removeJobScheduler).toHaveBeenCalledTimes(2);
    });

    it('leaves scheduler-format entries carrying ic untouched', async () => {
      redisClient.zscan.mockResolvedValueOnce(['0', ['schedule-abc', '111']]);
      redisClient.hexists.mockResolvedValueOnce(1);

      await service.onModuleInit();

      expect(backupQueue.removeJobScheduler).not.toHaveBeenCalled();
    });

    it('treats ic as field presence, not a truthy value', async () => {
      // hexists returns 1 for a freshly upserted scheduler whose counter is
      // still "0". Guards against a future refactor to `hget` + truthiness,
      // which would delete live schedulers that have not yet run.
      redisClient.zscan.mockResolvedValueOnce(['0', ['schedule-abc', '111']]);
      redisClient.hexists.mockResolvedValueOnce(1);
      redisClient.hget = jest.fn().mockResolvedValue('0');

      await service.onModuleInit();

      expect(redisClient.hexists).toHaveBeenCalledWith(
        expect.stringContaining('repeat:schedule-abc'),
        'ic',
      );
      expect(backupQueue.removeJobScheduler).not.toHaveBeenCalled();
    });

    it('throws and removes nothing when a non-ic member is not a 32-char hex hash', async () => {
      redisClient.zscan.mockResolvedValueOnce([
        '0',
        ['create-backup:schedule-1:::0 2 * * *', '111'],
      ]);

      await expect(service.onModuleInit()).rejects.toThrow(
        /unsupported legacy repeatable/i,
      );

      expect(backupQueue.removeJobScheduler).not.toHaveBeenCalled();
      expect(backupQueue.upsertJobScheduler).not.toHaveBeenCalled();
    });

    it('removes nothing when a valid hash and an unsupported member share a snapshot', async () => {
      // Proves the unsupported branch aborts the WHOLE run: classification
      // must complete before any removal, so the removable member survives.
      redisClient.zscan.mockResolvedValueOnce([
        '0',
        [HASHED, '111', 'create-backup:schedule-1:::0 2 * * *', '222'],
      ]);

      await expect(service.onModuleInit()).rejects.toThrow(
        /unsupported legacy repeatable/i,
      );

      expect(backupQueue.removeJobScheduler).not.toHaveBeenCalled();
      expect(backupQueue.upsertJobScheduler).not.toHaveBeenCalled();
    });

    it('completes all removals before the first upsert', async () => {
      const calls: string[] = [];
      redisClient.zscan.mockResolvedValueOnce(['0', [HASHED, '111']]);
      (backupQueue.removeJobScheduler as jest.Mock).mockImplementation(() => {
        calls.push('remove');
        return Promise.resolve(true);
      });
      (backupQueue.upsertJobScheduler as jest.Mock).mockImplementation(() => {
        calls.push('upsert');
        return Promise.resolve(undefined);
      });
      scheduleRepository.find = jest.fn().mockResolvedValue([schedule]);

      await service.onModuleInit();

      expect(calls).toEqual(['remove', 'upsert']);
    });
  });

  describe('orphaned scheduler diagnostic', () => {
    const MEMBER = '60f88ec415a02b45f5c02094f3aca23d';
    const OTHER = 'c'.repeat(32);
    const REPEAT_KEY = 'bull:backup-queue:repeat';
    let warn: jest.SpyInstance;
    let error: jest.SpyInstance;

    /** Data payload as BullMQ stores it on the repeat metadata hash. */
    const dataFor = (scheduleId: unknown) =>
      JSON.stringify({
        scheduleId,
        backupDto: { backupType: 'scheduled', createdBy: 'scheduler' },
      });

    beforeEach(() => {
      warn = jest
        .spyOn(service['logger'], 'warn')
        .mockImplementation(() => undefined);
      error = jest
        .spyOn(service['logger'], 'error')
        .mockImplementation(() => undefined);
      // No enabled rows, so the only find() the diagnostic sees is its own.
      scheduleRepository.find = jest.fn().mockResolvedValue([]);
      redisClient.hexists.mockResolvedValue(1); // scheduler-format: skip cleanup
    });

    afterEach(() => {
      warn.mockRestore();
      error.mockRestore();
    });

    /** Cleanup scans nothing; the diagnostic scan returns `members`. */
    const primeScans = (members: string[]) => {
      redisClient.zscan
        .mockResolvedValueOnce(['0', []])
        .mockResolvedValueOnce([
          '0',
          members.flatMap((m, i) => [m, String(i)]),
        ]);
    };

    const warnings = () => warn.mock.calls.map((c) => String(c[0]));

    it('warns about a repeat entry with no backing schedule row', async () => {
      primeScans([MEMBER]);
      redisClient.hget = jest.fn().mockResolvedValue(dataFor('a556cb35'));

      await service.onModuleInit();

      expect(scheduleRepository.find).toHaveBeenCalledWith({
        where: { id: In(['a556cb35']) },
        select: { id: true },
      });
      expect(warnings()).toEqual([
        expect.stringContaining(`Orphaned backup-queue repeat entry "${MEMBER}"`),
        expect.stringContaining('Found 1 orphaned backup-queue repeat entries'),
      ]);
      expect(warnings()[0]).toContain(`removeJobScheduler("${MEMBER}")`);
      expect(backupQueue.removeJobScheduler).not.toHaveBeenCalled();
    });

    it('does not warn when the backing schedule row still exists', async () => {
      primeScans([MEMBER]);
      redisClient.hget = jest.fn().mockResolvedValue(dataFor('a556cb35'));
      // Only the diagnostic's lookup (the one using `select`) returns the row;
      // the enabled-schedules query must stay empty or initializeSchedules()
      // would try to build a cron from this id-only stub.
      scheduleRepository.find = jest.fn().mockImplementation((opts: any) =>
        Promise.resolve(
          opts?.select ? [{ id: 'a556cb35' } as BackupSchedule] : [],
        ),
      );

      await service.onModuleInit();

      // Nonzero-only: a clean stack must stay silent, including the summary.
      expect(warn).not.toHaveBeenCalled();
      expect(backupQueue.removeJobScheduler).not.toHaveBeenCalled();
    });

    it.each([
      ['a missing data field', null],
      ['unparseable JSON', '{not json'],
      ['a non-object payload', '"just a string"'],
      ['a non-string scheduleId', dataFor(42)],
      ['an empty scheduleId', dataFor('')],
      ['an absent scheduleId', JSON.stringify({ backupDto: {} })],
    ])('treats %s as unclassifiable, not an orphan', async (_label, raw) => {
      primeScans([MEMBER]);
      redisClient.hget = jest.fn().mockResolvedValue(raw);

      await service.onModuleInit();

      // No DB lookup at all: nothing was classifiable, so In([]) never runs.
      expect(scheduleRepository.find).not.toHaveBeenCalledWith(
        expect.objectContaining({ select: { id: true } }),
      );
      expect(warnings()).toEqual([
        expect.stringContaining('has no usable scheduleId'),
      ]);
      expect(warnings()[0]).not.toContain('Orphaned');
      expect(backupQueue.removeJobScheduler).not.toHaveBeenCalled();
    });

    it('deduplicates scheduleIds shared by several members', async () => {
      primeScans([MEMBER, OTHER]);
      redisClient.hget = jest.fn().mockResolvedValue(dataFor('a556cb35'));

      await service.onModuleInit();

      expect(scheduleRepository.find).toHaveBeenCalledWith({
        where: { id: In(['a556cb35']) },
        select: { id: true },
      });
      // One row, two orphaned members — both must be reported.
      expect(warnings()).toEqual([
        expect.stringContaining(MEMBER),
        expect.stringContaining(OTHER),
        expect.stringContaining('Found 2 orphaned'),
      ]);
    });

    it('counts a duplicate ZSCAN member once', async () => {
      // ZSCAN guarantees each member is seen at least once, not exactly once.
      redisClient.zscan
        .mockResolvedValueOnce(['0', []])
        .mockResolvedValueOnce(['7', [MEMBER, '0']])
        .mockResolvedValueOnce(['0', [MEMBER, '0']]);
      redisClient.hget = jest.fn().mockResolvedValue(dataFor('a556cb35'));

      await service.onModuleInit();

      expect(warnings()).toEqual([
        expect.stringContaining(MEMBER),
        expect.stringContaining('Found 1 orphaned'),
      ]);
    });

    it('reports nothing and logs one error when the DB lookup fails', async () => {
      primeScans([MEMBER]);
      redisClient.hget = jest.fn().mockResolvedValue(dataFor('a556cb35'));
      scheduleRepository.find = jest.fn().mockImplementation((opts: any) => {
        if (opts?.select) {
          return Promise.reject(new Error('connection terminated'));
        }
        return Promise.resolve([]);
      });

      await service.onModuleInit();

      // A transient read failure must not produce a partial orphan report.
      expect(warn).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('connection terminated'),
        expect.anything(),
      );
      expect(backupQueue.removeJobScheduler).not.toHaveBeenCalled();
    });

    it('does not fail boot when the diagnostic scan throws', async () => {
      redisClient.zscan
        .mockResolvedValueOnce(['0', []])
        .mockRejectedValueOnce(new Error('redis unavailable'));

      await expect(service.onModuleInit()).resolves.toBeUndefined();

      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('redis unavailable'),
        expect.anything(),
      );
      expect(warn).not.toHaveBeenCalled();
      expect(backupQueue.removeJobScheduler).not.toHaveBeenCalled();
    });
  });
});
