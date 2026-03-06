import { createApi } from '@reduxjs/toolkit/query/react'

import type {
  BankReconciliation,
  ChartOfAccount,
  ExpenseRecord,
  FiscalPeriod,
  JournalEntry,
  OwnerEquityTransaction,
  PaginatedResponse,
  PaymentMethodConfig,
  PendingSettlementSummary,
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

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeNamedCollection<T>(
  response: any,
  key: 'data' | 'accounts' | 'entries' | 'periods' | 'mappings' | 'reconciliations',
): PaginatedResponse<T> {
  if (!response) {
    return { data: [], meta: { page: 1, limit: 20, total: 0, totalPages: 0 } }
  }

  if (Array.isArray(response)) {
    return {
      data: response,
      meta: { page: 1, limit: response.length, total: response.length, totalPages: 1 },
    }
  }

  const data = response[key] ?? response.data ?? []

  return {
    data: Array.isArray(data) ? data : [],
    meta: response.meta ?? {
      page: response.page ?? 1,
      limit: response.limit ?? 20,
      total: response.total ?? (Array.isArray(data) ? data.length : 0),
      totalPages:
        response.totalPages ??
        Math.ceil((response.total ?? (Array.isArray(data) ? data.length : 0)) / (response.limit ?? 20)),
    },
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
    'PaymentMethod',
    'Settlement',
    'OwnerEquity',
    'Expense',
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
    getBankReconciliations: builder.query<PaginatedResponse<BankReconciliation>, Record<string, unknown> | undefined>({
      query: (params) => ({ url: '/accounting/bank-reconciliations', params: params ?? {} }),
      transformResponse: (response: any) => normalizeNamedCollection<BankReconciliation>(response, 'reconciliations'),
      providesTags: ['BankReconciliation'],
    }),
    getPaymentMethods: builder.query<PaginatedResponse<PaymentMethodConfig>, Record<string, unknown> | undefined>({
      query: (params) => ({ url: '/settings/payment-methods', params: params ?? {} }),
      transformResponse: normalizePaginated<PaymentMethodConfig>,
      providesTags: ['PaymentMethod'],
    }),
    getSettlements: builder.query<PaginatedResponse<Settlement>, Record<string, unknown> | undefined>({
      query: (params) => ({ url: '/accounting/settlements', params: params ?? {} }),
      transformResponse: normalizePaginated<Settlement>,
      providesTags: ['Settlement'],
    }),
    getPendingSettlementSummary: builder.query<PendingSettlementSummary[], void>({
      query: () => ({ url: '/accounting/settlements/pending-summary' }),
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
  }),
})

export const {
  useGetChartOfAccountsQuery,
  useGetChartOfAccountsHierarchyQuery,
  useGetDeletedChartOfAccountsQuery,
  useGetJournalEntriesQuery,
  useGetFiscalPeriodsQuery,
  useGetCurrentFiscalPeriodQuery,
  useGetAccountMappingsQuery,
  useValidateAccountMappingsQuery,
  useGetBankReconciliationsQuery,
  useGetPaymentMethodsQuery,
  useGetSettlementsQuery,
  useGetPendingSettlementSummaryQuery,
  useGetOwnerEquityTransactionsQuery,
  useGetExpensesQuery,
  useGetTrialBalanceQuery,
  useGetBalanceSheetQuery,
  useGetProfitAndLossQuery,
  useGetGeneralLedgerQuery,
  useGetAccountActivityQuery,
  useCreateAccountMappingMutation,
  useUpdateAccountMappingMutation,
} = accountingApiSlice
