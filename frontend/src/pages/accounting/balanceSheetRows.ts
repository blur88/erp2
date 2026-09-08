// balanceSheetRows.ts
import { formatCurrency } from '@/utils/currency'
import type { BalanceSheetAmount, BalanceSheetSection } from '@/types'

/**
 * null means UNKNOWN, not zero. Rendering it as '0.00' would assert a figure the
 * backend explicitly declined to compute.
 */
export function formatBalanceAmount(amount: BalanceSheetAmount): string {
  return amount === null ? '—' : formatCurrency(amount)
}

/**
 * The General Ledger filter shape — `account` + a custom period, matching
 * ProfitAndLossPage.openLedger. (An older design note said `?accountId=&toDate=`;
 * that shape does not exist.)
 *
 * The window starts at 1 January even though balance-sheet rows are cumulative:
 * General Ledger computes its own opening balance from a strict
 * `entryDate < fromDate` query, so prior-year contributions appear there and the
 * view's CLOSING balance reconciles to the row.
 */
export function buildLedgerLink(accountId: string, year: number, asOfDate: string): string {
  const params = new URLSearchParams({
    account: accountId,
    period: 'custom',
    period_from: `${year}-01-01`,
    period_to: asOfDate,
  })
  return `/accounting/general-ledger?${params.toString()}`
}

export const SECTION_LABELS: Record<BalanceSheetSection, string> = {
  nonCurrentAssets: 'Non-current Assets',
  otherAssets: 'Investments',
  currentAssets: 'Current Assets',
  liabilities: 'Liabilities',
  ownersEquity: "Owner's Equity",
}
