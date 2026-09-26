import { accountingApiSlice } from './accountingApi'

/**
 * `onQueryStarted` handler for mutations that trigger backend accounting
 * postings (sales/purchase payments, fulfillment, receive, reversals). On
 * success it invalidates the accounting reports that those postings change —
 * Journal Entries, Trial Balance and Profit & Loss — so their pages refetch without a
 * manual browser refresh (issue #919). Cross-slice: sales/purchasing mutations
 * cannot invalidate accountingApi tags on their own.
 */
export const invalidateAccountingReportsOnSuccess = async (
  _arg: unknown,
  { dispatch, queryFulfilled }: { dispatch: any; queryFulfilled: Promise<unknown> },
): Promise<void> => {
  try {
    await queryFulfilled
  } catch {
    return
  }
  dispatch(accountingApiSlice.util.invalidateTags(['JournalEntry', 'TrialBalance', 'ProfitAndLoss']))
}

/**
 * `onQueryStarted` handler for the sales mutations that change which rows New
 * Provider Settlement may offer — payment, refund and unpay (eligibility is a
 * payment with an unreversed posting journal; fulfillment plays no part). Adds
 * `ProviderSettlement` to the report invalidation so the picker refetches
 * without a browser refresh (issue #1296).
 */
export const invalidateSettlementEligibilityOnSuccess = async (
  _arg: unknown,
  { dispatch, queryFulfilled }: { dispatch: any; queryFulfilled: Promise<unknown> },
): Promise<void> => {
  try {
    await queryFulfilled
  } catch {
    return
  }
  dispatch(accountingApiSlice.util.invalidateTags(['JournalEntry', 'TrialBalance', 'ProfitAndLoss', 'ProviderSettlement']))
}
