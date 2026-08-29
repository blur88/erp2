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
