import React, { useState, useEffect } from 'react'
import {
  Box,
  Grid,
  TextField,
  Button,
  Avatar,
  IconButton,
  Typography,
  Paper,
  Divider,
  CircularProgress,
} from '@mui/material'
import {
  Upload as UploadIcon,
  Delete as DeleteIcon,
  CloudDownload as ImportIcon,
  Save as SaveIcon,
} from '@mui/icons-material'
import { useForm, Controller } from 'react-hook-form'
import * as yup from 'yup'
import { yupResolver } from '@hookform/resolvers/yup'
import { useNotification } from '@/hooks/useNotification'
import { printSettingsApi } from '@/services/printSettingsApi'
import { settingsApi } from '@/services/settingsApi'

interface GeneralFormData {
  companyName?: string
  address?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
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
}

const schema = yup.object({
  companyName: yup.string(),
  address: yup.string(),
  city: yup.string(),
  state: yup.string(),
  postalCode: yup.string(),
  country: yup.string(),
  phone: yup.string(),
  email: yup.string().email('Invalid email format'),
  website: yup.string().url('Invalid URL format'),
  miscInfo: yup.string(),
  salesPerPageFooter: yup.string(),
  salesEndOfDocFooter: yup.string(),
  purchasingPerPageFooter: yup.string(),
  purchasingEndOfDocFooter: yup.string(),
  inventoryPerPageFooter: yup.string(),
  inventoryEndOfDocFooter: yup.string(),
  reportPerPageFooter: yup.string(),
  reportEndOfDocFooter: yup.string(),
})

interface GeneralTabProps {
  settings: any
  onUpdate: (settings: any) => void
  onRefresh: () => void
}

// Helper to get full logo URL
const getLogoUrl = (logoPath: string | null | undefined): string | null => {
  if (!logoPath) return null
  if (logoPath.startsWith('http://') || logoPath.startsWith('https://')) {
    return logoPath
  }
  return logoPath
}

