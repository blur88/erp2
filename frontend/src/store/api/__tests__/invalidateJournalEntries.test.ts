import { describe, expect, it, vi } from 'vitest'

import { accountingApiSlice } from '@/store/api/accountingApi'
import { invalidateJournalEntriesOnSuccess } from '@/store/api/invalidateJournalEntries'

describe('invalidateJournalEntriesOnSuccess', () => {
  it('dispatches JournalEntry and TrialBalance invalidation after the mutation succeeds', async () => {
    const dispatch = vi.fn()
    const queryFulfilled = Promise.resolve({ data: {} })

    await invalidateJournalEntriesOnSuccess(undefined, { dispatch, queryFulfilled })

    const expected = accountingApiSlice.util.invalidateTags(['JournalEntry', 'TrialBalance'])
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0][0]).toEqual(expected)
  })

  it('does not dispatch and does not throw when the mutation fails', async () => {
    const dispatch = vi.fn()
    const queryFulfilled = Promise.reject(new Error('mutation failed'))

    await expect(
      invalidateJournalEntriesOnSuccess(undefined, { dispatch, queryFulfilled }),
    ).resolves.toBeUndefined()
    expect(dispatch).not.toHaveBeenCalled()
  })
})
