import { describe, expect, it } from 'vitest'

import { accountingApiSlice } from '@/store/api/accountingApi'

describe('accountingApiSlice', () => {
  it('defines core accounting endpoints', () => {
    expect(accountingApiSlice.endpoints.getAccountTree).toBeDefined()
    expect(accountingApiSlice.endpoints.getAccounts).toBeDefined()
    expect(accountingApiSlice.endpoints.createAccount).toBeDefined()
    expect(accountingApiSlice.endpoints.updateAccount).toBeDefined()
    expect(accountingApiSlice.endpoints.getAccountingSettings).toBeDefined()
    expect(accountingApiSlice.endpoints.updateAccountingSettings).toBeDefined()
    expect(accountingApiSlice.endpoints.getJournalEntries).toBeDefined()
    expect(accountingApiSlice.endpoints.getJournalEntry).toBeDefined()
    expect(accountingApiSlice.endpoints.getGeneralLedger).toBeDefined()
    expect(accountingApiSlice.endpoints.getTrialBalance).toBeDefined()
  })
})