const GeneralTab: React.FC<GeneralTabProps> = ({ settings, onUpdate, onRefresh }) => {
  const { showSuccess, showError } = useNotification()
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [importing, setImporting] = useState(false)

  const { control, handleSubmit, formState: { errors }, reset } = useForm<GeneralFormData>({
    resolver: yupResolver(schema) as any,
    defaultValues: {
      companyName: '',
      address: '',
      city: '',
      state: '',
      postalCode: '',
      country: '',
      phone: '',
      email: '',
      website: '',
      miscInfo: '',
      salesPerPageFooter: '',
      salesEndOfDocFooter: '',
      purchasingPerPageFooter: '',
      purchasingEndOfDocFooter: '',
      inventoryPerPageFooter: '',
      inventoryEndOfDocFooter: '',
      reportPerPageFooter: '',
      reportEndOfDocFooter: '',
    },
  })

  useEffect(() => {
    if (settings) {
      reset({
        companyName: settings.companyName || '',
        address: settings.address || '',
        city: settings.city || '',
        state: settings.state || '',
        postalCode: settings.postalCode || '',
        country: settings.country || '',
        phone: settings.phone || '',
        email: settings.email || '',
        website: settings.website || '',
        miscInfo: settings.miscInfo || '',
        salesPerPageFooter: settings.salesPerPageFooter || '',
        salesEndOfDocFooter: settings.salesEndOfDocFooter || '',
        purchasingPerPageFooter: settings.purchasingPerPageFooter || '',
        purchasingEndOfDocFooter: settings.purchasingEndOfDocFooter || '',
        inventoryPerPageFooter: settings.inventoryPerPageFooter || '',
        inventoryEndOfDocFooter: settings.inventoryEndOfDocFooter || '',
        reportPerPageFooter: settings.reportPerPageFooter || '',
        reportEndOfDocFooter: settings.reportEndOfDocFooter || '',
      })
      if (settings.logoUrl) {
        setLogoPreview(getLogoUrl(settings.logoUrl))
      }
    }
  }, [settings, reset])

  const handleLogoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setLogoFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setLogoPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleLogoRemove = () => {
    setLogoFile(null)
    setLogoPreview(null)
  }

  const handleImportFromCompany = async () => {
    try {
      setImporting(true)
      // Fetch company settings
      const companySettings = await settingsApi.getCompanySettings()

      // Import to print settings
      const updatedSettings = await printSettingsApi.importFromCompany(companySettings)

      onUpdate(updatedSettings)
      onRefresh()
      showSuccess('Settings imported successfully from company settings')
    } catch (err: any) {
      console.error('Error importing settings:', err)
      showError(err.message || 'Failed to import settings')
    } finally {
      setImporting(false)
    }
  }

  const onSubmit = async (data: GeneralFormData) => {
    try {
      setSubmitting(true)

      // Upload logo if changed
      let logoUrl = settings?.logoUrl
      if (logoFile) {
        const uploadResult = await printSettingsApi.uploadLogo(logoFile)
        logoUrl = uploadResult.logoUrl
      }

      // Update settings
      const updatedSettings = await printSettingsApi.updatePrintSettings({
        ...data,
        logoUrl,
      })

      onUpdate(updatedSettings)
      showSuccess('Print settings updated successfully')
      setLogoFile(null)
    } catch (err: any) {
      console.error('Error updating settings:', err)
      showError(err.message || 'Failed to update settings')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ px: 3 }}>
      {/* Common Header Section */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Common Header
          </Typography>
          <Button
            variant="outlined"
            startIcon={importing ? <CircularProgress size={16} /> : <ImportIcon />}
            onClick={handleImportFromCompany}
            disabled={importing}
          >
            Import from Company Settings
          </Button>
        </Box>
        <Divider sx={{ mb: 3 }} />

        {/* Logo Upload */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            Company Logo
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Avatar
              src={logoPreview || undefined}
              sx={{
                width: 80,
                height: 80,
                bgcolor: 'grey.200',
                border: '2px dashed',
                borderColor: 'grey.400',
              }}
            >
              <UploadIcon sx={{ fontSize: 32, color: 'grey.500' }} />
            </Avatar>
            <Box>
              <input
                accept="image/*"
                style={{ display: 'none' }}
                id="logo-upload"
                type="file"
                onChange={handleLogoChange}
              />
              <label htmlFor="logo-upload">
                <Button variant="outlined" component="span" startIcon={<UploadIcon />}>
                  Upload Logo
                </Button>
              </label>
              {logoPreview && (
                <IconButton
                  onClick={handleLogoRemove}
                  sx={{ ml: 1 }}
                  color="error"
                >
                  <DeleteIcon />
                </IconButton>
              )}
              <Typography variant="caption" display="block" sx={{ mt: 1, color: 'text.secondary' }}>
                Recommended: 200x200px, PNG or JPG
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Company Info Fields */}
        <Grid container spacing={2}>
          <Grid size={12}>
            <Controller
              name="companyName"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Company Name"
                  fullWidth
                  error={!!errors.companyName}
                  helperText={errors.companyName?.message}
                />
              )}
            />
          </Grid>

          <Grid size={12}>
            <Controller
              name="address"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Street Address"
                  fullWidth
                  multiline
                  rows={2}
                  error={!!errors.address}
                  helperText={errors.address?.message}
                />
              )}
            />
          </Grid>

          <Grid
            size={{
              xs: 12,
              sm: 6
            }}>
            <Controller
              name="city"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="City"
                  fullWidth
                  error={!!errors.city}
                  helperText={errors.city?.message}
                />
              )}
            />
          </Grid>

          <Grid
            size={{
              xs: 12,
              sm: 6
            }}>
            <Controller
              name="state"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="State/Province"
                  fullWidth
                  error={!!errors.state}
                  helperText={errors.state?.message}
                />
              )}
            />
          </Grid>

          <Grid
            size={{
              xs: 12,
              sm: 6
            }}>
            <Controller
              name="postalCode"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Postal Code"
                  fullWidth
                  error={!!errors.postalCode}
                  helperText={errors.postalCode?.message}
                />
              )}
            />
          </Grid>

          <Grid
            size={{
              xs: 12,
              sm: 6
            }}>
            <Controller
              name="country"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Country"
                  fullWidth
                  error={!!errors.country}
                  helperText={errors.country?.message}
                />
              )}
            />
          </Grid>

          <Grid
            size={{
              xs: 12,
              sm: 6
            }}>
            <Controller
              name="phone"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Phone"
                  fullWidth
                  error={!!errors.phone}
                  helperText={errors.phone?.message}
                />
              )}
            />
          </Grid>

          <Grid
            size={{
              xs: 12,
              sm: 6
            }}>
            <Controller
              name="email"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Email"
                  fullWidth
                  error={!!errors.email}
                  helperText={errors.email?.message}
                />
              )}
            />
          </Grid>

          <Grid size={12}>
            <Controller
              name="website"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Website"
                  fullWidth
                  error={!!errors.website}
                  helperText={errors.website?.message}
                />
              )}
            />
          </Grid>

          <Grid size={12}>
            <Controller
              name="miscInfo"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Miscellaneous Info"
                  fullWidth
                  multiline
                  rows={2}
                  error={!!errors.miscInfo}
                  helperText={errors.miscInfo?.message}
                />
              )}
            />
          </Grid>
        </Grid>
      </Paper>
      {/* Document Footers Section */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
          Document Footers
        </Typography>
        <Divider sx={{ mb: 3 }} />

        {/* Sales Footer */}
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
          Sales Documents
        </Typography>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid
            size={{
              xs: 12,
              sm: 6
            }}>
            <Controller
              name="salesPerPageFooter"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Per-Page Footer"
                  fullWidth
                  multiline
                  rows={2}
                  placeholder="Text shown at bottom of each page"
                />
              )}
            />
          </Grid>
          <Grid
            size={{
              xs: 12,
              sm: 6
            }}>
            <Controller
              name="salesEndOfDocFooter"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="End of Document Footer"
                  fullWidth
                  multiline
                  rows={2}
                  placeholder="Text shown at the end of document"
                />
              )}
            />
          </Grid>
        </Grid>

        {/* Purchasing Footer */}
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
          Purchasing Documents
        </Typography>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid
            size={{
              xs: 12,
              sm: 6
            }}>
            <Controller
              name="purchasingPerPageFooter"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Per-Page Footer"
                  fullWidth
                  multiline
                  rows={2}
                  placeholder="Text shown at bottom of each page"
                />
              )}
            />
          </Grid>
          <Grid
            size={{
              xs: 12,
              sm: 6
            }}>
            <Controller
              name="purchasingEndOfDocFooter"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="End of Document Footer"
                  fullWidth
                  multiline
                  rows={2}
                  placeholder="Text shown at the end of document"
                />
              )}
            />
          </Grid>
        </Grid>

        {/* Inventory Footer */}
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
          Inventory Documents
        </Typography>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid
            size={{
              xs: 12,
              sm: 6
            }}>
            <Controller
              name="inventoryPerPageFooter"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Per-Page Footer"
                  fullWidth
                  multiline
                  rows={2}
                  placeholder="Text shown at bottom of each page"
                />
              )}
            />
          </Grid>
          <Grid
            size={{
              xs: 12,
              sm: 6
            }}>
            <Controller
              name="inventoryEndOfDocFooter"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="End of Document Footer"
                  fullWidth
                  multiline
                  rows={2}
                  placeholder="Text shown at the end of document"
                />
              )}
            />
          </Grid>
        </Grid>

        {/* Report Footer */}
        <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
          Report Documents
        </Typography>
        <Grid container spacing={2}>
          <Grid
            size={{
              xs: 12,
              sm: 6
            }}>
            <Controller
              name="reportPerPageFooter"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="Per-Page Footer"
                  fullWidth
                  multiline
                  rows={2}
                  placeholder="Text shown at bottom of each page"
                />
              )}
            />
          </Grid>
          <Grid
            size={{
              xs: 12,
              sm: 6
            }}>
            <Controller
              name="reportEndOfDocFooter"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  label="End of Document Footer"
                  fullWidth
                  multiline
                  rows={2}
                  placeholder="Text shown at the end of document"
                />
              )}
            />
          </Grid>
        </Grid>
      </Paper>
      {/* Submit Button */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
        <Button
          type="submit"
          variant="contained"
          size="large"
          startIcon={submitting ? <CircularProgress size={16} /> : <SaveIcon />}
          disabled={submitting}
        >
          Save Changes
        </Button>
      </Box>
    </Box>
  );
}

export default GeneralTab
