import { useEffect } from 'react'
import {
  Alert,
  Box,
  Button,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { Controller, useForm } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'

import GenericOverviewPage from '@/components/common/GenericOverviewPage'
import PageHeader from '@/components/common/PageHeader'
import PageSection from '@/components/common/PageSection'
import { ListSkeleton } from '@/components/common/ListSkeleton'
import { useNotification } from '@/hooks/useNotification'
import { useAppSelector } from '@/hooks/useRedux'
import {
  useGetAccountsQuery,
  useGetAccountingSettingsQuery,
  useUpdateAccountingSettingsMutation,
} from '@/store/api/accountingApi'
import type { Account, AccountType, AccountingSettings } from '@/types'

import FormBMappingSection from './FormBMappingSection'

interface FormValues {
  cashAccountId: string
  bankAccountId: string
  inventoryAccountId: string
  supplierDepositAccountId: string
  customerDepositAccountId: string
  openingBalanceEquityAccountId: string
  ownerCapitalAccountId: string
  ownerDrawingsAccountId: string
  salesRevenueAccountId: string
  cogsAccountId: string
  defaultExpenseAccountId: string
}

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

interface SectionField {
  name: keyof FormValues
  label: string
  accountType: AccountType
}

const PAYMENT_FIELDS: SectionField[] = [
  { name: 'cashAccountId', label: 'Cash Account', accountType: 'Asset' },
  { name: 'bankAccountId', label: 'Bank Account', accountType: 'Asset' },
]

const SALES_FIELDS: SectionField[] = [
  { name: 'customerDepositAccountId', label: 'Customer Deposit Account', accountType: 'Liability' },
  { name: 'salesRevenueAccountId', label: 'Sales Revenue Account', accountType: 'Income' },
]

const INVENTORY_PURCHASING_FIELDS: SectionField[] = [
  { name: 'inventoryAccountId', label: 'Inventory Account', accountType: 'Asset' },
  { name: 'supplierDepositAccountId', label: 'Supplier Deposit Account', accountType: 'Asset' },
]

/*
 * The two Expense-type accounts, together.
 *
 * They are the pair the Form B section below cares about, and the distinction
 * between them is what the Form B mapping rules turn on: COGS (and everything
 * beneath it) is EXCLUDED from expense mapping because it already reaches Form
 * B through N7, while Default Expense is an ordinary mappable expense. Showing
 * them side by side is what makes that exclusion legible.
 *
 * Consumers: cogsAccountId is read on sales/delivery posting;
 * defaultExpenseAccountId only by postStockAdjustment(), for the expense leg of
 * a stock write-off (accounting-posting.service.ts).
 */
const EXPENSE_FIELDS: SectionField[] = [
  { name: 'cogsAccountId', label: 'COGS Account', accountType: 'Expense' },
  { name: 'defaultExpenseAccountId', label: 'Default Expense Account', accountType: 'Expense' },
]

// Consumed only by the Owner Equity module's postings — capital injections,
// cash/stock drawings, and their refunds.
const OWNER_EQUITY_FIELDS: SectionField[] = [
  { name: 'ownerCapitalAccountId', label: 'Owner Capital Account', accountType: 'Equity' },
  { name: 'ownerDrawingsAccountId', label: 'Owner Drawings Account', accountType: 'Equity' },
]

/*
 * One field on purpose. Opening Balance Equity is used by exactly one posting
 * path — postOpeningBalance(), when an account's opening balance is set — which
 * is a distinct, infrequent setup step rather than day-to-day operation.
 *
 * The section it replaces was "System": a leftover bucket holding three Equity
 * accounts and one Expense account, named after no concept any of them shared.
 */
const SETUP_FIELDS: SectionField[] = [
  { name: 'openingBalanceEquityAccountId', label: 'Opening Balance Equity Account', accountType: 'Equity' },
]

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

interface FieldGridProps {
  fields: SectionField[]
  accounts: Account[]
  control: any
  errors: Record<string, any>
  disabled: boolean
}

function FieldGrid({ fields, accounts, control, errors, disabled }: FieldGridProps) {
  return (
    <Grid container spacing={3} sx={{ p: 3 }}>
      {fields.map((fieldConfig) => {
        const filtered = accounts.filter((a) => a.type === fieldConfig.accountType)
        return (
          <Grid key={fieldConfig.name} size={{ xs: 12, md: 6 }}>
            <Controller
              name={fieldConfig.name}
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  select
                  size="small"
                  fullWidth
                  disabled={disabled}
                  label={fieldConfig.label}
                  error={!!errors[fieldConfig.name]}
                  helperText={errors[fieldConfig.name]?.message || ''}
                >
                  <MenuItem value="">
                    <em>Select {fieldConfig.label}</em>
                  </MenuItem>
                  {filtered.map((account) => (
                    <MenuItem key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </MenuItem>
                  ))}
                </TextField>
              )}
            />
          </Grid>
        )
      })}
    </Grid>
  )
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
            <Stack spacing={3}>
              <PageSection label="Payment">
                <FieldGrid
                  fields={PAYMENT_FIELDS}
                  accounts={accounts}
                  control={control}
                  errors={errors}
                  disabled={!isAdmin}
                />
              </PageSection>

              <PageSection label="Sales">
                <FieldGrid
                  fields={SALES_FIELDS}
                  accounts={accounts}
                  control={control}
                  errors={errors}
                  disabled={!isAdmin}
                />
              </PageSection>

              <PageSection label="Inventory & Purchasing">
                <FieldGrid
                  fields={INVENTORY_PURCHASING_FIELDS}
                  accounts={accounts}
                  control={control}
                  errors={errors}
                  disabled={!isAdmin}
                />
              </PageSection>

              <PageSection label="Expenses">
                <FieldGrid
                  fields={EXPENSE_FIELDS}
                  accounts={accounts}
                  control={control}
                  errors={errors}
                  disabled={!isAdmin}
                />
              </PageSection>

              <PageSection label="Owner Equity">
                <FieldGrid
                  fields={OWNER_EQUITY_FIELDS}
                  accounts={accounts}
                  control={control}
                  errors={errors}
                  disabled={!isAdmin}
                />
              </PageSection>

              <PageSection label="Setup">
                <FieldGrid
                  fields={SETUP_FIELDS}
                  accounts={accounts}
                  control={control}
                  errors={errors}
                  disabled={!isAdmin}
                />
              </PageSection>
            </Stack>

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
