import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Paper,
  Grid,
  TextField,
  Button,
  Divider,
  CircularProgress,
  Alert,
  MenuItem,
} from '@mui/material'
import PageHeader from '@/components/common/PageHeader'
import GenericOverviewPage from '@/components/common/GenericOverviewPage'
import { useForm, Controller, useWatch } from 'react-hook-form'
import * as yup from 'yup'
import { yupResolver } from '@hookform/resolvers/yup'
import { useNotification } from '@/hooks/useNotification'
import {
  useGetRegionalSettingsQuery,
  useUpdateRegionalSettingsMutation,
} from '@/store/api/settingsApi'

interface RegionalFormData {
  currency: string
  dateFormat: string
  timeFormat: string
  numberFormat: string
  timezone: string
  startOfWeek: number
}

const schema = yup.object({
  currency: yup.string().required('Currency is required'),
  dateFormat: yup.string().required('Date format is required'),
  timeFormat: yup.string().required('Time format is required'),
  numberFormat: yup.string().required('Number format is required'),
  timezone: yup.string().required('Timezone is required'),
  startOfWeek: yup.number().oneOf([0, 1]).required('Start of week is required'),
})

const CURRENCIES = [
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'GBP', label: 'GBP - British Pound' },
  { value: 'JPY', label: 'JPY - Japanese Yen' },
  { value: 'AUD', label: 'AUD - Australian Dollar' },
  { value: 'CAD', label: 'CAD - Canadian Dollar' },
  { value: 'CHF', label: 'CHF - Swiss Franc' },
  { value: 'CNY', label: 'CNY - Chinese Yuan' },
  { value: 'INR', label: 'INR - Indian Rupee' },
  { value: 'SGD', label: 'SGD - Singapore Dollar' },
  { value: 'MYR', label: 'MYR - Malaysian Ringgit' },
  { value: 'THB', label: 'THB - Thai Baht' },
]

