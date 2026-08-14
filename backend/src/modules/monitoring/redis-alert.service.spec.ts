import { RedisAlertService } from './redis-alert.service';
import { REDIS_ALERT_EPISODE_CAPACITY } from './redis-alert.types';

describe('RedisAlertService pressure', () => {
  let service: RedisAlertService;

  beforeEach(() => {
    service = new RedisAlertService();
  });

  const pressure = (at: string, utilizationPercent: number | null = 85) =>
    service.onPressureState({ state: 'sustained-pressure', utilizationPercent, at });
  const healthy = (at: string, utilizationPercent: number | null = 10) =>
    service.onPressureState({ state: 'healthy', utilizationPercent, at });
  const unknown = (at: string) =>
    service.onPressureState({ state: 'unknown', utilizationPercent: null, at });
  const insufficient = (at: string) =>
    service.onPressureState({ state: 'insufficient-samples', utilizationPercent: 85, at });

  it('starts an episode on entering sustained pressure', () => {
    pressure('2026-08-14T10:00:00.000Z');
    const view = service.getView('2026-08-14T10:00:30.000Z');
    expect(view.pressure.active).toBe(true);
    expect(view.pressure.currentEpisode?.startedAt).toBe('2026-08-14T10:00:00.000Z');
    expect(view.pressure.stale).toBe(false);
  });

  it('does not start a second episode while one is active', () => {
    pressure('2026-08-14T10:00:00.000Z');
    pressure('2026-08-14T10:01:00.000Z');
    const view = service.getView('2026-08-14T10:01:30.000Z');
    expect(view.pressure.currentEpisode?.startedAt).toBe('2026-08-14T10:00:00.000Z');
    expect(view.pressure.recentEpisodes).toHaveLength(0);
  });

  it('recovers on healthy and files the episode', () => {
    pressure('2026-08-14T10:00:00.000Z');
    healthy('2026-08-14T10:10:00.000Z');
    const view = service.getView('2026-08-14T10:10:30.000Z');
    expect(view.pressure.active).toBe(false);
    expect(view.pressure.currentEpisode).toBeNull();
    expect(view.pressure.recentEpisodes).toHaveLength(1);
    expect(view.pressure.recentEpisodes[0].recoveredAt).toBe('2026-08-14T10:10:00.000Z');
  });

  it('does not duplicate an episode across sustained -> unknown -> sustained', () => {
    pressure('2026-08-14T10:00:00.000Z');
    unknown('2026-08-14T10:01:00.000Z');
    pressure('2026-08-14T10:02:00.000Z');
    const view = service.getView('2026-08-14T10:02:30.000Z');
    expect(view.pressure.currentEpisode?.startedAt).toBe('2026-08-14T10:00:00.000Z');
    expect(view.pressure.recentEpisodes).toHaveLength(0);
  });

  it('does not recover on unknown', () => {
    pressure('2026-08-14T10:00:00.000Z');
    unknown('2026-08-14T10:01:00.000Z');
    const view = service.getView('2026-08-14T10:01:30.000Z');
    expect(view.pressure.active).toBe(true);
    expect(view.pressure.stale).toBe(true);
  });

  it('reports stale while an active episode sits in insufficient-samples', () => {
    pressure('2026-08-14T10:00:00.000Z');
    unknown('2026-08-14T10:01:00.000Z');
    insufficient('2026-08-14T10:02:00.000Z');
    const view = service.getView('2026-08-14T10:02:30.000Z');
    expect(view.pressure.active).toBe(true);
    expect(view.pressure.stale).toBe(true);
  });

  it('is a no-op on healthy with no active episode', () => {
    healthy('2026-08-14T10:00:00.000Z');
    const view = service.getView('2026-08-14T10:00:30.000Z');
    expect(view.pressure.active).toBe(false);
    expect(view.pressure.recentEpisodes).toHaveLength(0);
  });

  it('starts a new episode after a recovery', () => {
    pressure('2026-08-14T10:00:00.000Z');
    healthy('2026-08-14T10:10:00.000Z');
    pressure('2026-08-14T10:20:00.000Z');
    const view = service.getView('2026-08-14T10:20:30.000Z');
    expect(view.pressure.currentEpisode?.startedAt).toBe('2026-08-14T10:20:00.000Z');
    expect(view.pressure.recentEpisodes).toHaveLength(1);
  });

  it('tracks the peak utilization and ignores null readings', () => {
    pressure('2026-08-14T10:00:00.000Z', 85);
    pressure('2026-08-14T10:01:00.000Z', 93);
    unknown('2026-08-14T10:02:00.000Z');
    pressure('2026-08-14T10:03:00.000Z', 88);
    const view = service.getView('2026-08-14T10:03:30.000Z');
    expect(view.pressure.currentEpisode?.peakUtilizationPercent).toBe(93);
  });

  it('leaves peak null when no valid reading occurs during the episode', () => {
    service.onPressureState({
      state: 'sustained-pressure',
      utilizationPercent: null,
      at: '2026-08-14T10:00:00.000Z',
    });
    const view = service.getView('2026-08-14T10:00:30.000Z');
    expect(view.pressure.currentEpisode?.peakUtilizationPercent).toBeNull();
  });

  it('evicts the oldest episode beyond capacity', () => {
    for (let i = 0; i <= REDIS_ALERT_EPISODE_CAPACITY; i += 1) {
      pressure(`2026-08-14T${String(i).padStart(2, '0')}:00:00.000Z`);
      healthy(`2026-08-14T${String(i).padStart(2, '0')}:30:00.000Z`);
    }
    const view = service.getView('2026-08-15T00:00:00.000Z');
    expect(view.pressure.recentEpisodes).toHaveLength(REDIS_ALERT_EPISODE_CAPACITY);
    expect(view.pressure.recentEpisodes[0].startedAt).toBe('2026-08-14T01:00:00.000Z');
  });
});
