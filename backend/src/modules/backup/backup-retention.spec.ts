import { RetentionCandidate, RetentionPolicy, selectRetention } from './backup-retention';

const policy = (now: string, overrides: Partial<Omit<RetentionPolicy, 'now'>> = {}): RetentionPolicy => ({
  now: new Date(now),
  windowHours: 24,
  dailyCount: 1,
  weeklyCount: 1,
  monthlyCount: 1,
  ...overrides,
});

const backup = (recoveryPoint: string, verified = true): RetentionCandidate => ({ recoveryPoint, verified });

describe('selectRetention (#2114)', () => {
  it('keeps every Backup inside the window, boundary included, and expires the rest', () => {
    // Counts of 1 leave tiers no room to keep anything outside the window.
    const selection = selectRetention(
      [
        backup('20261128T120000000Z'),
        backup('20261127T120000000Z'), // exactly 24 hours old: inside the window
        backup('20261127T115959999Z'), // one millisecond older: outside
      ],
      policy('2026-11-28T12:00:00.000Z'),
    );

    expect(selection.keep.sort()).toEqual(['20261127T120000000Z', '20261128T120000000Z']);
    expect(selection.expire).toEqual(['20261127T115959999Z']);
  });

  it('always keeps the newest Verified Backup, even when it is outside the window', () => {
    const selection = selectRetention(
      [backup('20200101T000000000Z'), backup('20200102T000000000Z'), backup('20190101T000000000Z')],
      policy('2026-11-28T12:00:00.000Z'),
    );

    expect(selection.keep).toEqual(['20200102T000000000Z']);
    expect(selection.expire.sort()).toEqual(['20190101T000000000Z', '20200101T000000000Z']);
  });

  it('keeps the newest verified Backup of each of the newest daily periods, skipping days with no Backup', () => {
    // Weekly and monthly counts are zero so only the daily tier is under test.
    const selection = selectRetention(
      [
        backup('20261120T080000000Z'),
        backup('20261120T180000000Z'),
        backup('20261122T100000000Z'),
        backup('20261125T100000000Z'),
        backup('20261126T080000000Z'),
        backup('20261126T150000000Z'),
      ],
      policy('2026-11-28T12:00:00.000Z', { dailyCount: 3, weeklyCount: 0, monthlyCount: 0 }),
    );

    expect(selection.keep.sort()).toEqual([
      '20261122T100000000Z',
      '20261125T100000000Z',
      '20261126T150000000Z',
    ]);
    expect(selection.expire.sort()).toEqual([
      '20261120T080000000Z',
      '20261120T180000000Z',
      '20261126T080000000Z',
    ]);
  });

  it('keeps the newest verified Backup of each of the newest ISO weeks, which start on Monday in UTC', () => {
    // 2026-11-16, 2026-11-23 and 2026-11-09 are Mondays. 2026-11-22 23:00 is Sunday, so it belongs to the earlier week.
    const selection = selectRetention(
      [
        backup('20261110T100000000Z'),
        backup('20261116T100000000Z'),
        backup('20261122T230000000Z'),
        backup('20261123T010000000Z'),
        backup('20261125T100000000Z'),
      ],
      policy('2026-11-28T12:00:00.000Z', { dailyCount: 0, weeklyCount: 2, monthlyCount: 0 }),
    );

    expect(selection.keep.sort()).toEqual(['20261122T230000000Z', '20261125T100000000Z']);
    expect(selection.expire.sort()).toEqual([
      '20261110T100000000Z',
      '20261116T100000000Z',
      '20261123T010000000Z',
    ]);
  });

  it('keeps the newest verified Backup of each of the newest calendar months', () => {
    const selection = selectRetention(
      [
        backup('20260915T100000000Z'),
        backup('20261001T010000000Z'),
        backup('20261031T235959999Z'),
        backup('20261115T100000000Z'),
      ],
      policy('2026-11-28T12:00:00.000Z', { dailyCount: 0, weeklyCount: 0, monthlyCount: 2 }),
    );

    expect(selection.keep.sort()).toEqual(['20261031T235959999Z', '20261115T100000000Z']);
    expect(selection.expire.sort()).toEqual(['20260915T100000000Z', '20261001T010000000Z']);
  });

  it('counts a Backup that satisfies several tiers once', () => {
    const selection = selectRetention(
      [backup('20261127T090000000Z'), backup('20261127T180000000Z')],
      policy('2026-11-28T12:00:00.000Z', { windowHours: 1, dailyCount: 1, weeklyCount: 1, monthlyCount: 1 }),
    );

    expect(selection.keep).toEqual(['20261127T180000000Z']);
    expect(selection.expire).toEqual(['20261127T090000000Z']);
  });

  it('never lets an unverified Backup take the place of the newest verified one in a tier', () => {
    const selection = selectRetention(
      [backup('20261127T090000000Z'), backup('20261127T180000000Z', false)],
      policy('2026-11-28T12:00:00.000Z', { windowHours: 1, dailyCount: 1, weeklyCount: 1, monthlyCount: 1 }),
    );

    expect(selection.keep).toEqual(['20261127T090000000Z']);
    expect(selection.expire).toEqual(['20261127T180000000Z']);
  });
});
