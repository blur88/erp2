import { createApi } from '@reduxjs/toolkit/query/react'

import type {
  Account,
  AccountTreeNode,
  AccountingSettings,
  JournalEntry,
  JournalEntryDetail,
  GeneralLedgerResponse,
  TrialBalanceResponse,
  PaginatedResponse,
} from '@/types'

import { axiosBaseQuery } from './baseQuery'
import { normalizePaginated, normalizeSingle } from './normalizers'

export const accountingApiSlice = createApi({
  reducerPath: 'accountingApi',
  baseQuery: axiosBaseQuery(),
  tagTypes: ['Account', 'AccountingSettings', 'JournalEntry'],
  endpoints: (builder) => ({
    getAccountTree: builder.query<AccountTreeNode[], { search?: string }>({
      query: ({ search }) => ({
        url: '/accounting/accounts/tree',
        params: search ? { search } : undefined,
      }),
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
      invalidatesTags: ['Account'],
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
      Record<string, unknown> | undefined
    >({
      query: (params) => ({ url: '/accounting/journal-entries', params: params ?? {} }),
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
} = accountingApiSlice
