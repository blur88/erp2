import { AccountType } from '../entities/account-type.enum';
import type { AccountingSettings } from '../entities/accounting-settings.entity';

/**
 * Invariants for chart_of_account.isBankAccount (#1298, spec §5). ONE rule set
 * shared by the COA write paths and the Accounting Settings guard; the
 * AddBankAccountFlag migration applies the same predicate when it backfills.
 */
export const BANK_FLAG_FORBIDDEN_SETTINGS = [
  'cashAccountId', 'inventoryAccountId', 'supplierDepositAccountId',
] as const;

const SETTING_LABEL: Record<(typeof BANK_FLAG_FORBIDDEN_SETTINGS)[number], string> = {
  cashAccountId: 'Cash', inventoryAccountId: 'Inventory', supplierDepositAccountId: 'Supplier Deposit',
};

export function bankAccountViolation(
  account: { id: string; type: AccountType; isPostable: boolean; isProviderClearing?: boolean },
  settings: Pick<AccountingSettings, (typeof BANK_FLAG_FORBIDDEN_SETTINGS)[number]> | null,
): string | null {
  if (account.type !== AccountType.ASSET) return 'Only an Asset account can be a bank account';
  if (!account.isPostable) return 'Only a postable account can be a bank account';
  if (account.isProviderClearing) return 'A provider clearing account cannot be a bank account';
  const field = settings
    ? BANK_FLAG_FORBIDDEN_SETTINGS.find((f) => settings[f] === account.id)
    : undefined;
  if (field) {
    return `This account is the Accounting Settings ${SETTING_LABEL[field]} account and cannot be a bank account`;
  }
  return null;
}