const DATE_FORMATS = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY (e.g. 22/02/2026)' },
  { value: 'DD-MM-YYYY', label: 'DD-MM-YYYY (e.g. 22-02-2026)' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY (e.g. 02/22/2026)' },
  { value: 'MM-DD-YYYY', label: 'MM-DD-YYYY (e.g. 02-22-2026)' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (e.g. 2026-02-22)' },
  { value: 'DD MMM YYYY', label: 'DD MMM YYYY (e.g. 22 Feb 2026)' },
  { value: 'DD MMMM YYYY', label: 'DD MMMM YYYY (e.g. 22 February 2026)' },
  { value: 'MMM DD, YYYY', label: 'MMM DD, YYYY (e.g. Feb 22, 2026)' },
  { value: 'MMMM DD, YYYY', label: 'MMMM DD, YYYY (e.g. February 22, 2026)' },
]

const TIME_FORMATS = [
  { value: '24h', label: '24-hour (e.g. 14:30)' },
  { value: '12h', label: '12-hour (e.g. 2:30 PM)' },
]

const NUMBER_FORMATS = [
  { value: '1,234.56', label: '1,234.56 (comma thousands, dot decimal)' },
  { value: '1234.56', label: '1234.56 (no thousands separator)' },
]

const TIMEZONES = [
  { value: 'UTC', label: 'UTC' },
  { value: 'Asia/Kuala_Lumpur', label: 'Asia/Kuala_Lumpur (UTC+8)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (UTC+8)' },
  { value: 'Asia/Jakarta', label: 'Asia/Jakarta (UTC+7)' },
  { value: 'Asia/Bangkok', label: 'Asia/Bangkok (UTC+7)' },
  { value: 'Asia/Manila', label: 'Asia/Manila (UTC+8)' },
  { value: 'Asia/Hong_Kong', label: 'Asia/Hong_Kong (UTC+8)' },
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai (UTC+8)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (UTC+9)' },
  { value: 'Asia/Seoul', label: 'Asia/Seoul (UTC+9)' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (UTC+5:30)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (UTC+4)' },
  { value: 'Asia/Riyadh', label: 'Asia/Riyadh (UTC+3)' },
  { value: 'Europe/London', label: 'Europe/London (UTC+0/+1)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (UTC+1/+2)' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin (UTC+1/+2)' },
  { value: 'Europe/Moscow', label: 'Europe/Moscow (UTC+3)' },
  { value: 'Africa/Cairo', label: 'Africa/Cairo (UTC+2)' },
  { value: 'Africa/Johannesburg', label: 'Africa/Johannesburg (UTC+2)' },
  { value: 'America/New_York', label: 'America/New_York (UTC-5/-4)' },
  { value: 'America/Chicago', label: 'America/Chicago (UTC-6/-5)' },
  { value: 'America/Denver', label: 'America/Denver (UTC-7/-6)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (UTC-8/-7)' },
  { value: 'America/Sao_Paulo', label: 'America/Sao_Paulo (UTC-3)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (UTC+10/+11)' },
  { value: 'Australia/Melbourne', label: 'Australia/Melbourne (UTC+10/+11)' },
  { value: 'Pacific/Auckland', label: 'Pacific/Auckland (UTC+12/+13)' },
]

const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const MONTHS_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/** Generate a live preview string based on current form values */
const buildPreview = (dateFormat: string, timeFormat: string, numberFormat: string, currency: string): string => {
  const now = new Date(2026, 1, 22, 14, 30) // Fixed example date: 22 Feb 2026, 14:30

  const day = String(now.getDate()).padStart(2, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const year = String(now.getFullYear())
  const monthFull = MONTHS_FULL[now.getMonth()]
  const monthShort = MONTHS_SHORT[now.getMonth()]

  const datePart = dateFormat
    .replace('MMMM', monthFull)
    .replace('MMM', monthShort)
    .replace('MM', month)
    .replace('DD', day)
    .replace('YYYY', year)

  const timePart = timeFormat === '12h' ? '2:30 PM' : '14:30'
  const numPart = numberFormat === '1234.56' ? '1234.56' : '1,234.56'

  return `${datePart} ${timePart}  |  ${currency} ${numPart}`
}

const RegionalSettingsPage: React.FC = () => {
  const { showSuccess, showError } = useNotification()
  const [submitting, setSubmitting] = useState(false)

  const { data: settingsData, isLoading: loading, error: fetchError, refetch } = useGetRegionalSettingsQuery()
  const [updateRegionalSettings] = useUpdateRegionalSettingsMutation()

  const { control, handleSubmit, formState: { errors }, setValue } = useForm<RegionalFormData>({
    resolver: yupResolver(schema) as any,
    defaultValues: {
      currency: 'MYR',
      dateFormat: 'DD/MM/YYYY',
      timeFormat: '24h',
      numberFormat: '1,234.56',
      timezone: 'Asia/Kuala_Lumpur',
      startOfWeek: 1,
    },
  })

  const watchedValues = useWatch({ control })

  useEffect(() => {
    if (settingsData) {
      const s = settingsData as any
      setValue('currency', s.currency || 'MYR')
      setValue('dateFormat', s.dateFormat || 'DD/MM/YYYY')
      setValue('timeFormat', s.timeFormat || '24h')
      setValue('numberFormat', s.numberFormat || '1,234.56')
      setValue('timezone', s.timezone || 'Asia/Kuala_Lumpur')
      setValue('startOfWeek', s.startOfWeek ?? 1)
    }
  }, [settingsData, setValue])

  const fetchSettings = () => {
    refetch()
  }

  const onSubmit = async (data: RegionalFormData) => {
    try {
      setSubmitting(true)
      await updateRegionalSettings(data).unwrap()

      // Update localStorage immediately so formatters reflect new values
      localStorage.setItem('defaultCurrency', data.currency)
      localStorage.setItem('dateFormat', data.dateFormat)
      localStorage.setItem('timeFormat', data.timeFormat)
      localStorage.setItem('numberFormat', data.numberFormat)
      localStorage.setItem('timezone', data.timezone)
      localStorage.setItem('startOfWeek', String(data.startOfWeek))

      // Notify currency-aware components
      window.dispatchEvent(new Event('currencyChanged'))

      showSuccess('Regional settings saved successfully.')
      refetch()
    } catch (err: any) {
      const msg = String(err.response?.data?.message || err.message || 'Failed to save settings')
      showError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const error = fetchError ? String((fetchError as any)?.message || 'Failed to load settings') : null

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    )
  }

  const preview = buildPreview(
    watchedValues.dateFormat || 'DD/MM/YYYY',
    watchedValues.timeFormat || '24h',
    watchedValues.numberFormat || '1,234.56',
    watchedValues.currency || 'MYR',
  )

  return (
    <GenericOverviewPage>
      <PageHeader title="Regional Settings" subtitle="Configure locale, currency, date format, and timezone preferences" />
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      <Paper sx={{ p: 4 }}>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Grid container spacing={3}>

            {/* Currency */}
            <Grid size={12}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Currency</Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="currency"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    select
                    label="Default Currency"
                    fullWidth
                    size="small"
                    required
                    error={!!errors.currency}
                    helperText={errors.currency?.message || 'Select the default currency for your business'}
                  >
                    {CURRENCIES.map(opt => (
                      <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                    ))}
                  </TextField>
                )}
              />
            </Grid>

            <Grid size={12}><Divider sx={{ my: 1 }} /></Grid>

            {/* Date & Time Format */}
            <Grid size={12}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Date & Time Format</Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="dateFormat"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    select
                    label="Date Format"
                    fullWidth
                    size="small"
                    required
                    error={!!errors.dateFormat}
                    helperText={errors.dateFormat?.message || 'How dates are displayed throughout the system'}
                  >
                    {DATE_FORMATS.map(opt => (
                      <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                    ))}
                  </TextField>
                )}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="timeFormat"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    select
                    label="Time Format"
                    fullWidth
                    size="small"
                    required
                    error={!!errors.timeFormat}
                    helperText={errors.timeFormat?.message || 'How times are displayed throughout the system'}
                  >
                    {TIME_FORMATS.map(opt => (
                      <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                    ))}
                  </TextField>
                )}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="startOfWeek"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    select
                    label="Start of Week"
                    fullWidth
                    size="small"
                    required
                    error={!!errors.startOfWeek}
                    helperText={errors.startOfWeek?.message || 'Which day the week starts on'}
                  >
                    <MenuItem value={1}>Monday</MenuItem>
                    <MenuItem value={0}>Sunday</MenuItem>
                  </TextField>
                )}
              />
            </Grid>

            <Grid size={12}><Divider sx={{ my: 1 }} /></Grid>

            {/* Number Format */}
            <Grid size={12}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Number Format</Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="numberFormat"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    select
                    label="Number Format"
                    fullWidth
                    size="small"
                    required
                    error={!!errors.numberFormat}
                    helperText={errors.numberFormat?.message || 'How numbers are displayed throughout the system'}
                  >
                    {NUMBER_FORMATS.map(opt => (
                      <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                    ))}
                  </TextField>
                )}
              />
            </Grid>

            <Grid size={12}><Divider sx={{ my: 1 }} /></Grid>

            {/* Timezone */}
            <Grid size={12}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>Timezone</Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="timezone"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    select
                    label="Timezone"
                    fullWidth
                    size="small"
                    required
                    error={!!errors.timezone}
                    helperText={errors.timezone?.message || 'The timezone used for date-based reports and analytics'}
                  >
                    {TIMEZONES.map(opt => (
                      <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                    ))}
                  </TextField>
                )}
              />
            </Grid>

            <Grid size={12}><Divider sx={{ my: 1 }} /></Grid>

            {/* Live Preview */}
            <Grid size={12}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>Preview</Typography>
              <Paper variant="outlined" sx={{ p: 2, bgcolor: 'action.hover' }}>
                <Typography variant="body1">
                  {preview}
                </Typography>
              </Paper>
              <Typography variant="caption" sx={{
                color: "text.secondary"
              }}>
                This preview shows how dates, times, and numbers will appear across all pages.
              </Typography>
            </Grid>

            {/* Buttons */}
            <Grid size={12}>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 2 }}>
                <Button
                  variant="outlined"
                  onClick={fetchSettings}
                  disabled={submitting}
                  size="large"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  disabled={submitting}
                  size="large"
                >
                  {submitting ? 'Saving...' : 'Save Changes'}
                </Button>
              </Box>
            </Grid>

          </Grid>
        </form>
      </Paper>
    </GenericOverviewPage>
  );
}

export default RegionalSettingsPage
