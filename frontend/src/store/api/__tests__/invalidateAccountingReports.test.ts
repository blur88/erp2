import { describe, expect, it, vi } from 'vitest'

import { accountingApiSlice } from '@/store/api/accountingApi'
import { invalidateAccountingReportsOnSuccess } from '@/store/api/invalidateAccountingReports'

describe('invalidateAccountingReportsOnSuccess', () => {
  it('dispatches JournalEntry, TrialBalance and ProfitAndLoss invalidation after the mutation succeeds', async () => {
    const dispatch = vi.fn()
    const queryFulfilled = Promise.resolve({ data: {} })

    await invalidateAccountingReportsOnSuccess(undefined, { dispatch, queryFulfilled })

    // ProfitAndLoss is included because every posting that moves the Trial
    // Balance also moves the Profit & Loss figures.
    const expected = accountingApiSlice.util.invalidateTags([
      'JournalEntry', 'TrialBalance', 'ProfitAndLoss',
    ])
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch.mock.calls[0][0]).toEqual(expected)
  })

  it('does not dispatch and does not throw when the mutation fails', async () => {
    const dispatch = vi.fn()
    const queryFulfilled = Promise.reject(new Error('mutation failed'))

    await expect(
      invalidateAccountingReportsOnSuccess(undefined, { dispatch, queryFulfilled }),
    ).resolves.toBeUndefined()
    expect(dispatch).not.toHaveBeenCalled()
  })
})
