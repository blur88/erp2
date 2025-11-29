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
  IconButton,
  Card,
  CardContent,
} from '@mui/material'
import {
  PriceChange as PriceCostingIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Calculate as CalculateIcon,
} from '@mui/icons-material'
import { useForm, Controller, useFieldArray, useWatch } from 'react-hook-form'
import * as yup from 'yup'
import { yupResolver } from '@hookform/resolvers/yup'
import { useNotification } from '@/hooks/useNotification'
import { settingsApi, type PricingScheme } from '@/services/settingsApi'
import { inventoryApi } from '@/services/inventoryApi'
import { refreshCurrencyCache } from '@/hooks/useCurrency'

interface PriceCostingFormData {
  currency: string
  costingMethod: string
  customerPricingSchemes: PricingScheme[]
}

const schema = yup.object({
  currency: yup.string().required('Currency is required'),
  costingMethod: yup.string().required('Costing method is required'),
  customerPricingSchemes: yup.array().of(
    yup.object({
      name: yup.string().required('Pricing name is required'),
      currency: yup.string().required('Currency is required'),
    })
  ),
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

  const { control, handleSubmit, formState: { errors }, reset, setValue } = useForm<PriceCostingFormData>({
    resolver: yupResolver(schema) as any,
    defaultValues: {
      currency: 'USD',
      costingMethod: 'AVERAGE',
      customerPricingSchemes: [
        { name: 'Retail', currency: 'USD' },
      ],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'customerPricingSchemes',
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
      setValue('currency', settings.currency || 'USD')
      setValue('costingMethod', settings.costingMethod || 'AVERAGE')

      // Track saved costing method
      setSavedCostingMethod(settings.costingMethod || 'AVERAGE')
      setCurrentCostingMethod(settings.costingMethod || 'AVERAGE')

      // Set pricing schemes
      if (settings.customerPricingSchemes && settings.customerPricingSchemes.length > 0) {
        setValue('customerPricingSchemes', settings.customerPricingSchemes)
      } else {
        // Default if none exist
        setValue('customerPricingSchemes', [{ name: 'Retail', currency: 'USD' }])
      }
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

      // Refresh currency cache immediately after saving
      await refreshCurrencyCache()

      // Update saved costing method after successful save
      setSavedCostingMethod(data.costingMethod)

      showSuccess('Price and costing settings saved successfully. Please refresh pages to see currency changes.')

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

  const handleAddPricingScheme = () => {
    append({ name: '', currency: 'USD' })
  }

  const handleRemovePricingScheme = (index: number) => {
    if (fields.length > 1) {
      remove(index)
    } else {
      showError('At least one pricing scheme is required')
    }
  }

  const handleRecalculateCosts = async () => {
    try {
      setRecalculating(true)
      const result = await inventoryApi.recalculateAllProductCosts()

      // ApiService returns response.data directly, so result is the data itself
      if (result.errors > 0) {
        showError(
          `Recalculation completed with errors: ${result.updated} updated, ${result.errors} errors. Check console for details.`
        )
        console.error('Recalculation errors:', result.results.filter((r: any) => !r.success))
      } else {
        showSuccess(
          `Successfully recalculated ${result.updated} product(s) using ${result.costingMethod} method`
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
    <Box>
      {/* Page Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
        <PriceCostingIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          Price & Costing Settings
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
            {/* Currency Section */}
            <Grid item xs={12}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Currency
              </Typography>
            </Grid>

            <Grid item xs={12} md={6}>
              <Controller
                name="currency"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    select
                    label="Default Currency"
                    fullWidth
                    required
                    error={!!errors.currency}
                    helperText={errors.currency?.message || 'Select the default currency for your business'}
                  >
                    {CURRENCIES.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              />
            </Grid>

            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
            </Grid>

            {/* Costing Method Section */}
            <Grid item xs={12}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Costing Method
              </Typography>
            </Grid>

            <Grid item xs={12} md={6}>
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

            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
            </Grid>

            {/* Customer Pricing Schemes Section */}
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    Customer Pricing Schemes
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
                    Define custom pricing schemes with their own currencies for different customer groups
                  </Typography>
                </Box>
                <Button
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={handleAddPricingScheme}
                  size="small"
                >
                  Add Pricing
                </Button>
              </Box>
            </Grid>

            {/* Pricing Schemes List */}
            <Grid item xs={12}>
              <Grid container spacing={2}>
                {fields.map((field, index) => (
                  <Grid item xs={12} key={field.id}>
                    <Card variant="outlined">
                      <CardContent>
                        <Grid container spacing={2} alignItems="center">
                          <Grid item xs={12} md={5}>
                            <Controller
                              name={`customerPricingSchemes.${index}.name`}
                              control={control}
                              render={({ field }) => (
                                <TextField
                                  {...field}
                                  label="Pricing Name"
                                  placeholder="e.g., Retail, Wholesale, VIP"
                                  fullWidth
                                  required
                                  error={!!(errors.customerPricingSchemes?.[index] as any)?.name}
                                  helperText={(errors.customerPricingSchemes?.[index] as any)?.name?.message}
                                />
                              )}
                            />
                          </Grid>
                          <Grid item xs={12} md={5}>
                            <Controller
                              name={`customerPricingSchemes.${index}.currency`}
                              control={control}
                              render={({ field }) => (
                                <TextField
                                  {...field}
                                  select
                                  label="Currency"
                                  fullWidth
                                  required
                                  error={!!(errors.customerPricingSchemes?.[index] as any)?.currency}
                                  helperText={(errors.customerPricingSchemes?.[index] as any)?.currency?.message}
                                >
                                  {CURRENCIES.map((option) => (
                                    <MenuItem key={option.value} value={option.value}>
                                      {option.label}
                                    </MenuItem>
                                  ))}
                                </TextField>
                              )}
                            />
                          </Grid>
                          <Grid item xs={12} md={2} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <IconButton
                              onClick={() => handleRemovePricingScheme(index)}
                              color="error"
                              disabled={fields.length === 1}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Grid>
                        </Grid>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Grid>

            {/* Action Buttons */}
            <Grid item xs={12}>
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
  )
}

export default PriceCostingPage
