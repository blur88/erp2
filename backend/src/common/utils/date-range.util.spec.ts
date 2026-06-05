import { DateTime } from "luxon";
import { DateRange } from "@/common/dto/analytics.dto";
import { resolveDateRange } from "./date-range.util";

describe("resolveDateRange", () => {
  const TZ = "Asia/Kuala_Lumpur";
  const fixedUtcNow = new Date("2026-04-09T23:30:00.000Z");

  function kl(
    year: number,
    month: number,
    day: number,
    hour = 0,
    minute = 0,
    second = 0,
    ms = 0,
  ): Date {
    return DateTime.fromObject(
      { year, month, day, hour, minute, second, millisecond: ms },
      { zone: TZ },
    ).toJSDate();
  }

  describe("custom date range", () => {
    it("returns normalized custom dates regardless of dateRange param", () => {
      const start = new Date("2026-03-01T00:00:00.000Z");
      const end = new Date("2026-03-31T00:00:00.000Z");
      const { startDate, endDate } = resolveDateRange(
        TZ,
        undefined,
        start,
        end,
        fixedUtcNow,
      );

      expect(startDate.toISOString()).toBe("2026-03-01T00:00:00.000Z");
      expect(endDate.toISOString()).toBe("2026-03-31T23:59:59.999Z");
    });
  });

  describe("TODAY", () => {
    it("returns start and end of the current day in the configured timezone", () => {
      const { startDate, endDate } = resolveDateRange(
        TZ,
        DateRange.TODAY,
        undefined,
        undefined,
        fixedUtcNow,
      );

      expect(startDate.toISOString()).toBe(
        kl(2026, 4, 10, 0, 0, 0, 0).toISOString(),
      );
      expect(endDate.toISOString()).toBe(
        kl(2026, 4, 10, 23, 59, 59, 999).toISOString(),
      );
    });
  });

  describe("THIS_WEEK", () => {
    it("returns start of Sunday of the current week in the configured timezone", () => {
      const { startDate, endDate } = resolveDateRange(
        TZ,
        DateRange.THIS_WEEK,
        undefined,
        undefined,
        fixedUtcNow,
      );

      expect(startDate.toISOString()).toBe(
        kl(2026, 4, 5, 0, 0, 0, 0).toISOString(),
      );
      expect(endDate.toISOString()).toBe(
        kl(2026, 4, 10, 23, 59, 59, 999).toISOString(),
      );
    });
  });

  describe("THIS_MONTH", () => {
    it("returns first day of current month in the configured timezone", () => {
      const { startDate, endDate } = resolveDateRange(
        TZ,
        DateRange.THIS_MONTH,
        undefined,
        undefined,
        fixedUtcNow,
      );

      expect(startDate.toISOString()).toBe(
        kl(2026, 4, 1, 0, 0, 0, 0).toISOString(),
      );
      expect(endDate.toISOString()).toBe(
        kl(2026, 4, 10, 23, 59, 59, 999).toISOString(),
      );
    });
  });

  describe("THIS_QUARTER", () => {
    it("returns first day of Q2 (Apr) for April date", () => {
      const { startDate } = resolveDateRange(
        TZ,
        DateRange.THIS_QUARTER,
        undefined,
        undefined,
        fixedUtcNow,
      );

      expect(startDate.toISOString()).toBe(
        kl(2026, 4, 1, 0, 0, 0, 0).toISOString(),
      );
    });
  });

  describe("THIS_YEAR", () => {
    it("returns Jan 1 of current year in the configured timezone", () => {
      const { startDate } = resolveDateRange(
        TZ,
        DateRange.THIS_YEAR,
        undefined,
        undefined,
        fixedUtcNow,
      );

      expect(startDate.toISOString()).toBe(
        kl(2026, 1, 1, 0, 0, 0, 0).toISOString(),
      );
    });
  });

  describe("LAST_WEEK", () => {
    it("returns the full previous week (Sun-Sat) in the configured timezone", () => {
      const { startDate, endDate } = resolveDateRange(
        TZ,
        DateRange.LAST_WEEK,
        undefined,
        undefined,
        fixedUtcNow,
      );

      expect(startDate.toISOString()).toBe(
        kl(2026, 3, 29, 0, 0, 0, 0).toISOString(),
      );
      expect(endDate.toISOString()).toBe(
        kl(2026, 4, 4, 23, 59, 59, 999).toISOString(),
      );
    });
  });

  describe("LAST_MONTH", () => {
    it("returns the full previous calendar month in the configured timezone", () => {
      const { startDate, endDate } = resolveDateRange(
        TZ,
        DateRange.LAST_MONTH,
        undefined,
        undefined,
        fixedUtcNow,
      );

      expect(startDate.toISOString()).toBe(
        kl(2026, 3, 1, 0, 0, 0, 0).toISOString(),
      );
      expect(endDate.toISOString()).toBe(
        kl(2026, 3, 31, 23, 59, 59, 999).toISOString(),
      );
    });
  });

  describe("LAST_QUARTER", () => {
    it("returns Q1 (Jan-Mar) when current month is April", () => {
      const { startDate, endDate } = resolveDateRange(
        TZ,
        DateRange.LAST_QUARTER,
        undefined,
        undefined,
        fixedUtcNow,
      );

      expect(startDate.toISOString()).toBe(
        kl(2026, 1, 1, 0, 0, 0, 0).toISOString(),
      );
      expect(endDate.toISOString()).toBe(
        kl(2026, 3, 31, 23, 59, 59, 999).toISOString(),
      );
    });
  });

  describe("LAST_YEAR", () => {
    it("returns the full previous calendar year in the configured timezone", () => {
      const { startDate, endDate } = resolveDateRange(
        TZ,
        DateRange.LAST_YEAR,
        undefined,
        undefined,
        fixedUtcNow,
      );

      expect(startDate.toISOString()).toBe(
        kl(2025, 1, 1, 0, 0, 0, 0).toISOString(),
      );
      expect(endDate.toISOString()).toBe(
        kl(2025, 12, 31, 23, 59, 59, 999).toISOString(),
      );
    });
  });

  describe("default (no dateRange)", () => {
    it("defaults to THIS_MONTH when dateRange is undefined", () => {
      const { startDate } = resolveDateRange(
        TZ,
        undefined,
        undefined,
        undefined,
        fixedUtcNow,
      );

      expect(startDate.toISOString()).toBe(
        kl(2026, 4, 1, 0, 0, 0, 0).toISOString(),
      );
    });
  });

  describe("UTC boundary correctness", () => {
    it("midnight KL is 16:00 previous day UTC (not 00:00 UTC)", () => {
      const { startDate } = resolveDateRange(
        TZ,
        DateRange.TODAY,
        undefined,
        undefined,
        fixedUtcNow,
      );

      expect(startDate.getUTCHours()).toBe(16);
      expect(startDate.getUTCDate()).toBe(9);
    });
  });
});
