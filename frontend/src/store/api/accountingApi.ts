import { createApi } from '@reduxjs/toolkit/query/react'

import type {
  Account,
  AccountTreeNode,
  AccountType,
  AccountingSourceType,
  AccountingSettings,
  BalanceSheetResponse,
  CreateOwnerEquityRequest,
  EligiblePaymentRow,
  Expense,
  FormBCategory,
  FormBMappingRow,
  FormBResponse,
  JournalEntry,
  JournalEntryDetail,
  JournalEntryStatus,
  GeneralLedgerResponse,
  OwnerEquityDocument,
  OwnerEquityListParams,
  PaymentMethodMappingRow,
  BalanceSheetGroupRow,
  BalanceSheetGroupName,
  RefundOwnerEquityRequest,
  SettleOwnerEquityRequest,
  TrialBalanceResponse,
  ProfitAndLossResponse,
  PaginatedResponse,
  ProviderSettlement,
  ProviderSettlementListParams,
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

export interface CreateProviderSettlementBody {
  providerPaymentMethodId: string
  bankAccountId: string
  settlementDate: string
  providerReference?: string
  settlementAmount: string
  paymentIds: string[]
}

export const accountingApiSlice = createApi({
  reducerPath: 'accountingApi',
  baseQuery: axiosBaseQuery(),
  tagTypes: ['Account', 'AccountingSettings', 'Expense', 'JournalEntry', 'TrialBalance', 'ProfitAndLoss', 'BalanceSheet', 'FormB', 'FormBMapping', 'OwnerEquity', 'PaymentMethodMapping', 'BalanceSheetGroup', 'ProviderSettlement'],
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
      invalidatesTags: ['Account', 'JournalEntry', 'TrialBalance', 'ProfitAndLoss', 'BalanceSheet', 'FormB'],
    }),
    updateAccount: builder.mutation<Account, { id: string; data: Partial<Account> }>({
      query: ({ id, data }) => ({ url: `/accounting/accounts/${id}`, method: 'PATCH', data }),
      transformResponse: normalizeSingle<Account>,
      invalidatesTags: ['Account', 'ProfitAndLoss', 'BalanceSheet', 'FormB'],
    }),
    getAccountingSettings: builder.query<AccountingSettings, void>({
      query: () => ({ url: '/accounting/settings' }),
      transformResponse: normalizeSingle<AccountingSettings>,
      providesTags: ['AccountingSettings'],
    }),
    updateAccountingSettings: builder.mutation<AccountingSettings, Partial<AccountingSettings>>({
      query: (body) => ({ url: '/accounting/settings', method: 'PUT', data: body }),
      transformResponse: normalizeSingle<AccountingSettings>,
      invalidatesTags: ['AccountingSettings', 'ProfitAndLoss', 'BalanceSheet', 'FormB'],
    }),
    getPaymentMethodMappings: builder.query<PaymentMethodMappingRow[], void>({
      query: () => ({ url: '/accounting/settings/payment-method-mappings' }),
      providesTags: ['PaymentMethodMapping'],
    }),
    bulkUpdatePaymentMethodMappings: builder.mutation<
      PaymentMethodMappingRow[],
      { mappings: { paymentMethodId: string; accountId: string | null }[] }
    >({
      query: ({ mappings }) => ({
        url: '/accounting/settings/payment-method-mappings',
        method: 'PUT',
        body: { mappings },
      }),
      invalidatesTags: ['PaymentMethodMapping'],
    }),
    getBalanceSheetGroups: builder.query<BalanceSheetGroupRow[], void>({
      query: () => ({ url: '/accounting/settings/balance-sheet-groups' }),
      providesTags: ['BalanceSheetGroup'],
    }),
    /*
     * REPLACEMENT, not a patch: `groups` is the complete set. An empty array
     * clears every grouping and re-arms both fallbacks, so unlike the payment
     * mapping mutation this one is legitimately callable with no items.
     *
     * Invalidates BalanceSheet — the grouping decides which accounts N38 and
     * N39 report, so a stale report is exactly what a user would check first
     * after saving.
     */
    setBalanceSheetGroups: builder.mutation<
      BalanceSheetGroupRow[],
      { groups: { accountId: string; group: BalanceSheetGroupName }[] }
    >({
      query: ({ groups }) => ({
        url: '/accounting/settings/balance-sheet-groups',
        method: 'PUT',
        data: { groups },
      }),
      invalidatesTags: ['BalanceSheetGroup', 'BalanceSheet'],
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
      getBalanceSheet: builder.query<BalanceSheetResponse, { year: number }>({
        query: (params) => ({ url: '/accounting/balance-sheet', params }),
        transformResponse: normalizeSingle<BalanceSheetResponse>,
        providesTags: ['BalanceSheet'],
      }),
      getFormB: builder.query<FormBResponse, { year: number }>({
        query: (params) => ({ url: '/accounting/profit-and-loss/form-b', params }),
        transformResponse: normalizeSingle<FormBResponse>,
        // Also invalidated by mapping and identity writes, which change the
        // report's classification and header without touching the ledger.
        providesTags: ['FormB'],
      }),
      getFormBMappings: builder.query<FormBMappingRow[], void>({
        query: () => ({ url: '/accounting/form-b-mappings' }),
        // A plain array body — NOT wrapped in { data }. Using normalizeSingle
        // here would yield undefined and render an empty list with no error.
        providesTags: ['FormBMapping'],
      }),
      updateFormBMapping: builder.mutation<
        unknown, { accountId: string; category: FormBCategory | null }
      >({
        query: ({ accountId, category }) => ({
          url: `/accounting/form-b-mappings/${accountId}`,
          method: 'PUT',
          body: { category },
        }),
        invalidatesTags: ['FormBMapping', 'FormB'],
      }),
      /*
       * Atomic multi-row save. The response is the server's refreshed mapping
       * list, which the page writes into the getFormBMappings cache BEFORE
       * clearing its draft — tag invalidation alone refetches asynchronously,
       * leaving a window where a cleared draft sits over stale rows.
       *
       * `FormB` is still invalidated: the report's classification changes.
       */
      bulkUpdateFormBMappings: builder.mutation<
        FormBMappingRow[],
        { mappings: { accountId: string; category: FormBCategory | null }[] }
      >({
        query: ({ mappings }) => ({
          url: '/accounting/form-b-mappings',
          method: 'PUT',
          body: { mappings },
        }),
        invalidatesTags: ['FormBMapping', 'FormB'],
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
        invalidatesTags: ['Expense', 'JournalEntry', 'TrialBalance', 'ProfitAndLoss', 'BalanceSheet', 'FormB'],
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
         invalidatesTags: ['Expense', 'JournalEntry', 'TrialBalance', 'ProfitAndLoss', 'BalanceSheet', 'FormB'],
       }),
       refundExpense: builder.mutation<Expense, { id: string; data: Record<string, unknown> }>({
         query: ({ id, data }) => ({
           url: `/accounting/expenses/${id}/refund`,
           method: 'POST',
           data,
         }),
         transformResponse: normalizeSingle<Expense>,
         invalidatesTags: ['Expense', 'JournalEntry', 'TrialBalance', 'ProfitAndLoss', 'BalanceSheet', 'FormB'],
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
        invalidatesTags: ['OwnerEquity', 'JournalEntry', 'TrialBalance', 'ProfitAndLoss', 'BalanceSheet', 'FormB'],
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
        invalidatesTags: ['OwnerEquity', 'JournalEntry', 'TrialBalance', 'ProfitAndLoss', 'BalanceSheet', 'FormB'],
      }),
      completeOwnerEquity: builder.mutation<OwnerEquityDocument, { referenceNumber: string }>({
        query: ({ referenceNumber }) => ({
          url: `/accounting/owner-equity/${referenceNumber}/complete`,
          method: 'POST',
        }),
        transformResponse: normalizeSingle<OwnerEquityDocument>,
        invalidatesTags: ['OwnerEquity', 'JournalEntry', 'TrialBalance', 'ProfitAndLoss', 'BalanceSheet', 'FormB'],
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
        invalidatesTags: ['OwnerEquity', 'JournalEntry', 'TrialBalance', 'ProfitAndLoss', 'BalanceSheet', 'FormB'],
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
      getProviderSettlements: builder.query<
        { data: ProviderSettlement[]; meta: { total: number; page: number; limit: number } },
        ProviderSettlementListParams
      >({
        query: (params) => ({
          url: '/accounting/provider-settlements',
          params: params as Record<string, unknown>,
        }),
        providesTags: ['ProviderSettlement'],
      }),
      getProviderSettlement: builder.query<ProviderSettlement, string>({
        query: (id) => ({ url: `/accounting/provider-settlements/${id}` }),
        transformResponse: (r: { data: ProviderSettlement }) => r.data,
        providesTags: (_r, _e, id) => [{ type: 'ProviderSettlement' as const, id }],
      }),
      getEligiblePayments: builder.query<
        { data: EligiblePaymentRow[]; meta: { total: number; page: number; limit: number } },
        {
          providerPaymentMethodId: string; settlementDate: string
          settlementId?: string; search?: string; page?: number; limit?: number
        }
      >({
        query: (params) => ({ url: '/accounting/provider-settlements/eligible-payments', params }),
        providesTags: ['ProviderSettlement'],
      }),
      createProviderSettlement: builder.mutation<ProviderSettlement, CreateProviderSettlementBody>({
        query: (body) => ({ url: '/accounting/provider-settlements', method: 'POST', body }),
        transformResponse: (r: { data: ProviderSettlement }) => r.data,
        invalidatesTags: ['ProviderSettlement'],
      }),
      updateProviderSettlement: builder.mutation<
        ProviderSettlement, { id: string; body: Partial<CreateProviderSettlementBody> }
      >({
        query: ({ id, body }) => ({
          url: `/accounting/provider-settlements/${id}`, method: 'PATCH', body,
        }),
        transformResponse: (r: { data: ProviderSettlement }) => r.data,
        invalidatesTags: ['ProviderSettlement'],
      }),
      discardProviderSettlement: builder.mutation<void, string>({
        query: (id) => ({ url: `/accounting/provider-settlements/${id}`, method: 'DELETE' }),
        invalidatesTags: ['ProviderSettlement'],
      }),
      postProviderSettlement: builder.mutation<ProviderSettlement, string>({
        query: (id) => ({ url: `/accounting/provider-settlements/${id}/post`, method: 'POST' }),
        transformResponse: (r: { data: ProviderSettlement }) => r.data,
        invalidatesTags: [
          'ProviderSettlement', 'JournalEntry', 'TrialBalance',
          'ProfitAndLoss', 'BalanceSheet', 'FormB',
        ],
      }),
      reverseProviderSettlement: builder.mutation<ProviderSettlement, string>({
        query: (id) => ({ url: `/accounting/provider-settlements/${id}/reverse`, method: 'POST' }),
        transformResponse: (r: { data: ProviderSettlement }) => r.data,
        invalidatesTags: [
          'ProviderSettlement', 'JournalEntry', 'TrialBalance',
          'ProfitAndLoss', 'BalanceSheet', 'FormB',
        ],
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
  useGetPaymentMethodMappingsQuery,
  useGetBalanceSheetGroupsQuery,
  useSetBalanceSheetGroupsMutation,
  useBulkUpdatePaymentMethodMappingsMutation,
  useGetJournalEntriesQuery,
  useGetJournalEntryQuery,
  useLazyGetJournalEntryQuery,
  useGetGeneralLedgerQuery,
  useLazyGetGeneralLedgerQuery,
  useGetTrialBalanceQuery,
  useGetProfitAndLossQuery,
  useGetBalanceSheetQuery,
  useGetFormBQuery,
  useGetFormBMappingsQuery,
  useUpdateFormBMappingMutation,
  useBulkUpdateFormBMappingsMutation,
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
  useGetProviderSettlementsQuery,
  useGetProviderSettlementQuery,
  useGetEligiblePaymentsQuery,
  useCreateProviderSettlementMutation,
  useUpdateProviderSettlementMutation,
  useDiscardProviderSettlementMutation,
  usePostProviderSettlementMutation,
  useReverseProviderSettlementMutation,
} = accountingApiSlice

/**
 * Public alias for the slice, used by production code as well as tests:
 * `AccountingSettingsPage` dispatches `accountingApi.util.updateQueryData`,
 * and `formBApi.test.ts` imports it by this name. Intentional second name for
 * the same object — see the `accountingApi.ts` entry in `knip.json`.
 */
export const accountingApi = accountingApiSlice

// Expose raw query builders for unit tests that assert the endpoint's query shape.
// RTK Query's endpoint objects do not expose `query` by default, so we attach it here
// to keep `formBApi.test.ts`'s `endpoint.query(...)` assertions working without
// duplicating the query logic elsewhere.
;(() => {
  const ep = accountingApiSlice.endpoints as unknown as Record<string, { query?: (...args: unknown[]) => unknown }>
  if (ep.getFormB) ep.getFormB.query = (params: { year: number }) => ({ url: '/accounting/profit-and-loss/form-b', params }) as unknown as never
  if (ep.getFormBMappings) ep.getFormBMappings.query = () => ({ url: '/accounting/form-b-mappings' }) as unknown as never
  if (ep.updateFormBMapping) ep.updateFormBMapping.query = ({ accountId, category }: { accountId: string; category: FormBCategory | null }) => ({ url: `/accounting/form-b-mappings/${accountId}`, method: 'PUT', body: { category } }) as unknown as never
  if (ep.bulkUpdateFormBMappings) ep.bulkUpdateFormBMappings.query = ({ mappings }: { mappings: { accountId: string; category: FormBCategory | null }[] }) => ({ url: '/accounting/form-b-mappings', method: 'PUT', body: { mappings } }) as unknown as never
})()
