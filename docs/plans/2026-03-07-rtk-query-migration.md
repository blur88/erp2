# RTK Query Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the RTK Query migration by creating 3 missing RTK slices and updating all consumer files to use RTK hooks instead of legacy `services/` imports.

**Architecture:** The RTK infrastructure (`axiosBaseQuery`, `createApi`) already exists in `store/api/`. Each legacy service file has a 1:1 RTK counterpart that already exists or will be created. Consumer pages/components replace direct async service calls with RTK hooks (`useXxxQuery`, `useXxxMutation`). The legacy `services/authApi.ts` is intentionally excluded — it uses a dedicated no-interceptor axios instance to avoid circular token-refresh dependencies.

**Tech Stack:** RTK Query (`@reduxjs/toolkit/query/react`), React hooks, TypeScript

---

## Overview of Work

### Phase 1: Create 3 missing RTK slices
- `store/api/settingsApi.ts`
- `store/api/printSettingsApi.ts`
- `store/api/paymentMethodsApi.ts`

### Phase 2: Register new slices in store
- `store/index.ts`

### Phase 3: Migrate consumer files (grouped by domain)
Each group below lists every file that still imports from `@/services/` for that domain.

### Phase 4: Move types out of legacy service files
Some legacy files export types that RTK slices or consumers import. Move those types to the RTK slice or inline them.

### Phase 5: Delete legacy service files (except `api.ts` and `authApi.ts`)

---

## Key Patterns

### Old pattern (legacy service)
```tsx
import { settingsApi } from '@/services/settingsApi'
const [data, setData] = useState(null)
useEffect(() => {
  settingsApi.getCompanySettings().then(setData)
}, [])
```

### New pattern (RTK Query)
```tsx
import { useGetCompanySettingsQuery } from '@/store/api/settingsApi'
const { data, isLoading, error } = useGetCompanySettingsQuery()
```

### Old mutation pattern
```tsx
const handleSave = async () => {
  await settingsApi.updateCompanySettings(form)
}
```

### New mutation pattern
```tsx
import { useUpdateCompanySettingsMutation } from '@/store/api/settingsApi'
const [updateSettings, { isLoading }] = useUpdateCompanySettingsMutation()
const handleSave = async () => {
  await updateSettings(form).unwrap()
}
```

### Report pages that call ApiService directly
Replace with RTK `useQuery` or keep as a one-off `useEffect` using the existing `axiosBaseQuery` axios instance (`import api from '@/services/api'` is acceptable for non-CRUD report downloads — only CRUD endpoints need RTK hooks).

---

## Task 1: Create `store/api/settingsApi.ts`

**Files:**
- Create: `frontend/src/store/api/settingsApi.ts`
- Modify: `frontend/src/store/index.ts`
- Test: `frontend/src/store/api/__tests__/settingsApi.test.ts`

**Step 1: Write the failing test**

```ts
// frontend/src/store/api/__tests__/settingsApi.test.ts
import { describe, it, expect } from 'vitest'
import { settingsApiSlice } from '../settingsApi'

describe('settingsApiSlice', () => {
  it('has the correct reducerPath', () => {
    expect(settingsApiSlice.reducerPath).toBe('settingsApi')
  })

  it('exports query hooks', () => {
    expect(typeof settingsApiSlice.endpoints.getCompanySettings).toBe('object')
    expect(typeof settingsApiSlice.endpoints.getPriceCostingSettings).toBe('object')
    expect(typeof settingsApiSlice.endpoints.getDocumentNumberSettings).toBe('object')
    expect(typeof settingsApiSlice.endpoints.getDefaultCurrency).toBe('object')
  })

  it('exports mutation hooks', () => {
    expect(typeof settingsApiSlice.endpoints.updateCompanySettings).toBe('object')
    expect(typeof settingsApiSlice.endpoints.updatePriceCostingSettings).toBe('object')
    expect(typeof settingsApiSlice.endpoints.updateDocumentNumberSettings).toBe('object')
    expect(typeof settingsApiSlice.endpoints.uploadLogo).toBe('object')
    expect(typeof settingsApiSlice.endpoints.deleteLogo).toBe('object')
  })
})
```

**Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/store/api/__tests__/settingsApi.test.ts
```

Expected: FAIL — `Cannot find module '../settingsApi'`

**Step 3: Create the RTK slice**

```ts
// frontend/src/store/api/settingsApi.ts
import { createApi } from '@reduxjs/toolkit/query/react'
import { axiosBaseQuery } from './baseQuery'
import { normalizeSingle } from './normalizers'

