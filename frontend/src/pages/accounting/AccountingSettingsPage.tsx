import { useEffect } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Grid,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from '@mui/material'
import { Controller, useForm } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'

import PageHeader from '@/components/common/PageHeader'
import { useNotification } from '@/hooks/useNotification'
import {
  useGetAccountsQuery,
  useGetAccountingSettingsQuery,
  useUpdateAccountingSettingsMutation,
} from '@/store/api/accountingApi'
import type { Account, AccountType } from '@/types'

interface FormValues {
  cashAccountId: string
  bankAccountId: string
  inventoryAccountId: string
  supplierDepositAccountId: string
  customerDepositAccountId: string
  openingBalanceEquityAccountId: string
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
  { name: 'cogsAccountId', label: 'COGS Account', accountType: 'Expense' },
]

const SYSTEM_FIELDS: SectionField[] = [
  { name: 'openingBalanceEquityAccountId', label: 'Opening Balance Equity Account', accountType: 'Equity' },
  { name: 'defaultExpenseAccountId', label: 'Default Expense Account', accountType: 'Expense' },
]

interface SectionCardProps {
  title: string
  fields: SectionField[]
  accounts: Account[]
  control: any
  errors: Record<string, any>
}

function SectionCard({ title, fields, accounts, control, errors }: SectionCardProps) {
  return (
    <Paper sx={{ p: 4, mb: 3 }}>
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 3 }}>
        {title}
      </Typography>
      <Grid container spacing={3}>
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
                    fullWidth
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
    </Paper>
  )
}

export default function AccountingSettingsPage() {
  const { showSuccess, showError } = useNotification()

  const { data: settings, isLoading: settingsLoading, error: settingsError } =
    useGetAccountingSettingsQuery()

  const { data: accountsResponse, isLoading: accountsLoading } = useGetAccountsQuery({
    postableOnly: true,
    activeOnly: true,
  } as Record<string, unknown>)

  const [updateSettings, { isLoading: isSaving }] = useUpdateAccountingSettingsMutation()

  const accounts = accountsResponse?.data ?? []
  const loading = settingsLoading || accountsLoading

  const {
    control,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<FormValues>({
    resolver: yupResolver(schema) as any,
    defaultValues: {
      cashAccountId: '',
      bankAccountId: '',
      inventoryAccountId: '',
      supplierDepositAccountId: '',
      customerDepositAccountId: '',
      openingBalanceEquityAccountId: '',
      salesRevenueAccountId: '',
      cogsAccountId: '',
      defaultExpenseAccountId: '',
    },
  })

  useEffect(() => {
    if (settings) {
      setValue('cashAccountId', settings.cashAccountId)
      setValue('bankAccountId', settings.bankAccountId)
      setValue('inventoryAccountId', settings.inventoryAccountId)
      setValue('supplierDepositAccountId', settings.supplierDepositAccountId)
      setValue('customerDepositAccountId', settings.customerDepositAccountId)
      setValue('openingBalanceEquityAccountId', settings.openingBalanceEquityAccountId)
      setValue('salesRevenueAccountId', settings.salesRevenueAccountId)
      setValue('cogsAccountId', settings.cogsAccountId)
      setValue('defaultExpenseAccountId', settings.defaultExpenseAccountId)
    }
  }, [settings, setValue])

  const onSubmit = async (data: FormValues) => {
    try {
      await updateSettings(data).unwrap()
      showSuccess('Accounting settings saved successfully.')
    } catch (err: any) {
      showError(err?.data?.message ?? err.message ?? 'Failed to save accounting settings')
    }
  }

  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '400px',
        }}
      >
        <CircularProgress />
      </Box>
    )
  }

  const error = settingsError
    ? (settingsError as any)?.message || 'Failed to load settings.'
    : null

  return (
    <Box sx={{ p: 3 }}>
      <PageHeader
        title="Accounting Settings"
        subtitle="Configure default accounts used by the accounting system."
      />
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      <form onSubmit={handleSubmit(onSubmit)}>
        <SectionCard
          title="Payment"
          fields={PAYMENT_FIELDS}
          accounts={accounts}
          control={control}
          errors={errors}
        />
        <SectionCard
          title="Sales"
          fields={SALES_FIELDS}
          accounts={accounts}
          control={control}
          errors={errors}
        />
        <SectionCard
          title="Inventory & Purchasing"
          fields={INVENTORY_PURCHASING_FIELDS}
          accounts={accounts}
          control={control}
          errors={errors}
        />
        <SectionCard
          title="System"
          fields={SYSTEM_FIELDS}
          accounts={accounts}
          control={control}
          errors={errors}
        />
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            size="large"
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </Box>
      </form>
    </Box>
  )
}
