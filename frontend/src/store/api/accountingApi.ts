import { createApi } from '@reduxjs/toolkit/query/react'

import type {
  BankReconciliation,
  ChartOfAccount,
  ExpenseRecord,
  FiscalPeriod,
  FundTransfer,
  JournalEntry,
  OwnerEquityTransaction,
  PaginatedResponse,
  PaymentMethodConfig,
  PendingSettlementSummary,
  RecentActivityItem,
  Settlement,
} from '@/types'
import type {
  AccountMapping,
  AccountMappingValidationResult,
  CreateAccountMappingDto,
  UpdateAccountMappingDto,
} from '@/types/accountMapping'

import { axiosBaseQuery } from './baseQuery'
import { normalizePaginated, normalizeSingle } from './normalizers'

type ProfitAndLossReport = {
  startDate: string
  endDate: string
  revenue: {
    accounts: Array<{ id: string; code: string; name: string; amount: number }>
    subtotal: number
  }
  cogs: {
    accounts: Array<{ id: string; code: string; name: string; amount: number }>
    subtotal: number
  }
  expenses: {
    accounts: Array<{ id: string; code: string; name: string; amount: number }>
    subtotal: number
  }
  grossProfit: number
  operatingIncome: number
  netIncome: number
}

type GeneralLedgerReport = {
  account: { id: string; code: string; name: string; type: string }
  startDate: string
  endDate: string
  openingBalance: number
  transactions: Array<{
    date: string
    entryNumber: string
    description: string
    debitAmount: number
    creditAmount: number
    runningBalance: number
  }>
  totalDebits: number
  totalCredits: number
  closingBalance: number
}

type AccountActivityReport = {
  account: { id: string; code: string; name: string; type: string }
  startDate: string
  endDate: string
  entries: Array<{
    id: string
    entryDate: string
    entryNumber: string
    entryType: string
    status: string
    description: string
    debitAmount: number
    creditAmount: number
    referenceType?: string
    referenceId?: string
    referenceNumber?: string
  }>
  totalEntries: number
}

type CreateFundTransferPayload = {
  sourceAccountId: string
  destinationAccountId: string
  amount: number
  transferDate: string
  description?: string
}

type UpdateFundTransferPayload = {
  id: string
  sourceAccountId?: string
  destinationAccountId?: string
  amount?: number
  transferDate?: string
  description?: string
}

export interface BankReconciliationsParams {
  search?: string
  status?: string
  startDate?: string
  endDate?: string
  accountId?: string
  isBalanced?: boolean
  sortBy?: string
  sortOrder?: 'ASC' | 'DESC'
  page?: number
  limit?: number
  [key: string]: unknown
}

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeNamedCollection<T>(
  response: any,
  key: 'data' | 'accounts' | 'entries' | 'periods' | 'mappings' | 'reconciliations',
): PaginatedResponse<T> {
  if (!response) {
    return { data: [], meta: { total: 0 } }
  }

  if (Array.isArray(response)) {
    return {
      data: response,
      meta: { total: response.length },
    }
  }

  const data = response[key] ?? response.data ?? []

  return {
    data: Array.isArray(data) ? data : [],
    meta: { total: response.meta?.total ?? response.total ?? (Array.isArray(data) ? data.length : 0) },
  }
}

function normalizeProfitAndLossReport(response: any, params: { startDate: string; endDate: string }): ProfitAndLossReport {
  const normalizeSection = (section?: any) => {
    const accounts = (section?.accounts ?? []).map((account: any, index: number) => ({
      id: account.id ?? `${account.code ?? account.accountCode ?? 'account'}-${index}`,
      code: account.code ?? account.accountCode ?? '',
      name: account.name ?? account.accountName ?? '',
      amount: toNumber(account.amount ?? account.balance),
    }))
    const computedSubtotal = accounts.reduce((sum, account) => sum + account.amount, 0)

    return {
      accounts,
      subtotal: toNumber(section?.subtotal ?? section?.total, computedSubtotal),
    }
  }

  const revenue = normalizeSection(response?.revenue)
  const cogs = normalizeSection(response?.cogs ?? response?.costOfGoodsSold)
  const expenses = normalizeSection(response?.expenses)
  const grossProfit = toNumber(response?.grossProfit, revenue.subtotal - cogs.subtotal)
  const operatingIncome = toNumber(response?.operatingIncome, grossProfit - expenses.subtotal)

  return {
    startDate: response?.startDate ?? params.startDate,
    endDate: response?.endDate ?? params.endDate,
    revenue,
    cogs,
    expenses,
    grossProfit,
    operatingIncome,
    netIncome: toNumber(response?.netIncome, operatingIncome),
  }
}

function normalizeGeneralLedgerReport(response: any, params: { accountId: string; startDate: string; endDate: string }): GeneralLedgerReport {
  const transactions = (response?.transactions ?? []).map((transaction: any) => ({
    date: transaction.date ?? '',
    entryNumber: transaction.entryNumber ?? '',
    description: transaction.description ?? '',
    debitAmount: toNumber(transaction.debitAmount ?? transaction.debit),
    creditAmount: toNumber(transaction.creditAmount ?? transaction.credit),
    runningBalance: toNumber(transaction.runningBalance ?? transaction.balance),
  }))
  const openingBalance = toNumber(response?.openingBalance)

  return {
    account: {
      id: response?.account?.id ?? params.accountId,
      code: response?.account?.code ?? '',
      name: response?.account?.name ?? '',
      type: response?.account?.type ?? '',
    },
    startDate: response?.startDate ?? params.startDate,
    endDate: response?.endDate ?? params.endDate,
    openingBalance,
    transactions,
    totalDebits: toNumber(
      response?.totalDebits,
      transactions.reduce((sum, transaction) => sum + transaction.debitAmount, 0),
    ),
    totalCredits: toNumber(
      response?.totalCredits,
      transactions.reduce((sum, transaction) => sum + transaction.creditAmount, 0),
    ),
    closingBalance: toNumber(
      response?.closingBalance,
      transactions.length > 0 ? transactions[transactions.length - 1].runningBalance : openingBalance,
    ),
  }
}

