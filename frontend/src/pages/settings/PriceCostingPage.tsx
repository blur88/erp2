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
import {
  PriceChange as PriceCostingIcon,
  Calculate as CalculateIcon,
} from '@mui/icons-material'
import { useForm, Controller, useWatch } from 'react-hook-form'
import * as yup from 'yup'
import { yupResolver } from '@hookform/resolvers/yup'
import { useNotification } from '@/hooks/useNotification'
import { settingsApi } from '@/services/settingsApi'
import { inventoryApi } from '@/services/inventoryApi'
import { TYPOGRAPHY_STYLES } from '@/constants/typography'

interface PriceCostingFormData {
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

const PriceCostingPage: React.FC = () => {
  const { showSuccess, showError } = useNotification()
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [recalculating, setRecalculating] = useState(false)
  const [savedCostingMethod, setSavedCostingMethod] = useState<string>('')
  const [currentCostingMethod, setCurrentCostingMethod] = useState<string>('')

  const { control, handleSubmit, formState: { errors }, setValue } = useForm<PriceCostingFormData>({
    resolver: yupResolver(schema) as any,
    defaultValues: {
      costingMethod: 'AVERAGE',
    },
  })

  // Watch costing method changes
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

  // Fetch settings on mount
  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await settingsApi.getPriceCostingSettings()
      const settings = response as any

      // Set form values
      setValue('costingMethod', settings.costingMethod || 'AVERAGE')

      // Track saved costing method
      setSavedCostingMethod(settings.costingMethod || 'AVERAGE')
      setCurrentCostingMethod(settings.costingMethod || 'AVERAGE')
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to load settings'
      setError(errorMessage)
      showError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = async (data: PriceCostingFormData) => {
    try {
      setSubmitting(true)

      await settingsApi.updatePriceCostingSettings(data)

      // Update saved costing method after successful save
      setSavedCostingMethod(data.costingMethod)

      showSuccess('Inventory costing settings saved successfully.')

      // Reload settings to get updated data
      await fetchSettings()
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to save settings'
      showError(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = () => {
    // Reload settings to reset form
    fetchSettings()
  }

  const handleRecalculateCosts = async () => {
    try {
      setRecalculating(true)
      const result = await inventoryApi.recalculateAllProductCosts()

      // ApiService returns response.data directly, so result is the data itself
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

  // Loading state
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Page Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <PriceCostingIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
        <Typography variant={TYPOGRAPHY_STYLES.pageHeader.variant} sx={{ fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight }}>
          Inventory Costing Settings
        </Typography>
      </Box>
      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      <Paper sx={{ p: 4 }}>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Grid container spacing={3}>
            {/* Costing Method Section */}
            <Grid size={12}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Costing Method
              </Typography>
            </Grid>

            <Grid
              size={{
                xs: 12,
                md: 6
              }}>
              <Controller
                name="costingMethod"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    select
                    label="Inventory Costing Method"
                    fullWidth
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

            {/* Action Buttons */}
            <Grid size={12}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mt: 2 }}>
                {/* Recalculate Button - Left Side */}
                <Box>
                  {currentCostingMethod !== savedCostingMethod && (
                    <Alert severity="warning" sx={{ py: 0.5, px: 2 }}>
                      <Typography variant="caption">
                        Save changes first to enable recalculation
                      </Typography>
                    </Alert>
                  )}
                </Box>

                {/* Action Buttons - Right Side */}
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
    </Box>
  );
}

export default PriceCostingPage
