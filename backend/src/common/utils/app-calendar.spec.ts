import { SettingsService } from '../../modules/settings/settings.service';

import { getAppToday, resolveAppTimezone } from './app-calendar';
import { formatDateInTimezone } from './date-in-timezone';

/**
 * The frozen instant is 2026-08-24T16:30:00.000Z — deliberately past the UTC+8
 * rollover (16:00:00.000Z), so the UTC calendar date (the 24th) and the
 * Asia/Kuala_Lumpur one (the 25th) differ. An instant mid-UTC-day would be
 * inert for issue #1134 and would pass with or without the fix.
 */
const FROZEN_INSTANT = new Date('2026-08-24T16:30:00.000Z');

const settingsServiceWith = (timezone: unknown): SettingsService =>
  ({
    getRegionalSettings: jest.fn().mockResolvedValue({ timezone }),
  }) as unknown as SettingsService;

describe('app-calendar', () => {
  describe('resolveAppTimezone', () => {
    it('returns the configured Regional Settings timezone', async () => {
      await expect(
        resolveAppTimezone(settingsServiceWith('Asia/Kuala_Lumpur')),
      ).resolves.toBe('Asia/Kuala_Lumpur');
    });

    it('passes a null timezone through so the formatter can apply its fallback', async () => {
      await expect(resolveAppTimezone(settingsServiceWith(null))).resolves.toBeNull();
    });
  });

  describe('getAppToday', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(FROZEN_INSTANT);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('derives today in the configured timezone, not UTC', async () => {
      await expect(getAppToday(settingsServiceWith('Asia/Kuala_Lumpur'))).resolves.toBe(
        '2026-08-25',
      );
    });

    it('derives the UTC date when UTC is the configured timezone', async () => {
      await expect(getAppToday(settingsServiceWith('UTC'))).resolves.toBe('2026-08-24');
    });

    it('falls back to the default timezone when none is configured', async () => {
      // The fallback is invisible at the call site: an unset timezone yields
      // app-local dates, not UTC.
      await expect(getAppToday(settingsServiceWith(null))).resolves.toBe('2026-08-25');
    });
  });

  describe('formatDateInTimezone boundary fixtures', () => {
    it.each([
      ['2026-08-24T15:59:59.999Z', 'Asia/Kuala_Lumpur', '2026-08-24'],
      ['2026-08-24T16:00:00.000Z', 'Asia/Kuala_Lumpur', '2026-08-25'],
      ['2026-08-24T16:30:00.000Z', 'Asia/Kuala_Lumpur', '2026-08-25'],
      ['2026-08-24T16:30:00.000Z', 'UTC', '2026-08-24'],
    ])('formats %s in %s as %s', (instant, timezone, expected) => {
      expect(formatDateInTimezone(new Date(instant), timezone)).toBe(expected);
    });
  });
});