function normalizeAccountActivityReport(response: any, params: { accountId: string; startDate: string; endDate: string }): AccountActivityReport {
  const rawEntries = response?.entries ?? response?.activity ?? []
  const entries = rawEntries.map((entry: any, index: number) => {
    const entryNumber = entry.entryNumber ?? entry.referenceNumber ?? ''
    return {
      id: entry.id ?? `${entryNumber || 'entry'}-${index}`,
      entryDate: entry.entryDate ?? entry.date ?? '',
      entryNumber,
      entryType: entry.entryType ?? entry.referenceType ?? 'MANUAL',
      status: entry.status ?? '',
      description: entry.description ?? '',
      debitAmount: toNumber(entry.debitAmount ?? entry.debit),
      creditAmount: toNumber(entry.creditAmount ?? entry.credit),
      referenceType: entry.referenceType,
      referenceId: entry.referenceId,
      referenceNumber: entry.referenceNumber,
    }
  })

  return {
    account: {
      id: response?.account?.id ?? params.accountId,
      code: response?.account?.code ?? '',
      name: response?.account?.name ?? '',
      type: response?.account?.type ?? '',
    },
    startDate: response?.startDate ?? params.startDate,
    endDate: response?.endDate ?? params.endDate,
    entries,
    totalEntries: toNumber(response?.totalEntries, entries.length),
  }
}

