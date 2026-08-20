import React, { useEffect } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Grid,
  Paper,
  TextField,
  Typography,
} from '@mui/material'
import { Controller, useForm } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import PageHeader from '@/components/common/PageHeader'
import GenericOverviewPage from '@/components/common/GenericOverviewPage'
import { useNotification } from '@/hooks/useNotification'
import {
  useGetRegionalSettingsQuery,
  useUpdateRegionalSettingsMutation,
} from '@/store/api/settingsApi'

interface StockLevelFormData {
  lowStockThreshold: number
}

const schema = yup.object({
  lowStockThreshold: yup
    .number()
    .typeError('Threshold must be a number')
    .integer('Threshold must be a whole number')
    .min(0, 'Threshold must be 0 or greater')
    .required('Low stock threshold is required'),
})

const StockLevelSettingsPage: React.FC = () => {
  const { showSuccess, showError } = useNotification()
  const [submitting, setSubmitting] = React.useState(false)

  const { data: settingsData, isLoading: loading, error: fetchError, refetch } = useGetRegionalSettingsQuery()
  const [updateRegionalSettings] = useUpdateRegionalSettingsMutation()

  const {
    control,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<StockLevelFormData>({
    resolver: yupResolver(schema) as any,
    defaultValues: {
      lowStockThreshold: 10,
    },
  })

  useEffect(() => {
    if (settingsData) {
      setValue('lowStockThreshold', settingsData.lowStockThreshold ?? 10)
    }
  }, [settingsData, setValue])

  const error = fetchError ? ((fetchError as any)?.message || 'Failed to load settings') : null

  const onSubmit = async (data: StockLevelFormData) => {
    try {
      setSubmitting(true)
      await updateRegionalSettings({ lowStockThreshold: data.lowStockThreshold }).unwrap()
      showSuccess('Stock level settings saved successfully.')
      refetch()
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to save settings'
      showError(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = () => {
    refetch()
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <GenericOverviewPage>
      <PageHeader
        title="Stock Level Settings"
        subtitle="Configure thresholds for low stock classification across all products"
      />
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      <Paper sx={{ p: 4 }}>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Grid container spacing={3}>
            <Grid size={12}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Stock Thresholds
              </Typography>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="lowStockThreshold"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Low Stock Threshold"
                    type="number"
                    fullWidth
                    size="small"
                    required
                    slotProps={{ htmlInput: { min: 0, step: 1 } }}
                    error={!!errors.lowStockThreshold}
                    helperText={
                      errors.lowStockThreshold?.message ||
                      'Products with quantity above 0 and at or below this value are considered Low Stock.'
                    }
                  />
                )}
              />
            </Grid>

            <Grid size={12}>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 2 }}>
                <Button
                  variant="outlined"
                  onClick={handleCancel}
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
  )
}

export default StockLevelSettingsPage
