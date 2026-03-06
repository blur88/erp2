import { describe, expect, it } from 'vitest'

import { accountingApiSlice } from '@/store/api/accountingApi'

describe('accountingApiSlice', () => {
  it('defines consolidated accounting endpoints', () => {
    expect(accountingApiSlice.endpoints.getChartOfAccounts).toBeDefined()
    expect(accountingApiSlice.endpoints.getChartOfAccountsHierarchy).toBeDefined()
    expect(accountingApiSlice.endpoints.getDeletedChartOfAccounts).toBeDefined()
    expect(accountingApiSlice.endpoints.getJournalEntries).toBeDefined()
    expect(accountingApiSlice.endpoints.getFiscalPeriods).toBeDefined()
    expect(accountingApiSlice.endpoints.getCurrentFiscalPeriod).toBeDefined()
    expect(accountingApiSlice.endpoints.getAccountMappings).toBeDefined()
    expect(accountingApiSlice.endpoints.validateAccountMappings).toBeDefined()
    expect(accountingApiSlice.endpoints.getBankReconciliations).toBeDefined()
    expect(accountingApiSlice.endpoints.getPaymentMethods).toBeDefined()
    expect(accountingApiSlice.endpoints.getSettlements).toBeDefined()
    expect(accountingApiSlice.endpoints.getPendingSettlementSummary).toBeDefined()
    expect(accountingApiSlice.endpoints.getOwnerEquityTransactions).toBeDefined()
    expect(accountingApiSlice.endpoints.getExpenses).toBeDefined()
    expect(accountingApiSlice.endpoints.getTrialBalance).toBeDefined()
    expect(accountingApiSlice.endpoints.getBalanceSheet).toBeDefined()
    expect(accountingApiSlice.endpoints.getProfitAndLoss).toBeDefined()
    expect(accountingApiSlice.endpoints.getGeneralLedger).toBeDefined()
    expect(accountingApiSlice.endpoints.getAccountActivity).toBeDefined()
  })
})
