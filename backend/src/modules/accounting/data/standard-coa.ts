import { AccountType } from '../../../common/accounting-posting/enums';

export interface StandardCoaGroup {
  code: string;
  name: string;
  type: AccountType;
}

export interface StandardCoaChild extends StandardCoaGroup {
  parentCode: string;
}

// Canonical accounting reference data. MUST stay in sync with migration
// 1772100000001-CreateAccountingV1.ts (enforced by standard-coa.spec.ts).
export const STANDARD_COA_GROUPS: ReadonlyArray<StandardCoaGroup> = [
  { code: '1000', name: 'Assets', type: AccountType.ASSET },
  { code: '2000', name: 'Liabilities', type: AccountType.LIABILITY },
  { code: '3000', name: 'Equity', type: AccountType.EQUITY },
  { code: '4000', name: 'Income', type: AccountType.INCOME },
  { code: '5000', name: 'Cost of Sales', type: AccountType.EXPENSE },
  { code: '6000', name: 'Expenses', type: AccountType.EXPENSE },
];

export const STANDARD_COA_CHILDREN: ReadonlyArray<StandardCoaChild> = [
  { code: '1100', name: 'Cash', type: AccountType.ASSET, parentCode: '1000' },
  { code: '1200', name: 'Bank', type: AccountType.ASSET, parentCode: '1000' },
  { code: '1300', name: 'Inventory', type: AccountType.ASSET, parentCode: '1000' },
  { code: '1400', name: 'Supplier Deposit', type: AccountType.ASSET, parentCode: '1000' },
  { code: '2100', name: 'Customer Deposit', type: AccountType.LIABILITY, parentCode: '2000' },
  { code: '3100', name: 'Owner Capital', type: AccountType.EQUITY, parentCode: '3000' },
  { code: '3200', name: 'Opening Balance Equity', type: AccountType.EQUITY, parentCode: '3000' },
  { code: '4100', name: 'Sales Revenue', type: AccountType.INCOME, parentCode: '4000' },
  { code: '5100', name: 'Cost of Goods Sold', type: AccountType.EXPENSE, parentCode: '5000' },
  { code: '6990', name: 'Other Expenses', type: AccountType.EXPENSE, parentCode: '6000' },
];

// settings column name -> COA code it must reference
export const SETTINGS_CODE_MAP = {
  cashAccountId: '1100',
  bankAccountId: '1200',
  inventoryAccountId: '1300',
  supplierDepositAccountId: '1400',
  customerDepositAccountId: '2100',
  openingBalanceEquityAccountId: '3200',
  salesRevenueAccountId: '4100',
  cogsAccountId: '5100',
  defaultExpenseAccountId: '6990',
} as const;

export type SettingsCodeMap = typeof SETTINGS_CODE_MAP;