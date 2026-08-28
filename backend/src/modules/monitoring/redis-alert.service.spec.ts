import { jest } from '@jest/globals';
import { ConflictException } from '@nestjs/common';
import { RedisAlertService } from './redis-alert.service';
import { AlertState, emptyAlertState } from './redis-alert.transitions';
import { RedisAlertStateRepository } from './redis-alert-state.repository';

class FakeRepo {
  rows = new Map<string, AlertState>();
  async mutate(runId: string, mutator: (s: AlertState, isNew: boolean) => AlertState) {
    const isNew = !this.rows.has(runId);
    const next = mutator(this.rows.get(runId) ?? emptyAlertState(), isNew);
    this.rows.set(runId, next);
    return next;
  }
  async read(runId: string) {
    return this.rows.get(runId) ?? null;
  }
}

describe('RedisAlertService', () => {
  let repo: FakeRepo;
  let service: RedisAlertService;
  const RUN = 'run-abc';

  beforeEach(() => {
    repo = new FakeRepo();
    service = new RedisAlertService(repo as unknown as RedisAlertStateRepository);
  });

  it('returns the unavailable variant when identity is unknown', async () => {
    const view = await service.getView(null, 'redis-identity-unknown');
    expect(view.severity).toBe('unavailable');
    expect(view.unavailableReason).toBe('redis-identity-unknown');
    expect(view.pressure).toBeNull();
    expect(view.oom).toBeNull();
  });

  const tick = (
    at: string,
    rawOomCounter: number | null,
    state: 'healthy' | 'sustained-pressure' | 'unknown' = 'healthy',
    utilizationPercent: number | null = 10,
  ) =>
    service.applySample(
      { pressure: { state, utilizationPercent, at }, rawOomCounter, at },
      RUN,
    );

  it('skips the transition entirely when identity is unavailable', async () => {
    await service.applySample(
      {
        pressure: { state: 'healthy', utilizationPercent: 10, at: '2026-08-14T10:00:00.000Z' },
        rawOomCounter: 9,
        at: '2026-08-14T10:00:00.000Z',
      },
      null,
    );
    expect(repo.rows.size).toBe(0);
  });

  it('applies pressure and counter in a single mutate call', async () => {
    const spy = jest.spyOn(repo, 'mutate');
    await tick('2026-08-14T10:00:00.000Z', 7, 'sustained-pressure', 85);
    expect(spy).toHaveBeenCalledTimes(1);
    const state = repo.rows.get(RUN)!;
    expect(state.activeEpisode).not.toBeNull();
    expect(state.oomObservedValue).toBe(7);
  });

  it('baselines on first sight and does not alert', async () => {
    await tick('2026-08-14T10:00:00.000Z', 7);
    const view = await service.getView(RUN, null);
    expect(view.severity).toBe('none');
    expect(view.oom?.observedValue).toBe(7);
  });

  it('alerts on an increase above the persisted watermark', async () => {
    await tick('2026-08-14T10:00:00.000Z', 7);
    await tick('2026-08-14T10:01:00.000Z', 9);
    const view = await service.getView(RUN, null);
    expect(view.severity).toBe('critical');
    expect(view.oom?.unacknowledgedDelta).toBe(2);
  });

  it('applies the pressure transition even when the counter read failed', async () => {
    await tick('2026-08-14T10:00:00.000Z', null, 'sustained-pressure', 85);
    const view = await service.getView(RUN, null);
    expect(view.pressure?.active).toBe(true);
    expect(view.oom?.observedValue).toBeNull();
  });

  it('acknowledges and clears the active alert', async () => {
    await tick('2026-08-14T10:00:00.000Z', 7);
    await tick('2026-08-14T10:01:00.000Z', 9);
    const view = await service.acknowledgeOom(9, 'user-1', 'Ada', RUN);
    expect(view.severity).toBe('none');
    expect(view.oom?.acknowledgedValue).toBe(9);
    expect(view.oom?.lastAcknowledgedByLabel).toBe('Ada');
  });

  it('rejects an acknowledgement whose observed value is stale', async () => {
    await tick('2026-08-14T10:00:00.000Z', 7);
    await tick('2026-08-14T10:01:00.000Z', 9);
    await expect(service.acknowledgeOom(8, 'user-1', 'Ada', RUN)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects an acknowledgement when there is no active alert', async () => {
    await tick('2026-08-14T10:00:00.000Z', 7);
    await expect(service.acknowledgeOom(7, 'user-1', 'Ada', RUN)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects an acknowledgement while identity is unavailable', async () => {
    await expect(service.acknowledgeOom(9, 'user-1', 'Ada', null)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('marks an active episode stale when the state goes unknown', async () => {
    await tick('2026-08-14T10:00:00.000Z', null, 'sustained-pressure', 85);
    await tick('2026-08-14T10:01:00.000Z', null, 'unknown', null);
    const view = await service.getView(RUN, null);
    expect(view.pressure?.active).toBe(true);
    expect(view.pressure?.stale).toBe(true);
  });
});