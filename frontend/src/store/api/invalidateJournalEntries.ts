import { accountingApiSlice } from './accountingApi'

export const invalidateJournalEntriesOnSuccess = async (
  _arg: unknown,
  { dispatch, queryFulfilled }: { dispatch: any; queryFulfilled: Promise<unknown> },
): Promise<void> => {
  try {
    await queryFulfilled
  } catch {
    return
  }
  dispatch(accountingApiSlice.util.invalidateTags(['JournalEntry', 'TrialBalance']))
}
