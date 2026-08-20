import React, { useState, useEffect } from 'react'
import {
  Box,
  Typography,
  Paper,
  Grid,
  TextField,
  Button,
  Avatar,
  IconButton,
  Divider,
  CircularProgress,
  Alert,
} from '@mui/material'
import { default as CompanyIcon } from '@mui/icons-material/BusinessCenter'
import { default as UploadIcon } from '@mui/icons-material/Upload'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { useForm, Controller } from 'react-hook-form'
import * as yup from 'yup'
import { yupResolver } from '@hookform/resolvers/yup'
import { useNotification } from '@/hooks/useNotification'
import {
  useGetCompanySettingsQuery,
  useUpdateCompanySettingsMutation,
  useUploadLogoMutation,
  useDeleteLogoMutation,
} from '@/store/api/settingsApi'
import PageHeader from '@/components/common/PageHeader'
import GenericOverviewPage from '@/components/common/GenericOverviewPage'

interface CompanyFormData {
  name: string
  address: string
  city: string
  state?: string
  postalCode?: string
  country: string
  phone?: string
  email?: string
  website?: string
  miscInfo?: string
}

const schema = yup.object({
  name: yup.string().required('Company name is required'),
  address: yup.string().required('Address is required'),
  city: yup.string().required('City is required'),
  state: yup.string(),
  postalCode: yup.string(),
  country: yup.string().required('Country is required'),
  phone: yup.string(),
  email: yup.string().email('Invalid email format'),
  website: yup.string().url('Invalid URL format'),
  miscInfo: yup.string(),
})

// Helper to get full logo URL
const getLogoUrl = (logoPath: string | null | undefined): string | null => {
  if (!logoPath) return null
  // If it's already a full URL, return it
  if (logoPath.startsWith('http://') || logoPath.startsWith('https://')) {
    return logoPath
  }
  // For uploaded files, we need to access them directly via the backend
  // Don't use the API base URL, just use the path directly
  // The NGINX proxy will handle routing /uploads to the backend
  return logoPath
}

