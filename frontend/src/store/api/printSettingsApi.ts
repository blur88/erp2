import { createApi } from '@reduxjs/toolkit/query/react'
import { axiosBaseQuery } from './baseQuery'
import { normalizeSingle } from './normalizers'

export interface PrintSettings {
  id: string
  logoUrl?: string
  companyName?: string
  address?: string
  phone?: string
  email?: string
  website?: string
  miscInfo?: string
  salesPerPageFooter?: string
  salesEndOfDocFooter?: string
  purchasingPerPageFooter?: string
  purchasingEndOfDocFooter?: string
  inventoryPerPageFooter?: string
  inventoryEndOfDocFooter?: string
  reportPerPageFooter?: string
  reportEndOfDocFooter?: string
  salesOrderTemplate?: any
  invoiceTemplate?: any
  paymentReceiptTemplate?: any
  purchaseOrderTemplate?: any
  grnTemplate?: any
  vendorPaymentTemplate?: any
  createdAt: string
  updatedAt: string
}

export interface UpdatePrintSettingsDto {
  logoUrl?: string
  companyName?: string
  address?: string
  phone?: string
  email?: string
  website?: string
  miscInfo?: string
  salesPerPageFooter?: string
  salesEndOfDocFooter?: string
  purchasingPerPageFooter?: string
  purchasingEndOfDocFooter?: string
  inventoryPerPageFooter?: string
  inventoryEndOfDocFooter?: string
  reportPerPageFooter?: string
  reportEndOfDocFooter?: string
  salesOrderTemplate?: any
  invoiceTemplate?: any
  paymentReceiptTemplate?: any
  purchaseOrderTemplate?: any
  grnTemplate?: any
  vendorPaymentTemplate?: any
}

export const printSettingsApiSlice = createApi({
  reducerPath: 'printSettingsApi',
  baseQuery: axiosBaseQuery(),
  tagTypes: ['PrintSettings'],
  endpoints: (builder) => ({
    getPrintSettings: builder.query<PrintSettings, void>({
      query: () => ({ url: '/print-settings' }),
      transformResponse: normalizeSingle<PrintSettings>,
      providesTags: ['PrintSettings'],
    }),
    updatePrintSettings: builder.mutation<PrintSettings, UpdatePrintSettingsDto>({
      query: (data) => ({ url: '/print-settings', method: 'PUT', data }),
      transformResponse: normalizeSingle<PrintSettings>,
      invalidatesTags: ['PrintSettings'],
    }),
    importFromCompany: builder.mutation<PrintSettings, any>({
      query: (companySettings) => ({ url: '/print-settings/import-from-company', method: 'POST', data: companySettings }),
      transformResponse: normalizeSingle<PrintSettings>,
      invalidatesTags: ['PrintSettings'],
    }),
    uploadPrintLogo: builder.mutation<{ logoUrl: string; message: string }, File>({
      query: (file) => {
        const formData = new FormData()
        formData.append('file', file)
        return { url: '/print-settings/upload-logo', method: 'POST', data: formData }
      },
      invalidatesTags: ['PrintSettings'],
    }),
  }),
})

export const {
  useGetPrintSettingsQuery,
  useUpdatePrintSettingsMutation,
  useImportFromCompanyMutation,
  useUploadPrintLogoMutation,
} = printSettingsApiSlice