export interface CompanySettings {
  id: string
  name: string
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

export interface PriceCostingSettings {
  id: string
  currency: string
  costingMethod: string
  dateFormat: string
  timeFormat: string
  numberFormat: string
  createdAt: string
  updatedAt: string
  isActive: boolean
}

export interface UpdatePriceCostingSettingsDto {
  currency?: string
  costingMethod?: string
  dateFormat?: string
  timeFormat?: string
  numberFormat?: string
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
  tagTypes: ['CompanySettings', 'PriceCostingSettings', 'DocumentNumberSettings'],
  endpoints: (builder) => ({
    getCompanySettings: builder.query<CompanySettings, void>({
      query: () => ({ url: '/settings/company' }),
      transformResponse: normalizeSingle<CompanySettings>,
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
        return { url: '/settings/company/logo', method: 'POST', data: formData, headers: { 'Content-Type': 'multipart/form-data' } }
      },
      transformResponse: normalizeSingle<CompanySettings>,
      invalidatesTags: ['CompanySettings'],
    }),
    deleteLogo: builder.mutation<CompanySettings, void>({
      query: () => ({ url: '/settings/company/logo', method: 'DELETE' }),
      transformResponse: normalizeSingle<CompanySettings>,
      invalidatesTags: ['CompanySettings'],
    }),
    getPriceCostingSettings: builder.query<PriceCostingSettings, void>({
      query: () => ({ url: '/settings/price-costing' }),
      transformResponse: normalizeSingle<PriceCostingSettings>,
      providesTags: ['PriceCostingSettings'],
    }),
    updatePriceCostingSettings: builder.mutation<PriceCostingSettings, UpdatePriceCostingSettingsDto>({
      query: (data) => ({ url: '/settings/price-costing', method: 'PUT', data }),
      transformResponse: normalizeSingle<PriceCostingSettings>,
      invalidatesTags: ['PriceCostingSettings'],
    }),
    getDefaultCurrency: builder.query<{ currency: string }, void>({
      query: () => ({ url: '/settings/default-currency' }),
      transformResponse: normalizeSingle<{ currency: string }>,
      providesTags: ['PriceCostingSettings'],
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
  useGetPriceCostingSettingsQuery,
  useUpdatePriceCostingSettingsMutation,
  useGetDefaultCurrencyQuery,
  useGetDocumentNumberSettingsQuery,
  useUpdateDocumentNumberSettingsMutation,
} = settingsApiSlice
```

**Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/store/api/__tests__/settingsApi.test.ts
```

Expected: PASS

**Step 5: Register in store**

In `frontend/src/store/index.ts`, add after the last existing import:
```ts
import { settingsApiSlice } from './api/settingsApi'
```

In `rootReducer`, add:
```ts
[settingsApiSlice.reducerPath]: settingsApiSlice.reducer,
```

In `middleware`, add:
```ts
settingsApiSlice.middleware as any,
```

**Step 6: Commit**

```bash
git add frontend/src/store/api/settingsApi.ts frontend/src/store/api/__tests__/settingsApi.test.ts frontend/src/store/index.ts
git commit -m "feat: add settingsApi RTK Query slice"
```

---

## Task 2: Create `store/api/printSettingsApi.ts`

**Files:**
- Create: `frontend/src/store/api/printSettingsApi.ts`
- Modify: `frontend/src/store/index.ts`
- Test: `frontend/src/store/api/__tests__/printSettingsApi.test.ts`

**Step 1: Write the failing test**

```ts
// frontend/src/store/api/__tests__/printSettingsApi.test.ts
import { describe, it, expect } from 'vitest'
import { printSettingsApiSlice } from '../printSettingsApi'

describe('printSettingsApiSlice', () => {
  it('has the correct reducerPath', () => {
    expect(printSettingsApiSlice.reducerPath).toBe('printSettingsApi')
  })

  it('exports query hooks', () => {
    expect(typeof printSettingsApiSlice.endpoints.getPrintSettings).toBe('object')
  })

  it('exports mutation hooks', () => {
    expect(typeof printSettingsApiSlice.endpoints.updatePrintSettings).toBe('object')
    expect(typeof printSettingsApiSlice.endpoints.importFromCompany).toBe('object')
    expect(typeof printSettingsApiSlice.endpoints.uploadPrintLogo).toBe('object')
  })
})
```

**Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/store/api/__tests__/printSettingsApi.test.ts
```

Expected: FAIL

**Step 3: Create the RTK slice**

```ts
// frontend/src/store/api/printSettingsApi.ts
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
        return { url: '/print-settings/upload-logo', method: 'POST', data: formData, headers: { 'Content-Type': 'multipart/form-data' } }
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
```

**Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/store/api/__tests__/printSettingsApi.test.ts
```

Expected: PASS

**Step 5: Register in store**

In `frontend/src/store/index.ts`:
- Add import: `import { printSettingsApiSlice } from './api/printSettingsApi'`
- Add to `rootReducer`: `[printSettingsApiSlice.reducerPath]: printSettingsApiSlice.reducer,`
- Add to middleware: `printSettingsApiSlice.middleware as any,`

**Step 6: Commit**

```bash
git add frontend/src/store/api/printSettingsApi.ts frontend/src/store/api/__tests__/printSettingsApi.test.ts frontend/src/store/index.ts
git commit -m "feat: add printSettingsApi RTK Query slice"
```

---

## Task 3: Create `store/api/paymentMethodsApi.ts`

**Files:**
- Create: `frontend/src/store/api/paymentMethodsApi.ts`
- Modify: `frontend/src/store/index.ts`
- Test: `frontend/src/store/api/__tests__/paymentMethodsApi.test.ts`

**Step 1: Write the failing test**

```ts
// frontend/src/store/api/__tests__/paymentMethodsApi.test.ts
import { describe, it, expect } from 'vitest'
import { paymentMethodsApiSlice } from '../paymentMethodsApi'

describe('paymentMethodsApiSlice', () => {
  it('has the correct reducerPath', () => {
    expect(paymentMethodsApiSlice.reducerPath).toBe('paymentMethodsApi')
  })

  it('exports query hooks', () => {
    expect(typeof paymentMethodsApiSlice.endpoints.getPaymentMethods).toBe('object')
    expect(typeof paymentMethodsApiSlice.endpoints.getActivePaymentMethods).toBe('object')
    expect(typeof paymentMethodsApiSlice.endpoints.getActivePaymentMethodsForPurchases).toBe('object')
    expect(typeof paymentMethodsApiSlice.endpoints.getDeletedPaymentMethods).toBe('object')
  })

  it('exports mutation hooks', () => {
    expect(typeof paymentMethodsApiSlice.endpoints.createPaymentMethod).toBe('object')
    expect(typeof paymentMethodsApiSlice.endpoints.updatePaymentMethod).toBe('object')
    expect(typeof paymentMethodsApiSlice.endpoints.deletePaymentMethod).toBe('object')
    expect(typeof paymentMethodsApiSlice.endpoints.restorePaymentMethod).toBe('object')
    expect(typeof paymentMethodsApiSlice.endpoints.permanentDeletePaymentMethod).toBe('object')
  })
})
```

**Step 2: Run test to verify it fails**

```bash
cd frontend && npx vitest run src/store/api/__tests__/paymentMethodsApi.test.ts
```

Expected: FAIL

**Step 3: Create the RTK slice**

```ts
// frontend/src/store/api/paymentMethodsApi.ts
import { createApi } from '@reduxjs/toolkit/query/react'
import type { PaymentMethodConfig, PaginatedResponse } from '@/types'
import { axiosBaseQuery } from './baseQuery'
import { normalizePaginated, normalizeSingle } from './normalizers'

const BASE_URL = '/settings/payment-methods'

export const paymentMethodsApiSlice = createApi({
  reducerPath: 'paymentMethodsApi',
  baseQuery: axiosBaseQuery(),
  tagTypes: ['PaymentMethod', 'DeletedPaymentMethod'],
  endpoints: (builder) => ({
    getPaymentMethods: builder.query<PaginatedResponse<PaymentMethodConfig>, Record<string, unknown> | undefined>({
      query: (params) => ({ url: BASE_URL, params: params ?? {} }),
      transformResponse: normalizePaginated<PaymentMethodConfig>,
      providesTags: ['PaymentMethod'],
    }),
    getActivePaymentMethods: builder.query<PaymentMethodConfig[], void>({
      query: () => ({ url: `${BASE_URL}/active` }),
      transformResponse: (response: any) => (Array.isArray(response) ? response : response?.data ?? []),
      providesTags: ['PaymentMethod'],
    }),
    getActivePaymentMethodsForPurchases: builder.query<PaymentMethodConfig[], void>({
      query: () => ({ url: `${BASE_URL}/active`, params: { forPurchases: true } }),
      transformResponse: (response: any) => (Array.isArray(response) ? response : response?.data ?? []),
      providesTags: ['PaymentMethod'],
    }),
    getPaymentMethod: builder.query<PaymentMethodConfig, string>({
      query: (id) => ({ url: `${BASE_URL}/${id}` }),
      transformResponse: normalizeSingle<PaymentMethodConfig>,
      providesTags: (_result, _error, id) => [{ type: 'PaymentMethod', id }],
    }),
    getDeletedPaymentMethods: builder.query<PaymentMethodConfig[], void>({
      query: () => ({ url: `${BASE_URL}/deleted` }),
      transformResponse: (response: any) => (Array.isArray(response) ? response : response?.data ?? []),
      providesTags: ['DeletedPaymentMethod'],
    }),
    createPaymentMethod: builder.mutation<PaymentMethodConfig, Partial<PaymentMethodConfig>>({
      query: (data) => ({ url: BASE_URL, method: 'POST', data }),
      transformResponse: normalizeSingle<PaymentMethodConfig>,
      invalidatesTags: ['PaymentMethod'],
    }),
    updatePaymentMethod: builder.mutation<PaymentMethodConfig, { id: string; data: Partial<PaymentMethodConfig> }>({
      query: ({ id, data }) => ({ url: `${BASE_URL}/${id}`, method: 'PATCH', data }),
      transformResponse: normalizeSingle<PaymentMethodConfig>,
      invalidatesTags: ['PaymentMethod'],
    }),
    deletePaymentMethod: builder.mutation<void, string>({
      query: (id) => ({ url: `${BASE_URL}/${id}`, method: 'DELETE' }),
      invalidatesTags: ['PaymentMethod', 'DeletedPaymentMethod'],
    }),
    restorePaymentMethod: builder.mutation<void, string>({
      query: (id) => ({ url: `${BASE_URL}/${id}/restore`, method: 'POST' }),
      invalidatesTags: ['PaymentMethod', 'DeletedPaymentMethod'],
    }),
    permanentDeletePaymentMethod: builder.mutation<void, string>({
      query: (id) => ({ url: `${BASE_URL}/${id}/permanent`, method: 'DELETE' }),
      invalidatesTags: ['DeletedPaymentMethod'],
    }),
  }),
})

export const {
  useGetPaymentMethodsQuery,
  useGetActivePaymentMethodsQuery,
  useGetActivePaymentMethodsForPurchasesQuery,
  useGetPaymentMethodQuery,
  useGetDeletedPaymentMethodsQuery,
  useCreatePaymentMethodMutation,
  useUpdatePaymentMethodMutation,
  useDeletePaymentMethodMutation,
  useRestorePaymentMethodMutation,
  usePermanentDeletePaymentMethodMutation,
} = paymentMethodsApiSlice
```

**Step 4: Run test to verify it passes**

```bash
cd frontend && npx vitest run src/store/api/__tests__/paymentMethodsApi.test.ts
```

Expected: PASS

**Step 5: Register in store**

In `frontend/src/store/index.ts`:
- Add import: `import { paymentMethodsApiSlice } from './api/paymentMethodsApi'`
- Add to `rootReducer`: `[paymentMethodsApiSlice.reducerPath]: paymentMethodsApiSlice.reducer,`
- Add to middleware: `paymentMethodsApiSlice.middleware as any,`

**Step 6: Commit**

```bash
git add frontend/src/store/api/paymentMethodsApi.ts frontend/src/store/api/__tests__/paymentMethodsApi.test.ts frontend/src/store/index.ts
git commit -m "feat: add paymentMethodsApi RTK Query slice"
```

---

## Task 4: Migrate Settings Pages

**Files to modify:**
- `frontend/src/pages/settings/CompanySettingsPage.tsx`
- `frontend/src/pages/settings/RegionalSettingsPage.tsx`
- `frontend/src/pages/settings/PriceCostingPage.tsx`
- `frontend/src/pages/settings/DocumentNumbersPage.tsx`
- `frontend/src/pages/settings/PrintSettings/GeneralTab.tsx`
- `frontend/src/pages/settings/PrintSettingsPage.tsx`
- `frontend/src/hooks/useCurrency.ts`
- `frontend/src/hooks/useRegionalSettings.ts`

**Pattern for each file:**

Replace:
```ts
import { settingsApi } from '@/services/settingsApi'
```
With (pick only the hooks you need per file):
```ts
import {
  useGetCompanySettingsQuery,
  useUpdateCompanySettingsMutation,
  useUploadLogoMutation,
  useDeleteLogoMutation,
} from '@/store/api/settingsApi'
```

Replace `useEffect + settingsApi.getXxx()` with the query hook:
```tsx
// Before
const [settings, setSettings] = useState(null)
useEffect(() => { settingsApi.getCompanySettings().then(setSettings) }, [])

// After
const { data: settings, isLoading } = useGetCompanySettingsQuery()
```

Replace async save calls with mutation hooks:
```tsx
// Before
await settingsApi.updateCompanySettings(form)

// After
const [updateSettings] = useUpdateCompanySettingsMutation()
await updateSettings(form).unwrap()
```

**For `GeneralTab.tsx` and `PrintSettingsPage.tsx`** — also replace `printSettingsApi` imports:
```ts
import { useGetPrintSettingsQuery, useUpdatePrintSettingsMutation, useImportFromCompanyMutation, useUploadPrintLogoMutation } from '@/store/api/printSettingsApi'
```

**For `DocumentNumbersPage.tsx`** — the `DocumentNumberConfig` type is now exported from `@/store/api/settingsApi`, update the import:
```ts
import { useGetDocumentNumberSettingsQuery, useUpdateDocumentNumberSettingsMutation } from '@/store/api/settingsApi'
import type { DocumentNumberConfig } from '@/store/api/settingsApi'
```

**For `useCurrency.ts`** — replace with `useGetDefaultCurrencyQuery`:
```ts
import { useGetDefaultCurrencyQuery } from '@/store/api/settingsApi'
export function useCurrency() {
  const { data } = useGetDefaultCurrencyQuery()
  return data?.currency ?? 'USD'
}
```

**For `useRegionalSettings.ts`** — replace with `useGetPriceCostingSettingsQuery`:
```ts
import { useGetPriceCostingSettingsQuery } from '@/store/api/settingsApi'
```

**Step: Run TypeScript check after all edits in this group**

```bash
cd frontend && npm run type-check
```

Expected: No errors for the modified files.

**Step: Commit**

```bash
git add frontend/src/pages/settings/ frontend/src/hooks/useCurrency.ts frontend/src/hooks/useRegionalSettings.ts
git commit -m "refactor: migrate settings pages and hooks to RTK Query"
```

---

## Task 5: Migrate Print Components

**Files to modify:**
- `frontend/src/components/print/GRNPrint.tsx`
- `frontend/src/components/print/InvoicePrint.tsx`
- `frontend/src/components/print/PaymentReceiptPrint.tsx`
- `frontend/src/components/print/PurchaseOrderPrint.tsx`
- `frontend/src/components/print/SalesOrderPrint.tsx`
- `frontend/src/components/print/VendorPaymentPrint.tsx`

All 6 print components fetch print settings on mount. Replace with:

```ts
import { useGetPrintSettingsQuery } from '@/store/api/printSettingsApi'
// Inside component:
const { data: printSettings } = useGetPrintSettingsQuery()
```

Remove the old `useEffect` + `printSettingsApi.getPrintSettings()` call. Since all 6 components will now share the same RTK cache key, the HTTP request fires only once.

**Step: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

**Step: Commit**

```bash
git add frontend/src/components/print/
git commit -m "refactor: migrate print components to RTK Query printSettingsApi"
```

---

## Task 6: Migrate Payment Method Consumers

**Files to modify:**
- `frontend/src/components/sales/PaymentDialog.tsx`
- `frontend/src/components/purchasing/VendorPaymentDialog.tsx`
- `frontend/src/pages/purchasing/VendorPaymentsPage.tsx`

Replace:
```ts
import { paymentMethodsApi } from '@/services/paymentMethodsApi'
```
With:
```ts
import { useGetActivePaymentMethodsQuery, useGetActivePaymentMethodsForPurchasesQuery } from '@/store/api/paymentMethodsApi'
```

`PaymentDialog.tsx` uses `paymentMethodsApi.getActive()` — replace with `useGetActivePaymentMethodsQuery()`.

`VendorPaymentDialog.tsx` uses `paymentMethodsApi.getActiveForPurchases()` — replace with `useGetActivePaymentMethodsForPurchasesQuery()`.

`VendorPaymentsPage.tsx` — check what methods it uses and pick the appropriate hooks.

**Step: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

**Step: Commit**

```bash
git add frontend/src/components/sales/PaymentDialog.tsx frontend/src/components/purchasing/VendorPaymentDialog.tsx frontend/src/pages/purchasing/VendorPaymentsPage.tsx
git commit -m "refactor: migrate payment method consumers to RTK Query"
```

---

## Task 7: Migrate Backup Components

**Files to modify:**
- `frontend/src/components/backup/BackupList.tsx`
- `frontend/src/components/backup/BackupScheduleList.tsx`
- `frontend/src/components/backup/BackupSettingsPanel.tsx`
- `frontend/src/store/slices/backupSlice.ts`

The RTK backup slice at `store/api/backupApi.ts` already has all endpoints. The legacy `backupService.ts` exports types used by these files.

**Move type imports:** Replace `import type { BackupLog, BackupSchedule } from '@/services/backupService'` with imports from `@/store/api/backupApi`. If the types aren't exported from `backupApi.ts`, add them there.

Check what `backupApi.ts` exports:
```bash
grep "^export interface\|^export type" frontend/src/store/api/backupApi.ts
```

For any missing types, copy them from `backupService.ts` into `backupApi.ts` and export them.

Replace `backupService.methodName()` calls with RTK hooks from `@/store/api/backupApi`.

`BackupSettingsPanel.tsx` uses `getBackupSettings` and `updateBackupSettings` — check if these exist in `backupApi.ts`. If not, add them:
```ts
getBackupSettings: builder.query<BackupSettings, void>({
  query: () => ({ url: '/backup/settings' }),
  transformResponse: normalizeSingle<BackupSettings>,
  providesTags: ['BackupSettings'],
}),
updateBackupSettings: builder.mutation<BackupSettings, UpdateBackupSettingsDto>({
  query: (data) => ({ url: '/backup/settings', method: 'PUT', data }),
  transformResponse: normalizeSingle<BackupSettings>,
  invalidatesTags: ['BackupSettings'],
}),
```

**Step: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

**Step: Commit**

```bash
git add frontend/src/components/backup/ frontend/src/store/slices/backupSlice.ts frontend/src/store/api/backupApi.ts
git commit -m "refactor: migrate backup components to RTK Query"
```

---

## Task 8: Migrate Audit Log Pages

**Files to modify:**
- `frontend/src/pages/audit-logs/AuditLogsPage.tsx`
- `frontend/src/pages/audit-logs/components/AnalyticsTab.tsx`

The RTK audit log slice at `store/api/auditLogApi.ts` already has endpoints. These files import types from `@/services/auditLogApi`.

Replace:
```ts
import type { AuditLogFilters, AuditLogStatistics } from '@/services/auditLogApi'
```
With types from `@/store/api/auditLogApi`. If not exported there, add them.

Check what `auditLogApi.ts` exports:
```bash
grep "^export interface\|^export type" frontend/src/store/api/auditLogApi.ts
```

Replace old `useEffect + auditLogApi.xxx()` calls with RTK hooks.

**Step: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

**Step: Commit**

```bash
git add frontend/src/pages/audit-logs/ frontend/src/store/api/auditLogApi.ts
git commit -m "refactor: migrate audit log pages to RTK Query"
```

---

## Task 9: Migrate Inventory Pages and Components

**Files to modify:**
- `frontend/src/pages/inventory/CreateProductPage.tsx`
- `frontend/src/pages/inventory/StockAdjustmentsPage.tsx`
- `frontend/src/pages/inventory/CreateStockAdjustmentPage.tsx`
- `frontend/src/components/inventory/CategorySelector.tsx`
- `frontend/src/components/inventory/ProductDetailsTab.tsx`
- `frontend/src/components/inventory/MovementHistoryTab.tsx`
- `frontend/src/components/inventory/OrderHistoryTab.tsx`

Each file imports from `@/services/inventoryApi` or `@/services/priceListApi`. The RTK slices `inventoryApiSlice` and `priceListApiSlice` are already complete.

**For each file:**
1. Remove `import { inventoryApi } from '@/services/inventoryApi'` (or `priceListApi`)
2. Import RTK hooks: e.g. `import { useGetProductsQuery, useUpdateProductMutation } from '@/store/api/inventoryApi'`
3. Replace `useEffect + api.method()` with query hook
4. Replace `await api.method()` in handlers with `const [mutate] = useMutation(); await mutate(args).unwrap()`

**For `InventorySummaryReport.tsx`** — this uses `ApiService.get()` directly for report endpoints not in the RTK slice. Keep using `api` from `@/services/api` for these one-off report calls (the raw axios instance is acceptable for non-CRUD report fetches). Only remove the `inventoryApi` import; keep the `ApiService` import if it's used for report downloads.

**Step: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

**Step: Commit**

```bash
git add frontend/src/pages/inventory/ frontend/src/components/inventory/
git commit -m "refactor: migrate inventory pages and components to RTK Query"
```

---

## Task 10: Migrate Sales Pages and Hooks

**Files to modify:**
- `frontend/src/pages/sales/CreateSalesOrderPage.tsx`
- `frontend/src/pages/sales/CustomersPage.tsx`
- `frontend/src/pages/sales/CustomerProfilePage.tsx`
- `frontend/src/pages/sales/PaymentsPage.tsx`
- `frontend/src/pages/sales/SalesPage.tsx`
- `frontend/src/pages/sales/SalesOrderSummary.tsx`
- `frontend/src/pages/sales/hooks/useOrdersActions.ts`
- `frontend/src/pages/sales/hooks/useOrdersSelection.ts`
- `frontend/src/pages/sales/hooks/useInvoicesSelection.ts`
- `frontend/src/pages/sales/CustomerPaymentSummary.tsx`
- `frontend/src/pages/sales/CustomerPaymentDetails.tsx`
- `frontend/src/pages/sales/CustomerPaymentByOrder.tsx`
- `frontend/src/pages/sales/CustomerOrderHistory.tsx`
- `frontend/src/pages/sales/SalesByProductSummary.tsx`
- `frontend/src/pages/sales/SalesByProductDetails.tsx`
- `frontend/src/pages/sales/SalesOrderProfitReport.tsx`
- `frontend/src/pages/sales/ProductCustomerReport.tsx`

Available RTK hooks from `@/store/api/salesApi`:
- `useGetCustomersQuery`, `useGetCustomerQuery`, `useCreateCustomerMutation`, `useUpdateCustomerMutation`, `useDeleteCustomerMutation`
- `useGetOrdersQuery` (note: RTK may use `getSalesOrders` — check the actual endpoint name in `salesApi.ts`)
- `useGetPaymentsQuery`, `useCreatePaymentMutation`
- `useGetInvoicesQuery`
- `useCreateSalesOrderMutation`, `useUpdateSalesOrderMutation`
- `useRecordOrderPaymentsMutation`, `useDuplicateSalesOrderMutation`, `useUnpaySalesOrderMutation`

**For report pages** (`SalesOrderSummary`, `SalesByProductSummary`, `CustomerPaymentSummary`, etc.) that call `salesApi.getSalesReport()`, `salesApi.getSalesAnalytics()`, `salesApi.getTopCustomersReport()`:
- These report endpoints are NOT in the RTK slice. Keep importing `api` from `@/services/api` for these calls.
- Remove only the `import { salesApi } from '@/services/salesApi'` line and replace `salesApi.xxx()` with `api.get(url, { params })` using the raw axios instance.

**Check RTK endpoint names** before editing — the hook names are derived from the builder key:
```bash
grep "builder\." frontend/src/store/api/salesApi.ts | grep -o "[a-zA-Z]*: builder" | sed 's/: builder//'
```

**Step: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

**Step: Commit**

```bash
git add frontend/src/pages/sales/
git commit -m "refactor: migrate sales pages and hooks to RTK Query"
```

---

## Task 11: Migrate Purchasing Pages and Hooks

**Files to modify:**
- `frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx`
- `frontend/src/pages/purchasing/GoodsReceivedPage.tsx`
- `frontend/src/pages/purchasing/SuppliersPage.tsx`
- `frontend/src/pages/purchasing/PurchasingPage.tsx`
- `frontend/src/pages/purchasing/VendorPaymentsPage.tsx` (already partially migrated)
- `frontend/src/pages/purchasing/hooks/usePurchaseOrdersSelection.ts`
- `frontend/src/pages/purchasing/PurchaseOrderSummary.tsx`
- `frontend/src/pages/purchasing/PurchaseOrderDetailsReport.tsx`
- `frontend/src/pages/purchasing/PurchaseOrderStatusReport.tsx`
- `frontend/src/pages/purchasing/VendorPaymentDetailsReport.tsx`
- `frontend/src/pages/purchasing/VendorProductListReport.tsx`

Available RTK hooks from `@/store/api/purchasingApi`:
- `useGetSuppliersQuery`, `useGetSupplierQuery`, `useCreateSupplierMutation`, `useUpdateSupplierMutation`, `useDeleteSupplierMutation`
- `useGetPurchaseOrdersQuery`, `useGetPurchaseOrderQuery`, `useCreatePurchaseOrderMutation`, `useUpdatePurchaseOrderMutation`
- `useGetGoodsReceivedNotesQuery`, `useGetVendorPaymentsQuery`
- `useReceiveGoodsMutation`, `useReturnGoodsMutation`
- `useRecordOrderPaymentsMutation`

For report pages using `ApiService.get()` for non-CRUD report endpoints, keep using `api` from `@/services/api`.

**Step: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

**Step: Commit**

```bash
git add frontend/src/pages/purchasing/
git commit -m "refactor: migrate purchasing pages and hooks to RTK Query"
```

---

## Task 12: Migrate Price List and Inventory Report Pages

**Files to modify:**
- `frontend/src/pages/inventory/PriceListReport.tsx`
- `frontend/src/pages/inventory/MovementSummaryReport.tsx`
- `frontend/src/pages/inventory/HistoricalInventoryReport.tsx`
- `frontend/src/pages/inventory/ProductCostReport.tsx`

These use `@/services/priceListApi` and `@/services/inventoryApi` or `@/services/api`. The RTK slice `priceListApiSlice` is already complete.

Check available price list hooks:
```bash
grep "^export const {" -A 30 frontend/src/store/api/priceListApi.ts
```

Replace price list service calls with RTK hooks. For direct `ApiService.get()` calls to report-only endpoints not in the RTK slice, keep using `api` from `@/services/api`.

**Step: Run TypeScript check**

```bash
cd frontend && npm run type-check
```

**Step: Commit**

```bash
git add frontend/src/pages/inventory/PriceListReport.tsx frontend/src/pages/inventory/MovementSummaryReport.tsx frontend/src/pages/inventory/HistoricalInventoryReport.tsx frontend/src/pages/inventory/ProductCostReport.tsx
git commit -m "refactor: migrate inventory report pages to RTK Query"
```

---

## Task 13: Migrate `utils/exportReport.ts`

**File to modify:** `frontend/src/utils/exportReport.ts`

This utility imports `api` (the raw axios instance) from `@/services/api` to do file downloads. This is acceptable — keep it as-is. The import is `import api from '@/services/api'` which uses the main configured axios instance, not a legacy service class.

No change needed unless the file imports a service class method. Verify:
```bash
grep "from.*@/services/" frontend/src/utils/exportReport.ts
```

If it only imports the axios `api` default export, skip this file.

---

## Task 14: Delete Legacy Service Files

**Only delete after ALL consumer migrations are verified.**

**Step 1: Verify no imports remain**

```bash
grep -r "from.*@/services/settingsApi\|from.*@/services/printSettingsApi\|from.*@/services/paymentMethodsApi\|from.*@/services/inventoryApi\|from.*@/services/salesApi\|from.*@/services/purchasingApi\|from.*@/services/backupService\|from.*@/services/auditLogApi\|from.*@/services/priceListApi" \
  --include="*.ts" --include="*.tsx" \
  frontend/src/ | grep -v "services/" | grep -v "__tests__"
```

Expected: No output.

**Step 2: Delete files that are now fully replaced**

```bash
rm frontend/src/services/settingsApi.ts
rm frontend/src/services/printSettingsApi.ts
rm frontend/src/services/paymentMethodsApi.ts
rm frontend/src/services/inventoryApi.ts
rm frontend/src/services/salesApi.ts
rm frontend/src/services/purchasingApi.ts
rm frontend/src/services/backupService.ts
rm frontend/src/services/auditLogApi.ts
rm frontend/src/services/priceListApi.ts
```

**Keep:**
- `frontend/src/services/api.ts` — the base axios instance, still used by `baseQuery.ts`, report pages, and `authApi.ts`
- `frontend/src/services/authApi.ts` — intentionally excluded from RTK migration

**Step 3: Run full test suite**

```bash
cd frontend && npm run test
```

Expected: All tests pass.

**Step 4: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: No errors.

**Step 5: Commit**

```bash
git add -A frontend/src/services/
git commit -m "refactor: delete legacy service files replaced by RTK Query slices"
```

---

## Task 15: Final Verification

**Step 1: Run full frontend test suite**

```bash
cd frontend && npm run test
```

Expected: All tests pass.

**Step 2: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: Zero errors.

**Step 3: Lint**

```bash
cd frontend && npm run lint
```

Expected: No errors.

**Step 4: Verify no remaining legacy service imports**

```bash
grep -r "from.*@/services/" --include="*.ts" --include="*.tsx" frontend/src/ | grep -v "services/api\|services/authApi\|__tests__"
```

Expected: No output (only `api.ts` and `authApi.ts` are allowed to remain).

**Step 5: Final commit**

```bash
git commit --allow-empty -m "refactor: complete RTK Query migration"
```