const CompanySettingsPage: React.FC = () => {
  const { showSuccess, showError } = useNotification()
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const { data: settings, isLoading: loading, error: fetchError, refetch } = useGetCompanySettingsQuery()
  const [updateCompanySettings] = useUpdateCompanySettingsMutation()
  const [uploadLogo] = useUploadLogoMutation()
  const [deleteLogo] = useDeleteLogoMutation()

  const { control, handleSubmit, formState: { errors }, reset, setValue } = useForm<CompanyFormData>({
    resolver: yupResolver(schema) as any,
    defaultValues: {
      name: '',
      address: '',
      city: '',
      state: '',
      postalCode: '',
      country: '',
      phone: '',
      email: '',
      website: '',
      miscInfo: '',
    },
  })

  // Populate form when settings load
  useEffect(() => {
    if (settings) {
      setValue('name', settings.name)
      setValue('address', settings.address)
      setValue('city', settings.city)
      setValue('state', settings.state || '')
      setValue('postalCode', settings.postalCode || '')
      setValue('country', settings.country)
      setValue('phone', settings.phone || '')
      setValue('email', settings.email || '')
      setValue('website', settings.website || '')
      setValue('miscInfo', settings.miscInfo || '')

      if (settings.logoUrl) {
        const fullLogoUrl = getLogoUrl(settings.logoUrl)
        console.log('Logo URL from API:', settings.logoUrl)
        console.log('Full Logo URL:', fullLogoUrl)
        setLogoPreview(fullLogoUrl)
      }
    }
  }, [settings, setValue])

  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        showError('Logo file size must be less than 5MB')
        return
      }
      if (!file.type.startsWith('image/')) {
        showError('Please upload a valid image file')
        return
      }
      setLogoFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setLogoPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleRemoveLogo = async () => {
    try {
      if (logoPreview && !logoFile) {
        // Logo exists on server, delete it
        await deleteLogo().unwrap()
        showSuccess('Logo deleted successfully')
      }
      setLogoFile(null)
      setLogoPreview(null)
    } catch (error: any) {
      showError(error.response?.data?.message || error.message || 'Failed to delete logo')
    }
  }

  const onSubmit = async (data: CompanyFormData) => {
    try {
      setSubmitting(true)

      // Update company settings
      await updateCompanySettings(data).unwrap()

      // Upload logo if a new file is selected
      if (logoFile) {
        await uploadLogo(logoFile).unwrap()
        setLogoFile(null) // Clear the file after upload
      }

      showSuccess('Company settings saved successfully')

      // Reload settings to get updated data
      await refetch()
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to save company settings'
      showError(errorMessage)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = () => {
    // Reload settings to reset form
    refetch()
    setLogoFile(null)
  }

  const error = fetchError ? ((fetchError as any)?.message || 'Failed to load company settings') : null

  // Loading state
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <GenericOverviewPage>
      {/* Page Header */}
      <PageHeader title="Company Settings" subtitle="Configure your company profile and business information" />
      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}
      <Paper sx={{ p: 4 }}>
        <form onSubmit={handleSubmit(onSubmit)}>
          <Grid container spacing={3}>
            {/* Logo Section */}
            <Grid size={12}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Company Logo
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {/* Logo Preview */}
                <Box
                  sx={{
                    width: '100%',
                    maxWidth: 600,
                    minHeight: 200,
                    maxHeight: 400,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px dashed',
                    borderColor: 'divider',
                    borderRadius: 2,
                    bgcolor: logoPreview ? 'transparent' : 'primary.light',
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  {logoPreview ? (
                    <Box
                      component="img"
                      src={logoPreview}
                      alt="Company Logo"
                      sx={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                      }}
                    />
                  ) : (
                    <CompanyIcon sx={{ fontSize: 80, color: 'primary.main', opacity: 0.5 }} />
                  )}
                </Box>

                {/* Upload Controls */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <input
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    style={{ display: 'none' }}
                    id="logo-upload"
                    type="file"
                    onChange={handleLogoUpload}
                  />
                  <label htmlFor="logo-upload">
                    <Button
                      variant="outlined"
                      component="span"
                      startIcon={<UploadIcon />}
                    >
                      Upload Logo
                    </Button>
                  </label>
                  {logoPreview && (
                    <Button
                      variant="outlined"
                      color="error"
                      onClick={handleRemoveLogo}
                      startIcon={<DeleteIcon />}
                    >
                      Remove Logo
                    </Button>
                  )}
                </Box>

                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Accepted formats: JPG, PNG, GIF, WEBP • Max size: 5MB • Rectangular preview auto-adjusts to image size
                </Typography>
              </Box>
            </Grid>

            <Grid size={12}>
              <Divider sx={{ my: 2 }} />
            </Grid>

            {/* Company Information Section */}
            <Grid size={12}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Company Information
              </Typography>
            </Grid>

            {/* Company Name */}
            <Grid size={12}>
              <Controller
                name="name"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Company Name"
                    placeholder="Enter company name"
                    fullWidth
                    size="small"
                    required
                    error={!!errors.name}
                    helperText={errors.name?.message}
                  />
                )}
              />
            </Grid>

            <Grid size={12}>
              <Divider sx={{ my: 2 }} />
            </Grid>

            {/* Address Section */}
            <Grid size={12}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Address
              </Typography>
            </Grid>

            {/* Street Address */}
            <Grid size={12}>
              <Controller
                name="address"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Street Address"
                    placeholder="Enter street address"
                    fullWidth
                    size="small"
                    required
                    multiline
                    rows={2}
                    error={!!errors.address}
                    helperText={errors.address?.message}
                  />
                )}
              />
            </Grid>

            {/* City */}
            <Grid
              size={{
                xs: 12,
                md: 6
              }}>
              <Controller
                name="city"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="City"
                    placeholder="Enter city"
                    fullWidth
                    size="small"
                    required
                    error={!!errors.city}
                    helperText={errors.city?.message}
                  />
                )}
              />
            </Grid>

            {/* State */}
            <Grid
              size={{
                xs: 12,
                md: 6
              }}>
              <Controller
                name="state"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="State/Province"
                    placeholder="Enter state or province"
                    fullWidth
                    size="small"
                    error={!!errors.state}
                    helperText={errors.state?.message}
                  />
                )}
              />
            </Grid>

            {/* Postal Code */}
            <Grid
              size={{
                xs: 12,
                md: 6
              }}>
              <Controller
                name="postalCode"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Postal Code"
                    placeholder="Enter postal code"
                    fullWidth
                    size="small"
                    error={!!errors.postalCode}
                    helperText={errors.postalCode?.message}
                  />
                )}
              />
            </Grid>

            {/* Country */}
            <Grid
              size={{
                xs: 12,
                md: 6
              }}>
              <Controller
                name="country"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Country"
                    placeholder="Enter country"
                    fullWidth
                    size="small"
                    required
                    error={!!errors.country}
                    helperText={errors.country?.message}
                  />
                )}
              />
            </Grid>

            <Grid size={12}>
              <Divider sx={{ my: 2 }} />
            </Grid>

            {/* Contact Information Section */}
            <Grid size={12}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Contact Information
              </Typography>
            </Grid>

            {/* Phone */}
            <Grid
              size={{
                xs: 12,
                md: 6
              }}>
              <Controller
                name="phone"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Phone"
                    placeholder="Enter phone number"
                    fullWidth
                    size="small"
                    error={!!errors.phone}
                    helperText={errors.phone?.message}
                  />
                )}
              />
            </Grid>

            {/* Email */}
            <Grid
              size={{
                xs: 12,
                md: 6
              }}>
              <Controller
                name="email"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Email"
                    placeholder="Enter email address"
                    type="email"
                    fullWidth
                    size="small"
                    error={!!errors.email}
                    helperText={errors.email?.message}
                  />
                )}
              />
            </Grid>

            {/* Website */}
            <Grid size={12}>
              <Controller
                name="website"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Website"
                    placeholder="https://www.example.com"
                    fullWidth
                    size="small"
                    error={!!errors.website}
                    helperText={errors.website?.message}
                  />
                )}
              />
            </Grid>

            <Grid size={12}>
              <Divider sx={{ my: 2 }} />
            </Grid>

            {/* Additional Information Section */}
            <Grid size={12}>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                Additional Information
              </Typography>
            </Grid>

            {/* Misc Info */}
            <Grid size={12}>
              <Controller
                name="miscInfo"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Misc Info"
                    placeholder="Enter any additional information"
                    fullWidth
                    size="small"
                    multiline
                    rows={4}
                    error={!!errors.miscInfo}
                    helperText={errors.miscInfo?.message || 'Tax ID, registration numbers, or other relevant information'}
                  />
                )}
              />
            </Grid>

            {/* Action Buttons */}
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
  );
}

export default CompanySettingsPage
