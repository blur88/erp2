import { AccountType } from '../entities/account-type.enum';
import type { AccountingSettings } from '../entities/accounting-settings.entity';

/**
 * Invariants for chart_of_account.isProviderClearing (#1285, spec §4.2). ONE rule
 * set shared by the COA write paths and the Accounting Settings guard; the
 * seeding migration applies the same predicate in SQL.
 */
export const PROVIDER_CLEARING_CONFLICTING_SETTINGS = [
  'cashAccountId', 'bankAccountId', 'customerDepositAccountId',
] as const;

const SETTING_LABEL: Record<(typeof PROVIDER_CLEARING_CONFLICTING_SETTINGS)[number], string> = {
  cashAccountId: 'Cash', bankAccountId: 'Bank', customerDepositAccountId: 'Customer Deposit',
};

export function providerClearingViolation(
  account: { id: string; type: AccountType; isPostable: boolean; isBankAccount?: boolean },
  settings: Pick<AccountingSettings, (typeof PROVIDER_CLEARING_CONFLICTING_SETTINGS)[number]> | null,
): string | null {
  if (account.type !== AccountType.ASSET) return 'Only an Asset account can be a provider clearing account';
  if (!account.isPostable) return 'Only a postable account can be a provider clearing account';
  if (account.isBankAccount) return 'A bank account cannot be a provider clearing account';
  const field = settings
    ? PROVIDER_CLEARING_CONFLICTING_SETTINGS.find((f) => settings[f] === account.id)
    : undefined;
  if (field) {
    return `This account is the Accounting Settings ${SETTING_LABEL[field]} account and cannot be a provider clearing account`;
  }
  return null;
}
