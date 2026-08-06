import { createApi } from '@reduxjs/toolkit/query/react'

import type {
  Account,
  AccountTreeNode,
  AccountType,
  AccountingSourceType,
  AccountingSettings,
  Expense,
  JournalEntry,
  JournalEntryDetail,
  JournalEntryStatus,
  GeneralLedgerResponse,
  TrialBalanceResponse,
  PaginatedResponse,
} from '@/types'

import { axiosBaseQuery } from './baseQuery'
import { normalizePaginated, normalizeSingle } from './normalizers'

export interface JournalEntryListParams {
  page?: number
  limit?: number
  search?: string
  sourceType?: AccountingSourceType
  status?: JournalEntryStatus
  fromDate?: string
  toDate?: string
  sortBy?: 'journalNo'
  sortOrder?: 'ASC' | 'DESC'
}

export interface AccountTreeParams {
  search?: string
  type?: AccountType
  isActive?: boolean
}

export interface ExpenseListParams {
  page?: number
  limit?: number
  search?: string
  fromDate?: string
  toDate?: string
  expenseAccountId?: string
  documentStatus?: 'DRAFT' | 'COMPLETED' | 'CANCELLED'
  paymentStatus?: 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERPAID'
  sortBy?: 'expenseNumber' | 'expenseDate' | 'totalAmount'
  sortOrder?: 'ASC' | 'DESC'
}

