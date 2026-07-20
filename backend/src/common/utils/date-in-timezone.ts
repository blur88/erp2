export const DEFAULT_TIMEZONE = 'Asia/Kuala_Lumpur';

/**
 * Format an instant as a YYYY-MM-DD calendar date in the given IANA timezone.
 * Used for deriving "today" (or any instant's calendar day) in the application
 * timezone rather than the server/UTC clock. Falls back to DEFAULT_TIMEZONE.
 */
export function formatDateInTimezone(
  instant: Date,
  timezone: string | null | undefined,
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || DEFAULT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}