export const accountingApiSlice = createApi({
  reducerPath: 'accountingApi',
  baseQuery: axiosBaseQuery(),
  tagTypes: [
    'ChartOfAccount',
    'DeletedChartOfAccount',
    'JournalEntry',
    'FiscalPeriod',
    'AccountMapping',
    'BankReconciliation',
    'DeletedBankReconciliation',
    'PaymentMethod',
    'Settlement',
    'OwnerEquity',
    'Expense',
    'FundTransfer',
    'AccountingReport',
  ],
  endpoints: (builder) => ({
    getChartOfAccounts: builder.query<PaginatedResponse<ChartOfAccount>, Record<string, unknown> | undefined>({
      query: (params) => ({ url: '/accounting/chart-of-accounts', params: params ?? {} }),
      transformResponse: (response: any) => normalizeNamedCollection<ChartOfAccount>(response, 'accounts'),
      providesTags: ['ChartOfAccount'],
    }),
    getChartOfAccountsHierarchy: builder.query<ChartOfAccount[], void>({
      query: () => ({ url: '/accounting/chart-of-accounts/hierarchy' }),
      transformResponse: (response: any) => (Array.isArray(response) ? response : response?.data ?? []),
      providesTags: ['ChartOfAccount'],
    }),
    getChartOfAccount: builder.query<ChartOfAccount, string>({
      query: (id) => ({ url: `/accounting/chart-of-accounts/${id}` }),
      transformResponse: normalizeSingle<ChartOfAccount>,
      providesTags: (_result, _error, id) => [{ type: 'ChartOfAccount', id }],
    }),
    getChartOfAccountRecentActivity: builder.query<RecentActivityItem[], { id: string; limit?: number }>({
      query: ({ id, limit = 10 }) => ({ url: `/accounting/chart-of-accounts/${id}/recent-activity`, params: { limit } }),
      providesTags: (_result, _error, { id }) => [{ type: 'ChartOfAccount', id }],
    }),
    getDeletedChartOfAccounts: builder.query<PaginatedResponse<ChartOfAccount>, Record<string, unknown> | undefined>({
      query: (params) => ({ url: '/accounting/chart-of-accounts/deleted', params: params ?? {} }),
      transformResponse: (response: any) => normalizeNamedCollection<ChartOfAccount>(response, 'accounts'),
      providesTags: ['DeletedChartOfAccount'],
    }),
    getJournalEntries: builder.query<PaginatedResponse<JournalEntry>, Record<string, unknown> | undefined>({
      query: (params) => ({ url: '/accounting/journal-entries', params: params ?? {} }),
      transformResponse: normalizePaginated<JournalEntry>,
      providesTags: ['JournalEntry'],
    }),
    getJournalEntry: builder.query<JournalEntry, string>({
      query: (id) => ({ url: `/accounting/journal-entries/${id}` }),
      transformResponse: normalizeSingle<JournalEntry>,
      providesTags: (_result, _error, id) => [{ type: 'JournalEntry', id }],
    }),
    getFiscalPeriods: builder.query<PaginatedResponse<FiscalPeriod>, Record<string, unknown> | undefined>({
      query: (params) => ({ url: '/accounting/fiscal-periods', params: params ?? {} }),
      transformResponse: normalizePaginated<FiscalPeriod>,
      providesTags: ['FiscalPeriod'],
    }),
    getCurrentFiscalPeriod: builder.query<FiscalPeriod, void>({
      query: () => ({ url: '/accounting/fiscal-periods/current' }),
      transformResponse: normalizeSingle<FiscalPeriod>,
      providesTags: ['FiscalPeriod'],
    }),
    getAccountMappings: builder.query<AccountMapping[], void>({
      query: () => ({ url: '/accounting/account-mappings', params: { limit: 100 } }),
      transformResponse: (response: any) => response?.data ?? [],
      providesTags: ['AccountMapping'],
    }),
    validateAccountMappings: builder.query<AccountMappingValidationResult, void>({
      query: () => ({ url: '/accounting/account-mappings/validate' }),
      providesTags: ['AccountMapping'],
    }),
    getBankReconciliations: builder.query<PaginatedResponse<BankReconciliation>, BankReconciliationsParams | undefined>({
      query: (params) => ({ url: '/accounting/bank-reconciliations', params: params ?? {} }),
      transformResponse: (response: any) => normalizeNamedCollection<BankReconciliation>(response, 'reconciliations'),
      providesTags: ['BankReconciliation'],
    }),
    getBankReconciliation: builder.query<BankReconciliation, string>({
      query: (id) => ({ url: `/accounting/bank-reconciliations/${id}` }),
      transformResponse: normalizeSingle<BankReconciliation>,
      providesTags: (_result, _error, id) => [{ type: 'BankReconciliation', id }],
    }),
    getDeletedBankReconciliations: builder.query<BankReconciliation[], void>({
      query: () => ({ url: '/accounting/bank-reconciliations/deleted' }),
      transformResponse: (response: any) => (Array.isArray(response) ? response : response?.data ?? []),
      providesTags: ['DeletedBankReconciliation'],
    }),
    getPaymentMethods: builder.query<PaginatedResponse<PaymentMethodConfig>, Record<string, unknown> | undefined>({
      query: (params) => ({ url: '/settings/payment-methods', params: params ?? {} }),
      transformResponse: normalizePaginated<PaymentMethodConfig>,
      providesTags: ['PaymentMethod'],
    }),
    getDeletedPaymentMethods: builder.query<PaymentMethodConfig[], void>({
      query: () => ({ url: '/settings/payment-methods/deleted' }),
      transformResponse: (response: any) => (Array.isArray(response) ? response : response?.data ?? []),
      providesTags: ['PaymentMethod'],
    }),
    getSettlements: builder.query<PaginatedResponse<Settlement>, Record<string, unknown> | undefined>({
      query: (params) => ({ url: '/accounting/settlements', params: params ?? {} }),
      transformResponse: normalizePaginated<Settlement>,
      providesTags: ['Settlement'],
    }),
    getSettlement: builder.query<Settlement, string>({
      query: (id) => ({ url: `/accounting/settlements/${id}` }),
      transformResponse: normalizeSingle<Settlement>,
      providesTags: (_result, _error, id) => [{ type: 'Settlement', id }],
    }),
    getPendingSettlementSummary: builder.query<PendingSettlementSummary[], void>({
      query: () => ({ url: '/accounting/settlements/pending-summary' }),
      transformResponse: (response: any) => (Array.isArray(response) ? response : response?.data ?? []),
      providesTags: ['Settlement'],
    }),
    getPendingSettlementPayments: builder.query<any[], string>({
      query: (paymentMethodId) => ({ url: `/accounting/settlements/pending-payments/${paymentMethodId}` }),
      transformResponse: (response: any) => (Array.isArray(response) ? response : response?.data ?? []),
      providesTags: ['Settlement'],
    }),
    getOwnerEquityTransactions: builder.query<PaginatedResponse<OwnerEquityTransaction>, Record<string, unknown> | undefined>({
      query: (params) => ({ url: '/accounting/owner-equity', params: params ?? {} }),
      transformResponse: normalizePaginated<OwnerEquityTransaction>,
      providesTags: ['OwnerEquity'],
    }),
    getExpenses: builder.query<PaginatedResponse<ExpenseRecord>, Record<string, unknown> | undefined>({
      query: (params) => ({ url: '/accounting/expenses', params: params ?? {} }),
      transformResponse: normalizePaginated<ExpenseRecord>,
      providesTags: ['Expense'],
    }),
    getExpense: builder.query<ExpenseRecord, string>({
      query: (id) => ({ url: `/accounting/expenses/${id}` }),
      transformResponse: normalizeSingle<ExpenseRecord>,
      providesTags: (_result, _error, id) => [{ type: 'Expense', id }],
    }),
    getFundTransfers: builder.query<PaginatedResponse<FundTransfer>, Record<string, unknown> | undefined>({
      query: (params) => ({ url: '/accounting/fund-transfers', params: params ?? {} }),
      transformResponse: normalizePaginated<FundTransfer>,
      providesTags: ['FundTransfer'],
    }),
    getFundTransfer: builder.query<FundTransfer, string>({
      query: (id) => ({ url: `/accounting/fund-transfers/${id}` }),
      transformResponse: normalizeSingle<FundTransfer>,
      providesTags: (_result, _error, id) => [{ type: 'FundTransfer', id }],
    }),
    getTrialBalance: builder.query<any, { asOfDate: string; includeInactive?: boolean }>({
      query: (params) => ({ url: '/accounting/reports/trial-balance', params }),
      providesTags: ['AccountingReport'],
    }),
    getBalanceSheet: builder.query<any, { asOfDate: string; includeInactive?: boolean }>({
      query: (params) => ({ url: '/accounting/reports/balance-sheet', params }),
      providesTags: ['AccountingReport'],
    }),
    getProfitAndLoss: builder.query<ProfitAndLossReport, { startDate: string; endDate: string; includeInactive?: boolean }>({
      query: (params) => ({ url: '/accounting/reports/profit-loss', params }),
      transformResponse: (response: any, _meta, params) => normalizeProfitAndLossReport(response, params),
      providesTags: ['AccountingReport'],
    }),
    getGeneralLedger: builder.query<GeneralLedgerReport, { accountId: string; startDate: string; endDate: string }>({
      query: (params) => ({ url: '/accounting/reports/general-ledger', params }),
      transformResponse: (response: any, _meta, params) => normalizeGeneralLedgerReport(response, params),
      providesTags: ['AccountingReport'],
    }),
    getAccountActivity: builder.query<AccountActivityReport, { accountId: string; startDate: string; endDate: string; status?: string }>({
      query: (params) => ({ url: '/accounting/reports/account-activity', params }),
      transformResponse: (response: any, _meta, params) => normalizeAccountActivityReport(response, params),
      providesTags: ['AccountingReport'],
    }),

    createChartOfAccount: builder.mutation<ChartOfAccount, Partial<ChartOfAccount>>({
      query: (body) => ({ url: '/accounting/chart-of-accounts', method: 'POST', data: body }),
      transformResponse: normalizeSingle<ChartOfAccount>,
      invalidatesTags: ['ChartOfAccount', 'DeletedChartOfAccount', 'AccountMapping', 'AccountingReport'],
    }),
    updateChartOfAccount: builder.mutation<ChartOfAccount, { id: string; data: Partial<ChartOfAccount> }>({
      query: ({ id, data }) => ({ url: `/accounting/chart-of-accounts/${id}`, method: 'PATCH', data }),
      transformResponse: normalizeSingle<ChartOfAccount>,
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'ChartOfAccount', id },
        'ChartOfAccount',
        'AccountMapping',
        'AccountingReport',
      ],
    }),
    deleteChartOfAccount: builder.mutation<void, string>({
      query: (id) => ({ url: `/accounting/chart-of-accounts/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, id) => [
        { type: 'ChartOfAccount', id },
        'ChartOfAccount',
        'DeletedChartOfAccount',
        'AccountMapping',
        'AccountingReport',
      ],
    }),
    restoreChartOfAccount: builder.mutation<ChartOfAccount, string>({
      query: (id) => ({ url: `/accounting/chart-of-accounts/${id}/restore`, method: 'POST' }),
      transformResponse: normalizeSingle<ChartOfAccount>,
      invalidatesTags: (_result, _error, id) => [
        { type: 'ChartOfAccount', id },
        'ChartOfAccount',
        'DeletedChartOfAccount',
        'AccountMapping',
        'AccountingReport',
      ],
    }),
    bulkRestoreChartOfAccounts: builder.mutation<{ restoredCount: number; failedIds: string[] }, string[]>({
      query: (accountIds) => ({
        url: '/accounting/chart-of-accounts/bulk-restore',
        method: 'POST',
        data: { accountIds },
      }),
      invalidatesTags: ['ChartOfAccount', 'DeletedChartOfAccount', 'AccountMapping', 'AccountingReport'],
    }),
    permanentDeleteChartOfAccount: builder.mutation<void, string>({
      query: (id) => ({ url: `/accounting/chart-of-accounts/${id}/permanent`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, id) => [
        { type: 'ChartOfAccount', id },
        'DeletedChartOfAccount',
        'AccountMapping',
        'AccountingReport',
      ],
    }),
    bulkPermanentDeleteChartOfAccounts: builder.mutation<{ deletedCount: number; failedIds: string[] }, string[]>({
      query: (accountIds) => ({
        url: '/accounting/chart-of-accounts/bulk-permanent',
        method: 'DELETE',
        data: { accountIds },
      }),
      invalidatesTags: ['DeletedChartOfAccount', 'AccountMapping', 'AccountingReport'],
    }),
    seedDefaultChartOfAccounts: builder.mutation<{ data: ChartOfAccount[]; message: string }, void>({
      query: () => ({ url: '/accounting/chart-of-accounts/seed-defaults', method: 'POST' }),
      invalidatesTags: ['ChartOfAccount', 'DeletedChartOfAccount', 'AccountMapping', 'AccountingReport'],
    }),
    createJournalEntry: builder.mutation<JournalEntry, Partial<JournalEntry>>({
      query: (body) => ({ url: '/accounting/journal-entries', method: 'POST', data: body }),
      transformResponse: normalizeSingle<JournalEntry>,
      invalidatesTags: ['JournalEntry', 'AccountingReport'],
    }),
    updateJournalEntry: builder.mutation<JournalEntry, { id: string; data: Partial<JournalEntry> }>({
      query: ({ id, data }) => ({ url: `/accounting/journal-entries/${id}`, method: 'PATCH', data }),
      transformResponse: normalizeSingle<JournalEntry>,
      invalidatesTags: (_result, _error, { id }) => [{ type: 'JournalEntry', id }, 'JournalEntry', 'AccountingReport'],
    }),
    deleteJournalEntry: builder.mutation<void, string>({
      query: (id) => ({ url: `/accounting/journal-entries/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, id) => [{ type: 'JournalEntry', id }, 'JournalEntry', 'AccountingReport'],
    }),
    postJournalEntry: builder.mutation<JournalEntry, string>({
      query: (id) => ({ url: `/accounting/journal-entries/${id}/post`, method: 'POST' }),
      transformResponse: normalizeSingle<JournalEntry>,
      invalidatesTags: (_result, _error, id) => [{ type: 'JournalEntry', id }, 'JournalEntry', 'AccountingReport'],
    }),
    reverseJournalEntry: builder.mutation<JournalEntry, { id: string; reverseDate?: string }>({
      query: ({ id, reverseDate }) => ({
        url: `/accounting/journal-entries/${id}/reverse`,
        method: 'POST',
        data: { reverseDate },
      }),
      transformResponse: normalizeSingle<JournalEntry>,
      invalidatesTags: (_result, _error, { id }) => [{ type: 'JournalEntry', id }, 'JournalEntry', 'AccountingReport'],
    }),
    bulkPostJournalEntries: builder.mutation<{ succeeded: string[]; failed: Array<{ id: string; error: string }> }, string[]>({
      query: (ids) => ({ url: '/accounting/journal-entries/bulk-post', method: 'POST', data: { ids } }),
      invalidatesTags: ['JournalEntry', 'AccountingReport'],
    }),
    bulkDeleteJournalEntries: builder.mutation<{ succeeded: string[]; failed: Array<{ id: string; error: string }> }, string[]>({
      query: (ids) => ({ url: '/accounting/journal-entries/bulk-delete', method: 'POST', data: { ids } }),
      invalidatesTags: ['JournalEntry', 'AccountingReport'],
    }),
    createFiscalPeriod: builder.mutation<FiscalPeriod, Partial<FiscalPeriod>>({
      query: (body) => ({ url: '/accounting/fiscal-periods', method: 'POST', data: body }),
      transformResponse: normalizeSingle<FiscalPeriod>,
      invalidatesTags: ['FiscalPeriod', 'AccountingReport'],
    }),
    updateFiscalPeriod: builder.mutation<FiscalPeriod, { id: string; data: Partial<FiscalPeriod> }>({
      query: ({ id, data }) => ({ url: `/accounting/fiscal-periods/${id}`, method: 'PATCH', data }),
      transformResponse: normalizeSingle<FiscalPeriod>,
      invalidatesTags: (_result, _error, { id }) => [{ type: 'FiscalPeriod', id }, 'FiscalPeriod', 'AccountingReport'],
    }),
    deleteFiscalPeriod: builder.mutation<void, string>({
      query: (id) => ({ url: `/accounting/fiscal-periods/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, id) => [{ type: 'FiscalPeriod', id }, 'FiscalPeriod', 'AccountingReport'],
    }),
    closeFiscalPeriod: builder.mutation<FiscalPeriod, string>({
      query: (id) => ({ url: `/accounting/fiscal-periods/${id}/close`, method: 'POST' }),
      transformResponse: normalizeSingle<FiscalPeriod>,
      invalidatesTags: (_result, _error, id) => [{ type: 'FiscalPeriod', id }, 'FiscalPeriod', 'AccountingReport'],
    }),
    reopenFiscalPeriod: builder.mutation<FiscalPeriod, string>({
      query: (id) => ({ url: `/accounting/fiscal-periods/${id}/reopen`, method: 'POST' }),
      transformResponse: normalizeSingle<FiscalPeriod>,
      invalidatesTags: (_result, _error, id) => [{ type: 'FiscalPeriod', id }, 'FiscalPeriod', 'AccountingReport'],
    }),
    generateFiscalPeriods: builder.mutation<{ data: FiscalPeriod[]; message: string }, { year: number; startMonth?: number }>({
      query: ({ year, startMonth }) => ({
        url: '/accounting/fiscal-periods/generate',
        method: 'POST',
        data: { year, startMonth: startMonth ?? 1 },
      }),
      invalidatesTags: ['FiscalPeriod', 'AccountingReport'],
    }),
    validateFiscalPeriodDate: builder.mutation<{ isValid: boolean; message: string; period?: FiscalPeriod }, { date: string }>({
      query: (body) => ({ url: '/accounting/fiscal-periods/validate', method: 'POST', data: body }),
    }),

    createAccountMapping: builder.mutation<AccountMapping, CreateAccountMappingDto>({
      query: (body) => ({ url: '/accounting/account-mappings', method: 'POST', data: body }),
      transformResponse: normalizeSingle<AccountMapping>,
      invalidatesTags: ['AccountMapping'],
    }),
    updateAccountMapping: builder.mutation<AccountMapping, { id: string; data: UpdateAccountMappingDto }>({
      query: ({ id, data }) => ({ url: `/accounting/account-mappings/${id}`, method: 'PATCH', data }),
      transformResponse: normalizeSingle<AccountMapping>,
      invalidatesTags: ['AccountMapping'],
    }),
    deleteAccountMapping: builder.mutation<void, string>({
      query: (id) => ({ url: `/accounting/account-mappings/${id}`, method: 'DELETE' }),
      invalidatesTags: ['AccountMapping'],
    }),
    createBankReconciliation: builder.mutation<
      BankReconciliation,
      { accountId: string; fiscalPeriodId: string; reconciliationDate: string; statementBalance: number }
    >({
      query: (body) => ({ url: '/accounting/bank-reconciliations', method: 'POST', data: body }),
      transformResponse: normalizeSingle<BankReconciliation>,
      invalidatesTags: ['BankReconciliation', 'AccountingReport'],
    }),
    updateBankReconciliation: builder.mutation<
      BankReconciliation,
      {
        id: string;
        data: {
          accountId?: string;
          fiscalPeriodId?: string;
          reconciliationDate?: string;
          statementBalance?: number;
        };
      }
    >({
      query: ({ id, data }) => ({ url: `/accounting/bank-reconciliations/${id}`, method: 'PATCH', data }),
      transformResponse: normalizeSingle<BankReconciliation>,
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'BankReconciliation', id },
        'BankReconciliation',
        'AccountingReport',
      ],
    }),
    deleteBankReconciliation: builder.mutation<void, string>({
      query: (id) => ({ url: `/accounting/bank-reconciliations/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, id) => [{ type: 'BankReconciliation', id }, 'BankReconciliation', 'AccountingReport'],
    }),
    markBankReconciliationCleared: builder.mutation<BankReconciliation, { id: string; journalEntryLineIds: string[] }>({
      query: ({ id, journalEntryLineIds }) => ({
        url: `/accounting/bank-reconciliations/${id}/mark-cleared`,
        method: 'POST',
        data: { journalEntryLineIds },
      }),
      transformResponse: normalizeSingle<BankReconciliation>,
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'BankReconciliation', id },
        'BankReconciliation',
        'AccountingReport',
      ],
    }),
    unmarkBankReconciliationCleared: builder.mutation<BankReconciliation, { id: string; journalEntryLineIds: string[] }>({
      query: ({ id, journalEntryLineIds }) => ({
        url: `/accounting/bank-reconciliations/${id}/unmark-cleared`,
        method: 'POST',
        data: { journalEntryLineIds },
      }),
      transformResponse: normalizeSingle<BankReconciliation>,
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'BankReconciliation', id },
        'BankReconciliation',
        'AccountingReport',
      ],
    }),
    completeBankReconciliation: builder.mutation<BankReconciliation, string>({
      query: (id) => ({ url: `/accounting/bank-reconciliations/${id}/complete`, method: 'POST' }),
      transformResponse: normalizeSingle<BankReconciliation>,
      invalidatesTags: (_result, _error, id) => [{ type: 'BankReconciliation', id }, 'BankReconciliation', 'AccountingReport'],
    }),
    reopenBankReconciliation: builder.mutation<BankReconciliation, string>({
      query: (id) => ({ url: `/accounting/bank-reconciliations/${id}/reopen`, method: 'POST' }),
      transformResponse: normalizeSingle<BankReconciliation>,
      invalidatesTags: (_result, _error, id) => [{ type: 'BankReconciliation', id }, 'BankReconciliation', 'AccountingReport'],
    }),
    restoreBankReconciliation: builder.mutation<BankReconciliation, string>({
      query: (id) => ({ url: `/accounting/bank-reconciliations/${id}/restore`, method: 'POST' }),
      transformResponse: normalizeSingle<BankReconciliation>,
      invalidatesTags: (_result, _error, id) => [
        { type: 'BankReconciliation', id },
        'BankReconciliation',
        'DeletedBankReconciliation',
      ],
    }),
    permanentDeleteBankReconciliation: builder.mutation<void, string>({
      query: (id) => ({ url: `/accounting/bank-reconciliations/${id}/permanent`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, id) => [
        { type: 'BankReconciliation', id },
        'DeletedBankReconciliation',
      ],
    }),
    bulkRestoreBankReconciliations: builder.mutation<{ restoredCount: number; failedIds: string[] }, string[]>({
      query: (ids) => ({
        url: '/accounting/bank-reconciliations/bulk-restore',
        method: 'POST',
        data: { ids },
      }),
      invalidatesTags: ['BankReconciliation', 'DeletedBankReconciliation'],
    }),
    bulkPermanentDeleteBankReconciliations: builder.mutation<{ deletedCount: number; failedIds: string[] }, string[]>({
      query: (ids) => ({
        url: '/accounting/bank-reconciliations/bulk-permanent',
        method: 'DELETE',
        data: { ids },
      }),
      invalidatesTags: ['DeletedBankReconciliation'],
    }),
    createPaymentMethod: builder.mutation<PaymentMethodConfig, Partial<PaymentMethodConfig>>({
      query: (body) => ({ url: '/settings/payment-methods', method: 'POST', data: body }),
      transformResponse: normalizeSingle<PaymentMethodConfig>,
      invalidatesTags: ['PaymentMethod'],
    }),
    updatePaymentMethod: builder.mutation<PaymentMethodConfig, { id: string; data: Partial<PaymentMethodConfig> }>({
      query: ({ id, data }) => ({ url: `/settings/payment-methods/${id}`, method: 'PATCH', data }),
      transformResponse: normalizeSingle<PaymentMethodConfig>,
      invalidatesTags: (_result, _error, { id }) => [{ type: 'PaymentMethod', id }, 'PaymentMethod'],
    }),
    deletePaymentMethod: builder.mutation<void, string>({
      query: (id) => ({ url: `/settings/payment-methods/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, id) => [{ type: 'PaymentMethod', id }, 'PaymentMethod'],
    }),
    restorePaymentMethod: builder.mutation<void, string>({
      query: (id) => ({ url: `/settings/payment-methods/${id}/restore`, method: 'POST' }),
      invalidatesTags: (_result, _error, id) => [{ type: 'PaymentMethod', id }, 'PaymentMethod'],
    }),
    permanentDeletePaymentMethod: builder.mutation<void, string>({
      query: (id) => ({ url: `/settings/payment-methods/${id}/permanent`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, id) => [{ type: 'PaymentMethod', id }, 'PaymentMethod'],
    }),
    createSettlement: builder.mutation<
      Settlement,
      { paymentMethodId: string; settlementDate: string; paymentIds: string[]; reference?: string; notes?: string }
    >({
      query: (body) => ({ url: '/accounting/settlements', method: 'POST', data: body }),
      transformResponse: normalizeSingle<Settlement>,
      invalidatesTags: ['Settlement'],
    }),
    updateSettlement: builder.mutation<
      Settlement,
      { id: string; settlementDate?: string; reference?: string; notes?: string }
    >({
      query: ({ id, ...body }) => ({ url: `/accounting/settlements/${id}`, method: 'PATCH', data: body }),
      transformResponse: normalizeSingle<Settlement>,
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Settlement', id }, 'Settlement'],
    }),
    postSettlement: builder.mutation<Settlement, string>({
      query: (id) => ({ url: `/accounting/settlements/${id}/post`, method: 'POST' }),
      transformResponse: normalizeSingle<Settlement>,
      invalidatesTags: (_result, _error, id) => [{ type: 'Settlement', id }, 'Settlement', 'JournalEntry', 'AccountingReport'],
    }),
    reverseSettlement: builder.mutation<Settlement, string>({
      query: (id) => ({ url: `/accounting/settlements/${id}/reverse`, method: 'POST' }),
      transformResponse: normalizeSingle<Settlement>,
      invalidatesTags: (_result, _error, id) => [{ type: 'Settlement', id }, 'Settlement', 'JournalEntry', 'AccountingReport'],
    }),
    deleteSettlement: builder.mutation<void, string>({
      query: (id) => ({ url: `/accounting/settlements/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Settlement'],
    }),
    restoreSettlement: builder.mutation<Settlement, string>({
      query: (id) => ({ url: `/accounting/settlements/${id}/restore`, method: 'POST' }),
      transformResponse: normalizeSingle<Settlement>,
      invalidatesTags: ['Settlement'],
    }),
    permanentDeleteSettlement: builder.mutation<void, string>({
      query: (id) => ({ url: `/accounting/settlements/${id}/permanent`, method: 'DELETE' }),
      invalidatesTags: ['Settlement'],
    }),
    getDeletedSettlements: builder.query<Settlement[], void>({
      query: () => ({ url: '/accounting/settlements/deleted' }),
      transformResponse: (response: any) => (Array.isArray(response) ? response : response?.data ?? []),
      providesTags: ['Settlement'],
    }),
    createOwnerEquityTransaction: builder.mutation<
      OwnerEquityTransaction,
      { transactionDate: string; type: string; amount: number; paymentMethodId: string; description?: string }
    >({
      query: (body) => ({ url: '/accounting/owner-equity', method: 'POST', data: body }),
      transformResponse: normalizeSingle<OwnerEquityTransaction>,
      invalidatesTags: ['OwnerEquity', 'AccountingReport'],
    }),
    updateOwnerEquityTransaction: builder.mutation<
      OwnerEquityTransaction,
      {
        id: string
        data: {
          transactionDate?: string
          type?: string
          amount?: number
          paymentMethodId?: string
          description?: string
        }
      }
    >({
      query: ({ id, data }) => ({ url: `/accounting/owner-equity/${id}`, method: 'PATCH', data }),
      transformResponse: normalizeSingle<OwnerEquityTransaction>,
      invalidatesTags: (_result, _error, { id }) => [{ type: 'OwnerEquity', id }, 'OwnerEquity', 'AccountingReport'],
    }),
    deleteOwnerEquityTransaction: builder.mutation<void, string>({
      query: (id) => ({ url: `/accounting/owner-equity/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, id) => [{ type: 'OwnerEquity', id }, 'OwnerEquity', 'AccountingReport'],
    }),
    postOwnerEquityTransaction: builder.mutation<OwnerEquityTransaction, string>({
      query: (id) => ({ url: `/accounting/owner-equity/${id}/post`, method: 'POST' }),
      transformResponse: normalizeSingle<OwnerEquityTransaction>,
      invalidatesTags: (_result, _error, id) => [{ type: 'OwnerEquity', id }, 'OwnerEquity', 'JournalEntry', 'AccountingReport'],
    }),
    reverseOwnerEquityTransaction: builder.mutation<OwnerEquityTransaction, string>({
      query: (id) => ({ url: `/accounting/owner-equity/${id}/reverse`, method: 'POST' }),
      transformResponse: normalizeSingle<OwnerEquityTransaction>,
      invalidatesTags: (_result, _error, id) => [{ type: 'OwnerEquity', id }, 'OwnerEquity', 'JournalEntry', 'AccountingReport'],
    }),
    createExpense: builder.mutation<
      ExpenseRecord,
      {
        expenseDate: string
        expenseAccountId: string
        amount: number
        paymentMethodId: string
        description?: string
        vendor?: string
      }
    >({
      query: (body) => ({ url: '/accounting/expenses', method: 'POST', data: body }),
      transformResponse: normalizeSingle<ExpenseRecord>,
      invalidatesTags: ['Expense', 'AccountingReport'],
    }),
    updateExpense: builder.mutation<
      ExpenseRecord,
      {
        id: string
        data: {
          expenseDate?: string
          expenseAccountId?: string
          amount?: number
          paymentMethodId?: string
          description?: string
          vendor?: string
        }
      }
    >({
      query: ({ id, data }) => ({ url: `/accounting/expenses/${id}`, method: 'PATCH', data }),
      transformResponse: normalizeSingle<ExpenseRecord>,
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Expense', id }, 'Expense', 'AccountingReport'],
    }),
    deleteExpense: builder.mutation<void, string>({
      query: (id) => ({ url: `/accounting/expenses/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, id) => [{ type: 'Expense', id }, 'Expense', 'AccountingReport'],
    }),
    postExpense: builder.mutation<ExpenseRecord, string>({
      query: (id) => ({ url: `/accounting/expenses/${id}/post`, method: 'POST' }),
      transformResponse: normalizeSingle<ExpenseRecord>,
      invalidatesTags: (_result, _error, id) => [{ type: 'Expense', id }, 'Expense', 'JournalEntry', 'AccountingReport'],
    }),
    bulkPostExpenses: builder.mutation<{ posted: number; failed: number }, string[]>({
      query: (ids) => ({ url: '/accounting/expenses/bulk-post', method: 'POST', data: { ids } }),
      invalidatesTags: ['Expense', 'JournalEntry', 'AccountingReport'],
    }),
    bulkDeleteExpenses: builder.mutation<{ deleted: number; failed: number }, string[]>({
      query: (ids) => ({ url: '/accounting/expenses/bulk-delete', method: 'POST', data: { ids } }),
      invalidatesTags: ['Expense', 'AccountingReport'],
    }),
    restoreExpense: builder.mutation<ExpenseRecord, string>({
      query: (id) => ({ url: `/accounting/expenses/${id}/restore`, method: 'POST' }),
      transformResponse: normalizeSingle<ExpenseRecord>,
      invalidatesTags: (_result, _error, id) => [{ type: 'Expense', id }, 'Expense'],
    }),
    unpostExpense: builder.mutation<ExpenseRecord, string>({
      query: (id) => ({ url: `/accounting/expenses/${id}/unpost`, method: 'POST' }),
      transformResponse: normalizeSingle<ExpenseRecord>,
      invalidatesTags: (_result, _error, id) => [
        { type: 'Expense', id },
        'Expense',
        'JournalEntry',
        'AccountingReport',
      ],
    }),
    getDeletedExpenses: builder.query<ExpenseRecord[], void>({
      query: () => ({ url: '/accounting/expenses/deleted' }),
      transformResponse: (response: any) => (Array.isArray(response) ? response : response?.data ?? []),
      providesTags: ['Expense'],
    }),
    permanentDeleteExpense: builder.mutation<void, string>({
      query: (id) => ({ url: `/accounting/expenses/${id}/permanent`, method: 'DELETE' }),
      invalidatesTags: ['Expense'],
    }),
    bulkPermanentDeleteExpenses: builder.mutation<{ deleted: number; failed: number }, string[]>({
      query: (ids) => ({ url: '/accounting/expenses/bulk-permanent', method: 'DELETE', data: { ids } }),
      invalidatesTags: ['Expense'],
    }),
    bulkRestoreExpenses: builder.mutation<{ restored: number; failed: number }, string[]>({
      query: (ids) => ({ url: '/accounting/expenses/bulk-restore', method: 'POST', data: { ids } }),
      invalidatesTags: ['Expense'],
    }),
    createFundTransfer: builder.mutation<FundTransfer, CreateFundTransferPayload>({
      query: (body) => ({ url: '/accounting/fund-transfers', method: 'POST', data: body }),
      transformResponse: normalizeSingle<FundTransfer>,
      invalidatesTags: ['FundTransfer', 'JournalEntry', 'AccountingReport'],
    }),
    updateFundTransfer: builder.mutation<FundTransfer, UpdateFundTransferPayload>({
      query: ({ id, ...body }) => ({ url: `/accounting/fund-transfers/${id}`, method: 'PATCH', data: body }),
      transformResponse: normalizeSingle<FundTransfer>,
      invalidatesTags: (_result, _error, { id }) => [{ type: 'FundTransfer', id }, 'FundTransfer'],
    }),
    deleteFundTransfer: builder.mutation<void, string>({
      query: (id) => ({ url: `/accounting/fund-transfers/${id}`, method: 'DELETE' }),
      invalidatesTags: (_result, _error, id) => [{ type: 'FundTransfer', id }, 'FundTransfer'],
    }),
    postFundTransfer: builder.mutation<FundTransfer, string>({
      query: (id) => ({ url: `/accounting/fund-transfers/${id}/post`, method: 'POST' }),
      transformResponse: normalizeSingle<FundTransfer>,
      invalidatesTags: (_result, _error, id) => [
        { type: 'FundTransfer', id },
        'FundTransfer',
        'JournalEntry',
        'AccountingReport',
      ],
    }),
    unpostFundTransfer: builder.mutation<FundTransfer, string>({
      query: (id) => ({ url: `/accounting/fund-transfers/${id}/unpost`, method: 'POST' }),
      transformResponse: normalizeSingle<FundTransfer>,
      invalidatesTags: (_result, _error, id) => [
        { type: 'FundTransfer', id },
        'FundTransfer',
        'JournalEntry',
        'AccountingReport',
      ],
    }),
    getDeletedFundTransfers: builder.query<FundTransfer[], void>({
      query: () => ({ url: '/accounting/fund-transfers/deleted', method: 'GET' }),
      transformResponse: (response: any) => (Array.isArray(response) ? response : response?.data ?? []),
      providesTags: ['FundTransfer'],
    }),
    restoreFundTransfer: builder.mutation<FundTransfer, string>({
      query: (id) => ({ url: `/accounting/fund-transfers/${id}/restore`, method: 'POST' }),
      transformResponse: normalizeSingle<FundTransfer>,
      invalidatesTags: (_result, _error, id) => [{ type: 'FundTransfer', id }, 'FundTransfer'],
    }),
    permanentDeleteFundTransfer: builder.mutation<void, string>({
      query: (id) => ({ url: `/accounting/fund-transfers/${id}/permanent`, method: 'DELETE' }),
      invalidatesTags: ['FundTransfer'],
    }),
  }),
})

