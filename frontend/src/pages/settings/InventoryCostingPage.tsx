import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Paper,
  Grid,
  TextField,
  Button,
  CircularProgress,
  Alert,
  MenuItem,
} from '@mui/material'
import { default as CalculateIcon } from '@mui/icons-material/Calculate'
import { useForm, Controller, useWatch } from 'react-hook-form'
import * as yup from 'yup'
import { yupResolver } from '@hookform/resolvers/yup'
import { useNotification } from '@/hooks/useNotification'
import {
  useGetRegionalSettingsQuery,
  useUpdateRegionalSettingsMutation,
} from '@/store/api/settingsApi'
import { ApiService } from '@/services/api'
import PageHeader from '@/components/common/PageHeader'
import GenericOverviewPage from '@/components/common/GenericOverviewPage'

interface InventoryCostingFormData {
  costingMethod: string
}

const schema = yup.object({
  costingMethod: yup.string().required('Costing method is required'),
})

const COSTING_METHODS = [
  { value: 'AVERAGE', label: 'Average Cost' },
  { value: 'FIFO', label: 'FIFO (First In, First Out)' },
  { value: 'LIFO', label: 'LIFO (Last In, First Out)' },
  { value: 'STANDARD', label: 'Standard Cost' },
]

const InventoryCostingPage: React.FC = () => {
  const { showSuccess, showError } = useNotification()
  const [submitting, setSubmitting] = useState(false)
  const [recalculating, setRecalculating] = useState(false)
  const [savedCostingMethod, setSavedCostingMethod] = useState<string>('')
  const [currentCostingMethod, setCurrentCostingMethod] = useState<string>('')

  const { data: settingsData, isLoading: loading, error: fetchError, refetch } = useGetRegionalSettingsQuery()
  const [updateRegionalSettings] = useUpdateRegionalSettingsMutation()

  const { control, handleSubmit, formState: { errors }, setValue } = useForm<InventoryCostingFormData>({
    resolver: yupResolver(schema) as any,
    defaultValues: {
      costingMethod: 'AVERAGE',
    },
  })

  const watchedCostingMethod = useWatch({
    control,
    name: 'costingMethod',
    defaultValue: currentCostingMethod,
  })

  useEffect(() => {
    if (watchedCostingMethod) {
      setCurrentCostingMethod(watchedCostingMethod)
    }
  }, [watchedCostingMethod])

  useEffect(() => {
    if (settingsData) {
      const settings = settingsData as any
      setValue('costingMethod', settings.costingMethod || 'AVERAGE')
      setSavedCostingMethod(settings.costingMethod || 'AVERAGE')
      setCurrentCostingMethod(settings.costingMethod || 'AVERAGE')
    }
  }, [settingsData, setValue])

  const fetchSettings = () => {
    refetch()
  }

  const error = fetchError ? ((fetchError as any)?.message || 'Failed to load settings') : null

  const onSubmit = async (data: InventoryCostingFormData) => {
    try {
      setSubmitting(true)

      await updateRegionalSettings(data).unwrap()
      setSavedCostingMethod(data.costingMethod)
      showSuccess('Inventory costing settings saved successfully.')
      refetch()
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to save settings'
      showError(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = () => {
    fetchSettings()
  }

  const handleRecalculateCosts = async () => {
    try {
      setRecalculating(true)
      const result = await ApiService.post<{ updated: number; errors: number; costingMethod: string; results: any[] }>(
        '/inventory/costing/recalculate'
      )

      const data = result as any
      if (data.errors > 0) {
        showError(
          `Recalculation completed with errors: ${data.updated} updated, ${data.errors} errors. Check console for details.`
        )
        console.error('Recalculation errors:', data.results.filter((r: any) => !r.success))
      } else {
        showSuccess(
          `Successfully recalculated ${data.updated} product(s) using ${data.costingMethod} method`
        )
      }

      console.log('Recalculation results:', result)
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to recalculate costs'
      showError(errorMessage)
      console.error('Recalculation error:', error)
    } finally {
      setRecalculating(false)
    }
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
      <PageHeader title="Inventory Costing Settings" subtitle="Configure costing method and pricing rules for inventory valuation" />
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
                Costing Method
              </Typography>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="costingMethod"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    select
                    label="Inventory Costing Method"
                    fullWidth
                    size="small"
                    required
                    error={!!errors.costingMethod}
                    helperText={errors.costingMethod?.message || 'Select the method for inventory valuation'}
                  >
                    {COSTING_METHODS.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              />
            </Grid>

            <Grid size={12}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mt: 2 }}>
                <Box>
                  {currentCostingMethod !== savedCostingMethod && (
                    <Alert severity="warning" sx={{ py: 0.5, px: 2 }}>
                      <Typography variant="caption">
                        Save changes first to enable recalculation
                      </Typography>
                    </Alert>
                  )}
                </Box>

                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Button
                    variant="outlined"
                    onClick={handleCancel}
                    disabled={submitting || recalculating}
                    size="large"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="contained"
                    color="primary"
                    disabled={submitting || recalculating}
                    size="large"
                  >
                    {submitting ? 'Saving...' : 'Save Changes'}
                  </Button>
                  <Button
                    variant="contained"
                    color="secondary"
                    startIcon={recalculating ? <CircularProgress size={20} color="inherit" /> : <CalculateIcon />}
                    onClick={handleRecalculateCosts}
                    disabled={recalculating || submitting || currentCostingMethod !== savedCostingMethod}
                    size="large"
                  >
                    {recalculating ? 'Recalculating...' : 'Recalculate Costs'}
                  </Button>
                </Box>
              </Box>
            </Grid>
          </Grid>
        </form>
      </Paper>
    </GenericOverviewPage>
  )
}

export default InventoryCostingPage
