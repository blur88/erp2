import { DateTime } from "luxon";
import { DateRange } from "@/common/dto/analytics.dto";

export function resolveDateRange(
  timezone: string,
  dateRange?: DateRange,
  customStartDate?: Date,
  customEndDate?: Date,
  now: Date = new Date(),
): { startDate: Date; endDate: Date } {
  if (customStartDate && customEndDate) {
    const normalizedStart = new Date(customStartDate);
    normalizedStart.setUTCHours(0, 0, 0, 0);

    const normalizedEnd = new Date(customEndDate);
    normalizedEnd.setUTCHours(23, 59, 59, 999);

    return { startDate: normalizedStart, endDate: normalizedEnd };
  }

  const current = DateTime.fromJSDate(now, { zone: timezone });
  const endOfToday = current.endOf("day");
  let startDate: Date;
  let endDate = endOfToday.toJSDate();

  switch (dateRange) {
    case DateRange.TODAY:
      startDate = current.startOf("day").toJSDate();
      break;
    case DateRange.THIS_WEEK:
      startDate = current
        .startOf("day")
        .minus({ days: current.weekday % 7 })
        .toJSDate();
      break;
    case DateRange.THIS_MONTH:
      startDate = current.startOf("month").toJSDate();
      break;
    case DateRange.THIS_QUARTER: {
      const quarterStartMonth = Math.floor((current.month - 1) / 3) * 3 + 1;
      startDate = current
        .set({ month: quarterStartMonth })
        .startOf("month")
        .toJSDate();
      break;
    }
    case DateRange.THIS_YEAR:
      startDate = current.startOf("year").toJSDate();
      break;
    case DateRange.LAST_WEEK: {
      const startOfThisWeek = current
        .startOf("day")
        .minus({ days: current.weekday % 7 });
      startDate = startOfThisWeek.minus({ weeks: 1 }).toJSDate();
      endDate = startOfThisWeek.minus({ milliseconds: 1 }).toJSDate();
      break;
    }
    case DateRange.LAST_MONTH: {
      const lastMonth = current.minus({ months: 1 });
      startDate = lastMonth.startOf("month").toJSDate();
      endDate = lastMonth.endOf("month").toJSDate();
      break;
    }
    case DateRange.LAST_QUARTER: {
      const currentQuarterStartMonth =
        Math.floor((current.month - 1) / 3) * 3 + 1;
      const lastQuarterStartMonth = currentQuarterStartMonth - 3;
      const lastQuarter =
        lastQuarterStartMonth < 1
          ? current.set({
              year: current.year - 1,
              month: lastQuarterStartMonth + 12,
            })
          : current.set({ month: lastQuarterStartMonth });
      startDate = lastQuarter.startOf("month").toJSDate();
      endDate = lastQuarter.plus({ months: 2 }).endOf("month").toJSDate();
      break;
    }
    case DateRange.LAST_YEAR: {
      const lastYear = current.minus({ years: 1 });
      startDate = lastYear.startOf("year").toJSDate();
      endDate = lastYear.endOf("year").toJSDate();
      break;
    }
    default:
      startDate = current.startOf("month").toJSDate();
      break;
  }

  return { startDate, endDate };
}