export const {
  useGetChartOfAccountsQuery,
  useGetChartOfAccountsHierarchyQuery,
  useGetChartOfAccountQuery,
  useGetChartOfAccountRecentActivityQuery,
  useLazyGetChartOfAccountQuery,
  useGetDeletedChartOfAccountsQuery,
  useGetJournalEntriesQuery,
  useLazyGetJournalEntriesQuery,
  useGetJournalEntryQuery,
  useLazyGetJournalEntryQuery,
  useGetFiscalPeriodsQuery,
  useGetCurrentFiscalPeriodQuery,
  useGetAccountMappingsQuery,
  useValidateAccountMappingsQuery,
  useGetBankReconciliationsQuery,
  useGetBankReconciliationQuery,
  useLazyGetBankReconciliationQuery,
  useGetDeletedBankReconciliationsQuery,
  useGetPaymentMethodsQuery,
  useGetDeletedPaymentMethodsQuery,
  useGetSettlementsQuery,
  useGetSettlementQuery,
  useLazyGetSettlementQuery,
  useGetPendingSettlementSummaryQuery,
  useGetPendingSettlementPaymentsQuery,
  useGetOwnerEquityTransactionsQuery,
  useGetExpensesQuery,
  useLazyGetExpenseQuery,
  useGetFundTransfersQuery,
  useGetFundTransferQuery,
  useLazyGetFundTransferQuery,
  useGetTrialBalanceQuery,
  useGetBalanceSheetQuery,
  useGetProfitAndLossQuery,
  useGetGeneralLedgerQuery,
  useGetAccountActivityQuery,
  useCreateChartOfAccountMutation,
  useUpdateChartOfAccountMutation,
  useDeleteChartOfAccountMutation,
  useRestoreChartOfAccountMutation,
  useBulkRestoreChartOfAccountsMutation,
  usePermanentDeleteChartOfAccountMutation,
  useBulkPermanentDeleteChartOfAccountsMutation,
  useSeedDefaultChartOfAccountsMutation,
  useCreateJournalEntryMutation,
  useUpdateJournalEntryMutation,
  useDeleteJournalEntryMutation,
  usePostJournalEntryMutation,
  useReverseJournalEntryMutation,
  useBulkPostJournalEntriesMutation,
  useBulkDeleteJournalEntriesMutation,
  useCreateFiscalPeriodMutation,
  useUpdateFiscalPeriodMutation,
  useDeleteFiscalPeriodMutation,
  useCloseFiscalPeriodMutation,
  useReopenFiscalPeriodMutation,
  useGenerateFiscalPeriodsMutation,
  useValidateFiscalPeriodDateMutation,
  useCreateAccountMappingMutation,
  useUpdateAccountMappingMutation,
  useDeleteAccountMappingMutation,
  useCreateBankReconciliationMutation,
  useUpdateBankReconciliationMutation,
  useDeleteBankReconciliationMutation,
  useMarkBankReconciliationClearedMutation,
  useUnmarkBankReconciliationClearedMutation,
  useCompleteBankReconciliationMutation,
  useReopenBankReconciliationMutation,
  useRestoreBankReconciliationMutation,
  usePermanentDeleteBankReconciliationMutation,
  useBulkRestoreBankReconciliationsMutation,
  useBulkPermanentDeleteBankReconciliationsMutation,
  useCreatePaymentMethodMutation,
  useUpdatePaymentMethodMutation,
  useDeletePaymentMethodMutation,
  useRestorePaymentMethodMutation,
  usePermanentDeletePaymentMethodMutation,
  useCreateSettlementMutation,
  useUpdateSettlementMutation,
  usePostSettlementMutation,
  useReverseSettlementMutation,
  useDeleteSettlementMutation,
  useRestoreSettlementMutation,
  usePermanentDeleteSettlementMutation,
  useGetDeletedSettlementsQuery,
  useCreateOwnerEquityTransactionMutation,
  useUpdateOwnerEquityTransactionMutation,
  useDeleteOwnerEquityTransactionMutation,
  usePostOwnerEquityTransactionMutation,
  useReverseOwnerEquityTransactionMutation,
  useCreateExpenseMutation,
  useUpdateExpenseMutation,
  useDeleteExpenseMutation,
  usePostExpenseMutation,
  useBulkPostExpensesMutation,
  useBulkDeleteExpensesMutation,
  useRestoreExpenseMutation,
  useUnpostExpenseMutation,
  useGetDeletedExpensesQuery,
  usePermanentDeleteExpenseMutation,
  useBulkPermanentDeleteExpensesMutation,
  useBulkRestoreExpensesMutation,
  useCreateFundTransferMutation,
  useUpdateFundTransferMutation,
  useDeleteFundTransferMutation,
  usePostFundTransferMutation,
  useUnpostFundTransferMutation,
  useGetDeletedFundTransfersQuery,
  useRestoreFundTransferMutation,
  usePermanentDeleteFundTransferMutation,
} = accountingApiSlice
