import { SettingsService } from '../../modules/settings/settings.service';

import { formatDateInTimezone } from './date-in-timezone';

/**
 * Resolve the application's business-calendar timezone from Regional Settings.
 *
 * Callers format their own instant with `formatDateInTimezone(instant, tz)`
 * rather than being handed a ready-made "today". That is deliberate: several
 * posting call sites must resolve a *meaningful* instant (`fulfilledAt`,
 * `receiveDate`, `completedAt`), and a `getToday()`-shaped helper invites
 * silently substituting a fresh `new Date()` for it (issue #1134).
 *
 * Call this BEFORE opening a domain transaction and close over the result.
 * `getRegionalSettings()` reads through the default DataSource — not the active
 * EntityManager — so calling it inside a transaction issues a query on a
 * separate connection while that transaction is open, and on a fresh install it
 * writes a default row.
 */
export async function resolveAppTimezone(
  settingsService: SettingsService,
): Promise<string | null | undefined> {
  const { timezone } = await settingsService.getRegionalSettings();
  return timezone;
}

/**
 * Convenience for the "today, in the application timezone" case, where no
 * meaningful instant exists. Do not use it where the operation already has one.
 */
export async function getAppToday(
  settingsService: SettingsService,
): Promise<string> {
  return formatDateInTimezone(new Date(), await resolveAppTimezone(settingsService));
}
