import { createApi } from '@reduxjs/toolkit/query/react'

import type {
  Account,
  AccountTreeNode,
  AccountType,
  AccountingSourceType,
  AccountingSettings,
  CreateOwnerEquityRequest,
  Expense,
  JournalEntry,
  JournalEntryDetail,
  JournalEntryStatus,
  GeneralLedgerResponse,
  OwnerEquityDocument,
  OwnerEquityListParams,
  RefundOwnerEquityRequest,
  SettleOwnerEquityRequest,
  TrialBalanceResponse,
  ProfitAndLossResponse,
  PaginatedResponse,
  UpdateOwnerEquityRequest,
} from '@/types'

import { axiosBaseQuery } from './baseQuery'
import { inventoryApiSlice } from './inventoryApi'
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

export interface GeneralLedgerQueryParams {
  accountId: string
  fromDate?: string
  toDate?: string
  sourceType?: AccountingSourceType
  page?: number
  limit?: number
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
  tagTypes: ['Account', 'AccountingSettings', 'Expense', 'JournalEntry', 'TrialBalance', 'ProfitAndLoss', 'OwnerEquity'],
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
      invalidatesTags: ['Account', 'JournalEntry', 'TrialBalance', 'ProfitAndLoss'],
    }),
    updateAccount: builder.mutation<Account, { id: string; data: Partial<Account> }>({
      query: ({ id, data }) => ({ url: `/accounting/accounts/${id}`, method: 'PATCH', data }),
      transformResponse: normalizeSingle<Account>,
      invalidatesTags: ['Account', 'ProfitAndLoss'],
    }),
    getAccountingSettings: builder.query<AccountingSettings, void>({
      query: () => ({ url: '/accounting/settings' }),
      transformResponse: normalizeSingle<AccountingSettings>,
      providesTags: ['AccountingSettings'],
    }),
    updateAccountingSettings: builder.mutation<AccountingSettings, Partial<AccountingSettings>>({
      query: (body) => ({ url: '/accounting/settings', method: 'PUT', data: body }),
      transformResponse: normalizeSingle<AccountingSettings>,
      invalidatesTags: ['AccountingSettings', 'ProfitAndLoss'],
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
    getGeneralLedger: builder.query<GeneralLedgerResponse, GeneralLedgerQueryParams>({
      query: (params) => ({ url: '/accounting/general-ledger', params: params as unknown as Record<string, unknown> }),
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
     getProfitAndLoss: builder.query<ProfitAndLossResponse, { year: number }>({
       query: (params) => ({ url: '/accounting/profit-and-loss', params }),
       transformResponse: normalizeSingle<ProfitAndLossResponse>,
       providesTags: ['ProfitAndLoss'],
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
       invalidatesTags: ['Expense', 'JournalEntry', 'TrialBalance', 'ProfitAndLoss'],
     }),
     uncancelExpense: builder.mutation<Expense, string>({
       query: (id) => ({ url: `/accounting/expenses/${id}/uncancel`, method: 'POST' }),
       transformResponse: normalizeSingle<Expense>,
       invalidatesTags: ['Expense'],
     }),
payExpense: builder.mutation<Expense, { id: string; data: Record<string, unknown> }>({
        query: ({ id, data }) => ({
          url: `/accounting/expenses/${id}/pay`,
          method: 'POST',
          data,
        }),
        transformResponse: normalizeSingle<Expense>,
        invalidatesTags: ['Expense', 'JournalEntry', 'TrialBalance', 'ProfitAndLoss'],
      }),
      refundExpense: builder.mutation<Expense, { id: string; data: Record<string, unknown> }>({
        query: ({ id, data }) => ({
          url: `/accounting/expenses/${id}/refund`,
          method: 'POST',
          data,
        }),
        transformResponse: normalizeSingle<Expense>,
        invalidatesTags: ['Expense', 'JournalEntry', 'TrialBalance', 'ProfitAndLoss'],
      }),
      getOwnerEquityList: builder.query<
        PaginatedResponse<OwnerEquityDocument>,
        OwnerEquityListParams | undefined
      >({
        query: (params) => ({
          url: '/accounting/owner-equity',
          params: params as Record<string, unknown> | undefined,
        }),
        transformResponse: normalizePaginated<OwnerEquityDocument>,
        providesTags: ['OwnerEquity'],
      }),
      getOwnerEquity: builder.query<OwnerEquityDocument, string>({
        query: (referenceNumber) => ({ url: `/accounting/owner-equity/${referenceNumber}` }),
        transformResponse: normalizeSingle<OwnerEquityDocument>,
        providesTags: (_r, _e, referenceNumber) => [{ type: 'OwnerEquity', id: referenceNumber }],
      }),
      createOwnerEquity: builder.mutation<OwnerEquityDocument, CreateOwnerEquityRequest>({
        query: (body) => ({ url: '/accounting/owner-equity', method: 'POST', data: body }),
        transformResponse: normalizeSingle<OwnerEquityDocument>,
        invalidatesTags: ['OwnerEquity'],
      }),
      updateOwnerEquity: builder.mutation<
        OwnerEquityDocument,
        { referenceNumber: string; data: UpdateOwnerEquityRequest }
      >({
        query: ({ referenceNumber, data }) => ({
          url: `/accounting/owner-equity/${referenceNumber}`,
          method: 'PATCH',
          data,
        }),
        transformResponse: normalizeSingle<OwnerEquityDocument>,
        invalidatesTags: ['OwnerEquity'],
      }),
      settleOwnerEquity: builder.mutation<
        OwnerEquityDocument,
        { referenceNumber: string; data: SettleOwnerEquityRequest }
      >({
        query: ({ referenceNumber, data }) => ({
          url: `/accounting/owner-equity/${referenceNumber}/settle`,
          method: 'POST',
          data,
        }),
        transformResponse: normalizeSingle<OwnerEquityDocument>,
        invalidatesTags: ['OwnerEquity', 'JournalEntry', 'TrialBalance', 'ProfitAndLoss'],
      }),
      refundOwnerEquity: builder.mutation<
        OwnerEquityDocument,
        { referenceNumber: string; data: RefundOwnerEquityRequest }
      >({
        query: ({ referenceNumber, data }) => ({
          url: `/accounting/owner-equity/${referenceNumber}/refund`,
          method: 'POST',
          data,
        }),
        transformResponse: normalizeSingle<OwnerEquityDocument>,
        invalidatesTags: ['OwnerEquity', 'JournalEntry', 'TrialBalance', 'ProfitAndLoss'],
      }),
      completeOwnerEquity: builder.mutation<OwnerEquityDocument, { referenceNumber: string }>({
        query: ({ referenceNumber }) => ({
          url: `/accounting/owner-equity/${referenceNumber}/complete`,
          method: 'POST',
        }),
        transformResponse: normalizeSingle<OwnerEquityDocument>,
        invalidatesTags: ['OwnerEquity', 'JournalEntry', 'TrialBalance', 'ProfitAndLoss'],
        async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
          try {
            const { data } = await queryFulfilled;
            // Separate createApi instance — accountingApi tags cannot reach it.
            // Only stock drawings move stock; skip inventory invalidation otherwise.
            if (data.type === 'STOCK_DRAWING') {
              dispatch(inventoryApiSlice.util.invalidateTags(['Product', 'StockMovement']));
            }
          } catch {
            // Mutation failed — nothing to invalidate.
          }
        },
      }),
      uncompleteOwnerEquity: builder.mutation<OwnerEquityDocument, { referenceNumber: string }>({
        query: ({ referenceNumber }) => ({
          url: `/accounting/owner-equity/${referenceNumber}/uncomplete`,
          method: 'POST',
        }),
        transformResponse: normalizeSingle<OwnerEquityDocument>,
        invalidatesTags: ['OwnerEquity', 'JournalEntry', 'TrialBalance', 'ProfitAndLoss'],
        async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
          try {
            const { data } = await queryFulfilled;
            // Separate createApi instance — accountingApi tags cannot reach it.
            // Only stock drawings move stock; skip inventory invalidation otherwise.
            if (data.type === 'STOCK_DRAWING') {
              dispatch(inventoryApiSlice.util.invalidateTags(['Product', 'StockMovement']));
            }
          } catch {
            // Mutation failed — nothing to invalidate.
          }
        },
      }),
      cancelOwnerEquity: builder.mutation<OwnerEquityDocument, { referenceNumber: string }>({
        query: ({ referenceNumber }) => ({
          url: `/accounting/owner-equity/${referenceNumber}/cancel`,
          method: 'POST',
        }),
        transformResponse: normalizeSingle<OwnerEquityDocument>,
        invalidatesTags: ['OwnerEquity'],
      }),
      uncancelOwnerEquity: builder.mutation<OwnerEquityDocument, { referenceNumber: string }>({
        query: ({ referenceNumber }) => ({
          url: `/accounting/owner-equity/${referenceNumber}/uncancel`,
          method: 'POST',
        }),
        transformResponse: normalizeSingle<OwnerEquityDocument>,
        invalidatesTags: ['OwnerEquity'],
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
  useGetProfitAndLossQuery,
  useGetExpensesQuery,
  useGetExpenseQuery,
  useCreateExpenseMutation,
  useUpdateExpenseMutation,
  useCancelExpenseMutation,
  useUncancelExpenseMutation,
  usePayExpenseMutation,
  useRefundExpenseMutation,
  useGetOwnerEquityListQuery,
  useGetOwnerEquityQuery,
  useCreateOwnerEquityMutation,
  useUpdateOwnerEquityMutation,
  useSettleOwnerEquityMutation,
  useRefundOwnerEquityMutation,
  useCompleteOwnerEquityMutation,
  useUncompleteOwnerEquityMutation,
  useCancelOwnerEquityMutation,
  useUncancelOwnerEquityMutation,
} = accountingApiSlice
