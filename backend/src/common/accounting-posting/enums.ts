export enum AccountType {
  ASSET = 'Asset',
  LIABILITY = 'Liability',
  EQUITY = 'Equity',
  INCOME = 'Income',
  EXPENSE = 'Expense',
}

export enum PostingType {
  OPENING_BALANCE = 'OPENING_BALANCE',
  SALES_PAYMENT = 'SALES_PAYMENT',
  SALES_FULFILLMENT_REVENUE = 'SALES_FULFILLMENT_REVENUE',
  SALES_FULFILLMENT_COGS = 'SALES_FULFILLMENT_COGS',
  SALES_REFUND = 'SALES_REFUND',
  PURCHASE_PAYMENT = 'PURCHASE_PAYMENT',
  PURCHASE_RECEIVE = 'PURCHASE_RECEIVE',
  PURCHASE_REFUND = 'PURCHASE_REFUND',
  STOCK_ADJUSTMENT = 'STOCK_ADJUSTMENT',
  EXPENSE_PAYMENT = 'EXPENSE_PAYMENT',
  EXPENSE_REFUND = 'EXPENSE_REFUND',

  // Appended for Owner Equity (#1022). ALTER TYPE ... ADD VALUE has no
  // BEFORE/AFTER clause, so these land last on migrated databases. Declaration
  // order here must match that, or verify-baseline.sh fails comparing a
  // migrated schema against a schema:sync reference.
  OWNER_CAPITAL_INJECTION = 'OWNER_CAPITAL_INJECTION',
  OWNER_CAPITAL_INJECTION_REFUND = 'OWNER_CAPITAL_INJECTION_REFUND',
  OWNER_CASH_DRAWING = 'OWNER_CASH_DRAWING',
  OWNER_CASH_DRAWING_REFUND = 'OWNER_CASH_DRAWING_REFUND',
  OWNER_STOCK_DRAWING = 'OWNER_STOCK_DRAWING',

  // Appended for Provider Settlements (#1257). ALTER TYPE ... ADD VALUE has no
  // BEFORE/AFTER clause, so this lands last on migrated databases. Declaration
  // order here must match, or verify-baseline.sh fails comparing a migrated
  // schema against a schema:sync reference.
  PROVIDER_SETTLEMENT = 'PROVIDER_SETTLEMENT',
}

export enum AccountingSourceType {
  SALES_ORDER = 'SALES_ORDER',
  PURCHASE_ORDER = 'PURCHASE_ORDER',
  STOCK_ADJUSTMENT = 'STOCK_ADJUSTMENT',
  OPENING_BALANCE = 'OPENING_BALANCE',
  EXPENSE = 'EXPENSE',
  OWNER_EQUITY = 'OWNER_EQUITY',   // appended — see PostingType comment above
  PROVIDER_SETTLEMENT = 'PROVIDER_SETTLEMENT', // appended — see PostingType comment
}

export type PaymentChannel = 'CASH' | 'BANK';
