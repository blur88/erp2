import { useEffect } from 'react'
import {
  Alert,
  Box,
  Button,
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
import { useAppSelector } from '@/hooks/useRedux'
import {
  useGetAccountsQuery,
  useGetAccountingSettingsQuery,
  useUpdateAccountingSettingsMutation,
} from '@/store/api/accountingApi'
import type { AccountingSettings } from '@/types'

import DefaultAccountsSection from './DefaultAccountsSection'
import type { FormValues } from './DefaultAccountsSection'
import FormBMappingSection from './FormBMappingSection'

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

  const [updateSettings, { isLoading: isSaving }] = useUpdateAccountingSettingsMutation()

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
    formState: { errors, isDirty },
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

  useEffect(() => {
    if (settings) {
      reset(toFormValues(settings))
    }
  }, [settings, reset])

  const onSubmit = async (data: FormValues) => {
    try {
      await updateSettings(data).unwrap()
      reset(data)
      showSuccess('Accounting settings saved successfully.')
    } catch (err: any) {
      showError(err?.data?.message ?? err.message ?? 'Failed to save accounting settings')
    }
  }

  return (
    <GenericOverviewPage>
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
          <form onSubmit={handleSubmit(onSubmit)}>
            <DefaultAccountsSection accounts={accounts} control={control} errors={errors} disabled={!isAdmin} />

            {isAdmin ? (
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 2 }}>
                <Button
                  variant="outlined"
                  size="large"
                  onClick={() => reset()}
                  disabled={!isDirty || isSaving}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  size="large"
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </Button>
              </Box>
            ) : (
              <Alert severity="info" sx={{ mt: 2 }}>
                Account mappings are read-only. Only an administrator can change them.
              </Alert>
            )}
          </form>
        )}

        <Typography variant="h6" sx={{ fontWeight: 600, pt: 1 }}>
          Form B Tax Filing
        </Typography>

        <FormBMappingSection isAdmin={isAdmin} />
      </Stack>
    </GenericOverviewPage>
  )
}
