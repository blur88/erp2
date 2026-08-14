import {
  AlertState,
  applyOomCounter,
  applyPressureState,
  emptyAlertState,
  isOomActive,
  severityFor,
} from './redis-alert.transitions';

describe('applyOomCounter', () => {
  const at = '2026-08-14T10:00:00.000Z';

  it('baselines a new identity without alerting', () => {
    const next = applyOomCounter(emptyAlertState(), 7, at, true);
    expect(next.oomBaselineValue).toBe(7);
    expect(next.oomObservedValue).toBe(7);
    expect(isOomActive(next)).toBe(false);
  });

  it('never rewrites the baseline of an existing row', () => {
    const persisted: AlertState = { ...emptyAlertState(), oomBaselineValue: 2, oomObservedValue: 2 };
    const next = applyOomCounter(persisted, 9, at, false);
    expect(next.oomBaselineValue).toBe(2);
  });

  it('reports an increase that happened while the backend was down', () => {
    // Persisted observed 5; counter is now 9. The process-local tracker would
    // have emitted kind:'baseline' delta:0 here — the raw comparison must win.
    const persisted: AlertState = { ...emptyAlertState(), oomBaselineValue: 5, oomObservedValue: 5 };
    const next = applyOomCounter(persisted, 9, at, false);
    expect(next.oomUnacknowledgedDelta).toBe(4);
    expect(next.oomIncidentStartedAt).toBe(at);
    expect(isOomActive(next)).toBe(true);
  });

  it('writes no counter transition when the value is unchanged', () => {
    const persisted: AlertState = {
      ...emptyAlertState(),
      oomBaselineValue: 5,
      oomObservedValue: 9,
      oomUnacknowledgedDelta: 4,
      oomIncidentStartedAt: at,
      oomLastIncreaseAt: at,
    };
    const next = applyOomCounter(persisted, 9, '2026-08-14T10:01:00.000Z', false);
    expect(next.oomUnacknowledgedDelta).toBe(4);
    expect(next.oomLastIncreaseAt).toBe(at);
    expect(next.oomIncidentStartedAt).toBe(at);
  });

  it('re-baselines on a decrease (RESETSTAT during downtime)', () => {
    const persisted: AlertState = {
      ...emptyAlertState(),
      oomBaselineValue: 5,
      oomObservedValue: 40,
      oomAcknowledgedValue: 40,
      oomIncidentStartedAt: at,
      oomUnacknowledgedDelta: 3,
    };
    const next = applyOomCounter(persisted, 2, at, false);
    expect(next.oomBaselineValue).toBe(2);
    expect(next.oomObservedValue).toBe(2);
    expect(next.oomAcknowledgedValue).toBeNull();
    expect(next.oomUnacknowledgedDelta).toBe(0);
    expect(next.oomIncidentStartedAt).toBeNull();
    // The stale-high watermark must not survive, or every later OOM is suppressed.
    expect(isOomActive(next)).toBe(false);
  });

  it('accumulates a second increase into the open incident', () => {
    let state = applyOomCounter(
      { ...emptyAlertState(), oomBaselineValue: 0, oomObservedValue: 0 }, 2, at, false,
    );
    state = applyOomCounter(state, 5, '2026-08-14T10:01:00.000Z', false);
    expect(state.oomUnacknowledgedDelta).toBe(5);
    expect(state.oomIncidentStartedAt).toBe(at);
  });

  it('does not alert while the counter sits at the acknowledged watermark', () => {
    const persisted: AlertState = {
      ...emptyAlertState(),
      oomBaselineValue: 0,
      oomObservedValue: 5,
      oomAcknowledgedValue: 5,
    };
    expect(isOomActive(applyOomCounter(persisted, 5, at, false))).toBe(false);
  });
});

describe('applyPressureState', () => {
  const evt = (state: 'sustained-pressure' | 'healthy' | 'unknown', at: string, u: number | null = 85) =>
    ({ state, utilizationPercent: u, at }) as const;

  it('opens an episode on entering sustained pressure', () => {
    const next = applyPressureState(emptyAlertState(), evt('sustained-pressure', '2026-08-14T10:00:00.000Z'));
    expect(next.activeEpisode?.startedAt).toBe('2026-08-14T10:00:00.000Z');
  });

  it('does not open a second episode while one is active', () => {
    let s = applyPressureState(emptyAlertState(), evt('sustained-pressure', '2026-08-14T10:00:00.000Z'));
    s = applyPressureState(s, evt('sustained-pressure', '2026-08-14T10:01:00.000Z'));
    expect(s.activeEpisode?.startedAt).toBe('2026-08-14T10:00:00.000Z');
  });

  it('closes the episode into history on recovery', () => {
    let s = applyPressureState(emptyAlertState(), evt('sustained-pressure', '2026-08-14T10:00:00.000Z'));
    s = applyPressureState(s, evt('healthy', '2026-08-14T10:05:00.000Z', 10));
    expect(s.activeEpisode).toBeNull();
    expect(s.recentEpisodes).toHaveLength(1);
    expect(s.recentEpisodes[0].recoveredAt).toBe('2026-08-14T10:05:00.000Z');
  });

  it('tracks the peak across an unknown reading without recovering', () => {
    let s = applyPressureState(emptyAlertState(), evt('sustained-pressure', '2026-08-14T10:00:00.000Z', 85));
    s = applyPressureState(s, evt('unknown', '2026-08-14T10:01:00.000Z', null));
    s = applyPressureState(s, evt('sustained-pressure', '2026-08-14T10:02:00.000Z', 91));
    expect(s.activeEpisode?.peakUtilizationPercent).toBe(91);
    expect(s.recentEpisodes).toHaveLength(0);
  });

  it('bounds episode history to the capacity', () => {
    let s = emptyAlertState();
    for (let i = 0; i < 25; i++) {
      s = applyPressureState(s, evt('sustained-pressure', `2026-08-14T${String(i).padStart(2, '0')}:00:00.000Z`));
      s = applyPressureState(s, evt('healthy', `2026-08-14T${String(i).padStart(2, '0')}:30:00.000Z`, 10));
    }
    expect(s.recentEpisodes).toHaveLength(20);
  });
});

describe('severityFor', () => {
  it('reports critical when an OOM is active', () => {
    const s: AlertState = { ...emptyAlertState(), oomBaselineValue: 0, oomObservedValue: 3 };
    expect(severityFor(s)).toBe('critical');
  });

  it('reports warning during a pressure episode with no OOM', () => {
    const s = applyPressureState(emptyAlertState(), {
      state: 'sustained-pressure', utilizationPercent: 85, at: '2026-08-14T10:00:00.000Z',
    });
    expect(severityFor(s)).toBe('warning');
  });

  it('reports none when quiet', () => {
    expect(severityFor(emptyAlertState())).toBe('none');
  });
});