export const accountingApiSlice = createApi({
  reducerPath: 'accountingApi',
  baseQuery: axiosBaseQuery(),
  tagTypes: ['Account', 'AccountingSettings', 'Expense', 'JournalEntry', 'TrialBalance'],
  endpoints: (builder) => ({
    getAccountTree: builder.query<AccountTreeNode[], AccountTreeParams>({
      query: ({ search, type, isActive }) => {
        const params: Record<string, string> = {}
        if (search) params.search = search
        if (type) params.type = type
        if (isActive !== undefined) params.isActive = String(isActive)
        return {
          url: '/accounting/accounts/tree',
          params: Object.keys(params).length ? params : undefined,
        }
      },
      transformResponse: (response: any) => response as AccountTreeNode[],
      providesTags: ['Account'],
    }),
    getAccounts: builder.query<PaginatedResponse<Account>, Record<string, unknown> | undefined>({
      query: (params) => ({ url: '/accounting/accounts', params: params ?? {} }),
      transformResponse: normalizePaginated<Account>,
      providesTags: ['Account'],
    }),
    createAccount: builder.mutation<Account, Partial<Account>>({
      query: (body) => ({ url: '/accounting/accounts', method: 'POST', data: body }),
      transformResponse: normalizeSingle<Account>,
      invalidatesTags: ['Account', 'JournalEntry', 'TrialBalance'],
    }),
    updateAccount: builder.mutation<Account, { id: string; data: Partial<Account> }>({
      query: ({ id, data }) => ({ url: `/accounting/accounts/${id}`, method: 'PATCH', data }),
      transformResponse: normalizeSingle<Account>,
      invalidatesTags: ['Account'],
    }),
    getAccountingSettings: builder.query<AccountingSettings, void>({
      query: () => ({ url: '/accounting/settings' }),
      transformResponse: normalizeSingle<AccountingSettings>,
      providesTags: ['AccountingSettings'],
    }),
    updateAccountingSettings: builder.mutation<AccountingSettings, Partial<AccountingSettings>>({
      query: (body) => ({ url: '/accounting/settings', method: 'PUT', data: body }),
      transformResponse: normalizeSingle<AccountingSettings>,
      invalidatesTags: ['AccountingSettings'],
    }),
    getJournalEntries: builder.query<
      PaginatedResponse<JournalEntry>,
      JournalEntryListParams | undefined
    >({
      query: (params) => ({ url: '/accounting/journal-entries', params: params as Record<string, unknown> | undefined }),
      transformResponse: normalizePaginated<JournalEntry>,
      providesTags: ['JournalEntry'],
    }),
    getJournalEntry: builder.query<JournalEntryDetail, string>({
      query: (id) => ({ url: `/accounting/journal-entries/${id}` }),
      transformResponse: normalizeSingle<JournalEntryDetail>,
      providesTags: (_result, _error, id) => [{ type: 'JournalEntry' as const, id }],
    }),
    getGeneralLedger: builder.query<
      GeneralLedgerResponse,
      { accountId: string; fromDate?: string; toDate?: string; sourceType?: string }
    >({
      query: (params) => ({ url: '/accounting/general-ledger', params }),
      transformResponse: normalizeSingle<GeneralLedgerResponse>,
    }),
     getTrialBalance: builder.query<
       TrialBalanceResponse,
       { asOfDate?: string; showZero?: boolean }
     >({
       query: (params) => ({ url: '/accounting/trial-balance', params }),
       transformResponse: normalizeSingle<TrialBalanceResponse>,
       providesTags: ['TrialBalance'],
     }),
     getExpenses: builder.query<
       PaginatedResponse<Expense>,
       ExpenseListParams | undefined
     >({
       query: (params) => ({
         url: '/accounting/expenses',
         params: params as Record<string, unknown> | undefined,
       }),
       transformResponse: normalizePaginated<Expense>,
       providesTags: ['Expense'],
     }),
     getExpense: builder.query<Expense, string>({
       query: (id) => ({ url: `/accounting/expenses/${id}` }),
       transformResponse: normalizeSingle<Expense>,
       providesTags: (_result, _error, id) => [{ type: 'Expense' as const, id }],
     }),
     createExpense: builder.mutation<Expense, Partial<Expense>>({
       query: (body) => ({ url: '/accounting/expenses', method: 'POST', data: body }),
       transformResponse: normalizeSingle<Expense>,
       invalidatesTags: ['Expense'],
     }),
     updateExpense: builder.mutation<Expense, { id: string; data: Partial<Expense> }>({
       query: ({ id, data }) => ({
         url: `/accounting/expenses/${id}`,
         method: 'PATCH',
         data,
       }),
       transformResponse: normalizeSingle<Expense>,
       invalidatesTags: ['Expense'],
     }),
     cancelExpense: builder.mutation<Expense, string>({
       query: (id) => ({ url: `/accounting/expenses/${id}/cancel`, method: 'POST' }),
       transformResponse: normalizeSingle<Expense>,
       invalidatesTags: ['Expense', 'JournalEntry', 'TrialBalance'],
     }),
     payExpense: builder.mutation<Expense, { id: string; data: Record<string, unknown> }>({
       query: ({ id, data }) => ({
         url: `/accounting/expenses/${id}/pay`,
         method: 'POST',
         data,
       }),
       transformResponse: normalizeSingle<Expense>,
       invalidatesTags: ['Expense', 'JournalEntry', 'TrialBalance'],
     }),
     refundExpense: builder.mutation<Expense, { id: string; data: Record<string, unknown> }>({
       query: ({ id, data }) => ({
         url: `/accounting/expenses/${id}/refund`,
         method: 'POST',
         data,
       }),
       transformResponse: normalizeSingle<Expense>,
       invalidatesTags: ['Expense', 'JournalEntry', 'TrialBalance'],
     }),
   }),
 })

export const {
  useGetAccountTreeQuery,
  useGetAccountsQuery,
  useCreateAccountMutation,
  useUpdateAccountMutation,
  useGetAccountingSettingsQuery,
  useUpdateAccountingSettingsMutation,
  useGetJournalEntriesQuery,
  useGetJournalEntryQuery,
  useLazyGetJournalEntryQuery,
  useGetGeneralLedgerQuery,
  useLazyGetGeneralLedgerQuery,
  useGetTrialBalanceQuery,
  useGetExpensesQuery,
  useGetExpenseQuery,
  useCreateExpenseMutation,
  useUpdateExpenseMutation,
  useCancelExpenseMutation,
  usePayExpenseMutation,
  useRefundExpenseMutation,
} = accountingApiSlice
