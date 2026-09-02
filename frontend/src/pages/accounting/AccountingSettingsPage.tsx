import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Stack,
  Typography,
} from '@mui/material'
import { useForm } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'

import GenericOverviewPage from '@/components/common/GenericOverviewPage'
import PageHeader from '@/components/common/PageHeader'
import { ListSkeleton } from '@/components/common/ListSkeleton'
import { useNotification } from '@/hooks/useNotification'
import { useAppSelector, useAppDispatch } from '@/hooks/useRedux'
import {
  useGetAccountsQuery,
  useGetAccountingSettingsQuery,
  useUpdateAccountingSettingsMutation,
  useBulkUpdateFormBMappingsMutation,
  accountingApi,
} from '@/store/api/accountingApi'
import type { AccountingSettings } from '@/types'
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'

import DefaultAccountsSection from './DefaultAccountsSection'
import type { FormValues } from './DefaultAccountsSection'
import FormBMappingSection from './FormBMappingSection'
import { useFormBMappingDraft } from './useFormBMappingDraft'
import SettingsActionBar from './SettingsActionBar'

const schema = yup.object({
  cashAccountId: yup.string().required('Cash account is required'),
  bankAccountId: yup.string().required('Bank account is required'),
  inventoryAccountId: yup.string().required('Inventory account is required'),
  supplierDepositAccountId: yup.string().required('Supplier deposit account is required'),
  customerDepositAccountId: yup.string().required('Customer deposit account is required'),
  openingBalanceEquityAccountId: yup.string().required('Opening balance equity account is required'),
  ownerCapitalAccountId: yup.string().required('Owner capital account is required'),
  ownerDrawingsAccountId: yup.string().required('Owner drawings account is required'),
  salesRevenueAccountId: yup.string().required('Sales revenue account is required'),
  cogsAccountId: yup.string().required('COGS account is required'),
  defaultExpenseAccountId: yup.string().required('Default expense account is required'),
})

function toFormValues(settings: AccountingSettings): FormValues {
  return {
    cashAccountId: settings.cashAccountId,
    bankAccountId: settings.bankAccountId,
    inventoryAccountId: settings.inventoryAccountId,
    supplierDepositAccountId: settings.supplierDepositAccountId,
    customerDepositAccountId: settings.customerDepositAccountId,
    openingBalanceEquityAccountId: settings.openingBalanceEquityAccountId,
    ownerCapitalAccountId: settings.ownerCapitalAccountId,
    ownerDrawingsAccountId: settings.ownerDrawingsAccountId,
    salesRevenueAccountId: settings.salesRevenueAccountId,
    cogsAccountId: settings.cogsAccountId,
    defaultExpenseAccountId: settings.defaultExpenseAccountId,
  }
}

