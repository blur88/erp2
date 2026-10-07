import { createApi } from '@reduxjs/toolkit/query/react'
import { axiosBaseQuery, toQueryError } from './baseQuery'
import { normalizeSingle } from './normalizers'
import { requestWithRetryOn429 } from '@/services/retryOn429'

export interface CompanySettings {
  id: string
  name: string
  /** Business registration number (SSM). Printed as Form B N1a. */
  registrationNumber?: string
  address: string
  city: string
  state?: string
  postalCode?: string
  country: string
  phone?: string
  email?: string
  website?: string
  miscInfo?: string
  logoUrl?: string
  createdAt: string
  updatedAt: string
}

export interface UpdateCompanySettingsDto {
  name: string
  registrationNumber?: string
  address: string
  city: string
  state?: string
  postalCode?: string
  country: string
  phone?: string
  email?: string
  website?: string
  miscInfo?: string
}

export interface RegionalSettings {
  id: string
  currency: string
  costingMethod: string
  dateFormat: string
  timeFormat: string
  numberFormat: string
  timezone: string
  lowStockThreshold: number
  startOfWeek: number
  createdAt: string
  updatedAt: string
  isActive: boolean
}

export interface UpdateRegionalSettingsDto {
  currency?: string
  costingMethod?: string
  dateFormat?: string
  timeFormat?: string
  numberFormat?: string
  timezone?: string
  lowStockThreshold?: number
  startOfWeek?: number
}

export interface DocumentNumberConfig {
  documentName: string
  prefix: string
  paddingDigits: number
  nextNumber: number
  lastResetYear: number
}

export interface DocumentNumberSettings {
  configurations: DocumentNumberConfig[]
}

export interface UpdateDocumentNumberSettingsDto {
  configurations: DocumentNumberConfig[]
}

export const settingsApiSlice = createApi({
  reducerPath: 'settingsApi',
  baseQuery: axiosBaseQuery(),
  tagTypes: ['CompanySettings', 'RegionalSettings', 'DocumentNumberSettings'],
  endpoints: (builder) => ({
    getCompanySettings: builder.query<CompanySettings, void>({
      // The sidebar shows this on every page and nothing else requests it again
      // for a non-administrator, so this one read is re-sent after a 429 from
      // the ingress (services/retryOn429.ts). No other endpoint is.
      queryFn: async (_arg, { signal }) => {
        try {
          const result = await requestWithRetryOn429({ url: '/settings/company', method: 'GET', signal })
          return { data: normalizeSingle<CompanySettings>(result.data) }
        } catch (err) {
          return { error: toQueryError(err) }
        }
      },
      providesTags: ['CompanySettings'],
    }),
    updateCompanySettings: builder.mutation<CompanySettings, UpdateCompanySettingsDto>({
      query: (data) => ({ url: '/settings/company', method: 'PUT', data }),
      transformResponse: normalizeSingle<CompanySettings>,
      invalidatesTags: ['CompanySettings'],
    }),
    uploadLogo: builder.mutation<CompanySettings, File>({
      query: (file) => {
        const formData = new FormData()
        formData.append('logo', file)
        return { url: '/settings/company/logo', method: 'POST', data: formData }
      },
      transformResponse: normalizeSingle<CompanySettings>,
      invalidatesTags: ['CompanySettings'],
    }),
    deleteLogo: builder.mutation<CompanySettings, void>({
      query: () => ({ url: '/settings/company/logo', method: 'DELETE' }),
      transformResponse: normalizeSingle<CompanySettings>,
      invalidatesTags: ['CompanySettings'],
    }),
    getRegionalSettings: builder.query<RegionalSettings, void>({
      query: () => ({ url: '/settings/regional' }),
      transformResponse: normalizeSingle<RegionalSettings>,
      providesTags: ['RegionalSettings'],
    }),
    updateRegionalSettings: builder.mutation<RegionalSettings, UpdateRegionalSettingsDto>({
      query: (data) => ({ url: '/settings/regional', method: 'PUT', data }),
      transformResponse: normalizeSingle<RegionalSettings>,
      invalidatesTags: ['RegionalSettings'],
    }),
    getDefaultCurrency: builder.query<{ currency: string }, void>({
      query: () => ({ url: '/settings/default-currency' }),
      transformResponse: normalizeSingle<{ currency: string }>,
      providesTags: ['RegionalSettings'],
    }),
    getDocumentNumberSettings: builder.query<DocumentNumberSettings, void>({
      query: () => ({ url: '/settings/document-numbers' }),
      transformResponse: normalizeSingle<DocumentNumberSettings>,
      providesTags: ['DocumentNumberSettings'],
    }),
    updateDocumentNumberSettings: builder.mutation<DocumentNumberSettings, UpdateDocumentNumberSettingsDto>({
      query: (data) => ({ url: '/settings/document-numbers', method: 'PUT', data }),
      transformResponse: normalizeSingle<DocumentNumberSettings>,
      invalidatesTags: ['DocumentNumberSettings'],
    }),
  }),
})

export const {
  useGetCompanySettingsQuery,
  useUpdateCompanySettingsMutation,
  useUploadLogoMutation,
  useDeleteLogoMutation,
  useGetRegionalSettingsQuery,
  useUpdateRegionalSettingsMutation,
  useGetDefaultCurrencyQuery,
  useGetDocumentNumberSettingsQuery,
  useUpdateDocumentNumberSettingsMutation,
} = settingsApiSlice