export default function AccountingSettingsPage() {
  const { showSuccess, showError } = useNotification()

  // Every role can read the mappings (#895), but PUT /accounting/settings is
  // admin-only: these decide which GL accounts sales/purchasing auto-post into.
  // Non-admins see the current mappings without a way to save them.
  const isAdmin = useAppSelector((state) => state.auth?.user?.role === 'admin')

  const { data: settings, isLoading: settingsLoading, error: settingsError } =
    useGetAccountingSettingsQuery()

  const {
    data: accountsResponse,
    isLoading: accountsLoading,
    error: accountsError,
  } = useGetAccountsQuery({
    postableOnly: true,
    activeOnly: true,
  } as Record<string, unknown>)

  const [updateSettings] = useUpdateAccountingSettingsMutation()

  const draft = useFormBMappingDraft()
  const [bulkUpdateMappings] = useBulkUpdateFormBMappingsMutation()
  const [isSaving, setIsSaving] = useState(false)
  const [mappingSaveError, setMappingSaveError] = useState<string | null>(null)
  const dispatch = useAppDispatch()

  const accounts = accountsResponse?.data ?? []
  const loading = settingsLoading || accountsLoading
  // The accounts query fills every dropdown, so its failure is just as fatal as
  // the settings one — without it the selects render with no options at all.
  const loadError = settingsError ?? accountsError
  // axiosBaseQuery returns { status, data } with the message in `data`, so read
  // that first; `.message` only covers a raw Error escaping the base query.
  const error = loadError
    ? (loadError as any)?.data || (loadError as any)?.message || 'Failed to load settings.'
    : null

  const {
    control,
    handleSubmit,
    formState: { errors, isDirty: isFormDirty },
    reset,
  } = useForm<FormValues>({
    resolver: yupResolver(schema) as any,
    defaultValues: {
      cashAccountId: '',
      bankAccountId: '',
      inventoryAccountId: '',
      supplierDepositAccountId: '',
      customerDepositAccountId: '',
      openingBalanceEquityAccountId: '',
      ownerCapitalAccountId: '',
      ownerDrawingsAccountId: '',
      salesRevenueAccountId: '',
      cogsAccountId: '',
      defaultExpenseAccountId: '',
    },
  })

  const isDirty = isFormDirty || draft.isDirty
  const { UnsavedChangesDialog } = useUnsavedChangesGuard(isDirty, isSaving)

  useEffect(() => {
    if (settings) {
      reset(toFormValues(settings))
    }
  }, [settings, reset])

  /*
   * Normalizes every error shape this page can see into a string.
   *
   * axiosBaseQuery returns `{ status, data }` with the message in `data` — a
   * string for our own 400s, but an object when Nest's ValidationPipe returns
   * its `message` array. Passing any of those straight into a template literal
   * renders "[object Object]", which tells the user nothing and hides a real
   * validation message.
   */
  const errorMessage = (err: any, fallback: string): string => {
    const raw = err?.data?.message ?? err?.data ?? err?.message
    if (typeof raw === 'string' && raw.trim()) return raw
    if (Array.isArray(raw) && raw.length) return raw.join('; ')
    return fallback
  }

  /*
   * Rejects on BOTH failure modes. The old onSubmit caught the mutation error
   * and notified, so handleSubmit(onSubmit)() resolved even on an API failure —
   * and Promise.allSettled would have classified that as fulfilled.
   */
  const saveDefaultAccounts = () =>
    new Promise<void>((resolve, reject) => {
      let attempted = false
      handleSubmit(async (data) => {
        attempted = true
        try {
          await updateSettings(data).unwrap()
          reset(data)
          resolve()
        } catch (err: any) {
          reject(new Error(errorMessage(err, 'Failed to save accounting settings')))
        }
      })()
        .then(() => {
          // handleSubmit resolves without ever calling the callback when the
          // form is invalid. Silence there would read as a successful save.
          if (!attempted) reject(new Error('Fix the highlighted fields before saving.'))
        })
        // Without this, an unexpected throw from handleSubmit itself leaves
        // the wrapper promise pending forever — and Promise.allSettled would
        // never settle, hanging the save with the buttons disabled.
        .catch(reject)
    })

  const saveMappings = async () => {
    const rows = await bulkUpdateMappings({ mappings: draft.changedItems() })
      .unwrap()
      .catch((err: any) => {
        // axiosBaseQuery returns { status, data } with the message in `data`.
        // Rethrowing the raw object would render as "[object Object]".
        throw new Error(errorMessage(err, 'Unable to save the Form B mappings. Please try again.'))
      })
    /*
     * Write the authoritative response into the cache BEFORE clearing the
     * draft. Tag invalidation refetches asynchronously, so clearing first
     * leaves a window where an empty overlay sits over stale rows — and a
     * failed refetch would leave it stale indefinitely.
     */
    dispatch(
      accountingApi.util.updateQueryData('getFormBMappings', undefined, () => rows),
    )
    draft.reset()
  }

  const handleSave = async () => {
    setIsSaving(true)
    setMappingSaveError(null)

    const jobs: { name: string; run: () => Promise<void> }[] = []
    if (isFormDirty) jobs.push({ name: 'Default Accounts', run: saveDefaultAccounts })
    if (draft.isDirty) jobs.push({ name: 'Form B mappings', run: saveMappings })

    const results = await Promise.allSettled(jobs.map((j) => j.run()))
    setIsSaving(false)

    const failed = jobs.filter((_, i) => results[i].status === 'rejected')
    const succeeded = jobs.filter((_, i) => results[i].status === 'fulfilled')

    const reasonFor = (name: string) => {
      const i = jobs.findIndex((j) => j.name === name)
      const r = results[i]
      return r.status === 'rejected' ? String((r as PromiseRejectedResult).reason?.message ?? (r as PromiseRejectedResult).reason) : ''
    }

    if (failed.some((j) => j.name === 'Form B mappings')) {
      setMappingSaveError(reasonFor('Form B mappings'))
    }

    if (failed.length === 0) {
      showSuccess('Accounting settings saved successfully.')
      return
    }

    if (succeeded.length === 0) {
      showError(failed.map((j) => `${j.name} failed: ${reasonFor(j.name)}`).join(' '))
      return
    }

    // Mixed: name both halves, and say the failed drafts survive for retry.
    showError(
      `${succeeded.map((j) => j.name).join(' and ')} saved. ` +
      `${failed.map((j) => j.name).join(' and ')} failed — your changes are still available to retry.`,
    )
  }

  const handleCancel = () => {
    reset()
    draft.reset()
    setMappingSaveError(null)
  }

  return (
    <GenericOverviewPage>
      <Box sx={{ pb: 2 }}>
        <PageHeader
          title="Accounting Settings"
          subtitle="Configure the default accounts the system posts to, and map accounts to Form B tax filing lines."
        />

        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        <Stack spacing={3}>
          {/*
            Two named groups. Default Accounts drives automatic posting; Form B
            mapping drives a statutory report and nothing else. Keeping them
            visually separate stops a mapping being read as ordinary posting
            configuration.
          */}
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Default Accounts
          </Typography>

          {loading ? (
            <ListSkeleton rows={8} columns={2} />
          ) : error ? null : (
            <DefaultAccountsSection accounts={accounts} control={control} errors={errors} disabled={!isAdmin || isSaving} />
          )}

          {!isAdmin && !loading && !error && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Account mappings are read-only. Only an administrator can change them.
            </Alert>
          )}

          <Typography variant="h6" sx={{ fontWeight: 600, pt: 1 }}>
            Form B Tax Filing
          </Typography>

          <FormBMappingSection isAdmin={isAdmin} disabled={isSaving} draft={draft} saveError={mappingSaveError} />
        </Stack>
      </Box>
      {isAdmin && !loading && !error && <SettingsActionBar isDirty={isDirty} isSaving={isSaving} onCancel={handleCancel} onSave={handleSave} />}
      {UnsavedChangesDialog}
    </GenericOverviewPage>
  )
}
